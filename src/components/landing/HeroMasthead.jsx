import { useEffect, useRef } from 'react';
import gsap from 'gsap';

function HeroMasthead() {
  const rootRef = useRef(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    const ctx = gsap.context(() => {
      // Elements are visible by default in CSS — this only animates them IN
      // from a temporary offset. If GSAP never runs (or is interrupted),
      // the content is still there; it just skips the reveal.
      if (prefersReduced) return;

      gsap.from('[data-hero-line]', {
        yPercent: 110,
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.1,
      });
      gsap.from('[data-hero-fade]', {
        opacity: 0,
        y: 18,
        duration: 0.7,
        ease: 'power2.out',
        delay: 0.3,
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <div className="eos-hero-masthead" ref={rootRef}>
      <h1 className="eos-hero-title">
        <span className="eos-hero-line">
          <span data-hero-line>Move work</span>
        </span>
        <span className="eos-hero-line">
          <span data-hero-line>forward.</span>
        </span>
      </h1>

      <p className="eos-hero-support" data-hero-fade>
        Drag a card between states the board reflects it instantly.
      </p>
    </div>
  );
}

export default HeroMasthead;
