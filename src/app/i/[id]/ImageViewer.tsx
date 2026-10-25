'use client';

import { useState } from 'react';
import { Download, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LifetimeRing from '@/components/LifetimeRing';
import Logo from '@/components/Logo';
import { useNow } from '@/hooks/useNow';
import { formatGoneIn, getLifetime } from '@/lib/format';

type ImageViewerProps =
    | { status: 'missing' | 'error' }
    | {
          status: 'found';
          src: string;
          name: string;
          uploadedAt: string;
          expiresAt: string;
          downloadName: string;
      };

function Unavailable({ kind }: { kind: 'missing' | 'error' }) {
    return (
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <ImageOff className="size-14 text-muted-foreground" strokeWidth={1.25} aria-hidden="true" />
            {kind === 'missing' ? (
                <>
                    <h1 className="text-xl leading-tight font-semibold">This image has expired</h1>
                    <p className="max-w-[36ch] text-muted-foreground">
                        Images on ImageSH are temporary. Ask the sender for a new link.
                    </p>
                </>
            ) : (
                <>
                    <h1 className="text-xl leading-tight font-semibold">This image couldn’t be loaded</h1>
                    <p className="max-w-[36ch] text-muted-foreground">
                        The server had a problem finding it. Try again in a moment.
                    </p>
                    <Button variant="outline" onClick={() => window.location.reload()}>
                        Try again
                    </Button>
                </>
            )}
        </main>
    );
}

export default function ImageViewer(props: ImageViewerProps) {
    const [failed, setFailed] = useState(false);
    const now = useNow();

    return (
        // The viewer is always a dark lightbox, whatever theme the admin uses.
        <div className="dark flex h-dvh flex-col bg-background text-foreground">
            <div className="flex items-center gap-2 px-4 pt-4 text-muted-foreground sm:px-6">
                <Logo className="size-[18px]" />
                <span className="text-sm font-medium">ImageSH</span>
            </div>

            {props.status !== 'found' || failed ? (
                <Unavailable kind={props.status === 'error' ? 'error' : 'missing'} />
            ) : (
                <>
                    <figure className="m-0 flex min-h-0 flex-1 items-center justify-center p-4 sm:px-6">
                        <img
                            src={props.src}
                            alt={props.name}
                            onError={() => setFailed(true)}
                            className="size-full object-contain"
                        />
                    </figure>
                    <ViewerBar {...props} now={now} />
                </>
            )}
        </div>
    );
}

function ViewerBar({
    name,
    uploadedAt,
    expiresAt,
    src,
    downloadName,
    now,
}: {
    name: string;
    uploadedAt: string;
    expiresAt: string;
    src: string;
    downloadName: string;
    now: number | null;
}) {
    const lifetime = now === null ? null : getLifetime(uploadedAt, expiresAt, now);

    return (
        <div className="flex items-center justify-between gap-4 border-t px-4 py-4 sm:px-6">
            <div className="flex min-w-0 flex-col gap-1">
                <p className="truncate font-medium" title={name}>
                    {name}
                </p>
                <p className="flex min-h-5 items-center gap-2 text-[13px] text-muted-foreground tabular-nums">
                    {lifetime && (
                        <>
                            <LifetimeRing fraction={lifetime.fraction} level={lifetime.level} />
                            <span>{formatGoneIn(lifetime.remaining)}</span>
                        </>
                    )}
                </p>
            </div>
            <Button asChild className="shrink-0">
                <a href={src} download={downloadName}>
                    <Download />
                    Save
                </a>
            </Button>
        </div>
    );
}
