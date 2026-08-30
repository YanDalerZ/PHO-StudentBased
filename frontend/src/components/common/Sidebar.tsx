import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Settings, 
  Heart,
  Droplets,
  Brain,
  Syringe,
  School,
  Building2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';
import { X } from 'lucide-react';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar = ({ isOpen = false, onClose }: SidebarProps) => {
  const { user } = useAuth();
  const location = useLocation();

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
          { name: 'Patient Info', path: '/superuser/patient-info', icon: FileText },
          { name: 'Oral Health', path: '/superuser/oral-health', icon: Heart },
          { name: 'Deworming', path: '/superuser/deworming', icon: Droplets },
          { name: 'HEADSS', path: '/superuser/headss', icon: Brain },
          { name: 'Immunization', path: '/superuser/immunization', icon: Syringe },
          { name: 'Student Lookup', path: '/superuser/students', icon: Users },
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
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800 transition-colors duration-300">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">PHO<span className="text-teal-600 dark:text-teal-500">Student</span></h1>
          <button 
            onClick={onClose}
            className="md:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      
      <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
        {navLinks.map((link) => {
          const isActive = location.pathname === link.path || (location.pathname.startsWith(link.path) && link.path !== '/teacher' && link.path !== '/dashboard' && link.path !== '/admin');
          return (
            <Link
              key={link.path}
              to={link.path}
              onClick={onClose}
              className={cn(
                "flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                isActive
                  ? "text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80"
              )}
            >
              <link.icon className="w-5 h-5" />
              <span>{link.name}</span>
            </Link>
          )
        })}
      </nav>
      
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 transition-colors duration-300">
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700/50">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">Logged in as</p>
          <p className="text-sm text-slate-900 dark:text-white truncate">{user.email}</p>
          <p className="text-xs text-teal-600 dark:text-teal-500 font-medium capitalize mt-0.5">{user.role}</p>
        </div>
      </div>
    </aside>
    </>
  );
};
