import { createListenerMiddleware } from '@reduxjs/toolkit';
import { authStateChanged } from '../features/auth/authSlice';
import { boardsCleared, fetchUserBoards } from '../features/boards/boardsSlice';

export const boardsListenerMiddleware = createListenerMiddleware();

boardsListenerMiddleware.startListening({
  actionCreator: authStateChanged,
  effect: (action, { dispatch }) => {
    const user = action.payload;
    if (user) {
      dispatch(fetchUserBoards(user.uid));
    } else {
      dispatch(boardsCleared());
    }
  },
});
