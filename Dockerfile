# Use Node.js 23 as the base image for building
FROM node:23-alpine AS builder

# Install corepack and enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set working directory in the container
WORKDIR /usr/src/app

# Copy root pnpm files (for workspaces/monorepo)
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml* ./

# Copy the backend package.json
COPY apps/backend/package.json ./apps/backend/

# Copy the shared package package.json
COPY packages/shared/package.json ./packages/shared/

# Install all dependencies from the root using pnpm
RUN pnpm install --frozen-lockfile

# Copy only necessary source code for building
COPY packages/shared ./packages/shared

# Build the shared package first
RUN pnpm --filter @mik-ng/shared build

# Create minimal production image
FROM node:23-alpine AS production

# Install corepack and enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create app directory and non-root user
RUN mkdir -p /home/node/app && chown -R node:node /home/node/app

# Set working directory
WORKDIR /home/node/app

# Copy only necessary pnpm files for production
COPY --from=builder /usr/src/app/pnpm-lock.yaml ./
COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/pnpm-workspace.yaml* ./
COPY --from=builder /usr/src/app/apps/backend/package.json ./apps/backend/
COPY --from=builder /usr/src/app/packages/shared/package.json ./packages/shared/

# Install only production dependencies with aggressive optimization
RUN pnpm install --frozen-lockfile --prod --shamefully-hoist \
    && pnpm store prune \
    && rm -rf ~/.pnpm-store \
    && rm -rf /root/.local/share/pnpm \
    && rm -rf /tmp/*

# Copy backend source code (needed for tsx runtime)
COPY apps/backend/src ./apps/backend/src
COPY apps/backend/ca-certificate.crt ./apps/backend/

# Copy built shared package from the builder stage (only dist, no source)
COPY --from=builder /usr/src/app/packages/shared/dist ./packages/shared/dist

# Switch to non-root user
USER node

# Expose the port your app runs on
WORKDIR /home/node/app/apps/backend
EXPOSE 3000

# Run TypeScript files with tsx
CMD ["node", "--import", "tsx", "src/app.ts"]
