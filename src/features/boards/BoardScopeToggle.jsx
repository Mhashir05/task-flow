import { Link, useLocation } from 'react-router-dom';

// Shared My Tasks / Collaborative Boards navigation, rendered identically
// at the top of both /dashboard (PrivateWorkspace) and /dashboard/boards
// (BoardHub) so the two pages can't drift out of visual sync the way they
// did before (one had a pill button, the other a small inline text link).
// "Active" is derived purely from the current route, not any leftover
// boardContext-style state — these are two fixed destinations, not a
// per-board choice, so the URL is the only source of truth needed.
function BoardScopeToggle() {
  const location = useLocation();
  const isPrivate = location.pathname === '/dashboard';

  return (
    <div
      className="board-scope-toggle"
      role="group"
      aria-label="My Tasks or Collaborative Boards"
    >
      <Link
        to="/dashboard"
        className={isPrivate ? 'active' : ''}
        aria-pressed={isPrivate}
      >
        My Tasks
      </Link>
      <Link
        to="/dashboard/boards"
        className={!isPrivate ? 'active' : ''}
        aria-pressed={!isPrivate}
      >
        Collaborative Boards
      </Link>
    </div>
  );
}

export default BoardScopeToggle;
