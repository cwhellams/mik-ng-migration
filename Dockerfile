# Create minimal production image
FROM node:26-alpine AS production

# Install pnpm
RUN npm install -g pnpm@11.10.0

# Install Chromium for Puppeteer-based HTML-to-PDF rendering (Brevo newsletter
# archiving). Puppeteer's bundled Chromium download doesn't run on Alpine's
# musl libc, so we use puppeteer-core against this system install instead.
# freetype-dev (headers) is intentionally omitted: nothing in this image
# compiles against freetype at runtime.
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory and non-root user
RUN mkdir -p /home/node/app && chown -R node:node /home/node/app

# Set working directory
WORKDIR /home/node/app

# Copy only necessary pnpm files for production
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml* ./
COPY apps/backend/package.json ./apps/backend/
# Workspace dependency of the backend — pnpm needs its manifest present to link it
COPY packages/contracts/package.json ./packages/contracts/

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
