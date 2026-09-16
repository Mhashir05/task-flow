import { useSelector } from 'react-redux';
import { BoardWorkspaceInner } from './BoardWorkspace.jsx';
import '../../App.css';

// The home view at /dashboard: the user's own private board, rendered
// directly with no hub/picker in between. Resolves the board by filtering
// the already-live boards.list (boardsListenerMiddleware.js's
// members-array-contains query naturally includes it) rather than
// dispatching a separate fetch. `key={privateBoard.id}` isn't strictly
// needed here since a user's private board never changes id, but keeping
// it matches the same remount-safety pattern BoardWorkspace uses.
function PrivateWorkspace() {
  const user = useSelector((state) => state.auth.user);
  const boards = useSelector((state) => state.boards.list);
  const boardsLoaded = useSelector((state) => state.boards.loaded);

  const privateBoard = boards.find(
    (b) => b.type === 'private' && b.ownerId === user?.uid,
  );

  if (!boardsLoaded || !privateBoard) {
    return (
      <div className="page">
        <div className="collaborative-panel-feedback">Loading&hellip;</div>
      </div>
    );
  }

  return <BoardWorkspaceInner key={privateBoard.id} boardId={privateBoard.id} />;
}

export default PrivateWorkspace;
