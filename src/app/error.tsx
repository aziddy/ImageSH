'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

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
        <div className="flex min-h-dvh items-center justify-center bg-background px-6">
            <div className="flex max-w-md flex-col items-center gap-3 text-center">
                <h1 className="text-xl leading-tight font-semibold">Something went wrong</h1>
                <p className="text-muted-foreground">
                    This page hit an unexpected error. Try again, and reload the page if it keeps happening.
                </p>
                {error.digest && (
                    <p className="text-[13px] text-muted-foreground tabular-nums">Error ID: {error.digest}</p>
                )}
                <Button onClick={reset} className="mt-2">
                    Try again
                </Button>
            </div>
        </div>
    );
}
