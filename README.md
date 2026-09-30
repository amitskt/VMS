# STart — SankalpTaru Volunteer Management System

A full-stack platform for SankalpTaru Foundation to recruit, manage, and recognize volunteers — from opportunity discovery through task completion to certificate issuance — built as a React/Vite frontend backed by a Node.js/Express/MongoDB API.

## Overview

STart replaces manual, spreadsheet-driven volunteer coordination with a self-serve platform. Volunteers sign up, complete a profile, and either work through self-guided opportunities (**Track A**) or get matched to and assigned specific tasks by staff (**Track B**). Completing either path automatically issues a branded, verifiable PDF certificate. Staff (managers and admins) get a separate dashboard to manage opportunities, review applications, assign and track tasks, and oversee the volunteer base — all gated behind Google SSO restricted to the organization's own domain.

## Features

### For volunteers
- **Account & auth** — register with email/password (protected by mandatory email verification via a one-time code) or continue with Google; forgot-password reset also via a one-time email code
- **Opportunity discovery** — browse and search open opportunities, save/bookmark ones of interest, and get AI-assisted recommendations (Google Gemini, with a keyword-overlap fallback when Gemini is unavailable) matched to the volunteer's own skills and profile
- **Two ways to contribute:**
  - *Track A* — self-guided opportunities the volunteer completes and submits proof of work for directly, auto-issuing a certificate on submission
  - *Track B* — the volunteer applies, gets shortlisted, is assigned specific tasks by a coordinator, submits work for each, and earns a certificate once a task is approved
- **Profile & skills** — a guided profile and skills setup flow that feeds both opportunity matching and the volunteer's public certificate details
- **Certificates** — earned certificates render as a branded PDF (issued once per completed opportunity/task), downloadable at any time, with a real per-certificate "Share on LinkedIn" link (backed by the certificate's own public file link) and a verification ID
- **Engagement tracking** — a personal dashboard of applications, tasks, and volunteering history

### For staff (managers & admins)
- **Google SSO only**, restricted to the organization's email domain — no separate staff registration flow
- **Opportunity management** — create/edit opportunities, manage departments
- **Application & task pipeline** — review applications, shortlist volunteers, assign and track Track B tasks through to completion, request revisions
- **Certificates** — manage certificate templates, review issuance
- **Volunteer oversight** — browse/manage the volunteer base, organize volunteer groups, review engagement analytics
- **Admin dashboard & activity log** — organization-wide stats and an audit trail of staff actions
- **Settings** — org-level configuration

## Tech stack

**Backend:** Node.js, Express, MongoDB (Mongoose), JWT-based auth, bcrypt password hashing, Google APIs (Drive for file storage, Gemini for opportunity matching), AWS SES for transactional email, PDFKit for certificate generation.

**Frontend:** React + Vite, React Router, Google OAuth (`@react-oauth/google`).

## Project structure

```
volunteer/
├── vmsbackend/           Node/Express API
│   ├── controllers/      Route handlers (volunteer, admin, auth, certificates, tasks, ...)
│   ├── models/           Mongoose schemas (Volunteer, Admin, Manager, Opportunity, Application, Task, ...)
│   ├── routes/           Express routers, grouped by area (volunteer, staff, admin, public)
│   ├── views/            Plain functions that shape a Mongoose doc into an API response
│   ├── utils/            Email templates/sending, Drive upload, certificate PDF rendering, Gemini matching
│   ├── middleware/       Auth (JWT) and file-upload (multer) middleware
│   ├── scripts/          One-off migration/backfill scripts (never run automatically — see each file's header)
│   ├── seed/             Seed data (certificate templates, staff accounts)
│   └── server.js         App entry point
└── vmsfrontend/          React/Vite SPA
    └── src/
        ├── pages/
        │   ├── volunteer/   Volunteer-facing pages (Dashboard, Opportunities, My Tasks, Certificates, ...)
        │   └── admin/       Staff-facing pages (Applications, Task Board, Volunteers, Settings, ...)
        ├── components/      Shared UI (e.g. ProfileMenu, RequireAuth route guard)
        └── services/        API client helpers, analytics
```

## Getting started (local development)

Prerequisites: Node.js 22+, a MongoDB instance (local or hosted), and API credentials for the integrations you want working (Google OAuth, Google Drive, Gemini, AWS SES — see **Environment variables** below; the app degrades gracefully with a clear error rather than crashing if any single one is missing).

```bash
# Backend
cd vmsbackend
npm install
cp .env.example .env   # fill in real values — see below
npm run dev             # nodemon, auto-restarts on change — or `npm start` for a plain run

# Frontend, in a second terminal
cd vmsfrontend
npm install
npm run dev
```

The frontend expects the API at `VITE_API_URL` (defaults to `http://localhost:5000/api`); the backend expects the frontend's origin in `CLIENT_ORIGIN` for CORS.

## Environment variables

### Backend (`vmsbackend/.env` — see `.env.example` for full setup notes on each integration)

| Variable | Purpose |
|---|---|
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Auth token signing |
| `CLIENT_ORIGIN` | Frontend origin, for CORS |
| `STAFF_DOMAIN` | Email domain allowed for staff Google SSO |
| `PORT`, `NODE_ENV` | Server runtime config |
| `GOOGLE_CLIENT_ID` | Google Sign-In client (volunteer/staff login) |
| `GOOGLE_DRIVE_CLIENT_ID` / `_CLIENT_SECRET` / `_REFRESH_TOKEN` / `_FOLDER_ID` | Google Drive file storage (photos, resumes, submissions, certificates) — OAuth "sign in as one person" setup, see `scripts/getGoogleDriveToken.js` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Opportunity-matching AI (optional — falls back to keyword matching without it) |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_FROM_EMAIL` | Transactional email via Amazon SES |

### Frontend (`vmsfrontend/.env`)

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend API base URL |
| `VITE_GOOGLE_CLIENT_ID` | Google Sign-In client (must match backend's) |
| `VITE_GA_MEASUREMENT_ID` | Google Analytics (optional) |

## Backend scripts

One-off, never run automatically on server boot — run manually as needed, from `vmsbackend`:

| Script | Purpose |
|---|---|
| `npm run seed:staff` | Seed initial staff (admin/manager) accounts |
| `npm run seed:certificate-templates` | Seed certificate template records |
| `npm run drive:auth` | One-time interactive OAuth flow to obtain `GOOGLE_DRIVE_REFRESH_TOKEN` |
| `npm run migrate:remove-selected` | Data migration (see script header) |
| `npm run migrate:pin-certificate-templates` | Pin already-issued certificates to their template |
| `npm run backfill:volunteer-drive-folders` | Give existing volunteers a per-volunteer Drive folder |
| `npm run refresh:certificate-template-images` | Re-sync certificate template images from disk |
| `npm run backfill:email-verified` | Mark pre-existing accounts as email-verified (**run once, right after deploying email verification**) |
| `npm run fix:volunteer-drive-folders` | Merge duplicate per-volunteer Drive folders and (re-)share them with the account the backend authenticates as (see script header for flags) |

## Deployment

Runs as two processes behind a reverse proxy: the Express API kept alive with PM2, and the Vite production build (`npm run build` → `dist/`) served as static files by Nginx, which also proxies `/api` to the backend. Database: MongoDB (a managed instance in production). File storage: Google Drive via a dedicated OAuth-authenticated account, not a service account.
