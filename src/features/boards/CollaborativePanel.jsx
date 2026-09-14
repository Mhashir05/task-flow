import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { getMemberRole, renameBoard } from './boardsSlice';
import {
  approveJoinRequest,
  rejectJoinRequest,
  submitJoinRequest,
} from '../joinRequests/joinRequestsSlice';

function CollaborativePanel() {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);
  const boards = useSelector((state) => state.boards.list);
  const activeBoardId = useSelector((state) => state.boards.activeBoardId);
  const pendingRequests = useSelector((state) => state.joinRequests.pending);
  const joinStatus = useSelector((state) => state.joinRequests.status);
  const joinError = useSelector((state) => state.joinRequests.error);

  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? null;
  const myRole = getMemberRole(activeBoard, user?.uid);
  const canApprove = myRole === 'owner' || myRole === 'admin';
  const isOwner = myRole === 'owner';

  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(''), 2500);
    return () => clearTimeout(timer);
  }, [feedback]);

  function handleStartRename() {
    setNameDraft(activeBoard?.name ?? '');
    setIsRenaming(true);
  }

  function handleCancelRename() {
    setIsRenaming(false);
    setNameDraft('');
  }

  function handleSaveRename() {
    const trimmed = nameDraft.trim();
    if (!trimmed || !activeBoard) return;
    dispatch(renameBoard({ boardId: activeBoard.id, newName: trimmed }))
      .unwrap()
      .then(() => {
        setIsRenaming(false);
        setFeedback('Board renamed');
      })
      .catch((message) => setFeedback(message || 'Could not rename board.'));
  }

  function handleJoinBoard() {
    if (!user?.uid || inviteCodeInput.trim() === '') return;
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
        setFeedback('Join request submitted');
      })
      .catch(() => {});
  }

  function handleApproveRequest(request) {
    dispatch(
      approveJoinRequest({
        requestId: request.id,
        boardId: request.boardId,
        requesterUid: request.requesterUid,
      }),
    );
    setFeedback('Join request approved');
  }

  function handleRejectRequest(requestId) {
    dispatch(rejectJoinRequest({ requestId }));
    setFeedback('Join request rejected');
  }

  return (
    <div className="collaborative-panel">
      <div className="board-name-row">
        {isRenaming ? (
          <span className="board-rename-form">
            <input
              aria-label="Board name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRename();
                if (e.key === 'Escape') handleCancelRename();
              }}
            />
            <button type="button" onClick={handleSaveRename}>
              Save
            </button>
            <button type="button" onClick={handleCancelRename}>
              Cancel
            </button>
          </span>
        ) : (
          <>
            <h3 className="board-name">{activeBoard?.name ?? 'Board'}</h3>
            {isOwner && (
              <button
                type="button"
                className="rename-board-btn"
                onClick={handleStartRename}
              >
                Rename
              </button>
            )}
          </>
        )}
      </div>

      {activeBoard?.inviteCode && (
        <p className="invite-code">
          Invite code: <strong>{activeBoard.inviteCode}</strong>
        </p>
      )}

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

      {canApprove && pendingRequests.length > 0 && (
        <div className="join-requests">
          <h3>Pending join requests</h3>
          <ul>
            {pendingRequests.map((request) => (
              <li key={request.id}>
                <span>{request.requesterEmail}</span>
                <button
                  type="button"
                  onClick={() => handleApproveRequest(request)}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => handleRejectRequest(request.id)}
                >
                  Reject
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {feedback && <p className="collaborative-panel-feedback">{feedback}</p>}
    </div>
  );
}

export default CollaborativePanel;
