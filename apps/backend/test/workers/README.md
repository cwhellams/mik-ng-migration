# Simplbooks Invoice Payment Worker Tests

## Overview

This test suite validates the functionality of the Simplbooks Invoice Payment Worker, which synchronizes payment status between the MIK database and the Simplbooks accounting system.

## Testing Strategy: Dependency Injection

The tests use **dependency injection** instead of Jest module mocking to ensure reliable, isolated tests that don't make real HTTP requests. The worker accepts optional dependencies (`getInvoice` and `cronSchedule`) that default to the real implementations in production but can be replaced with mocks in tests.

### Why Dependency Injection?

Jest's ESM module mocking has limitations with static imports - the module graph is resolved before mocks can intercept calls. By using dependency injection:

- ✅ Tests are fast and reliable (no real HTTP requests)
- ✅ Mocks are simple Jest functions, not complex module mocks
- ✅ Production code uses real implementations by default
- ✅ Tests have full control over behavior
- ✅ Follows SOLID principles (Dependency Inversion)

## Test Structure

The tests are organized into the following categories:

### 1. Worker Initialization

- Verifies the worker starts correctly when enabled (schedules cron task)
- Confirms the worker doesn't start when disabled (no cron scheduling)
- Validates cron scheduling (daily at 4:00 AM)

### 2. Database Queries

- **getUnpaidInvoicesWithSimplbooksRef**: Tests retrieval of unpaid invoices with Simplbooks references
- **markInvoiceAsPaid**: Tests marking invoices as paid in the database
- Validates exclusion of invoices without Simplbooks references

### 3. End-to-End Invoice Sync

- Full flow: retrieve unpaid invoices → check Simplbooks (via mock) → update database
- Tests both paid and unpaid scenarios

## Mock Setup

The test suite creates simple Jest mock functions for dependencies:

```typescript
// Create mocks in beforeEach
mockGetInvoice = jest.fn<(id: number) => Promise<InvoiceResponse>>()
mockCronSchedule = jest.fn().mockReturnValue({ stop: jest.fn() })

// Inject mocks into worker
const worker = startSimplbooksInvoicePaymentWorker({
  getInvoice: mockGetInvoice,
  cronSchedule: mockCronSchedule,
})

// Configure mock behavior per test
mockGetInvoice.mockResolvedValue({
  status: 200,
  duration: 0.05,
  data: {
    Invoice: {
      id: 12345,
      paid: '2024-11-27', // Paid invoice
      // ... other fields
    },
    Task: [],
  },
})
```

## Running the Tests

```bash
# Run only the invoice payment worker tests
pnpm test simplbooksInvoicePaymentWorker

# Run all backend tests
cd apps/backend && pnpm test

# Run with coverage
pnpm test --coverage
```

## Key Test Scenarios

### Test Data Setup

Each test creates a temporary invoice record with:

- `member_id`: 'Matti1' (test user)
- `pmt_ref`: '12345' (Simplbooks invoice ID)
- `is_paid`: false
- `paid_at`: null

The test invoice is created in `beforeEach` and cleaned up in `afterEach` to ensure test isolation.

### Simplbooks API Mock Responses

The mock can be configured to return different payment states:

```typescript
// Paid invoice
mockGetInvoice.mockResolvedValue({
  status: 200,
  data: {
    Invoice: { id: 12345, paid: '2024-11-27', ... },
    Task: [],
  },
})

// Unpaid invoice (empty string)
mockGetInvoice.mockResolvedValue({
  status: 200,
  data: {
    Invoice: { id: 12345, paid: '', ... },
    Task: [],
  },
})

// Unpaid invoice (zero date)
mockGetInvoice.mockResolvedValue({
  status: 200,
  data: {
    Invoice: { id: 12345, paid: '0000-00-00', ... },
    Task: [],
  },
})
```

### Payment Status Logic

The worker considers an invoice paid if:

1. `paid` field is not empty
2. `paid` field is not '0000-00-00'
3. Otherwise, the invoice is considered unpaid

## Environment Variables

Tests use the following environment variables:

- `SIMPLBOOKS_INVOICE_PAYMENT_WORKER_ENABLED`: 'true' to enable the worker
- `SIMPLBOOKS_INVOICE_PAYMENT_WORKER_RUN_ON_STARTUP`: 'false' for tests (prevents auto-run)

## Database Cleanup

All tests properly clean up test data:

- `beforeEach`: Creates test invoice
- `afterEach`: Deletes test invoice
- Ensures no test data pollution

## Troubleshooting

### Database Connection Issues

Ensure PostgreSQL is running and the test database is properly set up:

```bash
./scripts/start_postgres.sh
./scripts/baseline_database.sh
```

### Mock Not Being Called

If the mock isn't being called as expected:

1. Ensure `jest.clearAllMocks()` is called in `beforeEach`
2. Verify the mock is configured with `mockResolvedValue()` or `mockImplementation()`
3. Check that dependencies are being injected into the worker:
   ```typescript
   startSimplbooksInvoicePaymentWorker({
     getInvoice: mockGetInvoice, // Must pass the mock
     cronSchedule: mockCronSchedule,
   })
   ```

### Tests Making Real HTTP Requests

If you see actual Simplbooks API URLs or 401 errors in test output:

1. Verify dependency injection is being used (not relying on module mocks)
2. Check that `mockGetInvoice` is passed to the worker
3. Ensure the mock is configured before the test runs

## Example Test Output

```
Simplbooks Invoice Payment Worker
  Worker Initialization
    ✓ should schedule task when worker is enabled (101ms)
    ✓ should not start worker when disabled (193ms)
  Database Queries
    ✓ should retrieve unpaid invoices with Simplbooks reference (10ms)
    ✓ should exclude invoices without Simplbooks reference (12ms)
    ✓ should mark invoice as paid (12ms)
  End-to-End Invoice Sync
    ✓ should sync payment status for paid invoice (19ms)
    ✓ should not update invoice if still unpaid in Simplbooks (10ms)

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
Time:        1.576 s
```

## Architecture Benefits

The dependency injection pattern provides several benefits:

1. **Testability**: Easy to test without complex mocking
2. **Maintainability**: Clear separation of concerns
3. **Flexibility**: Production code can use different implementations
4. **SOLID Principles**: Follows Dependency Inversion Principle
5. **No HTTP Requests in Tests**: Guaranteed isolation from external services
