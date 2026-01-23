'use client';

import { useEffect } from 'react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('App Error:', error);
    }, [error]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center p-8 max-w-md">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                    Something went wrong
                </h2>
                <p className="text-gray-600 mb-4">
                    An unexpected error occurred. Please try again.
                </p>
                {error.digest && (
                    <p className="text-xs text-gray-400 mb-4">
                        Error ID: {error.digest}
                    </p>
                )}
                <button
                    onClick={reset}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                    Try Again
                </button>
            </div>
        </div>
    );
}
