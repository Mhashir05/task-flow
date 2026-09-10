import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import AuthScreen from '../../features/auth/AuthScreen';

// Reveals the existing AuthScreen inside a native <dialog> (focus trap +
// Escape + backdrop for free). AuthScreen's logic/markup is untouched;
// landing.css scopes presentation overrides to `.eos-authpanel`.
function AuthPanel({ open, onClose }) {
  const dialogRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    else if (!open && dlg.open) dlg.close();
  }, [open]);

  // Sync state back when the dialog closes itself (Escape).
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const handleClose = () => onClose();
    dlg.addEventListener('close', handleClose);
    return () => dlg.removeEventListener('close', handleClose);
  }, [onClose]);

  // Lock body scroll + move focus into the form while open.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      dialogRef.current?.querySelector('#auth-email')?.focus();
    }, 0);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  // Slide the panel in. It rests off-screen (translateX(100%)) in CSS, so
  // there is no flash before this runs.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const ctx = gsap.context(() => {
      if (prefersReduced) {
        gsap.set(panel, { xPercent: 0 });
      } else {
        gsap.fromTo(
          panel,
          { xPercent: 100 },
          { xPercent: 0, duration: 0.42, ease: 'power3.out' },
        );
      }
    });
    return () => ctx.revert();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="eos-authdialog"
      aria-label="Sign in"
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="eos-authpanel" ref={panelRef}>
        <div className="eos-authpanel-head">
          <span className="eos-authpanel-label">Access</span>
          <button
            type="button"
            className="eos-authpanel-close"
            onClick={onClose}
            aria-label="Close sign in"
          >
            ×
          </button>
        </div>
        <AuthScreen />
      </div>
    </dialog>
  );
}

export default AuthPanel;
