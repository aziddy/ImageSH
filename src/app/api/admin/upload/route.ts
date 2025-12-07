import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { setWithExpiry, setBufferWithExpiry } from '@/lib/redis';
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

        // Process image with sharp - preserve original format for better compression
        // Auto-rotate based on EXIF orientation data
        let processedImage: Buffer;
        let finalMimeType: string;
        
        const sharpInstance = sharp(buffer).rotate();
        
        // Preserve original format to maintain compression
        // JPEG/WebP are better for photos, PNG for graphics/transparency
        if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
            processedImage = await sharpInstance
                .jpeg({ quality: 85, mozjpeg: true })
                .toBuffer();
            finalMimeType = 'image/jpeg';
        } else if (file.type === 'image/webp') {
            processedImage = await sharpInstance
                .webp({ quality: 85 })
                .toBuffer();
            finalMimeType = 'image/webp';
        } else if (file.type === 'image/png') {
            // PNG compression level 6-9 (6 is faster, 9 is smaller)
            processedImage = await sharpInstance
                .png({ compressionLevel: 9, adaptiveFiltering: true })
                .toBuffer();
            finalMimeType = 'image/png';
        } else {
            // GIF or other - convert to PNG
            processedImage = await sharpInstance
                .png({ compressionLevel: 9 })
                .toBuffer();
            finalMimeType = 'image/png';
        }

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
        // Use actual processed image size, not original uploaded size
        const imageData = {
            id: imageId,
            originalName: file.name,
            customName: customName || null,
            displayName: customName || file.name,
            mimeType: finalMimeType,
            size: processedImage.length, // Actual stored size after processing
            uploadedAt: new Date().toISOString(),
            uploadedBy: session.user.name,
            expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
        };

        // Store image data and binary separately (binary as raw buffer for efficiency)
        await setWithExpiry(`image:${imageId}:data`, JSON.stringify(imageData), ttl);
        await setBufferWithExpiry(`image:${imageId}:binary`, processedImage, ttl);

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