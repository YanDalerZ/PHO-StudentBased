import { LogOut, Menu, User, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useState, useEffect } from 'react';

interface TopbarProps {
  onMenuClick?: () => void;
}

export const Topbar = ({ onMenuClick }: TopbarProps) => {
  const { user, logout } = useAuth();
  
  // Basic theme toggling logic for completeness
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return true; // Default dark
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 backdrop-blur-md px-6 sticky top-0 z-20 flex items-center justify-between transition-colors duration-300">
      <div className="flex items-center">
        <button 
          onClick={onMenuClick}
          className="md:hidden mr-4 p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white capitalize hidden sm:block">
          {user?.role ? `${user.role} Portal` : 'Portal'}
        </h2>
      </div>

      <div className="flex items-center space-x-3">
        <button 
          onClick={() => setIsDark(!isDark)}
          className="p-3 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 backdrop-blur-md text-slate-700 dark:text-slate-300 shadow-sm transition-all"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        
        <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-2 hidden sm:block transition-colors"></div>
        
        <div className="hidden sm:flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full bg-teal-50 dark:bg-teal-500/20 border border-teal-200 dark:border-teal-500/30 flex items-center justify-center">
            <User className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          </div>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{user?.email?.split('@')[0]}</span>
        </div>
        
        <button
          onClick={logout}
          className="p-2 ml-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
          title="Logout"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};
