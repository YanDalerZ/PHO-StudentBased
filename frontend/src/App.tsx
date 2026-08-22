import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

import Login from './Login';
import UserDash from './pages/UserSide/UserDashboard';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        {/* Redirect root path to /Login */}
        <Route path="/" element={<Navigate to="/Login" replace />} />

        {/* Login Route */}
        <Route path="/Login" element={<Login />} />
        <Route path="/UserDash" element={<UserDash />} />


        {/* 404 Fallback */}
        <Route
          path="*"
          element={
            <div style={{ padding: '50px', textAlign: 'center' }}>
              <h2 style={{ color: '#00308F', fontWeight: 'bold' }}>404: Page Not Found</h2>
              <button
                onClick={() => (window.location.href = '/')}
                style={{
                  marginTop: '20px',
                  color: '#00308F',
                  fontWeight: 'bold',
                  textDecoration: 'underline',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                }}
              >
                Go Back Home
              </button>
            </div>
          }
        />
      </Routes>
    </Router>
  );
};

export default App;