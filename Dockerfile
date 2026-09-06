# Create minimal production image
FROM node:26-alpine AS production

# Install pnpm
RUN npm install -g pnpm@11.10.0

# Create app directory and non-root user
RUN mkdir -p /home/node/app && chown -R node:node /home/node/app

# Set working directory
WORKDIR /home/node/app

# Copy only necessary pnpm files for production
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml* ./
COPY apps/backend/package.json ./apps/backend/
# Workspace dependencies of the backend — pnpm needs their manifests present to link them
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/db-schema/package.json ./packages/db-schema/

# Install only production dependencies with aggressive optimization
RUN pnpm install --frozen-lockfile --prod --shamefully-hoist \
    && pnpm store prune \
    && rm -rf /root/.local/share/pnpm \
    && rm -rf /tmp/*

# Copy backend source code (needed for tsx runtime)
COPY apps/backend/src ./apps/backend/src

# @mik/contracts ships TypeScript source rather than a build output, so the runtime
# needs its src/ the same way it needs the backend's
COPY packages/contracts/src ./packages/contracts/src

# @mik/db-schema is types only, so tsx erases every import of it and nothing here
# reads it at runtime. It is copied anyway because the image's smoke test resolves
# every workspace package the backend declares, and a missing one fails on boot
# rather than at the first query.
COPY packages/db-schema/src ./packages/db-schema/src

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
