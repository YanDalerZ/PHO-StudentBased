import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
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
  LogOut,
  User as UserIcon,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar = ({ onClose }: SidebarProps) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!user) return null;

  const role = user.role;

  // Define links based on roles
  const getNavLinks = () => {
    switch (role) {
      case 'teacher':
        return [
          { name: 'Dashboard', path: '/teacher', icon: LayoutDashboard },
          { name: 'Students', path: '/teacher/students', icon: Users },
        ];
      case 'superuser':
        return [
          { name: 'Overview', path: '/superuser/dashboard', icon: LayoutDashboard },
          { name: 'Patients', path: '/superuser/patient-info', icon: FileText },
          { name: 'Oral Health', path: '/superuser/oral-health', icon: Heart },
          { name: 'Deworming', path: '/superuser/deworming', icon: Droplets },
          { name: 'Immunization', path: '/superuser/immunization', icon: Syringe },
          { name: 'Vitals', path: '/superuser/vital-signs', icon: Activity },
        ];
      case 'admin':
        return [
          { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
          { name: 'Users', path: '/admin/users', icon: Users },
          { name: 'Modules', path: '/admin/modules', icon: Settings },
          { name: 'Schools', path: '/admin/schools', icon: School },
          { name: 'Settings', path: '/admin/settings', icon: Building2 },
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
      {/* ------------------- DESKTOP SIDEBAR ------------------- */}
      <aside className={cn(
        "hidden md:flex fixed inset-y-0 left-0 z-50 bg-white border-r border-slate-200 flex-col transition-all duration-300 ease-in-out static translate-x-0",
        isCollapsed ? "w-20" : "w-64"
      )}>
        {/* Header with logo.png & Top-Right Collapse Button */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100 bg-white overflow-hidden">
          <div className="flex items-center space-x-2.5 min-w-0">
            <img
              src="/logo.png"
              alt="Logo"
              className="w-8 h-8 object-contain shrink-0"
            />
            {!isCollapsed && (
              <h1 className="text-xl font-bold text-black tracking-tight truncate">
                PHO<span className="text-emerald-600">Student</span>
              </h1>
            )}
          </div>

          {/* Desktop Collapse Toggle Button in Top Right Corner */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-6 px-3 space-y-1 bg-white">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path || (location.pathname.startsWith(link.path) && link.path !== '/teacher' && link.path !== '/dashboard' && link.path !== '/admin');

            return (
              <Link
                key={link.path}
                to={link.path}
                title={isCollapsed ? link.name : undefined}
                className={cn(
                  "relative flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group overflow-hidden",
                  isActive
                    ? "text-emerald-700 bg-emerald-50/80 font-semibold border border-emerald-100"
                    : "text-black hover:bg-slate-50 hover:text-emerald-600",
                  isCollapsed && "justify-center px-2"
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 bg-emerald-600 rounded-r-full" />
                )}

                <link.icon className={cn(
                  "w-5 h-5 transition-colors shrink-0",
                  isActive ? "text-emerald-600" : "text-black group-hover:text-emerald-600"
                )} />

                {!isCollapsed && <span className="truncate">{link.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer Area: Profile View & Logout */}
        <div className="p-4 border-t border-slate-100 bg-white space-y-2">
          {/* View User Profile Card */}
          <button
            onClick={handleViewProfile}
            title={isCollapsed ? `${user.email} (${user.role})` : undefined}
            className={cn(
              "w-full text-left bg-white hover:bg-slate-50 rounded-xl p-3 border border-slate-200 transition-colors flex items-center justify-between group shadow-sm cursor-pointer",
              isCollapsed && "justify-center p-2"
            )}
          >
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 text-emerald-600">
                <UserIcon className="w-4 h-4" />
              </div>
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500 font-medium">Logged in as</p>
                  <p className="text-sm font-semibold text-black truncate">{user.email}</p>
                  <p className="text-xs text-emerald-600 font-medium capitalize">{user.role}</p>
                </div>
              )}
            </div>
            {!isCollapsed && (
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-black transition-colors shrink-0" />
            )}
          </button>

          {/* Log Out Button */}
          <button
            onClick={handleLogout}
            title={isCollapsed ? "Log Out" : undefined}
            className={cn(
              "w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 transition-all border border-transparent hover:border-rose-100 cursor-pointer",
              isCollapsed && "justify-center px-2"
            )}
          >
            <LogOut className="w-5 h-5 text-rose-600 shrink-0" />
            {!isCollapsed && <span>Log Out</span>}
          </button>
        </div>
      </aside>

      {/* ------------------- MOBILE BOTTOM BAR ------------------- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 shadow-lg px-2 py-1.5 flex items-center justify-around">
        {navLinks.map((link) => {
          const isActive = location.pathname === link.path || (location.pathname.startsWith(link.path) && link.path !== '/teacher' && link.path !== '/dashboard' && link.path !== '/admin');

          return (
            <Link
              key={link.path}
              to={link.path}
              className={cn(
                "flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all text-center",
                isActive
                  ? "text-emerald-600 font-semibold"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              <div className={cn(
                "p-1 rounded-lg transition-colors",
                isActive && "bg-emerald-50"
              )}>
                <link.icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] tracking-tight truncate max-w-[64px] mt-0.5">
                {link.name}
              </span>
            </Link>
          );
        })}

        {/* Mobile Profile Link */}
        <button
          onClick={handleViewProfile}
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all text-center cursor-pointer",
            location.pathname.endsWith('/profile')
              ? "text-emerald-600 font-semibold"
              : "text-slate-500 hover:text-slate-900"
          )}
        >
          <div className={cn(
            "p-1 rounded-lg transition-colors",
            location.pathname.endsWith('/profile') && "bg-emerald-50"
          )}>
            <UserIcon className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight truncate max-w-[64px] mt-0.5">
            Profile
          </span>
        </button>

        {/* Mobile Logout Link */}
        <button
          onClick={handleLogout}
          className="flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl text-rose-500 hover:text-rose-700 transition-all text-center cursor-pointer"
        >
          <div className="p-1 rounded-lg">
            <LogOut className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight truncate max-w-[64px] mt-0.5">
            Logout
          </span>
        </button>
      </nav>
    </>
  );
};

export default Sidebar;