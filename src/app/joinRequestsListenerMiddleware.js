import { createListenerMiddleware } from '@reduxjs/toolkit';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { authStateChanged } from '../features/auth/authSlice';
import { fetchUserBoards } from '../features/boards/boardsSlice';
import {
  pendingRequestsCleared,
  pendingRequestsReceived,
} from '../features/joinRequests/joinRequestsSlice';

export const joinRequestsListenerMiddleware = createListenerMiddleware();

// Owner view: pending join requests for whichever board is active, but only
// when the current user actually owns it.
let unsubscribePending = null;

joinRequestsListenerMiddleware.startListening({
  predicate: (_action, currentState, previousState) =>
    currentState.boards.activeBoardId !== previousState.boards.activeBoardId ||
    currentState.boards.list !== previousState.boards.list ||
    currentState.auth.user?.uid !== previousState.auth.user?.uid,
  effect: (_action, listenerApi) => {
    unsubscribePending?.();
    unsubscribePending = null;

    const state = listenerApi.getState();
    const uid = state.auth.user?.uid;
    const board = state.boards.list.find(
      (b) => b.id === state.boards.activeBoardId,
    );

    if (!uid || !board || board.ownerId !== uid) {
      listenerApi.dispatch(pendingRequestsCleared());
      return;
    }

    const pendingQuery = query(
      collection(db, 'joinRequests'),
      where('boardId', '==', board.id),
      where('status', '==', 'pending'),
    );
    unsubscribePending = onSnapshot(pendingQuery, (snapshot) => {
      listenerApi.dispatch(
        pendingRequestsReceived(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
        ),
      );
    });
  },
});

// Requester view: watch the current user's own join requests so an approval
// that lands while they're already logged in refreshes their board list
// immediately, instead of waiting for their next login/session.
let unsubscribeMyRequests = null;

joinRequestsListenerMiddleware.startListening({
  actionCreator: authStateChanged,
  effect: (action, listenerApi) => {
    unsubscribeMyRequests?.();
    unsubscribeMyRequests = null;

    const user = action.payload;
    if (!user) return;

    const myRequestsQuery = query(
      collection(db, 'joinRequests'),
      where('requesterUid', '==', user.uid),
    );
    let isFirstSnapshot = true;
    unsubscribeMyRequests = onSnapshot(myRequestsQuery, (snapshot) => {
      const justApproved =
        !isFirstSnapshot &&
        snapshot
          .docChanges()
          .some((change) => change.doc.data().status === 'approved');
      isFirstSnapshot = false;

      if (justApproved) {
        listenerApi.dispatch(fetchUserBoards(user.uid));
      }
    });
  },
});
