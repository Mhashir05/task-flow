# Frontend Design Skill — Task Flow

## 1. Design Direction

Build Task Flow as a **premium, minimal, modern productivity application** inspired by the clarity of Trello, but with its own visual identity.

The visual direction is:

* Minimal
* Premium
* Clean
* Soft
* Slightly playful
* Subtle claymorphism
* Strong visual hierarchy
* Purposeful motion
* Highly usable

The interface should feel like a **real polished SaaS product**, not a template, prototype, or AI-generated demo.

### Core principle

> Less decoration, more intentional design.

Every visual element must have a purpose.

Do NOT redesign the application from scratch when improving an existing interface unless explicitly requested.

Preserve existing functionality, CRUD behavior, routes, data flow, and business logic while improving the visual experience.

---

# 2. Avoid AI-Slop

Do NOT use generic AI-generated design patterns such as:

* Excessive gradients
* Purple/blue "AI" gradients
* Excessive glassmorphism
* Huge hero headings
* Random floating blobs
* Excessive rounded cards
* Excessive pill-shaped UI
* Decorative elements without purpose
* Excessive shadows
* Overly bright saturated colors
* Multiple competing accent colors
* Random icons
* Unnecessary animations
* Excessive border-radius
* Making every element look like a floating card
* Generic dashboard layouts copied from templates

Avoid visual complexity that does not improve usability.

The application should look **designed**, not decorated.

---

# 3. Visual Personality

Task Flow should communicate:

**Focused + Calm + Productive + Modern**

The UI should feel lightweight and approachable.

Use subtle visual depth rather than heavy shadows.

Use rounded corners selectively.

Use whitespace intentionally.

Create hierarchy through:

1. Typography
2. Spacing
3. Contrast
4. Surface elevation
5. Color
6. Motion

Do not rely on decoration to create hierarchy.

---

# 4. Color System

Use a restrained neutral foundation.

Primary surfaces should use neutral colors.

Use semantic accent colors for task states:

* New
* In Progress
* Pending
* Done

State colors must remain visually consistent throughout the application.

The same semantic color should represent the same state everywhere.

For example:

* Status indicators
* Task labels
* Filters
* Badges
* Progress indicators

Do not introduce a new color for the same semantic meaning.

### Color rules

* Avoid excessive saturation.
* Avoid using accent colors as large backgrounds.
* Prefer subtle tinted surfaces.
* Maintain sufficient text contrast.
* Primary actions should have one clear visual treatment.
* Destructive actions should be visually distinct but not overly aggressive.

---

# 5. Typography

Typography must create a clear hierarchy.

Use a modern sans-serif typeface.

Recommended hierarchy:

### Page title

Large, strong, confident.

### Section headings

Medium-large and visually distinct.

### Task titles

Readable and prominent but not oversized.

### Supporting text

Smaller and lower contrast.

### Metadata

Small, subtle, but still readable.

Do not use too many font sizes.

Prefer a small consistent type scale.

Avoid:

* Extremely thin text
* Excessive bold text
* Long uppercase text
* Decorative fonts
* Inconsistent font weights

Typography should make the interface scannable.

---

# 6. Spacing System

Use a consistent spacing scale.

Prefer predictable spacing values instead of arbitrary margins.

Maintain clear relationships between:

* Page sections
* Cards
* Task content
* Buttons
* Inputs
* Labels
* Icons

Use whitespace to separate groups.

Avoid cramped layouts.

Avoid excessive empty space that makes the application feel unfinished.

---

# 7. Layout

The main interface should feel balanced and intentional.

Use a strong content container.

Maintain consistent horizontal padding.

The task board should be the primary visual focus.

The layout should clearly communicate:

**Workspace → Columns → Tasks → Task actions**

Do not allow secondary UI elements to visually compete with the task board.

Maintain alignment between columns and their contents.

---

# 8. Task Columns

The core workflow contains:

* New Task
* In Progress
* Pending
* Done

Each column should have:

* Clear title
* Task count
* Consistent header
* Strong but subtle state identity
* Consistent spacing
* Clear empty state

Columns should feel like parts of one system rather than four unrelated cards.

Do not give every column completely different visual styling.

---

# 9. Task Cards

Task cards are the primary interactive objects.

Each card should clearly communicate:

* Task title
* Optional description
* Status
* Relevant metadata
* Available actions

Cards should have:

* Subtle surface elevation
* Controlled border radius
* Clear internal spacing
* Strong title hierarchy
* Obvious interaction states

Avoid putting too many elements inside a card.

The task title should remain the visual priority.

---

# 10. Claymorphism

Claymorphism should be **subtle**.

Use it primarily through:

* Soft shadows
* Soft surfaces
* Gentle highlights
* Slight depth
* Rounded but controlled geometry

Do NOT make the entire interface look inflated.

Avoid:

* Extreme inner shadows
* Huge rounded shapes
* Excessive 3D effects
* Every component appearing physically raised

The goal is:

> "Soft physical depth"

not:

> "Everything looks like a toy."

---

# 11. Buttons

Buttons must have clear hierarchy.

Use:

### Primary

For the main action.

Example:

Create Task

### Secondary

For supporting actions.

Example:

Cancel / Edit

### Destructive

For irreversible actions.

Example:

Delete

Primary actions should visually stand out.

Do not make every button equally prominent.

Buttons should have:

* Clear hover state
* Clear active state
* Clear disabled state
* Appropriate cursor behavior
* Accessible contrast

Avoid excessive pill-shaped buttons unless the element is genuinely a compact control.

---

# 12. Forms

Forms should be simple and focused.

Inputs must have:

* Clear labels
* Consistent height
* Clear focus state
* Helpful placeholder text where appropriate
* Validation feedback
* Comfortable spacing

The form should visually communicate:

Label → Input → Supporting information → Action

Do not rely exclusively on placeholder text as labels.

---

# 13. CRUD UX

CRUD functionality must remain reliable.

The interface should make the following actions obvious:

* Create task
* Read/view task
* Edit task
* Delete task
* Change task status

Never sacrifice functionality for visual design.

Destructive actions should require appropriate confirmation when necessary.

After CRUD operations, provide clear visual feedback.

Examples:

* Task created
* Task updated
* Task deleted
* Status changed

Use subtle feedback rather than intrusive notifications.

---

# 14. Icons

Icons should support understanding, not decorate the interface.

Use one consistent icon library/style.

Icons should have:

* Consistent size
* Consistent stroke weight
* Proper alignment
* Accessible labels/tooltips where needed

Avoid mixing unrelated icon styles.

Do not use icons when a simple text label is clearer.

---

# 15. Motion & Animation

Animation should communicate state and interaction.

Use subtle transitions for:

* Hover
* Focus
* Opening/closing modals
* Adding tasks
* Removing tasks
* Status changes
* Buttons
* Dropdowns

Animations should generally feel:

**fast + smooth + subtle**

Avoid:

* Excessive bouncing
* Large transformations
* Long animations
* Constant movement
* Decorative animations

Respect `prefers-reduced-motion`.

---

# 16. Responsive Design

The application must work properly across:

* Desktop
* Tablet
* Mobile

Do not simply shrink the desktop layout.

On smaller screens:

* Preserve readability
* Maintain touch-friendly controls
* Prevent horizontal overflow
* Reorganize columns appropriately
* Keep primary actions accessible
* Maintain consistent spacing

The mobile experience should feel intentionally designed.

---

# 17. Accessibility

Accessibility is part of the design.

Ensure:

* Keyboard navigation works
* Focus states are visible
* Buttons have accessible names
* Inputs have labels
* Color is not the only way to communicate status
* Text contrast is sufficient
* Interactive elements have appropriate hit areas
* Modals can be closed appropriately
* Reduced-motion preferences are respected

Do not remove focus outlines without providing an equally visible replacement.

---

# 18. Empty States

Empty columns should not look broken.

Provide a simple, useful empty state.

Example structure:

Short visual indicator
"Nothing here yet"
Optional supporting text

Do not over-design empty states.

They should encourage the user to take the next logical action.

---

# 19. Loading & Error States

Loading states should preserve layout stability.

Avoid sudden layout jumps.

Use subtle loading indicators or skeletons where appropriate.

Errors should:

* Explain what went wrong
* Remain readable
* Provide a useful next action when possible

Never silently fail.

---

# 20. Component Consistency

Before creating a new component style, check whether an existing component can be reused.

Maintain consistent:

* Border radius
* Shadows
* Typography
* Spacing
* Colors
* Button styles
* Input styles
* Icon sizes
* Animation behavior

Avoid creating multiple visually similar components with slightly different styling.

---

# 21. Design Tokens

Whenever practical, centralize design values such as:

* Colors
* Spacing
* Border radius
* Shadows
* Typography
* Transitions

Avoid scattering arbitrary values throughout the codebase.

If a design value appears repeatedly, turn it into a reusable token or variable.

---

# 22. Existing UI Rule

When working on an existing interface:

1. Inspect the current implementation.
2. Understand the existing visual language.
3. Identify the highest-impact problems.
4. Preserve working functionality.
5. Improve incrementally.
6. Re-check the result against this skill.

Do NOT immediately rewrite the entire application.

Do NOT replace working components merely because another implementation looks cleaner.

---

# 23. UI Audit Method

Before making significant visual changes, evaluate:

### Visual hierarchy

Is it immediately obvious what the user should look at and do?

### Consistency

Do components feel like they belong to the same design system?

### Spacing

Are elements comfortably spaced without wasting excessive space?

### Typography

Can users scan task information quickly?

### Contrast

Are important actions and information visually clear?

### Interaction

Do buttons, cards, inputs, and controls communicate that they are interactive?

### Responsiveness

Does the layout remain usable on smaller screens?

### Accessibility

Can users navigate and understand the interface without relying only on color?

### Visual polish

Does anything look generic, accidental, excessive, or unfinished?

Prioritize **high-impact problems first**.

---

# 24. Implementation Priority

When improving the UI, use this order:

1. Layout problems
2. Visual hierarchy
3. Typography
4. Spacing
5. Component consistency
6. Colors
7. Interaction states
8. Motion
9. Responsive polish
10. Decorative details

Do not spend time polishing small details while major layout or hierarchy problems remain.

---

# 25. Change Management

Make changes in controlled batches.

Preferred workflow:

**Audit → Implement → Review → Refine**

Do not make dozens of unrelated visual changes in one step.

After each major UI change:

* Inspect the result
* Check for regressions
* Compare against this skill
* Fix inconsistencies
* Preserve functionality

---

# 26. Final Quality Standard

Before considering a UI change complete, ask:

* Does it look intentional?
* Does it feel like one coherent product?
* Is the primary action obvious?
* Is the interface easy to scan?
* Is the spacing consistent?
* Are colors meaningful?
* Is claymorphism subtle?
* Are animations purposeful?
* Is the UI responsive?
* Is accessibility preserved?
* Did the change preserve CRUD functionality?
* Does anything look like generic AI-generated UI?

If the answer to any of these is "no", refine the implementation.

## Final Principle

> Build a UI that feels thoughtfully designed by a product designer — not generated by a prompt.
