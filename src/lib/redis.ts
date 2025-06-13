import { createClient } from 'redis';

if (!process.env.REDIS_PASSWORD) {
	console.error('REDIS_PASSWORD environment variable is not set');
	process.exit(1);
}

console.log('Redis URL:', process.env.REDIS_URL);
console.log('Redis Password:', process.env.REDIS_PASSWORD ? '****' : 'not set');

let redisClient: ReturnType<typeof createClient> | null = null;

/*
	Lazy Initizalization, because NextJS Build Process Runs 
	Modules before Whole App is Ready
*/
const getRedisClient = () => {
	if (!redisClient) {
		redisClient = createClient({
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

		redisClient.on('error', (err) => console.error('Redis Client Error', err));
	}
	return redisClient;
};

// Ensure connection is established
const connectRedis = async () => {
	const client = getRedisClient();
	if (!client.isOpen) {
		await client.connect();
	}
	return client;
};

// Helper function to set with expiration
export const setWithExpiry = async (key: string, value: string, ttl: number) => {
	const client = await connectRedis();
	await client.set(key, value, { EX: ttl });
};

// Export a function that ensures connection
export default async function getRedis() {
	return await connectRedis();
} 