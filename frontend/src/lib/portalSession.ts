export interface PortalSessionStatus {
  inactivityMinutes: 5 | 10 | 15;
  serverTime: string;
  idleExpiresAt: string;
  maxExpiresAt: string;
}

export type SessionEndReason = 'inactivity' | 'maximum' | 'signed-out' | 'invalid';

export function reasonFromCode(code: unknown): SessionEndReason {
  if (code === 'SESSION_INACTIVE') return 'inactivity';
  if (code === 'SESSION_MAXIMUM_EXPIRED') return 'maximum';
  if (code === 'SESSION_REVOKED') return 'signed-out';
  return 'invalid';
}

export function endPortalSession(reason: SessionEndReason): void {
  localStorage.setItem('portal_session_end', reason);
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('portal_session_status');
  window.dispatchEvent(new CustomEvent('portal-session-ended', { detail: reason }));
  window.location.replace(`/Login?reason=${encodeURIComponent(reason)}`);
}
