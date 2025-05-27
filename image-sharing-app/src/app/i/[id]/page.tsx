import { notFound } from 'next/navigation';

async function getImageUrl(id: string) {
    return `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/i/${id}`;
}

export default async function ImageViewPage({ params }: { params: { id: string } }) {
    const imageUrl = await getImageUrl(params.id);

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="relative max-w-7xl w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={imageUrl}
                    alt="Shared image"
                    className="w-full h-auto max-h-[90vh] object-contain"
                    onError={() => {
                        // If image fails to load, show not found
                        notFound();
                    }}
                />
            </div>
        </div>
    );
} 