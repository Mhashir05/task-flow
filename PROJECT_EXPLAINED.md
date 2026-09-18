# Task Flow — Technical Walkthrough

A reference document for explaining this codebase confidently — what's in it, why it's built this way, and where the real complexity lives. Written from direct inspection of the code as it currently stands, not from memory of how it was originally scoped.

---

## 1. Stack & Tools — With Justification

| Package | Role in this project | Why this, not an alternative |
|---|---|---|
| **React 19** | UI framework | The baseline choice for this kind of interactive, component-heavy app; no framework-level reason to reach for anything else at this scale. |
| **Vite** | Dev server + build tool | Near-instant HMR during a session that involved constant iteration on UI details (drag state, animation timing, permission-gated rendering). A webpack-based setup would have made that iteration loop noticeably slower for no offsetting benefit here. |
| **Redux Toolkit** | Global state (slices, async thunks, `createListenerMiddleware`) | Context API works for small, rarely-changing state, but this app has state that (a) needs to be read from many unrelated components (active board, role, task list, pending requests) and (b) changes continuously from an external source (Firestore's live listeners), not just from user clicks. Modeling that as plain Context would mean either one giant context re-rendering everything on every snapshot, or hand-rolling multiple contexts plus the subscribe/unsubscribe lifecycle Redux Toolkit's `createListenerMiddleware` already gives for free. RTK's `createSlice`/`createAsyncThunk` also gave a consistent, low-boilerplate pattern to repeat across six feature slices as the permission model grew — see §4. |
| **React Router 7** | Client-side routing | Needed once the app grew from a single page into three distinct dashboard routes (`/dashboard`, `/dashboard/boards`, `/dashboard/board/:boardId`) each with its own auth-gating and data-loading needs. |
| **Firebase (Auth + Firestore)** | Backend | A custom REST/Node backend would mean building and hosting auth, a database, and an API layer from scratch — a large amount of infrastructure for what this project actually needs. Firestore's live `onSnapshot` listeners map directly onto the app's real-time requirement (every board member sees changes immediately), and its Security Rules let permission logic be enforced server-side without writing and hosting a custom API to do it. The tradeoff, discussed in §5, is that the rules language itself becomes a real piece of the system's complexity. |
| **GSAP + Lenis** | Animation and smooth scroll | CSS transitions/animations cover simple state-based transitions fine, but several effects here aren't expressible that way: staggered reveal of an unknown number of task cards, scroll-linked timing (via `ScrollTrigger`, driven by Lenis's smoothed scroll position), and interrupting/reversing an in-flight animation cleanly (e.g. a card's expand/collapse being toggled again mid-animation). GSAP's imperative API and Lenis's scroll abstraction handle these directly; recreating them in pure CSS would mean either giving up the effect or fighting the cascade to fake JS-like sequencing. |
| **oxlint** | Linting | A fast, zero-config-heavy linter with `react`/`oxc` plugin rules — chosen for low setup overhead rather than ESLint's larger, more configurable but slower and more config-dependent surface. |
| **Vitest** | Test runner (for the Security Rules suite) | Since the project is already on Vite, Vitest shares its config, transform pipeline, and watch mode instead of introducing Jest's separate config and transform setup for what is otherwise the same job. |
| **@firebase/rules-unit-testing** | Firestore emulator test harness | The only realistic way to test `firestore.rules` logic in isolation — the rules language isn't unit-testable any other way, and manually re-verifying every permission branch by hand in the live app doesn't scale once the rules file reaches the size described in §5. |
| **firebase-admin** (dev-only) | Backing the one-time seed script | Only usable for bulk-seeding real Auth users and bypassing Security Rules for bulk writes — the client SDK can't do either, by design. Confined to `scripts/`, never imported by app code. |

---

## 2. Full File/Folder Map

### `src/app/` — Redux store + Firestore listener middlewares

| File | Responsibility |
|---|---|
| `store.js` | Assembles the Redux store: registers every feature's reducer and prepends all four listener middlewares. |
| `tasksListenerMiddleware.js` | Subscribes to `onSnapshot` for the tasks of whichever board is currently active; re-subscribes on login/logout or when the active board changes; dispatches the live result into `tasksSlice`. |
| `boardsListenerMiddleware.js` | Subscribes to `onSnapshot` for every board the signed-in user is a member of (owned or joined); dispatches into `boardsSlice`, pre-split into "list" and "joined" arrays. |
| `joinRequestsListenerMiddleware.js` | Two listeners: pending join requests for whichever board the user can act on (owner/admin), and the user's own submitted join requests (to auto-refresh their board list the moment one is approved). |
| `leaveRequestsListenerMiddleware.js` | Mirrors the join-requests middleware for the opposite flow — pending leave requests for a board the user owns/admins. |

### `src/features/auth/` — Session, signup/login, private-board provisioning

| File | Responsibility |
|---|---|
| `authSlice.js` | `signUp`/`logIn`/`logOut`/`resetPassword` thunks; `ensureDefaultBoard` (creates a user's private board on first sign-in, including for pre-existing accounts); Firebase Auth error-code-to-message mapping. |
| `AuthGate.jsx` | Root route table — listens for Firebase's own auth-state changes, gates initial render on that, and declares every route (`/`, `/dashboard`, `/dashboard/boards`, `/dashboard/board/:boardId`, `/dashboard/profile`). |
| `AuthScreen.jsx` | The login/signup/password-reset form UI, embedded in the landing page. |
| `auth.css` | Styles scoped to the auth screen/landing page's auth card. |

### `src/features/boards/` — Boards, roles, members, and the task workspace itself

| File | Responsibility |
|---|---|
| `boardsSlice.js` | The largest slice: board CRUD (`createCollaborativeBoard`, `renameBoard`, `deleteCollaborativeBoard` with cascading deletes), role management (`updateMemberRole`, `removeMember`, `transferOwnership`), `leaveBoard` (Admin's direct-leave), and `getMemberRole` — the pure role-resolution function mirrored in `firestore.rules` as `roleOf()`. |
| `BoardHub.jsx` | The collaborative-board hub page (`/dashboard/boards`) — "Your Boards"/"Joined Boards" lists, create-board, join-by-invite-code, per-board and bulk delete. |
| `PrivateWorkspace.jsx` | Resolves the signed-in user's private board from the already-live board list and renders it through the shared workspace component — the `/dashboard` route. |
| `BoardWorkspace.jsx` | The task workspace itself (`/dashboard/board/:boardId`, and reused by `PrivateWorkspace`) — by far the largest file in the project: task CRUD, drag-and-drop, the Review-gate-before-Done substitution, comments, multi-assignee UI, all the request/approve/reject action handlers, and the GSAP/Lenis animation wiring. |
| `CollaborativePanel.jsx` | Board-management controls for a collaborative board's own workspace (rename, invite code, delete, pending join/leave/publish request review). |
| `BoardMembers.jsx` | The Team tab — member list with search, role changes, remove, ownership transfer, and the self-row leave/request-to-leave actions. |
| `BoardScopeToggle.jsx` | The shared "My Tasks / Collaborative Boards" navigation toggle rendered on both the private workspace and the hub. |

### `src/features/tasks/` — Task state and every task-level workflow

| File | Responsibility |
|---|---|
| `tasksSlice.js` | Every task-related thunk: `addTask`/`deleteTask`/`editTitle`/`editDescription`, direct `updateStatus`, `moveTaskToBoard`/`moveTaskToPrivate`, `setTaskAssignees`, `addComment`/`editComment`/`deleteComment`, and the three parallel request/approve/reject triads (status, delete, publish). |

### `src/features/joinRequests/` and `src/features/leaveRequests/`

| File | Responsibility |
|---|---|
| `joinRequestsSlice.js` | `submitJoinRequest` (resolves an invite code to a board via the public `inviteCodes` lookup), `approveJoinRequest`, `rejectJoinRequest`. |
| `leaveRequestsSlice.js` | The Member-only equivalent: `requestLeaveBoard`, `approveLeaveRequest`, `rejectLeaveRequest`. |

### `src/features/profile/`

| File | Responsibility |
|---|---|
| `profileSlice.js` | `fetchProfile`/`updateProfile` (display name only). |
| `ProfilePage.jsx` | The profile-editing page. |

### Top-level routes, shared components, and app shell

| File | Responsibility |
|---|---|
| `main.jsx` | Entry point — wraps the app in `StrictMode`, the Redux `Provider`, and `BrowserRouter`. |
| `firebase.js` | Initializes the Firebase app, Auth, and Firestore instances from `VITE_FIREBASE_*` env vars. |
| `components/ProtectedRoute.jsx` | Redirects to `/` if there's no signed-in user; otherwise renders its children. |
| `components/LandingPage.jsx` | Composes the landing page's nav, hero, animated task-board preview, and the embedded auth form. |
| `components/landing/*.jsx`, `data.js`, `landing.css` | Landing-page-only presentational pieces (`LandingNav`, `HeroMasthead`, `TaskBoardPreview`, `TaskCardMini`) and their static demo data — entirely decorative, no Redux/Firestore involvement. |
| `App.css` / `index.css` | `index.css` holds global design tokens and the pre-redesign flat styles (landing/auth); `App.css` holds the entire liquid-glass dashboard theme, scoped under `.page`. |

### The pattern behind every feature folder

Every feature folder (except the presentational `landing/`) follows the same shape: a **`*Slice.js`** owns that feature's Redux state and every Firestore-writing thunk for it, and one or more **components** read that state via `useSelector` and dispatch those thunks via `useDispatch`. Nothing outside a slice writes to its collection directly — a component never calls `updateDoc` itself, it dispatches a thunk that does. This is what makes §4's "each feature owns its own Firestore access" claim concrete rather than aspirational: `grep`-ing for `updateDoc`/`setDoc`/`deleteDoc` across `src/` turns up matches almost exclusively inside `*Slice.js` files.

---

## 3. End-to-End Data Flow

### A normal write: adding a task

1. **UI**: In `BoardWorkspace.jsx`, the "Add task" button's `onClick` calls `handleAddTask()`, which reads the form's local `useState` fields (`newTitle`, `newDescription`, `newDueDate`, `newPriority`) and builds a plain task object: `{ id: makeId(), title, description, status: 'To Do', dueDate, priority, boardId }`.
2. **Dispatch**: `dispatch(addTask(newTask))` fires the `addTask` thunk from `tasksSlice.js`.
3. **Thunk**: `addTask` pulls `userId` from `getState().auth.user?.uid`, strips the client-generated `id` back out of the object, and calls `setDoc(doc(db, 'tasks', id), { ...rest, userId })` — a single direct Firestore write. Nothing is written to Redux state by the thunk itself.
4. **Security Rules** (evaluated by Firestore, not by any client code): the task collection's `allow create` rule checks `isTaskBoardMember(request.resource.data.boardId, request.auth.uid)` — the write only succeeds if the boardId on the new document lists this uid as a member. This check runs whether the write came from this exact UI flow or a hand-crafted API call.
5. **Listener**: `tasksListenerMiddleware.js` already holds an open `onSnapshot` subscription on `tasks where boardId == <this board>` (established when the board became active). Firestore's real-time backend pushes the new document to every subscribed client — including the one that just wrote it — as a new snapshot.
6. **Back into Redux**: the `onSnapshot` callback maps the snapshot's docs to plain objects and dispatches `tasksReceived(...)`, a plain synchronous reducer in `tasksSlice.js` that replaces the whole `tasks` array in state.
7. **Re-render**: `BoardWorkspace.jsx`'s `useSelector((state) => state.tasks)` sees the new array reference, React re-renders, and the new card appears in its status column — via the listener round-trip, not by the component optimistically inserting its own task locally.

### A role-restricted write: a Member's status-change request → Owner's approval

This flow exists specifically because a plain Member is not allowed to change a task's status directly on a collaborative board unless they created it.

**Step A — the Member requests a change:**
1. In `BoardWorkspace.jsx`, `canManageTaskStatus(task)` returns `false` for a Member on a task they didn't create, so the UI renders a "request new status" `<select>` instead of an editable status dropdown.
2. Picking a value and confirming calls `handleRequestStatusChange`, which dispatches `requestStatusChange({ taskId, uid, email, requestedStatus })`.
3. The thunk (`tasksSlice.js`) does a client-side "is one already pending?" check (a UX nicety, not the security boundary), then `updateDoc`s the task with a `statusRequest: { requestedBy, requestedByEmail, requestedStatus, createdAt: serverTimestamp() }` object.
4. **Security Rules**: this write's shape (`affectedKeys() == ['statusRequest']`, going from `null` to a value naming the actor as `requestedBy`) is exactly what `isMemberStatusRequest` in `firestore.rules` permits for a Member. A write that tried to set `statusRequest` to something naming a *different* uid as requester, or that tried to bundle in a real `status` change alongside it, fails this check.
5. The board's live listener update flows back through the same `onSnapshot` → `tasksReceived` → re-render path as above; every board member (not just the requester) sees the "Pending: → X" badge appear.

**Step B — the Owner (or Admin) approves it:**
1. `canApproveStatusRequest` (`myRole === 'owner' || myRole === 'admin'`) gates the Approve/Reject buttons — only rendered for the roles allowed to act.
2. Clicking Approve dispatches `approveStatusRequest({ taskId, newStatus })`, whose thunk writes **both** `status: newStatus` and `statusRequest: null` in the same `updateDoc` call.
3. **Security Rules**: no Member-facing carve-out permits a write touching two fields at once, so this shape can only pass through the unconditional `roleOf(...) in ['owner', 'admin']` branch — meaning a Member cannot reach this same effect by calling the same thunk directly, even by bypassing the UI's button-hiding, because the write itself is rejected server-side for anyone who isn't actually Owner/Admin.
4. The same listener round-trip updates every client: the badge disappears, the task's status column changes, for every board member simultaneously.

The point this second trace makes concrete: **the UI hiding the Approve button and the database rejecting the write are two independent layers.** Deleting the disabled/hidden state in the browser's dev tools, or calling the underlying thunk from the console, changes nothing about what Firestore will actually accept.

---

## 4. Why This Many Files — The Architectural Reasoning

The folder structure is feature-based (`features/auth/`, `features/boards/`, `features/tasks/`, …), not type-based (a global `components/`, a global `reducers/`, a global `api/`). The alternative — grouping by *kind* of file rather than by *what it's for* — was never adopted here, and the reason shows up directly in how the permission model grew over the course of this project:

- **Each feature owns its state, its Firestore access, and its UI together.** `leaveRequestsSlice.js` and the components that use it live in one folder; nothing about leave requests is scattered into a shared `reducers/` directory a `components/LeaveRequestButton.jsx` a folder away has to be cross-referenced against. When the leave-request workflow was added, it was one new folder, not edits scattered across three unrelated top-level directories.
- **The permission model's complexity is the actual reason this matters.** A type-based layout is fine while permission logic is simple ("logged in or not"). This project's actual access-control surface — three roles, per-field write restrictions, approval workflows, and a `firestore.rules` file that mirrors all of it (§5) — means a huge amount of what a "feature" *is* here is its permission logic, not just its markup. Keeping a feature's thunks (where that logic's client-side half lives) next to its components makes it possible to read one folder and understand both what a feature does and who's allowed to do it, rather than assembling that picture from files in three different top-level folders.
- **It scales by addition, not by touching existing code.** Every feature added after the initial build — `joinRequests`, then `leaveRequests`, then the multi-board rework — was a new folder plus new `match` blocks in `firestore.rules`, not a refactor of existing folders. The `*Slice.js` + components pairing (§2) is the same shape every time, so "add a feature" has a template to follow rather than a bespoke decision each time.

The tradeoff is more folders and more small files than a flatter layout would have — visible directly in the file map in §2 — traded for each one being small enough to hold its own responsibility clearly, rather than a few large files each holding several unrelated concerns.

---

## 5. Firestore Security Rules — The Core Complexity

`firestore.rules` is not a short file, and it is not close to the average portfolio project's rules file (usually a handful of lines checking `request.auth != null` and little else). Its structure is layered:

**Layer 1 — shared primitives**, defined once at the top and reused everywhere below:
- `isSignedIn()` — the baseline auth check.
- `roleOf(board, uid)` — resolves a uid's role on a board with a fallback chain (explicit `roles` map entry → `ownerId` match → plain membership → `null`), mirroring `getMemberRole()` on the client exactly so the two never disagree about what role someone has.
- `isMember(board, uid)` — plain membership check, independent of role.

**Layer 2 — small, named, single-purpose boolean functions**, one per *shape* of write a particular role is allowed to make. Examples actually in the file: `isMemberCommentAppend` (a Member appending exactly one comment), `isOwnCommentEdit` (editing exactly their own comment, proven via a value-based list diff rather than trusting an index), `isSafeBoardMove` (a task creator moving their own task, and only to a board they hold owner/admin on), `isCreatorStatusChange` (a Member changing status only on their own task, and never to `'Done'`), `isSafeAdminRolesChange` (an Admin adding/removing at most one plain Member, never touching the Owner or another Admin), `isPublishApprove`/`isPublishReject` (a *different* board's Owner reviewing a publish request that names their board). Each function checks **exactly one field-level shape** — not "is this a collaborative board" in general, but "does this specific write touch exactly this field, in exactly this way, by exactly the person allowed to."

**Layer 3 — the `allow` rules themselves**, which OR these named functions together per operation (`read`/`create`/`update`/`delete`) per collection. The task collection's `allow update`, for instance, is: Owner/Admin get unconditional access (with one narrow carve-out — an Admin still can't delete the Owner's own comment) OR one of seven Member-specific shapes OR one of two independent publish-approval branches — each branch self-contained enough to reason about individually, combined with `||`.

**Why this is more complex than "is this user a member":** because the product's actual requirements are field-level and role-specific, not document-level. "A Member can comment" and "a Member can delete a task" are different questions with different answers, on the *same* document, and the rules file has to express that distinction precisely — `affectedKeys()` (which fields actually changed value) is the mechanism that makes this possible, since without it there'd be no way to tell "editing a comment" apart from "editing the title" in a generic `allow update` check.

This structure is also precisely what made it *possible* to find and fix two real privilege-escalation gaps during this project (documented in `tests/firestore.rules.test.js`'s regression tests): a bundling bypass in `isSafeBoardMove` where combining a `boardId` change with any unrelated field change skipped its own restriction entirely, and a missing role check in `isSafeAdminRolesChange` that let an Admin remove the Owner or another Admin, not just a plain Member. Both were fixable as small, targeted changes to one named function each — exactly because the logic was already decomposed into single-purpose functions rather than one large inline boolean expression per collection.

---

## 6. Optimization Opportunities

Listed factually — what the improvement would look like, and why it was reasonably deferred rather than done now.

- **`App.css` is one 1,546-line file covering the entire dashboard theme.** Splitting it per-component (or per-feature, colocated with the JSX it styles) would make individual pieces easier to find and reduce the chance of an unrelated change causing a visual regression elsewhere in the same file. Deferred because CSS-Modules or a per-component split is a mechanical, low-risk-but-nonzero-effort refactor with no functional payoff — reasonable to defer on a project that started as a short internship task, and not something to do speculatively without a specific pain point (a merge conflict, a hard-to-find style) actually motivating it yet.
- **The main JS bundle is ~1MB (311KB gzipped) as a single chunk**, and Vite's own build output flags this. Route-based code-splitting (`React.lazy` + `Suspense` per top-level route — the landing page, the private workspace, the board hub, the collaborative workspace all currently ship in one bundle even though a given session only ever needs one at a time) would reduce the initial load for any single route. Deferred because at this traffic scale (a portfolio/demo project, not a production app with real load) the actual user-facing cost of one extra ~300KB gzipped chunk on first load is small, and code-splitting adds real complexity — loading states, chunk-load-failure handling — that isn't worth taking on until there's a concrete reason to (real users on slow connections, or the bundle growing further).
- **Member-profile resolution does one `getDoc` per uid, not a batched read.** `BoardMembers.jsx` (resolving the Team tab's member list), `BoardHub.jsx` (resolving joined-board owner emails), and `BoardWorkspace.jsx` (resolving commenter and assignable-member profiles) all do the same thing: `Promise.all(uids.map((uid) => getDoc(doc(db, 'users', uid))))`. For a board with many members this is N reads where a single `getDocs` with a `where(documentId(), 'in', uids)` query (or a denormalized email/displayName copy stored directly on the board/task, avoiding the extra read entirely) would be fewer. Deferred because Firestore's `in` queries cap at 30 values per query, boards in practice have a handful of members, and the resulting cost (both in latency and in Firestore's per-document read pricing) is negligible at that scale — worth revisiting only if boards start regularly having dozens of members.
- **Firestore read costs generally aren't optimized via denormalization.** Several places re-resolve the same user's email/displayName on every load rather than caching or denormalizing it onto the referencing document at write time (comments do store `email` at write time; the profile lookups above don't). A more read-cost-optimized design would denormalize more aggressively. Deferred for the same reason as above — the actual read volume this project generates doesn't currently justify the added write-time complexity (and the data-consistency question that comes with it: what happens to already-denormalized copies when a user changes their display name).
- **No end-to-end tests, no CI/CD.** The only automated tests are the Firestore Security Rules suite (§5) — there's no Playwright/Cypress coverage of the UI itself, and no GitHub Actions (or equivalent) running lint/build/tests on push. Both are standard for a production codebase. Deferred because they represent genuinely new infrastructure to set up and maintain (not a code change within the existing app), and the project's actual test-writing effort this session was deliberately prioritized at the layer with the highest risk-to-cost ratio — the permission logic that's rejected silently and could regress invisibly — over UI flows that are comparatively easy to manually re-verify by clicking through the app after a change.
