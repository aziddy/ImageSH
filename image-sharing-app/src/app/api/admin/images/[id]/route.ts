import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import redis from '@/lib/redis';

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Check authentication
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const imageId = params.id;

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