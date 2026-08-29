import logo from './assets/images/logo.jpg';
import React, { useState } from 'react';
import { Building2, Heart, GraduationCap, Loader2, Sun, Moon } from 'lucide-react';
import './assets/css/Login.css';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [isDark, setIsDark] = useState(true); // Default to dark theme

    // Toggle theme
    const toggleTheme = () => setIsDark(!isDark);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // Simulate API authentication call
        setTimeout(() => {
            console.log('Logging in with:', { email, password });
            setLoading(false);
            alert('Login attempt submitted.');
        }, 1200);
    };

    return (
        <div className={`min-h-screen flex w-full font-outfit transition-colors duration-500 ${isDark ? 'dark' : ''}`}>
            {/* Left Panel: Deep Teal with Topographical Pattern */}
            <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 overflow-hidden bg-teal-50 dark:bg-[#0d4747] transition-colors duration-500">
                {/* Topographical Map Pattern Overlay */}
                <div className="absolute inset-0 pointer-events-none opacity-10 dark:opacity-[0.15] transition-opacity duration-500" 
                     style={{
                         backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 10 Q 25 -15 50 10 T 100 10 M0 30 Q 25 5 50 30 T 100 30 M0 50 Q 25 25 50 50 T 100 50 M0 70 Q 25 45 50 70 T 100 70 M0 90 Q 25 65 50 90 T 100 90' fill='none' stroke='%23ffffff' stroke-width='1.5' opacity='1'/%3E%3C/svg%3E")`,
                         backgroundSize: '100px 100px'
                     }}>
                </div>

                {/* Decorative Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 dark:to-black/40 pointer-events-none"></div>

                {/* Header Branding */}
                <div className="relative z-10 flex items-center gap-3">
                    <div className="p-2.5 bg-teal-600/20 dark:bg-white/10 backdrop-blur-md rounded-2xl border border-teal-600/30 dark:border-white/20 shadow-sm">
                        <Building2 className="w-8 h-8 text-teal-700 dark:text-teal-300" />
                    </div>
                    <span className="text-2xl font-bold tracking-wide text-teal-900 dark:text-white drop-shadow-sm">PHO Portal</span>
                </div>

                {/* Hero Content */}
                <div className="relative z-10 space-y-8 my-auto max-w-xl">
                    {/* Category Tags: Rounded, Semi-transparent pills with icons */}
                    <div className="flex flex-wrap gap-4">
                        <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-teal-600/10 dark:bg-white/10 backdrop-blur-md border border-teal-600/20 dark:border-white/10 text-teal-800 dark:text-white text-sm font-medium shadow-sm">
                            <Heart className="w-4 h-4 text-teal-600 dark:text-teal-300" />
                            <span>Healthcare Services</span>
                        </div>
                        <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-blue-600/10 dark:bg-white/10 backdrop-blur-md border border-blue-600/20 dark:border-white/10 text-blue-800 dark:text-white text-sm font-medium shadow-sm">
                            <GraduationCap className="w-4 h-4 text-blue-600 dark:text-blue-300" />
                            <span>Academic Integration</span>
                        </div>
                    </div>

                    {/* Bold & Clean Headline */}
                    <h1 className="text-5xl lg:text-6xl font-extrabold text-teal-950 dark:text-white leading-tight tracking-tight drop-shadow-md">
                        Connecting Health &amp; Student Operations
                    </h1>
                    
                    <p className="text-lg text-teal-900/80 dark:text-teal-50/80 leading-relaxed max-w-lg drop-shadow-sm">
                        Welcome to the unified portal. Access health assessments, educational records, and administrative services seamlessly.
                    </p>
                </div>

                {/* Footer Note */}
                <div className="relative z-10 text-sm font-medium text-teal-800/70 dark:text-teal-100/50">
                    &copy; {new Date().getFullYear()} Provincial Health Office. All rights reserved.
                </div>
            </div>

            {/* Right Panel: Solid Dark Navy (or light alternative) */}
            <div className="w-full lg:w-1/2 flex flex-col relative bg-slate-100 dark:bg-[#0b1325] transition-colors duration-500">
                {/* Theme Toggle Button */}
                <div className="absolute top-6 right-6 z-20">
                    <button 
                        onClick={toggleTheme}
                        className="p-3 rounded-full bg-white/60 dark:bg-white/5 hover:bg-white/90 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 backdrop-blur-md text-slate-700 dark:text-slate-300 shadow-sm transition-all"
                        aria-label="Toggle Theme"
                        title="Toggle Light/Dark Mode"
                    >
                        {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    </button>
                </div>

                <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
                    {/* Login Card: Subtle Glassmorphism */}
                    <div className="w-full max-w-md p-8 sm:p-10 rounded-3xl bg-white/80 dark:bg-[#121b2f]/60 backdrop-blur-xl border border-white/60 dark:border-white/5 shadow-2xl transition-all duration-500">
                        
                        <div className="text-center space-y-3 mb-8">
                            {/* Logo: fully transparent background via rounded-full and mix-blend */}
                            <div className="mx-auto w-24 h-24 mb-6 relative flex items-center justify-center">
                                <img 
                                    src={logo} 
                                    alt="PHO Logo" 
                                    className="w-24 h-24 object-contain rounded-full shadow-sm dark:shadow-none mix-blend-multiply dark:mix-blend-normal bg-transparent" 
                                />
                            </div>
                            
                            <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                                Welcome Back
                            </h2>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">
                                Enter your credentials to access your account
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Email Field */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="email">
                                    Email Address
                                </label>
                                {/* Input: Dark backgrounds and thin teal borders */}
                                <input
                                    id="email"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="user@example.com"
                                    className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#070d19] border border-slate-300 dark:border-teal-500/30 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all shadow-sm dark:shadow-none"
                                />
                            </div>

                            {/* Password Field */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="password">
                                        Password
                                    </label>
                                    <a href="#forgot" className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors">
                                        Forgot password?
                                    </a>
                                </div>
                                <input
                                    id="password"
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#070d19] border border-slate-300 dark:border-teal-500/30 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all shadow-sm dark:shadow-none"
                                />
                            </div>

                            {/* Submit Button */}
                            <button 
                                type="submit" 
                                disabled={loading} 
                                className="w-full py-3.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600 text-white font-semibold shadow-lg shadow-teal-600/20 dark:shadow-teal-900/30 transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="animate-spin h-5 w-5" />
                                        <span>Authenticating...</span>
                                    </>
                                ) : (
                                    <span>Sign In</span>
                                )}
                            </button>
                        </form>

                        {/* Footer */}
                        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800/50 text-center">
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Need technical support? <a href="#support" className="font-medium text-teal-600 dark:text-teal-400 hover:underline">Contact System Admin</a>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;