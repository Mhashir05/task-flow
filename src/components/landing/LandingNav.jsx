function LandingNav({ signInRef, onSignIn, onNavigate }) {
  return (
    <header className="eos-nav">
      <a
        className="eos-wordmark"
        href="#top"
        onClick={(e) => {
          e.preventDefault();
          onNavigate('top');
        }}
      >
        Taskflow
      </a>
      <nav className="eos-navlinks" aria-label="Primary">
        <button type="button" onClick={() => onNavigate('product')}>
          Product
        </button>
        <button type="button" onClick={() => onNavigate('about')}>
          About
        </button>
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
