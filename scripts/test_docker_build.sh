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
echo "Checking backend application structure..."

docker run --rm --entrypoint /bin/sh $IMAGE_NAME -c '
    echo "=== Backend application structure ==="
    ls -la /home/node/app/apps/backend/src/ 2>/dev/null || echo "backend src directory not found"
    echo ""
    echo "=== Installed dependencies (validator.js check) ==="
    ls -la /home/node/app/node_modules/validator/ 2>/dev/null || echo "validator package not found in node_modules"
    echo ""
    echo "=== Backend package.json ==="
    cat /home/node/app/apps/backend/package.json 2>/dev/null || echo "package.json not found"
'

echo -e "\n${GREEN}Step 3: Testing if Node can resolve validator module...${NC}"
docker run --rm --entrypoint node $IMAGE_NAME -e "
try {
    const resolved = require.resolve('validator');
    console.log('✓ validator module resolved at:', resolved);
} catch (err) {
    console.error('✗ Cannot resolve validator:', err.message);
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
