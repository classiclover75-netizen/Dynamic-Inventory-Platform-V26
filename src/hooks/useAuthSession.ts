import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { installAuthFetchGuard, setUnauthorizedListener } from '../lib/authFetchGuard';

export type AuthStatus = 'loading' | 'setup' | 'login' | 'authed';
export type AuthRole = 'master' | 'slave';

export interface AuthContextValue {
  status: AuthStatus;
  username: string | null;
  role: AuthRole | null;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    return {
      status: 'loading',
      username: null,
      role: null,
      logout: async () => {},
      refresh: async () => {}
    };
  }
  return value;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string' && data.error.length > 0) {
      return data.error;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export function useAuthSession() {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<AuthRole | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status', { credentials: 'same-origin' });
      if (!res.ok) {
        setStatus('login');
        setUsername(null);
        setRole(null);
        return;
      }
      const data = await res.json();
      if (data.setupRequired === true) {
        setStatus('setup');
        setUsername(null);
        setRole(null);
        return;
      }
      if (data.authenticated === true) {
        setStatus('authed');
        setUsername(typeof data.username === 'string' ? data.username : null);
        setRole(data.role === 'master' || data.role === 'slave' ? data.role : null);
        return;
      }
      setStatus('login');
      setUsername(null);
      setRole(null);
    } catch {
      setStatus('login');
      setUsername(null);
      setRole(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    installAuthFetchGuard();
    setUnauthorizedListener(() => {
      setStatus('login');
      setUsername(null);
      setRole(null);
    });
    return () => setUnauthorizedListener(null);
  }, []);

  const login = useCallback(async (name: string, password: string, rememberMe: boolean): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name, password, rememberMe })
      });
      if (!res.ok) {
        return await readError(res, 'Unable to sign in. Please try again.');
      }
      const data = await res.json();
      setStatus('authed');
      setUsername(typeof data.username === 'string' ? data.username : null);
      setRole(data.role === 'master' || data.role === 'slave' ? data.role : null);
      return null;
    } catch {
      return 'Unable to reach the server. Please try again.';
    }
  }, []);

  const setupMaster = useCallback(async (name: string, password: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name, password })
      });
      if (!res.ok) {
        return await readError(res, 'Unable to create the master account. Please try again.');
      }
      const data = await res.json();
      setStatus('authed');
      setUsername(typeof data.username === 'string' ? data.username : null);
      setRole(data.role === 'master' || data.role === 'slave' ? data.role : null);
      return null;
    } catch {
      return 'Unable to reach the server. Please try again.';
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
    }
    setStatus('login');
    setUsername(null);
    setRole(null);
  }, []);

  return { status, username, role, refresh, login, setupMaster, logout };
}
