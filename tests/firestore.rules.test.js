// Regression tests for firestore.rules, run against the Firestore emulator
// via @firebase/rules-unit-testing. NOT exhaustive coverage of every UI
// feature — priority is (1) the two exploits found and fixed this session
// (isSafeBoardMove's bundling bypass, isSafeAdminRolesChange's missing
// owner/admin protection) staying fixed, and (2) the core permission
// matrix documented throughout this project's own rules comments.
//
// Run via `npm run test:rules` (wraps this in `firebase emulators:exec` so
// a real Firestore emulator is running on the port firebase.json declares).
// Running `vitest` directly against this file without the emulator up will
// fail every test with a connection error, not a rules failure.

import { readFileSync } from 'node:fs';
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  arrayUnion,
} from 'firebase/firestore';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'taskflow-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// authenticatedContext(uid).firestore() returns a Firestore instance meant
// to be passed as the `db` argument to the modular `firebase/firestore`
// functions (doc(db, ...), setDoc(ref, ...), etc.) — the same API surface
// this project's own src/ code uses, not the legacy v8 namespaced API.
function ctxDb(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

// Writes go through withSecurityRulesDisabled so test fixtures can be
// created regardless of what the rules would otherwise allow — this is
// ONLY for arranging state before an assertion, never for the assertion
// itself.
async function seed(fn) {
  await testEnv.withSecurityRulesDisabled(async (context) => fn(context.firestore()));
}

// --------------------------------------------------------------------------
// Fixture data
// --------------------------------------------------------------------------

const OWNER = 'owner-uid';
const ADMIN = 'admin-uid';
const ADMIN2 = 'admin2-uid';
const MEMBER = 'member-uid';
const MEMBER2 = 'member2-uid';

const BOARD = 'board-1';
// A second board none of the main cast holds any role on — used to prove
// isSafeBoardMove's target-role requirement actually fires, and as a
// bundling-bypass destination.
const OTHER_BOARD = 'board-2';

const PRIVATE_OWNER = 'private-owner-uid';
const PRIVATE_BOARD = 'private-board-1';

async function seedCollaborativeBoard(db, overrides = {}) {
  await setDoc(doc(db, 'boards', BOARD), {
    name: 'Test Board',
    ownerId: OWNER,
    type: 'collaborative',
    members: [OWNER, ADMIN, ADMIN2, MEMBER, MEMBER2],
    roles: {
      [OWNER]: 'owner',
      [ADMIN]: 'admin',
      [ADMIN2]: 'admin',
      [MEMBER]: 'member',
      [MEMBER2]: 'member',
    },
    inviteCode: 'ABC1234',
    createdAt: Date.now(),
    ...overrides,
  });
}

async function seedOtherBoard(db) {
  await setDoc(doc(db, 'boards', OTHER_BOARD), {
    name: 'Other Board',
    ownerId: 'someone-else-uid',
    type: 'collaborative',
    members: ['someone-else-uid'],
    roles: { 'someone-else-uid': 'owner' },
    inviteCode: 'XYZ9999',
    createdAt: Date.now(),
  });
}

async function seedPrivateBoard(db) {
  await setDoc(doc(db, 'boards', PRIVATE_BOARD), {
    name: 'My Board',
    ownerId: PRIVATE_OWNER,
    type: 'private',
    members: [PRIVATE_OWNER],
    createdAt: Date.now(),
  });
}

async function seedTask(db, id, overrides = {}) {
  await setDoc(doc(db, 'tasks', id), {
    title: 'Test task',
    description: '',
    status: 'To Do',
    dueDate: '',
    priority: 'Medium',
    boardId: BOARD,
    userId: MEMBER,
    ...overrides,
  });
  return id;
}

// ==========================================================================
// Priority 1 — regressions for the two exploits found and fixed this session
// ==========================================================================

describe('Regression: isSafeBoardMove bundling bypass', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await seedCollaborativeBoard(db);
      await seedOtherBoard(db);
    });
  });

  it('rejects the Owner bundling boardId with an unrelated field to move a task they did not create', async () => {
    const taskId = 'task-owner-bundle';
    await seed((db) => seedTask(db, taskId, { userId: MEMBER, boardId: BOARD }));

    await assertFails(
      updateDoc(doc(ctxDb(OWNER), 'tasks', taskId), {
        boardId: OTHER_BOARD,
        title: 'bundled edit',
      }),
    );
  });

  it('rejects an Admin bundling boardId with an unrelated field to move a task they did not create', async () => {
    const taskId = 'task-admin-bundle';
    await seed((db) => seedTask(db, taskId, { userId: MEMBER, boardId: BOARD }));

    await assertFails(
      updateDoc(doc(ctxDb(ADMIN), 'tasks', taskId), {
        boardId: OTHER_BOARD,
        title: 'bundled edit',
      }),
    );
  });

  it('sanity check: a boardId-only move by the Owner to a board they do not own is still rejected (creator+target-role both still enforced)', async () => {
    const taskId = 'task-owner-move-only';
    await seed((db) => seedTask(db, taskId, { userId: MEMBER, boardId: BOARD }));

    await assertFails(
      updateDoc(doc(ctxDb(OWNER), 'tasks', taskId), { boardId: OTHER_BOARD }),
    );
  });
});

describe('Regression: isSafeAdminRolesChange owner/admin protection', () => {
  beforeEach(async () => {
    await seed((db) => seedCollaborativeBoard(db));
  });

  it('rejects an Admin removing the Owner from members/roles', async () => {
    await assertFails(
      updateDoc(doc(ctxDb(ADMIN), 'boards', BOARD), {
        members: [ADMIN, ADMIN2, MEMBER, MEMBER2],
        [`roles.${OWNER}`]: deleteField(),
      }),
    );
  });

  it('rejects an Admin removing another Admin', async () => {
    await assertFails(
      updateDoc(doc(ctxDb(ADMIN), 'boards', BOARD), {
        members: [OWNER, ADMIN, MEMBER, MEMBER2],
        [`roles.${ADMIN2}`]: deleteField(),
      }),
    );
  });

  it('still allows an Admin removing a plain Member (the legitimate case must not have broken)', async () => {
    await assertSucceeds(
      updateDoc(doc(ctxDb(ADMIN), 'boards', BOARD), {
        members: [OWNER, ADMIN, ADMIN2, MEMBER2],
        [`roles.${MEMBER}`]: deleteField(),
      }),
    );
  });
});

// ==========================================================================
// Priority 2 — core permission matrix
// ==========================================================================

describe('Boards: rename', () => {
  beforeEach(async () => {
    await seed((db) => seedCollaborativeBoard(db));
  });

  it('Owner can rename the board', async () => {
    await assertSucceeds(
      updateDoc(doc(ctxDb(OWNER), 'boards', BOARD), { name: 'Renamed' }),
    );
  });

  it('Admin cannot rename the board', async () => {
    await assertFails(
      updateDoc(doc(ctxDb(ADMIN), 'boards', BOARD), { name: 'Renamed' }),
    );
  });

  it('Member cannot rename the board', async () => {
    await assertFails(
      updateDoc(doc(ctxDb(MEMBER), 'boards', BOARD), { name: 'Renamed' }),
    );
  });
});

describe('Boards: delete', () => {
  beforeEach(async () => {
    await seed((db) => seedCollaborativeBoard(db));
  });

  it('Owner can delete the board', async () => {
    await assertSucceeds(deleteDoc(doc(ctxDb(OWNER), 'boards', BOARD)));
  });

  it('Admin cannot delete the board', async () => {
    await assertFails(deleteDoc(doc(ctxDb(ADMIN), 'boards', BOARD)));
  });

  it('Member cannot delete the board', async () => {
    await assertFails(deleteDoc(doc(ctxDb(MEMBER), 'boards', BOARD)));
  });
});

describe('Boards: ownership transfer', () => {
  beforeEach(async () => {
    await seed((db) => seedCollaborativeBoard(db));
  });

  it('Owner can transfer ownership to an existing Admin', async () => {
    await assertSucceeds(
      updateDoc(doc(ctxDb(OWNER), 'boards', BOARD), {
        ownerId: ADMIN,
        [`roles.${ADMIN}`]: 'owner',
        [`roles.${OWNER}`]: 'admin',
      }),
    );
  });

  it('Owner cannot transfer ownership to a plain Member (target must be Admin)', async () => {
    await assertFails(
      updateDoc(doc(ctxDb(OWNER), 'boards', BOARD), {
        ownerId: MEMBER,
        [`roles.${MEMBER}`]: 'owner',
        [`roles.${OWNER}`]: 'admin',
      }),
    );
  });

  it('a non-Owner (Admin) cannot trigger ownership transfer at all', async () => {
    await assertFails(
      updateDoc(doc(ctxDb(ADMIN), 'boards', BOARD), {
        ownerId: ADMIN,
        [`roles.${ADMIN}`]: 'owner',
        [`roles.${OWNER}`]: 'admin',
      }),
    );
  });
});

describe('Boards: leave', () => {
  beforeEach(async () => {
    await seed((db) => seedCollaborativeBoard(db));
  });

  it('Admin can leave the board directly', async () => {
    await assertSucceeds(
      updateDoc(doc(ctxDb(ADMIN), 'boards', BOARD), {
        members: [OWNER, ADMIN2, MEMBER, MEMBER2],
        [`roles.${ADMIN}`]: deleteField(),
      }),
    );
  });

  it('a Member can create a leaveRequests doc for themselves (request to leave)', async () => {
    await assertSucceeds(
      setDoc(doc(ctxDb(MEMBER), 'leaveRequests', 'leave-req-1'), {
        boardId: BOARD,
        requesterUid: MEMBER,
        requesterEmail: 'member@example.com',
        status: 'pending',
        createdAt: Date.now(),
      }),
    );
  });

  // The app's own UI/thunks never let a plain Member trigger this write
  // shape (BoardMembers.jsx only renders the direct "Leave Board" button
  // for role === 'admin'; a Member only ever sees "Request to Leave") —
  // this test checks whether that policy is ALSO independently enforced
  // at the rules layer, the same two-layer pattern as every other
  // Member-facing restriction in this file.
  it('a Member cannot leave the board directly (must go through a leave request)', async () => {
    await assertFails(
      updateDoc(doc(ctxDb(MEMBER), 'boards', BOARD), {
        members: [OWNER, ADMIN, ADMIN2, MEMBER2],
        [`roles.${MEMBER}`]: deleteField(),
      }),
    );
  });
});

describe('Tasks: status changes', () => {
  beforeEach(async () => {
    await seed((db) => seedCollaborativeBoard(db));
  });

  it('Owner can set any status on a task they did not create', async () => {
    const taskId = 'task-status-owner';
    await seed((db) => seedTask(db, taskId, { userId: MEMBER2, status: 'To Do' }));
    await assertSucceeds(
      updateDoc(doc(ctxDb(OWNER), 'tasks', taskId), { status: 'In Progress' }),
    );
  });

  it("Admin can set any status on a task they did not create, including 'Done'", async () => {
    const taskId = 'task-status-admin';
    await seed((db) => seedTask(db, taskId, { userId: MEMBER2, status: 'To Do' }));
    await assertSucceeds(
      updateDoc(doc(ctxDb(ADMIN), 'tasks', taskId), { status: 'Done' }),
    );
  });

  it('a Member can set status directly on a task they created', async () => {
    const taskId = 'task-status-member-own';
    await seed((db) => seedTask(db, taskId, { userId: MEMBER, status: 'To Do' }));
    await assertSucceeds(
      updateDoc(doc(ctxDb(MEMBER), 'tasks', taskId), { status: 'In Progress' }),
    );
  });

  it('a Member cannot set status on a task they did not create', async () => {
    const taskId = 'task-status-member-other';
    await seed((db) => seedTask(db, taskId, { userId: MEMBER2, status: 'To Do' }));
    await assertFails(
      updateDoc(doc(ctxDb(MEMBER), 'tasks', taskId), { status: 'In Progress' }),
    );
  });

  it("a Member cannot set status to 'Done', even on their own task", async () => {
    const taskId = 'task-status-member-done';
    await seed((db) => seedTask(db, taskId, { userId: MEMBER, status: 'Review' }));
    await assertFails(
      updateDoc(doc(ctxDb(MEMBER), 'tasks', taskId), { status: 'Done' }),
    );
  });
});

describe('Tasks: delete', () => {
  beforeEach(async () => {
    await seed((db) => seedCollaborativeBoard(db));
  });

  it('Owner can delete a task directly, regardless of creator', async () => {
    const taskId = 'task-delete-owner';
    await seed((db) => seedTask(db, taskId, { userId: MEMBER }));
    await assertSucceeds(deleteDoc(doc(ctxDb(OWNER), 'tasks', taskId)));
  });

  it('Admin cannot delete a task directly', async () => {
    const taskId = 'task-delete-admin';
    await seed((db) => seedTask(db, taskId, { userId: MEMBER }));
    await assertFails(deleteDoc(doc(ctxDb(ADMIN), 'tasks', taskId)));
  });

  it('Member cannot delete a task directly, even their own', async () => {
    const taskId = 'task-delete-member';
    await seed((db) => seedTask(db, taskId, { userId: MEMBER }));
    await assertFails(deleteDoc(doc(ctxDb(MEMBER), 'tasks', taskId)));
  });

  it('a Member can submit a delete request instead', async () => {
    const taskId = 'task-delete-request';
    await seed((db) => seedTask(db, taskId, { userId: MEMBER }));
    await assertSucceeds(
      updateDoc(doc(ctxDb(MEMBER), 'tasks', taskId), {
        deleteRequest: {
          requestedBy: MEMBER,
          requestedByEmail: 'member@example.com',
          createdAt: Date.now(),
        },
      }),
    );
  });
});

describe('Tasks: comments', () => {
  beforeEach(async () => {
    await seed((db) => seedCollaborativeBoard(db));
  });

  it('comment add is unrestricted (a plain Member can add one)', async () => {
    const taskId = 'task-comment-add';
    await seed((db) => seedTask(db, taskId, { userId: MEMBER2, comments: [] }));
    await assertSucceeds(
      updateDoc(doc(ctxDb(MEMBER), 'tasks', taskId), {
        comments: arrayUnion({
          uid: MEMBER,
          email: 'member@example.com',
          text: 'hello',
          createdAt: 1000,
        }),
      }),
    );
  });

  it('a Member can edit their own comment', async () => {
    const taskId = 'task-comment-edit-own';
    const comment = { uid: MEMBER, email: 'member@example.com', text: 'original', createdAt: 1000 };
    await seed((db) => seedTask(db, taskId, { userId: MEMBER2, comments: [comment] }));
    await assertSucceeds(
      updateDoc(doc(ctxDb(MEMBER), 'tasks', taskId), {
        comments: [{ ...comment, text: 'edited' }],
      }),
    );
  });

  it("a Member cannot edit someone else's comment", async () => {
    const taskId = 'task-comment-edit-other';
    const comment = { uid: MEMBER2, email: 'member2@example.com', text: 'original', createdAt: 1000 };
    await seed((db) => seedTask(db, taskId, { userId: MEMBER2, comments: [comment] }));
    await assertFails(
      updateDoc(doc(ctxDb(MEMBER), 'tasks', taskId), {
        comments: [{ ...comment, text: 'edited by someone else' }],
      }),
    );
  });

  it("Admin can moderate-delete a plain Member's comment", async () => {
    const taskId = 'task-comment-mod-delete';
    const comment = { uid: MEMBER, email: 'member@example.com', text: 'to remove', createdAt: 1000 };
    await seed((db) => seedTask(db, taskId, { userId: MEMBER, comments: [comment] }));
    await assertSucceeds(
      updateDoc(doc(ctxDb(ADMIN), 'tasks', taskId), { comments: [] }),
    );
  });

  it("Admin cannot delete the Owner's own comment", async () => {
    const taskId = 'task-comment-admin-vs-owner';
    const comment = { uid: OWNER, email: 'owner@example.com', text: "owner's comment", createdAt: 1000 };
    await seed((db) => seedTask(db, taskId, { userId: MEMBER, comments: [comment] }));
    await assertFails(
      updateDoc(doc(ctxDb(ADMIN), 'tasks', taskId), { comments: [] }),
    );
  });

  it('Owner can delete their own comment', async () => {
    const taskId = 'task-comment-owner-self-delete';
    const comment = { uid: OWNER, email: 'owner@example.com', text: "owner's comment", createdAt: 1000 };
    await seed((db) => seedTask(db, taskId, { userId: MEMBER, comments: [comment] }));
    await assertSucceeds(
      updateDoc(doc(ctxDb(OWNER), 'tasks', taskId), { comments: [] }),
    );
  });

  it("Owner can moderate-delete anyone else's comment", async () => {
    const taskId = 'task-comment-owner-mod-delete';
    const comment = { uid: MEMBER, email: 'member@example.com', text: 'to remove', createdAt: 1000 };
    await seed((db) => seedTask(db, taskId, { userId: MEMBER, comments: [comment] }));
    await assertSucceeds(
      updateDoc(doc(ctxDb(OWNER), 'tasks', taskId), { comments: [] }),
    );
  });
});

describe('Tasks: assignee restrictions', () => {
  beforeEach(async () => {
    await seed((db) => seedCollaborativeBoard(db));
  });

  it("rejects writing the board's Owner into assigneeUids", async () => {
    const taskId = 'task-assignee-owner';
    await seed((db) => seedTask(db, taskId, { userId: MEMBER, assignees: [], assigneeUids: [] }));
    await assertFails(
      updateDoc(doc(ctxDb(ADMIN), 'tasks', taskId), {
        assignees: [{ uid: OWNER, email: 'owner@example.com' }],
        assigneeUids: [OWNER],
      }),
    );
  });

  it('allows assigning a plain Member', async () => {
    const taskId = 'task-assignee-member';
    await seed((db) => seedTask(db, taskId, { userId: MEMBER2, assignees: [], assigneeUids: [] }));
    await assertSucceeds(
      updateDoc(doc(ctxDb(ADMIN), 'tasks', taskId), {
        assignees: [{ uid: MEMBER, email: 'member@example.com' }],
        assigneeUids: [MEMBER],
      }),
    );
  });
});

describe('Private boards: unrestricted owner access', () => {
  beforeEach(async () => {
    await seed((db) => seedPrivateBoard(db));
  });

  it('the sole owner can edit any field on their own private task', async () => {
    const taskId = 'private-task-1';
    await seed((db) =>
      seedTask(db, taskId, { boardId: PRIVATE_BOARD, userId: PRIVATE_OWNER, status: 'To Do' }),
    );
    await assertSucceeds(
      updateDoc(doc(ctxDb(PRIVATE_OWNER), 'tasks', taskId), {
        title: 'Renamed task',
        description: 'New description',
      }),
    );
  });

  it("the sole owner can set their own task's status directly to 'Done' (no Member-style restriction applies)", async () => {
    const taskId = 'private-task-2';
    await seed((db) =>
      seedTask(db, taskId, { boardId: PRIVATE_BOARD, userId: PRIVATE_OWNER, status: 'Review' }),
    );
    await assertSucceeds(
      updateDoc(doc(ctxDb(PRIVATE_OWNER), 'tasks', taskId), { status: 'Done' }),
    );
  });

  it('the sole owner can rename their own private board', async () => {
    await assertSucceeds(
      updateDoc(doc(ctxDb(PRIVATE_OWNER), 'boards', PRIVATE_BOARD), { name: 'Renamed' }),
    );
  });

  it('the sole owner can delete their own task directly', async () => {
    const taskId = 'private-task-3';
    await seed((db) =>
      seedTask(db, taskId, { boardId: PRIVATE_BOARD, userId: PRIVATE_OWNER }),
    );
    await assertSucceeds(deleteDoc(doc(ctxDb(PRIVATE_OWNER), 'tasks', taskId)));
  });
});
