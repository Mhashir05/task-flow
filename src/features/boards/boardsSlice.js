import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  arrayRemove,
  collection,
  deleteField,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';

// Firestore caps a single batch at 500 write operations. Splits a flat list
// of document refs to delete into sequential batches, awaiting each before
// starting the next (not run concurrently — see deleteCollaborativeBoard's
// comment on why the board document must be the very last ref in the array
// regardless of how this chunking splits it).
const BATCH_LIMIT = 500;

async function deleteRefsInBatches(refs) {
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(i, i + BATCH_LIMIT)) {
      batch.delete(ref);
    }
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
}

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

// A user can now own multiple collaborative boards — this always creates a
// NEW one (no get-or-create singleton check), so "Create New Board" can be
// used any number of times. Same setDoc shape as the old singleton version,
// plus createdAt (previously missing on collaborative boards, unlike
// private ones — added here for consistency).
export const createCollaborativeBoard = createAsyncThunk(
  'boards/createCollaborativeBoard',
  async ({ uid, name }, { dispatch, rejectWithValue }) => {
    try {
      const boardRef = doc(collection(db, 'boards'));
      const inviteCode = generateInviteCode();
      await setDoc(boardRef, {
        name: name && name.trim() !== '' ? name.trim() : 'Team Board',
        ownerId: uid,
        type: 'collaborative',
        members: [uid],
        roles: { [uid]: 'owner' },
        inviteCode,
        createdAt: serverTimestamp(),
      });
      // Public-lookup record so a non-member can resolve an invite code to a
      // boardId without needing read access to the board document itself
      // (boards are member-only readable — see firestore.rules).
      await setDoc(doc(db, 'inviteCodes', inviteCode), { boardId: boardRef.id });
      // Keep boards.list in sync so the new board is immediately visible/
      // selectable instead of waiting for the live listener's next tick.
      await dispatch(fetchUserBoards(uid));
      return boardRef.id;
    } catch (err) {
      return rejectWithValue(err.message || 'Could not create board.');
    }
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

    try {
      await updateDoc(doc(db, 'boards', boardId), {
        [`roles.${targetUid}`]: newRole,
      });
      await dispatch(fetchUserBoards(currentUid));
    } catch (err) {
      return rejectWithValue(err.message || 'Could not update role.');
    }
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

    try {
      await updateDoc(doc(db, 'boards', boardId), {
        members: arrayRemove(targetUid),
        [`roles.${targetUid}`]: deleteField(),
      });
      await dispatch(fetchUserBoards(currentUid));
    } catch (err) {
      return rejectWithValue(err.message || 'Could not remove member.');
    }
  },
);

// Owner-only (not Admin). Same client-stopgap convention as
// updateMemberRole/removeMember above — the real boundary is
// firestore.rules, which only permits a `name` change from the board's
// current owner.
export const renameBoard = createAsyncThunk(
  'boards/renameBoard',
  async ({ boardId, newName }, { getState, dispatch, rejectWithValue }) => {
    const currentUid = getState().auth.user?.uid;
    const board = getState().boards.list.find((b) => b.id === boardId);
    if (!board) return rejectWithValue('Board not found.');
    if (getMemberRole(board, currentUid) !== 'owner') {
      return rejectWithValue('Only the board owner can rename this board.');
    }

    try {
      await updateDoc(doc(db, 'boards', boardId), { name: newName });
      await dispatch(fetchUserBoards(currentUid));
    } catch (err) {
      return rejectWithValue(err.message || 'Could not rename board.');
    }
  },
);

// Owner-only. Cascades: every task on this board, every joinRequest for
// it, its inviteCodes lookup doc, then the board document itself — in that
// order, in one flat list of refs. Order matters beyond readability: the
// board doc MUST be the very last ref, because the tasks/joinRequests/
// inviteCode deletes all have firestore.rules that get() this board to
// check the actor's role on it — deleting the board first (in an earlier
// batch, if the cascade is large enough to split) would make those later
// deletes fail rule evaluation against a board that no longer exists.
// Batches commit sequentially (awaited in order), so keeping the board doc
// last guarantees every other delete in this cascade is evaluated while it
// still exists, regardless of where the 500-op chunk boundaries fall.
export const deleteCollaborativeBoard = createAsyncThunk(
  'boards/deleteCollaborativeBoard',
  async ({ boardId }, { getState, rejectWithValue }) => {
    const currentUid = getState().auth.user?.uid;
    const board = getState().boards.list.find((b) => b.id === boardId);
    if (!board) return rejectWithValue('Board not found.');
    if (getMemberRole(board, currentUid) !== 'owner') {
      return rejectWithValue('Only the board owner can delete this board.');
    }

    try {
      const [tasksSnap, joinRequestsSnap] = await Promise.all([
        getDocs(query(collection(db, 'tasks'), where('boardId', '==', boardId))),
        getDocs(
          query(collection(db, 'joinRequests'), where('boardId', '==', boardId)),
        ),
      ]);

      const refs = [
        ...tasksSnap.docs.map((d) => d.ref),
        ...joinRequestsSnap.docs.map((d) => d.ref),
      ];
      if (board.inviteCode) {
        refs.push(doc(db, 'inviteCodes', board.inviteCode));
      }
      refs.push(doc(db, 'boards', boardId));

      await deleteRefsInBatches(refs);
    } catch (err) {
      return rejectWithValue(err.message || 'Could not delete board.');
    }
  },
);

// Owner-only; newOwnerUid must already be a member AND currently hold the
// 'admin' role (checked here AND in firestore.rules' isOwnershipTransfer,
// which additionally proves nothing else in the document changed alongside
// it) — a plain Member must first be promoted to Admin before they can be
// handed ownership. The previous owner is demoted to 'admin', not removed
// — they keep elevated access, just not the top role.
export const transferOwnership = createAsyncThunk(
  'boards/transferOwnership',
  async (
    { boardId, newOwnerUid },
    { getState, dispatch, rejectWithValue },
  ) => {
    const currentUid = getState().auth.user?.uid;
    const board = getState().boards.list.find((b) => b.id === boardId);
    if (!board) return rejectWithValue('Board not found.');
    if (getMemberRole(board, currentUid) !== 'owner') {
      return rejectWithValue('Only the board owner can transfer ownership.');
    }
    if (newOwnerUid === currentUid) {
      return rejectWithValue(
        'Choose a different member to transfer ownership to.',
      );
    }
    if (!board.members?.includes(newOwnerUid)) {
      return rejectWithValue('That user is not a member of this board.');
    }
    if (getMemberRole(board, newOwnerUid) !== 'admin') {
      return rejectWithValue('Ownership can only be transferred to an Admin.');
    }

    try {
      await updateDoc(doc(db, 'boards', boardId), {
        ownerId: newOwnerUid,
        [`roles.${newOwnerUid}`]: 'owner',
        [`roles.${currentUid}`]: 'admin',
      });
      await dispatch(fetchUserBoards(currentUid));
    } catch (err) {
      return rejectWithValue(err.message || 'Could not transfer ownership.');
    }
  },
);

// Admin/Member only — the Owner can't use this to leave their own board
// (must transferOwnership or deleteCollaborativeBoard instead); enforced
// here AND in firestore.rules' isSelfLeave, which also proves this can only
// remove the ACTOR's own membership, never anyone else's.
export const leaveBoard = createAsyncThunk(
  'boards/leaveBoard',
  async ({ boardId, uid }, { getState, dispatch, rejectWithValue }) => {
    const board = getState().boards.list.find((b) => b.id === boardId);
    if (!board) return rejectWithValue('Board not found.');
    if (board.ownerId === uid) {
      return rejectWithValue(
        'The board owner cannot leave — transfer ownership or delete the board instead.',
      );
    }

    try {
      await updateDoc(doc(db, 'boards', boardId), {
        members: arrayRemove(uid),
        [`roles.${uid}`]: deleteField(),
      });
      await dispatch(fetchUserBoards(uid));
    } catch (err) {
      return rejectWithValue(err.message || 'Could not leave board.');
    }
  },
);

// Every user has exactly one private board (created at signup/login by
// ensureDefaultBoard in authSlice.js) — look it up fresh from Firestore
// rather than trusting cached Redux state, same as the collaborative thunk.
export const getUserPrivateBoard = createAsyncThunk(
  'boards/getUserPrivateBoard',
  async (uid, { rejectWithValue }) => {
    try {
      const privateQuery = query(
        collection(db, 'boards'),
        where('ownerId', '==', uid),
        where('type', '==', 'private'),
      );
      const snapshot = await getDocs(privateQuery);
      if (snapshot.empty) {
        return rejectWithValue('No private board found for this user.');
      }
      return snapshot.docs[0].id;
    } catch (err) {
      return rejectWithValue(err.message || 'Could not load your private board.');
    }
  },
);

const boardsSlice = createSlice({
  name: 'boards',
  initialState: {
    list: [],
    joined: [],
    activeBoardId: null,
    status: 'idle', // 'idle' | 'loading'
    // True once boardsListenerMiddleware.js's onSnapshot has delivered its
    // FIRST snapshot for the current session — distinguishes "still loading"
    // from "genuinely has no access to this board", which BoardWorkspace
    // needs to render the correct one of those two states instead of
    // flashing a false "no access" message before boards.list has arrived.
    loaded: false,
  },
  reducers: {
    activeBoardSet: (state, action) => {
      state.activeBoardId = action.payload;
    },
    // Dispatched by boardsListenerMiddleware.js's onSnapshot, not by any
    // thunk here — `list` and `joined` are pre-split by the listener
    // (which already knows the current uid) rather than in this reducer.
    boardsReceived: (state, action) => {
      state.list = action.payload.list;
      state.joined = action.payload.joined;
      state.loaded = true;
    },
    boardsCleared: (state) => {
      state.list = [];
      state.joined = [];
      state.activeBoardId = null;
      state.loaded = false;
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

export const { activeBoardSet, boardsReceived, boardsCleared } = boardsSlice.actions;
export default boardsSlice.reducer;
