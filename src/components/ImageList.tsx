'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Copy, ExternalLink, Clock } from 'lucide-react';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

interface ImageData {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    uploadedAt: string;
    uploadedBy: string;
    expiresAt: string;
}

export default function ImageList({ refreshKey }: { refreshKey: number }) {
    const [images, setImages] = useState<ImageData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [deleteDialog, setDeleteDialog] = useState<{
        open: boolean;
        imageId: string | null;
        imageName: string | null;
    }>({ open: false, imageId: null, imageName: null });

    const fetchImages = async () => {
        try {
            const response = await fetch('/api/admin/images');
            const data = await response.json();
            setImages(data.images || []);
        } catch {
            toast.error('Failed to load images');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchImages();
    }, [refreshKey]);

    const copyUrl = async (imageId: string) => {
        const url = `${window.location.origin}/i/${imageId}`;
        await navigator.clipboard.writeText(url);
        toast.success('URL copied to clipboard!');
    };

    const openImage = (imageId: string) => {
        window.open(`/i/${imageId}`, '_blank');
    };

    const deleteImage = async () => {
        if (!deleteDialog.imageId) return;

        try {
            const response = await fetch(`/api/admin/images/${deleteDialog.imageId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                toast.success('Image deleted successfully');
                fetchImages();
            } else {
                toast.error('Failed to delete image');
            }
        } catch {
            toast.error('Failed to delete image');
        } finally {
            setDeleteDialog({ open: false, imageId: null, imageName: null });
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString();
    };

    const getTimeRemaining = (expiresAt: string) => {
        const now = new Date().getTime();
        const expiry = new Date(expiresAt).getTime();
        const diff = expiry - now;

        if (diff <= 0) return 'Expired';

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        if (days > 0) {
            return `${days}d ${hours}h remaining`;
        }
        return `${hours}h remaining`;
    };

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Uploaded Images</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-gray-500">Loading images...</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Uploaded Images ({images.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {images.length === 0 ? (
                        <p className="text-gray-500">No images uploaded yet.</p>
                    ) : (
                        <div className="space-y-4">
                            {images.map((image) => (
                                <div
                                    key={image.id}
                                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                                >
                                    <div className="flex-1">
                                        <p className="font-medium">{image.originalName}</p>
                                        <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                                            <span>{formatFileSize(image.size)}</span>
                                            <span>Uploaded {formatDate(image.uploadedAt)}</span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {getTimeRemaining(image.expiresAt)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => copyUrl(image.id)}
                                        >
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => openImage(image.id)}
                                        >
                                            <ExternalLink className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-red-600 hover:text-red-700"
                                            onClick={() =>
                                                setDeleteDialog({
                                                    open: true,
                                                    imageId: image.id,
                                                    imageName: image.originalName,
                                                })
                                            }
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog
                open={deleteDialog.open}
                onOpenChange={(open) =>
                    setDeleteDialog({ open, imageId: null, imageName: null })
                }
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Image</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete &quot;{deleteDialog.imageName}&quot;? This
                            action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() =>
                                setDeleteDialog({ open: false, imageId: null, imageName: null })
                            }
                        >
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={deleteImage}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
} 