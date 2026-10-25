'use client';

import { useEffect } from 'react';
import Link from 'next/link';
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
        <div className="flex min-h-dvh items-center justify-center bg-background px-6">
            <div className="flex max-w-md flex-col items-center gap-3 text-center">
                <h1 className="text-xl leading-tight font-semibold">Your images couldn’t load</h1>
                <p className="text-muted-foreground">
                    Try again. If it keeps happening, sign in again or check that the server can reach Redis.
                </p>
                {error.digest && (
                    <p className="text-[13px] text-muted-foreground tabular-nums">Error ID: {error.digest}</p>
                )}
                <div className="mt-2 flex gap-2">
                    <Button onClick={reset}>Try again</Button>
                    <Button variant="outline" asChild>
                        <Link href="/login">Go to sign in</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
