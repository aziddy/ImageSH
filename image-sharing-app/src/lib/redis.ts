import { createClient } from 'redis';

const redis = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6384',
});

redis.on('error', (err) => console.error('Redis Client Error', err));

// Ensure connection is established
const connectRedis = async () => {
    if (!redis.isOpen) {
        await redis.connect();
    }
    return redis;
};

// Initialize connection
connectRedis().catch(console.error);

// Helper function to set with expiration
export const setWithExpiry = async (key: string, value: string, ttl: number) => {
    const client = await connectRedis();
    await client.set(key, value, { EX: ttl });
};

export default redis; 