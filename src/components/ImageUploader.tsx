'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ClipboardPaste, Download, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImageSizeReducer, type ImageDimensions } from '@/components/ui/imageSizeReducer';
import type { CopyState } from '@/components/ShareSheet';
import { cn } from '@/lib/utils';
import { formatFileSize, shareUrlFor, type ImageData } from '@/lib/format';

const VALID_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE = parseInt(process.env.NEXT_PUBLIC_MAX_FILE_SIZE || '10485760', 10);
const MAX_SIZE_LABEL = formatFileSize(MAX_SIZE);

const LIFETIMES = [
    { value: '2h', label: '2 hours' },
    { value: '1d', label: '1 day' },
    { value: '3d', label: '3 days' },
    { value: '7d', label: '7 days' },
    { value: '1m', label: '1 month' },
    { value: '3m', label: '3 months' },
    { value: '6m', label: '6 months' },
    { value: '1y', label: '1 year' },
];

interface UploadResponse {
    success: boolean;
    imageId?: string;
    expiresAt?: string;
    image?: ImageData;
    error?: string;
}

const noopSubscribe = () => () => {};
const canReadClipboard = () => typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function';

function LifetimeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger id="lifetime" className="w-36">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {LIFETIMES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export default function ImageUploader({
    onUploaded,
}: {
    onUploaded: (image: ImageData, copyState: CopyState) => void;
}) {
    const [lifetime, setLifetime] = useState('1d');
    const [file, setFile] = useState<File | null>(null);
    const [name, setName] = useState('');
    const [dimensions, setDimensions] = useState<ImageDimensions | null>(null);
    const [resized, setResized] = useState<{ file: File | null; percentage: number }>({ file: null, percentage: 100 });
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [resizedPreviewUrl, setResizedPreviewUrl] = useState<string | null>(null);
    const [reduceOpen, setReduceOpen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const canPaste = useSyncExternalStore(noopSubscribe, canReadClipboard, () => false);

    // Release preview URLs when they are replaced or the uploader unmounts.
    useEffect(() => () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
    }, [previewUrl]);
    useEffect(() => () => {
        if (resizedPreviewUrl) URL.revokeObjectURL(resizedPreviewUrl);
    }, [resizedPreviewUrl]);

    const clear = useCallback(() => {
        setFile(null);
        setName('');
        setDimensions(null);
        setResized({ file: null, percentage: 100 });
        setPreviewUrl(null);
        setResizedPreviewUrl(null);
        setReduceOpen(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, []);

    const handleFile = useCallback((incoming: File) => {
        if (!VALID_TYPES.includes(incoming.type)) {
            toast.error('That file type isn’t supported. Use a JPEG, PNG, GIF, or WebP image.');
            return;
        }
        setFile(incoming);
        setName(incoming.name.replace(/\.[^/.]+$/, '') || incoming.name);
        setDimensions(null);
        setResized({ file: null, percentage: 100 });
        setPreviewUrl(URL.createObjectURL(incoming));
        setResizedPreviewUrl(null);
        // Oversized images can still be shared once they're scaled down, so open the size controls.
        setReduceOpen(incoming.size > MAX_SIZE);
    }, []);

    // Paste works anywhere on the page, except while typing in a field.
    useEffect(() => {
        const onPaste = (event: ClipboardEvent) => {
            if (isUploading) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest('input, textarea, [contenteditable="true"]')) return;
            const item = Array.from(event.clipboardData?.items ?? []).find(
                (entry) => entry.kind === 'file' && entry.type.startsWith('image/')
            );
            const pasted = item?.getAsFile();
            if (pasted) {
                event.preventDefault();
                handleFile(pasted);
            }
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [handleFile, isUploading]);

    const pasteFromClipboard = async () => {
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const type = item.types.find((t) => VALID_TYPES.includes(t)) ?? item.types.find((t) => t.startsWith('image/'));
                if (type) {
                    const blob = await item.getType(type);
                    handleFile(new File([blob], `pasted-image.${type.split('/')[1]}`, { type }));
                    return;
                }
            }
            toast.error('There’s no image on your clipboard. Copy an image first, then paste.');
        } catch {
            toast.error('Your browser didn’t allow pasting from a button. Press Ctrl+V or ⌘V on this page instead.');
        }
    };

    const handleResized = useCallback((resizedFile: File | null, percentage: number) => {
        setResized({ file: resizedFile, percentage });
        setResizedPreviewUrl(resizedFile ? URL.createObjectURL(resizedFile) : null);
    }, []);

    const dragHandlers = {
        onDragEnter: (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(true);
        },
        onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        },
        onDragLeave: (e: React.DragEvent) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            setIsDragging(false);
        },
        onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            const dropped = e.dataTransfer.files[0];
            if (dropped) handleFile(dropped);
        },
    };

    const fileInput = (
        <input
            ref={fileInputRef}
            type="file"
            accept={VALID_TYPES.join(',')}
            className="hidden"
            onChange={(e) => {
                const chosen = e.target.files?.[0];
                if (chosen) handleFile(chosen);
                e.target.value = '';
            }}
        />
    );

    const uploadFile = resized.percentage < 100 ? resized.file : file;
    const tooBig = !!uploadFile && uploadFile.size > MAX_SIZE;

    const upload = async () => {
        if (!file || !uploadFile || isUploading || tooBig) return;
        setIsUploading(true);

        const formData = new FormData();
        formData.append('file', uploadFile);
        formData.append('expiration', lifetime);
        if (name.trim()) formData.append('name', name.trim());

        try {
            const response = await fetch('/api/admin/upload', { method: 'POST', body: formData });
            let data: UploadResponse | null = null;
            try {
                data = await response.json();
            } catch {
                // Non-JSON error page; fall through to the status-based message.
            }

            if (!response.ok || !data?.success || !data.imageId || !data.image) {
                const reason = data?.error;
                toast.error(
                    reason
                        ? `${reason}${reason.endsWith('.') ? '' : '.'}`
                        : response.ok
                          ? 'The server returned incomplete image details. Refresh the library before retrying.'
                          : `Upload failed with status ${response.status}. Try again.`
                );
                return;
            }

            const image = data.image;

            let copyState: CopyState = 'failed';
            try {
                await navigator.clipboard.writeText(shareUrlFor(image.id));
                copyState = 'copied';
            } catch {
                // Some browsers (iOS Safari) block clipboard writes after an await; the share sheet covers it.
            }

            clear();
            onUploaded(image, copyState);
        } catch {
            toast.error('Upload failed. Check your connection and try again.');
        } finally {
            setIsUploading(false);
        }
    };

    if (!file) {
        return (
            <section
                aria-label="Upload an image"
                {...dragHandlers}
                className={cn(
                    'flex min-h-[152px] flex-wrap items-center gap-x-6 gap-y-4 rounded-lg border border-dashed border-dropzone bg-card p-5 transition-colors sm:p-7',
                    isDragging && 'border-primary bg-primary/5'
                )}
            >
                <div className="hidden size-12 shrink-0 items-center justify-center rounded-full bg-muted sm:flex">
                    <Download className="size-6" aria-hidden="true" />
                </div>
                <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-2.5">
                    <p className="text-base font-medium">
                        {isDragging ? 'Drop to add this image' : 'Drop, paste, or choose an image'}
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                        <label htmlFor="lifetime" className="text-sm text-muted-foreground">
                            Lives for
                        </label>
                        <LifetimeSelect value={lifetime} onChange={setLifetime} />
                        <span className="text-[13px] text-muted-foreground">
                            JPEG, PNG, GIF, or WebP up to {MAX_SIZE_LABEL}
                        </span>
                    </div>
                </div>
                <div className="flex gap-2 max-sm:w-full">
                    {canPaste && (
                        <Button variant="outline" onClick={pasteFromClipboard} className="max-sm:flex-1">
                            <ClipboardPaste />
                            Paste
                        </Button>
                    )}
                    <Button onClick={() => fileInputRef.current?.click()} className="max-sm:flex-1">
                        Choose file
                    </Button>
                </div>
                {fileInput}
            </section>
        );
    }

    const shownPreview = resized.percentage < 100 && resizedPreviewUrl ? resizedPreviewUrl : previewUrl;

    return (
        <section
            aria-label="Image ready to upload"
            {...dragHandlers}
            className={cn(
                'flex flex-col gap-6 rounded-lg border bg-card p-4 transition-colors sm:p-6 md:flex-row',
                isDragging && 'border-primary bg-primary/5'
            )}
        >
            <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="aspect-[4/3] overflow-hidden rounded-lg bg-muted">
                    {shownPreview && (
                        <img
                            src={shownPreview}
                            alt={`Preview of ${file.name}`}
                            className="size-full object-contain"
                            style={{ imageRendering: resized.percentage < 100 ? 'pixelated' : 'auto' }}
                        />
                    )}
                </div>
                <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground tabular-nums">
                    <span className="min-w-0 truncate" title={`${file.name}, ${file.size} bytes`}>
                        Original: {file.name}
                        {dimensions && `, ${dimensions.width} × ${dimensions.height}`}, {formatFileSize(file.size)}
                    </span>
                    <Button variant="outline" size="sm" onClick={clear} disabled={isUploading}>
                        Remove
                    </Button>
                </div>
            </div>

            <form
                className="flex min-w-0 flex-1 flex-col gap-4"
                onSubmit={(e) => {
                    e.preventDefault();
                    upload();
                }}
            >
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="image-name" className="text-sm font-medium">
                        Name
                    </label>
                    <Input
                        id="image-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Shown to people you share with"
                        autoComplete="off"
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="lifetime" className="text-sm font-medium">
                        Lives for
                    </label>
                    <LifetimeSelect value={lifetime} onChange={setLifetime} />
                </div>
                <details
                    open={reduceOpen}
                    onToggle={(e) => setReduceOpen(e.currentTarget.open)}
                    className="border-t pt-3"
                >
                    <summary className="cursor-pointer rounded-md text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                        Reduce size{resized.percentage < 100 && ` (${resized.percentage}%)`}
                    </summary>
                    <div className="pt-3">
                        <ImageSizeReducer
                            key={previewUrl}
                            file={file}
                            onResizedFile={handleResized}
                            onDimensions={setDimensions}
                            disabled={isUploading}
                        />
                    </div>
                </details>
                {tooBig && uploadFile && (
                    <p role="alert" className="text-[13px] text-destructive">
                        This image is {formatFileSize(uploadFile.size)}. The limit is {MAX_SIZE_LABEL}, so reduce its
                        size above before uploading.
                    </p>
                )}
                <div className="mt-auto flex gap-2 pt-2">
                    <Button type="submit" disabled={isUploading || !uploadFile || tooBig}>
                        {isUploading ? <Loader2 className="animate-spin" /> : <Upload />}
                        {isUploading ? 'Uploading…' : 'Upload'}
                    </Button>
                    <Button type="button" variant="outline" onClick={clear} disabled={isUploading}>
                        Cancel
                    </Button>
                </div>
            </form>
            {fileInput}
        </section>
    );
}
