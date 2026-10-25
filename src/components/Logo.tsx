import { cn } from '@/lib/utils';

export default function Logo({ className }: { className?: string }) {
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={cn('size-6 shrink-0', className)}>
            <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2" />
            <rect x="8" y="8" width="8" height="8" rx="1.5" fill="currentColor" />
        </svg>
    );
}
