import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase';

const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars

function generateInviteCode(length = 7) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += INVITE_CODE_ALPHABET[
      Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)
    ];
  }
  return code;
}

export const fetchUserBoards = createAsyncThunk(
  'boards/fetchUserBoards',
  async (uid) => {
    const boardsQuery = query(
      collection(db, 'boards'),
      where('members', 'array-contains', uid),
    );
    const snapshot = await getDocs(boardsQuery);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
);

// Every user gets at most one owned collaborative board — reuse it if it
// already exists instead of creating a new one on every "make collaborative".
export const getOrCreateCollaborativeBoard = createAsyncThunk(
  'boards/getOrCreateCollaborativeBoard',
  async (uid, { dispatch }) => {
    const existingQuery = query(
      collection(db, 'boards'),
      where('ownerId', '==', uid),
      where('type', '==', 'collaborative'),
    );
    const existingSnap = await getDocs(existingQuery);
    let boardId;
    if (!existingSnap.empty) {
      boardId = existingSnap.docs[0].id;
    } else {
      const boardRef = doc(collection(db, 'boards'));
      await setDoc(boardRef, {
        name: 'Team Board',
        ownerId: uid,
        type: 'collaborative',
        members: [uid],
        inviteCode: generateInviteCode(),
      });
      boardId = boardRef.id;
    }
    // Keep boards.list in sync so the new/existing collaborative board is
    // immediately visible to the rest of the app (e.g. so activeBoardId can
    // be pointed at it) instead of waiting for the next login.
    await dispatch(fetchUserBoards(uid));
    return boardId;
  },
);

// The Collaborative tab / "Make Collaborative" action both need "the"
// collaborative board for this user, and that isn't necessarily one they
// own — they may have been approved onto someone else's board instead.
// getOrCreateCollaborativeBoard only ever checked ownerId, so a member
// (non-owner) would never be found and would silently get a brand new,
// disconnected board created for them instead. Check membership first.
//
// Design note: if a user is BOTH the owner of their own collaborative
// board AND a member of someone else's (via approval), this prioritizes
// the joined board over their own owned one. Supporting a user belonging
// to multiple collaborative boards at once — and picking between them —
// is out of scope for now; this just picks a reasonable single board
// rather than breaking.
export const resolveCollaborativeBoard = createAsyncThunk(
  'boards/resolveCollaborativeBoard',
  async (uid, { dispatch }) => {
    const memberQuery = query(
      collection(db, 'boards'),
      where('members', 'array-contains', uid),
      where('type', '==', 'collaborative'),
    );
    const memberSnap = await getDocs(memberQuery);
    if (!memberSnap.empty) {
      const joined = memberSnap.docs.find((d) => d.data().ownerId !== uid);
      return (joined ?? memberSnap.docs[0]).id;
    }
    // Not a member of any collaborative board at all — fall back to the
    // owner-only lookup/create path.
    return dispatch(getOrCreateCollaborativeBoard(uid)).unwrap();
  },
);

// Every user has exactly one private board (created at signup/login by
// ensureDefaultBoard in authSlice.js) — look it up fresh from Firestore
// rather than trusting cached Redux state, same as the collaborative thunk.
export const getUserPrivateBoard = createAsyncThunk(
  'boards/getUserPrivateBoard',
  async (uid) => {
    const privateQuery = query(
      collection(db, 'boards'),
      where('ownerId', '==', uid),
      where('type', '==', 'private'),
    );
    const snapshot = await getDocs(privateQuery);
    if (snapshot.empty) {
      throw new Error('No private board found for this user.');
    }
    return snapshot.docs[0].id;
  },
);

const boardsSlice = createSlice({
  name: 'boards',
  initialState: {
    list: [],
    activeBoardId: null,
    status: 'idle', // 'idle' | 'loading'
  },
  reducers: {
    activeBoardSet: (state, action) => {
      state.activeBoardId = action.payload;
    },
    boardsCleared: (state) => {
      state.list = [];
      state.activeBoardId = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUserBoards.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchUserBoards.fulfilled, (state, action) => {
        state.status = 'idle';
        state.list = action.payload;
      })
      .addCase(fetchUserBoards.rejected, (state) => {
        state.status = 'idle';
      });
  },
});

export const { activeBoardSet, boardsCleared } = boardsSlice.actions;
export default boardsSlice.reducer;
