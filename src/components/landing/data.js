// Presentation-only data for the landing page.
// `key` values MUST match the app's real task status strings exactly.

export const STATES = [
  { key: 'To Do', index: '01' },
  { key: 'In Progress', index: '02' },
  { key: 'Review', index: '03' },
  { key: 'Done', index: '04' },
];

export const DUMMY_TASKS = {
  'To Do': [
    { id: 'TF-241', title: 'Draft the Q3 roadmap outline' },
    { id: 'TF-238', title: 'Sort onboarding feedback into themes' },
    { id: 'TF-235', title: 'Retire stale backlog items' },
  ],
  'In Progress': [
    { id: 'TF-229', title: 'Rework settings information architecture' },
    { id: 'TF-224', title: 'Migrate legacy auth tokens' },
  ],
  Review: [{ id: 'TF-217', title: 'Editorial pass on the release notes' }],
  Done: [
    { id: 'TF-209', title: 'Ship keyboard navigation for the board' },
    { id: 'TF-204', title: 'Consolidate the design tokens' },
    { id: 'TF-198', title: 'Remove unused marketing assets' },
  ],
};

export const stateSlug = (key) => key.toLowerCase().replace(/\s+/g, '-');
