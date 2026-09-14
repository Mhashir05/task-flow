import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase';

export const submitJoinRequest = createAsyncThunk(
  'joinRequests/submitJoinRequest',
  async ({ inviteCode, uid, email }, { rejectWithValue }) => {
    const normalizedCode = inviteCode.trim().toUpperCase();
    const boardQuery = query(
      collection(db, 'boards'),
      where('inviteCode', '==', normalizedCode),
    );
    const snapshot = await getDocs(boardQuery);
    if (snapshot.empty) {
      return rejectWithValue('No board found with that invite code.');
    }

    const board = snapshot.docs[0];
    await addDoc(collection(db, 'joinRequests'), {
      boardId: board.id,
      requesterUid: uid,
      requesterEmail: email,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  },
);

export const approveJoinRequest = createAsyncThunk(
  'joinRequests/approveJoinRequest',
  async ({ requestId, boardId, requesterUid }) => {
    await updateDoc(doc(db, 'boards', boardId), {
      members: arrayUnion(requesterUid),
    });
    await updateDoc(doc(db, 'joinRequests', requestId), {
      status: 'approved',
    });
  },
);

export const rejectJoinRequest = createAsyncThunk(
  'joinRequests/rejectJoinRequest',
  async ({ requestId }) => {
    await updateDoc(doc(db, 'joinRequests', requestId), {
      status: 'rejected',
    });
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
