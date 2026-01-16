import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import getRedis from '@/lib/redis';

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

        // Get Redis client
        const redis = await getRedis();

        const { id: imageId } = await context.params;
        const { name } = await request.json();

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json({ error: 'Valid name is required' }, { status: 400 });
        }

        // Get existing image data
        const imageDataStr = await redis.get(`image:${imageId}:data`);
        if (!imageDataStr) {
            return NextResponse.json({ error: 'Image not found' }, { status: 404 });
        }

        let imageData;
        try {
            imageData = JSON.parse(imageDataStr);
        } catch (parseError) {
            console.error('Failed to parse image data:', parseError);
            return NextResponse.json({ error: 'Invalid image data format' }, { status: 500 });
        }

        // Validate parsed data structure
        if (!imageData || typeof imageData !== 'object') {
            console.error('Invalid image data structure:', imageData);
            return NextResponse.json({ error: 'Invalid image data structure' }, { status: 500 });
        }

        // Update the name fields
        imageData.customName = name.trim();
        imageData.displayName = name.trim();

        // Update in Redis (keep the same TTL)
        const ttl = await redis.ttl(`image:${imageId}:data`);
        if (ttl > 0) {
            await redis.setEx(`image:${imageId}:data`, ttl, JSON.stringify(imageData));
        } else {
            await redis.set(`image:${imageId}:data`, JSON.stringify(imageData));
        }

        return NextResponse.json({
            success: true,
            imageData
        });
    } catch (error) {
        console.error('Update image name error:', error);
        return NextResponse.json(
            { error: 'Failed to update image name' },
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