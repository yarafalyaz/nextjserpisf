# Use Node.js as the builder
FROM node:26-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy the rest of the application code
COPY src/ ./src/
COPY public/ ./public/
COPY prisma/ ./prisma/
COPY next.config.ts tsconfig.json postcss.config.mjs next-env.d.ts eslint.config.js prisma.config.ts ./

# Generate Prisma Client
ENV DATABASE_URL="mysql://build:build@localhost:3306/build"
RUN npx prisma generate

# Build the Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
RUN NODE_ENV=production npm run build

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
COPY --from=builder --chown=root:root --chmod=755 /app/node_modules ./node_modules
COPY --from=builder --chown=root:root --chmod=755 /app/prisma.config.ts ./

# Create cache directory and set ownership
RUN mkdir -p .next/cache && chown -R nextjs:nodejs .next/cache

# Switch to non-root user
USER nextjs

EXPOSE 3000

# Start the application running migrations first
CMD ["sh", "-c", "npx prisma db push && node server.js"]
