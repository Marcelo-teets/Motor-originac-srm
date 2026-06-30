// The API is served from the same Vercel deployment as the frontend via /api/* rewrites.
// Using a relative path ensures this works regardless of which deployment URL is active.
// To point to an explicit URL, set VITE_API_BASE_URL in Vercel environment variables.
export const PRODUCTION_API_BASE_URL = '/api';
