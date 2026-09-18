import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  getMemberRole,
  leaveBoard,
  removeMember,
  transferOwnership,
  updateMemberRole,
} from './boardsSlice';
import { requestLeaveBoard } from '../leaveRequests/leaveRequestsSlice';

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member' };
// Purely a demo/UX touch — no real fetch happens for a revealed batch, this
// just makes the existing in-memory pagination feel like it's loading.
const REVEAL_DELAY_MS = 650;

function BoardMembers() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((state) => state.auth.user);
  const boards = useSelector((state) => state.boards.list);
  const activeBoardId = useSelector((state) => state.boards.activeBoardId);
  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? null;
  const myRole = getMemberRole(activeBoard, user?.uid);

  // Only ever written from the async resolution below, never synchronously
  // in the effect — `loading` is derived by comparing boardId to the
  // active board instead of tracked with its own setState.
  const [result, setResult] = useState({
    boardId: null,
    members: [],
    error: null,
  });
  const [feedback, setFeedback] = useState('');
  const [searchText, setSearchText] = useState('');
  // Which member row currently has its "transfer ownership to them?" confirm
  // step open — same open-confirm pattern as App.jsx's confirmingId for task
  // delete, given how significant this action is.
  const [transferConfirmUid, setTransferConfirmUid] = useState(null);
  // Self-row only, so a single boolean (not keyed by uid) is enough — same
  // confirm-step pattern CollaborativePanel.jsx used before this action
  // moved here.
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  // Progressive rendering over the already-in-memory filteredMembers array
  // — no new Firestore reads involved, purely how many of it get rendered
  // at once. Starts at 10 and grows by 10 each time the sentinel below
  // scrolls into view.
  const [visibleCount, setVisibleCount] = useState(10);
  // True for the artificial REVEAL_DELAY_MS window between the sentinel
  // triggering and the next batch actually appearing — see the effect
  // below for why this doubles as the overlapping-trigger guard.
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef(null);
  const revealTimeoutRef = useRef(null);
  // Per-row "extra dummyjson details" state: uid -> { status: 'loading' |
  // 'done' | 'error', company?, city?, phone? }. A REAL fetch, not the
  // synthetic batch-reveal delay above — see fetchRowDetails below.
  const [rowDetails, setRowDetails] = useState({});
  // uids that have already triggered a fetch (successful, failed, or
  // in-flight) — checked before ever calling fetchRowDetails, so scrolling
  // a row out of view and back never refetches, and the shared observer
  // below only needs to fire the trigger once per row, ever.
  const triggeredUidsRef = useRef(new Set());
  // One shared IntersectionObserver instance reused for every member row,
  // rather than one instance per row — every row uses identical trigger
  // logic, so there's no reason to pay for N observer instances.
  const rowObserverRef = useRef(null);

  useEffect(() => {
    if (!activeBoard) return;
    let cancelled = false;

    Promise.all(
      activeBoard.members.map((uid) =>
        getDoc(doc(db, 'users', uid)).then((snap) => ({
          uid,
          email: snap.exists() ? snap.data().email : uid,
          displayName: snap.exists() ? snap.data().displayName : '',
          // Only present on users seeded by scripts/seed-dummy-data.mjs
          // AFTER it started stamping this field — used below to fetch
          // extra dummyjson profile details per-row. undefined for every
          // other member, which the per-row observer treats as "nothing
          // to fetch" rather than a fetchable-but-missing id.
          dummyjsonId: snap.exists() ? snap.data().dummyjsonId : undefined,
        })),
      ),
    )
      .then((resolved) => {
        if (cancelled) return;
        setResult({ boardId: activeBoard.id, members: resolved, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({
          boardId: activeBoard.id,
          members: [],
          error: err.message || 'Failed to load members',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [activeBoard]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(''), 2500);
    return () => clearTimeout(timer);
  }, [feedback]);

  const loading = Boolean(activeBoard) && result.boardId !== activeBoard.id;
  const members = loading ? [] : result.members;
  const error = loading ? null : result.error;
  const isCollaborative = activeBoard?.type === 'collaborative';

  // Pure client-side filter over the already-fetched member list — no
  // Firestore query involved, matches on email OR resolved displayName.
  const filteredMembers = members.filter((member) => {
    const query = searchText.trim().toLowerCase();
    if (!query) return true;
    const email = (member.email ?? '').toLowerCase();
    const name = (member.displayName ?? '').toLowerCase();
    return email.includes(query) || name.includes(query);
  });

  const visibleMembers = filteredMembers.slice(0, visibleCount);
  const hasMoreMembers = visibleCount < filteredMembers.length;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMoreMembers) return undefined;

    // isLoadingMore is in this effect's own dependency array, so this
    // closure is always current — never stale — meaning the in-callback
    // check below is safe on its own; recreating the observer on every
    // isLoadingMore toggle is negligible at this scale (dozens of rows).
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || isLoadingMore) return;

        setIsLoadingMore(true);
        revealTimeoutRef.current = setTimeout(() => {
          setVisibleCount((c) => Math.min(c + 10, filteredMembers.length));
          setIsLoadingMore(false);
          revealTimeoutRef.current = null;
        }, REVEAL_DELAY_MS);
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreMembers, filteredMembers.length, isLoadingMore]);

  // Unmount-only cleanup for the setTimeout above — separate from the
  // observer effect's own cleanup (which also runs on every re-run, not
  // just unmount) so navigating away mid-delay can't fire setVisibleCount/
  // setIsLoadingMore on an unmounted component.
  useEffect(() => {
    return () => {
      if (revealTimeoutRef.current) {
        clearTimeout(revealTimeoutRef.current);
      }
    };
  }, []);

  // GENUINE network call — unlike REVEAL_DELAY_MS above, this actually
  // hits dummyjson.com and is visible in the browser's Network tab. Fires
  // at most once per uid (guarded by triggeredUidsRef, checked before
  // anything else runs) regardless of how many times the row scrolls in
  // and out of view.
  async function fetchRowDetails(uid, dummyjsonId) {
    if (triggeredUidsRef.current.has(uid)) return;
    triggeredUidsRef.current.add(uid);
    setRowDetails((prev) => ({ ...prev, [uid]: { status: 'loading' } }));

    try {
      const res = await fetch(`https://dummyjson.com/users/${dummyjsonId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRowDetails((prev) => ({
        ...prev,
        [uid]: {
          status: 'done',
          company: data.company?.name,
          city: data.address?.city,
          phone: data.phone,
        },
      }));
    } catch (err) {
      // Per-row failure only — no error banner, this one row simply shows
      // no extra details, same as a member with no dummyjsonId at all.
      console.error(
        `BoardMembers: could not fetch dummyjson details for uid ${uid}:`,
        err.message,
      );
      setRowDetails((prev) => ({ ...prev, [uid]: { status: 'error' } }));
    }
  }

  // Lazily creates the ONE shared observer instance on first use, rather
  // than in a useEffect keyed to the member list — a row's ref callback
  // (attachRowObserver below) only ever fires once, at that row's own DOM
  // mount, so there's no repeated list to re-scan the way the sentinel
  // above has to on every reveal.
  function getRowObserver() {
    if (!rowObserverRef.current) {
      rowObserverRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            rowObserverRef.current.unobserve(entry.target);
            const { uid, dummyjsonId } = entry.target.dataset;
            if (dummyjsonId) fetchRowDetails(uid, dummyjsonId);
          });
        },
        { rootMargin: '100px' },
      );
    }
    return rowObserverRef.current;
  }

  // Attached only to rows that actually have a dummyjsonId (see the JSX
  // below) — a member without one is never observed at all, so there's no
  // wasted request and no error state for members this feature simply
  // doesn't apply to yet (see the Step 1 investigation note above
  // seedUsers' dummyjsonId field).
  function attachRowObserver(el) {
    if (el) getRowObserver().observe(el);
  }

  useEffect(() => {
    return () => {
      rowObserverRef.current?.disconnect();
    };
  }, []);

  function handleRoleChange(targetUid, newRole) {
    if (!activeBoard) return;
    dispatch(updateMemberRole({ boardId: activeBoard.id, targetUid, newRole }))
      .unwrap()
      .then(() => setFeedback('Role updated'))
      .catch((message) => setFeedback(message || 'Could not update role.'));
  }

  function handleRemove(targetUid) {
    if (!activeBoard) return;
    dispatch(removeMember({ boardId: activeBoard.id, targetUid }))
      .unwrap()
      .then(() => setFeedback('Member removed'))
      .catch((message) => setFeedback(message || 'Could not remove member.'));
  }

  function handleConfirmTransfer(targetUid) {
    if (!activeBoard) return;
    dispatch(
      transferOwnership({ boardId: activeBoard.id, newOwnerUid: targetUid }),
    )
      .unwrap()
      .then(() => setFeedback('Ownership transferred'))
      .catch((message) =>
        setFeedback(message || 'Could not transfer ownership.'),
      );
    setTransferConfirmUid(null);
  }

  // Admin-only, direct — navigates back to the hub on success rather than
  // leaving the viewer on a workspace page for a board they just left, same
  // as this did when it lived in CollaborativePanel.jsx.
  function handleConfirmLeave() {
    if (!activeBoard || !user?.uid) return;
    dispatch(leaveBoard({ boardId: activeBoard.id, uid: user.uid }))
      .unwrap()
      .then(() => {
        navigate('/dashboard/boards', {
          state: { feedback: 'You left this board.' },
        });
      })
      .catch((message) => setFeedback(message || 'Could not leave board.'));
    setConfirmingLeave(false);
  }

  // Member-only — submits a leaveRequests doc for Owner/Admin review rather
  // than leaving immediately.
  function handleRequestLeave() {
    if (!activeBoard || !user?.uid) return;
    dispatch(
      requestLeaveBoard({
        boardId: activeBoard.id,
        uid: user.uid,
        email: user.email,
      }),
    )
      .unwrap()
      .then(() => setFeedback('Leave request submitted'))
      .catch((message) =>
        setFeedback(message || 'Could not submit leave request.'),
      );
  }

  return (
    <section className="users-feed" aria-labelledby="users-feed-heading">
      <h2 id="users-feed-heading">Team</h2>

      {!activeBoard && <p>No board selected.</p>}
      {activeBoard && loading && <p>Loading&hellip;</p>}
      {activeBoard && error && <p role="alert">{error}</p>}

      {activeBoard && !loading && !error && members.length > 0 && (
        <input
          type="text"
          className="member-search"
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            // A new search should start paginated too, rather than
            // dumping every match at once just because visibleCount
            // happened to already be higher from browsing the unfiltered
            // list.
            setVisibleCount(10);
          }}
          placeholder="Search members…"
          aria-label="Search team members"
        />
      )}

      {activeBoard && !loading && !error && members.length > 0 && filteredMembers.length === 0 && (
        <p className="member-search-empty">No members match.</p>
      )}

      {activeBoard && !loading && !error && filteredMembers.length > 0 && (
        <ul>
          {visibleMembers.map((member) => {
            const role = getMemberRole(activeBoard, member.uid) ?? 'member';
            const isSelf = member.uid === user?.uid;
            const canManageRoles =
              isCollaborative && myRole === 'owner' && role !== 'owner' && !isSelf;
            // Ownership can only go to an existing Admin, not a plain
            // Member — matches transferOwnership's own check in
            // boardsSlice.js and firestore.rules' isOwnershipTransfer.
            const canTransferOwnership = canManageRoles && role === 'admin';
            const canRemove =
              isCollaborative &&
              role !== 'owner' &&
              !isSelf &&
              (myRole === 'owner' || (myRole === 'admin' && role === 'member'));
            // Self-service leave, shown only on the current user's own row.
            // Admin leaves directly; Member must request Owner/Admin
            // approval instead; Owner gets neither (unchanged — they must
            // transferOwnership or deleteCollaborativeBoard).
            const canLeaveDirect = isSelf && role === 'admin';
            const canRequestLeave = isSelf && role === 'member';

            // Same resolved-name pattern as the header's own
            // displayName/emailFallback and the comments section's
            // commenterDisplayName: fall back to the email's local-part
            // when no displayName has been set.
            const emailFallback = member.email
              ? member.email.split('@')[0]
              : member.uid;
            const memberDisplayName =
              member.displayName && member.displayName.trim() !== ''
                ? member.displayName
                : emailFallback;

            const details = rowDetails[member.uid];
            const extraDetailsText = details?.status === 'done'
              ? [details.company, details.city, details.phone].filter(Boolean).join(' · ')
              : '';

            return (
              <li
                key={member.uid}
                className="board-member-row"
                ref={member.dummyjsonId ? attachRowObserver : undefined}
                data-uid={member.uid}
                data-dummyjson-id={member.dummyjsonId ?? ''}
              >
                <span className="board-member-identity">
                  <span className="board-member-name">
                    {memberDisplayName}
                    <span className="role-badge">
                      {ROLE_LABEL[role] ?? role}
                    </span>
                    {canLeaveDirect &&
                      (confirmingLeave ? (
                        <span className="card-confirm">
                          <span>Leave this board?</span>
                          <button
                            type="button"
                            onClick={() => setConfirmingLeave(false)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={handleConfirmLeave}
                          >
                            Leave Board
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="rename-board-btn"
                          onClick={() => setConfirmingLeave(true)}
                        >
                          Leave Board
                        </button>
                      ))}
                    {canRequestLeave && (
                      <button
                        type="button"
                        className="rename-board-btn"
                        onClick={handleRequestLeave}
                      >
                        Request to Leave
                      </button>
                    )}
                  </span>
                  <span className="board-member-email">{member.email}</span>
                  {details?.status === 'loading' && (
                    <span className="board-member-extra-details">
                      Loading details&hellip;
                    </span>
                  )}
                  {details?.status === 'done' && extraDetailsText && (
                    <span className="board-member-extra-details">
                      {extraDetailsText}
                    </span>
                  )}
                </span>
                {(canManageRoles || canRemove) && (
                  <span className="board-member-actions">
                    {canManageRoles && (
                      <select
                        value={role}
                        aria-label={`Change role for ${memberDisplayName}`}
                        onChange={(e) =>
                          handleRoleChange(member.uid, e.target.value)
                        }
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    )}
                    {canTransferOwnership &&
                      (transferConfirmUid === member.uid ? (
                        <span className="card-confirm">
                          <span>Make owner?</span>
                          <button
                            type="button"
                            onClick={() => setTransferConfirmUid(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => handleConfirmTransfer(member.uid)}
                          >
                            Confirm
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setTransferConfirmUid(member.uid)}
                        >
                          Transfer Ownership
                        </button>
                      ))}
                    {canRemove && (
                      <button
                        type="button"
                        className="danger"
                        onClick={() => handleRemove(member.uid)}
                      >
                        Remove
                      </button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
          {hasMoreMembers &&
            (isLoadingMore ? (
              // Same bare "Loading…" text style already used above for the
              // member list's own initial load, for consistency.
              <li aria-live="polite">Loading more members&hellip;</li>
            ) : (
              <li ref={sentinelRef} className="board-members-sentinel" aria-hidden="true" />
            ))}
        </ul>
      )}

      {feedback && <p className="collaborative-panel-feedback">{feedback}</p>}
    </section>
  );
}

export default BoardMembers;
