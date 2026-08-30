import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import { MockDataProvider } from './context/MockDataContext';

import Login from './Login';
import RegistrationForm from './pages/RegistrationForm';
import TeacherDashboard from './pages/teacher/TeacherDashboard';
import StudentRegistry from './pages/teacher/StudentRegistry';
import StudentProfile from './pages/teacher/StudentProfile';

import PatientInfoForm from './components/forms/PatientInfoForm';
import OralHealthForm from './components/forms/OralHealthForm';
import DewormingForm from './components/forms/DewormingForm';
import HeadssForm from './components/forms/HeadssForm';
import ImmunizationForm from './components/forms/ImmunizationForm';

import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { DashboardLayout } from './components/common/DashboardLayout';

import SuperUserDashboard from './pages/superuser/SuperUserDashboard';
import PatientInfoDash from './pages/superuser/PatientInfoDash';
import OralHealthDash from './pages/superuser/OralHealthDash';
import DewormingDash from './pages/superuser/DewormingDash';
import HeadssDash from './pages/superuser/HeadssDash';
import ImmunizationDash from './pages/superuser/ImmunizationDash';
import StudentLookupDash from './pages/superuser/StudentLookupDash';

import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import ModuleManagement from './pages/admin/ModuleManagement';
import SchoolManagement from './pages/admin/SchoolManagement';
import SystemSettings from './pages/admin/SystemSettings';

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
                  <DashboardLayout>
                    <Outlet />
                  </DashboardLayout>
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
              <Route path="students/:id/headss" element={<HeadssForm />} />
              <Route path="students/:id/immunization" element={<ImmunizationForm />} />
            </Route>

            {/* Super User Portal Routes */}
            <Route 
              path="/superuser" 
              element={
                <ProtectedRoute allowedRoles={['superuser']}>
                  <DashboardLayout>
                    <Outlet />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<SuperUserDashboard />} />
              <Route path="patient-info" element={<PatientInfoDash />} />
              <Route path="oral-health" element={<OralHealthDash />} />
              <Route path="deworming" element={<DewormingDash />} />
              <Route path="headss" element={<HeadssDash />} />
              <Route path="immunization" element={<ImmunizationDash />} />
              <Route path="students" element={<StudentLookupDash />} />
            </Route>

            {/* Admin Portal Routes */}
            <Route 
              path="/admin" 
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <DashboardLayout>
                    <Outlet />
                  </DashboardLayout>
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