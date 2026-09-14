import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  arrayUnion,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
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

// createdAt here is a plain client timestamp (ms epoch), not
// serverTimestamp() — Firestore rejects a serverTimestamp() sentinel used
// as a value inside an arrayUnion() element.
export const addComment = createAsyncThunk(
  'tasks/addComment',
  async ({ taskId, uid, email, text }) => {
    await updateDoc(doc(db, 'tasks', taskId), {
      comments: arrayUnion({ uid, email, text, createdAt: Date.now() }),
    });
  },
);

// Members can't change status directly on a collaborative board — this is
// the request they submit instead. Rejects client-side if one is already
// pending; the real enforcement of "null -> value only, never overwriting
// an existing request" lives in firestore.rules, since this check is just
// a UX nicety against a stale/racy local state, not a security boundary.
export const requestStatusChange = createAsyncThunk(
  'tasks/requestStatusChange',
  async (
    { taskId, uid, email, requestedStatus },
    { getState, rejectWithValue },
  ) => {
    const task = getState().tasks.find((t) => t.id === taskId);
    if (task?.statusRequest) {
      return rejectWithValue(
        'A status change request is already pending for this task.',
      );
    }
    await updateDoc(doc(db, 'tasks', taskId), {
      statusRequest: {
        requestedBy: uid,
        requestedByEmail: email,
        requestedStatus,
        createdAt: serverTimestamp(),
      },
    });
  },
);

export const approveStatusRequest = createAsyncThunk(
  'tasks/approveStatusRequest',
  async ({ taskId, newStatus }) => {
    await updateDoc(doc(db, 'tasks', taskId), {
      status: newStatus,
      statusRequest: null,
    });
  },
);

export const rejectStatusRequest = createAsyncThunk(
  'tasks/rejectStatusRequest',
  async ({ taskId }) => {
    await updateDoc(doc(db, 'tasks', taskId), { statusRequest: null });
  },
);

// Comments are a plain array (no per-entry document/id), so editing or
// deleting one means reading the current array from Redux, computing the
// new array client-side by matching on createdAt + uid together (array
// order isn't guaranteed stable across clients, so index-based matching
// would be unsafe), and writing the whole field back with updateDoc.
export const editComment = createAsyncThunk(
  'tasks/editComment',
  async ({ taskId, createdAt, uid, newText }, { getState }) => {
    const task = getState().tasks.find((t) => t.id === taskId);
    const comments = task?.comments ?? [];
    const updatedComments = comments.map((c) =>
      c.uid === uid && c.createdAt === createdAt ? { ...c, text: newText } : c,
    );
    await updateDoc(doc(db, 'tasks', taskId), { comments: updatedComments });
  },
);

export const deleteComment = createAsyncThunk(
  'tasks/deleteComment',
  async ({ taskId, createdAt, uid }, { getState }) => {
    const task = getState().tasks.find((t) => t.id === taskId);
    const comments = task?.comments ?? [];
    const updatedComments = comments.filter(
      (c) => !(c.uid === uid && c.createdAt === createdAt),
    );
    await updateDoc(doc(db, 'tasks', taskId), { comments: updatedComments });
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
