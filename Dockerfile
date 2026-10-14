FROM node:24-trixie-slim AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --legacy-peer-deps
RUN npm rebuild sharp

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Only public configuration belongs in the build. Dokploy supplies Redis,
# admin and NextAuth credentials as environment variables at runtime.
ARG NEXT_PUBLIC_MAX_FILE_SIZE=10485760
ENV NEXT_PUBLIC_MAX_FILE_SIZE=${NEXT_PUBLIC_MAX_FILE_SIZE}

# Set environment variables for Next.js
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the application
RUN npm run build

# Prepare permissions while build tools are available. Root owns the code so
# the runtime user cannot chmod it writable. Only Next.js's cache is writable.
RUN mkdir -p /runtime/.next \
    && cp -a /app/.next/standalone/. /runtime/ \
    && cp -a /app/.next/static /runtime/.next/static \
    && cp -a /app/public /runtime/public \
    && mkdir -p /runtime/.next/cache \
    && chown -R 0:0 /runtime \
    && chmod -R a-w /runtime \
    && chown 1001:1001 /runtime/.next/cache \
    && chmod 0700 /runtime/.next/cache

# Debian/glibc in both stages keeps Sharp's native binaries compatible.
# Distroless provides Node without a shell, npm, apt, curl or wget.
FROM gcr.io/distroless/nodejs24-debian13:nonroot AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    HOME=/tmp

COPY --from=builder /runtime/ ./

USER 1001:1001

EXPOSE 3000

# Distroless's entrypoint is /nodejs/bin/node; no shell is used to start the app.
CMD ["server.js"]
