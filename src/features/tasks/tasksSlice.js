import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  getOrCreateCollaborativeBoard,
  getUserPrivateBoard,
} from '../boards/boardsSlice';

// Writes go straight to Firestore; the visible state change comes back
// through the onSnapshot listener in ../../app/tasksListenerMiddleware.js,
// not from these thunks or any reducer here.

export const addTask = createAsyncThunk(
  'tasks/addTask',
  async (task, { getState }) => {
    const userId = getState().auth.user?.uid;
    const { id, ...rest } = task;
    await setDoc(doc(db, 'tasks', id), { ...rest, userId });
  },
);

export const deleteTask = createAsyncThunk('tasks/deleteTask', async (id) => {
  await deleteDoc(doc(db, 'tasks', id));
});

export const updateStatus = createAsyncThunk(
  'tasks/updateStatus',
  async ({ id, newStatus }) => {
    await updateDoc(doc(db, 'tasks', id), { status: newStatus });
  },
);

export const editTitle = createAsyncThunk(
  'tasks/editTitle',
  async ({ id, newTitle }) => {
    await updateDoc(doc(db, 'tasks', id), { title: newTitle });
  },
);

export const editDescription = createAsyncThunk(
  'tasks/editDescription',
  async ({ id, newDescription }) => {
    await updateDoc(doc(db, 'tasks', id), { description: newDescription });
  },
);

export const moveTaskToCollaborative = createAsyncThunk(
  'tasks/moveTaskToCollaborative',
  async ({ taskId, uid }, { dispatch }) => {
    const boardId = await dispatch(
      getOrCreateCollaborativeBoard(uid),
    ).unwrap();
    await updateDoc(doc(db, 'tasks', taskId), { boardId });
  },
);

export const moveTaskToPrivate = createAsyncThunk(
  'tasks/moveTaskToPrivate',
  async ({ taskId, uid }, { dispatch }) => {
    const boardId = await dispatch(getUserPrivateBoard(uid)).unwrap();
    await updateDoc(doc(db, 'tasks', taskId), { boardId });
  },
);

const tasksSlice = createSlice({
  name: 'tasks',
  initialState: [],
  reducers: {
    tasksReceived: (_state, action) => action.payload,
    tasksCleared: () => [],
  },
});

export const { tasksReceived, tasksCleared } = tasksSlice.actions;
export default tasksSlice.reducer;
