import React, { useState } from 'react';
import { Building2, Heart, GraduationCap, Loader2 } from 'lucide-react';
import './assets/css/Login.css';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

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
        <div className="login-container">
            {/* Left Visual Banner: Healthcare & Education Theme */}
            <div className="login-banner">
                {/* CSS Grid Background Pattern */}
                <div className="banner-grid-overlay" />

                {/* Decorative Ambient Glowing Orbs */}
                <div className="orb-teal" />
                <div className="orb-blue" />

                {/* Header Branding */}
                <div className="banner-brand">
                    <div className="brand-icon-box">
                        <Building2 className="w-8 h-8 text-teal-400" />
                    </div>
                    <span className="brand-title">PHO Student Portal</span>
                </div>

                {/* Hero Illustrative Content */}
                <div className="banner-hero">
                    <div className="badge-wrapper">
                        {/* Healthcare Badge */}
                        <div className="badge-healthcare">
                            <Heart className="w-4 h-4" />
                            <span>Healthcare Services</span>
                        </div>
                        {/* Education Badge */}
                        <div className="badge-education">
                            <GraduationCap className="w-4 h-4" />
                            <span>Academic Integration</span>
                        </div>
                    </div>

                    <h1 className="banner-heading">
                        Connecting Health Operations <br />
                        &amp; Student Management asd
                    </h1>
                    <p className="banner-description">
                        Welcome to the unified portal. Access health assessments, educational records, and administrative services in one platform.
                    </p>
                </div>

                {/* Footer Note */}
                <div className="banner-footer">
                    &copy; {new Date().getFullYear()} Provincial Health Office. All rights reserved.
                </div>
            </div>

            {/* Right Login Form Side */}
            <div className="login-form-wrapper">
                <div className="login-card">
                    <div className="form-header">
                        <h2 className="form-title">Sign In</h2>
                        <p className="form-subtitle">Enter your credentials to access your account</p>
                    </div>

                    <form onSubmit={handleSubmit} className="login-form">
                        {/* Email Field */}
                        <div className="input-group">
                            <label className="input-label" htmlFor="email">
                                Email Address
                            </label>
                            <input
                                id="email"
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="student@institution.edu"
                                className="input-field"
                            />
                        </div>

                        {/* Password Field */}
                        <div className="input-group">
                            <div className="flex justify-between items-center">
                                <label className="input-label" htmlFor="password">
                                    Password
                                </label>
                                <a href="#forgot" className="forgot-link">
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
                                className="input-field"
                            />
                        </div>

                        {/* Submit Button */}
                        <button type="submit" disabled={loading} className="submit-btn">
                            {loading ? (
                                <>
                                    <Loader2 className="animate-spin h-5 w-5 text-white" />
                                    <span>Authenticating...</span>
                                </>
                            ) : (
                                <span>Sign In</span>
                            )}
                        </button>
                    </form>

                    {/* Additional Info Footer */}
                    <div className="card-footer">
                        <p>
                            Need technical support? <a href="#support" className="support-link">Contact System Admin</a>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;