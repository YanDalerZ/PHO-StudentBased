import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Menu } from 'lucide-react';

import { MockDataProvider } from './context/MockDataContext';

import Login from './Login';
import RegistrationForm from './pages/RegistrationForm';
import TeacherDashboard from './pages/teacher/TeacherDashboard';
import StudentRegistry from './pages/teacher/StudentRegistry';
import StudentProfile from './pages/teacher/StudentProfile';

import PatientInfoForm from './components/forms/PatientInfoForm';
import OralHealthForm from './components/forms/OralHealthForm';
import DewormingForm from './components/forms/DewormingForm';
import ImmunizationForm from './components/forms/ImmunizationForm';
import VitalSignsForm from './components/forms/VitalSignsForm';

import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { Sidebar } from './components/common/Sidebar';

import SuperUserDashboard from './pages/superuser/SuperUserDashboard';
import PatientInfoDash from './pages/superuser/PatientInfoDash';
import OralHealthDash from './pages/superuser/OralHealthDash';
import DewormingDash from './pages/superuser/DewormingDash';
import ImmunizationDash from './pages/superuser/ImmunizationDash';
import VitalSignsDash from './pages/superuser/VitalSignsDash';

import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import ModuleManagement from './pages/admin/ModuleManagement';
import SchoolManagement from './pages/admin/SchoolManagement';
import SystemSettings from './pages/admin/SystemSettings';

// Dashboard Layout Wrapper to manage Sidebar and Page Content
const DashboardLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Mobile Header with Hamburger Menu */}
        <header className="md:hidden flex items-center justify-between p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            PHO<span className="text-teal-600 dark:text-teal-500">Student</span>
          </h1>
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <Menu className="w-6 h-6" />
          </button>
        </header>

        {/* Main Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50 dark:bg-surface-dark">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <MockDataProvider>
        <Toaster position="top-right" />
        <Router>
          <Routes>
            {/* Redirect root path to /Login */}
            <Route path="/" element={<Navigate to="/Login" replace />} />

            {/* Public Routes */}
            <Route path="/Login" element={<Login />} />

            {/* Public Registration Route for Students */}
            <Route path="/registration-form" element={<RegistrationForm />} />

            {/* Teacher Portal Routes */}
            <Route
              path="/teacher"
              element={
                <ProtectedRoute allowedRoles={['teacher']}>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<TeacherDashboard />} />
              <Route path="students" element={<StudentRegistry />} />
              <Route path="students/:id" element={<StudentProfile />} />
              <Route path="students/:id/patient-info" element={<PatientInfoForm />} />
              <Route path="students/:id/oral-health" element={<OralHealthForm />} />
              <Route path="students/:id/deworming" element={<DewormingForm />} />
              <Route path="students/:id/immunization" element={<ImmunizationForm />} />
              <Route path="students/:id/vital-signs" element={<VitalSignsForm />} />
            </Route>

            {/* Super User Portal Routes */}
            <Route
              path="/superuser"
              element={
                <ProtectedRoute allowedRoles={['superuser']}>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<SuperUserDashboard />} />
              <Route path="patient-info" element={<PatientInfoDash />} />
              <Route path="oral-health" element={<OralHealthDash />} />
              <Route path="deworming" element={<DewormingDash />} />
              <Route path="immunization" element={<ImmunizationDash />} />
              <Route path="vital-signs" element={<VitalSignsDash />} />
            </Route>

            {/* Admin Portal Routes */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="modules" element={<ModuleManagement />} />
              <Route path="schools" element={<SchoolManagement />} />
              <Route path="settings" element={<SystemSettings />} />
            </Route>

            {/* 404 Fallback */}
            <Route
              path="*"
              element={
                <div className="p-12 text-center min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-surface-dark">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">404: Page Not Found</h2>
                  <button
                    onClick={() => (window.location.href = '/')}
                    className="text-teal-600 dark:text-teal-400 font-bold underline bg-transparent border-none cursor-pointer hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                  >
                    Go Back Home
                  </button>
                </div>
              }
            />
          </Routes>
        </Router>
      </MockDataProvider>
    </AuthProvider>
  );
};

export default App;