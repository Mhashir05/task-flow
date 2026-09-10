import { useCallback, useEffect, useRef, useState } from 'react';

function UsersFeed() {
  const [users, setUsers] = useState([]);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);
  const sentinelRef = useRef(null);
  // Synchronous guard: true from the moment a page load is triggered until
  // that request settles. Prevents the observer from firing loadMore() again
  // before the async `loading` state has committed.
  const inFlightRef = useRef(false);

  useEffect(() => {
    inFlightRef.current = true;
    const controller = new AbortController();

    fetch(`https://dummyjson.com/users?limit=10&skip=${skip}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json();
      })
      .then((data) => {
        const page = Array.isArray(data.users) ? data.users : [];
        // Dedupe by id so a repeated page can never produce duplicate rows.
        setUsers((prev) => {
          const seen = new Set(prev.map((u) => u.id));
          return [...prev, ...page.filter((u) => !seen.has(u.id))];
        });
        setHasMore(skip + 10 < data.total);
        setLoading(false);
        inFlightRef.current = false;
      })
      .catch((err) => {
        // An aborted request means a newer run has taken over; it owns the flag.
        if (err.name === 'AbortError') return;
        setError(err.message || 'Failed to load users');
        setLoading(false);
        inFlightRef.current = false;
      });

    return () => controller.abort();
  }, [skip]);

  const loadMore = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setError(null);
    setLoading(true);
    setSkip((s) => s + 10);
  }, []);

  // Auto-advance when the sentinel scrolls into view.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading || error) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, error, loadMore]);

  return (
    <section className="users-feed" aria-labelledby="users-feed-heading">
      <h2 id="users-feed-heading">Users</h2>

      <ul>
        {users.map((user) => (
          <li key={user.id}>
            {user.firstName} {user.lastName} &mdash; {user.email}
          </li>
        ))}
      </ul>

      <div ref={sentinelRef} aria-hidden="true" />

      {loading && <p>Loading&hellip;</p>}

      {error && (
        <p role="alert">
          {error}{' '}
          <button type="button" onClick={loadMore}>
            Retry
          </button>
        </p>
      )}

      {!hasMore && !loading && !error && users.length > 0 && (
        <p>You&rsquo;ve reached the end.</p>
      )}
    </section>
  );
}

export default UsersFeed;
