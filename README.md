# InspectFlow

Internal workflow tool for managing OGI inspection requests from customer intake to post-inspection feedback.

## Roles

| Role | Access |
|------|--------|
| Admin (Service Manager) | Full system access — create/assign inspections, analytics, notifications |
| Service Member | View and complete assigned inspections |

## Stack

- **Frontend** — React 18, Vite, TailwindCSS, shadcn/ui
- **Backend** — Express 5, Node.js
- **Database** — PostgreSQL with Drizzle ORM
- **Auth** — Session-based with scrypt password hashing

## Prerequisites

- Node.js 20+
- PostgreSQL 14+

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and fill in DATABASE_URL, SESSION_SECRET

# 3. Push schema to the database
npm run db:push

# 4. Start the development server
npm run dev
```

The app will be available at `http://localhost:5000`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run check` | TypeScript type check |
| `npm test` | Run tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm audit` | Check for known vulnerabilities |
| `npm run license:check` | Verify all dependency licenses are approved |
| `npm run db:push` | Push Drizzle schema to the database |

## CI

Every push to `main` runs:

1. `npm ci` — reproducible dependency install
2. Type check (`tsc`)
3. Security audit (`npm audit --audit-level=high`)
4. License gate (`license-checker-rseidelsohn`)
5. Tests with coverage (thresholds defined in `vitest.config.ts`)
6. Production build

SBOM generation (CycloneDX JSON) and secret scanning (Gitleaks) run as parallel jobs.

## Testing

See [TESTING.md](TESTING.md) for coverage thresholds and test location conventions.

## Security

See [SECURITY.md](SECURITY.md) for the vulnerability disclosure policy.
