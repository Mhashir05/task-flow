import { useCallback, useRef, useState } from 'react';
import LandingNav from './landing/LandingNav';
import HeroMasthead from './landing/HeroMasthead';
import StateIndex from './landing/StateIndex';
import TaskBoardPreview from './landing/TaskBoardPreview';
import AuthPanel from './landing/AuthPanel';
import { stateSlug } from './landing/data';
import './landing/landing.css';

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function LandingPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const [activeState, setActiveState] = useState(null);
  const signInRef = useRef(null);

  const openAuth = useCallback(() => setAuthOpen(true), []);

  const closeAuth = useCallback(() => {
    setAuthOpen(false);
    signInRef.current?.focus();
  }, []);

  const handleNavigate = useCallback((target) => {
    const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
    if (target === 'top') {
      window.scrollTo({ top: 0, behavior });
      return;
    }
    const id = target === 'product' ? 'eos-board' : 'eos-about';
    document.getElementById(id)?.scrollIntoView({ behavior, block: 'start' });
  }, []);

  const handleSelectState = useCallback((key) => {
    const el = document.getElementById(`eos-col-${stateSlug(key)}`);
    if (!el) return;
    el.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'center',
    });
    el.focus({ preventScroll: true });
  }, []);

  return (
    <div className="eos" id="top">
      <LandingNav
        signInRef={signInRef}
        onSignIn={openAuth}
        onNavigate={handleNavigate}
      />

      <main className="eos-main">
        <section className="eos-hero" aria-label="Introduction">
          <p className="eos-hero-kicker">§ 00 — Editorial Task OS</p>
          <StateIndex
            activeState={activeState}
            onHoverState={setActiveState}
            onSelectState={handleSelectState}
          />
          <HeroMasthead onCta={openAuth} />
        </section>

        <TaskBoardPreview activeState={activeState} />

        <section
          className="eos-about"
          id="eos-about"
          aria-labelledby="eos-about-h"
        >
          <h2 id="eos-about-h" className="eos-section-label">
            <span className="eos-section-mark" aria-hidden="true">
              § 03
            </span>{' '}
            Method
          </h2>
          <p className="eos-about-line">
            Four states, no ceremony. Move a card when the work moves — the
            board is the status report.
          </p>
        </section>
      </main>

      <footer className="eos-foot">
        <span>Editorial Task OS</span>
        <span aria-hidden="true">·</span>
        <span>{new Date().getFullYear()}</span>
      </footer>

      <AuthPanel open={authOpen} onClose={closeAuth} />
    </div>
  );
}

export default LandingPage;
