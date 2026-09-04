import { useEffect, useRef, useState } from 'react';
import {
  signIn,
  signOut,
  isSignedIn,
  restoreSession,
  uploadVideo,
  listCalendars,
  createEvent,
  downloadInvite,
} from './google';
import { getFriends, addFriend, removeFriend } from './friends';
import './App.css';

function defaultStart() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  // datetime-local wants local time, not UTC
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploaded, setUploaded] = useState(null);

  const [calendars, setCalendars] = useState([]);
  const [calendarId, setCalendarId] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [attendeeEmail, setAttendeeEmail] = useState('');
  const [eventLink, setEventLink] = useState(null);
  const [inviteSent, setInviteSent] = useState(false);

  const [friends, setFriends] = useState(() => getFriends());
  const [addingFriend, setAddingFriend] = useState(false);
  const [newFriendName, setNewFriendName] = useState('');
  const [newFriendEmail, setNewFriendEmail] = useState('');

  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    return () => previewUrl && URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (!restoreSession()) return;
    listCalendars()
      .then((cals) => {
        setSignedIn(true);
        setCalendars(cals);
      })
      .catch(() => {
        // Saved token turned out to be invalid (e.g. revoked elsewhere) — just stay signed out.
      });
  }, []);

  async function handleSignIn() {
    setError(null);
    try {
      await signIn();
      setSignedIn(true);
      setCalendars(await listCalendars());
    } catch (e) {
      setError(e.message);
    }
  }

  function handleSignOut() {
    signOut();
    setSignedIn(false);
    setCalendars([]);
    setUploaded(null);
    setEventLink(null);
  }

  function handlePick(e) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setFile(picked);
    setUploaded(null);
    setEventLink(null);
    setInviteSent(false);
    setProgress(0);
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(picked));
    if (!title) setTitle(`Video ${new Date().toLocaleDateString()}`);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setError(null);
    try {
      const result = await uploadVideo(file, title || file.name, setProgress);
      setUploaded(result);
    } catch (e) {
      setError(e.message);
      if (/session expired|Signed out/i.test(e.message)) setSignedIn(false);
    } finally {
      setUploading(false);
    }
  }

  async function handleAddToCalendar() {
    setError(null);
    try {
      const event = await createEvent({
        calendarId: calendarId || 'primary',
        title: title || 'Video',
        link: uploaded.link,
        startsAt,
        notes,
      });
      setEventLink(event.link);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleSendInvite() {
    setError(null);
    try {
      await createEvent({
        calendarId: calendarId || 'primary',
        title: title || 'Video',
        link: uploaded.link,
        startsAt,
        notes,
        attendeeEmail,
      });
      setInviteSent(true);
    } catch (e) {
      setError(e.message);
    }
  }

  function handleSaveFriend() {
    const name = newFriendName.trim();
    const email = newFriendEmail.trim();
    if (!name || !email) return;
    setFriends(addFriend(name, email));
    setAttendeeEmail(email);
    setInviteSent(false);
    setNewFriendName('');
    setNewFriendEmail('');
    setAddingFriend(false);
  }

  function handleRemoveFriend(email) {
    setFriends(removeFriend(email));
    if (attendeeEmail === email) setAttendeeEmail('');
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(uploaded.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const mb = file ? (file.size / 1024 / 1024).toFixed(1) : null;

  return (
    <main className="app">
      <header className="head">
        <h1>VideoShare</h1>
        {signedIn && (
          <button className="link-btn" onClick={handleSignOut}>
            Sign out
          </button>
        )}
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <ol className="steps">
        <li className={signedIn ? 'step done' : 'step'}>
          <h2>Connect your Google account</h2>
          {signedIn ? (
            <p className="quiet">Connected. Videos go to your own Drive.</p>
          ) : (
            <button className="primary" onClick={handleSignIn}>
              Sign in with Google
            </button>
          )}
        </li>

        <li className={file ? 'step done' : 'step'} aria-disabled={!signedIn}>
          <h2>Record or choose a video</h2>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            capture="environment"
            onChange={handlePick}
            hidden
          />
          <button className="primary" disabled={!signedIn} onClick={() => inputRef.current?.click()}>
            {file ? 'Record another' : 'Open camera'}
          </button>
          {previewUrl && (
            <>
              <video className="preview" src={previewUrl} controls playsInline />
              <p className="quiet">{mb} MB</p>
            </>
          )}
        </li>

        <li className={uploaded ? 'step done' : 'step'} aria-disabled={!file}>
          <h2>Upload to Drive</h2>
          <label className="field">
            Name
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sunday practice" />
          </label>
          {!uploaded && (
            <button className="primary" disabled={!file || uploading} onClick={handleUpload}>
              {uploading ? `Uploading ${progress}%` : 'Upload'}
            </button>
          )}
          {uploading && (
            <div className="bar" role="progressbar" aria-valuenow={progress}>
              <span style={{ width: `${progress}%` }} />
            </div>
          )}
          {uploaded && (
            <div className="result">
              <a href={uploaded.link} target="_blank" rel="noreferrer">
                {uploaded.link}
              </a>
              <button className="link-btn" onClick={handleCopy}>
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          )}
        </li>

        <li className="step" aria-disabled={!uploaded}>
          <h2>Share it</h2>
          <label className="field">
            When
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label className="field">
            Note
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Watch before Saturday"
            />
          </label>
          <label className="field">
            Calendar
            <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.primary ? ' (yours)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Invite by email (optional)
            <select
              value={addingFriend ? '__new__' : attendeeEmail}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  setAddingFriend(true);
                } else {
                  setAddingFriend(false);
                  setAttendeeEmail(e.target.value);
                  setInviteSent(false);
                }
              }}
            >
              <option value="">No one</option>
              {friends.map((f) => (
                <option key={f.email} value={f.email}>
                  {f.name}
                </option>
              ))}
              <option value="__new__">+ Add someone new</option>
            </select>
          </label>
          {addingFriend && (
            <div className="add-friend">
              <input
                value={newFriendName}
                onChange={(e) => setNewFriendName(e.target.value)}
                placeholder="Nickname"
              />
              <input
                type="email"
                value={newFriendEmail}
                onChange={(e) => setNewFriendEmail(e.target.value)}
                placeholder="name@example.com"
              />
              <button type="button" className="secondary" onClick={handleSaveFriend}>
                Save
              </button>
            </div>
          )}
          {attendeeEmail && !addingFriend && (
            <button type="button" className="link-btn" onClick={() => handleRemoveFriend(attendeeEmail)}>
              Forget {friends.find((f) => f.email === attendeeEmail)?.name || attendeeEmail}
            </button>
          )}
          <div className="row">
            <button className="primary" disabled={!uploaded} onClick={handleAddToCalendar}>
              Add to calendar
            </button>
            <button className="primary" disabled={!uploaded || !attendeeEmail} onClick={handleSendInvite}>
              Email invite
            </button>
            <button
              className="secondary"
              disabled={!uploaded}
              onClick={() => downloadInvite({ title, link: uploaded.link, startsAt, notes })}
            >
              Download invite
            </button>
          </div>
          {eventLink && (
            <p className="quiet">
              Added.{' '}
              <a href={eventLink} target="_blank" rel="noreferrer">
                Open the event
              </a>
            </p>
          )}
          {inviteSent && (
            <p className="quiet">
              Invite emailed to {friends.find((f) => f.email === attendeeEmail)?.name || attendeeEmail}.
            </p>
          )}
        </li>
      </ol>
    </main>
  );
}
