# BhoomiDrishti

BhoomiDrishti is a React and Express application for land-acquisition project, parcel, and field-verification records. The current database architecture is MongoDB/Mongoose; it has not been migrated to PostgreSQL or PostGIS.

## Current architecture

- `frontend/`: React 19, Vite, React Router, Leaflet, and the API client in `src/services/api.js`.
- `backend/`: Express 5 API, Mongoose models, route/controller modules, and database configuration.
- MongoDB collections currently modeled: users, sessions, projects, acquisition proposals, land parcels, field verifications, notifications, and audit logs.
- The API waits for a successful MongoDB connection before listening. It does not use volatile fallback records.

## Prerequisites

- Node.js 20.19+ (or 22.12+) and npm compatible with Vite 8.
- A running MongoDB instance.

## Setup and run

1. Install backend dependencies:

   ```powershell
   cd backend
   npm install
   if (!(Test-Path .env)) { Copy-Item .env.example .env }
   ```

2. Edit `.env` in the `backend` directory and set `MONGO_URI` to the MongoDB database you intend to use. The example URI is local-only and contains no credentials. Do not commit `.env`.

3. Create the first administrator with the interactive PowerShell helper. It reads the password without echoing it, asks for confirmation, uses the configured `MONGO_URI` (it never substitutes a database), and refuses to create an account if an administrator or account with that email already exists:

   ```powershell
   .\scripts\provisionAdmin.ps1
   ```

   Select `create`, then enter the new administrator email and display name. The command only creates the account; it does not delete or reset users.

4. If an existing administrator's password is unknown, run the same helper and select `reset`. It requires typing the exact administrator email to confirm, changes only that existing non-demo account, hashes the replacement password using the login-compatible scrypt format, and revokes that account's existing sessions:

   ```powershell
   .\scripts\provisionAdmin.ps1
   ```

   The command never creates a user during reset and refuses to proceed without confirmation and a matching existing administrator account. It does not change any other users or application data.

5. Start the API:

   ```powershell
   npm start
   ```

   For development with automatic restart:

   ```powershell
   npm run dev
   ```

6. In another terminal, install and run the frontend:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

   The frontend defaults to `http://localhost:5000/api`. Set `VITE_API_BASE_URL` at build/dev time to override that URL, for example `http://localhost:5000/api`.

7. Confirm API/database availability at `http://localhost:5000/api/health`, then sign in at `http://localhost:5173/login`.

## Configuration

Backend environment variables:

| Variable | Required | Description |
|---|---:|---|
| `PORT` | No | API port; defaults to `5000`. |
| `NODE_ENV` | Local development | Use `development` locally and set `production` explicitly in production deployments. Demo sign-in and demo seeding are available only when exactly `development`. |
| `MONGO_URI` | Yes | MongoDB connection string. |
| `CORS_ORIGINS` | No | Comma-separated browser origins; defaults to `http://localhost:5173`. |
| `BOOTSTRAP_ADMIN_*` | One-time CLI | First administrator setup variables; never configure these on the running web server. |
| `RESET_ADMIN_*` | One-time CLI | Explicitly confirmed password reset for an existing non-demo administrator; never configure these on the running web server. |
| `DEMO_PASSWORD` | Demo seed only | Private password used to hash seeded demo staff accounts; required only when applying either demo seed. |

An opt-in synthetic demo dataset is available for local development only. It is guarded to require `NODE_ENV=development`, `DEMO_SEED_CONFIRM=YES`, a private `DEMO_PASSWORD`, and a MongoDB database name ending in `_demo`. Demo accounts are rejected outside development, including production and test environments. It uses fixed synthetic record IDs so reruns update the demo records rather than duplicating them; do not use this against a real operational database.

To seed a local demo database from `backend`:

```powershell
$env:MONGO_URI='mongodb://127.0.0.1:27017/bhoomidrishti_demo'
$env:NODE_ENV='development'
$env:DEMO_SEED_CONFIRM='YES'
$securePassword = Read-Host 'Demo account password (12 characters minimum)' -AsSecureString
$env:DEMO_PASSWORD = [System.Net.NetworkCredential]::new('', $securePassword).Password
try { npm run seed:demo } finally {
  Remove-Item Env:DEMO_SEED_CONFIRM,Env:DEMO_PASSWORD -ErrorAction SilentlyContinue
  Remove-Variable securePassword -ErrorAction SilentlyContinue
}
```

The demo data is synthetic and must not be treated as official land, owner, compensation, or survey information. The seeder upserts its fixed synthetic IDs and resets those demo records to seed values on rerun; it does not delete records.

After applying the seed, sign in at `http://localhost:5173/login` with a seeded staff account and the private demo password entered for that seed operation. Use only locally provided demo credentials; do not commit them or include them in a presentation. Demo sign-in is enabled only with `NODE_ENV=development`.

### Local `bhoomidrishti` demonstration dataset

`backend/scripts/seedLocalDemo.js` provides a separate, strictly local fixture for the `bhoomidrishti` development database. It is not the `_demo` database seeder above. The command is read-only by default and will refuse a non-loopback MongoDB host, a database other than exactly `bhoomidrishti`, or an environment other than `development`.

From the `backend` directory, preview the records and conflicts without inserting, updating, or deleting data:

```powershell
$env:NODE_ENV='development'
npm run seed:local-demo
```

Review the complete preview before any write. Applying requires separate explicit authorization, the exact confirmation value, and a securely entered private password for the four synthetic staff accounts. Do not run this command unless you have reviewed the preview and explicitly authorized the write:

```powershell
$env:NODE_ENV='development'
$env:LOCAL_DEMO_SEED_CONFIRM='APPLY-LOCAL-BHOOMIDRISHTI-DEMO'
$securePassword = Read-Host 'Synthetic demo staff password (12 characters minimum)' -AsSecureString
$env:DEMO_PASSWORD = [System.Net.NetworkCredential]::new('', $securePassword).Password
try { npm run seed:local-demo -- --apply } finally {
  Remove-Item Env:LOCAL_DEMO_SEED_CONFIRM,Env:DEMO_PASSWORD -ErrorAction SilentlyContinue
  Remove-Variable securePassword -ErrorAction SilentlyContinue
}
```

The fixture creates 18 projects, 180 parcels, 120 field verifications, 40 notifications, and audit entries for each seeded user and data record. One hundred fictional owners are embedded in parcel records because the application has no separate owner model or owner collection. It creates four `isDemo:true` staff accounts so verification, approval, and audit references are valid; it never changes the existing administrator. All projects, village labels, survey references, owner details, coordinates, documents, workflow states, and audit events are explicitly synthetic and are not official or verified records. No actual document files are uploaded. The script uses stable IDs and namespaced codes, updates only matching demo records, aborts on identity conflicts, and never deletes data. If an apply is interrupted, preview again and rerun only after reviewing its output.

## API currently exposed

Data endpoints require both a live MongoDB connection and an authenticated session. Sessions are server-side MongoDB records, issued in `HttpOnly`, `SameSite=Strict` cookies, stored as SHA-256 token digests, and expire after 12 hours. Passwords use Node.js scrypt hashes. Production cookies include `Secure`. CORS uses the configured exact origin allowlist and credentials.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | API/database health. |
| `POST` | `/api/auth/login` | Sign in; synthetic demo accounts are accepted only when `NODE_ENV=development`. |
| `POST` | `/api/auth/demo-login` | Development-only sign-in restricted to synthetic demo accounts. |
| `GET`, `PATCH` | `/api/auth/me` | Read or update the signed-in user's own profile/password. |
| `POST` | `/api/auth/logout` | Revoke the current session. |
| `GET`, `POST` | `/api/projects` | List or create projects. |
| `GET`, `PUT`, `DELETE` | `/api/projects/:id` | Read, update, or delete a project. |
| `GET`, `POST` | `/api/land-parcels` | List or create parcels. |
| `GET`, `PUT`, `DELETE` | `/api/land-parcels/:id` | Read, update, or delete a parcel. |
| `GET`, `POST` | `/api/field-verifications` | List or create field-verification records. |
| `GET`, `PUT` | `/api/field-verifications/:id` | Read or update a verification. Pending inspections can be completed or rejected; final records are retained. |
| `GET` | `/api/users/field-officers` | List field officers for inspection assignment. |
| `GET`, `POST` | `/api/acquisition-proposals` | Paginated proposal register and draft creation. |
| `GET`, `PUT` | `/api/acquisition-proposals/:id` | Read a proposal authorized for the current role or update an editable draft. |
| `GET` | `/api/acquisition-proposals/reviewers` | List reviewer names for authorized proposal management users. |
| `POST` | `/api/acquisition-proposals/:id/submit` | Submit a draft or resubmitted proposal. |
| `POST` | `/api/acquisition-proposals/:id/assign-reviewer` | Admin assigns an existing reviewer and starts review. |
| `POST` | `/api/acquisition-proposals/:id/review` | Assigned reviewer or admin requests changes, approves, or rejects with remarks. |
| `POST` | `/api/acquisition-proposals/:id/withdraw` | Withdraw an eligible draft or submitted proposal. |
| `POST` | `/api/acquisition-proposals/:id/link-project` | Link an approved proposal to one existing project; does not create projects or parcels. |
| `GET` | `/api/notifications` | List persisted notifications, including per-user read state. |
| `PATCH` | `/api/notifications/:id/read` | Mark one notification as read for the signed-in user and record an audit event. |
| `PATCH` | `/api/notifications/read-all` | Mark all unread notifications as read for the signed-in user and record audit events. |
| `POST` | `/api/notifications/:id/resolve` | Resolve a notification. |
| `GET` | `/api/audit-logs` | Read recorded audit events and field-verification outcome history. |
| `GET` | `/api/readiness` | Calculate readiness for parcel records; optionally accept `projectId` or `parcelId` query parameters. |

Project and parcel writes require `admin` or `project_officer`; destructive project/parcel deletes require `admin`; inspection writes require `admin`, `project_officer`, or the assigned `field_officer`; notification resolution requires `admin` or `project_officer`. Field officers can only read/update their own assigned inspections. Ordinary users cannot change their own role. These controls are a starter application authorization model and still require deployment security review, TLS, backup policy, monitoring, and operational access procedures before public service.

Acquisition proposals are separate records and may exist before a project. Proposal numbers are generated on the server. Admins and project officers may create drafts; project officers may edit their own drafts, while admins may edit any draft. Admins assign reviewers; reviewers may see and act only on proposals assigned to them. Admins and assigned reviewers can review, but the submitter/creator cannot review their own proposal. Field officers have no proposal access; viewers have read-only access. Review decisions require remarks. Proposal document entries contain metadata only; no file upload/storage is implemented. Proposal events generate targeted in-app notifications and audit entries. Audit writes remain separate from business writes, so a failed audit insert can occur after a business change has persisted; atomic transactions or an outbox remain a separately approved architecture change.

## Smart parcel readiness

`GET /api/readiness` calculates a deterministic, rules-based score (0–100; higher means more ready) from current MongoDB records. The API returns the factors, deductions, related record IDs, and next-step recommendations per parcel.

Default scoring deductions are defined in `backend/services/readiness.js`: missing required document (15 each), unconfigured project checklist (15), missing inspection (15), pending inspection (10), overdue inspection (20), pending or rejected approval (15), unknown approval (10), outstanding compensation (20; 25 when overdue), unknown compensation obligation (10), and overdue project milestone (10 each). A project's `readinessWeights` may override any named deduction using a nonnegative number; unspecified values retain their defaults. Scores are clamped to 0–100. Risk bands: high `<50`, moderate `50–74`, low `75–100`.

Projects may configure mandatory document types with `requiredDocumentTypes`. A project without a configured checklist is explicitly penalized and flagged instead of being treated as complete. Inspection due dates and compensation due dates are optional model fields. Compensation is not treated as legally assessed by this score; legal entitlement rules are not implemented. The indicator is not a machine-learning prediction or a validated forecast.

## GIS

The parcel map uses point coordinates stored with parcel records and OpenStreetMap tiles. It displays only records with valid point coordinates; map color reflects the same readiness risk bands used on the readiness page. It does not infer parcel boundaries or legal survey accuracy. Synthetic points are explicitly labeled. Configure a tile provider and observe its usage terms before production use.

## Departments, locations, and survey references

The project form offers a small maintained department/agency catalogue that distinguishes several ministries, departments, and implementing agencies. It is not a complete national master-data service. Project/parcel geographic names and administrative codes are currently entered manually. The repository does not include an authoritative, versioned LGD state/district/subdistrict/village dataset or a verified location-code service; the UI deliberately labels these fields as manual/source-verified rather than fabricating dependent dropdowns or official codes. A production location selector should be populated from an approved, versioned government dataset and retain source/version metadata.

Survey references remain strings, so leading zeros and jurisdiction-specific suffixes are preserved. No all-India format is imposed. Duplicate checks are scoped using provided jurisdiction fields when available and fall back to project scope when no jurisdiction is recorded. Synthetic demo references are prefixed with `DEMO-` and are not official survey identifiers.

## Tests and checks

Backend unit tests use Node's built-in test runner:

```powershell
cd backend
npm test
```

Frontend checks:

```powershell
cd frontend
npm run lint
npm run build
```

## Known limitations

- Authentication, hashed passwords, MongoDB-backed sessions, login/logout, own-profile editing, and role checks are implemented. There is no external identity provider, email verification, password reset flow, account-management interface, rate-limiting service, or configured notification-preference API.
- Project and parcel creation/editing, project archiving, project list search/filter/sort/pagination, field-inspection assignment, completion/rejection/reopening, status remarks, and inspection outcome history are implemented. The UI offers project archiving rather than general record deletion; API delete routes require admin authorization and association checks.
- Notification resolution requires a reason and role authorization; it records actor/time/reason and writes an audit event. Alerts are not generated/reconciled automatically from changing blockers, and resolution is not yet checked against the underlying blocker state.
- Notification read state is persisted per user. Delivery preferences and outbound email/SMS/push notification delivery are not implemented.
- There is no upload service or secure document storage. Verification photo fields have metadata only; the UI does not upload image files. Required documents, approvals, compensation approval/payment, R&R, affected-family, possession, and project-closure workflows are not separate persisted case models or complete operational workflows; some values remain embedded in parcel documents.
- Acquisition proposal management supports a draft/submit/review/request-changes/approve/reject/withdraw lifecycle and explicit linking to an existing project. It does not create projects or land parcels, store proposal document files, provide authoritative department/location master data, or guarantee atomicity between proposal mutations and audit inserts.
- The department list is not administrator-managed. No authoritative comprehensive LGD location dataset/dependent selector is bundled. Survey references are strings, but a jurisdiction-specific legal-format validator/source-integrity service is not configured.
- Readiness deductions are transparent, cumulative and bounded to integer scores; records link to parcel detail, but dedicated document/approval/milestone action routes are not implemented. It remains a rules-based indicator, not a prediction.
- CSV exports use loaded API data and escape fields against spreadsheet formulas; there are no PDF or server-side aggregate reports, and export filters/date ranges are limited.
- GIS uses parcel points only; parcel boundary geometry and PostGIS are not configured.
- The demo seed was previously verified against a local `_demo` MongoDB database. Login/session behavior has unit coverage; a newly bootstrapped administrator and the production deployment path must be configured and verified in the target environment. External notification delivery and production deployment are not available or verified.
