import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import api from '../services/api';
import type { User, AuthResponse, EffectiveAccess } from '../types';
import { endPortalSession, type PortalSessionStatus, type SessionEndReason } from '../lib/portalSession';
import { SessionWarning } from '../components/common/SessionWarning';

interface AuthContextType {
  user: User | null;
  effectiveAccess: EffectiveAccess | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
const isPortalPage = () => !/^\/(Login|register\/)/i.test(window.location.pathname);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(null);
  const [effectiveAccess, setEffectiveAccess] = useState<EffectiveAccess | null>(null);
  const [loading, setLoading] = useState(() => !!localStorage.getItem('token') && isPortalPage());
  const [session, setSession] = useState<PortalSessionStatus | null>(null);
  const [now, setNow] = useState(0);
  const [clockOffsetMs, setClockOffset] = useState(0);
  const [continuing, setContinuing] = useState(false);
  const refreshPromise = useRef<Promise<void> | null>(null);
  const lastActivitySent = useRef(0);
  const lastCheck = useRef(0);
  const clockOffset = useRef(0);
  const sessionRef = useRef<PortalSessionStatus | null>(null);
  const pendingRef = useRef(false);

  const setCurrentSession = useCallback((next: PortalSessionStatus) => {
    clockOffset.current = new Date(next.serverTime).getTime() - Date.now();
    setClockOffset(clockOffset.current);
    sessionRef.current = next;
    setSession(next);
    localStorage.setItem('portal_session_status', JSON.stringify(next));
  }, []);

  const clearState = useCallback(() => {
    setToken(null); setUser(null); setEffectiveAccess(null); setSession(null);
    sessionRef.current = null;
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const response = await api.post<AuthResponse>('/auth/login', { email, password });
    const { token: newToken, user: newUser, effectiveAccess: newAccess, session: newSession } = response.data;
    localStorage.removeItem('portal_session_end');
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setUser(newUser); setEffectiveAccess(newAccess); setToken(newToken);
    setCurrentSession(newSession);
  };

  const logout = useCallback(async () => {
    try { if (localStorage.getItem('token')) await api.post('/auth/logout'); }
    catch { /* the browser still clears credentials if the server has expired */ }
    if (!localStorage.getItem('token')) { clearState(); return; }
    clearState();
    endPortalSession('signed-out');
  }, [clearState]);

  const checkAuth = useCallback(async () => {
    if (refreshPromise.current) return refreshPromise.current;
    const refresh = (async () => {
      const storedToken = localStorage.getItem('token');
      if (!storedToken) { clearState(); return; }
      setLoading(true);
      try {
        const [me, status] = await Promise.all([
          api.get<{ user: User; effectiveAccess: EffectiveAccess }>('/auth/me'),
          api.get<{ session: PortalSessionStatus }>('/auth/session'),
        ]);
        if (localStorage.getItem('token') !== storedToken) return;
        setUser(me.data.user);
        setEffectiveAccess(me.data.effectiveAccess);
        setToken(storedToken);
        setCurrentSession(status.data.session);
        localStorage.setItem('user', JSON.stringify(me.data.user));
      } catch {
        if (localStorage.getItem('token') === storedToken) clearState();
      } finally { setLoading(false); }
    })();
    refreshPromise.current = refresh.finally(() => { refreshPromise.current = null; });
    return refreshPromise.current;
  }, [clearState, setCurrentSession]);

  // The public QR form uses only publicApi. Never validate or transmit a
  // signed-in portal token while rendering that route.
  useEffect(() => {
    if (/^\/register\//i.test(window.location.pathname)) return;
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'token') {
        if (!event.newValue) {
          clearState();
          const reason = (localStorage.getItem('portal_session_end') || 'signed-out') as SessionEndReason;
          window.location.replace(`/Login?reason=${encodeURIComponent(reason)}`);
        } else if (event.newValue !== token) void checkAuth();
      }
      if (event.key === 'portal_session_status' && event.newValue && localStorage.getItem('token')) {
        try {
          const next = JSON.parse(event.newValue) as PortalSessionStatus;
          clockOffset.current = new Date(next.serverTime).getTime() - Date.now();
          setClockOffset(clockOffset.current);
          sessionRef.current = next;
          setSession(next);
        } catch { /* wait for server check */ }
      }
    };
    const onEnd = () => clearState();
    window.addEventListener('storage', onStorage);
    window.addEventListener('portal-session-ended', onEnd);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('portal-session-ended', onEnd); };
  }, [checkAuth, clearState, token]);

  const continueSession = useCallback(async () => {
    if (pendingRef.current || !localStorage.getItem('token') || !isPortalPage()) return;
    pendingRef.current = true;
    setContinuing(true);
    try {
      const response = await api.post<{ session: PortalSessionStatus }>('/auth/session/activity');
      setCurrentSession(response.data.session);
      lastActivitySent.current = Date.now();
    } finally {
      pendingRef.current = false;
      setContinuing(false);
    }
  }, [setCurrentSession]);

  useEffect(() => {
    if (!token) return;
    const onInteraction = (event: Event) => {
      if (!event.isTrusted) return;
      if (!isPortalPage() || pendingRef.current || !sessionRef.current) return;
      if (document.getElementById('session-warning-dialog')) return;
      if (event.type === 'keydown' && (event as KeyboardEvent).repeat) return;
      const deadline = Math.min(new Date(sessionRef.current.idleExpiresAt).getTime(), new Date(sessionRef.current.maxExpiresAt).getTime());
      if (deadline - (Date.now() + clockOffset.current) <= 60_000) return;
      if (Date.now() - lastActivitySent.current < 20_000) return;
      lastActivitySent.current = Date.now();
      void continueSession().catch(() => { lastActivitySent.current = 0; });
    };
    for (const type of ['pointerdown', 'keydown', 'input', 'scroll', 'touchstart']) {
      document.addEventListener(type, onInteraction, { passive: true });
    }
    return () => {
      for (const type of ['pointerdown', 'keydown', 'input', 'scroll', 'touchstart']) document.removeEventListener(type, onInteraction);
    };
  }, [token, continueSession]);

  useEffect(() => {
    if (!token) return;
    let checking = false;
    const interval = window.setInterval(() => {
      setNow(Date.now());
      if (!isPortalPage() || checking || !sessionRef.current) return;
      const remaining = Math.min(new Date(sessionRef.current.idleExpiresAt).getTime(), new Date(sessionRef.current.maxExpiresAt).getTime()) - (Date.now() + clockOffset.current);
      if (remaining > 0 && Date.now() - lastCheck.current < 15_000) return;
      checking = true;
      lastCheck.current = Date.now();
      void api.get<{ session: PortalSessionStatus }>('/auth/session')
        .then(response => setCurrentSession(response.data.session))
        .catch(() => { /* 401 is handled by the API interceptor; transient errors retry */ })
        .finally(() => { checking = false; });
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [token, setCurrentSession]);

  const serverNow = now + clockOffsetMs;
  const idleSeconds = session ? Math.max(0, Math.ceil((new Date(session.idleExpiresAt).getTime() - serverNow) / 1000)) : 0;
  const maxSeconds = session ? Math.max(0, Math.ceil((new Date(session.maxExpiresAt).getTime() - serverNow) / 1000)) : 0;
  const warning = !!token && isPortalPage() && !!session && Math.min(idleSeconds, maxSeconds) <= 60;

  return <AuthContext.Provider value={{ user, effectiveAccess, token, isAuthenticated: !!user, loading, login, logout, checkAuth }}>
    {children}
    {warning && <SessionWarning seconds={Math.min(idleSeconds, maxSeconds)} maximum={maxSeconds <= idleSeconds}
      pending={continuing} onContinue={() => void continueSession().catch(() => undefined)} onLogout={() => void logout()} />}
  </AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
