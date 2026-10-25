'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

const subscribe = () => () => {};

export default function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    // The theme is only known in the browser; render a neutral button on the server.
    const mounted = useSyncExternalStore(subscribe, () => true, () => false);
    const isDark = mounted && resolvedTheme === 'dark';

    return (
        <Button
            variant="outline"
            size="icon"
            aria-label={mounted ? (isDark ? 'Switch to light theme' : 'Switch to dark theme') : 'Switch theme'}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
        >
            {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </Button>
    );
}
