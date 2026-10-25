'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

const noopSubscribe = () => () => {};

export default function QRCodeView({ id }: { id: string }) {
    // The share link uses this site's own address, which is only known in the browser.
    const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => '');
    const link = origin ? `${origin}/i/${id}` : '';

    return (
        <div className="min-h-dvh bg-background text-foreground print:bg-white print:text-black">
            <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6 print:hidden">
                <Button variant="outline" asChild>
                    <Link href="/admin">
                        <ArrowLeft />
                        Back to images
                    </Link>
                </Button>
                <Button onClick={() => window.print()} disabled={!link}>
                    <Printer />
                    Print QR code
                </Button>
            </div>

            <main className="flex flex-col items-center gap-4 px-4 py-12 text-center print:py-0">
                <div className="rounded-2xl border bg-white p-6 print:border-0 print:p-0">
                    {link ? (
                        <QRCodeSVG value={link} size={280} level="H" marginSize={2} fgColor="#171717" bgColor="#FFFFFF" title="QR code for the shared image" />
                    ) : (
                        <div className="size-[280px]" aria-hidden="true" />
                    )}
                </div>
                <p className="text-lg font-medium">Scan to open the image</p>
                <p className="max-w-[44ch] text-sm break-all text-muted-foreground print:text-black">{link}</p>
            </main>
        </div>
    );
}
