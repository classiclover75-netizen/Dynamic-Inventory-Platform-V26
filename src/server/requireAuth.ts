import { getSession } from './authStore';

export const SESSION_COOKIE_NAME = 'div_sid';

const OPEN_API_PATHS = ['/health'];

export function parseCookies(cookieHeader: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (typeof cookieHeader !== 'string' || cookieHeader.length === 0) return result;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name.length === 0) continue;
    try {
      result[name] = decodeURIComponent(value);
    } catch {
      result[name] = value;
    }
  }
  return result;
}

export function readSessionToken(req: any): string | null {
  const cookies = parseCookies(req?.headers?.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  return typeof token === 'string' && token.length > 0 ? token : null;
}

export function setSessionCookie(req: any, res: any, token: string, rememberMe: boolean): void {
  const options: Record<string, any> = {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!req?.secure,
    path: '/'
  };
  if (rememberMe) {
    options.maxAge = 15 * 24 * 60 * 60 * 1000;
  }
  res.cookie(SESSION_COOKIE_NAME, token, options);
}

export function clearSessionCookie(req: any, res: any): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!req?.secure,
    path: '/'
  });
}

export async function requireAuth(req: any, res: any, next: any): Promise<void> {
  if (OPEN_API_PATHS.includes(req.path)) {
    next();
    return;
  }
  try {
    const token = readSessionToken(req);
    const session = await getSession(token);
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    req.authUser = { username: session.username, role: session.role };
    next();
  } catch (err) {
    console.error('Auth middleware error', err);
    res.status(401).json({ error: 'Authentication required.' });
  }
}

export function requireMaster(req: any, res: any, next: any): void {
  if (req?.authUser?.role === 'master') {
    next();
    return;
  }
  res.status(403).json({ error: 'Only the master account can perform this action.' });
}
