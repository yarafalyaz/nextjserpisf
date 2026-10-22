# Use Node.js as the builder
FROM node:26-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy the rest of the application code
# `next-env.d.ts` is gitignored (Next regenerates it during build/dev), so a
# COPY of it breaks every fresh-checkout build. It stays out of this list.
COPY src/ ./src/
COPY public/ ./public/
COPY prisma/ ./prisma/
COPY scripts/pre-migrate-column-audit.mjs ./scripts/pre-migrate-column-audit.mjs
COPY next.config.ts tsconfig.json tsconfig.build.json postcss.config.mjs eslint.config.mjs prisma.config.ts ./

# Generate Prisma Client (local binary — no npx registry fetch)
ENV DATABASE_URL="mysql://build:***@localhost:3306/build"
RUN ./node_modules/.bin/prisma generate

# Fail fast with a clear error when the Tailwind stylesheet entry cannot be
# read by the build (npm ci is run with --ignore-scripts, so a file-mode or
# umask problem in the layer would surface later as a cryptic EACCES from
# Turbopack instead of this).
RUN test -r /app/node_modules/tailwindcss/index.css

# Build the Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
RUN NODE_ENV=production npm run build \
  && npm prune --omit=dev

# Use a smaller Node.js image for production
FROM node:26-alpine AS runner

WORKDIR /app

# Install required system packages and create non-root user
RUN apk add --no-cache libc6-compat tzdata && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Define environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy build output owned by root with read-only permissions
COPY --from=builder --chown=root:root --chmod=644 /app/package.json ./
COPY --from=builder --chown=root:root --chmod=755 /app/.next/standalone ./
COPY --from=builder --chown=root:root --chmod=755 /app/.next/static ./.next/static
COPY --from=builder --chown=root:root --chmod=755 /app/public ./public
COPY --from=builder --chown=root:root --chmod=755 /app/prisma ./prisma
COPY --from=builder --chown=root:root --chmod=755 /app/scripts ./scripts
COPY --from=builder --chown=root:root --chmod=755 /app/node_modules ./node_modules
COPY --from=builder --chown=root:root --chmod=755 /app/prisma.config.ts ./

# Create cache directory and set ownership
RUN mkdir -p .next/cache && chown -R nextjs:nodejs .next/cache

# Switch to non-root user
USER nextjs

EXPOSE 3000

# Start the application only. Schema changes run in the one-shot `migrate`
# service (docker-compose.prod.yml), never on every container boot — a
# restart must not rewrite the production schema, and a failed migration
# must stop the release instead of booting a half-migrated app.
CMD ["sh", "-c", "node server.js"]
