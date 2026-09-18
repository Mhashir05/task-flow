# Task Flow

A Trello-inspired, role-based collaborative task management app — built with React, Redux Toolkit, and Firebase.

**[Live Demo](https://your-vercel-url.vercel.app)** _(replace with your actual Vercel deployment URL)_

Task Flow started as a small internship task and was scaled from there into a full multi-tenant collaboration tool: private boards, multiple owned/joined collaborative boards per user, a three-tier role hierarchy with independently-enforced permissions, and an approval-based workflow for the actions that shouldn't be one-click.

---

## Key Features

- **Multi-board system** — every user gets a private board on signup, and can own or join any number of collaborative boards on top of it.
- **Role hierarchy (Owner / Admin / Member)** with granular, per-action permissions — not just "admin vs. everyone else." Role checks are enforced independently at the UI layer and the database layer (see [Security](#security) below).
- **Approval workflows** instead of unrestricted writes: task deletion, status changes, and moving a task between private and collaborative boards can all require the relevant Owner/Admin to approve a request rather than happening directly.
- **A Review gate before Done** — a plain Member can move their own task through To Do → In Progress → Review directly, but only an Owner or Admin can mark it Done.
- **Multi-user task assignment** — tasks can be assigned to several board members at once, with the board's Owner explicitly excluded from ever being assignable.
- **Comment moderation** — anyone can comment, authors can edit/delete their own, and Owners/Admins can moderate everyone else's — except an Admin can't delete the Owner's comments.
- **Real-time everywhere** — boards, tasks, join requests, and leave requests all sync live across every connected client via Firestore `onSnapshot` listeners, no polling or manual refresh.

## Tech Stack

| Layer | Choice |
|---|---|
| UI | React 19 + Vite |
| State | Redux Toolkit (slices + `createListenerMiddleware` for live Firestore sync) |
| Routing | React Router 7 |
| Backend | Firebase Auth + Firestore |
| Animation | GSAP + Lenis (smooth scroll, micro-interactions) |
| Testing | Vitest + Firebase Emulator Suite, for automated Security Rules regression tests |

## Security

Permissions in Task Flow aren't just a hidden button. Every write — who can change a task's status, who can delete a comment, who can be assigned a task, who can transfer board ownership — is independently enforced in `firestore.rules`, so a request that bypasses the UI entirely (a raw API call, a modified client) is rejected at the database layer, not just discouraged by what's rendered on screen.

That rules file is covered by an automated test suite (`npm run test:rules`) that runs against a real Firestore emulator — **40 passing tests** covering the core permission matrix plus targeted regression tests for privilege-escalation issues found and fixed during development. This is meaningfully more rigorous than most portfolio projects, where "security" usually just means a disabled button.

## Getting Started

### Run the app

```bash
git clone https://github.com/Mhashir05/task-flow.git
cd task-flow
npm install
cp .env.example .env   # fill in your Firebase project's config values
npm run dev
```

`.env.example` documents every `VITE_FIREBASE_*` value you need — get them from your Firebase project's **Project Settings → Your apps**.

### Run the Security Rules test suite

```bash
npm run test:rules
```

This spins up the Firestore Emulator and runs the Vitest suite against it. **Requires a Java Runtime (JRE)** on your machine — the Firestore emulator is a JVM process, not a Node one (e.g. [Eclipse Temurin](https://adoptium.net/)).

### Seed dummy data (optional)

```bash
npm run seed:dummy
```

Populates your Firestore project with realistic test data (10 users, a shared collaborative board, ~25 tasks with comments) pulled from [dummyjson.com](https://dummyjson.com), using the Firebase Admin SDK. Requires a Firebase **service account key** — see `.env.example` for where to get one and how to point the script at it. This is a one-time dev/testing utility, not part of the app itself, and creates real accounts/data in whatever Firebase project you point it at.

## Project Structure

```
src/
  app/          # Redux store + one createListenerMiddleware per Firestore
                # collection (boards, tasks, joinRequests, leaveRequests) —
                # each subscribes to onSnapshot and dispatches the live
                # result into its slice, so components just read from Redux
  features/
    auth/       # signup/login/session, private-board provisioning
    boards/     # board CRUD, roles, members, the task workspace UI
    tasks/      # task CRUD, status/delete/publish request workflows
    joinRequests/  # invite-code join request + approval flow
    leaveRequests/ # Member leave-request + Owner/Admin approval flow
    profile/    # display name management
firestore.rules  # the actual security boundary — see Security above
tests/           # Firestore Security Rules test suite (Vitest + emulator)
scripts/         # one-time dev utilities (dummy data seeding)
```

Each Redux slice owns its own async thunks for writes; live reads flow in one direction only, through the listener middlewares in `src/app/`, so UI components never manually re-fetch — they just react to whatever Redux says the current Firestore state is.

## Screenshots

_Add screenshots or a short demo GIF here — e.g. the board hub, the task workspace, the Team tab, and the role-permission UI in action._

