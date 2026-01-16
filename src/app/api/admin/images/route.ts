import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import getRedis from '@/lib/redis';

export async function GET() {
    try {
        // Check authentication
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get Redis client
        const redis = await getRedis();

        // Get all image keys
        const keys = await redis.keys('image:*:data');

        // Fetch image data for each key
        const images = [];
        for (const key of keys) {
            const data = await redis.get(key);
            if (data) {
                try {
                    const parsedData = JSON.parse(data);
                    // Validate parsed data structure
                    if (parsedData && typeof parsedData === 'object' && parsedData.id) {
                        images.push(parsedData);
                    } else {
                        console.warn(`Invalid image data structure for key ${key}:`, parsedData);
                    }
                } catch (parseError) {
                    console.error(`Failed to parse image data for key ${key}:`, parseError);
                    // Continue processing other images even if one fails
                }
            }
        }

        // Sort by upload date (newest first)
        images.sort((a, b) => {
            const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
            const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
            return dateB - dateA;
        });

        return NextResponse.json({ images });
    } catch (error) {
        console.error('List images error:', error);
        return NextResponse.json(
            { error: 'Failed to list images' },
            { status: 500 }
        );
    }
} 