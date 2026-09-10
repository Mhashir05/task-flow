import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { STATES, STATE_COUNTS, DUMMY_TASKS, stateSlug } from './data';
import TaskCardMini from './TaskCardMini';
import Counter from './Counter';

function TaskBoardPreview({ activeState }) {
  const gridRef = useRef(null);
  const travelerRef = useRef(null);
  const colRefs = useRef({});
  const ctxRef = useRef(null);

  // Persistent context: the "traveler" card cycling through the four states.
  useEffect(() => {
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const narrow = window.matchMedia('(max-width: 640px)').matches;

    const ctx = gsap.context(() => {
      if (prefersReduced || narrow) return;
      const t = travelerRef.current;
      if (!t) return;

      const pulse = (key) => {
        const el = colRefs.current[key]?.querySelector('.eos-col-count');
        if (!el) return;
        gsap.fromTo(
          el,
          { color: 'var(--eos-accent)' },
          { color: 'var(--eos-ink)', duration: 1.2, ease: 'power2.out' },
        );
      };

      const hold = 1;
      const move = 0.72;
      const tl = gsap.timeline({
        repeat: -1,
        repeatDelay: 2,
        defaults: { ease: 'power2.inOut' },
      });
      tl.set(t, { xPercent: 0, opacity: 0 })
        .to(t, { opacity: 1, duration: 0.35, ease: 'power2.out' })
        .to(t, { duration: hold })
        .to(t, { xPercent: 100, duration: move })
        .call(pulse, ['In Progress'])
        .to(t, { duration: hold })
        .to(t, { xPercent: 200, duration: move })
        .call(pulse, ['Review'])
        .to(t, { duration: hold })
        .to(t, { xPercent: 300, duration: move })
        .call(pulse, ['Done'])
        .to(t, { duration: hold })
        .to(t, { opacity: 0, duration: 0.35, ease: 'power2.in' });
    }, gridRef);

    ctxRef.current = ctx;
    return () => {
      ctx.revert();
      ctxRef.current = null;
    };
  }, []);

  // Hover / focus response: highlight the active state's column, dim the rest.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const dur = prefersReduced ? 0 : 0.28;

    ctx.add(() => {
      STATES.forEach((s) => {
        const col = colRefs.current[s.key];
        if (!col) return;
        const isActive = activeState === s.key;
        const isDim = activeState != null && !isActive;
        gsap.to(col, {
          opacity: isDim ? 0.36 : 1,
          y: isActive && !prefersReduced ? -4 : 0,
          duration: dur,
          ease: 'power2.out',
          overwrite: 'auto',
        });
      });
    });
  }, [activeState]);

  return (
    <section className="eos-board" id="eos-board" aria-labelledby="eos-board-h">
      <h2 id="eos-board-h" className="eos-section-label">
        <span className="eos-section-mark" aria-hidden="true">
          § 02
        </span>{' '}
        Flow
      </h2>

      <div className="eos-board-grid" ref={gridRef}>
        <div className="eos-traveler" ref={travelerRef} aria-hidden="true">
          <article className="eos-card eos-card--travel">
            <span className="eos-card-id">TF-256</span>
            <p className="eos-card-title">Prepare the launch checklist</p>
          </article>
        </div>

        {STATES.map((s) => {
          const shown = DUMMY_TASKS[s.key];
          const remainder = STATE_COUNTS[s.key] - shown.length;
          return (
            <div
              key={s.key}
              className="eos-col"
              id={`eos-col-${stateSlug(s.key)}`}
              role="group"
              tabIndex={-1}
              aria-label={`${s.key} column`}
              ref={(el) => {
                colRefs.current[s.key] = el;
              }}
            >
              <div className="eos-col-head">
                <span className="eos-col-index">{s.index}</span>
                <span className="eos-col-name">{s.key}</span>
                <Counter
                  className="eos-col-count"
                  value={STATE_COUNTS[s.key]}
                />
              </div>
              <ul className="eos-col-list">
                {shown.map((task) => (
                  <li key={task.id}>
                    <TaskCardMini id={task.id} title={task.title} />
                  </li>
                ))}
                {remainder > 0 && (
                  <li className="eos-col-more">+{remainder} more</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default TaskBoardPreview;
