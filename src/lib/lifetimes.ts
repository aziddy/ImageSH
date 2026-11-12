export const LIFETIMES = [
    { value: '2h', label: '2 hours', seconds: 2 * 60 * 60 },
    { value: '1d', label: '1 day', seconds: 24 * 60 * 60 },
    { value: '3d', label: '3 days', seconds: 3 * 24 * 60 * 60 },
    { value: '7d', label: '7 days', seconds: 7 * 24 * 60 * 60 },
    { value: '1m', label: '1 month', seconds: 30 * 24 * 60 * 60 },
    { value: '3m', label: '3 months', seconds: 90 * 24 * 60 * 60 },
    { value: '6m', label: '6 months', seconds: 180 * 24 * 60 * 60 },
    { value: '1y', label: '1 year', seconds: 365 * 24 * 60 * 60 },
] as const;

export type LifetimeValue = (typeof LIFETIMES)[number]['value'];

export function getLifetimeOption(value: unknown) {
    return LIFETIMES.find((option) => option.value === value);
}

export function expirationFor(uploadedAt: string, value: string): number {
    const option = getLifetimeOption(value);
    return option ? Date.parse(uploadedAt) + option.seconds * 1000 : NaN;
}

export function matchingLifetime(uploadedAt: string, expiresAt: string): LifetimeValue | undefined {
    const duration = Date.parse(expiresAt) - Date.parse(uploadedAt);
    return LIFETIMES.find((option) => Math.abs(option.seconds * 1000 - duration) <= 1000)?.value;
}
