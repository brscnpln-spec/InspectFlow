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
- **Admin** (2 users: tanweer/admin123, sanjeev/admin123): Full system access, create/assign inspections, trigger NPS, view analytics
- **Service Member** (10 users: ravi, priya, amit, neha, vikram, arun, sneha, rahul, deepa, kiran / all password: member123): View assigned inspections, complete inspections

## Key Features
1. Inspection request CRUD with status workflow (New → Scheduled → Closed → Final Closed)
2. Service member assignment and scheduling with accept/reject workflow
3. NPS survey system with 24-hour expiry, token-based URLs
4. Analytics dashboard with NPS scores, distribution charts
5. Emergency inspection tracking
6. Team management view
7. Calendar view - Monthly grid showing inspections; Admin sees all inspections color-coded by service member, Members see only their own; Pending assignments shown with reduced opacity and dashed border
8. Inspection report file upload - Mandatory file upload before closing inspections; Admin sees all reports, service members see only their own uploads
9. Assignment accept/reject workflow - Service members must accept/reject within 24h (12h for emergency); auto-expires if no response; pending assignments shown transparently in calendar

## Project Structure
- `shared/schema.ts` - Database schema and types
- `server/routes.ts` - API endpoints
- `server/storage.ts` - Database operations
- `server/auth.ts` - Password hashing
- `server/seed.ts` - Seed data
- `server/db.ts` - Database connection
- `client/src/pages/` - Page components
- `client/src/components/` - Reusable components
- `client/src/lib/auth.tsx` - Auth context

## API Endpoints
- POST /api/auth/login, GET /api/auth/me, POST /api/auth/logout
- GET /api/inspections, GET /api/inspections/:id, POST /api/inspections, PATCH /api/inspections/:id (admin edit)
- PATCH /api/inspections/:id/assign, /close, /final-close, /cancel, /accept-assignment, /reject-assignment
- POST /api/inspections/:id/trigger-nps
- GET /api/inspections/:id/nps-survey (admin-only, get NPS survey status)
- POST /api/inspections/:id/reactivate-nps (admin-only, extend NPS expiry 24h)
- GET /api/survey/:token, POST /api/survey/:token/respond
- GET /api/nps/responses
- POST /api/inspections/:id/reports, GET /api/inspections/:id/reports
- GET /api/reports/:id/download, DELETE /api/reports/:id
- GET /api/users (admin-only, all users), GET /api/users/service-members, GET /api/users/:id
- POST /api/users (admin-only, create user), PATCH /api/users/:id (admin-only, update user), DELETE /api/users/:id (admin-only, delete user)
