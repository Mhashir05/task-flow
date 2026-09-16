import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  deleteCollaborativeBoard,
  getMemberRole,
  renameBoard,
} from './boardsSlice';
import {
  approveJoinRequest,
  rejectJoinRequest,
} from '../joinRequests/joinRequestsSlice';
import {
  approveLeaveRequest,
  rejectLeaveRequest,
} from '../leaveRequests/leaveRequestsSlice';
import {
  approvePublishRequest,
  rejectPublishRequest,
} from '../tasks/tasksSlice';

// Board-management controls (rename, invite code, leave, delete, pending
// join/publish request review) for the SPECIFIC board BoardWorkspace has
// already confirmed the viewer has access to — `board` is passed down
// directly rather than re-derived, since the workspace already looked it
// up and gated rendering on it existing. No "no board selected" state
// anymore: that concept belonged to the old shared-page design where this
// panel could render before any board was chosen. The hub (BoardHub.jsx)
// now owns board selection entirely.
function CollaborativePanel({ board }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((state) => state.auth.user);
  const pendingRequests = useSelector((state) => state.joinRequests.pending);
  const pendingLeaveRequests = useSelector((state) => state.leaveRequests.pending);

  const myRole = getMemberRole(board, user?.uid);
  const canApprove = myRole === 'owner' || myRole === 'admin';
  const isOwner = myRole === 'owner';

  const [feedback, setFeedback] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Tasks that name THIS board as a pending publishRequest.targetBoardId —
  // these still live on the requester's own (usually private) board, so
  // this can't reuse tasksListenerMiddleware.js's boardId-scoped listener;
  // it needs its own query on a different field entirely. Owner-only,
  // matching who's allowed to approve/reject (see firestore.rules'
  // isPublishApprove/isPublishReject — Admin does not get this power).
  const [publishRequests, setPublishRequests] = useState([]);

  useEffect(() => {
    if (!isOwner) return undefined;
    const publishQuery = query(
      collection(db, 'tasks'),
      where('publishRequest.targetBoardId', '==', board.id),
    );
    const unsubscribe = onSnapshot(publishQuery, (snapshot) => {
      setPublishRequests(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsubscribe;
  }, [isOwner, board.id]);

  const visiblePublishRequests = isOwner ? publishRequests : [];

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(''), 2500);
    return () => clearTimeout(timer);
  }, [feedback]);

  function handleStartRename() {
    setNameDraft(board.name ?? '');
    setIsRenaming(true);
  }

  function handleCancelRename() {
    setIsRenaming(false);
    setNameDraft('');
  }

  function handleSaveRename() {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    dispatch(renameBoard({ boardId: board.id, newName: trimmed }))
      .unwrap()
      .then(() => {
        setIsRenaming(false);
        setFeedback('Board renamed');
      })
      .catch((message) => setFeedback(message || 'Could not rename board.'));
  }

  // Navigates back to the hub on success, rather than leaving the viewer on
  // a workspace page for a board they just deleted — BoardWorkspace's own
  // generic "board disappeared" effect exists for the case where that
  // happens from SOMEWHERE ELSE (another session, another member), but here
  // we already know exactly what happened, so we can navigate immediately
  // with a precise message instead of waiting for that effect to notice via
  // the live listener.
  function handleConfirmDeleteBoard() {
    dispatch(deleteCollaborativeBoard({ boardId: board.id }))
      .unwrap()
      .then(() => {
        navigate('/dashboard/boards', {
          state: { feedback: 'Board deleted.' },
        });
      })
      .catch((message) => setFeedback(message || 'Could not delete board.'));
    setConfirmingDelete(false);
  }

  function handleApproveLeaveRequest(request) {
    dispatch(
      approveLeaveRequest({
        requestId: request.id,
        boardId: request.boardId,
        targetUid: request.requesterUid,
      }),
    )
      .unwrap()
      .then(() => setFeedback('Member removed'))
      .catch((message) =>
        setFeedback(message || 'Could not approve leave request.'),
      );
  }

  function handleRejectLeaveRequest(requestId) {
    dispatch(rejectLeaveRequest({ requestId }))
      .unwrap()
      .then(() => setFeedback('Leave request rejected'))
      .catch((message) =>
        setFeedback(message || 'Could not reject leave request.'),
      );
  }

  function handleApproveRequest(request) {
    dispatch(
      approveJoinRequest({
        requestId: request.id,
        boardId: request.boardId,
        requesterUid: request.requesterUid,
      }),
    )
      .unwrap()
      .then(() => setFeedback('Join request approved'))
      .catch((message) =>
        setFeedback(message || 'Could not approve join request.'),
      );
  }

  function handleRejectRequest(requestId) {
    dispatch(rejectJoinRequest({ requestId }))
      .unwrap()
      .then(() => setFeedback('Join request rejected'))
      .catch((message) =>
        setFeedback(message || 'Could not reject join request.'),
      );
  }

  function handleApprovePublish(request) {
    dispatch(
      approvePublishRequest({
        taskId: request.id,
        targetBoardId: request.publishRequest.targetBoardId,
      }),
    )
      .unwrap()
      .then(() => setFeedback('Task published to this board'))
      .catch((message) => setFeedback(message || 'Could not publish task.'));
  }

  function handleRejectPublish(taskId) {
    dispatch(rejectPublishRequest({ taskId }))
      .unwrap()
      .then(() => setFeedback('Publish request rejected'))
      .catch((message) =>
        setFeedback(message || 'Could not reject publish request.'),
      );
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
            <h3 className="board-name">{board.name}</h3>
            {isOwner && (
              <button
                type="button"
                className="rename-board-btn"
                onClick={handleStartRename}
              >
                Rename
              </button>
            )}
            {isOwner &&
              (confirmingDelete ? (
                <span className="card-confirm">
                  <span>Delete this board and all its tasks?</span>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={handleConfirmDeleteBoard}
                  >
                    Delete Board
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="rename-board-btn"
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete Board
                </button>
              ))}
          </>
        )}
      </div>

      {board.inviteCode && (
        <p className="invite-code">
          Invite code: <strong>{board.inviteCode}</strong>
        </p>
      )}

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

      {canApprove && pendingLeaveRequests.length > 0 && (
        <div className="join-requests">
          <h3>Pending leave requests</h3>
          <ul>
            {pendingLeaveRequests.map((request) => (
              <li key={request.id}>
                <span>{request.requesterEmail}</span>
                <button
                  type="button"
                  onClick={() => handleApproveLeaveRequest(request)}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => handleRejectLeaveRequest(request.id)}
                >
                  Reject
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {visiblePublishRequests.length > 0 && (
        <div className="join-requests">
          <h3>Pending publish requests</h3>
          <ul>
            {visiblePublishRequests.map((request) => (
              <li key={request.id}>
                <span>
                  &ldquo;{request.title}&rdquo; from{' '}
                  {request.publishRequest?.requestedByEmail}
                </span>
                <button
                  type="button"
                  onClick={() => handleApprovePublish(request)}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => handleRejectPublish(request.id)}
                >
                  Reject
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {feedback && (
        <div className="collaborative-panel-feedback">{feedback}</div>
      )}
    </div>
  );
}

export default CollaborativePanel;
