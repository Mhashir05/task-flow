import './App.css';
import { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { addTask, deleteTask, updateStatus, editTitle, editDescription } from './features/tasks/tasksSlice';
import { logOut } from './features/auth/authSlice';
import UsersFeed from './components/UsersFeed';

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
  const dispatch = useDispatch();

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
  const titleRef = useRef(null);
  const cancelConfirmRef = useRef(null);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(''), 2500);
    return () => clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (confirmingId !== null) cancelConfirmRef.current?.focus();
  }, [confirmingId]);

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

  function toggleExpand(id) {
    setExpandedId(expandedId === id ? null : id);
  }

  function handleDrop(e, statusName) {
    e.preventDefault();
    if (draggedId !== null) {
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

  const doneCount = tasks.filter((t) => t.status === 'Done').length;
  const totalCount = tasks.length;
  const progressPercent =
    totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

  return (
    <div className="page">
      <header className="topbar">
        <div className="logo">
          TASK FLOW
        </div>
        <p className="tagline">Keep it moving. Enhance productivity.</p>
        <button
          type="button"
          className="sign-out"
          onClick={() => dispatch(logOut())}
        >
          Sign out
        </button>
      </header>

      <div className="view-toggle" role="group" aria-label="Select view">
        <button
          type="button"
          className={view === 'board' ? 'active' : ''}
          aria-pressed={view === 'board'}
          onClick={() => setView('board')}
        >
          Board
        </button>
        <button
          type="button"
          className={view === 'users' ? 'active' : ''}
          aria-pressed={view === 'users'}
          onClick={() => setView('users')}
        >
          Users
        </button>
      </div>

      {view === 'users' ? (
        <UsersFeed />
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
                {tasks.filter((t) => t.status === status.name).length}
              </span>
            </div>

            {tasks.filter((t) => t.status === status.name).length === 0 && (
              <div className="empty-state">
                <p>No tasks in {status.name}</p>
              </div>
            )}

            {tasks
              .filter((task) => task.status === status.name)
              .map((task) => (
                <div
                  className={`quest-card${
                    draggedId === task.id ? ' quest-card--dragging' : ''
                  }`}
                  key={task.id}
                  draggable
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
                    {task.dueDate && (
                      <span className="due-date">{task.dueDate}</span>
                    )}
                    <span className="priority-badge">
                      {task.priority || 'Medium'}
                    </span>
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
                    </div>
                  )}
                </div>
              ))}
          </div>
        ))}
      </div>
        </>
      )}
    </div>
  );
}

export default App;
