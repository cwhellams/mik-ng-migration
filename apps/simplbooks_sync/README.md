# SimplBooks Client Sync

A Node.js CLI application to sync client data from SimplBooks API to the MIK database.

## Overview

This application provides two main operations:

1. **Sync Clients**: Updates existing MIK members with SimplBooks data
   - Matches members by email address
   - Updates billing_id and address details for existing members only
   - Does NOT create new members from SimplBooks
   - Skips clients without email addresses

2. **Match Removed Members**: Finds SimplBooks clients for removed MIK members
   - Searches SimplBooks by last_name from removed members
   - For single matches: logs SimplBooks ID and member details
   - For multiple matches: checks emails to identify old vs current members

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Configure environment variables in `.env`:
   ```
   DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require
   SIMPLBOOKS_API_URL=https://api.simplbooks.com
   SIMPLBOOKS_API_KEY=your_api_key_here
   SIMPLBOOKS_COMPANY_ID=your_company_id_here
   ```

## Usage

Run the sync application with different operations:

```bash
# Sync SimplBooks clients to existing MIK members (default)
pnpm sync

# Match removed members to SimplBooks clients
pnpm match

# Run both operations sequentially
pnpm both
```

Or directly with Node.js:

```bash
node --experimental-transform-types src/index.ts sync
```

## Field Mappings

### SimplBooks → MIK Database (Sync Operation)

| SimplBooks Field      | MIK Database Field | Notes                  |
| --------------------- | ------------------ | ---------------------- |
| `id`                  | `billing_id`       | SimplBooks client ID   |
| `e_mail`              | `email`            | **Key matching field** |
| `phone`               | `phone_number`     | Contact phone          |
| `address_street`      | `street_address`   | Street address         |
| `address_postal_code` | `postcode`         | Postal code            |
| `address_city`        | `town_city`        | City name              |

**Note**: First name and last name are NOT synced to preserve MIK member data.

### Match Operation Fields

- **MIK member**: `last_name` (used to search SimplBooks)
- **SimplBooks client**: `name` (searched by last_name)
- **Matching**: Email comparison between SimplBooks and active MIK members

## Output

### Sync Operation

The application logs detailed information:

- Progress while fetching clients from SimplBooks API (with pagination)
- Individual member update operations
- Summary statistics:
  - Total clients processed
  - Billing IDs updated
  - Records skipped (no match or no change)
  - Errors encountered

### Match Operation

The application logs:

- Removed members without last names (skipped)
- Single matches found with SimplBooks client IDs
- Multiple matches with email verification results
- Any errors encountered during the search process

## Requirements

- Node.js v22+ (for `--experimental-transform-types` flag)
- PostgreSQL database with MIK schema
- SimplBooks API access (API key and company ID)
- SSL-enabled database connection for production

## Database Connection

The application connects to PostgreSQL with SSL support. For development with self-signed certificates, ensure your `DATABASE_URL` includes `sslmode=require`.

## Error Handling

The application includes robust error handling:

- **Network errors**: Logged with HTTP status and response data
- **Missing response fields**: Validated before processing to prevent crashes
- **Database errors**: Caught and reported per operation
- **API rate limiting**: Built-in 1 request/second throttling to respect API limits

## API Documentation

SimplBooks Client API: https://app.simplbooks.com/api-documentation/#tag/Clients
