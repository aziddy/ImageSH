// An isolated HTTPS frontend for testing the real Next.js routes from iOS Simulator.
// Requires a disposable Redis on 127.0.0.1:16384; never uses .env.local credentials.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { request } from 'node:http';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = resolve(root, 'ios/.build/integration');
mkdirSync(directory, { recursive: true });
const key = resolve(directory, 'localhost-key.pem');
const cert = resolve(directory, 'localhost-cert.pem');
const generated = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
  '-keyout', key, '-out', cert, '-subj', '/CN=localhost',
  '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
  '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'extendedKeyUsage=serverAuth'], { stdio: 'ignore' });
if (generated.status !== 0) throw new Error('Could not create the local test certificate');

const next = spawn(process.execPath, [resolve(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3317'], {
  cwd: root, stdio: 'inherit', env: {
    ...process.env, NEXTAUTH_URL: 'https://localhost:3443', NEXTAUTH_SECRET: randomBytes(32).toString('hex'),
    ADMIN_USERNAME: 'ios-qa', ADMIN_PASSWORD: 'imagesh-integration-only',
    REDIS_URL: 'redis://127.0.0.1:16384', REDIS_PASSWORD: 'imagesh-integration-only', NEXT_PUBLIC_MAX_FILE_SIZE: '10485760',
  },
});
const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (incoming, outgoing) => {
  const upstream = request({ hostname: '127.0.0.1', port: 3317, path: incoming.url, method: incoming.method, headers: incoming.headers }, response => {
    outgoing.writeHead(response.statusCode, response.headers);
    response.pipe(outgoing);
  });
  upstream.on('error', () => { outgoing.writeHead(502); outgoing.end('Test backend is starting'); });
  incoming.pipe(upstream);
});
server.listen(3443, '127.0.0.1', () => console.log('iOS test origin: https://localhost:3443 (disposable test account only)'));
function stop() { server.close(); next.kill('SIGTERM'); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
next.on('exit', code => { server.close(); process.exitCode = code ?? 0; });
