import { useEffect, useRef, useState } from 'react';
import {
  signIn,
  signOut,
  restoreSession,
  uploadVideo,
  listCalendars,
  createEvent,
  deleteEvent,
  deleteFile,
} from './google';
import { getFriends, addFriend, removeFriend, setFriendCalendars } from './friends';
import { getLists, addList, removeList, addMemberToList, removeMemberFromList, removeFriendEverywhere } from './lists';
import './App.css';

/* -------------------------------------------------------------- helpers */

const SENT_KEY = 'videoshare_sent';

function loadSent() {
  try {
    const raw = localStorage.getItem(SENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSent(list) {
  localStorage.setItem(SENT_KEY, JSON.stringify(list.slice(0, 60)));
  return list;
}

const AVATARS = [
  ['#ffe1d0', '#643312'],
  ['#e1eecc', '#3d472b'],
  ['#dcd3c4', '#2e2b25'],
  ['#ffc6a5', '#402310'],
];

function avatarStyle(i) {
  const [background, color] = AVATARS[i % AVATARS.length];
  return { background, color };
}

function toLocalInput(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** An hour from now, on the hour — the default send time. */
function defaultStart() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return toLocalInput(d);
}

function listNames(names) {
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

/* ---------------------------------------------------------------- icons */

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.75, strokeLinecap: 'round', strokeLinejoin: 'round' };

const Camera = ({ size = 24, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} stroke={color || 'currentColor'}>
    <rect x="2" y="6" width="13" height="12" rx="3" />
    <path d="m15 11 6-3.5v9L15 13" />
  </svg>
);

const Play = ({ size = 20, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} stroke={color || 'currentColor'}>
    <path d="M9 7.5 17 12l-8 4.5z" />
  </svg>
);

const Library = ({ size = 21 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <rect x="3" y="4" width="18" height="16" rx="4" />
    <path d="M10 9.5 15 12l-5 2.5z" />
  </svg>
);

const People = ({ size = 21 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <circle cx="9" cy="8" r="4" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M17 8.5a3 3 0 0 1 0 5.5" />
  </svg>
);

const Back = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}><path d="m15 18-6-6 6-6" /></svg>
);

const Close = ({ size = 17 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}><path d="M18 6 6 18M6 6l12 12" /></svg>
);

const Plus = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}><path d="M5 12h14M12 5v14" /></svg>
);

const Check = ({ size = 24, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} stroke={color || 'currentColor'}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const Clock = ({ size = 19 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4l2.5 2" />
  </svg>
);

const Dollar = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} stroke="var(--gold)">
    <path d="M12 2v20M16.5 6.5c0-1.7-2-3-4.5-3s-4.5 1.4-4.5 3 2 2.7 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3" />
  </svg>
);

/* ------------------------------------------------------------------ app */

export default function App() {
  const [screen, setScreen] = useState('signin'); // signin | home | library | people
  const [sheet, setSheet] = useState(null); // upload | share | sent | reauth
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState(null);

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploaded, setUploaded] = useState(null);

  const [title, setTitle] = useState('');
  const [audience, setAudience] = useState('them'); // 'them' | 'both' | 'me'
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [recurring, setRecurring] = useState(''); // '' | 'WEEKLY' | 'MONTHLY'
  const [calendars, setCalendars] = useState([]);
  const [calendarId, setCalendarId] = useState('');

  const [friends, setFriends] = useState(() => getFriends());
  const [selected, setSelected] = useState([]);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [sharedCalChoices, setSharedCalChoices] = useState({}); // { [email]: calendarId }, only for contacts with >1 shared calendar

  const [lists, setLists] = useState(() => getLists());
  const [addingList, setAddingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [dragEmail, setDragEmail] = useState(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [overListId, setOverListId] = useState(null);

  const [sent, setSent] = useState(() => loadSent());
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  /** Drag a person onto a list to add them — pointer events so it works on touch, not just mouse. */
  function startDrag(email, e) {
    e.preventDefault();
    setDragEmail(email);
    setDragPos({ x: e.clientX, y: e.clientY });
  }

  useEffect(() => {
    if (!dragEmail) return;
    let overId = null;
    function onMove(e) {
      setDragPos({ x: e.clientX, y: e.clientY });
      const el = document.elementFromPoint(e.clientX, e.clientY);
      overId = el?.closest('[data-list-drop]')?.dataset.listDrop || null;
      setOverListId(overId);
    }
    function onUp() {
      if (overId) setLists(addMemberToList(overId, dragEmail));
      setDragEmail(null);
      setOverListId(null);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, [dragEmail]);

  useEffect(() => {
    if (!restoreSession()) return;
    listCalendars()
      .then((cals) => {
        setCalendars(cals);
        setScreen('home');
      })
      .catch(() => {
        // Saved token was revoked or stale — stay on sign-in.
      });
  }, []);

  /** Every Google call funnels through here so an expired hour surfaces the same way. */
  function fail(e) {
    if (/session expired|Signed out/i.test(e.message)) {
      setExpired(true);
      setSheet('reauth');
      setError(null);
    } else {
      setError(e.message);
    }
  }

  async function connect() {
    setError(null);
    try {
      await signIn();
      setCalendars(await listCalendars());
      setExpired(false);
      setScreen('home');
      setSheet(uploaded || file ? 'share' : null);
    } catch (e) {
      setError(e.message);
    }
  }

  function reset() {
    setFile(null);
    setUploaded(null);
    setProgress(0);
    setTitle('');
    setSelected([]);
    setAudience('them');
    setStartsAt(defaultStart());
    setRecurring('');
    setSharedCalChoices({});
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  function record() {
    if (expired) return setSheet('reauth');
    setError(null);
    inputRef.current?.click();
  }

  async function pick(e) {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    reset();
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
    const name = `Video ${new Date().toLocaleDateString()}`;
    setTitle(name);
    setSheet('upload');
    setProgress(0);
    try {
      const result = await uploadVideo(picked, name, setProgress);
      setUploaded(result);
      setTimeout(() => setSheet('share'), 400);
    } catch (e) {
      setSheet(null);
      fail(e);
    }
  }

  /**
   * The calendar(s) this friend shares with the signed-in account. Manually
   * assigned calendars (set on the People screen) always win; otherwise
   * falls back to matching a calendar whose id is their own email address,
   * which is how Google exposes someone's personal calendar once they've
   * shared it with you.
   */
  function sharedCalendarsFor(friend) {
    if (!friend) return [];
    const assigned = (friend.calendarIds || []).map((id) => calendars.find((c) => c.id === id)).filter(Boolean);
    if (assigned.length) return assigned;
    const auto = calendars.find((c) => c.id.toLowerCase() === friend.email.toLowerCase());
    return auto ? [auto] : [];
  }

  /**
   * Sends the video. "Just me" and "Them + me" each create a single event.
   * "Just them" routes each recipient individually: anyone with a shared
   * calendar gets the video added straight there (grouped so people who
   * share the same calendar only get one event), and everyone else is
   * bundled into a single emailed invite.
   */
  async function send() {
    if (!uploaded) return;
    if (audience !== 'me' && selected.length === 0) return;
    setError(null);
    const eventTitle = title || uploaded.name;
    try {
      const events = [];

      if (audience === 'me') {
        const usedCalendarId = calendarId || 'primary';
        const event = await createEvent({
          calendarId: usedCalendarId,
          title: eventTitle,
          link: uploaded.link,
          startsAt,
          recurrence: recurring || undefined,
        });
        events.push({ calendarId: usedCalendarId, eventId: event.id, eventLink: event.link, to: [], viaSharedCalendar: false });
      } else if (audience === 'both') {
        const usedCalendarId = calendarId || 'primary';
        const event = await createEvent({
          calendarId: usedCalendarId,
          title: eventTitle,
          link: uploaded.link,
          startsAt,
          attendeeEmails: selected,
          includeSelf: true,
          recurrence: recurring || undefined,
        });
        events.push({ calendarId: usedCalendarId, eventId: event.id, eventLink: event.link, to: names, viaSharedCalendar: false });
      } else {
        const directGroups = new Map(); // calendarId -> { calendar, names }
        const emailOnly = [];

        selected.forEach((email) => {
          const friend = friends.find((f) => f.email === email);
          if (!friend) return;
          const candidates = sharedCalendarsFor(friend);
          const chosen =
            candidates.length > 1 ? candidates.find((c) => c.id === sharedCalChoices[email]) || candidates[0] : candidates[0];
          if (chosen) {
            if (!directGroups.has(chosen.id)) directGroups.set(chosen.id, { calendar: chosen, names: [] });
            directGroups.get(chosen.id).names.push(friend.name);
          } else {
            emailOnly.push(friend);
          }
        });

        for (const { calendar, names: groupNames } of directGroups.values()) {
          const event = await createEvent({
            calendarId: calendar.id,
            title: eventTitle,
            link: uploaded.link,
            startsAt,
            recurrence: recurring || undefined,
          });
          events.push({ calendarId: calendar.id, eventId: event.id, eventLink: event.link, to: groupNames, viaSharedCalendar: true });
        }

        if (emailOnly.length > 0) {
          const usedCalendarId = calendarId || 'primary';
          const event = await createEvent({
            calendarId: usedCalendarId,
            title: eventTitle,
            link: uploaded.link,
            startsAt,
            attendeeEmails: emailOnly.map((f) => f.email),
            recurrence: recurring || undefined,
          });
          events.push({
            calendarId: usedCalendarId,
            eventId: event.id,
            eventLink: event.link,
            to: emailOnly.map((f) => f.name),
            viaSharedCalendar: false,
          });
        }
      }

      setSent(
        saveSent([
          {
            id: uploaded.id,
            name: eventTitle,
            link: uploaded.link,
            events,
            to: names,
            when: new Date(startsAt).toISOString(),
            sentAt: new Date().toISOString(),
          },
          ...sent,
        ])
      );
      setSheet('sent');
    } catch (e) {
      fail(e);
    }
  }

  /** Removes every calendar event tied to a sent video, then offers to delete the video too. */
  async function removeFromCalendar(v) {
    setError(null);
    try {
      for (const ev of v.events || []) {
        await deleteEvent(ev.calendarId, ev.eventId);
      }
      let updated = sent.map((s) => (s.id === v.id ? { ...s, events: [] } : s));
      setSent(saveSent(updated));
      if (window.confirm(`Also delete "${v.name}" from Drive? This can't be undone.`)) {
        await deleteFile(v.id);
        updated = updated.filter((s) => s.id !== v.id);
        setSent(saveSent(updated));
      }
    } catch (e) {
      fail(e);
    }
  }

  async function copy(link) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Copying failed — long-press the link instead.');
    }
  }

  function saveFriend() {
    const name = newName.trim();
    const email = newEmail.trim();
    if (!name || !email) return;
    setFriends(addFriend(name, email));
    setSelected((s) => [...s, email]);
    setNewName('');
    setNewEmail('');
    if (uploaded) setSheet('share');
  }

  function isListSelected(list) {
    return list.memberEmails.length > 0 && list.memberEmails.every((e) => selected.includes(e));
  }

  function toggleList(list) {
    if (isListSelected(list)) {
      setSelected((s) => s.filter((e) => !list.memberEmails.includes(e)));
    } else {
      setSelected((s) => [...new Set([...s, ...list.memberEmails])]);
    }
  }

  const assignableCalendars = calendars.filter((c) => !c.primary);
  const names = audience === 'me' ? [] : friends.filter((f) => selected.includes(f.email)).map((f) => f.name);
  const selectedFriends = audience === 'them' ? selected.map((email) => friends.find((f) => f.email === email)).filter(Boolean) : [];

  // Default a choice for any selected contact with more than one shared calendar and no pick yet.
  useEffect(() => {
    if (audience !== 'them') return;
    setSharedCalChoices((prev) => {
      let changed = false;
      const next = { ...prev };
      selected.forEach((email) => {
        const friend = friends.find((f) => f.email === email);
        const candidates = sharedCalendarsFor(friend);
        if (candidates.length > 1 && !candidates.some((c) => c.id === next[email])) {
          next[email] = candidates[0].id;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.join(','), audience]);

  const upcoming = sent.filter((v) => v.when && new Date(v.when) > new Date()).sort((a, b) => new Date(a.when) - new Date(b.when))[0];
  const done = progress >= 100;
  const mb = file ? (file.size / 1024 / 1024).toFixed(1) : null;

  function metaFor(v) {
    const to = v.to.length ? listNames(v.to) : 'you';
    const d = new Date(v.when);
    return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · ${to}`;
  }

  /* ------------------------------------------------------------- render */

  if (screen === 'signin') {
    return (
      <main className="app">
        <div className="signin">
          <span className="blob blob-1" />
          <span className="blob blob-2" />
          <div>
            <div className="mark"><Camera size={30} color="#f5ead8" /></div>
            <h1>Send a video. Set a time.</h1>
            <p>Record something, pick who should see it, and they get a reminder with the link attached.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn btn-primary" onClick={connect}>Continue with Google</button>
            <p className="fine">Your videos stay in your own Drive. We only ever add the ones you record here.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <input ref={inputRef} className="hidden" type="file" accept="video/*" capture="environment" onChange={pick} />

      {screen === 'home' && (
        <div className="screen">
          <div className="head">
            <div>
              <div className="kicker">{new Date().toLocaleDateString(undefined, { weekday: 'long' })}</div>
              <h2>What are we sharing?</h2>
            </div>
            <div className="head-actions">
              <button className="icon-btn" title="Library" onClick={() => setScreen('library')}><Library /></button>
              <button className="icon-btn" title="People" onClick={() => setScreen('people')}><People /></button>
            </div>
          </div>

          {error && <p className="error" role="alert">{error}</p>}

          {expired && (
            <div className="banner">
              <span className="banner-icon"><Clock /></span>
              <div className="banner-text">
                <strong>Google signed you out</strong>
                <span>It does that hourly. One tap fixes it.</span>
              </div>
              <button className="btn btn-primary btn-small" onClick={() => setSheet('reauth')}>Reconnect</button>
            </div>
          )}

          <div className="ring-wrap">
            <button className="ring" onClick={record}>
              <span><Camera size={58} color="#f5ead8" /></span>
            </button>
            <div className="ring-label">
              <b>Record something</b>
              <span>Two taps to send it on</span>
            </div>
          </div>

          {upcoming && (
            <>
              <div className="section-head"><h3>Coming up</h3></div>
              <div className="next">
                <span className="datechip">
                  <span>
                    <small>{new Date(upcoming.when).toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</small>
                    <b>{String(new Date(upcoming.when).getDate()).padStart(2, '0')}</b>
                  </span>
                </span>
                <div className="next-body">
                  <strong>{upcoming.name}</strong>
                  <span>
                    {new Date(upcoming.when).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · {listNames(upcoming.to)}
                  </span>
                </div>
              </div>
            </>
          )}

          <div className="section-head">
            <h3>Lately</h3>
            {sent.length > 0 && <button className="link-btn" onClick={() => setScreen('library')}>Options</button>}
          </div>
          {sent.length === 0 ? (
            <p className="empty">Nothing sent yet. Record something and it'll show up here.</p>
          ) : (
            <div className="list">
              {sent.slice(0, 3).map((v) => (
                <a className="row" key={v.id} href={v.link} target="_blank" rel="noreferrer">
                  <span className="thumb"><Play color="#dcd3c4" /></span>
                  <span className="row-body">
                    <strong>{v.name}</strong>
                    <span>{metaFor(v)}</span>
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {screen === 'library' && (
        <div className="screen">
          <div className="back-head">
            <button className="icon-btn" onClick={() => setScreen('home')}><Back /></button>
            <h2>Everything sent</h2>
          </div>
          {sent.length === 0 ? (
            <p className="empty">Your sent videos will collect here.</p>
          ) : (
            <div className="list">
              {sent.map((v) => (
                <div className="card" key={v.id}>
                  <div className="thumb"><Play size={30} color="#dcd3c4" /></div>
                  <strong>{v.name}</strong>
                  <span>{metaFor(v)}</span>
                  <div className="card-links">
                    <a className="link-btn" href={v.link} target="_blank" rel="noreferrer">Open video</a>
                    {(v.events || []).map((ev) => (
                      <a key={ev.eventId} className="link-btn" href={ev.eventLink} target="_blank" rel="noreferrer">
                        Open {ev.to.length ? listNames(ev.to) : 'reminder'}
                      </a>
                    ))}
                    {(v.events || []).length > 0 && (
                      <button className="link-btn" onClick={() => removeFromCalendar(v)}>Remove from calendar</button>
                    )}
                    <button className="link-btn" onClick={() => copy(v.link)}>{copied ? 'Copied' : 'Copy link'}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {screen === 'people' && (
        <div className="screen">
          <div className="back-head">
            <button className="icon-btn" onClick={() => { setScreen('home'); if (uploaded) setSheet('share'); }}><Back /></button>
            <h2>Your people</h2>
          </div>
          <p className="muted" style={{ fontSize: 13.5, margin: '0 0 22px 56px' }}>
            Saved on this phone only. Nobody gets added without an email from you. Drag someone
            onto a list below to group them.
          </p>

          <div className="section-head"><h3>Lists</h3></div>
          <div className="list" style={{ marginBottom: 14 }}>
            {lists.length === 0 && <p className="empty">No lists yet — drag someone below onto one to make it.</p>}
            {lists.map((l) => (
              <div key={l.id} className={overListId === l.id ? 'listgroup over' : 'listgroup'} data-list-drop={l.id}>
                <div className="listgroup-head">
                  <span className="listgroup-title">
                    <Dollar />
                    {l.name}
                  </span>
                  <button className="forget" title={`Delete ${l.name}`} onClick={() => setLists(removeList(l.id))}>
                    <Close size={14} />
                  </button>
                </div>
                {l.memberEmails.length === 0 ? (
                  <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Drop someone here</p>
                ) : (
                  <div className="listgroup-members">
                    {l.memberEmails.map((email) => {
                      const f = friends.find((fr) => fr.email === email);
                      if (!f) return null;
                      return (
                        <span className="member-chip" key={email}>
                          {f.name}
                          <button
                            aria-label={`Remove ${f.name} from ${l.name}`}
                            onClick={() => setLists(removeMemberFromList(l.id, email))}
                          >
                            <Close size={10} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {addingList ? (
            <div className="add-friend" style={{ marginBottom: 22 }}>
              <input
                className="input"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="List name"
              />
              <button
                className="btn btn-primary btn-small"
                onClick={() => {
                  const name = newListName.trim();
                  if (!name) return;
                  setLists(addList(name));
                  setNewListName('');
                  setAddingList(false);
                }}
              >
                Create
              </button>
            </div>
          ) : (
            <button className="link-btn" style={{ marginBottom: 22 }} onClick={() => setAddingList(true)}>+ New list</button>
          )}

          <div className="section-head"><h3>Everyone</h3></div>
          <div className="list" style={{ marginBottom: 22 }}>
            {friends.length === 0 && <p className="empty">No one saved yet.</p>}
            {friends.map((f, i) => {
              const friendCalIds = f.calendarIds || [];
              return (
                <div key={f.email}>
                  <div
                    className="person"
                    onPointerDown={(e) => startDrag(f.email, e)}
                    style={{ touchAction: 'none', opacity: dragEmail === f.email ? 0.4 : 1 }}
                  >
                    <span className="avatar" style={avatarStyle(i)}>{f.name[0]}</span>
                    <span className="person-body">
                      <strong>{f.name}</strong>
                      <span>{f.email}</span>
                    </span>
                    <button
                      className="forget"
                      title={`Forget ${f.name}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        setFriends(removeFriend(f.email));
                        setLists(removeFriendEverywhere(f.email));
                        setSelected((s) => s.filter((e) => e !== f.email));
                      }}
                    >
                      <Close />
                    </button>
                  </div>
                  {assignableCalendars.length > 0 && (
                    <div style={{ margin: '8px 0 14px 56px' }}>
                      <div className="field-label" style={{ margin: '0 0 6px' }}>Shared calendar</div>
                      <div className="cal-chip-row">
                        {assignableCalendars.map((c) => {
                          const auto = !friendCalIds.length && c.id.toLowerCase() === f.email.toLowerCase();
                          return (
                            <button
                              key={c.id}
                              className={friendCalIds.includes(c.id) ? 'chip chip-sm on' : 'chip chip-sm'}
                              onClick={() => {
                                const next = friendCalIds.includes(c.id)
                                  ? friendCalIds.filter((id) => id !== c.id)
                                  : [...friendCalIds, c.id];
                                setFriends(setFriendCalendars(f.email, next));
                              }}
                            >
                              {c.name}
                              {auto ? ' (auto)' : ''}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="add-panel">
            <h3>Add someone</h3>
            <div className="stack">
              <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="What you call them" />
              <input className="input" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="their@email.com" />
              <button className="btn btn-primary" onClick={saveFriend}>Save them</button>
            </div>
          </div>

          {dragEmail && (
            <div className="drag-ghost" style={{ left: dragPos.x, top: dragPos.y }}>
              {friends.find((f) => f.email === dragEmail)?.name}
            </div>
          )}
        </div>
      )}

      {sheet && (
        <div className="scrim" role="dialog" aria-modal="true">
          <div className="sheet">
            <div className="grab" />

            {sheet === 'upload' && (
              <div>
                <h2>{done ? 'Up it went' : 'Sending it up'}</h2>
                <p>{done ? "Link's ready — who should see it?" : 'Keep the app open until this finishes.'}</p>
                <div className="upload-row">
                  <span className="thumb">
                    {previewUrl ? <video src={previewUrl} muted playsInline /> : <Play color="#dcd3c4" />}
                  </span>
                  <div className="body">
                    <strong>{title}</strong>
                    <span className="muted" style={{ fontSize: 12.5 }}>
                      {done ? `${mb} MB · in your Drive` : `${progress}% of ${mb} MB`}
                    </span>
                    <div className="bar"><span style={{ width: `${progress}%` }} /></div>
                  </div>
                </div>
                <button className="btn btn-secondary" onClick={() => { setSheet(null); reset(); }}>Cancel</button>
              </div>
            )}

            {sheet === 'share' && (
              <div>
                <h2>Who's it for?</h2>
                <p>It's up in your Drive. Pick where this goes and when.</p>
                {error && <p className="error" role="alert">{error}</p>}

                <div className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Play size={13} color="var(--muted)" />
                  Name Video (optional)
                </div>
                <input
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Name this video"
                  style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}
                />
                <p className="muted" style={{ fontSize: 12.5, margin: '0 0 18px' }}>
                  This name is what shows up everywhere it's listed in the app — on the calendar
                  event and in your Lately list — so make it something that's clear at a glance.
                </p>

                <div className="when-chips" style={{ marginBottom: 18 }}>
                  <button className={audience === 'them' ? 'chip on' : 'chip'} onClick={() => setAudience('them')}>Send To...</button>
                  <button className={audience === 'me' ? 'chip on' : 'chip'} onClick={() => setAudience('me')}>Send To Me</button>
                  <button className={audience === 'both' ? 'chip on' : 'chip'} onClick={() => setAudience('both')}>Send To Me And...</button>
                </div>

                {audience !== 'me' && lists.length > 0 && (
                  <div className="cal-chip-row" style={{ marginBottom: 10 }}>
                    {lists.map((l) => (
                      <button
                        key={l.id}
                        className={isListSelected(l) ? 'chip chip-sm on' : 'chip chip-sm'}
                        onClick={() => toggleList(l)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Dollar size={11} />
                        {l.name}
                      </button>
                    ))}
                  </div>
                )}

                {audience !== 'me' && (
                  <div className="pickers">
                    {friends.map((f, i) => {
                      const on = selected.includes(f.email);
                      return (
                        <button
                          key={f.email}
                          className={on ? 'picker on' : 'picker'}
                          onClick={() => setSelected(on ? selected.filter((e) => e !== f.email) : [...selected, f.email])}
                        >
                          <span className="avatar" style={avatarStyle(i)}>
                            {f.name[0]}
                            {on && <span className="tick"><Check size={11} color="#f0fae1" /></span>}
                          </span>
                          <b>{f.name}</b>
                        </button>
                      );
                    })}
                    <button className="picker" onClick={() => { setSheet(null); setScreen('people'); }}>
                      <span className="avatar new"><Plus /></span>
                      <b>Someone</b>
                    </button>
                  </div>
                )}

                {audience === 'them' && selectedFriends.length > 0 && (
                  <div style={{ margin: '-6px 0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {selectedFriends.map((f) => {
                      const candidates = sharedCalendarsFor(f);
                      return (
                        <div key={f.email}>
                          <p className="muted" style={{ fontSize: 13, fontWeight: 600, margin: '0 0 5px' }}>{f.name}</p>
                          {candidates.length === 0 && (
                            <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                              No shared calendars found (reminder sent by email)
                            </p>
                          )}
                          {candidates.length === 1 && (
                            <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                              Goes straight to their "{candidates[0].name}" calendar — no email needed.
                            </p>
                          )}
                          {candidates.length > 1 && (
                            <select
                              className="input"
                              value={sharedCalChoices[f.email] || candidates[0].id}
                              onChange={(e) => setSharedCalChoices((prev) => ({ ...prev, [f.email]: e.target.value }))}
                            >
                              {candidates.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="panel">
                  <div className="field-label">When</div>
                  <div className="input dt-wrap" style={{ marginBottom: 12 }}>
                    <input
                      type="datetime-local"
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                    />
                  </div>
                  <select className="input" value={recurring} onChange={(e) => setRecurring(e.target.value)}>
                    <option value="">Doesn't repeat</option>
                    <option value="WEEKLY">Every week</option>
                    <option value="MONTHLY">Every month</option>
                  </select>
                  {audience !== 'them' && calendars.length > 1 && (
                    <select
                      className="input"
                      value={calendarId}
                      onChange={(e) => setCalendarId(e.target.value)}
                      style={{ marginTop: 9 }}
                    >
                      {calendars.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}{c.primary ? ' (yours)' : ''}</option>
                      ))}
                    </select>
                  )}
                </div>

                <button className="btn btn-primary" disabled={audience !== 'me' && selected.length === 0} onClick={send}>
                  {audience !== 'me' && selected.length === 0 ? 'Pick someone first' : 'Send'}
                </button>
              </div>
            )}

            {sheet === 'sent' && (
              <div className="sheet-center">
                <div className="big-icon sage"><Check size={42} color="#56633f" /></div>
                <h2>Off it goes</h2>
                <p className="muted">
                  {(() => {
                    const when = new Date(startsAt).toLocaleString(undefined, {
                      weekday: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    });
                    const repeats = recurring ? `, repeating ${recurring === 'WEEKLY' ? 'weekly' : 'monthly'}` : '';
                    if (audience === 'me') return `It's on your calendar for ${when}${repeats}.`;
                    const who = listNames(names) || 'They';
                    if (audience === 'both') return `${who} and you will see it on the calendar for ${when}${repeats}.`;

                    const lastEvents = sent[0]?.events || [];
                    const direct = lastEvents.filter((e) => e.viaSharedCalendar);
                    const emailed = lastEvents.filter((e) => !e.viaSharedCalendar);
                    const parts = [];
                    if (direct.length) {
                      const directNames = listNames(direct.flatMap((e) => e.to));
                      parts.push(`added straight to ${directNames}'s shared calendar${direct.reduce((n, e) => n + e.to.length, 0) > 1 ? 's' : ''}`);
                    }
                    if (emailed.length) parts.push(`emailed an invite to ${listNames(emailed.flatMap((e) => e.to))}`);
                    return `${parts.join(', and ')} for ${when}${repeats}.`;
                  })()}
                </p>
                <div className="sheet-actions">
                  <button className="btn btn-primary" onClick={() => { setSheet(null); reset(); }}>Back home</button>
                </div>
              </div>
            )}

            {sheet === 'reauth' && (
              <div className="sheet-center">
                <div className="big-icon clay"><Clock size={40} /></div>
                <h2>Reconnect to Google</h2>
                <p className="muted">
                  Google's sign-in only lasts an hour. Nothing was lost — your video and the people you picked are still here.
                </p>
                {error && <p className="error" role="alert">{error}</p>}
                <div className="sheet-actions">
                  <button className="btn btn-primary" onClick={connect}>Continue with Google</button>
                  <button className="btn btn-secondary" onClick={() => setSheet(uploaded ? 'share' : null)}>Not now</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {screen !== 'signin' && screen === 'home' && (
        <div style={{ padding: '0 24px 32px', textAlign: 'center' }}>
          <button className="link-btn" onClick={() => { signOut(); reset(); setScreen('signin'); }}>Sign out</button>
        </div>
      )}
    </main>
  );
}
