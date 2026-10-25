'use client';

import { useEffect, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Logo from '@/components/Logo';

export default function LoginPage() {
    const router = useRouter();
    const { status } = useSession();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [credentials, setCredentials] = useState({ username: '', password: '' });

    useEffect(() => {
        if (status === 'authenticated') router.replace('/admin');
    }, [status, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const result = await signIn('credentials', {
                username: credentials.username,
                password: credentials.password,
                redirect: false,
            });

            if (result?.error) {
                setError('That username and password don’t match. Check them and try again.');
            } else {
                router.push('/admin');
                router.refresh();
            }
        } catch {
            setError('Couldn’t reach the server. Check your connection and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-dvh flex-col bg-background">
            <header className="mx-auto flex h-16 w-full max-w-[1120px] items-center px-4 sm:px-6">
                <div className="flex items-center gap-2.5 text-foreground">
                    <Logo />
                    <span className="text-xl font-semibold tracking-[-0.01em]">ImageSH</span>
                </div>
            </header>

            <main className="flex flex-1 items-center justify-center px-4 pt-6 pb-24">
                <form
                    onSubmit={handleSubmit}
                    className="flex w-full max-w-[360px] flex-col gap-5 rounded-lg border bg-card p-6 sm:p-8"
                >
                    <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.01em]">Sign in</h1>
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="username" className="text-sm font-medium">
                            Username
                        </label>
                        <Input
                            id="username"
                            type="text"
                            autoComplete="username"
                            autoFocus
                            required
                            value={credentials.username}
                            onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                            disabled={isLoading}
                            aria-describedby={error ? 'login-error' : undefined}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="password" className="text-sm font-medium">
                            Password
                        </label>
                        <Input
                            id="password"
                            type="password"
                            autoComplete="current-password"
                            required
                            value={credentials.password}
                            onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                            disabled={isLoading}
                            aria-invalid={!!error}
                            aria-describedby={error ? 'login-error' : undefined}
                        />
                    </div>
                    {error && (
                        <p id="login-error" role="alert" className="text-[13px] text-destructive">
                            {error}
                        </p>
                    )}
                    <Button type="submit" className="mt-1 w-full" disabled={isLoading}>
                        {isLoading && <Loader2 className="animate-spin" />}
                        {isLoading ? 'Signing in…' : 'Sign in'}
                    </Button>
                </form>
            </main>
        </div>
    );
}
