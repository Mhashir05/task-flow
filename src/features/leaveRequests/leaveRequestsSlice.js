import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  addDoc,
  arrayRemove,
  collection,
  deleteField,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';

// Mirrors joinRequestsSlice.js's shape/spirit for the opposite direction: a
// plain Member's request to leave a board, reviewed by that board's Owner
// or Admin rather than applied immediately. Admin/Owner still leave
// directly via boardsSlice.js's leaveBoard — this path is only for the
// 'member' role, matching firestore.rules' leaveRequests create rule.
export const requestLeaveBoard = createAsyncThunk(
  'leaveRequests/requestLeaveBoard',
  async ({ boardId, uid, email }, { rejectWithValue }) => {
    try {
      await addDoc(collection(db, 'leaveRequests'), {
        boardId,
        requesterUid: uid,
        requesterEmail: email,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      return rejectWithValue(err.message || 'Could not submit leave request.');
    }
  },
);

// Same board-document diff as boardsSlice.js's leaveBoard/removeMember
// (arrayRemove + deleteField for one uid) — this is just the Owner/Admin-
// approved version of that same operation, not a different shape, which is
// why it needs no dedicated firestore.rules carve-out: the existing
// roleOf(...)=='owner' / isSafeAdminRolesChange branches on boards/{id}
// already permit this exact diff (see firestore.rules' leaveRequests
// allow update comment). No fetchUserBoards re-dispatch afterward, either
// — boardsListenerMiddleware.js's live onSnapshot already delivers this
// change to every affected viewer (the approving Owner/Admin included) on
// its own.
export const approveLeaveRequest = createAsyncThunk(
  'leaveRequests/approveLeaveRequest',
  async ({ requestId, boardId, targetUid }, { rejectWithValue }) => {
    try {
      await updateDoc(doc(db, 'boards', boardId), {
        members: arrayRemove(targetUid),
        [`roles.${targetUid}`]: deleteField(),
      });
      await updateDoc(doc(db, 'leaveRequests', requestId), {
        status: 'approved',
      });
    } catch (err) {
      return rejectWithValue(err.message || 'Could not approve leave request.');
    }
  },
);

export const rejectLeaveRequest = createAsyncThunk(
  'leaveRequests/rejectLeaveRequest',
  async ({ requestId }, { rejectWithValue }) => {
    try {
      await updateDoc(doc(db, 'leaveRequests', requestId), {
        status: 'rejected',
      });
    } catch (err) {
      return rejectWithValue(err.message || 'Could not reject leave request.');
    }
  },
);

const leaveRequestsSlice = createSlice({
  name: 'leaveRequests',
  initialState: {
    // Pending requests for the board the current user owns/admins —
    // populated by ../../app/leaveRequestsListenerMiddleware.js, not by
    // these thunks.
    pending: [],
    status: 'idle', // 'idle' | 'submitting'
    error: null,
  },
  reducers: {
    pendingLeaveRequestsReceived: (state, action) => {
      state.pending = action.payload;
    },
    pendingLeaveRequestsCleared: (state) => {
      state.pending = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(requestLeaveBoard.pending, (state) => {
        state.status = 'submitting';
        state.error = null;
      })
      .addCase(requestLeaveBoard.fulfilled, (state) => {
        state.status = 'idle';
      })
      .addCase(requestLeaveBoard.rejected, (state, action) => {
        state.status = 'idle';
        state.error = action.payload || 'Failed to submit leave request.';
      });
  },
});

export const { pendingLeaveRequestsReceived, pendingLeaveRequestsCleared } =
  leaveRequestsSlice.actions;
export default leaveRequestsSlice.reducer;
