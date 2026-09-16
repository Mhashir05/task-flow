import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  getMemberRole,
  removeMember,
  transferOwnership,
  updateMemberRole,
} from './boardsSlice';

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member' };

function BoardMembers() {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);
  const boards = useSelector((state) => state.boards.list);
  const activeBoardId = useSelector((state) => state.boards.activeBoardId);
  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? null;
  const myRole = getMemberRole(activeBoard, user?.uid);

  // Only ever written from the async resolution below, never synchronously
  // in the effect — `loading` is derived by comparing boardId to the
  // active board instead of tracked with its own setState.
  const [result, setResult] = useState({
    boardId: null,
    members: [],
    error: null,
  });
  const [feedback, setFeedback] = useState('');
  const [searchText, setSearchText] = useState('');
  // Which member row currently has its "transfer ownership to them?" confirm
  // step open — same open-confirm pattern as App.jsx's confirmingId for task
  // delete, given how significant this action is.
  const [transferConfirmUid, setTransferConfirmUid] = useState(null);

  useEffect(() => {
    if (!activeBoard) return;
    let cancelled = false;

    Promise.all(
      activeBoard.members.map((uid) =>
        getDoc(doc(db, 'users', uid)).then((snap) => ({
          uid,
          email: snap.exists() ? snap.data().email : uid,
          displayName: snap.exists() ? snap.data().displayName : '',
        })),
      ),
    )
      .then((resolved) => {
        if (cancelled) return;
        setResult({ boardId: activeBoard.id, members: resolved, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({
          boardId: activeBoard.id,
          members: [],
          error: err.message || 'Failed to load members',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [activeBoard]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(''), 2500);
    return () => clearTimeout(timer);
  }, [feedback]);

  const loading = Boolean(activeBoard) && result.boardId !== activeBoard.id;
  const members = loading ? [] : result.members;
  const error = loading ? null : result.error;
  const isCollaborative = activeBoard?.type === 'collaborative';

  // Pure client-side filter over the already-fetched member list — no
  // Firestore query involved, matches on email OR resolved displayName.
  const filteredMembers = members.filter((member) => {
    const query = searchText.trim().toLowerCase();
    if (!query) return true;
    const email = (member.email ?? '').toLowerCase();
    const name = (member.displayName ?? '').toLowerCase();
    return email.includes(query) || name.includes(query);
  });

  function handleRoleChange(targetUid, newRole) {
    if (!activeBoard) return;
    dispatch(updateMemberRole({ boardId: activeBoard.id, targetUid, newRole }))
      .unwrap()
      .then(() => setFeedback('Role updated'))
      .catch((message) => setFeedback(message || 'Could not update role.'));
  }

  function handleRemove(targetUid) {
    if (!activeBoard) return;
    dispatch(removeMember({ boardId: activeBoard.id, targetUid }))
      .unwrap()
      .then(() => setFeedback('Member removed'))
      .catch((message) => setFeedback(message || 'Could not remove member.'));
  }

  function handleConfirmTransfer(targetUid) {
    if (!activeBoard) return;
    dispatch(
      transferOwnership({ boardId: activeBoard.id, newOwnerUid: targetUid }),
    )
      .unwrap()
      .then(() => setFeedback('Ownership transferred'))
      .catch((message) =>
        setFeedback(message || 'Could not transfer ownership.'),
      );
    setTransferConfirmUid(null);
  }

  return (
    <section className="users-feed" aria-labelledby="users-feed-heading">
      <h2 id="users-feed-heading">Team</h2>

      {!activeBoard && <p>No board selected.</p>}
      {activeBoard && loading && <p>Loading&hellip;</p>}
      {activeBoard && error && <p role="alert">{error}</p>}

      {activeBoard && !loading && !error && members.length > 0 && (
        <input
          type="text"
          className="member-search"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search members…"
          aria-label="Search team members"
        />
      )}

      {activeBoard && !loading && !error && members.length > 0 && filteredMembers.length === 0 && (
        <p className="member-search-empty">No members match.</p>
      )}

      {activeBoard && !loading && !error && filteredMembers.length > 0 && (
        <ul>
          {filteredMembers.map((member) => {
            const role = getMemberRole(activeBoard, member.uid) ?? 'member';
            const isSelf = member.uid === user?.uid;
            const canManageRoles =
              isCollaborative && myRole === 'owner' && role !== 'owner' && !isSelf;
            const canRemove =
              isCollaborative &&
              role !== 'owner' &&
              !isSelf &&
              (myRole === 'owner' || (myRole === 'admin' && role === 'member'));

            // Same resolved-name pattern as the header's own
            // displayName/emailFallback and the comments section's
            // commenterDisplayName: fall back to the email's local-part
            // when no displayName has been set.
            const emailFallback = member.email
              ? member.email.split('@')[0]
              : member.uid;
            const memberDisplayName =
              member.displayName && member.displayName.trim() !== ''
                ? member.displayName
                : emailFallback;

            return (
              <li key={member.uid} className="board-member-row">
                <span className="board-member-identity">
                  <span className="board-member-name">
                    {memberDisplayName}
                    <span className="role-badge">
                      {ROLE_LABEL[role] ?? role}
                    </span>
                  </span>
                  <span className="board-member-email">{member.email}</span>
                </span>
                {(canManageRoles || canRemove) && (
                  <span className="board-member-actions">
                    {canManageRoles && (
                      <select
                        value={role}
                        aria-label={`Change role for ${memberDisplayName}`}
                        onChange={(e) =>
                          handleRoleChange(member.uid, e.target.value)
                        }
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    )}
                    {canManageRoles &&
                      (transferConfirmUid === member.uid ? (
                        <span className="card-confirm">
                          <span>Make owner?</span>
                          <button
                            type="button"
                            onClick={() => setTransferConfirmUid(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => handleConfirmTransfer(member.uid)}
                          >
                            Confirm
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setTransferConfirmUid(member.uid)}
                        >
                          Transfer Ownership
                        </button>
                      ))}
                    {canRemove && (
                      <button
                        type="button"
                        className="danger"
                        onClick={() => handleRemove(member.uid)}
                      >
                        Remove
                      </button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {feedback && <p className="collaborative-panel-feedback">{feedback}</p>}
    </section>
  );
}

export default BoardMembers;
