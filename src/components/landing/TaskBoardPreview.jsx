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
      if (prefersReduced || narrow) return;
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
