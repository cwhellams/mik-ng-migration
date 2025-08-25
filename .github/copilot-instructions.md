# MIK-NG Development Instructions

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Bootstrap Environment
Install required tools:
```bash
# Install Node.js v22 (required for experimental transform types)
wget https://nodejs.org/dist/v22.14.0/node-v22.14.0-linux-x64.tar.xz
sudo tar -xf node-v22.14.0-linux-x64.tar.xz -C /opt/
sudo ln -sf /opt/node-v22.14.0-linux-x64/bin/node /usr/local/bin/node
sudo ln -sf /opt/node-v22.14.0-linux-x64/bin/npm /usr/local/bin/npm

# Install pnpm
npm install -g pnpm@10.11.0

# Install Flyway CLI
wget -qO- https://repo1.maven.org/maven2/org/flywaydb/flyway-commandline/10.21.0/flyway-commandline-10.21.0-linux-x64.tar.gz | tar -xzf -
sudo mv flyway-10.21.0 /opt/flyway
sudo ln -s /opt/flyway/flyway /usr/local/bin/flyway
```

### Database Setup
Start PostgreSQL and set up the database:
```bash
# Start PostgreSQL container - takes ~11 seconds
./scripts/start_postgres.sh

# Wait for PostgreSQL to be ready, then create mik_ng database
PGPASSWORD=password psql -h localhost -U admin -d mydatabase -c "CREATE DATABASE mik_ng WITH OWNER = admin ENCODING = 'UTF8' LC_COLLATE = 'en_US.UTF-8' LC_CTYPE = 'en_US.UTF-8' LOCALE_PROVIDER = 'libc' TEMPLATE = template0;"

# Set up full database baseline - takes ~8 seconds total. NEVER CANCEL.
./scripts/baseline_database.sh
```

### Build and Dependencies
Install dependencies and build:
```bash
# Install all dependencies - takes ~64 seconds on first run. NEVER CANCEL. Set timeout to 120+ seconds.
pnpm install

# Build all projects - takes ~26 seconds. NEVER CANCEL. Set timeout to 60+ seconds.
pnpm build

# Generate database schema types (after DB is set up) - takes <1 second
cd apps/backend && pnpm schema
```

### Development Workflow
Run development servers:
```bash
# Run both backend and frontend concurrently (recommended)
pnpm dev
# Backend: http://localhost:3000 | Frontend: http://localhost:5173/

# Or run individually:
# Backend development - requires Node.js v22 for --experimental-transform-types flag
cd apps/backend && pnpm dev

# Frontend development - works reliably, takes ~1 second to start
cd apps/frontend && pnpm dev
# Serves at http://localhost:5173/
```

### Testing and Quality
```bash
# Format code - takes ~5 seconds. NEVER CANCEL.
pnpm format

# Run tests - takes ~11 seconds. All tests pass with proper environment setup. NEVER CANCEL. Set timeout to 30+ seconds.
# Note: Tests run successfully but may show teardown errors (safe to ignore)
pnpm test

# Lint code - KNOWN ISSUE: ESLint configuration has missing dependencies in backend
# May fail with "Cannot find package '@eslint/js'" error in backend
pnpm lint
```

## Validation Scenarios

After making changes, always test:

1. **Database Operations**: Run `./scripts/baseline_database.sh` to ensure database scripts work
2. **Build Process**: Run `pnpm build` to ensure all projects compile successfully
3. **Frontend Functionality**: Start `pnpm dev` in apps/frontend and verify it serves at http://localhost:5173/
4. **Schema Generation**: Run `pnpm schema` in apps/backend after database changes
5. **Code Quality**: Run `pnpm format` before committing changes

## Critical Timing Information

**NEVER CANCEL** the following operations:
- `pnpm install`: 60-120 seconds (first time)
- `pnpm build`: 30-60 seconds  
- `pnpm test`: 15-30 seconds (all tests pass with proper environment)
- `./scripts/baseline_database.sh`: 10-20 seconds

Always set timeouts of at least 2x the expected time to avoid premature cancellation.

## Environment Configuration

The backend requires a `.env` file in `apps/backend/`. A working example exists with local development defaults:
- Database: `postgres://admin:password@127.0.0.1:5432/mik_ng`
- API Port: 3000
- Frontend URL: http://localhost:5173
- **Important**: Add `SIMPLBOOKS_COMPANY_ID=123` to the .env file if missing to avoid startup errors

## Known Issues and Workarounds

1. **Node.js Version Requirement**: Backend dev mode requires Node.js v22 for `--experimental-transform-types` flag. V20 will not work.
2. **ESLint Configuration**: May fail due to missing `@eslint/js` dependency in backend
3. **Test Environment Variables**: Tests require SimplBooks API configuration to pass fully
4. **PostgreSQL Credentials**: Local development uses admin/password (never use in production)
5. **SimplBooks Config**: Ensure `SIMPLBOOKS_COMPANY_ID` is set in .env to prevent startup errors

## Project Structure

```
├── apps/
│   ├── backend/          # Node.js/Express API with TypeScript
│   └── frontend/         # React/Vite application
├── sql/                  # Database migrations and test data
├── scripts/              # Utility scripts for development
└── .github/workflows/    # CI/CD pipelines
```

## Key Development Files

Always check these locations when working on the codebase:
- `apps/backend/src/db/schema.d.ts` - Generated database types
- `apps/backend/.env` - Backend environment configuration
- `sql/schema/migration/` - Database schema migrations
- `sql/schema/testdata/` - Test data scripts
- Package files: `package.json`, `apps/*/package.json`

## CI/CD Requirements

The GitHub Actions workflows require:
- ESLint error count below 15 errors per project
- Prettier formatting compliance (`pnpm format:check`)
- Successful build completion
- PostgreSQL service for backend tests

Always run `pnpm format` and `pnpm build` before committing changes to ensure CI passes.