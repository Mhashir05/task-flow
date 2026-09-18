// ONE-TIME dev/testing utility — NOT part of the app itself, never imported
// by any app code. Populates Firestore with realistic test data pulled from
// dummyjson.com: 100 real Firebase Auth users (with their private boards,
// exactly like a normal signup), one collaborative test board with roles
// spread across those users, ~25 tasks, and a handful of comments per task.
//
// Uses the Firebase ADMIN SDK (not the client SDK the app itself uses) for
// two reasons this script specifically needs: it creates real Auth accounts
// directly (auth.createUser), and it needs to write documents that bypass
// firestore.rules entirely (bulk-seeding as an arbitrary set of users is
// not something any real client is ever allowed to do — nor should it be).
//
// Imports use firebase-admin's modular submodule entry points
// (firebase-admin/app, /auth, /firestore) rather than the old
// `import admin from 'firebase-admin'; admin.credential.cert(...)`
// namespace style — the package's root export ("." in its package.json
// exports map) only has a single non-conditional CJS target with no ESM
// variant, so under Node's CJS/ESM interop `admin.credential` comes back
// undefined here. The submodule paths (e.g. "./app") DO have a proper
// "import" condition pointing at real ESM files, which is what actually
// works from a .mjs file on the installed v14.4.0.
//
// Every document shape below is copied from this project's OWN current
// thunks — ensureDefaultBoard/signUp in src/features/auth/authSlice.js,
// createCollaborativeBoard in src/features/boards/boardsSlice.js, and
// addTask/setTaskAssignees/addComment in src/features/tasks/tasksSlice.js
// — not reinvented, so the app renders this data exactly like it would
// data created through normal use.
//
// Run with: node scripts/seed-dummy-data.mjs
// Requires SERVICE_ACCOUNT_PATH (or GOOGLE_APPLICATION_CREDENTIALS) set to
// the path of a downloaded Firebase service account JSON key — see
// .env.example for where to get one. See the bottom of this file / the
// chat message that introduced this script for full run instructions.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const DUMMYJSON_BASE = 'https://dummyjson.com';
const USER_COUNT = 100;
// user 1 = owner, the next ADMIN_COUNT = admin, the rest = member. Kept as
// a named constant (used by both seedBoard and the final summary's display
// logic below) rather than a magic slice bound, so the two can't drift
// apart the way a hardcoded number in each place could.
const ADMIN_COUNT = 5;
// Left at 25 rather than scaled up with USER_COUNT — this board is a demo
// of the task/comment/assignee features, not a simulation of realistic
// per-user task volume, and 25 tasks already exercises every status/
// priority/assignee/comment path with 100 possible creators/assignees to
// draw from. Bumping this to match USER_COUNT would just mean 4x the
// Firestore writes for a portfolio/demo board with no proportional benefit
// to what it actually demonstrates.
const TODO_COUNT = 25;
// Unchanged for the same reason, and because the comment-pool is already
// reused with replacement (see randomItem in seedComments below) rather
// than requiring one unique comment per slot — it doesn't need to grow
// just because TODO_COUNT didn't.
const COMMENT_POOL_SIZE = 50;
const SEED_PASSWORD = 'Test1234';

// Exact status/priority strings this project actually uses — see the
// `statuses`/`PRIORITIES` arrays in src/features/boards/BoardWorkspace.jsx.
// 'urgent' is deliberately lowercase there (inconsistent with the other
// three) — matched here exactly rather than "corrected", since the app
// renders whatever string is stored verbatim.
const NON_DONE_STATUSES = ['To Do', 'In Progress', 'Review'];
const PRIORITIES = ['Low', 'Medium', 'High', 'urgent'];

const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars

// --------------------------------------------------------------------------
// Admin SDK bootstrap
// --------------------------------------------------------------------------

const serviceAccountPath =
  process.env.SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!serviceAccountPath) {
  console.error(
    'Missing service account path.\n' +
      'Set SERVICE_ACCOUNT_PATH (or GOOGLE_APPLICATION_CREDENTIALS) to the JSON key file\n' +
      'downloaded from Firebase Console -> Project Settings -> Service Accounts -> Generate new private key.\n' +
      'See .env.example for details. This file must NEVER be committed to git.',
  );
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(resolve(serviceAccountPath), 'utf8'));
} catch (err) {
  console.error(`Could not read/parse service account file at "${serviceAccountPath}":`, err.message);
  process.exit(1);
}

const firebaseApp = initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// --------------------------------------------------------------------------
// Small helpers
// --------------------------------------------------------------------------

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// A plain "YYYY-MM-DD" string, 1-21 days out — matches the format
// <input type="date"> produces, which is what `dueDate` is stored as
// everywhere in this project (a plain string, never a Firestore Timestamp).
function randomNearFutureDate() {
  const daysAhead = Math.floor(Math.random() * 21) + 1;
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

function generateInviteCode(length = 7) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += INVITE_CODE_ALPHABET[Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)];
  }
  return code;
}

async function fetchJson(path) {
  const res = await fetch(`${DUMMYJSON_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`GET ${path} -> HTTP ${res.status}`);
  }
  return res.json();
}

// --------------------------------------------------------------------------
// Step 1 — Users (real Auth accounts + users/{uid} doc + private board)
// --------------------------------------------------------------------------

async function seedUsers() {
  const { users: dummyUsers } = await fetchJson(`/users?limit=${USER_COUNT}`);
  const seeded = [];

  for (let i = 0; i < dummyUsers.length; i += 1) {
    const du = dummyUsers[i];
    const displayName = `${du.firstName} ${du.lastName}`.trim();
    const fallbackEmail = `${du.username}@dummytest.local`;

    let userRecord = null;
    try {
      userRecord = await auth.createUser({
        email: du.email,
        password: SEED_PASSWORD,
        displayName,
      });
    } catch (primaryErr) {
      // Primary email taken (or otherwise rejected) — fall back to a
      // username-derived address on a clearly-fake domain, so a re-run
      // (or a coincidental real-email collision) doesn't just fail outright.
      console.log(`  (${du.email} unavailable: ${primaryErr.message} — trying ${fallbackEmail})`);
      try {
        userRecord = await auth.createUser({
          email: fallbackEmail,
          password: SEED_PASSWORD,
          displayName,
        });
      } catch (fallbackErr) {
        console.error(
          `  x Failed to create Auth user for "${displayName}" (tried ${du.email} and ${fallbackEmail}):`,
          fallbackErr.message,
        );
        // eslint-disable-next-line no-continue
        continue;
      }
    }

    try {
      const userRef = db.collection('users').doc(userRecord.uid);
      await userRef.set({
        uid: userRecord.uid,
        email: userRecord.email,
        displayName,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Same shape as ensureDefaultBoard's private-board setDoc in
      // src/features/auth/authSlice.js — no roles map (private boards
      // never get one; getMemberRole()'s ownerId fallback covers it).
      const boardRef = db.collection('boards').doc();
      await boardRef.set({
        name: 'My Board',
        ownerId: userRecord.uid,
        type: 'private',
        members: [userRecord.uid],
        createdAt: FieldValue.serverTimestamp(),
      });
      await userRef.set({ defaultBoardId: boardRef.id }, { merge: true });

      seeded.push({ uid: userRecord.uid, email: userRecord.email, displayName });
      console.log(`Created user ${seeded.length}/${dummyUsers.length}: ${userRecord.email}`);
    } catch (err) {
      console.error(`  x Failed to write Firestore docs for ${userRecord.email}:`, err.message);
    }
  }

  return seeded;
}

// --------------------------------------------------------------------------
// Step 2 — One collaborative test board, roles spread across the seeded users
// --------------------------------------------------------------------------

async function seedBoard(seededUsers) {
  if (seededUsers.length === 0) {
    throw new Error('No users were seeded — cannot create a test board without an owner.');
  }

  // user 1 = owner, the next ADMIN_COUNT users = admin, everyone else =
  // member — sliced off ADMIN_COUNT rather than hardcoded indices, so this
  // still works sensibly if fewer than USER_COUNT users were actually
  // created (e.g. re-running against existing data, or dummyjson emails
  // colliding more than expected).
  const owner = seededUsers[0];
  const admins = seededUsers.slice(1, 1 + ADMIN_COUNT);
  const members = seededUsers.slice(1 + ADMIN_COUNT);

  const roles = { [owner.uid]: 'owner' };
  admins.forEach((u) => {
    roles[u.uid] = 'admin';
  });
  members.forEach((u) => {
    roles[u.uid] = 'member';
  });

  const inviteCode = generateInviteCode();
  const boardRef = db.collection('boards').doc();

  // Same shape as createCollaborativeBoard in
  // src/features/boards/boardsSlice.js.
  await boardRef.set({
    name: 'Dummy Test Board',
    ownerId: owner.uid,
    type: 'collaborative',
    members: seededUsers.map((u) => u.uid),
    roles,
    inviteCode,
    createdAt: FieldValue.serverTimestamp(),
  });
  await db.collection('inviteCodes').doc(inviteCode).set({ boardId: boardRef.id });

  console.log(`Created collaborative board "Dummy Test Board" (${boardRef.id}), invite code ${inviteCode}`);

  return { boardId: boardRef.id, inviteCode, owner, admins, members };
}

// --------------------------------------------------------------------------
// Step 3 — Tasks from dummyjson todos
// --------------------------------------------------------------------------

async function seedTasks(boardInfo, seededUsers) {
  const { todos } = await fetchJson(`/todos?limit=${TODO_COUNT}`);
  // The board's Owner can never be an assignee — enforced at the rules
  // layer by isSafeAssigneeUids in firestore.rules — so it's excluded from
  // the candidate pool here rather than relying on the write being silently
  // rejected.
  const assignablePool = seededUsers.filter((u) => u.uid !== boardInfo.owner.uid);
  const createdTasks = [];

  for (let i = 0; i < todos.length; i += 1) {
    const todo = todos[i];
    const status = todo.completed ? 'Done' : randomItem(NON_DONE_STATUSES);
    const creator = randomItem(seededUsers);

    const assigneeCount =
      assignablePool.length === 0 ? 0 : Math.random() < 0.5 ? 1 : 2;
    const pool = [...assignablePool];
    const assignees = [];
    for (let a = 0; a < Math.min(assigneeCount, pool.length); a += 1) {
      const idx = Math.floor(Math.random() * pool.length);
      const [picked] = pool.splice(idx, 1);
      assignees.push({ uid: picked.uid, email: picked.email });
    }

    try {
      const taskRef = db.collection('tasks').doc();
      // Same field shape as addTask (title/description/status/dueDate/
      // priority/boardId/userId) in src/features/tasks/tasksSlice.js, plus
      // assignees/assigneeUids in the same paired shape setTaskAssignees
      // writes them in. statusRequest/deleteRequest/publishRequest are
      // intentionally omitted, matching how a freshly-created task via the
      // app never has them either (every read of those fields elsewhere in
      // the app defaults with `?? null`).
      await taskRef.set({
        title: todo.todo,
        description: '',
        status,
        dueDate: Math.random() < 0.5 ? randomNearFutureDate() : '',
        priority: randomItem(PRIORITIES),
        boardId: boardInfo.boardId,
        userId: creator.uid,
        assignees,
        assigneeUids: assignees.map((a) => a.uid),
      });
      createdTasks.push({ id: taskRef.id });
      console.log(`Created task ${createdTasks.length}/${todos.length}`);
    } catch (err) {
      console.error(`  x Failed to create task from todo #${todo.id}:`, err.message);
    }
  }

  return createdTasks;
}

// --------------------------------------------------------------------------
// Step 4 — Comments from dummyjson comments
// --------------------------------------------------------------------------

async function seedComments(createdTasks, seededUsers) {
  const { comments } = await fetchJson(`/comments?limit=${COMMENT_POOL_SIZE}`);
  let totalComments = 0;
  // A single incrementing counter across the whole run, rather than a
  // fresh Date.now() per comment — guarantees every comment's createdAt is
  // unique even if two land on the same uid within the same task, which
  // matters because editComment/deleteComment match on (uid, createdAt)
  // together (see tasksSlice.js) and a collision would make them ambiguous.
  let clock = Date.now();

  for (let i = 0; i < createdTasks.length; i += 1) {
    const task = createdTasks[i];
    const commentCount = Math.random() < 0.5 ? 2 : 3;
    const taskComments = [];

    for (let c = 0; c < commentCount; c += 1) {
      const dummyComment = randomItem(comments);
      const commenter = randomItem(seededUsers);
      // Same shape as addComment's arrayUnion element in tasksSlice.js —
      // a plain client timestamp (ms epoch), not serverTimestamp(), since
      // Firestore rejects a serverTimestamp() sentinel used as a value
      // inside an array element.
      taskComments.push({
        uid: commenter.uid,
        email: commenter.email,
        text: dummyComment.body,
        createdAt: clock,
      });
      clock += 1;
    }

    try {
      await db.collection('tasks').doc(task.id).update({ comments: taskComments });
      totalComments += taskComments.length;
      console.log(`Attached ${taskComments.length} comments to task ${i + 1}/${createdTasks.length}`);
    } catch (err) {
      console.error(`  x Failed to attach comments to task ${task.id}:`, err.message);
    }
  }

  return totalComments;
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function main() {
  console.log(`Seeding dummy data into Firebase project: ${serviceAccount.project_id}`);
  console.log('');

  console.log('=== Step 1: Users ===');
  const seededUsers = await seedUsers();

  console.log('');
  console.log('=== Step 2: Collaborative board ===');
  const boardInfo = await seedBoard(seededUsers);

  console.log('');
  console.log('=== Step 3: Tasks ===');
  const createdTasks = await seedTasks(boardInfo, seededUsers);

  console.log('');
  console.log('=== Step 4: Comments ===');
  const totalComments = await seedComments(createdTasks, seededUsers);

  console.log('');
  console.log('=== Summary ===');
  console.log(`Users created:    ${seededUsers.length}/${USER_COUNT}`);
  console.log(`Tasks created:    ${createdTasks.length}/${TODO_COUNT}`);
  console.log(`Comments created: ${totalComments}`);
  console.log(`Test board id:    ${boardInfo.boardId}`);
  console.log(`Invite code:      ${boardInfo.inviteCode}`);
  console.log('');
  console.log(`Login password for every seeded user: ${SEED_PASSWORD}`);
  console.log('Seeded accounts:');
  seededUsers.forEach((u, i) => {
    // eslint-disable-next-line no-nested-ternary
    const role = i === 0 ? 'owner' : i < 1 + ADMIN_COUNT ? 'admin' : 'member';
    console.log(`  ${i + 1}. ${u.email}  (${role} on Dummy Test Board)`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed script failed:', err);
    process.exit(1);
  });
