'use client';

import { useSyncExternalStore } from 'react';

// One shared clock for every countdown on the page, refreshed every 30 seconds.
const INTERVAL_MS = 30_000;
let current = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
    listeners.add(listener);
    current = Date.now();
    if (timer === undefined) {
        timer = setInterval(() => {
            current = Date.now();
            listeners.forEach((notify) => notify());
        }, INTERVAL_MS);
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer !== undefined) {
            clearInterval(timer);
            timer = undefined;
        }
    };
}

function getSnapshot() {
    if (!current) current = Date.now();
    return current;
}

/**
 * The current time, or null during server rendering and hydration. Rendering time-based
 * output only on the client keeps server and client HTML identical.
 */
export function useNow(): number | null {
    return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
