import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { setWithExpiry } from '@/lib/redis';
import { nanoid } from 'nanoid';
import sharp from 'sharp';

const MAX_FILE_SIZE = parseInt(process.env.NEXT_PUBLIC_MAX_FILE_SIZE || '10485760');

export async function POST(request: NextRequest) {
    try {
        // Check authentication
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const expiration = formData.get('expiration') as string;
        const customName = formData.get('name') as string | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` },
                { status: 400 }
            );
        }

        // Validate file type
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            return NextResponse.json(
                { error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.' },
                { status: 400 }
            );
        }

        // Generate unique ID
        const imageId = nanoid(10);

        // Read file buffer
        const buffer = Buffer.from(await file.arrayBuffer());

        // Process image with sharp (optimize and convert to webp for storage)
        const processedImage = await sharp(buffer)
            .rotate() // Auto-rotate based on EXIF orientation data
            .webp({ quality: 80 })
            .toBuffer();

        // Calculate TTL
        const ttlMap: { [key: string]: number } = {
            '2h': 2 * 60 * 60,
            '1d': 24 * 60 * 60,
            '3d': 3 * 24 * 60 * 60,
            '7d': 7 * 24 * 60 * 60,
            '1m': 30 * 24 * 60 * 60,
            '3m': 90 * 24 * 60 * 60,
            '6m': 180 * 24 * 60 * 60,
            '1y': 365 * 24 * 60 * 60,
        };

        const ttl = ttlMap[expiration] || ttlMap['1d'];

        // Store in Redis
        const imageData = {
            id: imageId,
            originalName: file.name,
            customName: customName || null,
            displayName: customName || file.name,
            mimeType: 'image/webp',
            size: file.size * 2, // TODO: bad, but close enough
            uploadedAt: new Date().toISOString(),
            uploadedBy: session.user.name,
            expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
        };

        // Store image data and binary separately (binary as base64 string)
        await setWithExpiry(`image:${imageId}:data`, JSON.stringify(imageData), ttl);
        await setWithExpiry(`image:${imageId}:binary`, processedImage.toString('base64'), ttl);

        const shareUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/i/${imageId}`;

        return NextResponse.json({
            success: true,
            imageId,
            shareUrl,
            expiresAt: imageData.expiresAt,
        });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { error: 'Failed to upload image' },
            { status: 500 }
        );
    }
} 