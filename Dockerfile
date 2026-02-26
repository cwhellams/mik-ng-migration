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

# Install all dependencies from the root using pnpm
RUN pnpm install --frozen-lockfile

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

# Install only production dependencies with aggressive optimization
RUN pnpm install --frozen-lockfile --prod --shamefully-hoist \
    && pnpm store prune \
    && rm -rf ~/.pnpm-store \
    && rm -rf /root/.local/share/pnpm \
    && rm -rf /tmp/*

# Copy backend source code (needed for tsx runtime)
COPY apps/backend/src ./apps/backend/src

# Copy CA certificate
COPY apps/backend/ca-certificate.crt /home/node/app/ca-certificate.crt

# Switch to non-root user
USER node

# Expose the port your app runs on
WORKDIR /home/node/app/apps/backend
EXPOSE 3000

# Set DATABASE_CA_CERT as environment variable from file
ENV DATABASE_CA_CERT_FILE=/home/node/app/ca-certificate.crt
ENV MIK_LOGO_PATH=/home/node/app/apps/backend/src/assets/mik-logo-blue.png

# Run TypeScript files with tsx
CMD ["node", "--import", "tsx", "src/app.ts"]
