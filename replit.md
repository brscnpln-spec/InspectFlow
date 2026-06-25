# InspectFlow - Inspection Management System

## Overview
An internal workflow tool for managing OGI inspection requests from customer intake to post-inspection NPS feedback. Supports two roles: Admin (Service Managers) and Service Members.

## Architecture
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui
- **Backend**: Express.js REST API
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Session-based with scrypt password hashing
- **Routing**: wouter (frontend), Express (backend)

## Color Theme
- White: #ffffff
- Yellow: #ffb800 (primary brand color)
- Black: #000000

## User Roles
- **Admin**: Full system access, create/assign inspections, trigger NPS, view analytics, notification center
- **Service Member**: View assigned inspections, complete inspections

> Seed credentials are defined in `server/seed.ts` and only applied in non-production environments (`NODE_ENV !== "production"`). Change these before any real deployment.

## Key Features
1. Inspection request CRUD with status workflow (New → Scheduled → Closed → Final Closed)
2. Service member assignment and scheduling with accept/reject workflow
3. NPS survey system with 24-hour expiry, token-based URLs sent to both mandatory contact persons
4. Analytics dashboard with NPS scores, distribution charts
5. Emergency inspection tracking
6. Team management view
7. Calendar view - Monthly grid showing inspections; Admin sees all inspections color-coded by service member, Members see only their own; Pending assignments shown with reduced opacity and dashed border; Recurring events shown with ↻ icon shifted to next business day if weekend
8. Inspection report file upload - Mandatory file upload before closing inspections; Admin sees all reports, service members see only their own uploads; Final Closed inspections are fully locked (no edits, no upload, no delete)
9. Assignment accept/reject workflow - Service members must accept/reject within 24h (12h for emergency); auto-expires if no response; pending assignments shown transparently in calendar
10. Two mandatory contact persons per inspection - contact person 1 and 2 require name, phone, and email
11. Tenant/Company management - Dedicated Tenants page (admin: full CRUD; members: view/edit own linked tenants); inspections reference a tenant via tenantId
12. Feedback Manager (Analytics page) - Three tabs: General, Customer, Team Member; semi-circle gauge charts (0-10); sortable + paginated table; no "NPS" terminology
13. Notification Center (admin-only) - Bell icon in header; popover with newest-first list; unread badge; mark-as-read / mark-all-read; deep links to inspection/tenants/calendar/analytics; 8 event types with deduplication

## Notification Types
- `assignment_accepted` - member accepted; dedup: per inspection
- `assignment_rejected` - member rejected; dedup: per inspection per day
- `assignment_expired` - member didn't respond in time; dedup: per inspection
- `inspection_completed` - member closed inspection; dedup: per inspection
- `inspection_overdue` - past date + 3 biz days, still scheduled; dedup: per inspection+date
- `feedback_received` - survey response submitted; dedup: per survey
- `feedback_expired` - survey expired without response; dedup: per survey
- `tenant_added` - new tenant created; dedup: per tenant
- `tomorrow_reminder` - inspection scheduled for tomorrow; dedup: per inspection+date

## Schedulers
- Every 60s: expire pending assignments → creates `assignment_expired` notifications
- Every 15min: check overdue inspections, expired surveys, tomorrow's inspections → creates respective notifications

## Project Structure
- `shared/schema.ts` - Database schema and types (includes notifications table)
- `server/routes.ts` - API endpoints + schedulers
- `server/storage.ts` - Database operations
- `client/src/components/notification-center.tsx` - Bell icon + popover UI
- `client/src/App.tsx` - Layout (header with NotificationCenter)

## API Endpoints
- GET /api/notifications (admin-only), PATCH /api/notifications/read-all, PATCH /api/notifications/:id/read
- GET /api/tenants, POST /api/tenants (admin), PATCH /api/tenants/:id, DELETE /api/tenants/:id (admin)
- POST /api/auth/login, GET /api/auth/me, POST /api/auth/logout
- GET /api/inspections, GET /api/inspections/:id, POST /api/inspections, PATCH /api/inspections/:id
- PATCH /api/inspections/:id/assign, /close, /final-close, /cancel, /accept-assignment, /reject-assignment
- GET /api/feedback (admin-only), GET /api/nps/responses
- POST /api/inspections/:id/reports, GET /api/inspections/:id/reports, GET /api/reports/:id/download, DELETE /api/reports/:id
- GET /api/users, GET /api/users/service-members, POST /api/users, PATCH /api/users/:id, DELETE /api/users/:id

## Gotchas
- Notifications table uses `deduplication_key UNIQUE` to prevent duplicate alerts
- Final Closed inspections are immutable (server + frontend enforced)
- Calendar recurring events computed client-side (no DB entries); weekend dates shifted to Monday
- NPS survey token is created at final-close; reactivatable by admin
