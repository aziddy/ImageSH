import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from 'redis';
import { loadSource } from './helpers/load-source.mjs';

const { LIFETIMES, expirationFor, matchingLifetime, getLifetimeOption } = loadSource('src/lib/lifetimes.ts');
const DAY = 86_400_000;

test('lifetimes use fixed durations from the original upload, including across daylight saving', () => {
    const uploadedAt = '2026-11-01T01:30:00-05:00';
    const durations = [7200, 86400, 259200, 604800, 2592000, 7776000, 15552000, 31536000];
    for (const [index, option] of LIFETIMES.entries()) {
        assert.equal(option.seconds, durations[index]);
        const end = expirationFor(uploadedAt, option.value);
        assert.equal(end - Date.parse(uploadedAt), durations[index] * 1000);
        assert.equal(matchingLifetime(uploadedAt, new Date(end).toISOString()), option.value);
        assert.equal(matchingLifetime(uploadedAt, new Date(end + 999).toISOString()), option.value);
    }
    assert.equal(matchingLifetime(uploadedAt, '2026-11-03T06:30:00Z'), undefined);
    assert.equal(getLifetimeOption('__proto__'), undefined);
    assert.equal(getLifetimeOption(null), undefined);
    assert.ok(Number.isNaN(expirationFor(uploadedAt, 'forever')));
});

function routeFor(redis, getSession = async () => ({ user: { name: 'lifetime-test' } }), updates) {
    return loadSource('src/app/api/admin/images/[id]/route.ts', {
        '@/lib/redis': { __esModule: true, default: async () => redis },
        '@/lib/auth': { authOptions: {} },
        'next-auth': { getServerSession: getSession },
        ...(updates ? { '@/lib/image-updates': updates } : {}),
    }).PATCH;
}

function patch(route, id, body) {
    return route(new Request(`http://lifetime-test.invalid/api/admin/images/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id }) });
}

test('PATCH rejects unauthorized, empty and invalid updates before touching storage', async () => {
    const redis = { get: () => { throw new Error('Must not touch storage'); } };
    const unauthorized = routeFor(redis, async () => null);
    assert.equal((await patch(unauthorized, 'missing', { expiration: '7d' })).status, 401);
    const route = routeFor(redis);
    for (const body of [null, [], {}, { expiration: '' }, { expiration: null }, { expiration: 'forever' },
        { expiration: 86400 }, { name: '' }, { name: 7 }, { name: '   ', expiration: '7d' }]) {
        assert.equal((await patch(route, 'missing', body)).status, 400, JSON.stringify(body));
    }
    const malformed = await route(new Request('http://lifetime-test.invalid', { method: 'PATCH', body: '{' }),
        { params: Promise.resolve({ id: 'missing' }) });
    assert.equal(malformed.status, 400);
});

test('PATCH preserves the rename request/response contract and measures expiration from upload', async () => {
    const uploadedAt = new Date(Date.now() - 2 * DAY).toISOString();
    const original = { id: 'existing', uploadedAt, expiresAt: new Date(Date.parse(uploadedAt) + 7 * DAY).toISOString() };
    let received;
    const route = routeFor({ get: async () => JSON.stringify(original) }, undefined, {
        applyImageUpdate: async (_redis, id, changes) => {
            received = { id, ...changes };
            return { status: 200, imageData: { ...original, ...changes } };
        },
    });
    const renamed = await patch(route, 'existing', { name: '  Renamed  ' });
    assert.deepEqual(received, { id: 'existing', name: 'Renamed' });
    assert.equal((await renamed.json()).success, true);
    const changed = await patch(route, 'existing', { expiration: '3d', name: 'Both' });
    assert.equal(changed.status, 200);
    assert.equal(received.name, 'Both');
    assert.equal(received.expiresAtMs, Date.parse(uploadedAt) + 3 * DAY);
    assert.equal(received.uploadedAt, uploadedAt);
    received = undefined;
    assert.equal((await patch(route, 'existing', { expiration: '1d' })).status, 400);
    assert.equal(received, undefined);
    const expired = routeFor({ get: async () => JSON.stringify({ ...original, expiresAt: new Date(Date.now() - 1).toISOString() }) });
    assert.equal((await patch(expired, 'existing', { expiration: '1y' })).status, 404);
    assert.equal((await patch(routeFor({ get: async () => null }), 'missing', { expiration: '7d' })).status, 404);
});

// Explicitly opt in with a disposable, local Redis. Never use application Redis
// credentials or FLUSHDB: every test owns and removes only its UUID-named keys.
test('image updates use atomic Redis expiration and preserve concurrent changes', {
    skip: !process.env.IMAGESH_TEST_REDIS_URL && 'Set IMAGESH_TEST_REDIS_URL to a disposable local Redis',
}, async t => {
    const url = new URL(process.env.IMAGESH_TEST_REDIS_URL);
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Integration Redis must be local');
    const redis = createClient({ url: url.href, password: process.env.IMAGESH_TEST_REDIS_PASSWORD || undefined });
    await redis.connect();
    const ownedKeys = new Set();
    t.after(async () => {
        try { if (ownedKeys.size) await redis.del([...ownedKeys]); }
        finally { await redis.quit(); }
    });
    const route = routeFor(redis);
    const { applyImageUpdate } = loadSource('src/lib/image-updates.ts');
    async function seed(overrides = {}, binary = 'BINARY:' + Buffer.from('original image bytes').toString('base64')) {
        const id = 'lifetime-test-' + randomUUID();
        const uploadedAt = new Date(Date.now() - 2 * DAY).toISOString();
        const image = {
            id, originalName: 'image.png', customName: null, displayName: 'image.png', mimeType: 'image/png',
            size: 999999, uploadedAt, uploadedBy: 'lifetime-test',
            expiresAt: new Date(Date.parse(uploadedAt) + 7 * DAY).toISOString(), ...overrides,
        };
        const keys = [`image:${id}:data`, `image:${id}:binary`];
        keys.forEach(key => ownedKeys.add(key));
        await redis.set(keys[0], JSON.stringify(image), { PXAT: Date.parse(image.expiresAt) });
        await redis.set(keys[1], binary, { PXAT: Date.parse(image.expiresAt) });
        return { image, keys, binary };
    }

    await t.test('extending and shortening share one exact deadline and keep the same image', async () => {
        const { image, keys, binary } = await seed();
        for (const lifetime of ['1m', '3d']) {
            const response = await patch(route, image.id, { expiration: lifetime });
            assert.equal(response.status, 200);
            const { imageData } = await response.json();
            const expected = expirationFor(image.uploadedAt, lifetime);
            assert.equal(Date.parse(imageData.expiresAt), expected);
            assert.equal(imageData.uploadedAt, image.uploadedAt);
            assert.equal(imageData.id, image.id);
            assert.equal(imageData.displayName, image.displayName);
            assert.equal(imageData.size, Buffer.from('original image bytes').length);
            assert.equal(await redis.pExpireTime(keys[0]), expected);
            assert.equal(await redis.pExpireTime(keys[1]), expected);
            assert.equal(await redis.get(keys[1]), binary);
        }
        const snapshot = await redis.mGet(keys);
        const deadline = await redis.pExpireTime(keys[0]);
        assert.equal((await patch(route, image.id, { expiration: '1d' })).status, 400);
        assert.deepEqual(await redis.mGet(keys), snapshot);
        assert.equal(await redis.pExpireTime(keys[0]), deadline);
        const renamed = await (await patch(route, image.id, { name: 'Renamed' })).json();
        assert.equal(renamed.imageData.displayName, 'Renamed');
        assert.equal(Date.parse(renamed.imageData.expiresAt), deadline);
        assert.equal(await redis.pExpireTime(keys[0]), deadline);
        assert.equal(await redis.pExpireTime(keys[1]), deadline);
    });

    await t.test('concurrent renames and lifetime updates retain both changes', async () => {
        const { image, keys } = await seed();
        for (const expiration of ['1m', '3d', '1y']) {
            const results = await Promise.all([
                patch(route, image.id, { name: 'Changed with ' + expiration }),
                patch(route, image.id, { expiration }),
            ]);
            results.forEach(response => assert.equal(response.status, 200));
            const stored = JSON.parse(await redis.get(keys[0]));
            assert.equal(stored.displayName, 'Changed with ' + expiration);
            assert.equal(Date.parse(stored.expiresAt), expirationFor(image.uploadedAt, expiration));
        }
    });

    await t.test('missing or concurrently deleted keys are never recreated or partially changed', async () => {
        for (const removedIndex of [0, 1]) {
            const { image, keys } = await seed();
            const racingRoute = routeFor({
                get: redis.get.bind(redis),
                eval: async (...args) => { await redis.del(keys[removedIndex]); return redis.eval(...args); },
            });
            const remainingBefore = await redis.get(keys[1 - removedIndex]);
            const deadline = await redis.pExpireTime(keys[1 - removedIndex]);
            assert.equal((await patch(racingRoute, image.id, { expiration: '1m' })).status, 404);
            assert.equal(await redis.get(keys[removedIndex]), null);
            assert.equal(await redis.get(keys[1 - removedIndex]), remainingBefore);
            assert.equal(await redis.pExpireTime(keys[1 - removedIndex]), deadline);
        }
    });

    await t.test('Redis rejects a deadline that passed after validation without changing either key', async () => {
        const { image, keys } = await seed();
        const before = await redis.mGet(keys);
        const deadline = await redis.pExpireTime(keys[0]);
        const [seconds, microseconds] = await redis.sendCommand(['TIME']);
        const expiresAtMs = Number(seconds) * 1000 + Math.floor(Number(microseconds) / 1000) - 1;
        const result = await applyImageUpdate(redis, image.id, {
            uploadedAt: image.uploadedAt, expiresAt: new Date(expiresAtMs).toISOString(), expiresAtMs, name: 'Must not be applied',
        });
        assert.equal(result.status, 400);
        assert.deepEqual(await redis.mGet(keys), before);
        assert.equal(await redis.pExpireTime(keys[0]), deadline);
        assert.equal(await redis.pExpireTime(keys[1]), deadline);
    });

    await t.test('legacy base64 sizes are corrected on rename without changing expiration', async () => {
        for (const length of [1, 2, 3, 10]) {
            for (const prefix of ['', 'BINARY:']) {
                const { image, keys } = await seed({}, prefix + Buffer.alloc(length, 255).toString('base64'));
                const deadline = await redis.pExpireTime(keys[0]);
                const response = await patch(route, image.id, { name: 'Legacy' });
                assert.equal(response.status, 200);
                assert.equal((await response.json()).imageData.size, length);
                assert.equal(JSON.parse(await redis.get(keys[0])).size, length);
                assert.equal(await redis.pExpireTime(keys[0]), deadline);
                assert.equal(await redis.pExpireTime(keys[1]), deadline);
            }
        }
    });

    await t.test('both keys actually disappear at a shortened expiration', async () => {
        const deadline = Date.now() + 1000;
        const { image, keys } = await seed({ uploadedAt: new Date(deadline - 7200_000).toISOString() });
        assert.equal((await patch(route, image.id, { expiration: '2h' })).status, 200);
        await delay(Math.max(0, deadline - Date.now()) + 50);
        assert.deepEqual(await redis.mGet(keys), [null, null]);
        assert.equal((await patch(route, image.id, { expiration: '1y' })).status, 404);
        assert.deepEqual(await redis.mGet(keys), [null, null]);
    });
});
