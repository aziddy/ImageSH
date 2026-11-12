import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import getRedis from '@/lib/redis';
import { applyImageUpdate } from '@/lib/image-updates';
import { expirationFor, getLifetimeOption } from '@/lib/lifetimes';

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        // Check authentication
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let body;
        try { body = await request.json(); }
        catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json({ error: 'Provide a name or lifetime to update' }, { status: 400 });
        }
        const { name, expiration } = body;
        if (name === undefined && expiration === undefined) {
            return NextResponse.json({ error: 'Provide a name or lifetime to update' }, { status: 400 });
        }
        if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
            return NextResponse.json({ error: 'Valid name is required' }, { status: 400 });
        }
        if (expiration !== undefined && !getLifetimeOption(expiration)) {
            return NextResponse.json({ error: 'Choose a valid lifetime' }, { status: 400 });
        }

        const redis = await getRedis();
        const { id: imageId } = await context.params;
        const patch: Parameters<typeof applyImageUpdate>[2] = {};
        if (name !== undefined) patch.name = name.trim();
        if (expiration !== undefined) {
            const raw = await redis.get(`image:${imageId}:data`);
            if (!raw) return NextResponse.json({ error: 'This image has expired or was deleted.' }, { status: 404 });
            const image = JSON.parse(raw);
            if (!image || typeof image.uploadedAt !== 'string' || !Number.isFinite(Date.parse(image.uploadedAt))
                || typeof image.expiresAt !== 'string' || !Number.isFinite(Date.parse(image.expiresAt))) {
                return NextResponse.json({ error: 'Invalid image data format' }, { status: 500 });
            }
            const now = Date.now();
            if (Date.parse(image.expiresAt) <= now) {
                return NextResponse.json({ error: 'This image has expired or was deleted.' }, { status: 404 });
            }
            const expiresAtMs = expirationFor(image.uploadedAt, expiration);
            if (expiresAtMs <= now) {
                return NextResponse.json({ error: 'Choose a lifetime that expires in the future.' }, { status: 400 });
            }
            patch.uploadedAt = image.uploadedAt;
            patch.expiresAt = new Date(expiresAtMs).toISOString();
            patch.expiresAtMs = expiresAtMs;
        }

        const result = await applyImageUpdate(redis, imageId, patch);
        return result.status === 200
            ? NextResponse.json({ success: true, imageData: result.imageData })
            : NextResponse.json({ error: result.error }, { status: result.status });
    } catch (error) {
        console.error('Update image error:', error);
        return NextResponse.json(
            { error: 'Failed to update image' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        // Check authentication
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get Redis client
        const redis = await getRedis();

        const { id: imageId } = await context.params;

        // Delete both data and binary
        const dataDeleted = await redis.del(`image:${imageId}:data`);
        const binaryDeleted = await redis.del(`image:${imageId}:binary`);

        if (dataDeleted === 0 && binaryDeleted === 0) {
            return NextResponse.json({ error: 'Image not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete image error:', error);
        return NextResponse.json(
            { error: 'Failed to delete image' },
            { status: 500 }
        );
    }
}
