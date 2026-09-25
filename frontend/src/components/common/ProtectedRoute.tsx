import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner } from './LoadingSpinner';
import type { ModulePermissions, ModuleSlug } from '../../types';
import { hasModulePermission } from '../../lib/access';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: Array<'school_staff' | 'superuser' | 'admin'>;
  requiredModule?: ModuleSlug;
  requiredAction?: keyof ModulePermissions;
}

export const ProtectedRoute = ({ children, allowedRoles, requiredModule, requiredAction }: ProtectedRouteProps) => {
  const { user, effectiveAccess, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isRoleAllowed = (portalRole?: string) => {
    if (!allowedRoles || allowedRoles.length === 0) return true;
    if (!portalRole) return false;
    return allowedRoles.includes(portalRole as 'school_staff' | 'superuser' | 'admin');
  };

  const hasRequiredPermission = () => {
    if (!requiredModule || !requiredAction) return true;
    return hasModulePermission(effectiveAccess, requiredModule, requiredAction);
  };

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/Login', { state: { from: location.pathname }, replace: true });
    }
  }, [loading, isAuthenticated, navigate, location]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-surface-dark flex items-center justify-center">
        <LoadingSpinner size={48} />
      </div>
    );
  }

  // If unauthenticated, return null while navigate('/Login') fires in useEffect
  if (!isAuthenticated) {
    return null;
  }

  // If authenticated but unauthorized, render clear Forbidden UI
  if (!isRoleAllowed(user?.portal_role) || !hasRequiredPermission()) {
    const dashboardPath = user?.portal_role === 'admin'
      ? '/admin'
      : user?.portal_role === 'superuser'
      ? '/superuser'
      : '/teacher/dashboard';

    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 dark:bg-rose-500/20 text-rose-500 flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">403: Access Denied</h2>
        <p className="text-slate-600 dark:text-slate-400 max-w-md mb-6 text-sm">
          You do not have the required permissions {requiredModule ? `for the "${requiredModule}" module` : 'to view this page'}. Please contact your administrator if you believe this is an error.
        </p>
        <button
          onClick={() => navigate(dashboardPath)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium shadow-sm transition-colors text-sm cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Dashboard
        </button>
      </div>
    );
  }

  return <>{children}</>;
};
