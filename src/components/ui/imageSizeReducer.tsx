'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface ImageSizeReducerProps {
    file: File;
    onResizedFile: (resizedFile: File | null, percentage: number) => void;
}

interface ImageDimensions {
    width: number;
    height: number;
}

export function ImageSizeReducer({ file, onResizedFile }: ImageSizeReducerProps) {
    const [percentage, setPercentage] = useState(100);
    const [originalDimensions, setOriginalDimensions] = useState<ImageDimensions | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const sliderRef = useRef<HTMLInputElement>(null);

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };

    const estimateFileSize = (width: number, height: number, originalSize: number): number => {
        // Rough estimation: file size is roughly proportional to pixel count
        const originalPixels = originalDimensions ? originalDimensions.width * originalDimensions.height : 1;
        const newPixels = width * height;
        const ratio = newPixels / originalPixels;
        return Math.round(originalSize * ratio);
    };

    const handleResize = useCallback(async (scalePercent: number, img: HTMLImageElement, dimensions: ImageDimensions) => {
        if (!canvasRef.current) return;

        setIsProcessing(true);

        try {
            const canvas = canvasRef.current;
            const newWidth = Math.round((dimensions.width * scalePercent) / 100);
            const newHeight = Math.round((dimensions.height * scalePercent) / 100);

            canvas.width = newWidth;
            canvas.height = newHeight;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Use high-quality image rendering
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            // Draw resized image
            ctx.drawImage(img, 0, 0, newWidth, newHeight);

            // Convert canvas to blob
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        // Create a new File from the blob
                        const resizedFile = new File([blob], file.name, {
                            type: file.type,
                            lastModified: Date.now(),
                        });
                        onResizedFile(resizedFile, scalePercent);
                    } else {
                        onResizedFile(null, scalePercent);
                    }
                    setIsProcessing(false);
                },
                file.type || 'image/png',
                0.92 // Quality for JPEG/WebP (PNG ignores this)
            );
        } catch (error) {
            console.error('Error resizing image:', error);
            onResizedFile(null, scalePercent);
            setIsProcessing(false);
        }
    }, [file, onResizedFile]);

    // Load image and get original dimensions
    useEffect(() => {
        const loadImage = async () => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const dimensions = { width: img.width, height: img.height };
                    setOriginalDimensions(dimensions);
                    imageRef.current = img;
                    // Trigger initial resize
                    handleResize(100, img, dimensions);
                };
                img.src = e.target?.result as string;
            };
            reader.readAsDataURL(file);
        };

        loadImage();
    }, [file, handleResize]);

    // Resize image when percentage changes
    useEffect(() => {
        if (imageRef.current && originalDimensions) {
            handleResize(percentage, imageRef.current, originalDimensions);
        }
    }, [percentage, originalDimensions, handleResize]);

    // Update track background gradient when percentage changes
    useEffect(() => {
        if (sliderRef.current) {
            const gradient = `linear-gradient(to right, rgb(37 99 235) 0%, rgb(37 99 235) ${percentage}%, rgb(229 231 235) ${percentage}%, rgb(229 231 235) 100%)`;
            sliderRef.current.style.setProperty('--track-bg', gradient);
        }
    }, [percentage]);

    const handlePercentageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value);
        setPercentage(value);
    };

    if (!originalDimensions) {
        return (
            <div className="text-sm text-gray-500">
                Loading image dimensions...
            </div>
        );
    }

    const newWidth = Math.round((originalDimensions.width * percentage) / 100);
    const newHeight = Math.round((originalDimensions.height * percentage) / 100);
    const estimatedSize = estimateFileSize(newWidth, newHeight, file.size);

    // Calculate progress bar width to align with thumb center
    // Range inputs position thumb center accounting for thumb width (1rem = 16px)
    // The thumb center is at: thumbRadius + (percentage - min) / (max - min) * (trackWidth - 2*thumbRadius)
    // For our case: 0.5rem + (percentage - 25) / 75 * (100% - 1rem)
    const thumbRadius = 0.5; // 0.5rem = 8px (half of 1rem thumb)
    const min = 25;
    const max = 100;
    const range = max - min;
    const normalizedPercentage = (percentage - min) / range;
    const progressWidth = `calc(${thumbRadius}rem + ${normalizedPercentage * 100}% * (100% - ${thumbRadius * 2}rem) / 100%)`;

    return (
        <div className="space-y-3 p-4 border border-gray-200 rounded-lg bg-white shadow-sm">
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <Label htmlFor="resize-slider" className="text-sm font-semibold text-gray-900">
                        Resize Image
                    </Label>
                    <span className="text-sm font-medium text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">
                        {percentage}%
                    </span>
                </div>
                <div className="space-y-2">
                    <div className="relative h-6 flex items-center">
                        <Input
                            ref={sliderRef}
                            id="resize-slider"
                            type="range"
                            min="25"
                            max="100"
                            step="5"
                            value={percentage}
                            onChange={handlePercentageChange}
                            className="relative w-full h-2 appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed z-10 bg-transparent [&::-webkit-slider-track]:h-2 [&::-webkit-slider-track]:rounded-lg [&::-webkit-slider-track]:bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:mt-[-4px] [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-lg [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-600 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:border-none"
                            disabled={isProcessing}
                        />
                        {/* Background track */}
                        <div 
                            className="absolute left-0 h-2 rounded-lg pointer-events-none"
                            style={{
                                width: '100%',
                                backgroundColor: 'rgb(229 231 235)',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                zIndex: 0
                            }}
                        />
                        {/* Progress bar - calculated to align with thumb center */}
                        <div 
                            className="absolute left-0 h-2 rounded-lg pointer-events-none"
                            style={{
                                width: progressWidth,
                                backgroundColor: 'rgb(37 99 235)',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                zIndex: 1
                            }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 px-1">
                        <span>25%</span>
                        <span>50%</span>
                        <span>75%</span>
                        <span>100%</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                <div className="space-y-1">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Original</div>
                    <div className="space-y-0.5 text-sm">
                        <div className="font-medium text-gray-900">{originalDimensions.width} × {originalDimensions.height} px</div>
                        <div className="text-gray-600">{formatFileSize(file.size)}</div>
                    </div>
                </div>
                <div className="space-y-1">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Resized</div>
                    <div className="space-y-0.5 text-sm">
                        <div className="font-medium text-gray-900">{newWidth} × {newHeight} px</div>
                        <div className="text-gray-600">{formatFileSize(estimatedSize)}</div>
                    </div>
                </div>
            </div>

            {isProcessing && (
                <div className="text-xs text-blue-600 flex items-center gap-1.5">
                    <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                </div>
            )}

            {/* Hidden canvas for image processing */}
            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
}

