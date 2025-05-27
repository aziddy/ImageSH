'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import ImageUploader from '@/components/ImageUploader';
import ImageList from '@/components/ImageList';
import { LogOut } from 'lucide-react';

export default function AdminPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [refreshKey, setRefreshKey] = useState(0);

    if (status === 'loading') {
        return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
    }

    if (status === 'unauthenticated') {
        router.push('/login');
        return null;
    }

    const handleUploadSuccess = () => {
        setRefreshKey((prev) => prev + 1);
    };

    const handleLogout = async () => {
        await signOut({ redirect: false });
        router.push('/login');
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Image Share Admin</h1>
                        <p className="text-gray-600 mt-1">Welcome, {session?.user?.name}</p>
                    </div>
                    <Button variant="outline" onClick={handleLogout}>
                        <LogOut className="h-4 w-4 mr-2" />
                        Logout
                    </Button>
                </div>

                <div className="space-y-8">
                    <ImageUploader onUploadSuccess={handleUploadSuccess} />
                    <ImageList refreshKey={refreshKey} />
                </div>
            </div>
        </div>
    );
} 