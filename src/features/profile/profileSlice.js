import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';

export const fetchProfile = createAsyncThunk(
  'profile/fetchProfile',
  async (uid) => {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
  },
);

export const updateProfile = createAsyncThunk(
  'profile/updateProfile',
  async ({ uid, displayName }) => {
    await setDoc(doc(db, 'users', uid), { displayName }, { merge: true });
    return { displayName };
  },
);

const profileSlice = createSlice({
  name: 'profile',
  initialState: {
    data: null,
    status: 'idle', // 'idle' | 'loading' | 'saving'
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProfile.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchProfile.fulfilled, (state, action) => {
        state.status = 'idle';
        state.data = action.payload;
      })
      .addCase(fetchProfile.rejected, (state) => {
        state.status = 'idle';
      })
      .addCase(updateProfile.pending, (state) => {
        state.status = 'saving';
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.status = 'idle';
        if (state.data) {
          state.data.displayName = action.payload.displayName;
        }
      })
      .addCase(updateProfile.rejected, (state) => {
        state.status = 'idle';
      });
  },
});

export default profileSlice.reducer;
