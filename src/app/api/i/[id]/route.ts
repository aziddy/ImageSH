import { NextRequest, NextResponse } from 'next/server';
import getRedis, { getBuffer } from '@/lib/redis';

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

        // Get image binary data using backward-compatible helper
        const imageBuffer = await getBuffer(`image:${imageId}:binary`);
        if (!imageBuffer) {
            return NextResponse.json({ error: 'Image binary not found' }, { status: 404 });
        }

        // Serve image in its stored format (no conversion needed)
        // Images are now stored in their original format for better compression
        const contentType = imageData.mimeType || 'image/png';
        const fileExtension = contentType.split('/')[1] || 'png';
        const displayName = imageData.displayName || imageData.originalName || 'image';
        const filename = `${displayName}.${fileExtension}`;

        // Return image with appropriate headers
        return new Response(imageBuffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600',
                'Content-Disposition': `inline; filename="${filename}"`,
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