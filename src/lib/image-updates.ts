import type getRedis from '@/lib/redis';
import type { ImageData } from '@/lib/format';

// Read and merge inside Redis so a concurrent rename/lifetime change cannot be
// overwritten, and an upload deleted or expired during the request stays gone.
const UPDATE_IMAGE = `
local raw = redis.call('GET', KEYS[1])
local length = redis.call('STRLEN', KEYS[2])
if not raw or length == 0 then return 0 end
local valid, image = pcall(cjson.decode, raw)
if not valid or type(image) ~= 'table' or image.id ~= ARGV[2] then return 1 end
local patch = cjson.decode(ARGV[1])
if patch.expiresAt then
    if image.uploadedAt ~= patch.uploadedAt then return 3 end
    local time = redis.call('TIME')
    local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
    if patch.expiresAtMs <= now then return 2 end
    image.expiresAt = patch.expiresAt
end
if patch.name then
    image.customName = patch.name
    image.displayName = patch.name
end
-- Match the decoded byte count used by listing/downloading, including legacy
-- base64 values without the BINARY: prefix. Never transfer the image itself.
local prefix = redis.call('GETRANGE', KEYS[2], 0, 6)
local suffix = redis.call('GETRANGE', KEYS[2], -2, -1)
if prefix == 'BINARY:' then length = length - 7 end
local padding = 0
if suffix == '==' then padding = 2
elseif string.sub(suffix, -1) == '=' then padding = 1 end
image.size = math.floor(length * 3 / 4) - padding
local updated = cjson.encode(image)
redis.call('SET', KEYS[1], updated, 'XX', 'KEEPTTL')
if patch.expiresAt then
    redis.call('PEXPIREAT', KEYS[1], patch.expiresAtMs)
    redis.call('PEXPIREAT', KEYS[2], patch.expiresAtMs)
end
return updated
`;

interface ImagePatch {
    name?: string;
    uploadedAt?: string;
    expiresAt?: string;
    expiresAtMs?: number;
}

type UpdateResult =
    | { status: 200; imageData: ImageData }
    | { status: 400 | 404 | 409 | 500; error: string };

export async function applyImageUpdate(
    redis: Awaited<ReturnType<typeof getRedis>>,
    imageId: string,
    patch: ImagePatch,
): Promise<UpdateResult> {
    const result = await redis.eval(UPDATE_IMAGE, {
        keys: [`image:${imageId}:data`, `image:${imageId}:binary`],
        arguments: [JSON.stringify(patch), imageId],
    });
    switch (result) {
        case 0: return { status: 404, error: 'This image has expired or was deleted.' };
        case 1: return { status: 500, error: 'Invalid image data format' };
        case 2: return { status: 400, error: 'Choose a lifetime that expires in the future.' };
        case 3: return { status: 409, error: 'The image changed. Refresh and try again.' };
        default:
            if (typeof result !== 'string') throw new Error('Unexpected Redis update response');
            return { status: 200, imageData: JSON.parse(result) as ImageData };
    }
}
