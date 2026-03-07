import { withAuth } from 'next-auth/middleware';
import { NextRequest, NextResponse } from 'next/server';

const adminMatcher = ['/admin', '/api/admin'];

function isAdminRoute(pathname: string): boolean {
    return adminMatcher.some(
        (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
    );
}

function addSecurityHeaders(response: NextResponse): NextResponse {
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set(
        'Referrer-Policy',
        'strict-origin-when-cross-origin'
    );
    return response;
}

const authMiddleware = withAuth(
    function middleware() {
        return NextResponse.next();
    },
    {
        callbacks: {
            authorized: ({ token }) => !!token,
        },
    }
);

export default async function middleware(request: NextRequest) {
    // Strip x-middleware-subrequest header (CVE-2025-29927 defense)
    request.headers.delete('x-middleware-subrequest');

    if (isAdminRoute(request.nextUrl.pathname)) {
        // Cast needed because withAuth expects NextApiRequest-like types
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const authResponse = await (authMiddleware as any)(request, undefined);
        if (authResponse) {
            return addSecurityHeaders(authResponse);
        }
        return authResponse;
    }

    return addSecurityHeaders(NextResponse.next());
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
