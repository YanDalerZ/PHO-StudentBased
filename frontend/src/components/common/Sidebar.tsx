import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  Heart,
  Droplets,
  Syringe,
  Activity,
  School,
  Building2,
  X,
  LogOut,
  User as UserIcon,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar = ({ isOpen = false, onClose }: SidebarProps) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) return null;

  const role = user.role;

  // Define links based on roles
  const getNavLinks = () => {
    switch (role) {
      case 'teacher':
        return [
          { name: 'Dashboard', path: '/teacher', icon: LayoutDashboard },
          { name: 'Student Registry', path: '/teacher/students', icon: Users },
        ];
      case 'superuser':
        return [
          { name: 'Overview', path: '/superuser/dashboard', icon: LayoutDashboard },
          { name: 'Patient Registry', path: '/superuser/patient-info', icon: FileText },
          { name: 'Oral Health', path: '/superuser/oral-health', icon: Heart },
          { name: 'Deworming', path: '/superuser/deworming', icon: Droplets },
          { name: 'Immunization', path: '/superuser/immunization', icon: Syringe },
          { name: 'Vital Signs', path: '/superuser/vital-signs', icon: Activity },
        ];
      case 'admin':
        return [
          { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
          { name: 'User Management', path: '/admin/users', icon: Users },
          { name: 'Module Config', path: '/admin/modules', icon: Settings },
          { name: 'School Management', path: '/admin/schools', icon: School },
          { name: 'System Settings', path: '/admin/settings', icon: Building2 },
        ];
      default:
        return [];
    }
  };

  const navLinks = getNavLinks();

  const handleLogout = async () => {
    try {
      if (logout) {
        await logout();
      }
      if (onClose) onClose();
      navigate('/Login');
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };

  const handleViewProfile = () => {
    if (onClose) onClose();
    navigate(`/${role}/profile`);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Content */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-300 ease-in-out md:static md:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800 transition-colors duration-300">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            PHO<span className="text-teal-600 dark:text-teal-500">Student</span>
          </h1>
          <button
            onClick={onClose}
            className="md:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path || (location.pathname.startsWith(link.path) && link.path !== '/teacher' && link.path !== '/dashboard' && link.path !== '/admin');

            return (
              <Link
                key={link.path}
                to={link.path}
                onClick={onClose}
                className={cn(
                  "relative flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group overflow-hidden",
                  isActive
                    ? "text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10 border border-teal-200/60 dark:border-teal-500/20"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80"
                )}
              >
                {/* Active Indicator Bar */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 bg-teal-600 dark:bg-teal-400 rounded-r-full" />
                )}

                <link.icon className={cn(
                  "w-5 h-5 transition-colors",
                  isActive ? "text-teal-600 dark:text-teal-400" : "text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200"
                )} />
                <span className="truncate">{link.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer Area: Profile View & Logout */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2 transition-colors duration-300">
          {/* View User Profile Card */}
          <button
            onClick={handleViewProfile}
            className="w-full text-left bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 rounded-xl p-3 border border-slate-200 dark:border-slate-700/50 transition-colors flex items-center justify-between group"
          >
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center shrink-0 text-teal-600 dark:text-teal-400">
                <UserIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Logged in as</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user.email}</p>
                <p className="text-xs text-teal-600 dark:text-teal-500 font-medium capitalize">{user.role}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors shrink-0" />
          </button>

          {/* Log Out Button */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all border border-transparent hover:border-rose-200 dark:hover:border-rose-500/20"
          >
            <LogOut className="w-5 h-5" />
            <span>Log Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;