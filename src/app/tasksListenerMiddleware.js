import { createListenerMiddleware } from '@reduxjs/toolkit';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { authStateChanged } from '../features/auth/authSlice';
import { tasksCleared, tasksReceived } from '../features/tasks/tasksSlice';

export const tasksListenerMiddleware = createListenerMiddleware();

let unsubscribeTasks = null;

tasksListenerMiddleware.startListening({
  actionCreator: authStateChanged,
  effect: (action, { dispatch }) => {
    unsubscribeTasks?.();
    unsubscribeTasks = null;

    const user = action.payload;
    if (!user) {
      dispatch(tasksCleared());
      return;
    }

    const tasksQuery = query(
      collection(db, 'tasks'),
      where('userId', '==', user.uid),
    );
    unsubscribeTasks = onSnapshot(tasksQuery, (snapshot) => {
      dispatch(
        tasksReceived(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))),
      );
    });
  },
});
