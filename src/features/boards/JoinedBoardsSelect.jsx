import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { activeBoardSet } from './boardsSlice';

function JoinedBoardsSelect() {
  const dispatch = useDispatch();
  const joinedBoards = useSelector((state) => state.boards.joined);
  const activeBoardId = useSelector((state) => state.boards.activeBoardId);
  const [ownerEmails, setOwnerEmails] = useState({});

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
  }, [joinedBoards]);

  if (joinedBoards.length === 0) return null;

  const isJoinedBoardActive = joinedBoards.some((b) => b.id === activeBoardId);

  return (
    <select
      className="joined-boards-select"
      aria-label="Switch to a joined board"
      value={isJoinedBoardActive ? activeBoardId : ''}
      onChange={(e) => {
        if (e.target.value) dispatch(activeBoardSet(e.target.value));
      }}
    >
      <option value="" disabled>
        Joined boards
      </option>
      {joinedBoards.map((board) => (
        <option key={board.id} value={board.id}>
          {board.name} — {ownerEmails[board.ownerId] ?? '…'}
        </option>
      ))}
    </select>
  );
}

export default JoinedBoardsSelect;
