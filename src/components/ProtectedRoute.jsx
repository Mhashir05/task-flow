import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';

// Session initialization is gated upstream by AuthGate, so by the time this
// renders `state.auth.initializing` is already false — only `user` matters here.
function ProtectedRoute({ children }) {
  const user = useSelector((s) => s.auth.user);

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default ProtectedRoute;
