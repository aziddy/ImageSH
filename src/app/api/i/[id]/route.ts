import { NextRequest, NextResponse } from 'next/server';
import getRedis, { getBuffer } from '@/lib/redis';
import sharp from 'sharp';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: imageId } = await params;

        // Get Redis client
        const redis = await getRedis();

        // Get image metadata first to check if it exists
        const imageDataStr = await redis.get(`image:${imageId}:data`);
        if (!imageDataStr) {
            return NextResponse.json({ error: 'Image not found' }, { status: 404 });
        }

        const imageData = JSON.parse(imageDataStr);

        // Get image binary data using backward-compatible helper
        const imageBuffer = await getBuffer(`image:${imageId}:binary`);
        if (!imageBuffer) {
            return NextResponse.json({ error: 'Image binary not found' }, { status: 404 });
        }

        // Check if image is already PNG (new format) or needs conversion (old WebP format)
        let finalBuffer: Buffer;
        let contentType: string;
        
        if (imageData.mimeType === 'image/png') {
            // New format: already PNG, serve directly
            finalBuffer = imageBuffer;
            contentType = 'image/png';
        } else {
            // Old format: WebP stored as base64, convert to PNG
            finalBuffer = await sharp(imageBuffer)
                .png()
                .toBuffer();
            contentType = 'image/png';
        }

        // Return image with appropriate headers
        return new NextResponse(finalBuffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600',
                'Content-Disposition': `inline; filename="${imageData.displayName || imageData.originalName}.png"`,
            },
        });
    } catch (error) {
        console.error('Get image error:', error);
        return NextResponse.json(
            { error: 'Failed to retrieve image' },
            { status: 500 }
        );
    }
} 