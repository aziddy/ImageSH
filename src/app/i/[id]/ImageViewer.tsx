'use client';

import { useState } from 'react';

interface ImageViewerProps {
    imageUrl: string;
}

export default function ImageViewer({ imageUrl }: ImageViewerProps) {
    const [isError, setIsError] = useState(false);

    if (isError) {
        return (
            <div className="text-center">
                <h2 className="text-2xl font-semibold text-gray-200 mb-2">Image Not Available</h2>
                <p className="text-gray-400">This image may have expired or was never available.</p>
            </div>
        );
    }

    return (
        <div className="relative max-w-7xl w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={imageUrl}
                alt="Shared image"
                className="w-full h-auto max-h-[90vh] object-contain"
                onError={() => setIsError(true)}
            />
        </div>
    );
} 