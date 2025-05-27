import ImageViewer from './ImageViewer';

async function getImageUrl(id: string) {
    return `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/i/${id}`;
}

export default async function ImageViewPage({ params }: { params: { id: string } }) {
    const imageUrl = await getImageUrl(params.id);

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <ImageViewer imageUrl={imageUrl} />
        </div>
    );
} 