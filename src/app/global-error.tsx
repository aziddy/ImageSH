'use client';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html lang="en">
            <body>
                <div style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#f3f3f3',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem', color: '#171717' }}>
                            Something went wrong
                        </h1>
                        <p style={{ color: '#6f6f6f', marginBottom: '1rem' }}>
                            ImageSH hit an error it couldn’t recover from. Try again, or reload the page.
                        </p>
                        {error.digest && (
                            <p style={{ fontSize: '0.75rem', color: '#6f6f6f', marginBottom: '1rem' }}>
                                Error ID: {error.digest}
                            </p>
                        )}
                        <button
                            onClick={reset}
                            style={{
                                padding: '0.625rem 1rem',
                                backgroundColor: '#2448e6',
                                color: 'white',
                                borderRadius: '0.5rem',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                fontWeight: 500
                            }}
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            </body>
        </html>
    );
}
