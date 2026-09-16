import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';

export const submitJoinRequest = createAsyncThunk(
  'joinRequests/submitJoinRequest',
  async ({ inviteCode, uid, email }, { rejectWithValue }) => {
    try {
      const normalizedCode = inviteCode.trim().toUpperCase();
      // Looked up via the public inviteCodes collection rather than querying
      // boards directly — boards are member-only readable, so a prospective
      // joiner (not yet a member) could never find one by invite code
      // otherwise. See firestore.rules.
      const codeSnap = await getDoc(doc(db, 'inviteCodes', normalizedCode));
      if (!codeSnap.exists()) {
        return rejectWithValue('No board found with that invite code.');
      }

      await addDoc(collection(db, 'joinRequests'), {
        boardId: codeSnap.data().boardId,
        requesterUid: uid,
        requesterEmail: email,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      return rejectWithValue(err.message || 'Could not submit join request.');
    }
  },
);

export const approveJoinRequest = createAsyncThunk(
  'joinRequests/approveJoinRequest',
  async ({ requestId, boardId, requesterUid }, { rejectWithValue }) => {
    try {
      await updateDoc(doc(db, 'boards', boardId), {
        members: arrayUnion(requesterUid),
        [`roles.${requesterUid}`]: 'member',
      });
      await updateDoc(doc(db, 'joinRequests', requestId), {
        status: 'approved',
      });
    } catch (err) {
      return rejectWithValue(err.message || 'Could not approve join request.');
    }
  },
);

export const rejectJoinRequest = createAsyncThunk(
  'joinRequests/rejectJoinRequest',
  async ({ requestId }, { rejectWithValue }) => {
    try {
      await updateDoc(doc(db, 'joinRequests', requestId), {
        status: 'rejected',
      });
    } catch (err) {
      return rejectWithValue(err.message || 'Could not reject join request.');
    }
  },
);

const joinRequestsSlice = createSlice({
  name: 'joinRequests',
  initialState: {
    // Pending requests for the board the current user owns — populated by
    // ../../app/joinRequestsListenerMiddleware.js, not by these thunks.
    pending: [],
    status: 'idle', // 'idle' | 'submitting'
    error: null,
  },
  reducers: {
    pendingRequestsReceived: (state, action) => {
      state.pending = action.payload;
    },
    pendingRequestsCleared: (state) => {
      state.pending = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(submitJoinRequest.pending, (state) => {
        state.status = 'submitting';
        state.error = null;
      })
      .addCase(submitJoinRequest.fulfilled, (state) => {
        state.status = 'idle';
      })
      .addCase(submitJoinRequest.rejected, (state, action) => {
        state.status = 'idle';
        state.error = action.payload || 'Failed to submit join request.';
      });
  },
});

export const { pendingRequestsReceived, pendingRequestsCleared } =
  joinRequestsSlice.actions;
export default joinRequestsSlice.reducer;
