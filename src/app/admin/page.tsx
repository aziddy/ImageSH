'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import AppHeader from '@/components/AppHeader';
import ImageUploader from '@/components/ImageUploader';
import ImageGrid from '@/components/ImageGrid';
import ShareSheet, { type CopyState } from '@/components/ShareSheet';
import type { ImageData } from '@/lib/format';

interface ShareState {
    image: ImageData;
    title: string;
    copyState: CopyState;
    /** Changes on every open so the sheet starts fresh. */
    key: number;
}

export default function AdminPage() {
    const { status } = useSession();
    const router = useRouter();
    const [refreshKey, setRefreshKey] = useState(0);
    const [share, setShare] = useState<ShareState | null>(null);
    const [shareOpen, setShareOpen] = useState(false);

    useEffect(() => {
        if (status === 'unauthenticated') router.replace('/login');
    }, [status, router]);

    const handleUploaded = useCallback((image: ImageData, copyState: CopyState) => {
        setRefreshKey((key) => key + 1);
        setShare({ image, title: 'Link ready', copyState, key: Date.now() });
        setShareOpen(true);
    }, []);

    const handleShare = useCallback((image: ImageData) => {
        setShare({ image, title: 'Share link', copyState: 'idle', key: Date.now() });
        setShareOpen(true);
    }, []);

    if (status !== 'authenticated') {
        return <div className="min-h-screen bg-background" aria-busy="true" />;
    }

    return (
        <div className="min-h-screen bg-background">
            <AppHeader />
            <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-4 pt-4 pb-12 sm:px-6">
                <ImageUploader onUploaded={handleUploaded} />
                <ImageGrid refreshKey={refreshKey} onShare={handleShare} />
            </main>
            {share && (
                <ShareSheet
                    key={share.key}
                    image={share.image}
                    title={share.title}
                    initialCopyState={share.copyState}
                    open={shareOpen}
                    onOpenChange={setShareOpen}
                />
            )}
        </div>
    );
}
