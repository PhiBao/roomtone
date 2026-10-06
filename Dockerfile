# Roomtone — production image.
#
# Single stage on the Node base: this app is a warm-cache Next.js server with a
# small MCP subprocess, so the standalone output plus node_modules is all we
# need. Multi-stage would add build time and save little.
FROM node:22-alpine

# pnpm via corepack, matching the version pinned in package.json.
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate

WORKDIR /app

# Install dependencies first so they stay cached across source changes.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

# The MCP server is TypeScript and needs compiling for the stdio entrypoint.
RUN pnpm build:mcp

# Next.js standalone output: a self-contained server with minimal node_modules.
# The static assets live outside standalone/ by default, so they are copied in
# too — without this the app serves HTML with 404s on every JS chunk.
RUN pnpm build \
 && cp -r .next/standalone ./.next-build \
 && mkdir -p .next-build/.next \
 && cp -r .next/static .next-build/.next/static

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

# The Qloo credential must arrive as a secret, never baked into the image.
# Locally: .env.local. In production, set QLOO_API_KEY on the host.
CMD ["node", ".next-build/server.js"]