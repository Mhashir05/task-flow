import '../../App.css';
import { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { db } from '../../firebase';
import {
  addTask,
  deleteTask,
  updateStatus,
  editTitle,
  editDescription,
  moveTaskToBoard,
  moveTaskToPrivate,
  addComment,
  editComment,
  deleteComment,
  requestStatusChange,
  approveStatusRequest,
  rejectStatusRequest,
  assignTask,
  requestDelete,
  approveDeleteRequest,
  rejectDeleteRequest,
  requestPublish,
} from '../tasks/tasksSlice';
import { logOut } from '../auth/authSlice';
import { fetchProfile } from '../profile/profileSlice';
import { activeBoardSet, getMemberRole } from './boardsSlice';
import CollaborativePanel from './CollaborativePanel';
import BoardMembers from './BoardMembers';
import BoardScopeToggle from './BoardScopeToggle';

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

export function BoardWorkspaceInner({ boardId }) {
  const tasks = useSelector((state) => state.tasks);
  const user = useSelector((state) => state.auth.user);
  const profileData = useSelector((state) => state.profile.data);
  const boards = useSelector((state) => state.boards.list);
  const boardsLoaded = useSelector((state) => state.boards.loaded);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const emailFallback = user?.email ? user.email.split('@')[0] : 'there';
  const displayName =
    profileData?.displayName && profileData.displayName.trim() !== ''
      ? profileData.displayName
      : emailFallback;

  // The URL param is the sole source of truth for which board this page is
  // — looked up fresh from boards.list every render, NOT read back from
  // state.boards.activeBoardId (that's still dispatched below purely so
  // tasksListenerMiddleware.js's existing activeBoardId-keyed query keeps
  // working unchanged; it is not used here to derive anything).
  const board = boards.find((b) => b.id === boardId) ?? null;
  const myRole = getMemberRole(board, user?.uid);
  const hasAccess = Boolean(board) && myRole != null;
  const boardType = board?.type ?? 'private';

  // Keep the existing tasksListenerMiddleware.js/BoardMembers.jsx wiring
  // (both keyed off state.boards.activeBoardId) working without touching
  // either — the URL is what changed, not how tasks/members are fetched.
  useEffect(() => {
    dispatch(activeBoardSet(boardId));
  }, [dispatch, boardId]);

  // Tracks whether this session ever actually had access, so the two
  // failure modes in Part D render differently: a direct visit to a board
  // you never had access to shows the static in-page message below; losing
  // access to a board you WERE just looking at (deleted by its Owner, or
  // you were removed) navigates you back to the hub with a toast instead,
  // since staying on a now-broken workspace page would be worse.
  const hadAccessRef = useRef(false);
  useEffect(() => {
    if (hasAccess) hadAccessRef.current = true;
  }, [hasAccess]);

  // Captured separately from `boardType` (which falls back to 'private'
  // the instant `board` itself goes null) so the redirect below still
  // lands in the right place — /dashboard for the private workspace,
  // /dashboard/boards for a vanished collaborative one — even though by
  // the time it fires, `board` is already gone and boardType alone can no
  // longer be trusted to reflect what this page WAS.
  const boardTypeRef = useRef(boardType);
  useEffect(() => {
    if (board) boardTypeRef.current = board.type;
  }, [board]);

  useEffect(() => {
    if (!boardsLoaded || hasAccess || !hadAccessRef.current) return;
    navigate(boardTypeRef.current === 'private' ? '/dashboard' : '/dashboard/boards', {
      state: {
        feedback: 'This board was deleted, or you no longer have access to it.',
      },
    });
  }, [boardsLoaded, hasAccess, navigate]);

  const canAssign =
    boardType === 'collaborative' && (myRole === 'owner' || myRole === 'admin');
  const canApproveStatusRequest = myRole === 'owner' || myRole === 'admin';

  // tasksListenerMiddleware.js already scopes `tasks` to exactly this
  // board's boardId (re-subscribing whenever activeBoardId changes), so
  // there's nothing left to filter here — unlike the old shared-page
  // version, this workspace only ever holds one board's tasks at a time.
  const visibleTasks = tasks;

  // Every collaborative board the user holds ANY role on — the picker's
  // option set when publishing a private task to some OTHER board than
  // this workspace's own.
  const collaborativeBoards = boards.filter((b) => b.type === 'collaborative');

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
  const [publishTargetTaskId, setPublishTargetTaskId] = useState(null);
  const [publishBoardChoice, setPublishBoardChoice] = useState({});
  const [pendingSelections, setPendingSelections] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
  const [editingComment, setEditingComment] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [commenterProfiles, setCommenterProfiles] = useState({});
  const [memberProfiles, setMemberProfiles] = useState({});
  const titleRef = useRef(null);
  const cancelConfirmRef = useRef(null);

  const boardRef = useRef(null);
  const hasRevealedRef = useRef(false);
  const viewSwapRef = useRef(null);
  const firstViewRenderRef = useRef(true);
  const detailsRefs = useRef({});
  const animatedDetailsRef = useRef(new Set());
  const pressedBtnRef = useRef(null);

  // Team has no purpose on a Private board (single member, its Owner) —
  // the sub-tabs themselves aren't even rendered for one (see the JSX
  // below), so this just keeps the task board as the only reachable view.
  const effectiveView = boardType === 'private' ? 'board' : view;

  useEffect(() => {
    if (user?.uid && !profileData) dispatch(fetchProfile(user.uid));
  }, [dispatch, user?.uid, profileData]);

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

  useEffect(() => {
    if (boardType !== 'collaborative' || !board) return;
    const uniqueUids = (board.members ?? []).filter(
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
  }, [boardType, board, memberProfiles]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(''), 2500);
    return () => clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (confirmingId !== null) cancelConfirmRef.current?.focus();
  }, [confirmingId]);

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
  }, [effectiveView]);

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

  function handleAddTask() {
    if (newTitle.trim() === '') {
      setTitleError('Please enter a task title.');
      titleRef.current?.focus();
      return;
    }
    const newTask = {
      id: makeId(),
      title: newTitle,
      description: newDescription,
      status: 'To Do',
      dueDate: newDueDate,
      priority: newPriority,
      boardId,
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

  function handleStartPublish(taskId) {
    if (collaborativeBoards.length === 0) {
      setFeedback('Create or join a collaborative board first.');
      return;
    }
    setPublishTargetTaskId(taskId);
  }

  function handleCancelPublish() {
    setPublishTargetTaskId(null);
  }

  function handleConfirmPublish(taskId) {
    const targetBoardId = publishBoardChoice[taskId];
    if (!targetBoardId || !user?.uid) return;
    const targetBoard = boards.find((b) => b.id === targetBoardId);
    const roleOnTarget = getMemberRole(targetBoard, user.uid);

    if (roleOnTarget === 'owner' || roleOnTarget === 'admin') {
      dispatch(moveTaskToBoard({ taskId, boardId: targetBoardId }));
      setFeedback('Task published to the board');
    } else {
      dispatch(
        requestPublish({
          taskId,
          targetBoardId,
          targetBoardName: targetBoard?.name ?? 'the board',
          uid: user.uid,
          email: user.email,
        }),
      )
        .unwrap()
        .then(() => setFeedback('Publish request submitted'))
        .catch((message) =>
          setFeedback(message || 'Could not submit publish request.'),
        );
    }
    setPublishTargetTaskId(null);
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

  function canManageTaskStatus(task) {
    return (
      boardType !== 'collaborative' ||
      myRole === 'owner' ||
      myRole === 'admin' ||
      task?.userId === user?.uid
    );
  }

  function handleDrop(e, statusName) {
    e.preventDefault();
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

  if (!boardsLoaded) {
    return (
      <div className="page">
        <p className="collaborative-panel-feedback">Loading&hellip;</p>
      </div>
    );
  }

  if (!hasAccess) {
    // Only meaningfully reachable via the /dashboard/board/:boardId route —
    // the private workspace (PrivateWorkspace.jsx) only ever renders this
    // shared component once its own board is already confirmed resolved,
    // so this is always "no access to a collaborative board" in practice.
    return (
      <div className="page">
        <div className="collaborative-panel-feedback">
          You don&rsquo;t have access to this board, or it no longer exists.
        </div>
        <Link to="/dashboard/boards" className="card-pill-btn make-collaborative">
          &larr; Collaborative Boards
        </Link>
      </div>
    );
  }

  return (
    <div
      className="page"
      onPointerDown={handleRootPointerDown}
      onPointerUp={handleRootPointerUp}
      onPointerCancel={handleRootPointerUp}
    >
      <header className="topbar">
        <div className="brand">
          <BoardScopeToggle />
          <div className="logo">{board.name}</div>
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

      {boardType === 'collaborative' && <CollaborativePanel board={board} />}

      {boardType === 'collaborative' && (
        <div className="view-toggle" role="group" aria-label="Select view">
          <button
            type="button"
            className={effectiveView === 'board' ? 'active' : ''}
            aria-pressed={effectiveView === 'board'}
            onClick={() => setView('board')}
          >
            Board
          </button>
          <button
            type="button"
            className={effectiveView === 'users' ? 'active' : ''}
            aria-pressed={effectiveView === 'users'}
            onClick={() => setView('users')}
          >
            Team
          </button>
        </div>
      )}

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
                      // Within a single board's workspace every visible task
                      // shares this board's own boardId, so "is this task
                      // private" is a property of the WORKSPACE, not each
                      // task individually — unlike the old shared-page
                      // version, which had to check per-task.
                      const isPrivateTask = boardType === 'private';
                      const isTaskCreator = task.userId === user?.uid;
                      const comments = task.comments ?? [];
                      const statusRequest = task.statusRequest ?? null;
                      const deleteRequest = task.deleteRequest ?? null;
                      const publishRequest = task.publishRequest ?? null;
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
                            {boardType === 'collaborative' && task.assignee && (
                              <span
                                className="assignee-badge"
                                title={`Assigned to ${task.assignee.email}`}
                              >
                                {task.assignee.email}
                              </span>
                            )}
                            {isTaskCreator && !isPrivateTask && (
                              <button
                                type="button"
                                className="card-pill-btn make-collaborative"
                                onClick={() => handleMakePrivate(task.id)}
                              >
                                Make Private
                              </button>
                            )}
                            {isTaskCreator &&
                              isPrivateTask &&
                              (publishRequest ? (
                                <span
                                  className="card-pill-btn card-pill-btn--static"
                                  title={`Requested by you to move to ${publishRequest.targetBoardName}`}
                                >
                                  Pending: &rarr; {publishRequest.targetBoardName}
                                </span>
                              ) : publishTargetTaskId === task.id ? (
                                <span className="publish-picker">
                                  <select
                                    className="publish-picker-select"
                                    aria-label="Choose a board to publish to"
                                    value={publishBoardChoice[task.id] ?? ''}
                                    onChange={(e) =>
                                      setPublishBoardChoice((prev) => ({
                                        ...prev,
                                        [task.id]: e.target.value,
                                      }))
                                    }
                                  >
                                    <option value="" disabled>
                                      Choose a board…
                                    </option>
                                    {collaborativeBoards.map((b) => (
                                      <option key={b.id} value={b.id}>
                                        {b.name}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    className="card-pill-btn"
                                    disabled={!publishBoardChoice[task.id]}
                                    onClick={() => handleConfirmPublish(task.id)}
                                  >
                                    Publish
                                  </button>
                                  <button
                                    type="button"
                                    className="card-pill-btn"
                                    onClick={handleCancelPublish}
                                  >
                                    Cancel
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="card-pill-btn make-collaborative"
                                  onClick={() => handleStartPublish(task.id)}
                                >
                                  Make Collaborative
                                </button>
                              ))}
                            {boardType === 'collaborative' && myRole !== 'owner' ? (
                              deleteRequest ? (
                                <span
                                  className="card-pill-btn card-pill-btn--static"
                                  aria-disabled="true"
                                >
                                  Pending deletion approval
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="card-pill-btn"
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
                                {boardType === 'collaborative' &&
                                  myRole === 'owner' &&
                                  deleteRequest && (
                                    <span className="delete-request-actions">
                                      <span className="status-pending">
                                        Delete requested
                                      </span>
                                      <button
                                        type="button"
                                        className="card-pill-btn"
                                        onClick={() =>
                                          handleApproveDeleteRequest(task.id)
                                        }
                                      >
                                        Approve Delete
                                      </button>
                                      <button
                                        type="button"
                                        className="card-pill-btn danger"
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
                            <div
                              className="card-details"
                              ref={attachDetailsRef(task.id)}
                            >
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

                              {boardType === 'collaborative' && (
                                <select
                                  aria-label={`Assignee for ${task.title}`}
                                  value={task.assignee?.uid ?? ''}
                                  disabled={!canAssign}
                                  onChange={(e) =>
                                    handleAssignTask(task.id, e.target.value || null)
                                  }
                                >
                                  <option value="">Unassigned</option>
                                  {(board?.members ?? []).map((uid) => (
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
                                      getMemberRole(board, comment.uid) ?? 'member';

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

// react-router does NOT remount a component just because a route PARAM
// changed while the same route element stays matched — navigating from
// /dashboard/board/A to /dashboard/board/B via a <Link>/navigate() would
// otherwise leave BoardWorkspaceInner mounted with all its local state
// (expandedId, drafts, GSAP stagger/animation guards, ...) from board A
// still sitting there. Keying on boardId forces a full unmount/remount on
// every board switch, which is what actually makes "switching boards shows
// only that board's data" true for in-app navigation, not just for a hard
// refresh (which naturally remounts everything anyway).
function BoardWorkspace() {
  const { boardId } = useParams();
  return <BoardWorkspaceInner key={boardId} boardId={boardId} />;
}

export default BoardWorkspace;
