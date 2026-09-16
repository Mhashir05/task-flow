import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import '../../App.css';
import { db } from '../../firebase';
import { logOut } from '../auth/authSlice';
import { fetchProfile } from '../profile/profileSlice';
import {
  activeBoardSet,
  createCollaborativeBoard,
  deleteCollaborativeBoard,
} from './boardsSlice';
import { submitJoinRequest } from '../joinRequests/joinRequestsSlice';
import BoardScopeToggle from './BoardScopeToggle';

// The collaborative-board hub, at /dashboard/boards — NOT a task workspace,
// and NOT where the private board lives (that's its own page at /dashboard,
// see PrivateWorkspace.jsx). Every collaborative board the user owns or has
// joined lives here as a clickable row; picking one navigates to its own
// /dashboard/board/:boardId workspace.
function BoardHub() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useSelector((state) => state.auth.user);
  const profileData = useSelector((state) => state.profile.data);
  const boards = useSelector((state) => state.boards.list);
  const boardsLoaded = useSelector((state) => state.boards.loaded);

  const emailFallback = user?.email ? user.email.split('@')[0] : 'there';
  const displayName =
    profileData?.displayName && profileData.displayName.trim() !== ''
      ? profileData.displayName
      : emailFallback;

  // This hub is collaborative-only — the private board lives at its own
  // /dashboard route (PrivateWorkspace.jsx) and never appears here.
  // "Your Boards": collaborative boards this user owns. "Joined Boards":
  // collaborative boards where the role is Admin or Member, not Owner —
  // exactly the same split CollaborativePanel.jsx used to compute.
  const ownedCollaborativeBoards = boards.filter(
    (b) => b.type === 'collaborative' && b.ownerId === user?.uid,
  );
  const joinedBoards = boards.filter(
    (b) => b.type === 'collaborative' && b.ownerId !== user?.uid,
  );

  const [ownerEmails, setOwnerEmails] = useState({});
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [isCreatingBoard, setIsCreatingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [feedback, setFeedback] = useState(location.state?.feedback ?? '');
  const [joinStatus, setJoinStatus] = useState('idle');
  const [joinError, setJoinError] = useState('');
  const [confirmingDeleteBoardId, setConfirmingDeleteBoardId] = useState(null);
  const [isConfirmingDeleteAll, setIsConfirmingDeleteAll] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  useEffect(() => {
    if (user?.uid && !profileData) dispatch(fetchProfile(user.uid));
  }, [dispatch, user?.uid, profileData]);

  // Clears the router-passed feedback (e.g. "You left this board.") from
  // history state after first render, so a later back/forward navigation
  // or refresh doesn't keep re-showing it.
  useEffect(() => {
    if (location.state?.feedback) {
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(''), 2500);
    return () => clearTimeout(timer);
  }, [feedback]);

  // Owner-email lookup for Joined Boards rows — same resolution
  // CollaborativePanel.jsx used to do.
  useEffect(() => {
    if (joinedBoards.length === 0) return;
    let cancelled = false;

    Promise.all(
      joinedBoards.map((board) =>
        getDoc(doc(db, 'users', board.ownerId)).then((snap) => [
          board.ownerId,
          snap.exists() ? snap.data().email : board.ownerId,
        ]),
      ),
    ).then((pairs) => {
      if (cancelled) return;
      setOwnerEmails(Object.fromEntries(pairs));
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedBoards.map((b) => b.ownerId).join(',')]);

  function handleSelectBoard(boardId) {
    dispatch(activeBoardSet(boardId));
    navigate(`/dashboard/board/${boardId}`);
  }

  function handleStartCreateBoard() {
    setNewBoardName('');
    setIsCreatingBoard(true);
  }

  function handleCancelCreateBoard() {
    setIsCreatingBoard(false);
    setNewBoardName('');
  }

  function handleCreateBoard() {
    if (!user?.uid) return;
    dispatch(createCollaborativeBoard({ uid: user.uid, name: newBoardName }))
      .unwrap()
      .then(() => {
        setIsCreatingBoard(false);
        setNewBoardName('');
        setFeedback('Board created');
      })
      .catch(() => setFeedback('Could not create board. Try again.'));
  }

  function handleDeleteBoard(boardId) {
    dispatch(deleteCollaborativeBoard({ boardId }))
      .unwrap()
      .then(() => setFeedback('Board deleted.'))
      .catch((message) => setFeedback(message || 'Could not delete board.'));
    setConfirmingDeleteBoardId(null);
  }

  function handleStartDeleteAll() {
    setIsConfirmingDeleteAll(true);
    setDeleteAllConfirmText('');
  }

  function handleCancelDeleteAll() {
    setIsConfirmingDeleteAll(false);
    setDeleteAllConfirmText('');
  }

  // Sequential, not Promise.all — deleteCollaborativeBoard already does its
  // own batched Firestore deletes per board (tasks + joinRequests + invite
  // code + the board doc itself), so running several of THOSE concurrently
  // would multiply the in-flight batched writes; one board at a time keeps
  // this predictable. `ownedCollaborativeBoards` is captured once here as a
  // plain array before the loop starts, so it isn't affected by the live
  // Redux list shrinking as each delete lands.
  async function handleConfirmDeleteAll() {
    if (deleteAllConfirmText !== 'DELETE' || isDeletingAll) return;
    setIsDeletingAll(true);
    const boardsToDelete = ownedCollaborativeBoards;
    let deletedCount = 0;
    let failedCount = 0;
    for (const board of boardsToDelete) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await dispatch(deleteCollaborativeBoard({ boardId: board.id })).unwrap();
        deletedCount += 1;
      } catch {
        failedCount += 1;
      }
    }
    setIsDeletingAll(false);
    setIsConfirmingDeleteAll(false);
    setDeleteAllConfirmText('');
    const plural = deletedCount === 1 ? '' : 's';
    setFeedback(
      failedCount > 0
        ? `Deleted ${deletedCount} board${plural}, ${failedCount} failed.`
        : `Deleted ${deletedCount} board${plural}.`,
    );
  }

  function handleJoinBoard() {
    if (!user?.uid || inviteCodeInput.trim() === '') return;
    setJoinStatus('submitting');
    setJoinError('');
    dispatch(
      submitJoinRequest({
        inviteCode: inviteCodeInput,
        uid: user.uid,
        email: user.email,
      }),
    )
      .unwrap()
      .then(() => {
        setInviteCodeInput('');
        setJoinStatus('idle');
        setFeedback('Join request submitted');
      })
      .catch((message) => {
        setJoinStatus('idle');
        setJoinError(message || 'Could not submit join request.');
      });
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <BoardScopeToggle />
          <div className="logo">TASK FLOW</div>
          <p className="tagline">Keep it moving. Enhance productivity.</p>
        </div>
        <p className="welcome-greet">
          Welcome back, <strong>{displayName}</strong>
          {' · '}
          <Link to="/dashboard/profile">Profile</Link>
        </p>
        <button
          type="button"
          className="sign-out"
          onClick={() => dispatch(logOut())}
        >
          Sign out
        </button>
      </header>

      <div className="feedback-region" role="status" aria-live="polite">
        {feedback}
      </div>

      <div className="board-hub-grid">
        <div className="board-hub-card">
          <div className="board-list-section">
            <h3 className="board-list-heading">Your Boards</h3>
            <div className="board-list-actions">
              {isCreatingBoard ? (
                <span className="board-rename-form">
                  <input
                    aria-label="New board name"
                    value={newBoardName}
                    onChange={(e) => setNewBoardName(e.target.value)}
                    placeholder="Board name"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateBoard();
                      if (e.key === 'Escape') handleCancelCreateBoard();
                    }}
                  />
                  <button type="button" onClick={handleCreateBoard}>
                    Create
                  </button>
                  <button type="button" onClick={handleCancelCreateBoard}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="rename-board-btn"
                  onClick={handleStartCreateBoard}
                >
                  + Create New Board
                </button>
              )}

              {!isCreatingBoard &&
                ownedCollaborativeBoards.length > 0 &&
                (isConfirmingDeleteAll ? (
                  <span className="card-confirm delete-all-confirm">
                    <input
                      aria-label="Type DELETE to confirm deleting all boards"
                      value={deleteAllConfirmText}
                      onChange={(e) => setDeleteAllConfirmText(e.target.value)}
                      placeholder="Type DELETE"
                      disabled={isDeletingAll}
                    />
                    <button
                      type="button"
                      onClick={handleCancelDeleteAll}
                      disabled={isDeletingAll}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={handleConfirmDeleteAll}
                      disabled={deleteAllConfirmText !== 'DELETE' || isDeletingAll}
                    >
                      {isDeletingAll ? 'Deleting…' : 'Delete All Boards'}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="rename-board-btn"
                    onClick={handleStartDeleteAll}
                  >
                    Delete All Boards
                  </button>
                ))}
            </div>

            {!boardsLoaded ? (
              <p className="board-list-empty">Loading&hellip;</p>
            ) : (
              <ul className="my-boards-list">
                {ownedCollaborativeBoards.map((board) => (
                  <li key={board.id} className="my-board-row-item">
                    <button
                      type="button"
                      className="my-board-row"
                      onClick={() => handleSelectBoard(board.id)}
                    >
                      {board.name}
                    </button>
                    {confirmingDeleteBoardId === board.id ? (
                      <span className="card-confirm">
                        <span>Delete?</span>
                        <button
                          type="button"
                          onClick={() => setConfirmingDeleteBoardId(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => handleDeleteBoard(board.id)}
                        >
                          Delete
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="rename-board-btn"
                        onClick={() => setConfirmingDeleteBoardId(board.id)}
                      >
                        Delete
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="board-hub-card">
          <div className="board-list-section">
            <h3 className="board-list-heading">Joined Boards</h3>
            {!boardsLoaded ? (
              <p className="board-list-empty">Loading&hellip;</p>
            ) : joinedBoards.length === 0 ? (
              <p className="board-list-empty">
                You haven&rsquo;t joined any boards yet.
              </p>
            ) : (
              <ul className="my-boards-list">
                {joinedBoards.map((board) => (
                  <li key={board.id}>
                    <button
                      type="button"
                      className="my-board-row"
                      onClick={() => handleSelectBoard(board.id)}
                    >
                      {board.name} — {ownerEmails[board.ownerId] ?? '…'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="quest-form">
            <div className="field field--title">
              <label htmlFor="invite-code-input">Join a board</label>
              <input
                id="invite-code-input"
                value={inviteCodeInput}
                onChange={(e) => setInviteCodeInput(e.target.value)}
                placeholder="Enter invite code"
              />
              {joinError && <p className="field-error">{joinError}</p>}
            </div>
            <button
              type="button"
              onClick={handleJoinBoard}
              disabled={joinStatus === 'submitting'}
            >
              {joinStatus === 'submitting' ? 'Submitting…' : 'Request to join'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BoardHub;
