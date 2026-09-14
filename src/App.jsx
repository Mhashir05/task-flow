import './App.css';
import { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { addTask, deleteTask, updateStatus, editTitle, editDescription, moveTaskToCollaborative, moveTaskToPrivate, addComment, editComment, deleteComment, requestStatusChange, approveStatusRequest, rejectStatusRequest } from './features/tasks/tasksSlice';
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
  // Status changes — via the dropdown OR drag-and-drop — are restricted to
  // Owner/Admin only on a collaborative board. Private boards (and their
  // sole member, the owner) are always unrestricted. This is a single
  // board-wide value, not per-task, so it's computed once here rather than
  // per task in the render loop below.
  const canManageStatus =
    boardContext !== 'collaborative' || myRole === 'owner' || myRole === 'admin';

  // TEMPORARY DEBUG LOGGING — remove once the Approve/Reject visibility
  // issue is diagnosed.
  useEffect(() => {
    console.log(
      '[App] uid =',
      user?.uid,
      '| activeBoardId =',
      activeBoardId,
      '| boardContext =',
      boardContext,
      '| myRole =',
      myRole,
      '| canManageStatus =',
      canManageStatus,
    );
  }, [user?.uid, activeBoardId, boardContext, myRole, canManageStatus]);

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
  const titleRef = useRef(null);
  const cancelConfirmRef = useRef(null);

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

  function toggleExpand(id) {
    setExpandedId(expandedId === id ? null : id);
  }

  function handleDrop(e, statusName) {
    e.preventDefault();
    // Cards are already non-draggable when !canManageStatus (see the
    // quest-card's draggable attribute below), so this normally never
    // fires for a restricted member — this is a defense-in-depth guard in
    // case a drop event ever lands anyway (stale drag state, browser
    // quirk), not the primary mechanism.
    if (canManageStatus && draggedId !== null) {
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

  // Scope tasks to whichever board the Private/Collaborative tab currently
  // points at. A task with no boardId is legacy/implicit-private, so it
  // still shows up under the private board.
  const visibleTasks = tasks.filter((t) =>
    boardContext === 'private'
      ? !t.boardId || t.boardId === activeBoardId
      : t.boardId === activeBoardId,
  );

  const doneCount = visibleTasks.filter((t) => t.status === 'Done').length;
  const totalCount = visibleTasks.length;
  const progressPercent =
    totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

  return (
    <div className="page">
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

      <div className="board">
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
                const comments = task.comments ?? [];
                const statusRequest = task.statusRequest ?? null;

                // TEMPORARY DEBUG LOGGING — remove once the Approve/Reject
                // visibility issue is diagnosed.
                console.log(
                  '[App] task',
                  task.id,
                  '| boardId =',
                  task.boardId,
                  '| statusRequest =',
                  statusRequest,
                );

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
                    {canManageStatus && statusRequest && (
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
                  </div>

                  {expandedId === task.id && (
                    <div className="card-details">
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
  );
}

export default App;
