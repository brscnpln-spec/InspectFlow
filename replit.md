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
2. Service member assignment and scheduling
3. NPS survey system with 24-hour expiry, token-based URLs
4. Analytics dashboard with NPS scores, distribution charts
5. Emergency inspection tracking
6. Team management view

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
- GET /api/inspections, GET /api/inspections/:id, POST /api/inspections
- PATCH /api/inspections/:id/assign, /close, /final-close, /cancel
- POST /api/inspections/:id/trigger-nps
- GET /api/survey/:token, POST /api/survey/:token/respond
- GET /api/nps/responses
- GET /api/users/service-members, GET /api/users/:id
