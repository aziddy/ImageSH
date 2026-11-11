const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type LifetimeLevel = 'fresh' | 'waning' | 'last';

export interface ImageData {
    id: string;
    originalName: string;
    customName?: string | null;
    displayName: string;
    mimeType: string;
    size: number;
    uploadedAt: string;
    uploadedBy: string;
    expiresAt: string;
}

export function formatFileSize(bytes: number): string {
    // Decimal units and up to two decimal places match the iOS app.
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1000 && unit < units.length - 1) {
        value /= 1000;
        unit++;
    }
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, useGrouping: false }).format(value)} ${units[unit]}`;
}

/**
 * How much of an image's life is left, and how urgent that is.
 * Under two hours is "last" and under a day is "waning", but only once the image
 * is past the halfway point. Otherwise every default 1-day upload would start amber
 * and every 2-hour upload would start red.
 */
export function getLifetime(uploadedAt: string, expiresAt: string, now: number = Date.now()) {
    const start = new Date(uploadedAt).getTime();
    const end = new Date(expiresAt).getTime();
    const remaining = Math.max(0, end - now);
    const total = Math.max(1, end - start);
    const fraction = Number.isFinite(remaining / total) ? Math.min(1, remaining / total) : 0;
    const pastHalfway = fraction <= 0.5;
    let level: LifetimeLevel = 'fresh';
    if (pastHalfway && remaining <= 2 * HOUR) level = 'last';
    else if (pastHalfway && remaining <= DAY) level = 'waning';
    return { remaining, fraction, level, expired: remaining <= 0 };
}

/** Compact countdown for cards: "29d left", "6d 4h left", "20h left", "1h 10m left". */
export function formatTimeLeft(remaining: number): string {
    if (remaining <= 0) return 'Expired';
    if (remaining < MINUTE) return 'Under a minute left';

    const days = Math.floor(remaining / DAY);
    const hours = Math.floor((remaining % DAY) / HOUR);
    const minutes = Math.floor((remaining % HOUR) / MINUTE);

    if (days >= 7) return `${days}d left`;
    if (days >= 1) return hours > 0 ? `${days}d ${hours}h left` : `${days}d left`;
    if (hours >= 2) return `${hours}h left`;
    if (hours >= 1) return minutes > 0 ? `${hours}h ${minutes}m left` : `${hours}h left`;
    return `${minutes}m left`;
}

/** Plain-language countdown for people viewing a shared image: "Gone in 6 days". */
export function formatGoneIn(remaining: number): string {
    if (remaining <= 0) return 'Expired';
    const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
    const days = Math.floor(remaining / DAY);
    if (days >= 1) return `Gone in ${plural(days, 'day')}`;
    const hours = Math.floor(remaining / HOUR);
    if (hours >= 1) return `Gone in ${plural(hours, 'hour')}`;
    const minutes = Math.floor(remaining / MINUTE);
    if (minutes >= 1) return `Gone in ${plural(minutes, 'minute')}`;
    return 'Gone in under a minute';
}

/** "Oct 28, 2026 at 4:12 PM" */
export function formatDateTime(iso: string): string {
    const date = new Date(iso);
    const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${day} at ${time}`;
}

export function shareUrlFor(imageId: string): string {
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    return `${origin}/i/${imageId}`;
}
