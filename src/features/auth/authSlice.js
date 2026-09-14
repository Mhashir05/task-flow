import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';

const serializeUser = (user) =>
  user ? { uid: user.uid, email: user.email } : null;

// Shared by signup and login: guarantees uid has a defaultBoardId, creating
// a private board on the fly for any account that doesn't have one yet
// (pre-existing accounts from before the boards feature) — no migration
// script needed.
async function ensureDefaultBoard(uid) {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists() && userSnap.data().defaultBoardId) return;

  const boardRef = doc(collection(db, 'boards'));
  await setDoc(boardRef, {
    name: 'My Board',
    ownerId: uid,
    type: 'private',
    members: [uid],
    createdAt: serverTimestamp(),
  });
  await setDoc(userRef, { defaultBoardId: boardRef.id }, { merge: true });
}

function mapAuthError(err) {
  switch (err?.code) {
    case 'auth/invalid-email':
      return 'That email address is not valid.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'An account with that email already exists.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return err?.message || 'Something went wrong. Please try again.';
  }
}

export const signUp = createAsyncThunk(
  'auth/signUp',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email: cred.user.email,
        displayName: '',
        createdAt: serverTimestamp(),
      });
      await ensureDefaultBoard(cred.user.uid);
      return serializeUser(cred.user);
    } catch (err) {
      return rejectWithValue(mapAuthError(err));
    }
  },
);

export const logIn = createAsyncThunk(
  'auth/logIn',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await ensureDefaultBoard(cred.user.uid);
      return serializeUser(cred.user);
    } catch (err) {
      return rejectWithValue(mapAuthError(err));
    }
  },
);

export const logOut = createAsyncThunk(
  'auth/logOut',
  async (_, { rejectWithValue }) => {
    try {
      await signOut(auth);
    } catch (err) {
      return rejectWithValue(mapAuthError(err));
    }
  },
);

export const resetPassword = createAsyncThunk(
  'auth/resetPassword',
  async ({ email }, { rejectWithValue }) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      return rejectWithValue(mapAuthError(err));
    }
  },
);

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null, // { uid, email } | null
    initializing: true, // true until the first onAuthStateChanged fires
    status: 'idle', // 'idle' | 'loading'
    error: null, // string | null
    notice: null, // string | null (e.g. reset-email-sent)
  },
  reducers: {
    authStateChanged: (state, action) => {
      state.user = action.payload;
      state.initializing = false;
    },
    clearAuthFeedback: (state) => {
      state.error = null;
      state.notice = null;
    },
  },
  extraReducers: (builder) => {
    const onPending = (state) => {
      state.status = 'loading';
      state.error = null;
      state.notice = null;
    };
    const onRejected = (state, action) => {
      state.status = 'idle';
      state.error = action.payload || 'Something went wrong. Please try again.';
    };
    const onSettled = (state) => {
      state.status = 'idle';
    };

    builder
      .addCase(signUp.pending, onPending)
      .addCase(signUp.fulfilled, (state, action) => {
        state.status = 'idle';
        state.user = action.payload;
      })
      .addCase(signUp.rejected, onRejected)

      .addCase(logIn.pending, onPending)
      .addCase(logIn.fulfilled, (state, action) => {
        state.status = 'idle';
        state.user = action.payload;
      })
      .addCase(logIn.rejected, onRejected)

      .addCase(logOut.pending, onPending)
      .addCase(logOut.fulfilled, onSettled)
      .addCase(logOut.rejected, onRejected)

      .addCase(resetPassword.pending, onPending)
      .addCase(resetPassword.fulfilled, (state) => {
        state.status = 'idle';
        state.notice = 'Password reset email sent. Check your inbox.';
      })
      .addCase(resetPassword.rejected, onRejected);
  },
});

export const { authStateChanged, clearAuthFeedback } = authSlice.actions;
export default authSlice.reducer;
