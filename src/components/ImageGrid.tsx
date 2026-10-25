'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ImageCard from '@/components/ImageCard';
import { useNow } from '@/hooks/useNow';
import { shareUrlFor, type ImageData } from '@/lib/format';

type SortOrder = 'newest' | 'expiring' | 'name';

const SORTERS: Record<SortOrder, (a: ImageData, b: ImageData) => number> = {
    newest: (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
    expiring: (a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(),
    name: (a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base', numeric: true }),
};

interface ImageGridProps {
    refreshKey: number;
    onShare: (image: ImageData) => void;
}

export default function ImageGrid({ refreshKey, onShare }: ImageGridProps) {
    const [images, setImages] = useState<ImageData[]>([]);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [sort, setSort] = useState<SortOrder>('newest');
    const [renameTarget, setRenameTarget] = useState<ImageData | null>(null);
    const [newName, setNewName] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<ImageData | null>(null);
    const [isWorking, setIsWorking] = useState(false);
    const [fetchedAt, setFetchedAt] = useState(0);
    const tick = useNow();
    // Countdowns tick every 30 seconds; also resync right after each fetch so new uploads read correctly.
    const now = Math.max(tick ?? 0, fetchedAt);

    const fetchImages = useCallback(async () => {
        try {
            const response = await fetch('/api/admin/images');
            if (!response.ok) throw new Error(`Status ${response.status}`);
            const data = await response.json();
            setImages(data.images || []);
            setFetchedAt(Date.now());
            setStatus('ready');
        } catch {
            setStatus('error');
        }
    }, []);

    useEffect(() => {
        // Load on mount and again after each upload.
        fetchImages();
    }, [fetchImages, refreshKey]);

    const sorted = useMemo(() => [...images].sort(SORTERS[sort]), [images, sort]);

    const copyLink = useCallback(
        async (image: ImageData) => {
            try {
                await navigator.clipboard.writeText(shareUrlFor(image.id));
                return true;
            } catch {
                // Clipboard blocked (for example on an insecure origin); the share sheet lets them copy by hand.
                onShare(image);
                return false;
            }
        },
        [onShare]
    );

    const openRename = useCallback((image: ImageData) => {
        setNewName(image.displayName);
        setRenameTarget(image);
    }, []);

    const rename = async () => {
        if (!renameTarget || !newName.trim()) return;
        setIsWorking(true);
        try {
            const response = await fetch(`/api/admin/images/${renameTarget.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim() }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => null);
                toast.error(data?.error ? `${data.error}.` : 'Couldn’t rename the image. Try again.');
                return;
            }
            toast.success(`Renamed to ${newName.trim()}`);
            setRenameTarget(null);
            fetchImages();
        } catch {
            toast.error('Couldn’t rename the image. Check your connection and try again.');
        } finally {
            setIsWorking(false);
        }
    };

    const remove = async () => {
        if (!deleteTarget) return;
        setIsWorking(true);
        try {
            const response = await fetch(`/api/admin/images/${deleteTarget.id}`, { method: 'DELETE' });
            if (!response.ok) {
                toast.error('Couldn’t delete the image. Try again.');
                return;
            }
            toast.success(`Deleted ${deleteTarget.displayName}`);
            setImages((current) => current.filter((image) => image.id !== deleteTarget.id));
            setDeleteTarget(null);
        } catch {
            toast.error('Couldn’t delete the image. Check your connection and try again.');
        } finally {
            setIsWorking(false);
        }
    };

    return (
        <section aria-labelledby="live-heading" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 id="live-heading" className="flex items-baseline gap-2 text-xl leading-tight font-semibold">
                    Live images
                    {status === 'ready' && (
                        <span className="font-normal text-muted-foreground tabular-nums">{images.length}</span>
                    )}
                </h1>
                {status === 'ready' && images.length > 1 && (
                    <div className="flex items-center gap-2">
                        <label htmlFor="sort-images" className="text-sm text-muted-foreground">
                            Sort
                        </label>
                        <Select value={sort} onValueChange={(value) => setSort(value as SortOrder)}>
                            <SelectTrigger id="sort-images" className="w-44">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent align="end">
                                <SelectItem value="newest">Newest first</SelectItem>
                                <SelectItem value="expiring">Expiring soonest</SelectItem>
                                <SelectItem value="name">Name</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>

            {status === 'loading' && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4" aria-busy="true" aria-label="Loading images">
                    {Array.from({ length: 4 }, (_, index) => (
                        <div key={index} className="flex flex-col overflow-hidden rounded-lg border bg-card">
                            <div className="aspect-square bg-muted motion-safe:animate-pulse" />
                            <div className="flex flex-col gap-2 p-3">
                                <div className="h-4 w-3/4 rounded bg-muted motion-safe:animate-pulse" />
                                <div className="h-3.5 w-1/2 rounded bg-muted motion-safe:animate-pulse" />
                                <div className="mt-1 h-10 rounded-lg bg-muted motion-safe:animate-pulse" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {status === 'error' && (
                <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                    <p className="text-base font-medium">Couldn’t load your images.</p>
                    <p className="text-muted-foreground">Check that the server can reach Redis, then try again.</p>
                    <Button variant="outline" onClick={() => { setStatus('loading'); fetchImages(); }}>
                        Try again
                    </Button>
                </div>
            )}

            {status === 'ready' && images.length === 0 && (
                <div className="flex flex-col items-center gap-3 px-6 py-[72px] text-center">
                    <ImageOff className="size-10 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                    <p className="text-base font-medium">Nothing here yet.</p>
                    <p className="text-muted-foreground">Drop an image above to get a link.</p>
                </div>
            )}

            {status === 'ready' && images.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
                    {sorted.map((image) => (
                        <ImageCard
                            key={image.id}
                            image={image}
                            now={now}
                            onCopy={copyLink}
                            onShare={onShare}
                            onRename={openRename}
                            onDelete={setDeleteTarget}
                        />
                    ))}
                </div>
            )}

            <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
                <DialogContent className="sm:max-w-md">
                    <form
                        className="flex flex-col gap-5"
                        onSubmit={(e) => {
                            e.preventDefault();
                            rename();
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>Rename image</DialogTitle>
                            <DialogDescription>
                                People who open the link see this name. The link itself doesn’t change.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="rename-input" className="text-sm font-medium">
                                Name
                            </label>
                            <Input
                                id="rename-input"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                autoComplete="off"
                                autoFocus
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setRenameTarget(null)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isWorking || !newName.trim()}>
                                Rename
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="break-words">Delete {deleteTarget?.displayName}?</DialogTitle>
                        <DialogDescription>
                            The link stops working right away for everyone. This can’t be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={remove} disabled={isWorking}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    );
}
