import { createClient } from 'redis';

if (!process.env.REDIS_PASSWORD) {
    console.error('REDIS_PASSWORD environment variable is not set');
    process.exit(1);
}

console.log('Redis URL:', process.env.REDIS_URL);
console.log('Redis Password:', process.env.REDIS_PASSWORD ? '****' : 'not set');

const redis = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6384',
    password: process.env.REDIS_PASSWORD,
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 10) {
                console.error('Redis connection failed after 10 retries');
                return new Error('Redis connection failed');
            }
            return Math.min(retries * 100, 3000);
        }
    }
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