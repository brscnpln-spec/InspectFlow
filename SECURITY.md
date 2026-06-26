# Security Policy

## Supported Versions

InspectFlow is an internal tool. Only the latest version on `main` is supported.

| Version | Supported |
|---------|-----------|
| main (latest) | ✅ |
| older commits | ❌ |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report security issues privately to the system owner or IT security team via internal channels. Include:

- A clear description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested remediation (if known)

You will receive an acknowledgement within 5 business days. Critical issues will be remediated on a priority basis.

## Security Controls

| Control | Implementation |
|---------|---------------|
| Authentication | Session-based with scrypt password hashing |
| Session hardening | `httpOnly`, `sameSite: strict`, `secure` in production |
| HTTP headers | Helmet.js (CSP, HSTS, X-Frame-Options, etc.) |
| Rate limiting | express-rate-limit on all API routes |
| Input validation | Zod schemas on all request bodies |
| SQL injection | Drizzle ORM parameterised queries only |
| Dependency audit | `npm audit --audit-level=high` on every CI run |
| Secret scanning | Gitleaks on every CI run |
| SBOM | CycloneDX JSON generated on every CI run |
| License gate | Approved SPDX list enforced on every CI run |

## Dependency Updates

Dependencies are monitored via `npm audit` in CI. High or critical severity vulnerabilities block the pipeline.
