'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function AdminError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('Admin Error:', error);
    }, [error]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center p-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                    Admin Panel Error
                </h2>
                <p className="text-gray-600 mb-4">
                    There was an error loading the admin panel.
                </p>
                {error.digest && (
                    <p className="text-xs text-gray-400 mb-4">
                        Error ID: {error.digest}
                    </p>
                )}
                <div className="flex gap-4 justify-center">
                    <Button onClick={reset} variant="default">
                        Try Again
                    </Button>
                    <Button onClick={() => window.location.href = '/login'} variant="outline">
                        Go to Login
                    </Button>
                </div>
            </div>
        </div>
    );
}
