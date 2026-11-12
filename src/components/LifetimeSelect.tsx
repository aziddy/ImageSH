'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { expirationFor, LIFETIMES } from '@/lib/lifetimes';

interface LifetimeSelectProps {
    value: string;
    onChange: (value: string) => void;
    id?: string;
    uploadedAt?: string;
    now?: number;
    disabled?: boolean;
}

export default function LifetimeSelect({ value, onChange, id = 'lifetime', uploadedAt, now = 0, disabled }: LifetimeSelectProps) {
    return (
        <Select value={value} onValueChange={onChange} disabled={disabled}>
            <SelectTrigger id={id} className="w-36">
                <SelectValue placeholder="Choose a duration" />
            </SelectTrigger>
            <SelectContent>
                {LIFETIMES.map((option) => (
                    <SelectItem
                        key={option.value}
                        value={option.value}
                        disabled={uploadedAt !== undefined && expirationFor(uploadedAt, option.value) <= now}
                    >
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
