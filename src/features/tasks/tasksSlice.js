import { createSlice } from '@reduxjs/toolkit';

const STATUSES = ['To Do', 'In Progress', 'Review', 'Done'];

const loadTasks = () => {
  const saved = localStorage.getItem('tasks');
  if (!saved) {
    return [
      {
        id: 1,
        title: 'Sample Task',
        description: 'This is a sample task description.',
        status: 'To Do',
        dueDate: '',
        priority: 'Medium',
      },
    ];
  }
  const parsed = JSON.parse(saved);
  if (!Array.isArray(parsed)) return [];
  // Drop entries with a duplicate id (legacy Date.now() collisions),
  // which otherwise inflate the task count and break edit/delete targeting.
  const seen = new Set();
  return parsed
    .filter((task) => {
      if (seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    })
    // Reconcile legacy/blank/unknown status values to a valid column so that
    // every counted task renders in exactly one column.
    .map((task) =>
      STATUSES.includes(task.status) ? task : { ...task, status: 'To Do' },
    );
};

const tasksSlice = createSlice({
  name: 'tasks',
  initialState: loadTasks(),
  reducers: {
    addTask: (state, action) => {
      state.push(action.payload);
    },
    deleteTask: (state, action) => {
      return state.filter((task) => task.id !== action.payload);
    },
    updateStatus: (state, action) => {
      const { id, newStatus } = action.payload;
      const task = state.find((t) => t.id === id);
      if (task) task.status = newStatus;
    },
    editTitle: (state, action) => {
      const { id, newTitle } = action.payload;
      const task = state.find((t) => t.id === id);
      if (task) task.title = newTitle;
    },
    editDescription: (state, action) => {
      const { id, newDescription } = action.payload;
      const task = state.find((t) => t.id === id);
      if (task) task.description = newDescription;
    },
  },
});

export const { addTask, deleteTask, updateStatus, editTitle, editDescription } =
  tasksSlice.actions;

export default tasksSlice.reducer;