import { useState } from 'react';
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import logo from '../../assets/images/logo.jpg';

interface DashboardLayoutProps {
  children: ReactNode;
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative">
        {/* Background Watermark */}
        <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center overflow-hidden opacity-[0.03] dark:opacity-[0.05]">
          <img 
            src={logo} 
            alt="PHO Watermark" 
            className="w-[80vw] max-w-[800px] object-contain grayscale mix-blend-multiply dark:mix-blend-screen"
          />
        </div>

        <div className="relative z-20">
          <Topbar onMenuClick={() => setIsSidebarOpen(true)} />
        </div>
        
        <main className="flex-1 overflow-y-auto p-6 relative z-10">
          <div className="max-w-7xl mx-auto w-full space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
