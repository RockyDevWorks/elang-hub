# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# ELANG Hub — container image.
#
# The Hub ships to two deployment targets from one source tree:
#
#   * Cloudflare Workers — the v0.1.0 production target, built by
#     `npm run build` with @sveltejs/adapter-cloudflare.
#   * Node HTTP server  — this image, built by `npm run build:node`
#     with @sveltejs/adapter-node and run by the final stage.
#
# The image therefore runs a standalone Node server, not a Worker.
# Keep the two targets in sync: every source change must pass BOTH
# `npm run build` (CI Cloudflare build) and `npm run build:node` (CI
# Docker build) before merging.
# ─────────────────────────────────────────────────────────────────────────────

ARG NODE_VERSION=22-alpine

# ── Stage 1: install the full dependency tree (build + test tools) ───────────
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./

# `--ignore-scripts` runs NO package lifecycle script during install.
# The build needs none: esbuild and workerd ship their platform
# binaries as optionalDependencies, so the executables are present
# without a postinstall hook. Keeping scripts off means the image's
# dependency tree cannot execute anything at install time.
RUN npm ci --ignore-scripts --no-audit --no-fund

# ── Stage 2: produce the Node-target build output ────────────────────────────
FROM deps AS build
COPY . .
RUN npm run build:node

# ── Stage 3: runtime ────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

# SvelteKit uses ORIGIN to construct absolute URLs and to drive its
# CSRF origin check. Override at deploy time when the Hub is published
# on a non-loopback host; the loopback default only fits local dev.
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    ORIGIN=http://localhost:3000

COPY package.json package-lock.json ./

# `--ignore-scripts` for the same reason as the deps stage. The
# runtime tree is `@lucide/svelte` plus its transitive dependencies,
# none of which have install scripts — and nothing in the shipped
# dependency tree should execute code while it is being installed.
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
 && npm cache clean --force

# adapter-node emits build/ containing:
#   * index.js     — the Node HTTP server entrypoint (CMD target)
#   * client/      — static client assets served by the server
#   * server/      — server-only chunks
COPY --from=build /app/build ./build

# Run as the unprivileged `node` user (uid 1000) shipped by the base image
# rather than root.
USER node

EXPOSE 3000

# Use Node 22's global `fetch` so no extra packages are needed for the
# healthcheck; the Hub's `/` route is a real endpoint that returns 200.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "build/index.js"]
