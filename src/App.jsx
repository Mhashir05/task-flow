import './App.css';
import { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { db } from './firebase';
import { addTask, deleteTask, updateStatus, editTitle, editDescription, moveTaskToCollaborative, moveTaskToPrivate, addComment, editComment, deleteComment, requestStatusChange, approveStatusRequest, rejectStatusRequest, assignTask, requestDelete, approveDeleteRequest, rejectDeleteRequest } from './features/tasks/tasksSlice';
import { logOut } from './features/auth/authSlice';
import { fetchProfile } from './features/profile/profileSlice';
import {
  activeBoardSet,
  getMemberRole,
  getOrCreateCollaborativeBoard,
  getUserPrivateBoard,
} from './features/boards/boardsSlice';
import CollaborativePanel from './features/boards/CollaborativePanel';
import BoardMembers from './features/boards/BoardMembers';
import JoinedBoardsSelect from './features/boards/JoinedBoardsSelect';

gsap.registerPlugin(ScrollTrigger);

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member' };

const PRIORITIES = [
  { name: 'urgent', color: '#9C4A44' },
  { name: 'High', color: '#A9793E' },
  { name: 'Medium', color: '#33406B' },
  { name: 'Low', color: '#3F6B4F' },
];

function makeId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function App() {
  const tasks = useSelector((state) => state.tasks);
  const user = useSelector((state) => state.auth.user);
  const profileData = useSelector((state) => state.profile.data);
  const boards = useSelector((state) => state.boards.list);
  const activeBoardId = useSelector((state) => state.boards.activeBoardId);
  const dispatch = useDispatch();
  const emailFallback = user?.email ? user.email.split('@')[0] : 'there';
  const displayName =
    profileData?.displayName && profileData.displayName.trim() !== ''
      ? profileData.displayName
      : emailFallback;

  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? null;
  // Which top-level context is selected — derived from the board itself
  // (via type) rather than tracked as separate state, so it can never get
  // out of sync with activeBoardId.
  const boardContext = activeBoard?.type ?? 'private';
  const myRole = getMemberRole(activeBoard, user?.uid);
  // Same Owner/Admin gate canManageStatus used to be, but assignment only
  // makes sense on a collaborative board at all (a private board has one
  // member — its owner — so there's nobody else to assign to).
  const canAssign =
    boardContext === 'collaborative' && (myRole === 'owner' || myRole === 'admin');
  // Reviewing a PENDING status request (Approve/Reject) is always an
  // Owner/Admin action, board-wide — unlike canManageStatus below, this one
  // does NOT extend to a task's creator, since a request only exists on a
  // task the requester couldn't directly manage in the first place.
  const canApproveStatusRequest = myRole === 'owner' || myRole === 'admin';

  // Scope tasks to whichever board the Private/Collaborative tab currently
  // points at. A task with no boardId is legacy/implicit-private, so it
  // still shows up under the private board. Declared up here (rather than
  // just before its render usage) because the stagger-reveal effect below
  // also depends on it.
  const visibleTasks = tasks.filter((t) =>
    boardContext === 'private'
      ? !t.boardId || t.boardId === activeBoardId
      : t.boardId === activeBoardId,
  );

  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newPriority, setNewPriority] = useState('');
  const [view, setView] = useState('board');
  const [expandedId, setExpandedId] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [titleError, setTitleError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [confirmingId, setConfirmingId] = useState(null);
  // Per-task, keyed by task id — a member's in-progress status pick before
  // they click "Request", and their draft comment text.
  const [pendingSelections, setPendingSelections] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
  // Which single comment (across all tasks) is currently open for inline
  // editing, identified by the same createdAt+uid pair used everywhere
  // else instead of array index, plus its in-progress edited text.
  const [editingComment, setEditingComment] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  // uid -> { email, displayName } for commenters on the currently expanded
  // task, resolved live from users/{uid} (not stored on the comment itself,
  // so a later name change shows correctly on old comments). Cached across
  // renders so each uid is only fetched once, not once per comment.
  const [commenterProfiles, setCommenterProfiles] = useState({});
  // uid -> { email } for the active collaborative board's members, resolved
  // live from users/{uid} — populates the assignee dropdown's options.
  const [memberProfiles, setMemberProfiles] = useState({});
  const titleRef = useRef(null);
  const cancelConfirmRef = useRef(null);

  // ── Liquid-glass animation refs (GSAP/Lenis — no Redux/data logic below) ──
  const boardRef = useRef(null); // scoped container for the one-time stagger reveal
  const hasRevealedRef = useRef(false);
  const viewSwapRef = useRef(null); // cross-fade target for Board/Team + Private/Collaborative swaps
  const firstViewRenderRef = useRef(true);
  const detailsRefs = useRef({}); // taskId -> .card-details element, for expand/collapse tweens
  const animatedDetailsRef = useRef(new Set()); // taskIds whose entrance tween has already played
  const pressedBtnRef = useRef(null); // button currently mid press-scale, for pointerup-anywhere reset

  // Team has no purpose on a private board (single member, the owner) — a
  // stale 'users' selection just renders as Board instead, no effect needed
  // to "correct" it since nothing is ever actually stored as wrong.
  const effectiveView = boardContext === 'private' ? 'board' : view;

  useEffect(() => {
    if (user?.uid && !profileData) dispatch(fetchProfile(user.uid));
  }, [dispatch, user?.uid, profileData]);

  // Batch-resolve commenter profiles for whichever task is expanded — one
  // getDoc per unique uid not already cached, not one per comment.
  useEffect(() => {
    if (!expandedId) return;
    const expandedTask = tasks.find((t) => t.id === expandedId);
    const uniqueUids = [
      ...new Set((expandedTask?.comments ?? []).map((c) => c.uid)),
    ].filter((uid) => !commenterProfiles[uid]);
    if (uniqueUids.length === 0) return;

    let cancelled = false;
    Promise.all(
      uniqueUids.map((uid) =>
        getDoc(doc(db, 'users', uid)).then((snap) => [
          uid,
          {
            email: snap.exists() ? snap.data().email : uid,
            displayName: snap.exists() ? snap.data().displayName : '',
          },
        ]),
      ),
    ).then((pairs) => {
      if (cancelled) return;
      setCommenterProfiles((prev) => ({
        ...prev,
        ...Object.fromEntries(pairs),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [expandedId, tasks, commenterProfiles]);

  // Batch-resolve member emails for the active collaborative board — one
  // getDoc per unique uid not already cached, same pattern as the commenter
  // profile resolution above. Not needed on a private board (single member,
  // already known from `user`).
  useEffect(() => {
    if (boardContext !== 'collaborative' || !activeBoard) return;
    const uniqueUids = (activeBoard.members ?? []).filter(
      (uid) => !memberProfiles[uid],
    );
    if (uniqueUids.length === 0) return;

    let cancelled = false;
    Promise.all(
      uniqueUids.map((uid) =>
        getDoc(doc(db, 'users', uid)).then((snap) => [
          uid,
          { email: snap.exists() ? snap.data().email : uid },
        ]),
      ),
    ).then((pairs) => {
      if (cancelled) return;
      setMemberProfiles((prev) => ({
        ...prev,
        ...Object.fromEntries(pairs),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [boardContext, activeBoard, memberProfiles]);

  // Default to the user's private board the first time nothing is selected
  // yet. Looked up live via the thunk rather than waiting on boards.list, so
  // it doesn't depend on fetchUserBoards having already resolved.
  useEffect(() => {
    if (!user?.uid || activeBoardId) return;
    dispatch(getUserPrivateBoard(user.uid))
      .unwrap()
      .then((boardId) => dispatch(activeBoardSet(boardId)))
      .catch(() => {});
  }, [dispatch, user?.uid, activeBoardId]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(''), 2500);
    return () => clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (confirmingId !== null) cancelConfirmRef.current?.focus();
  }, [confirmingId]);

  // Smooth scroll for the whole dashboard (there's no fixed/sticky toolbar
  // here that would need to stay outside it) via Lenis, synced with GSAP's
  // ScrollTrigger per Lenis's documented GSAP integration: feed ScrollTrigger
  // updates off Lenis's own scroll event, drive Lenis from GSAP's ticker, and
  // hand lag-smoothing over to Lenis so the two don't fight each other.
  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const lenis = new Lenis();
    lenis.on('scroll', ScrollTrigger.update);
    function raf(time) {
      lenis.raf(time * 1000);
    }
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, []);

  // The one signature on-load moment: columns and their cards stagger in
  // once. Guarded by hasRevealedRef so it never replays on later re-renders
  // (task edits, comment drafts, board switches, ...) — only the very first
  // time the board has content to animate.
  useEffect(() => {
    if (hasRevealedRef.current) return;
    if (!boardRef.current) return;
    const columns = boardRef.current.querySelectorAll('.column');
    if (columns.length === 0) return;
    hasRevealedRef.current = true;
    if (prefersReducedMotion()) return;
    const cards = boardRef.current.querySelectorAll('.quest-card');
    const ctx = gsap.context(() => {
      gsap.from(columns, {
        y: 24,
        opacity: 0,
        duration: 0.5,
        ease: 'power2.out',
        stagger: 0.08,
      });
      gsap.from(cards, {
        y: 16,
        opacity: 0,
        duration: 0.4,
        ease: 'power2.out',
        stagger: 0.04,
        delay: 0.15,
      });
    }, boardRef);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTasks.length, effectiveView]);

  // Cross-fade whenever the Board/Team or Private/Collaborative selection
  // changes, instead of the instant swap. Skips the very first render so it
  // doesn't fight the stagger-reveal moment above on initial mount.
  useEffect(() => {
    if (firstViewRenderRef.current) {
      firstViewRenderRef.current = false;
      return;
    }
    if (prefersReducedMotion() || !viewSwapRef.current) return;
    gsap.fromTo(
      viewSwapRef.current,
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.32, ease: 'power2.out' },
    );
  }, [boardContext, effectiveView]);

  // Returns the SAME function instance for a given taskId across re-renders
  // (cached in a ref, not recreated inline in JSX). A ref callback's
  // identity matters to React: a fresh function object on every render
  // makes React detach-then-reattach the ref every time, even when the
  // underlying DOM node hasn't actually mounted/unmounted — which was
  // replaying this entrance animation on every keystroke in the title/
  // description inputs (each edit re-renders the expanded card). Caching
  // by taskId means React only calls this on a genuine expand/collapse.
  const detailsRefCallbacks = useRef({});
  function attachDetailsRef(taskId) {
    if (!detailsRefCallbacks.current[taskId]) {
      detailsRefCallbacks.current[taskId] = (el) => {
        detailsRefs.current[taskId] = el;
        if (!el) {
          animatedDetailsRef.current.delete(taskId);
          return;
        }
        if (animatedDetailsRef.current.has(taskId) || prefersReducedMotion()) {
          return;
        }
        animatedDetailsRef.current.add(taskId);
        gsap.fromTo(
          el,
          { height: 0, opacity: 0 },
          { height: 'auto', opacity: 1, duration: 0.3, ease: 'power2.out' },
        );
      };
    }
    return detailsRefCallbacks.current[taskId];
  }

  function handleCardHoverIn(el) {
    if (prefersReducedMotion()) return;
    gsap.to(el, {
      y: -4,
      boxShadow: '0 12px 28px rgba(45, 91, 255, 0.18)',
      duration: 0.2,
      ease: 'power2.out',
    });
  }

  function handleCardHoverOut(el) {
    if (prefersReducedMotion()) return;
    gsap.to(el, {
      y: 0,
      boxShadow: '0 2px 10px rgba(28, 29, 31, 0.05)',
      duration: 0.2,
      ease: 'power2.out',
    });
  }

  function handleRootPointerDown(e) {
    if (prefersReducedMotion()) return;
    const btn = e.target.closest('button');
    if (!btn) return;
    pressedBtnRef.current = btn;
    gsap.to(btn, { scale: 0.96, duration: 0.08, ease: 'power1.out' });
  }

  function handleRootPointerUp() {
    if (!pressedBtnRef.current) return;
    gsap.to(pressedBtnRef.current, {
      scale: 1,
      duration: 0.18,
      ease: 'back.out(2)',
    });
    pressedBtnRef.current = null;
  }

  function handleSelectBoardContext(context) {
    if (!user?.uid || context === boardContext) return;
    const thunk =
      context === 'collaborative' ? getOrCreateCollaborativeBoard : getUserPrivateBoard;
    dispatch(thunk(user.uid))
      .unwrap()
      .then((boardId) => dispatch(activeBoardSet(boardId)))
      .catch(() => setFeedback('Could not switch boards. Try again.'));
  }

  function handleAddTask() {
    if (newTitle.trim() === '') {
      setTitleError('Please enter a task title.');
      titleRef.current?.focus();
      return;
    }
    if (!activeBoardId) return;
    const newTask = {
      id: makeId(),
      title: newTitle,
      description: newDescription,
      status: 'To Do',
      dueDate: newDueDate,
      priority: newPriority,
      boardId: activeBoardId,
    };
    dispatch(addTask(newTask));
    setNewTitle('');
    setNewDescription('');
    setNewDueDate('');
    setNewPriority('');
    setTitleError('');
    setFeedback('Task created');
  }

  function handleDeleteTask(id) {
    dispatch(deleteTask(id));
    setFeedback('Task deleted');
  }

  function handleStatusChange(id, newStatus) {
    dispatch(updateStatus({ id, newStatus }));
    setFeedback('Task updated');
  }

  function handleEditTitle(id, newTitle) {
    dispatch(editTitle({ id, newTitle }));
  }

  function handleEditDescription(id, newDescription) {
    dispatch(editDescription({ id, newDescription }));
  }

  function handleMakeCollaborative(id) {
    if (!user?.uid) return;
    dispatch(moveTaskToCollaborative({ taskId: id, uid: user.uid }));
    setFeedback('Task moved to your collaborative board');
  }

  function handleMakePrivate(id) {
    if (!user?.uid) return;
    dispatch(moveTaskToPrivate({ taskId: id, uid: user.uid }));
    setFeedback('Task moved to your private board');
  }

  function handleAddComment(taskId) {
    const text = (commentDrafts[taskId] ?? '').trim();
    if (!text || !user?.uid) return;
    dispatch(addComment({ taskId, uid: user.uid, email: user.email, text }));
    setCommentDrafts((prev) => ({ ...prev, [taskId]: '' }));
  }

  function handleStartEditComment(taskId, comment) {
    setEditingComment({ taskId, uid: comment.uid, createdAt: comment.createdAt });
    setEditDraft(comment.text);
  }

  function handleCancelEditComment() {
    setEditingComment(null);
    setEditDraft('');
  }

  function handleSaveComment(taskId, comment) {
    const newText = editDraft.trim();
    if (!newText) return;
    dispatch(
      editComment({
        taskId,
        createdAt: comment.createdAt,
        uid: comment.uid,
        newText,
      }),
    );
    setEditingComment(null);
    setEditDraft('');
  }

  function handleDeleteComment(taskId, comment) {
    dispatch(
      deleteComment({ taskId, createdAt: comment.createdAt, uid: comment.uid }),
    );
  }

  function handleAssignTask(taskId, assigneeUid) {
    if (!assigneeUid) {
      dispatch(assignTask({ taskId, assigneeUid: null, assigneeEmail: null }));
      return;
    }
    const assigneeEmail = memberProfiles[assigneeUid]?.email ?? assigneeUid;
    dispatch(assignTask({ taskId, assigneeUid, assigneeEmail }));
  }

  function handleRequestStatusChange(taskId, requestedStatus) {
    if (!user?.uid) return;
    dispatch(
      requestStatusChange({
        taskId,
        uid: user.uid,
        email: user.email,
        requestedStatus,
      }),
    )
      .unwrap()
      .then(() => setFeedback('Status change requested'))
      .catch((message) => setFeedback(message || 'Could not submit request.'));
  }

  function handleApproveStatusRequest(task) {
    dispatch(
      approveStatusRequest({
        taskId: task.id,
        newStatus: task.statusRequest.requestedStatus,
      }),
    );
    setFeedback('Status change approved');
  }

  function handleRejectStatusRequest(taskId) {
    dispatch(rejectStatusRequest({ taskId }));
    setFeedback('Status change request rejected');
  }

  function handleRequestDelete(taskId) {
    if (!user?.uid) return;
    dispatch(requestDelete({ taskId, uid: user.uid, email: user.email }))
      .unwrap()
      .then(() => setFeedback('Delete requested'))
      .catch((message) => setFeedback(message || 'Could not submit delete request.'));
  }

  function handleApproveDeleteRequest(taskId) {
    dispatch(approveDeleteRequest({ taskId }));
    setFeedback('Task deleted');
  }

  function handleRejectDeleteRequest(taskId) {
    dispatch(rejectDeleteRequest({ taskId }));
    setFeedback('Delete request rejected');
  }

  function toggleExpand(id) {
    if (expandedId === id) {
      const el = detailsRefs.current[id];
      if (el && !prefersReducedMotion()) {
        gsap.to(el, {
          height: 0,
          opacity: 0,
          duration: 0.22,
          ease: 'power2.in',
          onComplete: () => setExpandedId(null),
        });
      } else {
        setExpandedId(null);
      }
      return;
    }
    setExpandedId(id);
  }

  // Owner/Admin: full direct status control on ANY task. A Member: direct
  // control ONLY on a task they personally created — every other task on a
  // collaborative board still goes through the request/approve flow. Per
  // task rather than board-wide (unlike the old canManageStatus) since it
  // now depends on task.userId; used both for drag-and-drop (below) and the
  // per-task render below.
  function canManageTaskStatus(task) {
    return (
      boardContext !== 'collaborative' ||
      myRole === 'owner' ||
      myRole === 'admin' ||
      task?.userId === user?.uid
    );
  }

  function handleDrop(e, statusName) {
    e.preventDefault();
    // Cards are already non-draggable when the dragged task's own
    // canManageTaskStatus is false (see the quest-card's draggable
    // attribute below), so this normally never fires for a restricted
    // member — this is a defense-in-depth guard in case a drop event ever
    // lands anyway (stale drag state, browser quirk), not the primary
    // mechanism. Looked up fresh from `tasks` (not trusted from some other
    // per-task closure) since a drop only knows the id, not the task.
    const draggedTask = tasks.find((t) => t.id === draggedId);
    if (canManageTaskStatus(draggedTask) && draggedId !== null) {
      handleStatusChange(draggedId, statusName);
    }
    setDraggedId(null);
    setDragOverColumn(null);
  }

  const statuses = [
    { name: 'To Do', dot: 'var(--status-todo)' },
    { name: 'In Progress', dot: 'var(--status-progress)' },
    { name: 'Review', dot: 'var(--status-review)' },
    { name: 'Done', dot: 'var(--status-done)' },
  ];

  const doneCount = visibleTasks.filter((t) => t.status === 'Done').length;
  const totalCount = visibleTasks.length;
  const progressPercent =
    totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

  return (
    <div
      className="page"
      onPointerDown={handleRootPointerDown}
      onPointerUp={handleRootPointerUp}
      onPointerCancel={handleRootPointerUp}
    >
      <header className="topbar">
        <div className="brand">
          <div className="logo">
            TASK FLOW
          </div>
          <p className="tagline">Keep it moving. Enhance productivity.</p>
        </div>
        <p className="welcome-greet">
          Welcome back, <strong>{displayName}</strong>
          {' · '}
          <Link to="/dashboard/profile">Profile</Link>
        </p>
        <button
          type="button"
          className="sign-out"
          onClick={() => dispatch(logOut())}
        >
          Sign out
        </button>
      </header>

      <div className="view-toggle" role="group" aria-label="Select board">
        <button
          type="button"
          className={boardContext === 'private' ? 'active' : ''}
          aria-pressed={boardContext === 'private'}
          onClick={() => handleSelectBoardContext('private')}
        >
          Private
        </button>
        <button
          type="button"
          className={boardContext === 'collaborative' ? 'active' : ''}
          aria-pressed={boardContext === 'collaborative'}
          onClick={() => handleSelectBoardContext('collaborative')}
        >
          Collaborative
        </button>
        <JoinedBoardsSelect />
      </div>

      <div className="view-toggle" role="group" aria-label="Select view">
        <button
          type="button"
          className={effectiveView === 'board' ? 'active' : ''}
          aria-pressed={effectiveView === 'board'}
          onClick={() => setView('board')}
        >
          Board
        </button>
        {boardContext === 'collaborative' && (
          <button
            type="button"
            className={effectiveView === 'users' ? 'active' : ''}
            aria-pressed={effectiveView === 'users'}
            onClick={() => setView('users')}
          >
            Team
          </button>
        )}
      </div>

      {boardContext === 'collaborative' && <CollaborativePanel />}

      <div className="view-transition-target" ref={viewSwapRef}>
      {effectiveView === 'users' ? (
        <BoardMembers />
      ) : (
        <>
      <div className="progress-panel">
        <div className="progress-label">
          <span>Progress</span>
          <span className="progress-count">
            {doneCount} of {totalCount} tasks done
          </span>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Tasks completed"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="progress-fill"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
      </div>

      <div className="quest-form">
        <div className="field field--title">
          <label htmlFor="new-task-title">Title</label>
          <input
            id="new-task-title"
            ref={titleRef}
            value={newTitle}
            onChange={(e) => {
              setNewTitle(e.target.value);
              if (titleError) setTitleError('');
            }}
            placeholder="What needs doing?"
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? 'new-task-title-error' : undefined}
          />
          {titleError && (
            <p className="field-error" id="new-task-title-error">
              {titleError}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="new-task-description">Description</label>
          <input
            id="new-task-description"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div className="field">
          <label htmlFor="new-task-due">Due date</label>
          <input
            id="new-task-due"
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="new-task-priority">Priority</label>
          <select
            id="new-task-priority"
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value)}
          >
            <option value="" disabled>
              Select priority
            </option>
            {PRIORITIES.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button onClick={handleAddTask}>Add task</button>
      </div>

      <div className="feedback-region" role="status" aria-live="polite">
        {feedback}
      </div>

      <div className="board" ref={boardRef}>
        {statuses.map((status) => (
          <div
            className={`column${
              dragOverColumn === status.name ? ' column--drag-over' : ''
            }`}
            key={status.name}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverColumn(status.name);
            }}
            onDragLeave={() => setDragOverColumn(null)}
            onDrop={(e) => handleDrop(e, status.name)}
          >
            <div className="column-header">
              <span
                className="seal"
                style={{ borderColor: status.dot, color: status.dot }}
                aria-hidden="true"
              ></span>
              <h2>{status.name}</h2>
              <span className="count">
                {visibleTasks.filter((t) => t.status === status.name).length}
              </span>
            </div>

            {visibleTasks.filter((t) => t.status === status.name).length ===
              0 && (
              <div className="empty-state">
                <p>No tasks in {status.name}</p>
              </div>
            )}

            {visibleTasks
              .filter((task) => task.status === status.name)
              .map((task) => {
                const isPrivateTask =
                  !task.boardId || task.boardId === profileData?.defaultBoardId;
                // Moving a task between private/collaborative changes its
                // boardId — which, for a collaborative board, controls who
                // can even see the task at all. Restricted to whoever
                // created it (task.userId, set at creation time in
                // addTask), regardless of role — an Owner/Admin managing a
                // board doesn't get to relocate a task someone else made.
                // Enforced server-side too, see firestore.rules.
                const isTaskCreator = task.userId === user?.uid;
                const comments = task.comments ?? [];
                const statusRequest = task.statusRequest ?? null;
                const deleteRequest = task.deleteRequest ?? null;
                const canManageStatus = canManageTaskStatus(task);

                return (
                <div
                  className={`quest-card${
                    draggedId === task.id ? ' quest-card--dragging' : ''
                  }`}
                  key={task.id}
                  draggable={canManageStatus}
                  onDragStart={() => setDraggedId(task.id)}
                  onDragEnd={() => {
                    setDraggedId(null);
                    setDragOverColumn(null);
                  }}
                  onMouseEnter={(e) => handleCardHoverIn(e.currentTarget)}
                  onMouseLeave={(e) => handleCardHoverOut(e.currentTarget)}
                >
                  <button
                    type="button"
                    className="card-body"
                    aria-expanded={expandedId === task.id}
                    onClick={() => toggleExpand(task.id)}
                  >
                    <span className="card-title">{task.title}</span>
                    {task.description && (
                      <span className="card-desc">{task.description}</span>
                    )}
                  </button>

                  <div className="card-footer">
                    <select
                      className="card-status"
                      aria-label={`Status for ${task.title}`}
                      value={task.status}
                      disabled={!canManageStatus}
                      onChange={(e) =>
                        handleStatusChange(task.id, e.target.value)
                      }
                    >
                      {statuses.map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    {canApproveStatusRequest && statusRequest && (
                      <span className="status-request-actions">
                        <span className="status-pending">
                          Requested: &rarr; {statusRequest.requestedStatus}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleApproveStatusRequest(task)}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => handleRejectStatusRequest(task.id)}
                        >
                          Reject
                        </button>
                      </span>
                    )}
                    {!canManageStatus &&
                      (statusRequest ? (
                        <span className="status-pending" aria-disabled="true">
                          Pending: &rarr; {statusRequest.requestedStatus}
                        </span>
                      ) : (
                        <span className="status-request-form">
                          <select
                            aria-label={`Request new status for ${task.title}`}
                            value={pendingSelections[task.id] ?? task.status}
                            onChange={(e) =>
                              setPendingSelections((prev) => ({
                                ...prev,
                                [task.id]: e.target.value,
                              }))
                            }
                          >
                            {statuses.map((s) => (
                              <option key={s.name} value={s.name}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={
                              (pendingSelections[task.id] ?? task.status) ===
                              task.status
                            }
                            onClick={() =>
                              handleRequestStatusChange(
                                task.id,
                                pendingSelections[task.id] ?? task.status,
                              )
                            }
                          >
                            Request
                          </button>
                        </span>
                      ))}
                    {task.dueDate && (
                      <span className="due-date">{task.dueDate}</span>
                    )}
                    <span className="priority-badge">
                      {task.priority || 'Medium'}
                    </span>
                    {boardContext === 'collaborative' && task.assignee && (
                      <span
                        className="assignee-badge"
                        title={`Assigned to ${task.assignee.email}`}
                      >
                        {task.assignee.email}
                      </span>
                    )}
                    {isTaskCreator && (
                      <button
                        type="button"
                        className="make-collaborative"
                        onClick={() =>
                          isPrivateTask
                            ? handleMakeCollaborative(task.id)
                            : handleMakePrivate(task.id)
                        }
                      >
                        {isPrivateTask ? 'Make Collaborative' : 'Make Private'}
                      </button>
                    )}
                    {/* Delete is Owner-only-direct on a collaborative board — Admin
                        and Member (even the task's own creator) submit a delete
                        request instead, reviewed by the Owner. Private boards are
                        untouched: boardContext !== 'collaborative' always takes
                        the normal confirm/delete-x branch below, same as before
                        this feature. */}
                    {boardContext === 'collaborative' && myRole !== 'owner' ? (
                      deleteRequest ? (
                        <span className="status-pending" aria-disabled="true">
                          Pending deletion approval
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="delete-x"
                          aria-label={`Request delete for task: ${task.title}`}
                          onClick={() => handleRequestDelete(task.id)}
                        >
                          Request Delete
                        </button>
                      )
                    ) : (
                      <>
                        {confirmingId === task.id ? (
                          <div
                            className="card-confirm"
                            role="group"
                            aria-label="Confirm deletion"
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') setConfirmingId(null);
                            }}
                          >
                            <span>Delete?</span>
                            <button
                              type="button"
                              ref={cancelConfirmRef}
                              onClick={() => setConfirmingId(null)}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => {
                                handleDeleteTask(task.id);
                                setConfirmingId(null);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="delete-x"
                            aria-label={`Delete task: ${task.title}`}
                            onClick={() => setConfirmingId(task.id)}
                          >
                            ×
                          </button>
                        )}
                        {boardContext === 'collaborative' &&
                          myRole === 'owner' &&
                          deleteRequest && (
                            <span className="status-request-actions">
                              <span className="status-pending">
                                Delete requested
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleApproveDeleteRequest(task.id)
                                }
                              >
                                Approve Delete
                              </button>
                              <button
                                type="button"
                                className="danger"
                                onClick={() =>
                                  handleRejectDeleteRequest(task.id)
                                }
                              >
                                Reject Delete
                              </button>
                            </span>
                          )}
                      </>
                    )}
                  </div>

                  {expandedId === task.id && (
                    <div className="card-details" ref={attachDetailsRef(task.id)}>
                      <input
                        aria-label="Edit task title"
                        value={task.title}
                        onChange={(e) =>
                          handleEditTitle(task.id, e.target.value)
                        }
                      />
                      <textarea
                        aria-label="Edit task description"
                        value={task.description || ''}
                        onChange={(e) =>
                          handleEditDescription(task.id, e.target.value)
                        }
                        placeholder="Description"
                        rows={2}
                      />
                      <select
                        aria-label="Change task status"
                        value={task.status}
                        disabled={!canManageStatus}
                        onChange={(e) =>
                          handleStatusChange(task.id, e.target.value)
                        }
                      >
                        {statuses.map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>

                      {boardContext === 'collaborative' && (
                        <select
                          aria-label={`Assignee for ${task.title}`}
                          value={task.assignee?.uid ?? ''}
                          disabled={!canAssign}
                          onChange={(e) =>
                            handleAssignTask(task.id, e.target.value || null)
                          }
                        >
                          <option value="">Unassigned</option>
                          {(activeBoard?.members ?? []).map((uid) => (
                            <option key={uid} value={uid}>
                              {memberProfiles[uid]?.email ?? uid}
                            </option>
                          ))}
                        </select>
                      )}

                      <div className="task-comments">
                        <h4>Comments</h4>
                        {comments.length === 0 && (
                          <p className="task-comments-empty">No comments yet.</p>
                        )}
                        <ul>
                          {comments.map((comment, i) => {
                            const isAuthor = comment.uid === user?.uid;
                            const canEditComment = isAuthor;
                            const canDeleteComment =
                              isAuthor ||
                              myRole === 'owner' ||
                              myRole === 'admin';
                            const isEditingThis =
                              editingComment?.taskId === task.id &&
                              editingComment?.uid === comment.uid &&
                              editingComment?.createdAt === comment.createdAt;

                            // Resolved live, same pattern as the header's
                            // own displayName/emailFallback — never stored
                            // on the comment itself, so a later name/role
                            // change shows correctly on old comments too.
                            const commenterProfile =
                              commenterProfiles[comment.uid];
                            const commenterEmail =
                              commenterProfile?.email ?? comment.email;
                            const commenterEmailFallback = commenterEmail
                              ? commenterEmail.split('@')[0]
                              : comment.uid;
                            const commenterDisplayName =
                              commenterProfile?.displayName &&
                              commenterProfile.displayName.trim() !== ''
                                ? commenterProfile.displayName
                                : commenterEmailFallback;
                            const commenterRole =
                              getMemberRole(activeBoard, comment.uid) ??
                              'member';

                            return (
                              <li key={`${comment.createdAt}-${i}`}>
                                {isEditingThis ? (
                                  <span className="comment-edit-form">
                                    <input
                                      aria-label="Edit comment"
                                      value={editDraft}
                                      onChange={(e) =>
                                        setEditDraft(e.target.value)
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          handleSaveComment(task.id, comment);
                                        }
                                        if (e.key === 'Escape') {
                                          handleCancelEditComment();
                                        }
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleSaveComment(task.id, comment)
                                      }
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleCancelEditComment}
                                    >
                                      Cancel
                                    </button>
                                  </span>
                                ) : (
                                  <>
                                    <strong title={commenterEmail}>
                                      {commenterDisplayName} (
                                      {ROLE_LABEL[commenterRole] ??
                                        commenterRole}
                                      )
                                    </strong>{' '}
                                    &mdash; {comment.text}
                                    {(canEditComment || canDeleteComment) && (
                                      <span className="comment-actions">
                                        {canEditComment && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleStartEditComment(
                                                task.id,
                                                comment,
                                              )
                                            }
                                          >
                                            Edit
                                          </button>
                                        )}
                                        {canDeleteComment && (
                                          <button
                                            type="button"
                                            className="danger"
                                            onClick={() =>
                                              handleDeleteComment(
                                                task.id,
                                                comment,
                                              )
                                            }
                                          >
                                            Delete
                                          </button>
                                        )}
                                      </span>
                                    )}
                                  </>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                        <div className="task-comment-form">
                          <input
                            aria-label="Add a comment"
                            value={commentDrafts[task.id] ?? ''}
                            onChange={(e) =>
                              setCommentDrafts((prev) => ({
                                ...prev,
                                [task.id]: e.target.value,
                              }))
                            }
                            placeholder="Add a comment"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddComment(task.id);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleAddComment(task.id)}
                          >
                            Comment
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
          </div>
        ))}
      </div>
        </>
      )}
      </div>
    </div>
  );
}

export default App;
