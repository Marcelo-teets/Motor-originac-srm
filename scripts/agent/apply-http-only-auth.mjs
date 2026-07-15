import fs from 'node:fs';

const replaceOnce = (path, before, after) => {
  const current = fs.readFileSync(path, 'utf8');
  if (!current.includes(before)) throw new Error(`Anchor not found in ${path}`);
  fs.writeFileSync(path, current.replace(before, after));
};

replaceOnce(
  'backend/src/lib/auth.ts',
  `export type AuthSession = {\n  access_token: string;\n  refresh_token?: string;\n  expires_at: number;\n  user: { id: string; email?: string; role?: string };\n};`,
  `export type AuthSession = {\n  access_token: string;\n  refresh_token?: string;\n  expires_at: number;\n  user: { id: string; email?: string; role?: string };\n};\nexport type PublicAuthSession = Omit<AuthSession, 'access_token' | 'refresh_token'>;\nexport const authCookieName = 'motor_originacao_session';`,
);

replaceOnce(
  'backend/src/lib/auth.ts',
  `const mapSession = (payload: Record<string, any>): AuthSession => ({\n  access_token: String(payload.access_token ?? ''),\n  refresh_token: typeof payload.refresh_token === 'string' ? payload.refresh_token : undefined,\n  expires_at: Date.now() + Number(payload.expires_in ?? 3600) * 1000,\n  user: {\n    id: String(payload.user?.id ?? payload.user?.sub ?? ''),\n    email: payload.user?.email,\n    role: payload.user?.role ?? payload.user?.app_metadata?.role ?? 'authenticated',\n  },\n});`,
  `const mapSession = (payload: Record<string, any>): AuthSession => ({\n  access_token: String(payload.access_token ?? ''),\n  refresh_token: typeof payload.refresh_token === 'string' ? payload.refresh_token : undefined,\n  expires_at: Date.now() + Number(payload.expires_in ?? 3600) * 1000,\n  user: {\n    id: String(payload.user?.id ?? payload.user?.sub ?? ''),\n    email: payload.user?.email,\n    role: payload.user?.role ?? payload.user?.app_metadata?.role ?? 'authenticated',\n  },\n});\n\nconst cookieSecure = () => process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview' || process.env.APP_ENV === 'production';\nconst cookieMaxAgeSeconds = (expiresAt: number) => Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));\nconst serializeCookie = (value: string, maxAge: number) => {\n  const parts = [\n    \`${authCookieName}=\${encodeURIComponent(value)}\`,\n    'Path=/',\n    'HttpOnly',\n    'SameSite=Lax',\n    \`Max-Age=\${maxAge}\`,\n    \`Expires=\${new Date(Date.now() + maxAge * 1000).toUTCString()}\`,\n  ];\n  if (cookieSecure()) parts.push('Secure');\n  return parts.join('; ');\n};\n\nexport const toPublicSession = (session: AuthSession): PublicAuthSession => ({ expires_at: session.expires_at, user: session.user });\nexport const buildAuthSessionCookie = (session: AuthSession) => serializeCookie(session.access_token, cookieMaxAgeSeconds(session.expires_at));\nexport const buildClearAuthSessionCookie = () => serializeCookie('', 0);\n\nconst parseCookieHeader = (header: string | undefined) => {\n  const cookies = new Map<string, string>();\n  for (const part of (header ?? '').split(';')) {\n    const [name, ...value] = part.trim().split('=');\n    if (name) cookies.set(name, value.join('='));\n  }\n  return cookies;\n};\n\nexport const extractAuthTokenFromCookieHeader = (header: string | undefined) => {\n  const value = parseCookieHeader(header).get(authCookieName);\n  return value ? decodeURIComponent(value) : undefined;\n};\n\nexport const resolveAccessToken = (req: Request) => {\n  const header = req.headers.authorization;\n  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);\n  return extractAuthTokenFromCookieHeader(req.headers.cookie);\n};`,
);

replaceOnce(
  'backend/src/lib/auth.ts',
  `  const header = req.headers.authorization;\n  if (!header?.startsWith('Bearer ')) {\n    res.status(401).json({ status: 'partial', generatedAt: new Date().toISOString(), error: 'Missing bearer token.' });\n    return;\n  }\n\n  try {\n    const accessToken = header.slice('Bearer '.length);`,
  `  const accessToken = resolveAccessToken(req);\n  if (!accessToken) {\n    res.status(401).json({ status: 'partial', generatedAt: new Date().toISOString(), error: 'Missing auth session.' });\n    return;\n  }\n\n  try {`,
);

replaceOnce(
  'backend/src/server.ts',
  `import { authMiddleware, fetchCurrentSupabaseUser, signInWithPassword, signOutSupabase } from './lib/auth.js';`,
  `import { authMiddleware, buildAuthSessionCookie, buildClearAuthSessionCookie, fetchCurrentSupabaseUser, resolveAccessToken, signInWithPassword, signOutSupabase, toPublicSession } from './lib/auth.js';`,
);

replaceOnce(
  'backend/src/server.ts',
  `  const session = await signInWithPassword(email, password);\n  res.json(ok('real', session));\n}));\n\napp.use(authMiddleware);`,
  `  const session = await signInWithPassword(email, password);\n  res.setHeader('Set-Cookie', buildAuthSessionCookie(session));\n  res.json(ok('real', toPublicSession(session)));\n}));\napp.post('/auth/logout', wrap(async (req, res) => {\n  const accessToken = resolveAccessToken(req);\n  res.setHeader('Set-Cookie', buildClearAuthSessionCookie());\n  if (accessToken) await signOutSupabase(accessToken).catch(() => undefined);\n  res.json(ok('real', { success: true }));\n}));\n\napp.use(authMiddleware);`,
);

replaceOnce(
  'backend/src/server.ts',
  `app.post('/auth/logout', wrap(async (req, res) => {\n  if (req.accessToken) await signOutSupabase(req.accessToken);\n  res.json(ok('real', { success: true }));\n}));\n\napp.get('/search-profiles',`,
  `app.get('/search-profiles',`,
);

replaceOnce(
  'frontend/src/lib/api.ts',
  `    response = await fetch(url, {\n      ...init,\n      headers: {`,
  `    response = await fetch(url, {\n      ...init,\n      credentials: 'include',\n      headers: {`,
);

replaceOnce(
  'frontend/src/lib/api.ts',
  `    const response = await fetch(buildApiUrl('/auth/login'), {\n      method: 'POST',`,
  `    const response = await fetch(buildApiUrl('/auth/login'), {\n      method: 'POST',\n      credentials: 'include',`,
);

replaceOnce(
  'frontend/src/lib/types.ts',
  `export type SessionData = { [key: string]: any; expires_at: number; user: { id: string; email?: string; role?: string } };`,
  `export type SessionData = { access_token?: string; refresh_token?: string; expires_at: number; user: { id: string; email?: string; role?: string } };`,
);

fs.writeFileSync('frontend/src/lib/auth.tsx', `import { createContext, useContext, useEffect, useMemo, useState } from 'react';\nimport type { PropsWithChildren } from 'react';\nimport { Navigate } from 'react-router-dom';\nimport { LoadingState } from '../components/UI';\nimport { api } from './api';\nimport type { SessionData } from './types';\n\ntype AuthContextValue = {\n  session: SessionData | null;\n  loading: boolean;\n  isAuthenticated: boolean;\n  login: (email: string, password: string) => Promise<void>;\n  logout: () => Promise<void>;\n};\n\nconst AuthContext = createContext<AuthContextValue | null>(null);\nconst sessionFromUser = (user: SessionData['user']): SessionData => ({ expires_at: Date.now() + 60 * 60 * 1000, user });\n\nexport function AuthProvider({ children }: PropsWithChildren) {\n  const [session, setSession] = useState<SessionData | null>(null);\n  const [loading, setLoading] = useState(true);\n\n  useEffect(() => {\n    let cancelled = false;\n    const syncSession = async () => {\n      try {\n        const user = await api.getMe(null);\n        if (!cancelled) setSession(sessionFromUser(user));\n      } catch {\n        if (!cancelled) setSession(null);\n      } finally {\n        if (!cancelled) setLoading(false);\n      }\n    };\n    void syncSession();\n    return () => { cancelled = true; };\n  }, []);\n\n  const value = useMemo<AuthContextValue>(() => ({\n    session,\n    loading,\n    isAuthenticated: Boolean(session?.user),\n    async login(email, password) {\n      setLoading(true);\n      try {\n        const nextSession = await api.login(email, password);\n        const user = await api.getMe(null).catch(() => nextSession.user);\n        setSession({ ...nextSession, user });\n      } finally {\n        setLoading(false);\n      }\n    },\n    async logout() {\n      try { await api.logout(null); } catch { /* cookie cleanup remains best effort */ }\n      setSession(null);\n    },\n  }), [loading, session]);\n\n  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;\n}\n\nexport const useAuth = () => {\n  const value = useContext(AuthContext);\n  if (!value) throw new Error('useAuth must be used inside AuthProvider');\n  return value;\n};\n\nexport function RequireAuth({ children }: PropsWithChildren) {\n  const auth = useAuth();\n  if (auth.loading) return <LoadingState title=\"Autenticação\" subtitle=\"Validando sessão Supabase antes de abrir a plataforma.\" />;\n  if (!auth.isAuthenticated) return <Navigate to=\"/login\" replace />;\n  return <>{children}</>;\n}\n`);
