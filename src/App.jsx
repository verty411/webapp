import { useEffect, useRef, useState } from 'react';
import {
  signIn,
  signOut,
  restoreSession,
  uploadVideo,
  listCalendars,
  createEvent,
} from './google';
import { getFriends, addFriend, removeFriend } from './friends';
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

  const [sent, setSent] = useState(() => loadSent());
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

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

  /** The one selected friend's own calendar, when we already have write access to it. */
  function sharedCalendarFor(friend) {
    if (!friend) return null;
    return calendars.find((c) => c.id.toLowerCase() === friend.email.toLowerCase()) || null;
  }

  async function send() {
    if (!uploaded) return;
    if (audience !== 'me' && selected.length === 0) return;
    setError(null);
    try {
      const event = await createEvent({
        calendarId: sharedCal ? sharedCal.id : calendarId || 'primary',
        title: title || uploaded.name,
        link: uploaded.link,
        startsAt,
        attendeeEmails: sharedCal || audience === 'me' ? [] : selected,
        includeSelf: audience === 'both',
        recurrence: recurring || undefined,
      });
      setSent(
        saveSent([
          {
            id: uploaded.id,
            name: title || uploaded.name,
            link: uploaded.link,
            eventLink: event.link,
            to: names,
            sharedCalendar: Boolean(sharedCal),
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

  const names = audience === 'me' ? [] : friends.filter((f) => selected.includes(f.email)).map((f) => f.name);
  const soloFriend = audience === 'them' && selected.length === 1 ? friends.find((f) => f.email === selected[0]) : null;
  const sharedCal = sharedCalendarFor(soloFriend);
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
            {sent.length > 0 && <button className="link-btn" onClick={() => setScreen('library')}>All of it</button>}
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
                    {v.eventLink && <a className="link-btn" href={v.eventLink} target="_blank" rel="noreferrer">Open reminder</a>}
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
            <button className="icon-btn" onClick={() => setScreen(uploaded ? 'home' : 'home')}><Back /></button>
            <h2>Your people</h2>
          </div>
          <p className="muted" style={{ fontSize: 13.5, margin: '0 0 22px 56px' }}>
            Saved on this phone only. Nobody gets added without an email from you.
          </p>
          <div className="list" style={{ marginBottom: 22 }}>
            {friends.length === 0 && <p className="empty">No one saved yet.</p>}
            {friends.map((f, i) => (
              <div className="person" key={f.email}>
                <span className="avatar" style={avatarStyle(i)}>{f.name[0]}</span>
                <span className="person-body">
                  <strong>{f.name}</strong>
                  <span>{f.email}</span>
                </span>
                <button
                  className="forget"
                  title={`Forget ${f.name}`}
                  onClick={() => {
                    setFriends(removeFriend(f.email));
                    setSelected((s) => s.filter((e) => e !== f.email));
                  }}
                >
                  <Close />
                </button>
              </div>
            ))}
          </div>
          <div className="add-panel">
            <h3>Add someone</h3>
            <div className="stack">
              <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="What you call them" />
              <input className="input" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="their@email.com" />
              <button className="btn btn-primary" onClick={saveFriend}>Save them</button>
            </div>
          </div>
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

                <div className="when-chips" style={{ marginBottom: 18 }}>
                  <button className={audience === 'them' ? 'chip on' : 'chip'} onClick={() => setAudience('them')}>Just them</button>
                  <button className={audience === 'both' ? 'chip on' : 'chip'} onClick={() => setAudience('both')}>Them + me</button>
                  <button className={audience === 'me' ? 'chip on' : 'chip'} onClick={() => setAudience('me')}>Just me</button>
                </div>

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
                    <button className="picker" onClick={() => setScreen('people')}>
                      <span className="avatar new"><Plus /></span>
                      <b>Someone</b>
                    </button>
                  </div>
                )}

                {soloFriend && (
                  <p className="muted" style={{ fontSize: 13, margin: '-8px 0 16px' }}>
                    {sharedCal
                      ? `Found ${soloFriend.name}'s shared calendar — this goes straight there, no email needed.`
                      : `No shared calendar found for ${soloFriend.name} — we'll email them the invite instead.`}
                  </p>
                )}

                <div className="panel">
                  <div className="field-label">When</div>
                  <input
                    className="input"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    style={{ marginBottom: 12 }}
                  />
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
                    if (sharedCal) return `Added to ${who}'s shared calendar for ${when}${repeats} — no email needed.`;
                    return audience === 'both'
                      ? `${who} and you will see it on the calendar for ${when}${repeats}.`
                      : `${who} will get an emailed invite for ${when}${repeats}.`;
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
