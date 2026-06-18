# Motor Originacao SRM Frontend

React + Vite workspace for the canonical Vercel deployment.

## Online-first contract

- The canonical deployment is the repository root on Vercel project `motor-originac-srm`.
- The frontend must call `/api/*` on the same Vercel deployment in production.
- Local development can use `VITE_API_BASE_URL=http://localhost:4000` after the Codespace backend is running.
- Do not deploy `frontend/` as an isolated Vercel project.
