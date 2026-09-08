import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import api from '../services/api';
import type { User, AuthResponse } from '../types';

interface AuthContextType {
  user: User | null;
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
  const [loading, setLoading] = useState(() => !localStorage.getItem('token') ? false : true);

  const login = async (email: string, password: string) => {
    const response = await api.post<AuthResponse>('/auth/login', { email, password });
    const { token: newToken, user: newUser } = response.data;
    
    setUser(newUser);
    setToken(newToken);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/Login';
  };

  const checkAuth = async () => {
    try {
      const storedToken = localStorage.getItem('token');
      if (!storedToken) {
        setLoading(false);
        return;
      }
      
      setToken(storedToken);
      
      // Verify token with backend
      const response = await api.get<User>('/auth/me');
      setUser(response.data);
      localStorage.setItem('user', JSON.stringify(response.data));
    } catch (error) {
      console.error("Auth check failed:", error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      return;
    }

    api.get<User>('/auth/me')
      .then((response) => {
        if (isMounted) {
          setUser(response.data);
          localStorage.setItem('user', JSON.stringify(response.data));
        }
      })
      .catch((error) => {
        console.error("Auth check failed:", error);
        if (isMounted) {
          setUser(null);
          setToken(null);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!user, loading, login, logout, checkAuth }}>
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
