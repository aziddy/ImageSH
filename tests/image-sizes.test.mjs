import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtimeRequire = createRequire(import.meta.url);

// Run the actual route code with isolated auth/storage, without a live account or Redis.
function loadSource(path, overrides = {}) {
    const filename = resolve(root, path);
    const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    });
    const loaded = { exports: {} };
    new Function('require', 'module', 'exports', outputText)(
        name => Object.hasOwn(overrides, name) ? overrides[name] : runtimeRequire(name), loaded, loaded.exports,
    );
    return loaded.exports;
}

test('file size formatting uses decimal units and the same precision as iOS', () => {
    const { formatFileSize } = loadSource('src/lib/format.ts');
    const sizes = [
        [0, '0 B'], [999, '999 B'], [1000, '1 KB'], [1024, '1.02 KB'],
        [629848, '629.85 KB'], [1000000, '1 MB'], [1048576, '1.05 MB'],
        [1719130, '1.72 MB'], [10485760, '10.49 MB'], [1000000000, '1 GB'],
    ];
    for (const [bytes, expected] of sizes) assert.equal(formatFileSize(bytes), expected);
});

class MemoryRedis {
    isOpen = true;
    values = new Map();
    on() {}
    async set(key, value) { this.values.set(key, value); }
    async setEx(key, _ttl, value) { this.values.set(key, value); }
    async get(key) { return this.values.get(key) ?? null; }
    async ttl() { return 7200; }
    async keys() { return [...this.values.keys()].filter(key => key.endsWith(':data')); }
    multi() {
        const commands = [];
        const transaction = {
            strLen: key => { commands.push(() => (this.values.get(key) ?? '').length); return transaction; },
            getRange: (key, start, end) => {
                commands.push(() => {
                    const value = this.values.get(key) ?? '';
                    return value.slice(start, end === -1 ? undefined : end + 1);
                });
                return transaction;
            },
            execTyped: async () => commands.map(command => command()),
        };
        return transaction;
    }
}

test('reported sizes equal downloadable bytes, including legacy metadata and base64 storage', async t => {
    const previous = { url: process.env.REDIS_URL, password: process.env.REDIS_PASSWORD, maxSize: process.env.NEXT_PUBLIC_MAX_FILE_SIZE };
    process.env.REDIS_URL = 'redis://image-size-test.invalid';
    process.env.REDIS_PASSWORD = 'image-size-test-only';
    process.env.NEXT_PUBLIC_MAX_FILE_SIZE = '10485760';
    t.after(() => {
        for (const [key, value] of [['REDIS_URL', previous.url], ['REDIS_PASSWORD', previous.password], ['NEXT_PUBLIC_MAX_FILE_SIZE', previous.maxSize]]) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    });
    t.mock.method(console, 'log', () => {});
    const redis = new MemoryRedis();
    const storage = loadSource('src/lib/redis.ts', { redis: { createClient: () => redis } });
    const overrides = {
        '@/lib/redis': storage,
        '@/lib/format': loadSource('src/lib/format.ts'),
        '@/lib/auth': { authOptions: {} },
        'next-auth': { getServerSession: async () => ({ user: { name: 'size-test' } }) },
    };
    const upload = loadSource('src/app/api/admin/upload/route.ts', overrides).POST;
    const list = loadSource('src/app/api/admin/images/route.ts', overrides).GET;
    const download = loadSource('src/app/api/i/[id]/route.ts', overrides).GET;
    const rename = loadSource('src/app/api/admin/images/[id]/route.ts', overrides).PATCH;

    await t.test('storage size handles padding, old base64 and absent keys', async () => {
        assert.equal(await storage.getBufferByteLength('missing'), null);
        for (let length = 1; length <= 32; length++) {
            const data = Buffer.alloc(length, 255);
            for (const prefix of ['', 'BINARY:']) {
                await redis.set('padding-test', prefix + data.toString('base64'));
                assert.equal(await storage.getBufferByteLength('padding-test'), data.length);
                assert.deepEqual(await storage.getBuffer('padding-test'), data);
            }
        }
    });

    const png = readFileSync(resolve(root, 'src/test-fixtures/images/1.png'));
    const fixtures = [
        ['small.png', 'image/png', png],
        ['large.png', 'image/png', readFileSync(resolve(root, 'src/test-fixtures/images/2.png'))],
        ['photo.jpg', 'image/jpeg', await sharp(png).jpeg({ quality: 35 }).toBuffer()],
        ['photo.webp', 'image/webp', await sharp(png).webp({ quality: 35 }).toBuffer()],
        ['transparent.gif', 'image/gif', Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')],
    ];
    for (const [filename, type, input] of fixtures) {
        await t.test(filename, async () => {
            const form = new FormData();
            form.set('file', new File([input], filename, { type }));
            form.set('expiration', '2h');
            const response = await upload(new Request('http://image-size-test.invalid/api/admin/upload', { method: 'POST', body: form }));
            assert.equal(response.status, 200);
            const { image } = await response.json();
            const context = { params: Promise.resolve({ id: image.id }) };
            const downloaded = await download(new Request('http://image-size-test.invalid/api/i/' + image.id), context);
            const body = Buffer.from(await downloaded.arrayBuffer());
            assert.ok(body.length > 0);
            assert.equal(image.size, body.length);
            assert.equal(downloaded.headers.get('content-length'), String(body.length));
            assert.equal(downloaded.headers.get('content-type'), image.mimeType);
            assert.deepEqual(body, await storage.getBuffer(`image:${image.id}:binary`));

            // Simulate an older upload with an incorrect size and unprefixed storage.
            await redis.set(`image:${image.id}:data`, JSON.stringify({ ...image, size: input.length * 2 }));
            await redis.set(`image:${image.id}:binary`, body.toString('base64'));
            const { images } = await (await list()).json();
            assert.equal(images.find(record => record.id === image.id).size, body.length);
            const renamed = await rename(new Request('http://image-size-test.invalid/api/admin/images/' + image.id, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Renamed' }),
            }), context);
            assert.equal((await renamed.json()).imageData.size, body.length);
            assert.equal(JSON.parse(await redis.get(`image:${image.id}:data`)).size, body.length);
        });
    }
});
