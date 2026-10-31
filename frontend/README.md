# BhoomiDrishti frontend

This directory contains the React 19 and Vite frontend for the BhoomiDrishti land-acquisition monitoring application. It reads and writes live records through the authenticated Express API; it does not use a local mock-data fallback.

## Run locally

```powershell
npm install
npm run dev
```

By default, the API client uses `http://localhost:5000/api`. Set `VITE_API_BASE_URL` before starting Vite or building if the API is hosted elsewhere. The backend must be configured and running; see the repository [README](../README.md) for MongoDB, environment, administrator provisioning, and local demo setup.

## Checks

```powershell
npm run lint
npm run build
```

The application includes dashboard, project, parcel/map, field-verification, compensation and resettlement, notification, report/export, audit-log, settings, and rules-based parcel-readiness pages. Synthetic records are clearly identified and must not be used for legal or operational decisions.
