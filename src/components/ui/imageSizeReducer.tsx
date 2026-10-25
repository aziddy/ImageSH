'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatFileSize } from '@/lib/format';

interface ImageSizeReducerProps {
    file: File;
    /** Called with the resized file, or null when the original should be used (100%). */
    onResizedFile: (resizedFile: File | null, percentage: number) => void;
    onDimensions?: (dimensions: ImageDimensions) => void;
}

export interface ImageDimensions {
    width: number;
    height: number;
}

const ENCODABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function ImageSizeReducer({ file, onResizedFile, onDimensions }: ImageSizeReducerProps) {
    const [percentage, setPercentage] = useState(100);
    const [dimensions, setDimensions] = useState<ImageDimensions | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [resizedSize, setResizedSize] = useState<number | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    // Each resize gets an id so a slow, older result never overwrites a newer one.
    const requestRef = useRef(0);

    useEffect(() => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            imageRef.current = img;
            const next = { width: img.naturalWidth, height: img.naturalHeight };
            setDimensions(next);
            onDimensions?.(next);
        };
        img.src = url;
        return () => {
            img.onload = null;
            URL.revokeObjectURL(url);
        };
    }, [file, onDimensions]);

    const resize = useCallback(
        (scalePercent: number) => {
            const img = imageRef.current;
            const canvas = canvasRef.current;
            if (!img || !canvas || !dimensions) return;

            const request = ++requestRef.current;

            if (scalePercent >= 100) {
                setIsProcessing(false);
                setResizedSize(null);
                onResizedFile(null, 100);
                return;
            }

            setIsProcessing(true);
            const width = Math.max(1, Math.round((dimensions.width * scalePercent) / 100));
            const height = Math.max(1, Math.round((dimensions.height * scalePercent) / 100));
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                setIsProcessing(false);
                onResizedFile(null, scalePercent);
                return;
            }
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);

            // Canvas can't encode GIF, so animated or not, a resized GIF becomes a PNG.
            const outputType = ENCODABLE_TYPES.includes(file.type) ? file.type : 'image/png';
            // Quality 0.85 matches the server's sharp settings, so the size shown is close to the final one.
            canvas.toBlob(
                (blob) => {
                    if (request !== requestRef.current) return;
                    setIsProcessing(false);
                    if (!blob) {
                        setResizedSize(null);
                        onResizedFile(null, scalePercent);
                        return;
                    }
                    setResizedSize(blob.size);
                    onResizedFile(
                        new File([blob], file.name, { type: blob.type || outputType, lastModified: Date.now() }),
                        scalePercent
                    );
                },
                outputType,
                0.85
            );
        },
        [dimensions, file, onResizedFile]
    );

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value, 10);
        setPercentage(value);
        setResizedSize(null);
        resize(value);
    };

    const mightBeHeicConverted =
        file.type === 'image/jpeg' &&
        (/^img_/i.test(file.name) || /iphone|ipad/i.test(typeof navigator === 'undefined' ? '' : navigator.userAgent));

    let summary = 'Reading image size…';
    if (dimensions) {
        const width = Math.round((dimensions.width * percentage) / 100);
        const height = Math.round((dimensions.height * percentage) / 100);
        if (percentage === 100) {
            summary = `Full size, ${dimensions.width} × ${dimensions.height} px, ${formatFileSize(file.size)}.`;
        } else {
            const estimate = Math.round(file.size * ((width * height) / (dimensions.width * dimensions.height)));
            const size = resizedSize !== null ? formatFileSize(resizedSize) : `about ${formatFileSize(estimate)}`;
            summary = `${width} × ${height} px, ${size}. The server compresses it a little more.`;
        }
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
                <label htmlFor="resize-slider" className="text-sm text-muted-foreground">
                    Scale
                </label>
                <span className="text-sm font-medium tabular-nums">{percentage}%</span>
            </div>
            <input
                id="resize-slider"
                type="range"
                min={25}
                max={100}
                step={5}
                value={percentage}
                onChange={handleChange}
                disabled={!dimensions}
                className="h-6 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-[13px] text-muted-foreground tabular-nums" aria-live="polite">
                {isProcessing ? 'Resizing…' : summary}
            </p>
            {mightBeHeicConverted && (
                <p className="text-[13px] text-muted-foreground">
                    iPhone photos arrive as JPEG and can be larger than the original. Reducing the size helps.
                </p>
            )}
            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
}
