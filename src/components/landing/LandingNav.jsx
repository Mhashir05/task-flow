import { useEffect, useRef } from 'react';
import gsap from 'gsap';

function LandingNav({ onSignIn, onGoTop }) {
  const signInRef = useRef(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const btn = signInRef.current;
    let onMove;
    let onLeave;

    const ctx = gsap.context(() => {
      if (!btn || prefersReduced || !finePointer) return;

      const xTo = gsap.quickTo(btn, 'x', { duration: 0.4, ease: 'power3.out' });
      const yTo = gsap.quickTo(btn, 'y', { duration: 0.4, ease: 'power3.out' });
      onMove = (e) => {
        const r = btn.getBoundingClientRect();
        xTo(
          gsap.utils.clamp(-8, 8, (e.clientX - (r.left + r.width / 2)) * 0.28),
        );
        yTo(
          gsap.utils.clamp(-6, 6, (e.clientY - (r.top + r.height / 2)) * 0.3),
        );
      };
      onLeave = () => {
        xTo(0);
        yTo(0);
      };
      btn.addEventListener('mousemove', onMove);
      btn.addEventListener('mouseleave', onLeave);
    }, signInRef);

    return () => {
      if (btn && onMove) {
        btn.removeEventListener('mousemove', onMove);
        btn.removeEventListener('mouseleave', onLeave);
      }
      ctx.revert();
    };
  }, []);

  return (
    <header className="eos-nav">
      <a
        className="eos-wordmark"
        href="#top"
        onClick={(e) => {
          e.preventDefault();
          onGoTop();
        }}
      >
        Taskflow
      </a>
      <nav className="eos-navlinks" aria-label="Primary">
        <button
          type="button"
          className="eos-navsignin"
          ref={signInRef}
          onClick={onSignIn}
        >
          Sign in
        </button>
      </nav>
    </header>
  );
}

export default LandingNav;
