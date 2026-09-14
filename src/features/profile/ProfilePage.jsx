import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { fetchProfile, updateProfile } from './profileSlice';

function ProfilePage() {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);
  const status = useSelector((state) => state.profile.status);
  const [displayName, setDisplayName] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (!user?.uid) return;
    dispatch(fetchProfile(user.uid))
      .unwrap()
      .then((data) => setDisplayName(data?.displayName ?? ''))
      .catch(() => {});
  }, [dispatch, user?.uid]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(''), 2500);
    return () => clearTimeout(timer);
  }, [feedback]);

  function handleSave(e) {
    e.preventDefault();
    if (!user?.uid) return;
    dispatch(updateProfile({ uid: user.uid, displayName })).then(() => {
      setFeedback('Profile saved');
    });
  }

  return (
    <div className="page">
      <p className="tagline">
        <Link to="/dashboard">&larr; Back to dashboard</Link>
      </p>

      <h1 className="logo">Your profile</h1>

      <form className="quest-form" onSubmit={handleSave}>
        <div className="field field--title">
          <label htmlFor="profile-display-name">Display name</label>
          <input
            id="profile-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How should we show your name?"
          />
        </div>
        <button type="submit" disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Save'}
        </button>
      </form>

      <div className="feedback-region" role="status" aria-live="polite">
        {feedback}
      </div>
    </div>
  );
}

export default ProfilePage;
