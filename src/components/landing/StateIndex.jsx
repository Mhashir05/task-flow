import { STATES, STATE_COUNTS } from './data';
import Counter from './Counter';

function StateIndex({ activeState, onHoverState, onSelectState }) {
  return (
    <section className="eos-states" aria-labelledby="eos-states-h">
      <h2 id="eos-states-h" className="eos-section-label">
        <span className="eos-section-mark" aria-hidden="true">
          § 01
        </span>{' '}
        States
      </h2>

      <ol className="eos-state-list">
        {STATES.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              className="eos-state-row"
              aria-label={`${s.key}, ${STATE_COUNTS[s.key]} tasks`}
              data-active={activeState === s.key || undefined}
              onMouseEnter={() => onHoverState(s.key)}
              onMouseLeave={() => onHoverState(null)}
              onFocus={() => onHoverState(s.key)}
              onBlur={() => onHoverState(null)}
              onClick={() => onSelectState(s.key)}
            >
              <span className="eos-state-index">{s.index}</span>
              <span className="eos-state-name">{s.key}</span>
              <Counter className="eos-state-count" value={STATE_COUNTS[s.key]} />
            </button>
          </li>
        ))}
      </ol>

      <p className="eos-state-hint">Hover a state to trace its work below.</p>
    </section>
  );
}

export default StateIndex;
