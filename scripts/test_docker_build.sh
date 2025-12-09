#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

IMAGE_NAME="mik-backend:test"

echo -e "${YELLOW}=== MIK-NG Backend Docker Build Test ===${NC}\n"

# Check if .env file exists
if [ ! -f "apps/backend/.env" ]; then
    echo -e "${RED}Error: apps/backend/.env not found${NC}"
    echo "Please create apps/backend/.env with required environment variables"
    exit 1
fi

echo -e "${GREEN}Step 1: Building Docker image...${NC}"
docker build -t $IMAGE_NAME .

echo -e "\n${GREEN}Step 2: Inspecting container structure...${NC}"
echo "Checking if @mik-ng/shared package is properly installed..."

docker run --rm --entrypoint /bin/sh $IMAGE_NAME -c '
    echo "=== Package structure ==="
    ls -la /home/node/app/packages/shared/ 2>/dev/null || echo "shared directory not found"
    echo ""
    echo "=== Shared package.json ==="
    cat /home/node/app/packages/shared/package.json 2>/dev/null || echo "package.json not found"
    echo ""
    echo "=== Shared dist contents ==="
    ls -la /home/node/app/packages/shared/dist/ 2>/dev/null || echo "dist directory not found"
    echo ""
    echo "=== Node modules check ==="
    ls -la /home/node/app/node_modules/@mik-ng/ 2>/dev/null || echo "@mik-ng scope not found in node_modules"
'

echo -e "\n${GREEN}Step 3: Testing if Node can resolve @mik-ng/shared...${NC}"
docker run --rm --entrypoint node $IMAGE_NAME -e "
try {
    const resolved = require.resolve('@mik-ng/shared');
    console.log('✓ Module resolved at:', resolved);
} catch (err) {
    console.error('✗ Cannot resolve @mik-ng/shared:', err.message);
    process.exit(1);
}
"

echo -e "\n${GREEN}Step 4: Starting container with environment variables...${NC}"
echo "Press Ctrl+C to stop the container"
echo "Testing at http://localhost:3000/health"
echo ""

# Update DATABASE_URL to use host.docker.internal for local testing
docker run -p 3000:3000 \
  --env-file apps/backend/.env \
  -e DATABASE_URL="postgres://admin:password@host.docker.internal:5432/mik_ng" \
  $IMAGE_NAME

echo -e "\n${YELLOW}=== Test Complete ===${NC}"
