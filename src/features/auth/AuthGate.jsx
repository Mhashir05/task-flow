import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Navigate, Route, Routes } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase';
import { authStateChanged } from './authSlice';
import BoardHub from '../boards/BoardHub.jsx';
import BoardWorkspace from '../boards/BoardWorkspace.jsx';
import PrivateWorkspace from '../boards/PrivateWorkspace.jsx';
import LandingPage from '../../components/LandingPage.jsx';
import ProtectedRoute from '../../components/ProtectedRoute.jsx';
import ProfilePage from '../profile/ProfilePage.jsx';
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
            <PrivateWorkspace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/boards"
        element={
          <ProtectedRoute>
            <BoardHub />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/board/:boardId"
        element={
          <ProtectedRoute>
            <BoardWorkspace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default AuthGate;
