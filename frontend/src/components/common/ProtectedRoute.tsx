import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner } from './LoadingSpinner';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: string[];
}

export const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/Login', { state: { from: location.pathname }, replace: true });
    } else if (!loading && isAuthenticated && allowedRoles && user) {
      if (!allowedRoles.includes(user.role)) {
        // Redirect to their respective dashboard if they lack access
        if (user.role === 'admin') navigate('/admin');
        else if (user.role === 'superuser') navigate('/superuser');
        else navigate('/teacher');
      }
    }
  }, [loading, isAuthenticated, allowedRoles, user, navigate, location]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-surface-dark flex items-center justify-center">
        <LoadingSpinner size={48} />
      </div>
    );
  }

  // If not authenticated or not authorized, return null to prevent flash of content
  if (!isAuthenticated || (allowedRoles && user && !allowedRoles.includes(user.role))) {
    return null;
  }

  return <>{children}</>;
};
