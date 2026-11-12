'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import LifetimeSelect from '@/components/LifetimeSelect';
import { useNow } from '@/hooks/useNow';
import { formatDateTime, type ImageData } from '@/lib/format';
import { expirationFor, matchingLifetime } from '@/lib/lifetimes';

interface LifetimeEditorProps {
    image: ImageData;
    onClose: () => void;
    onUpdated: (image: ImageData) => void;
    onMissing: () => void;
}

export default function LifetimeEditor({ image, onClose, onUpdated, onMissing }: LifetimeEditorProps) {
    const router = useRouter();
    const current = matchingLifetime(image.uploadedAt, image.expiresAt);
    const [lifetime, setLifetime] = useState<string>(current ?? '');
    const [saving, setSaving] = useState(false);
    const [missing, setMissing] = useState(false);
    const [error, setError] = useState('');
    const now = useNow();
    const proposed = expirationFor(image.uploadedAt, lifetime);
    const valid = now !== null && Number.isFinite(proposed) && proposed > now && Date.parse(image.expiresAt) > now;

    const save = async () => {
        if (saving || missing || !lifetime || lifetime === current) return;
        if (!Number.isFinite(proposed) || proposed <= Date.now()) {
            setError('Choose a lifetime that expires in the future.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const response = await fetch(`/api/admin/images/${image.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expiration: lifetime }),
            });
            if (response.status === 401 || (response.redirected && new URL(response.url).pathname === '/login')) {
                await signOut({ redirect: false });
                router.replace('/login');
                return;
            }
            const data = await response.json();
            if (!response.ok) {
                if (response.status === 404) { setMissing(true); onMissing(); }
                setError(data.error || 'Couldn’t change the lifetime. Try again.');
                return;
            }
            onUpdated(data.imageData);
        } catch {
            setError('Couldn’t change the lifetime. Check your connection and try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
                <form className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); save(); }}>
                    <DialogHeader>
                        <DialogTitle>Change lifetime</DialogTitle>
                        <DialogDescription>
                            Measured from the original upload date. Your share link stays the same.
                        </DialogDescription>
                    </DialogHeader>
                    <p className="truncate font-medium" title={image.displayName}>{image.displayName}</p>
                    <dl className="grid gap-3 text-sm">
                        <div><dt className="text-muted-foreground">Uploaded</dt><dd>{formatDateTime(image.uploadedAt)}</dd></div>
                        <div><dt className="text-muted-foreground">Current expiration</dt><dd>{formatDateTime(image.expiresAt)}</dd></div>
                    </dl>
                    <div className="flex flex-col gap-2">
                        <label htmlFor="edit-lifetime" className="text-sm font-medium">Lives for</label>
                        <LifetimeSelect
                            id="edit-lifetime" value={lifetime} disabled={saving || missing}
                            onChange={(value) => { setLifetime(value); setError(''); }}
                            uploadedAt={image.uploadedAt} now={now ?? 0}
                        />
                        <p className="text-sm text-muted-foreground">Durations that would already have expired are unavailable.</p>
                    </div>
                    {Number.isFinite(proposed) && (
                        <div className="text-sm" aria-live="polite">
                            <p className="text-muted-foreground">New expiration</p>
                            <p>{formatDateTime(new Date(proposed).toISOString())}</p>
                        </div>
                    )}
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                        <Button type="submit" disabled={saving || missing || !valid || lifetime === current}>
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
