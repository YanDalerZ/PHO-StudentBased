import { createContext, useCallback, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import api from '../services/api';
import type { User, AuthResponse, EffectiveAccess } from '../types';

interface AuthContextType {
  user: User | null;
  effectiveAccess: EffectiveAccess | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        return JSON.parse(savedUser) as User;
      } catch {
        return null;
      }
    }
    return null;
  });
  const [effectiveAccess, setEffectiveAccess] = useState<EffectiveAccess | null>(null);
  const [loading, setLoading] = useState(() => !localStorage.getItem('token') ? false : true);
  const refreshPromise = useRef<Promise<void> | null>(null);

  const login = async (email: string, password: string) => {
    const response = await api.post<AuthResponse>('/auth/login', { email, password });
    const { token: newToken, user: newUser, effectiveAccess: newAccess } = response.data;
    
    setUser(newUser);
    setEffectiveAccess(newAccess);
    setToken(newToken);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
  };

  const logout = useCallback(() => {
    setUser(null);
    setEffectiveAccess(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/Login';
  }, []);

  const checkAuth = useCallback(async () => {
    if (refreshPromise.current) return refreshPromise.current;

    const refresh = (async () => {
      try {
      const storedToken = localStorage.getItem('token');
      if (!storedToken) {
        setUser(null);
        setEffectiveAccess(null);
        setToken(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setToken(storedToken);
      const response = await api.get<{ user?: User; effectiveAccess?: EffectiveAccess } | User>('/auth/me');
      const resData = response.data;
      const actualUser = (resData && 'user' in resData && resData.user) ? resData.user : (resData as User);
      const actualAccess = (resData && 'effectiveAccess' in resData && resData.effectiveAccess) ? resData.effectiveAccess : null;
      setUser(actualUser);
      setEffectiveAccess(actualAccess);
      localStorage.setItem('user', JSON.stringify(actualUser));
      } catch (error) {
        console.error('Auth check failed:', error);
        logout();
      } finally {
        setLoading(false);
      }
    })();

    refreshPromise.current = refresh.finally(() => {
      refreshPromise.current = null;
    });
    return refreshPromise.current;
  }, [logout]);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  return (
    <AuthContext.Provider value={{ user, effectiveAccess, token, isAuthenticated: !!user, loading, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
