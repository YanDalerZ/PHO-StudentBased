import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner } from './LoadingSpinner';
import type { UserModulePermission } from '../../types';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: string[];
  requiredModule?: string;
  requiredAction?: keyof UserModulePermission;
}

export const ProtectedRoute = ({ children, allowedRoles, requiredModule, requiredAction }: ProtectedRouteProps) => {
  const { user, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/Login', { state: { from: location.pathname }, replace: true });
    } else if (!loading && isAuthenticated && user) {
      let isAuthorized = true;

      // Check role
      if (allowedRoles && !allowedRoles.includes(user.role)) {
        isAuthorized = false;
      }

      // Check module permission
      if (isAuthorized && requiredModule && requiredAction) {
        if (user.role !== 'admin') {
          const perms = user.effectiveAccess?.modulePermissions?.[requiredModule];
          if (!perms || !perms[requiredAction]) {
            isAuthorized = false;
          }
        }
      }

      if (!isAuthorized) {
        // Redirect to their respective dashboard if they lack access
        if (user.role === 'admin') navigate('/admin');
        else if (user.role === 'superuser') navigate('/superuser');
        else navigate('/staff');
      }
    }
  }, [loading, isAuthenticated, allowedRoles, requiredModule, requiredAction, user, navigate, location]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-surface-dark flex items-center justify-center">
        <LoadingSpinner size={48} />
      </div>
    );
  }

  // If not authenticated or not authorized, return null to prevent flash of content
  if (!isAuthenticated) return null;
  if (allowedRoles && user && !allowedRoles.includes(user.role)) return null;
  if (requiredModule && requiredAction && user && user.role !== 'admin') {
     const perms = user.effectiveAccess?.modulePermissions?.[requiredModule];
     if (!perms || !perms[requiredAction]) return null;
  }

  return <>{children}</>;
};
