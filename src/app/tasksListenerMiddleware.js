import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { authStateChanged } from '../features/auth/authSlice';
import { activeBoardSet } from '../features/boards/boardsSlice';
import { tasksCleared, tasksReceived } from '../features/tasks/tasksSlice';

export const tasksListenerMiddleware = createListenerMiddleware();

let unsubscribeTasks = null;

// Tasks are scoped to whichever board is active, not to who authored them —
// a board's tasks need to be visible to every member, not just the person
// who created each one. Re-subscribes on login/logout (authStateChanged)
// AND whenever the active board changes (activeBoardSet), since switching
// boards must swap the query, not just leave the previous board's tasks
// showing.
tasksListenerMiddleware.startListening({
  matcher: isAnyOf(authStateChanged, activeBoardSet),
  effect: (_action, listenerApi) => {
    unsubscribeTasks?.();
    unsubscribeTasks = null;

    const state = listenerApi.getState();
    const user = state.auth.user;
    const boardId = state.boards.activeBoardId;

    if (!user || !boardId) {
      listenerApi.dispatch(tasksCleared());
      return;
    }

    const tasksQuery = query(
      collection(db, 'tasks'),
      where('boardId', '==', boardId),
    );
    unsubscribeTasks = onSnapshot(tasksQuery, (snapshot) => {
      listenerApi.dispatch(
        tasksReceived(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))),
      );
    });
  },
});
