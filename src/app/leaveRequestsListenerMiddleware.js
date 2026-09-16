import { createListenerMiddleware } from '@reduxjs/toolkit';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { getMemberRole } from '../features/boards/boardsSlice';
import {
  pendingLeaveRequestsCleared,
  pendingLeaveRequestsReceived,
} from '../features/leaveRequests/leaveRequestsSlice';

export const leaveRequestsListenerMiddleware = createListenerMiddleware();

// Owner/admin view only — mirrors joinRequestsListenerMiddleware.js's
// "Owner/admin view" listener exactly, for the opposite direction: pending
// leave requests for whichever board is active, but only when the current
// user's role there can act on them. No "requester view" listener is
// needed here the way joinRequests has one — approving a leave request
// removes the requester from `members`, which boardsListenerMiddleware.js's
// own live onSnapshot already surfaces to them directly (their board just
// disappears from boards.list), so there's nothing extra to refresh.
let unsubscribePending = null;

leaveRequestsListenerMiddleware.startListening({
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

    const role = getMemberRole(board, uid);
    if (!uid || !board || (role !== 'owner' && role !== 'admin')) {
      listenerApi.dispatch(pendingLeaveRequestsCleared());
      return;
    }

    const pendingQuery = query(
      collection(db, 'leaveRequests'),
      where('boardId', '==', board.id),
      where('status', '==', 'pending'),
    );
    unsubscribePending = onSnapshot(pendingQuery, (snapshot) => {
      listenerApi.dispatch(
        pendingLeaveRequestsReceived(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
        ),
      );
    });
  },
});
