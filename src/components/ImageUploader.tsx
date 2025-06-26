'use client';

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Upload, Clipboard, X } from 'lucide-react';
import { toast } from 'sonner';

interface UploadResponse {
    success: boolean;
    imageId?: string;
    shareUrl?: string;
    expiresAt?: string;
    error?: string;
}

export default function ImageUploader({ onUploadSuccess }: { onUploadSuccess: () => void }) {
    const [isUploading, setIsUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [expiration, setExpiration] = useState('1d');
    const [preview, setPreview] = useState<string | null>(null);
    const [customName, setCustomName] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFile = useCallback((file: File) => {
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            toast.error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.');
            return;
        }

        const maxSize = parseInt(process.env.NEXT_PUBLIC_MAX_FILE_SIZE || '10485760');
        if (file.size > maxSize) {
            toast.error(`File size exceeds ${maxSize / 1024 / 1024}MB limit`);
            return;
        }

        setSelectedFile(file);

        // Set default custom name to filename without extension
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        setCustomName(nameWithoutExt);

        // Create preview
        const reader = new FileReader();
        reader.onload = (e) => {
            setPreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const file = e.dataTransfer.files[0];
        if (file) {
            handleFile(file);
        }
    }, [handleFile]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                if (file) {
                    handleFile(file);
                    break;
                }
            }
        }
    }, [handleFile]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFile(file);
        }
    }, [handleFile]);

    const handleUpload = async () => {
        if (!selectedFile) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('expiration', expiration);
        if (customName.trim()) {
            formData.append('name', customName.trim());
        }

        try {
            const response = await fetch('/api/admin/upload', {
                method: 'POST',
                body: formData,
            });

            const data: UploadResponse = await response.json();

            if (data.success && data.shareUrl) {
                toast.success('Image uploaded successfully!');

                // Copy share URL to clipboard
                await navigator.clipboard.writeText(data.shareUrl);
                toast.success('Share URL copied to clipboard!');

                // Reset form
                setSelectedFile(null);
                setPreview(null);
                setExpiration('1d');
                setCustomName('');

                // Notify parent to refresh list
                onUploadSuccess();
            } else {
                toast.error(data.error || 'Upload failed');
            }
        } catch {
            toast.error('Upload failed. Please try again.');
        } finally {
            setIsUploading(false);
        }
    };

    const clearSelection = () => {
        setSelectedFile(null);
        setPreview(null);
        setCustomName('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <Card>
            <CardContent className="p-6">
                <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                        }`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onPaste={handlePaste}
                >
                    {!selectedFile ? (
                        <>
                            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                            <p className="text-lg font-medium mb-2">Upload an image</p>
                            <p className="text-sm text-gray-500 mb-4">
                                Drag and drop, paste from clipboard, or click to select
                            </p>
                            <div className="flex gap-2 justify-center">
                                <Button
                                    onClick={() => fileInputRef.current?.click()}
                                    variant="outline"
                                >
                                    Select File
                                </Button>
                                <Button
                                    onClick={async () => {
                                        try {
                                            const items = await navigator.clipboard.read();
                                            for (const item of items) {
                                                if (item.types.includes('image/png') || item.types.includes('image/jpeg')) {
                                                    const blob = await item.getType(item.types[0]);
                                                    const file = new File([blob], 'pasted-image.png', { type: blob.type });
                                                    handleFile(file);
                                                    break;
                                                }
                                            }
                                        } catch {
                                            toast.error('Failed to paste image');
                                        }
                                    }}
                                    variant="outline"
                                >
                                    <Clipboard className="h-4 w-4 mr-2" />
                                    Paste from Clipboard
                                </Button>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileSelect}
                            />
                        </>
                    ) : (
                        <div className="space-y-4">
                            <div className="relative inline-block">
                                {preview && (
                                    <img
                                        src={preview}
                                        alt="Preview"
                                        className="max-h-64 max-w-full rounded"
                                    />
                                )}
                                <button
                                    onClick={clearSelection}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            <p className="text-sm text-gray-600">{selectedFile.name}</p>
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center gap-2">
                                    <label htmlFor="custom-name" className="text-sm font-medium text-gray-700">
                                        Name:
                                    </label>
                                    <Input
                                        id="custom-name"
                                        type="text"
                                        value={customName}
                                        onChange={(e) => setCustomName(e.target.value)}
                                        placeholder="Enter a custom name for this image"
                                        className="flex-1"
                                    />
                                </div>
                                <div className="flex items-center gap-4 justify-center">
                                    <Select value={expiration} onValueChange={setExpiration}>
                                        <SelectTrigger className="w-48">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="2h">2 hours</SelectItem>
                                            <SelectItem value="1d">1 day</SelectItem>
                                            <SelectItem value="3d">3 days</SelectItem>
                                            <SelectItem value="7d">7 days</SelectItem>
                                            <SelectItem value="1m">1 month</SelectItem>
                                            <SelectItem value="3m">3 months</SelectItem>
                                            <SelectItem value="6m">6 months</SelectItem>
                                            <SelectItem value="1y">1 year</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Button onClick={handleUpload} disabled={isUploading}>
                                        {isUploading ? 'Uploading...' : 'Upload'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
} 