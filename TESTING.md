# Testing

## Running tests

```bash
npm test                 # run all tests
npm run test:coverage    # run with coverage report
```

## Coverage thresholds

Current thresholds are intentionally set to the current baseline:

| Metric     | Threshold |
|------------|-----------|
| Statements | 4%        |
| Branches   | 1%        |
| Functions  | 4%        |
| Lines      | 4%        |

**The goal is to prevent regression, not to claim broad coverage.**
Thresholds must be raised as new tests are added.

## Test location

All server-side tests live in `server/__tests__/`. Each file targets a specific
route group or helper. Coverage is measured against `server/**/*.ts`, excluding
`server/index.ts`, `server/vite.ts`, `server/static.ts`, and the test files
themselves.
