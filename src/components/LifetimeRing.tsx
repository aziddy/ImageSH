import { cn } from '@/lib/utils';
import type { LifetimeLevel } from '@/lib/format';

const RADIUS = 8.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const levelStroke: Record<LifetimeLevel, string> = {
    fresh: 'stroke-lifetime-fresh',
    waning: 'stroke-lifetime-waning',
    last: 'stroke-lifetime-last',
};

/**
 * A ring that drains as an image ages. It stays ink-coloured while more than
 * a day is left, then turns amber, then red in the last two hours.
 */
export default function LifetimeRing({
    fraction,
    level,
    size = 20,
    className,
}: {
    fraction: number;
    level: LifetimeLevel;
    size?: number;
    className?: string;
}) {
    const filled = Math.max(0, Math.min(1, fraction)) * CIRCUMFERENCE;

    return (
        <svg
            aria-hidden="true"
            width={size}
            height={size}
            viewBox="0 0 20 20"
            className={cn('shrink-0 -rotate-90', className)}
        >
            <circle cx="10" cy="10" r={RADIUS} fill="none" strokeWidth="3" className="stroke-lifetime-track" />
            {filled > 0 && (
                <circle
                    cx="10"
                    cy="10"
                    r={RADIUS}
                    fill="none"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
                    className={levelStroke[level]}
                />
            )}
        </svg>
    );
}
