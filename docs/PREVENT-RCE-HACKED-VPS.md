# Security Hardening: Cryptominer Remediation

## Incident

A cryptominer process (`XXfIkGAA`) was found running inside the Docker container (`longerthanweekviewgooglecalendar-frontend-or79kl`) on the VPS as the `nextjs` user. Source code was clean — the compromise occurred at the build or runtime level, not in the repository.

## Changes Made

### 1. Dockerfile — `npm ci --ignore-scripts`

Prevents malicious postinstall/preinstall scripts from transitive npm dependencies from executing during the Docker build. This is the most likely attack vector since the miner ran as the `nextjs` user created during the build.

Also added `chmod -R a-w /app` before switching to the `nextjs` user, making the app filesystem read-only to prevent runtime file writes.

### 2. Security Middleware — `middleware.ts`

Added Next.js middleware that:
- **Strips the `x-middleware-subrequest` header** from all incoming requests (defense-in-depth against CVE-2025-29927, which allows bypassing Next.js middleware)
- **Adds security response headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`

> Note: Next.js 16 has deprecated `middleware.ts` in favor of the `proxy` convention. Migrate when ready.

### 3. Pinned Next.js Version — `package.json`

Changed from `"next": "^15.1.6"` to `"next": "16.1.6"` (exact version, no caret) to prevent `npm ci` from resolving to a different or vulnerable version.

### 4. Security Headers & Config — `next.config.ts`

- Disabled `poweredByHeader` (removes `X-Powered-By: Next.js`)
- Added security headers as a second layer (in case middleware is bypassed)

## Manual VPS Steps Required

1. Stop and delete the compromised container and image
2. Rotate credentials: Google OAuth client secret, `NEXTAUTH_SECRET`, SSH keys
3. Check for persistence: `crontab -l`, `/etc/cron.d/`, `~/.bashrc`, `~/.profile`
4. Rebuild image from clean source and redeploy
5. Run `npm audit` and address vulnerabilities
