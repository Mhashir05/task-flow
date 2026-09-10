import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Navigate, Route, Routes } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase';
import { authStateChanged } from './authSlice';
import App from '../../App.jsx';
import LandingPage from '../../components/LandingPage.jsx';
import ProtectedRoute from '../../components/ProtectedRoute.jsx';
import './auth.css';

function AuthGate() {
  const dispatch = useDispatch();
  const initializing = useSelector((s) => s.auth.initializing);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      dispatch(
        authStateChanged(
          fbUser ? { uid: fbUser.uid, email: fbUser.email } : null,
        ),
      );
    });
    return unsubscribe;
  }, [dispatch]);

  if (initializing) {
    return (
      <div className="auth-loading" role="status" aria-live="polite">
        <p>Loading&hellip;</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <App />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default AuthGate;
