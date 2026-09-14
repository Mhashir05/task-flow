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

// Owner/Admin only, enforced by the caller hiding/disabling the UI for a
// plain Member (same "client stopgap, real boundary is firestore.rules"
// convention as updateMemberRole/removeMember in boardsSlice.js) — the
// rules layer already excludes `assignee` from every Member write shape,
// so a Member calling this directly would be rejected regardless of the UI.
// assigneeUid/assigneeEmail null clears the assignment back to Unassigned.
export const assignTask = createAsyncThunk(
  'tasks/assignTask',
  async ({ taskId, assigneeUid, assigneeEmail }) => {
    await updateDoc(doc(db, 'tasks', taskId), {
      assignee: assigneeUid ? { uid: assigneeUid, email: assigneeEmail } : null,
    });
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

// Delete is Owner-only-direct on a collaborative board — Admin and Member
// (regardless of whether they created the task) submit this request instead,
// same shape/pattern as requestStatusChange above (client-side "already
// pending" guard is a UX nicety; the real null->value-only boundary lives in
// firestore.rules).
export const requestDelete = createAsyncThunk(
  'tasks/requestDelete',
  async ({ taskId, uid, email }, { getState, rejectWithValue }) => {
    const task = getState().tasks.find((t) => t.id === taskId);
    if (task?.deleteRequest) {
      return rejectWithValue(
        'A delete request is already pending for this task.',
      );
    }
    await updateDoc(doc(db, 'tasks', taskId), {
      deleteRequest: {
        requestedBy: uid,
        requestedByEmail: email,
        createdAt: serverTimestamp(),
      },
    });
  },
);

// Owner-only. Unlike approveStatusRequest (which clears the request AND
// writes a new value), this actually deletes the document — the request is
// a gate in front of the real deleteTask operation, not a field to resolve.
export const approveDeleteRequest = createAsyncThunk(
  'tasks/approveDeleteRequest',
  async ({ taskId }) => {
    await deleteDoc(doc(db, 'tasks', taskId));
  },
);

export const rejectDeleteRequest = createAsyncThunk(
  'tasks/rejectDeleteRequest',
  async ({ taskId }) => {
    await updateDoc(doc(db, 'tasks', taskId), { deleteRequest: null });
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
