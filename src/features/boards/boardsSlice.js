import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  arrayRemove,
  collection,
  deleteField,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase';

// Resolves a member's role with a fallback for boards created before the
// roles map existed: the owner defaults to 'owner' and anyone else in
// `members` defaults to 'member', so pre-existing collaborative boards
// keep working instead of locking their owner out of owner-only actions.
export function getMemberRole(board, uid) {
  if (!board || !uid) return null;
  if (board.roles?.[uid]) return board.roles[uid];
  if (board.ownerId === uid) return 'owner';
  if (board.members?.includes(uid)) return 'member';
  return null;
}

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
      const inviteCode = generateInviteCode();
      await setDoc(boardRef, {
        name: 'Team Board',
        ownerId: uid,
        type: 'collaborative',
        members: [uid],
        roles: { [uid]: 'owner' },
        inviteCode,
      });
      // Public-lookup record so a non-member can resolve an invite code to
      // a boardId without needing read access to the board document itself
      // (boards are member-only readable — see firestore.rules).
      await setDoc(doc(db, 'inviteCodes', inviteCode), { boardId: boardRef.id });
      boardId = boardRef.id;
    }
    // Keep boards.list in sync so the new/existing collaborative board is
    // immediately visible to the rest of the app (e.g. so activeBoardId can
    // be pointed at it) instead of waiting for the next login.
    await dispatch(fetchUserBoards(uid));
    return boardId;
  },
);

// Boards the user belongs to but does NOT own — i.e. joined via an
// approved join request. Kept separate from getOrCreateCollaborativeBoard
// (which only ever resolves/creates the board the user owns) so "my board"
// and "boards I've joined" stay distinct concepts with their own UI.
export const fetchJoinedBoards = createAsyncThunk(
  'boards/fetchJoinedBoards',
  async (uid) => {
    const memberQuery = query(
      collection(db, 'boards'),
      where('members', 'array-contains', uid),
    );
    const snapshot = await getDocs(memberQuery);
    return snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((b) => b.ownerId !== uid);
  },
);

// Owner-only. Client-side gate here is a stopgap until matching Firestore
// Security Rules exist — this check is not itself the security boundary.
export const updateMemberRole = createAsyncThunk(
  'boards/updateMemberRole',
  async ({ boardId, targetUid, newRole }, { getState, dispatch, rejectWithValue }) => {
    if (newRole !== 'admin' && newRole !== 'member') {
      return rejectWithValue('Invalid role.');
    }
    const currentUid = getState().auth.user?.uid;
    const board = getState().boards.list.find((b) => b.id === boardId);
    if (!board) return rejectWithValue('Board not found.');
    if (getMemberRole(board, currentUid) !== 'owner') {
      return rejectWithValue('Only the board owner can change member roles.');
    }
    if (targetUid === board.ownerId) {
      return rejectWithValue("The board owner's role cannot be changed.");
    }

    await updateDoc(doc(db, 'boards', boardId), {
      [`roles.${targetUid}`]: newRole,
    });
    await dispatch(fetchUserBoards(currentUid));
  },
);

// Owner can remove anyone (except themself); admin can only remove plain
// members, not the owner or other admins. Same "client-side stopgap until
// Security Rules" caveat as updateMemberRole above.
export const removeMember = createAsyncThunk(
  'boards/removeMember',
  async ({ boardId, targetUid }, { getState, dispatch, rejectWithValue }) => {
    const currentUid = getState().auth.user?.uid;
    const board = getState().boards.list.find((b) => b.id === boardId);
    if (!board) return rejectWithValue('Board not found.');
    if (targetUid === board.ownerId) {
      return rejectWithValue('The board owner cannot be removed.');
    }

    const currentRole = getMemberRole(board, currentUid);
    const targetRole = getMemberRole(board, targetUid);
    const canRemove =
      currentRole === 'owner' ||
      (currentRole === 'admin' && targetRole === 'member');
    if (!canRemove) {
      return rejectWithValue('You do not have permission to remove this member.');
    }

    await updateDoc(doc(db, 'boards', boardId), {
      members: arrayRemove(targetUid),
      [`roles.${targetUid}`]: deleteField(),
    });
    await dispatch(fetchUserBoards(currentUid));
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
    joined: [],
    activeBoardId: null,
    status: 'idle', // 'idle' | 'loading'
  },
  reducers: {
    activeBoardSet: (state, action) => {
      state.activeBoardId = action.payload;
    },
    boardsCleared: (state) => {
      state.list = [];
      state.joined = [];
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
      })
      .addCase(fetchJoinedBoards.fulfilled, (state, action) => {
        state.joined = action.payload;
      });
  },
});

export const { activeBoardSet, boardsCleared } = boardsSlice.actions;
export default boardsSlice.reducer;
