# Use Node.js as the builder
FROM node:26-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies (pnpm: repo memakai pnpm-lock.yaml. Sebelumnya Dockerfile
# menyalin package-lock.json yang TIDAK ada di repo -> build image selalu gagal.)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# corepack DIHAPUS dari distribusi Node >=24 (image node:26-alpine tidak
# menyediakannya), jadi pnpm dipasang lewat npm global, bukan corepack.
RUN npm install -g --ignore-scripts pnpm@12.21.0 \
  && pnpm install --frozen-lockfile --ignore-scripts

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
# read by the build (pnpm install runs with --ignore-scripts, so a file-mode or
# umask problem in the layer would surface later as a cryptic EACCES from
# Turbopack instead of this).
RUN test -r /app/node_modules/tailwindcss/index.css

# Build the Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
RUN NODE_ENV=production pnpm run build

# Assemble a minimal node_modules tree for `migrate` without running
# `pnpm install --prod`: pnpm >=12 drops `prisma` (devDependency) and relinks
# `@prisma/client` to the peerless store slot lacking `.prisma/client`.
# Copying only the `.pnpm` transitive closure of `prisma`, `@prisma/client`,
# `@prisma/adapter-mariadb`, `mariadb`, and `dotenv` preserves `.bin/prisma`,
# `@prisma/adapter-mariadb`, and generated `.prisma/client` without `tailwindcss`.
RUN node -e ' \
  const fs = require("node:fs"); \
  const path = require("node:path"); \
  const nm = "/app/node_modules"; \
  const pnpm = path.join(nm, ".pnpm"); \
  const out = "/app/migrate-node-modules"; \
  const outPnpm = path.join(out, ".pnpm"); \
  fs.mkdirSync(outPnpm, { recursive: true }); \
  const seen = new Set(); \
  const queue = ["prisma", "@prisma/client", "@prisma/adapter-mariadb", "mariadb", "dotenv"].map((p) => path.join(nm, p)); \
  while (queue.length > 0) { \
    const cur = queue.shift(); \
    if (!fs.existsSync(cur)) continue; \
    const real = fs.realpathSync(cur); \
    const rel = path.relative(pnpm, real); \
    if (rel.startsWith("..")) continue; \
    const entry = rel.split(path.sep)[0]; \
    if (seen.has(entry)) continue; \
    seen.add(entry); \
    const modDir = path.join(pnpm, entry, "node_modules"); \
    if (!fs.existsSync(modDir)) continue; \
    for (const name of fs.readdirSync(modDir)) { \
      if (name === ".bin" || name === ".prisma") continue; \
      if (name.startsWith("@")) { \
        for (const sub of fs.readdirSync(path.join(modDir, name))) { \
          queue.push(path.join(modDir, name, sub)); \
        } \
      } else { \
        queue.push(path.join(modDir, name)); \
      } \
    } \
  } \
  for (const entry of seen) { \
    fs.cpSync(path.join(pnpm, entry), path.join(outPnpm, entry), { recursive: true, verbatimSymlinks: true }); \
  } \
  fs.mkdirSync(path.join(out, "@prisma"), { recursive: true }); \
  for (const pkg of ["prisma", "@prisma/client", "@prisma/adapter-mariadb", "mariadb", "dotenv"]) { \
    const src = path.join(nm, pkg); \
    if (fs.existsSync(src)) fs.symlinkSync(fs.readlinkSync(src), path.join(out, pkg)); \
  } \
  fs.mkdirSync(path.join(out, ".bin"), { recursive: true }); \
  fs.cpSync(path.join(nm, ".bin", "prisma"), path.join(out, ".bin", "prisma"), { verbatimSymlinks: true }); \
'

# Dedicated migration target (retains `./node_modules/.bin/prisma` + generated `.prisma/client`)
FROM node:26-alpine AS migrate

WORKDIR /app

RUN apk add --no-cache libc6-compat tzdata && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

ENV NODE_ENV=production

COPY --from=builder --chown=root:root --chmod=644 /app/package.json ./
COPY --from=builder --chown=root:root --chmod=755 /app/prisma ./prisma
COPY --from=builder --chown=root:root --chmod=755 /app/scripts ./scripts
COPY --from=builder --chown=root:root --chmod=755 /app/prisma.config.ts ./
COPY --from=builder --chown=root:root --chmod=755 /app/migrate-node-modules ./node_modules

USER nextjs

CMD ["sh", "-c", "node scripts/pre-migrate-column-audit.mjs && ./node_modules/.bin/prisma migrate deploy"]

# Use a smaller Node.js image for production
FROM node:26-alpine AS runner

WORKDIR /app

# Install required system packages and create non-root user
RUN apk add --no-cache libc6-compat mysql-client tzdata && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Define environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy migrate deps first, then `.next/standalone` so standalone's traced
# `node_modules` and generated `.prisma/client` symlink are never overwritten by
# a broken peerless `--prod` install, while `./node_modules/.bin/prisma` and
# `@prisma/adapter-mariadb` stay available for `docker-compose.prod.yml`'s
# `migrate` service using the same image.
COPY --from=builder --chown=root:root --chmod=644 /app/package.json ./
COPY --from=migrate --chown=root:root --chmod=755 /app/node_modules ./node_modules
COPY --from=builder --chown=root:root --chmod=755 /app/.next/standalone ./
COPY --from=builder --chown=root:root --chmod=755 /app/.next/static ./.next/static
COPY --from=builder --chown=root:root --chmod=755 /app/public ./public
COPY --from=builder --chown=root:root --chmod=755 /app/prisma ./prisma
COPY --from=builder --chown=root:root --chmod=755 /app/scripts ./scripts
COPY --from=builder --chown=root:root --chmod=755 /app/prisma.config.ts ./

# Create writable runtime directories (cache, backups, private/public uploads) for uid 1001
RUN mkdir -p .next/cache /app/backups /app/private/uploads /app/public/uploads && \
    chown -R nextjs:nodejs .next/cache /app/backups /app/private /app/public/uploads && \
    chmod -R 775 /app/backups /app/private /app/public/uploads

# Switch to non-root user
USER nextjs

EXPOSE 3000

# Start the application only. Schema changes run in the one-shot `migrate`
# service (docker-compose.prod.yml), never on every container boot — a
# restart must not rewrite the production schema, and a failed migration
# must stop the release instead of booting a half-migrated app.
CMD ["sh", "-c", "node server.js"]
