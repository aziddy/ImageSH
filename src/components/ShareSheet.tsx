'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import LifetimeRing from '@/components/LifetimeRing';
import { useNow } from '@/hooks/useNow';
import { formatDateTime, formatFileSize, getLifetime, shareUrlFor, type ImageData } from '@/lib/format';

export type CopyState = 'copied' | 'failed' | 'idle';

interface ShareSheetProps {
    image: ImageData | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** "Link ready" after an upload, "Share link" when opened from a card. */
    title?: string;
    /** Whether the link was already copied before the sheet opened. */
    initialCopyState?: CopyState;
}

export default function ShareSheet({
    image,
    open,
    onOpenChange,
    title = 'Share link',
    initialCopyState = 'idle',
}: ShareSheetProps) {
    const now = useNow();
    // The parent remounts this sheet (via `key`) each time it opens, so this resets per open.
    const [copyState, setCopyState] = useState<CopyState>(initialCopyState);

    if (!image) return null;

    const link = shareUrlFor(image.id);
    // The sheet only opens after hydration, so `now` is always set; the fallback just satisfies the type.
    const lifetime = getLifetime(image.uploadedAt, image.expiresAt, now ?? new Date(image.uploadedAt).getTime());

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(link);
            setCopyState('copied');
        } catch {
            setCopyState('failed');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-[480px] max-sm:top-auto max-sm:bottom-0 max-sm:max-w-none max-sm:translate-y-0 max-sm:rounded-b-none max-sm:pb-8">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription className="sr-only">
                        Copy the link or scan the QR code to share {image.displayName}.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center gap-3.5">
                    <div className="size-[72px] shrink-0 overflow-hidden rounded-lg bg-muted">
                        <img src={`/api/i/${image.id}`} alt="" className="size-full object-cover" />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                        <p className="truncate font-medium" title={image.displayName}>{image.displayName}</p>
                        <p className="flex items-center gap-2 text-[13px] text-muted-foreground tabular-nums">
                            <LifetimeRing fraction={lifetime.fraction} level={lifetime.level} />
                            <span>{lifetime.expired ? 'Expired' : `Expires ${formatDateTime(image.expiresAt)}`}</span>
                        </p>
                        <p className="text-[13px] text-muted-foreground tabular-nums">{formatFileSize(image.size)}</p>
                    </div>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label htmlFor="share-link" className="text-sm font-medium">Link</label>
                    <div className="flex gap-2">
                        <Input
                            id="share-link"
                            readOnly
                            value={link}
                            onFocus={(e) => e.currentTarget.select()}
                            className="bg-muted"
                        />
                        <Button onClick={copyLink} className="shrink-0">
                            {copyState === 'copied' ? <Check /> : <Copy />}
                            {copyState === 'copied' ? 'Link copied' : 'Copy link'}
                        </Button>
                    </div>
                    <p role="status" className={copyState === 'failed' ? 'text-[13px] text-muted-foreground' : 'sr-only'}>
                        {copyState === 'copied' && 'Link copied'}
                        {copyState === 'failed' && 'This browser blocked copying. Select the link above and copy it yourself.'}
                    </p>
                </div>

                <div className="flex items-center gap-4 rounded-lg border p-4">
                    <div className="shrink-0 rounded-md bg-white p-2">
                        <QRCodeSVG
                            value={link}
                            size={104}
                            level="M"
                            fgColor="#171717"
                            bgColor="#FFFFFF"
                            title={`QR code for ${image.displayName}`}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <p className="font-medium">Scan to open on a phone</p>
                        <p className="text-[13px] text-muted-foreground">Points at the same link as the field above.</p>
                        <a
                            href={`/qr/${image.id}`}
                            target="_blank"
                            rel="noopener"
                            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                        >
                            Print QR code
                        </a>
                    </div>
                </div>

                <div className="flex justify-between gap-2">
                    <Button variant="outline" asChild>
                        <a href={`/i/${image.id}`} target="_blank" rel="noopener">Open</a>
                    </Button>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Done
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
