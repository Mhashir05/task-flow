import { configureStore } from '@reduxjs/toolkit';
import tasksReducer from '../features/tasks/tasksSlice';
import authReducer from '../features/auth/authSlice';
import profileReducer from '../features/profile/profileSlice';
import boardsReducer from '../features/boards/boardsSlice';
import joinRequestsReducer from '../features/joinRequests/joinRequestsSlice';
import { tasksListenerMiddleware } from './tasksListenerMiddleware';
import { boardsListenerMiddleware } from './boardsListenerMiddleware';
import { joinRequestsListenerMiddleware } from './joinRequestsListenerMiddleware';

export const store = configureStore({
  reducer: {
    tasks: tasksReducer,
    auth: authReducer,
    profile: profileReducer,
    boards: boardsReducer,
    joinRequests: joinRequestsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(
      tasksListenerMiddleware.middleware,
      boardsListenerMiddleware.middleware,
      joinRequestsListenerMiddleware.middleware,
    ),
});
