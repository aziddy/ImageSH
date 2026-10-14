# Security Hardening: Cryptominer Remediation

## Incident

A cryptominer process (`XXfIkGAA`) was found running inside the Docker container (`longerthanweekviewgooglecalendar-frontend-or79kl`) on the VPS as the `nextjs` user. Source code was clean — the compromise occurred at the build or runtime level, not in the repository.

## Changes Made

### 1. Dockerfile — `npm ci --ignore-scripts`

Disables dependency lifecycle scripts during installation. Sharp is explicitly rebuilt separately. This reduces build risk, but dependencies and the Next.js build still execute code. The miner's user account alone does not establish whether the entry point was a build dependency or a runtime vulnerability.

The original `chmod -R a-w /app` removed write permissions, but the `nextjs` user still owned the files and could restore them with `chmod`. The current Dockerfile makes application files root-owned as well.

### 2. Security Middleware — `middleware.ts`

Added Next.js middleware that:
- **Strips the `x-middleware-subrequest` header** from all incoming requests (defense-in-depth against CVE-2025-29927, which allows bypassing Next.js middleware)
- **Adds security response headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`

> Note: Next.js 16 has deprecated `middleware.ts` in favor of the `proxy` convention. Migrate when ready.

### 3. Pinned Next.js Version — `package.json`

Originally changed from `"next": "^15.1.6"` to `"next": "16.1.6"` (exact version, no caret) to keep upgrades deliberate. `npm ci` installs the versions recorded in the lockfile.

The current hardening update advances that pin to `16.3.8`, updates the matching ESLint configuration, and patches NextAuth, Sharp, Multer, Nano ID and affected transitive production dependencies. A pinned version still needs regular security updates. `npm audit --omit=dev` reported zero known production dependency vulnerabilities after these updates on 2026-10-12.

### 4. Security Headers & Config — `next.config.ts`

- Disabled `poweredByHeader` (removes `X-Powered-By: Next.js`)
- Added security headers as a second layer (in case middleware is bypassed)

## Manual VPS Steps Required

1. Stop and delete the compromised container and image
2. Rotate credentials: Google OAuth client secret, `NEXTAUTH_SECRET`, SSH keys
3. Check for persistence: `crontab -l`, `/etc/cron.d/`, `~/.bashrc`, `~/.profile`
4. Rebuild image from clean source and redeploy
5. Run `npm audit` and address vulnerabilities

## Current Dockerfile hardening for Dokploy

Keep the existing Git provider and **Dockerfile** build type. No production Compose file is required.

The build uses Node.js 24 on Debian 13 and copies only the standalone application into a matching distroless Node.js runtime. The production image has no shell, npm, OS package manager, curl or wget. It runs as UID/GID `1001:1001`. Application files are owned by root with write permissions removed, so the application user cannot change the code or restore its write permissions. `/app/.next/cache` remains writable for Next.js.

Redis, admin and NextAuth settings must be configured in Dokploy's **Environment** tab and supplied at runtime: `REDIS_URL`, `REDIS_PASSWORD`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `NEXTAUTH_SECRET`, and `NEXTAUTH_URL` (the public HTTPS origin). The Dockerfile no longer accepts them as build arguments or saves them in image environment metadata. Only the public `NEXT_PUBLIC_MAX_FILE_SIZE` setting is a build argument; its default is `10485760`. Use the same value at runtime if setting it explicitly.

Leave the start-command override empty: the image's Node entrypoint starts `server.js` directly. Shell-based terminal sessions, run commands and health checks will not work in this image. For a health check, use an exec-form command with `/nodejs/bin/node`, for example:

```json
["CMD", "/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/login').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
```

### Enforcing a read-only root filesystem

A Dockerfile cannot enforce Docker's read-only root mount, capability restrictions, or resource limits. Dokploy Applications use Swarm; the current documented Swarm settings do not expose these container options. They can be applied to the existing application service from an SSH session on the VPS (a Swarm manager), after deploying the hardened image.

Find the application service name first:

```bash
docker service ls --format '{{.Name}}'
```

Replace `YOUR_IMAGESH_SERVICE` with that exact application service name. This restarts its tasks and applies a read-only root filesystem, drops Linux capabilities, limits processes, and gives Next.js bounded temporary mounts. Images continue to be stored in your existing Redis instance.

```bash
docker service update \
  --read-only \
  --cap-drop ALL \
  --init \
  --limit-pids 128 \
  --mount-add type=tmpfs,destination=/tmp,tmpfs-size=67108864,tmpfs-mode=1777 \
  --mount-add type=tmpfs,destination=/app/.next/cache,tmpfs-size=134217728,tmpfs-mode=1777 \
  YOUR_IMAGESH_SERVICE
```

Set CPU and memory limits through Dokploy's resource settings to suit the VPS and image-processing load. These limits reduce resource abuse but do not stop an exploit.

Manual Swarm changes are outside Dokploy's saved application configuration and can be overwritten by redeployments. Recheck and reapply them after each Dokploy deployment. Verify the effective settings without printing credentials:

```bash
docker service inspect YOUR_IMAGESH_SERVICE --format \
  'readOnly={{.Spec.TaskTemplate.ContainerSpec.ReadOnly}} capDrop={{json .Spec.TaskTemplate.ContainerSpec.CapabilityDrop}} mounts={{json .Spec.TaskTemplate.ContainerSpec.Mounts}} pids={{.Spec.TaskTemplate.Resources.Limits.Pids}}'
```

Read-only files and a shell-free image limit common downloaded payloads and code modification. They do not prevent malicious JavaScript from executing in Node, reading runtime secrets, accessing Redis, or making network requests after an application compromise. Patched application dependencies are still required.

### Validation

The image was built and smoke-tested locally on Linux/arm64. Image-default checks confirmed UID/GID 1001, root-owned application files, denied code writes and permission changes, a writable cache, and absent shell/package/download tools. A container launched with Docker's read-only, capability-drop and no-new-privileges options plus bounded `noexec` temporary mounts passed login/session, protected-route, upload, download, image optimization, list, rename, delete, public image and QR-page checks against a disposable Redis instance. These tests did not change the production VPS or apply the manual Swarm command there.

References: [Distroless images](https://github.com/GoogleContainerTools/distroless), [Dokploy Application settings](https://docs.dokploy.com/docs/core/applications/advanced), and [Docker Swarm service options](https://docs.docker.com/reference/cli/docker/service/update/).
