import { useCallback } from 'react';
import LandingNav from './landing/LandingNav';
import HeroMasthead from './landing/HeroMasthead';
import TaskBoardPreview from './landing/TaskBoardPreview';
import AuthScreen from '../features/auth/AuthScreen';
import './landing/landing.css';

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function scrollToAuth() {
  const el = document.getElementById('eos-auth');
  if (!el) return;
  el.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  });
  el.querySelector('#auth-email')?.focus({ preventScroll: true });
}

function LandingPage() {
  const handleGoTop = useCallback(() => {
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, []);

  return (
    <div className="eos" id="top">
      <LandingNav onSignIn={scrollToAuth} onGoTop={handleGoTop} />

      <main className="eos-main">
        <section className="eos-hero" aria-label="Introduction">
          <p className="eos-hero-kicker">Four states. One board. No noise.</p>
          <div className="eos-hero-auth" id="eos-auth">
            <AuthScreen />
          </div>
          <HeroMasthead />
        </section>

        <TaskBoardPreview />

        <section
          className="eos-about"
          id="eos-about"
          aria-labelledby="eos-about-h"
        >
          <h2 id="eos-about-h" className="eos-about-line">
            Everything you move is saved automatically no save button, <span>NO SYNC STEP</span>.
          </h2>
        </section>
      </main>

      <footer className="eos-foot">
        <span>Taskflow</span>
        <span aria-hidden="true">·</span>
        <span>{new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}

export default LandingPage;
