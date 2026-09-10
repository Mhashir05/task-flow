import { useEffect, useRef } from 'react';
import gsap from 'gsap';

function HeroMasthead({ onCta }) {
  const rootRef = useRef(null);
  const ctaRef = useRef(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const cta = ctaRef.current;
    let onMove;
    let onLeave;

    const ctx = gsap.context(() => {
      if (prefersReduced) {
        // Elements start hidden in CSS; reveal them with no motion.
        gsap.set('[data-hero-line]', { yPercent: 0 });
        gsap.set('[data-hero-fade]', { opacity: 1, y: 0 });
        return;
      }

      gsap.fromTo(
        '[data-hero-line]',
        { yPercent: 110 },
        { yPercent: 0, duration: 0.9, ease: 'power3.out', stagger: 0.1 },
      );
      gsap.fromTo(
        '[data-hero-fade]',
        { opacity: 0, y: 18 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: 'power2.out',
          stagger: 0.08,
          delay: 0.3,
        },
      );

      // Refined magnetic pull on the CTA (fine pointers only).
      if (cta && finePointer) {
        const xTo = gsap.quickTo(cta, 'x', { duration: 0.4, ease: 'power3.out' });
        const yTo = gsap.quickTo(cta, 'y', { duration: 0.4, ease: 'power3.out' });
        onMove = (e) => {
          const r = cta.getBoundingClientRect();
          xTo(
            gsap.utils.clamp(
              -10,
              10,
              (e.clientX - (r.left + r.width / 2)) * 0.28,
            ),
          );
          yTo(
            gsap.utils.clamp(-8, 8, (e.clientY - (r.top + r.height / 2)) * 0.3),
          );
        };
        onLeave = () => {
          xTo(0);
          yTo(0);
        };
        cta.addEventListener('mousemove', onMove);
        cta.addEventListener('mouseleave', onLeave);
      }
    }, rootRef);

    return () => {
      if (cta && onMove) {
        cta.removeEventListener('mousemove', onMove);
        cta.removeEventListener('mouseleave', onLeave);
      }
      ctx.revert();
    };
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

      <div className="eos-hero-foot">
        <p className="eos-hero-support" data-hero-fade>
          Organize the work. See the progress. Keep moving.
        </p>
        <button
          type="button"
          className="eos-cta"
          ref={ctaRef}
          onClick={onCta}
          data-hero-fade
        >
          <span>Start organizing</span>
          <span className="eos-cta-arrow" aria-hidden="true">
            →
          </span>
        </button>
      </div>
    </div>
  );
}

export default HeroMasthead;
