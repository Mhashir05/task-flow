import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { STATES, DUMMY_TASKS, stateSlug } from './data';
import TaskCardMini from './TaskCardMini';

function TaskBoardPreview() {
  const gridRef = useRef(null);
  const travelerRef = useRef(null);
  const colRefs = useRef({});

  // The "traveler" card cycling through the four states — the one ongoing,
  // meaningful motion on the page (each arrival briefly accents the
  // destination column's heading rather than a counter).
  useEffect(() => {
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const narrow = window.matchMedia('(max-width: 640px)').matches;

    const ctx = gsap.context(() => {
      if (prefersReduced) return;
      const t = travelerRef.current;
      if (!t) return;

      const pulse = (key) => {
        const el = colRefs.current[key]?.querySelector('.eos-col-name');
        if (!el) return;
        gsap.fromTo(
          el,
          { color: 'var(--eos-accent)' },
          { color: 'var(--eos-ink)', duration: 1.2, ease: 'power2.out' },
        );
      };

      // Narrow: columns stack vertically with uneven heights (different
      // task counts per state), so a fixed percentage can't locate them.
      // Each stop is a function GSAP re-invokes live every time it plays —
      // including every repeat of the infinite loop — so it can't drift
      // out of alignment after a late webfont swap, a resize, or an
      // orientation change the way a one-time measurement would.
      const axisProp = narrow ? 'y' : 'xPercent';
      const offsetOf = (key) => {
        const el = colRefs.current[key];
        if (!el || !gridRef.current) return 0;
        return (
          el.getBoundingClientRect().top -
          gridRef.current.getBoundingClientRect().top
        );
      };
      const targets = narrow
        ? STATES.map((s) => () => offsetOf(s.key))
        : [0, 100, 200, 300];

      const hold = 1;
      const move = 0.72;
      const tl = gsap.timeline({
        repeat: -1,
        repeatDelay: 2,
        defaults: { ease: 'power2.inOut' },
      });
      tl.set(t, { [axisProp]: targets[0], opacity: 0 })
        .to(t, { opacity: 1, duration: 0.35, ease: 'power2.out' })
        .to(t, { duration: hold })
        .to(t, { [axisProp]: targets[1], duration: move })
        .call(pulse, ['In Progress'])
        .to(t, { duration: hold })
        .to(t, { [axisProp]: targets[2], duration: move })
        .call(pulse, ['Review'])
        .to(t, { duration: hold })
        .to(t, { [axisProp]: targets[3], duration: move })
        .call(pulse, ['Done'])
        .to(t, { duration: hold })
        .to(t, { opacity: 0, duration: 0.35, ease: 'power2.in' });
    }, gridRef);

    return () => ctx.revert();
  }, []);

  return (
    <section className="eos-board" id="eos-board" aria-labelledby="eos-board-h">
      <h1 id="eos-board-h" className="eos-section-label">
        Flow
      </h1>

      <div className="eos-board-grid" ref={gridRef}>
        <div className="eos-traveler" ref={travelerRef} aria-hidden="true">
          <article className="eos-card eos-card--travel">
            <span className="eos-card-id">TF-256</span>
            <p className="eos-card-title">Prepare the launch checklist</p>
          </article>
        </div>

        {STATES.map((s) => (
          <div
            key={s.key}
            className="eos-col"
            id={`eos-col-${stateSlug(s.key)}`}
            role="group"
            aria-label={`${s.key} column`}
            ref={(el) => {
              colRefs.current[s.key] = el;
            }}
          >
            <div className="eos-col-head">
              <span className="eos-col-index">{s.index}</span>
              <h3 className="eos-col-name">{s.key}</h3>
            </div>
            <ul className="eos-col-list">
              {DUMMY_TASKS[s.key].map((task) => (
                <li key={task.id}>
                  <TaskCardMini id={task.id} title={task.title} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export default TaskBoardPreview;
