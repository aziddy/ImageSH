import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import redis from '@/lib/redis';

export async function GET() {
    try {
        // Check authentication
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get all image keys
        const keys = await redis.keys('image:*:data');

        // Fetch image data for each key
        const images = [];
        for (const key of keys) {
            const data = await redis.get(key);
            if (data) {
                images.push(JSON.parse(data));
            }
        }

        // Sort by upload date (newest first)
        images.sort((a, b) =>
            new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
        );

        return NextResponse.json({ images });
    } catch (error) {
        console.error('List images error:', error);
        return NextResponse.json(
            { error: 'Failed to list images' },
            { status: 500 }
        );
    }
} 