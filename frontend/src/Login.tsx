import logo from './assets/images/logo.jpg';
import registerQr from './assets/images/register-qr.jpeg';
import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Building2, Heart, GraduationCap, Loader2, Sun, Moon, QrCode, Download, ExternalLink } from 'lucide-react';
import { cn } from './lib/utils';
import { useAuth } from './contexts/AuthContext';

const Login: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { login, isAuthenticated, user } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [isDark, setIsDark] = useState(false); // Default to light theme

    // Toggle theme
    const toggleTheme = () => setIsDark(!isDark);

    React.useEffect(() => {
        if (isAuthenticated && user) {
            const from = location.state?.from;
            if (from) {
                navigate(from, { replace: true });
            } else if (user.role === 'teacher') {
                navigate('/teacher/dashboard', { replace: true });
            } else if (user.role === 'superuser') {
                navigate('/superuser', { replace: true });
            } else if (user.role === 'admin') {
                navigate('/admin', { replace: true });
            }
        }
    }, [isAuthenticated, user, navigate, location]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            await login(email, password);
            toast.success('Login successful!');
        } catch (err) {
            toast.error('Invalid email or password.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={cn("min-h-screen flex w-full font-outfit transition-colors duration-500", isDark && "dark")}>
            {/* Left Panel: Deep Teal with Topographical Pattern */}
            <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 overflow-hidden bg-panel-light dark:bg-panel-dark transition-colors duration-500">
                {/* Topographical Map Pattern Overlay */}
                <div className="absolute inset-0 pointer-events-none opacity-20 dark:opacity-[0.15] transition-opacity duration-500" 
                     style={{
                         backgroundImage: isDark 
                            ? `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 10 Q 25 -15 50 10 T 100 10 M0 30 Q 25 5 50 30 T 100 30 M0 50 Q 25 25 50 50 T 100 50 M0 70 Q 25 45 50 70 T 100 70 M0 90 Q 25 65 50 90 T 100 90' fill='none' stroke='%23ffffff' stroke-width='1.5' opacity='1'/%3E%3C/svg%3E")`
                            : `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 10 Q 25 -15 50 10 T 100 10 M0 30 Q 25 5 50 30 T 100 30 M0 50 Q 25 25 50 50 T 100 50 M0 70 Q 25 45 50 70 T 100 70 M0 90 Q 25 65 50 90 T 100 90' fill='none' stroke='%23004d40' stroke-width='1.5' opacity='1'/%3E%3C/svg%3E")`,
                         backgroundSize: '100px 100px'
                     }}>
                </div>

                {/* Decorative Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/5 dark:to-black/40 pointer-events-none"></div>

                {/* Header Branding */}
                <div className="relative z-10 flex items-center gap-3">
                    <div className="p-2.5 bg-teal-600/10 dark:bg-white/10 backdrop-blur-md rounded-2xl border border-teal-600/20 dark:border-white/20 shadow-sm">
                        <Building2 className="w-8 h-8 text-teal-700 dark:text-teal-300" />
                    </div>
                    <span className="text-2xl font-bold tracking-wide text-teal-900 dark:text-white drop-shadow-sm">PHO Portal</span>
                </div>

                {/* Hero Content */}
                <div className="relative z-10 space-y-8 my-auto max-w-xl">
                    {/* Category Tags */}
                    <div className="flex flex-wrap gap-4">
                        <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-teal-600/10 dark:bg-white/10 backdrop-blur-md border border-teal-600/20 dark:border-white/10 text-teal-900 dark:text-white text-sm font-medium shadow-sm">
                            <Heart className="w-4 h-4 text-teal-700 dark:text-teal-300" />
                            <span>Healthcare Services</span>
                        </div>
                        <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-blue-600/10 dark:bg-white/10 backdrop-blur-md border border-blue-600/20 dark:border-white/10 text-teal-900 dark:text-white text-sm font-medium shadow-sm">
                            <GraduationCap className="w-4 h-4 text-blue-700 dark:text-blue-300" />
                            <span>Academic Integration</span>
                        </div>
                    </div>

                    {/* Bold & Clean Headline */}
                    <h1 className="text-5xl lg:text-6xl font-extrabold text-teal-950 dark:text-white leading-tight tracking-tight drop-shadow-md">
                        Connecting Health &amp; Student Operations
                    </h1>
                    
                    <p className="text-lg text-teal-900/90 dark:text-teal-50/80 leading-relaxed max-w-lg drop-shadow-sm">
                        Welcome to the unified portal. Access health assessments, educational records, and administrative services seamlessly.
                    </p>
                </div>

                {/* Footer Note */}
                <div className="relative z-10 text-sm font-medium text-teal-800/80 dark:text-teal-100/50">
                    &copy; {new Date().getFullYear()} Provincial Health Office. All rights reserved.
                </div>
            </div>

            {/* Right Panel */}
            <div className="w-full lg:w-1/2 flex flex-col relative bg-white dark:bg-surface-dark transition-colors duration-500 overflow-y-auto">
                {/* Theme Toggle Button */}
                <div className="absolute top-6 right-6 z-20">
                    <button 
                        onClick={toggleTheme}
                        className="p-3 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 backdrop-blur-md text-slate-700 dark:text-slate-300 shadow-sm transition-all"
                        aria-label="Toggle Theme"
                        title="Toggle Light/Dark Mode"
                    >
                        {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    </button>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 min-h-screen">
                    {/* Login Card */}
                    <div className="w-full max-w-md p-8 sm:p-10 rounded-[2rem] bg-white dark:bg-surface-card/60 backdrop-blur-xl border border-slate-100 dark:border-white/5 shadow-2xl transition-all duration-500 mb-8">
                        
                        <div className="text-center space-y-3 mb-8">
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
                                <input
                                    id="email"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="user@example.com"
                                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-surface-input border border-slate-200 dark:border-teal-500/30 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
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
                                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-surface-input border border-slate-200 dark:border-teal-500/30 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                                />
                            </div>

                            {/* Submit Button */}
                            <button 
                                type="submit" 
                                disabled={loading} 
                                className="w-full py-3.5 px-4 rounded-xl bg-primary-action hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-600 text-white font-semibold shadow-lg shadow-teal-500/20 dark:shadow-teal-900/30 transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed"
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
                        <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800/50 text-center">
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Need technical support? <a href="#support" className="font-medium text-teal-600 dark:text-teal-400 hover:underline">Contact System Admin</a>
                            </p>
                        </div>
                    </div>

                    {/* QR Code Section */}
                    <div className="w-full max-w-md p-6 rounded-[2rem] bg-slate-50 dark:bg-surface-card/40 border border-slate-200 dark:border-white/5 transition-all duration-500 flex flex-col items-center justify-center space-y-4">
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
                            <QrCode className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                            <span>New Student Registration</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center px-4">
                            Scan the QR code below or use the buttons to register a new student profile.
                        </p>
                        
                        <div className="flex flex-col items-center gap-4 w-full mt-2">
                            <div className="rounded-xl border-4 border-white dark:border-slate-800 shadow-sm">
                                <img 
                                    src={registerQr} 
                                    alt="Registration QR Code" 
                                    className="w-32 h-32 object-cover"
                                />
                            </div>

                            <div className="flex w-full gap-3 mt-2">
                                <Link 
                                    to="/registration-form" 
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-teal-100 hover:bg-teal-200 text-teal-700 dark:bg-teal-900/50 dark:hover:bg-teal-800/60 dark:text-teal-300 text-sm font-semibold transition-colors"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    Access Form
                                </Link>
                                <a 
                                    href={registerQr} 
                                    download="Registration-QR.jpeg"
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 dark:bg-[#1e293b] dark:hover:bg-slate-700 dark:border-slate-700/50 dark:text-slate-300 text-slate-700 text-sm font-semibold transition-colors shadow-sm"
                                >
                                    <Download className="w-4 h-4" />
                                    Download QR
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;