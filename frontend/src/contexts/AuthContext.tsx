import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

// Provide basic typing until types/index.ts is fully implemented
export interface User {
  id: string;
  email: string;
  role: 'teacher' | 'superuser' | 'admin' | string;
}

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
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const login = async (email: string, password: string) => {
    setLoading(true);
    
    return new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        setLoading(false);
        if (password === 'password123') {
          if (email === 'teacher@pho.gov.ph') {
            setUser({ id: '1', email, role: 'teacher' });
            setToken('mock-jwt-token-teacher');
            resolve();
          } else if (email === 'super@pho.gov.ph') {
            setUser({ id: '2', email, role: 'superuser' });
            setToken('mock-jwt-token-super');
            resolve();
          } else if (email === 'admin@pho.gov.ph') {
            setUser({ id: '3', email, role: 'admin' });
            setToken('mock-jwt-token-admin');
            resolve();
          } else {
            reject(new Error('Invalid credentials'));
          }
        } else {
          reject(new Error('Invalid credentials'));
        }
      }, 800);
    });
  };

  const logout = () => {
    setUser(null);
    setToken(null);
  };

  const checkAuth = async () => {
    // Placeholder for checking token validity
  };

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
