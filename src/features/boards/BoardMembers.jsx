import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { getMemberRole, removeMember, updateMemberRole } from './boardsSlice';

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

  useEffect(() => {
    if (!activeBoard) return;
    let cancelled = false;

    Promise.all(
      activeBoard.members.map((uid) =>
        getDoc(doc(db, 'users', uid)).then((snap) => ({
          uid,
          email: snap.exists() ? snap.data().email : uid,
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

  return (
    <section className="users-feed" aria-labelledby="users-feed-heading">
      <h2 id="users-feed-heading">Team</h2>

      {!activeBoard && <p>No board selected.</p>}
      {activeBoard && loading && <p>Loading&hellip;</p>}
      {activeBoard && error && <p role="alert">{error}</p>}

      {activeBoard && !loading && !error && (
        <ul>
          {members.map((member) => {
            const role = getMemberRole(activeBoard, member.uid) ?? 'member';
            const isSelf = member.uid === user?.uid;
            const canManageRoles =
              isCollaborative && myRole === 'owner' && role !== 'owner' && !isSelf;
            const canRemove =
              isCollaborative &&
              role !== 'owner' &&
              !isSelf &&
              (myRole === 'owner' || (myRole === 'admin' && role === 'member'));

            return (
              <li key={member.uid} className="board-member-row">
                <span>
                  {member.email} &mdash; {ROLE_LABEL[role] ?? role}
                </span>
                {(canManageRoles || canRemove) && (
                  <span className="board-member-actions">
                    {canManageRoles && (
                      <select
                        value={role}
                        aria-label={`Change role for ${member.email}`}
                        onChange={(e) =>
                          handleRoleChange(member.uid, e.target.value)
                        }
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    )}
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
