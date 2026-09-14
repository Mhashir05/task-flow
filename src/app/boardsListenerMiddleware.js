import { createListenerMiddleware } from '@reduxjs/toolkit';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { authStateChanged } from '../features/auth/authSlice';
import { boardsCleared, boardsReceived } from '../features/boards/boardsSlice';

export const boardsListenerMiddleware = createListenerMiddleware();

let unsubscribeBoards = null;

// Live-syncs every board the user is a member of (owned or joined), the
// same way tasksListenerMiddleware.js keeps tasks live. Without this, a
// board document's members/roles/name/inviteCode only reached Redux via
// whichever thunk happened to explicitly re-dispatch fetchUserBoards after
// its OWN write (updateMemberRole, removeMember, renameBoard) — which only
// ever refreshed the acting user's own view. Nothing previously told a
// DIFFERENT member (e.g. the Owner who just approved someone, or any other
// existing member) that the board they're looking at changed, since
// approveJoinRequest in particular never re-dispatched anything at all.
// One query covers both boards.list and boards.joined, since both are just
// different filters over "boards where I'm a member" — splitting them here
// (rather than in the reducer) keeps boardsSlice.js's reducer uid-agnostic.
boardsListenerMiddleware.startListening({
  actionCreator: authStateChanged,
  effect: (action, listenerApi) => {
    unsubscribeBoards?.();
    unsubscribeBoards = null;

    const user = action.payload;
    if (!user) {
      listenerApi.dispatch(boardsCleared());
      return;
    }

    const boardsQuery = query(
      collection(db, 'boards'),
      where('members', 'array-contains', user.uid),
    );
    unsubscribeBoards = onSnapshot(boardsQuery, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      const joined = list.filter((b) => b.ownerId !== user.uid);
      listenerApi.dispatch(boardsReceived({ list, joined }));
    });
  },
});
