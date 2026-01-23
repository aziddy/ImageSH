'use client';

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Printer } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

interface QRCodeViewProps {
    id: string;
}

export default function QRCodeView({ id }: QRCodeViewProps) {
    const router = useRouter();
    const [imageUrl, setImageUrl] = useState<string>('');

    useEffect(() => {
        setImageUrl(`${window.location.origin}/api/i/${id}`);
    }, [id]);

    const handlePrint = () => {
        window.print();
    };

    if (!imageUrl) {
        return (
            <div className="container mx-auto py-8">
                <div className="flex items-center justify-center min-h-[200px]">
                    <p className="text-gray-500">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-8">
            <div className="flex gap-2 mb-4 print:hidden">
                <Button
                    variant="outline"
                    onClick={() => router.back()}
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                </Button>
                <Button
                    variant="outline"
                    onClick={handlePrint}
                >
                    <Printer className="h-4 w-4 mr-2" />
                    Print QR Code
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-1">
                <Card className="print:shadow-none print:border-none">
                    <CardHeader className="print:hidden">
                        <CardTitle>QR Code</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center gap-4 print:p-0">
                        <div className="bg-white p-4 rounded-lg print:p-0">
                            <QRCodeSVG
                                value={imageUrl}
                                size={256}
                                level="H"
                                includeMargin={true}
                            />
                        </div>
                        <p className="text-sm text-gray-500 break-all text-center print:hidden">
                            {imageUrl}
                        </p>
                    </CardContent>
                </Card>

                <Card className="print:hidden">
                    <CardHeader>
                        <CardTitle>Image Preview</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center gap-4">
                        <div className="relative w-full aspect-square max-w-md">
                            <Image
                                src={imageUrl}
                                alt="Image preview"
                                fill
                                className="object-contain rounded-lg"
                                unoptimized
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <style jsx global>{`
                @media print {
                    body {
                        margin: 0;
                        padding: 0;
                    }
                    @page {
                        margin: 0;
                        size: auto;
                    }
                }
            `}</style>
        </div>
    );
}
