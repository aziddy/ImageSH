'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';

export default function AppHeader() {
    const router = useRouter();

    const handleSignOut = async () => {
        await signOut({ redirect: false });
        router.push('/login');
    };

    return (
        <header className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between gap-4 px-4 sm:px-6">
            <Link href="/admin" className="flex items-center gap-2.5 rounded-lg text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                <Logo />
                <span className="text-xl font-semibold tracking-[-0.01em]">ImageSH</span>
            </Link>
            <div className="flex items-center gap-2">
                <ThemeToggle />
                <Button variant="outline" onClick={handleSignOut}>
                    Sign out
                </Button>
            </div>
        </header>
    );
}
