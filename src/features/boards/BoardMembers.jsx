import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';

function BoardMembers() {
  const boards = useSelector((state) => state.boards.list);
  const activeBoardId = useSelector((state) => state.boards.activeBoardId);
  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? null;

  // Only ever written from the async resolution below, never synchronously
  // in the effect — `loading` is derived by comparing boardId to the
  // active board instead of tracked with its own setState.
  const [result, setResult] = useState({
    boardId: null,
    members: [],
    error: null,
  });

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

  const loading = Boolean(activeBoard) && result.boardId !== activeBoard.id;
  const members = loading ? [] : result.members;
  const error = loading ? null : result.error;

  return (
    <section className="users-feed" aria-labelledby="users-feed-heading">
      <h2 id="users-feed-heading">Team</h2>

      {!activeBoard && <p>No board selected.</p>}
      {activeBoard && loading && <p>Loading&hellip;</p>}
      {activeBoard && error && <p role="alert">{error}</p>}

      {activeBoard && !loading && !error && (
        <ul>
          {members.map((member) => (
            <li key={member.uid}>
              {member.email} &mdash;{' '}
              {member.uid === activeBoard.ownerId ? 'Owner' : 'Member'}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default BoardMembers;
