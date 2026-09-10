import { useEffect, useRef } from 'react';
import gsap from 'gsap';

// Large numeral that counts up from 0 the first time it enters the viewport.
// Renders the real final value as its initial text so it is correct for
// screen readers and if JS never runs. Skipped under reduced motion.
function Counter({ value, className }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (prefersReduced) {
      el.textContent = String(value);
      return;
    }

    const ctx = gsap.context(() => {});
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        ctx.add(() => {
          const proxy = { v: 0 };
          gsap.to(proxy, {
            v: value,
            duration: 1.1,
            ease: 'power2.out',
            onUpdate: () => {
              el.textContent = String(Math.round(proxy.v));
            },
          });
        });
      },
      { threshold: 0.6 },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      ctx.revert();
    };
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  );
}

export default Counter;
