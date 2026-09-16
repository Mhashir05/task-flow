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
import { getUserPrivateBoard } from '../boards/boardsSlice';

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
  async ({ id, newTitle }, { rejectWithValue }) => {
    try {
      await updateDoc(doc(db, 'tasks', id), { title: newTitle });
    } catch (err) {
      return rejectWithValue(err.message || 'Could not update title.');
    }
  },
);

export const editDescription = createAsyncThunk(
  'tasks/editDescription',
  async ({ id, newDescription }, { rejectWithValue }) => {
    try {
      await updateDoc(doc(db, 'tasks', id), { description: newDescription });
    } catch (err) {
      return rejectWithValue(err.message || 'Could not update description.');
    }
  },
);

// A user can now own/join multiple collaborative boards, so a private task
// moving to collaborative must target a SPECIFIC board (chosen in App.jsx's
// publish picker) rather than a resolved singleton. Used directly when the
// actor's role on targetBoardId is owner/admin (immediate move); a
// member-role target goes through requestPublish below instead. Also used
// by approvePublishRequest's own updateDoc, which duplicates this shape
// rather than calling this thunk, since it must clear publishRequest in the
// SAME write (see firestore.rules — the approve shape requires both fields
// changing together).
export const moveTaskToBoard = createAsyncThunk(
  'tasks/moveTaskToBoard',
  async ({ taskId, boardId }) => {
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
// rules layer already excludes `assignees`/`assigneeUids` from every
// Member write shape, so a Member calling this directly would be rejected
// regardless of the UI.
// `assignees` is the FULL desired array of {uid, email}, not a delta —
// the caller (BoardWorkspace.jsx) computes the new array by toggling one
// member in/out of the current selection and sends the whole thing in one
// write, rather than an arrayUnion/arrayRemove pair, which gets awkward
// once the elements are objects rather than primitives (arrayRemove needs
// an exact object match, easy to get subtly wrong across re-renders).
// `assigneeUids` is derived from that same array in the SAME write, so
// the two can never drift apart — it exists purely so firestore.rules can
// content-check who's being assigned (a plain string array supports
// hasAny(), unlike an array of {uid, email} maps), specifically to
// enforce that the board's Owner can never be assigned a task. `assignees`
// itself carries no such guarantee at the rules layer; this thunk is the
// trust boundary that keeps it in lockstep, the same way boardId/type
// consistency is a client-trusted invariant elsewhere in this schema.
export const setTaskAssignees = createAsyncThunk(
  'tasks/setTaskAssignees',
  async ({ taskId, assignees }) => {
    await updateDoc(doc(db, 'tasks', taskId), {
      assignees,
      assigneeUids: assignees.map((a) => a.uid),
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
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        statusRequest: {
          requestedBy: uid,
          requestedByEmail: email,
          requestedStatus,
          createdAt: serverTimestamp(),
        },
      });
    } catch (err) {
      return rejectWithValue(err.message || 'Could not submit request.');
    }
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
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        deleteRequest: {
          requestedBy: uid,
          requestedByEmail: email,
          createdAt: serverTimestamp(),
        },
      });
    } catch (err) {
      return rejectWithValue(err.message || 'Could not submit delete request.');
    }
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

// Publishing a private task to a collaborative board where the actor only
// holds Member role there (not owner/admin) needs that board's Owner to
// approve — same request/approve/reject shape as status/delete requests
// above. The task stays on the requester's own private board (boardId
// unchanged) until approved; targetBoardName is stored on the request
// purely for display (App.jsx's "Pending: → X" badge) without a second
// lookup, same reasoning as statusRequest's requestedByEmail.
export const requestPublish = createAsyncThunk(
  'tasks/requestPublish',
  async (
    { taskId, targetBoardId, targetBoardName, uid, email },
    { getState, rejectWithValue },
  ) => {
    const task = getState().tasks.find((t) => t.id === taskId);
    if (task?.publishRequest) {
      return rejectWithValue(
        'A publish request is already pending for this task.',
      );
    }
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        publishRequest: {
          requestedBy: uid,
          requestedByEmail: email,
          targetBoardId,
          targetBoardName,
          createdAt: serverTimestamp(),
        },
      });
    } catch (err) {
      return rejectWithValue(err.message || 'Could not submit publish request.');
    }
  },
);

// Called by the TARGET board's Owner, who is generally not a member of the
// task's current (private) board at all — see firestore.rules' dedicated
// isPublishApprove/isPublishReject branches, which grant this independently
// of the normal isTaskBoardMember-gated path. boardId and publishRequest
// must change together in one write (the rule requires both, to prove the
// task actually lands on the board the request named, not some other one).
export const approvePublishRequest = createAsyncThunk(
  'tasks/approvePublishRequest',
  async ({ taskId, targetBoardId }, { rejectWithValue }) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        boardId: targetBoardId,
        publishRequest: null,
      });
    } catch (err) {
      return rejectWithValue(err.message || 'Could not publish task.');
    }
  },
);

export const rejectPublishRequest = createAsyncThunk(
  'tasks/rejectPublishRequest',
  async ({ taskId }, { rejectWithValue }) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), { publishRequest: null });
    } catch (err) {
      return rejectWithValue(err.message || 'Could not reject publish request.');
    }
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
