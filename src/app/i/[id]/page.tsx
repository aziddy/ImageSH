import { cache } from 'react';
import type { Metadata } from 'next';
import getRedis from '@/lib/redis';
import type { ImageData } from '@/lib/format';
import ImageViewer from './ImageViewer';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const IMAGE_EXTENSION = /\.(jpe?g|png|gif|webp)$/i;

type Lookup = { status: 'found'; image: ImageData } | { status: 'missing' } | { status: 'error' };

// Shared by generateMetadata and the page, so Redis is read once per request.
const getImage = cache(async (id: string): Promise<Lookup> => {
    if (!ID_PATTERN.test(id)) return { status: 'missing' };
    try {
        const redis = await getRedis();
        const raw = await redis.get(`image:${id}:data`);
        if (!raw) return { status: 'missing' };
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.id) return { status: 'missing' };
        return { status: 'found', image: parsed as ImageData };
    } catch (error) {
        console.error('Viewer lookup error:', error);
        return { status: 'error' };
    }
});

function downloadNameFor(image: ImageData): string {
    const subtype = image.mimeType?.split('/')[1] || 'png';
    const extension = subtype === 'jpeg' ? 'jpg' : subtype;
    const base = (image.displayName || image.originalName || 'image').replace(IMAGE_EXTENSION, '');
    return `${base}.${extension}`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    const lookup = await getImage(id);
    // Shared images are temporary and private by link; keep them out of search results.
    const robots = { index: false, follow: false };

    if (lookup.status !== 'found') {
        return { title: 'Image unavailable', robots };
    }

    const title = lookup.image.displayName;
    const imageUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/i/${id}`;
    const description = 'Shared with ImageSH';

    return {
        title,
        description,
        robots,
        openGraph: { title, description, images: [imageUrl] },
        twitter: { card: 'summary_large_image', title, description, images: [imageUrl] },
    };
}

export default async function ImageViewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const lookup = await getImage(id);

    if (lookup.status !== 'found') {
        return <ImageViewer status={lookup.status} />;
    }

    const { image } = lookup;
    return (
        <ImageViewer
            status="found"
            src={`/api/i/${id}`}
            name={image.displayName}
            uploadedAt={image.uploadedAt}
            expiresAt={image.expiresAt}
            downloadName={downloadNameFor(image)}
        />
    );
}
