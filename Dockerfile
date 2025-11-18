# Use Node.js 23 as the base image
FROM node:23-alpine AS builder

# Install corepack and enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set working directory in the container
WORKDIR /usr/src/app

# Copy root pnpm files (for workspaces/monorepo)
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml* ./

# Copy the backend package.json
COPY apps/backend/package.json apps/backend/ca-certificate.crt ./apps/backend/

# Install all dependencies from the root using pnpm
RUN pnpm install --frozen-lockfile

# Copy application code
COPY . .

# Build the backend TypeScript project
#WORKDIR /usr/src/app/apps/backend
#RUN pnpm run build || (echo "No build script found in package.json, using tsc directly" && npx tsc)

# Create production image
FROM node:23-alpine 

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
COPY --from=builder /usr/src/app/apps/backend/ca-certificate.crt ./apps/backend/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy compiled JavaScript from the builder stage
COPY --from=builder /usr/src/app/apps/backend/src ./apps/backend/src

# Switch to non-root user
USER node

# Expose the port your app runs on
WORKDIR /home/node/app/apps/backend
EXPOSE 3000

# Run TypeScript files directly using tsx
CMD ["node", "--import", "tsx", "src/app.ts"]
