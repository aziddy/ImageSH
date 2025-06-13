import { NextRequest, NextResponse } from 'next/server';
import getRedis from '@/lib/redis';
import sharp from 'sharp';

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const imageId = params.id;

        // Get Redis client
        const redis = await getRedis();

        // Get image metadata first to check if it exists
        const imageDataStr = await redis.get(`image:${imageId}:data`);
        if (!imageDataStr) {
            return NextResponse.json({ error: 'Image not found' }, { status: 404 });
        }

        const imageData = JSON.parse(imageDataStr);

        // Get image binary data as string and convert to buffer
        const imageBinaryStr = await redis.get(`image:${imageId}:binary`);
        if (!imageBinaryStr) {
            return NextResponse.json({ error: 'Image binary not found' }, { status: 404 });
        }

        // Convert string back to buffer
        const imageBuffer = Buffer.from(imageBinaryStr, 'base64');

        /*
            TODO: Probably save image as png or jpeg in the first place
            TODO: iOS Messenger Previews dont work with webp or webm
        */
        // Convert image to PNG format using Sharp
        const pngBuffer = await sharp(imageBuffer)
            .png()
            .toBuffer();

        // Return image with appropriate headers
        return new NextResponse(pngBuffer, {
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=3600',
                'Content-Disposition': `inline; filename="${imageData.originalName}.png"`,
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