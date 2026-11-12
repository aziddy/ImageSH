'use client';

import { useEffect, useState } from 'react';
import { Check, Clock, Copy, ExternalLink, MoreHorizontal, Pencil, QrCode, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import LifetimeRing from '@/components/LifetimeRing';
import { cn } from '@/lib/utils';
import { formatFileSize, formatTimeLeft, getLifetime, type ImageData } from '@/lib/format';

interface ImageCardProps {
    image: ImageData;
    now: number;
    onCopy: (image: ImageData) => Promise<boolean>;
    onShare: (image: ImageData) => void;
    onRename: (image: ImageData) => void;
    onChangeLifetime: (image: ImageData) => void;
    onDelete: (image: ImageData) => void;
}

export default function ImageCard({ image, now, onCopy, onShare, onRename, onChangeLifetime, onDelete }: ImageCardProps) {
    const [copied, setCopied] = useState(false);
    const lifetime = getLifetime(image.uploadedAt, image.expiresAt, now);
    const viewerHref = `/i/${image.id}`;

    useEffect(() => {
        if (!copied) return;
        const timer = window.setTimeout(() => setCopied(false), 2000);
        return () => window.clearTimeout(timer);
    }, [copied]);

    const handleCopy = async () => {
        if (await onCopy(image)) setCopied(true);
    };

    return (
        <article className={cn('flex flex-col overflow-hidden rounded-lg border bg-card', lifetime.expired && 'opacity-60')}>
            <a
                href={viewerHref}
                target="_blank"
                rel="noopener"
                aria-label={`Open ${image.displayName}`}
                className="block aspect-square overflow-hidden bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
            >
                <img
                    src={`/api/i/${image.id}`}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover"
                />
            </a>
            <div className="flex flex-col gap-2.5 p-2.5 sm:p-3">
                <div className="flex flex-col gap-1">
                    <p className="truncate font-medium" title={image.displayName}>
                        {image.displayName}
                    </p>
                    <div className="flex items-center gap-2 text-[13px] text-muted-foreground tabular-nums">
                        <LifetimeRing fraction={lifetime.fraction} level={lifetime.level} />
                        <span className={cn('whitespace-nowrap', lifetime.level === 'last' && 'font-medium text-foreground')}>
                            {formatTimeLeft(lifetime.remaining)}
                        </span>
                        <span className="ml-auto whitespace-nowrap max-sm:hidden" title={`${image.size} bytes`}>
                            {formatFileSize(image.size)}
                        </span>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="min-w-0 flex-1 px-2" onClick={handleCopy}>
                        {copied ? <Check className="max-sm:hidden" /> : <Copy className="max-sm:hidden" />}
                        <span className="truncate">{copied ? 'Link copied' : 'Copy link'}</span>
                    </Button>
                    <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" aria-label={`More actions for ${image.displayName}`}>
                                <MoreHorizontal className="size-5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                                <a href={viewerHref} target="_blank" rel="noopener">
                                    <ExternalLink />
                                    Open
                                </a>
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => onShare(image)}>
                                <QrCode />
                                Show QR code
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => onRename(image)}>
                                <Pencil />
                                Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => onChangeLifetime(image)}>
                                <Clock />
                                Change lifetime
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => onDelete(image)}>
                                <Trash2 />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
            <span className="sr-only" aria-live="polite">
                {copied ? `Link to ${image.displayName} copied` : ''}
            </span>
        </article>
    );
}
