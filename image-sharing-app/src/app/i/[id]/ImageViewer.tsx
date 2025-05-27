'use client';

import { notFound } from 'next/navigation';

interface ImageViewerProps {
    imageUrl: string;
}

export default function ImageViewer({ imageUrl }: ImageViewerProps) {
    return (
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
    );
} 