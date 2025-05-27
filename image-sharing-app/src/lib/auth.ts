import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

declare module 'next-auth' {
    interface User {
        id: string;
    }
    interface Session {
        user: {
            id: string;
            name?: string | null;
            email?: string | null;
            image?: string | null;
        };
    }
}

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: 'credentials',
            credentials: {
                username: { label: 'Username', type: 'text' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.username || !credentials?.password) {
                    return null;
                }

                const adminUsername = process.env.ADMIN_USERNAME;
                const adminPassword = process.env.ADMIN_PASSWORD;

                if (!adminUsername || !adminPassword) {
                    console.error('Admin credentials not configured');
                    return null;
                }

                // Check if username matches
                if (credentials.username !== adminUsername) {
                    return null;
                }

                // In production, the admin password should be hashed in the env variable
                // For simplicity, we're comparing plain text here
                const isValidPassword = credentials.password === adminPassword;

                if (!isValidPassword) {
                    return null;
                }

                return {
                    id: '1',
                    name: adminUsername,
                    email: `${adminUsername}@imageshare.local`,
                };
            },
        }),
    ],
    session: {
        strategy: 'jwt',
    },
    pages: {
        signIn: '/login',
    },
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
            }
            return token;
        },
        async session({ session, token }) {
            if (token && session.user) {
                session.user.id = token.id as string;
            }
            return session;
        },
    },
    secret: process.env.NEXTAUTH_SECRET,
}; 