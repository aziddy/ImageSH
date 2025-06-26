import ImageViewer from './ImageViewer';
import { Metadata } from 'next';

async function getImageUrl(id: string) {
    return `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/i/${id}`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    const imageUrl = await getImageUrl(id);

    return {
        title: 'View Image',
        description: 'View shared image',
        openGraph: {
            title: 'View Image',
            description: 'View shared image',
            images: [imageUrl],
        },
        twitter: {
            card: 'summary_large_image',
            title: 'View Image',
            description: 'View shared image',
            images: [imageUrl],
        },
    };
}

export default async function ImageViewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const imageUrl = await getImageUrl(id);

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <ImageViewer imageUrl={imageUrl} />
        </div>
    );
} 