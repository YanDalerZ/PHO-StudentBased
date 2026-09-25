import logo from './assets/images/logo.jpg';
import sealOfAklan from './assets/images/seal_of_aklan.png';
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Building2, Heart, GraduationCap, Loader2, ShieldCheck, EyeOff, Eye } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import { defaultPortalRoute } from './lib/access';

const Login: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { login, isAuthenticated, user, effectiveAccess } = useAuth();

    // Remember Me States
    const [email, setEmail] = useState(() => {
        const savedRememberMe = localStorage.getItem('remember_me') === 'true';
        return savedRememberMe ? (localStorage.getItem('remembered_email') || '') : '';
    });
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(() => {
        return localStorage.getItem('remember_me') === 'true';
    });

    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        if (isAuthenticated && user) {
            const from = location.state?.from;
            if (from) {
                navigate(from, { replace: true });
            } else {
                navigate(defaultPortalRoute(user, effectiveAccess), { replace: true });
            }
        }
    }, [isAuthenticated, user, effectiveAccess, navigate, location]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            await login(email, password);

            // Handle Remember Me logic in LocalStorage (saving only email)
            if (rememberMe) {
                localStorage.setItem('remembered_email', email);
                localStorage.setItem('remember_me', 'true');
                localStorage.removeItem('remembered_password'); // clear any previously saved password
            } else {
                localStorage.removeItem('remembered_email');
                localStorage.removeItem('remember_me');
                localStorage.removeItem('remembered_password');
            }

            toast.success('Login successful!');
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { message?: string } } };
            const message = axiosErr.response?.data?.message || 'Login failed. Please try again.';
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const togglePasswordVisibility = () => {
        setShowPassword((prev) => !prev);
    };

    return (
        <div className="min-h-screen flex w-full font-outfit bg-emerald-50/40 text-slate-900">
            {/* Left Panel: Light Mint/Emerald with Subtly Patterned Background */}
            <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 overflow-hidden bg-linear-to-br from-emerald-900 via-emerald-800 to-teal-900 text-white border-r border-emerald-700/30">
                {/* Subtle Geometric Overlay */}
                <div
                    className="absolute inset-0 pointer-events-none opacity-10"
                    style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                    }}
                />

                {/* Soft Gradient Ambient Glow */}
                <div className="absolute -top-24 -left-24 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-teal-400/20 rounded-full blur-3xl pointer-events-none" />

                {/* Header Branding */}
                <div className="relative z-10 flex items-center gap-3.5">
                    <div className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-sm">
                        <Building2 className="w-7 h-7 text-emerald-300" />
                    </div>
                    <div>
                        <span className="text-2xl font-bold tracking-tight text-white block">PHO Portal</span>
                        <span className="text-xs text-emerald-200 tracking-wider uppercase font-semibold">Provincial Health Office</span>
                    </div>
                </div>

                {/* Hero Content */}
                <div className="relative z-10 space-y-6 my-auto max-w-lg">
                    {/* Category Tags */}
                    <div className="flex flex-wrap gap-3">
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-white text-xs font-semibold tracking-wide">
                            <Heart className="w-4 h-4 text-emerald-300" />
                            <span>Healthcare Services</span>
                        </div>
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-white text-xs font-semibold tracking-wide">
                            <GraduationCap className="w-4 h-4 text-teal-300" />
                            <span>Academic Integration</span>
                        </div>
                    </div>

                    {/* Headline */}
                    <h1 className="text-4xl lg:text-5xl font-extrabold text-white leading-tight tracking-tight">
                        Connecting Health &amp; Student Operations
                    </h1>

                    <p className="text-base text-emerald-100/90 leading-relaxed font-normal">
                        Streamlining public healthcare records, student assessments, and administrative services within one secure platform.
                    </p>

                    <div className="pt-4 flex items-center gap-6 text-xs text-emerald-200/80 font-medium">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            <span>Secure SSL Encrypted</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span>System Operational</span>
                        </div>
                    </div>
                </div>

                {/* Footer Note */}
                <div className="relative z-10 text-xs font-medium text-emerald-200/60">
                    &copy; {new Date().getFullYear()} Provincial Health Office. All rights reserved.
                </div>
            </div>

            {/* Right Panel: Crisp White & Bright Mint UI */}
            <div className="w-full lg:w-1/2 flex flex-col justify-between p-6 sm:p-12 bg-white overflow-y-auto">

                {/* Login Container */}
                <div className="w-full max-w-md mx-auto my-auto py-8">
                    {/* Header Branding / Logo */}
                    <div className="text-center space-y-3 mb-8">
                        <div className="mx-auto flex items-center justify-center gap-5 p-4 mb-6 rounded-3xl bg-emerald-50/50 backdrop-blur-xl border border-emerald-100/50 shadow-[0_8px_30px_rgb(0,0,0,0.06)] w-fit transition-all duration-300 hover:shadow-[0_8px_30px_rgb(16,185,129,0.12)]">
                            <img
                                src={sealOfAklan}
                                alt="Seal of Aklan"
                                className="w-20 h-20 object-contain drop-shadow-md hover:scale-105 transition-transform duration-300"
                            />
                            <div className="w-px h-16 bg-emerald-200/60 rounded-full" />
                            <img
                                src={logo}
                                alt="PHO Logo"
                                className="w-20 h-20 object-contain rounded-full drop-shadow-md hover:scale-105 transition-transform duration-300"
                            />
                        </div>

                        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                            Sign In to Portal
                        </h2>
                        <p className="text-slate-500 text-sm">
                            Enter your official email and password to continue
                        </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Email Field */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider" htmlFor="email">
                                Email Address
                            </label>
                            <input
                                id="email"
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@domain.gov.ph"
                                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all font-medium text-sm"
                            />
                        </div>

                        {/* Password Field */}
                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider" htmlFor="password">
                                    Password
                                </label>
                                <a href="#forgot" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline transition-colors">
                                    Forgot password?
                                </a>
                            </div>

                            {/* Wrap input and toggle button in a relative container */}
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full px-4 py-3 pr-11 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all font-medium text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={togglePasswordVisibility}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 focus:text-emerald-600 focus:outline-none transition-colors"
                                >
                                    {showPassword ? (
                                        <EyeOff className="w-5 h-5" />
                                    ) : (
                                        <Eye className="w-5 h-5" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Remember Me Checkbox */}
                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/20 focus:ring-2 accent-emerald-600 cursor-pointer"
                                />
                                <span className="text-xs font-medium text-slate-600">Remember me</span>
                            </label>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-sm shadow-md shadow-emerald-600/20 transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed mt-2 cursor-pointer"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="animate-spin h-4 w-4" />
                                    <span>Authenticating...</span>
                                </>
                            ) : (
                                <span>Sign In to Account</span>
                            )}
                        </button>
                    </form>

                    {/* Support Link */}
                    <div className="mt-8 pt-6 border-t border-slate-100 text-center">
                        <p className="text-xs text-slate-500">
                            Having trouble logging in?{' '}
                            <a href="#support" className="font-semibold text-emerald-700 hover:underline">
                                Contact IT Support
                            </a>
                        </p>
                    </div>

                </div>

                {/* Footer text for mobile layout */}
                <div className="lg:hidden text-center pt-6 text-xs text-slate-400">
                    &copy; {new Date().getFullYear()} Provincial Health Office.
                </div>
            </div>

        </div>
    );
};

export default Login;
