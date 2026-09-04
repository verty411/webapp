// All Google API calls live here. No backend — the browser talks to Google directly.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

let tokenClient = null;
let accessToken = null;
let pending = null;

/** Wait for Google's script tag to finish loading. */
function waitForGoogle() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    let waited = 0;
    const timer = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(timer);
        resolve();
      } else if ((waited += 100) > 10000) {
        clearInterval(timer);
        reject(new Error('Google sign-in script did not load. Check your connection.'));
      }
    }, 100);
  });
}

/**
 * Opens the Google consent popup and stores the access token in memory.
 * The token lasts about an hour and is never written to disk.
 */
export async function signIn() {
  if (!CLIENT_ID) {
    throw new Error('No client ID found. Add VITE_GOOGLE_CLIENT_ID to your .env file and restart the dev server.');
  }
  await waitForGoogle();

  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          pending?.reject(new Error(response.error_description || response.error));
        } else {
          accessToken = response.access_token;
          pending?.resolve(accessToken);
        }
        pending = null;
      },
    });
  }

  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

export function signOut() {
  if (accessToken) window.google?.accounts?.oauth2?.revoke(accessToken, () => {});
  accessToken = null;
}

export function isSignedIn() {
  return Boolean(accessToken);
}

function authHeaders(extra = {}) {
  if (!accessToken) throw new Error('Signed out. Sign in with Google again.');
  return { Authorization: `Bearer ${accessToken}`, ...extra };
}

async function checkResponse(res, what) {
  if (res.ok) return res.json();
  let detail = '';
  try {
    const body = await res.json();
    detail = body.error?.message || '';
  } catch {
    /* response wasn't JSON */
  }
  if (res.status === 401) {
    accessToken = null;
    throw new Error('Your Google session expired. Sign in again.');
  }
  throw new Error(`${what} failed (${res.status}). ${detail}`);
}

/* ---------------------------------------------------------------- Drive */

/**
 * Uploads a video to the user's own Drive using a resumable session,
 * then makes it viewable by anyone with the link.
 * onProgress receives 0–100.
 */
export async function uploadVideo(file, name, onProgress) {
  const metadata = { name, mimeType: file.type || 'video/mp4' };

  const start = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(metadata),
    }
  );

  if (!start.ok) await checkResponse(start, 'Starting the upload');

  const uploadUrl = start.headers.get('Location');
  if (!uploadUrl) throw new Error('Google did not return an upload URL. Try again.');

  const file_ = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', metadata.mimeType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Upload finished but the response was unreadable.'));
        }
      } else {
        reject(new Error(`Upload failed (${xhr.status}). Check your connection and try again.`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
    xhr.send(file);
  });

  // Make the file link-viewable so family members can open it.
  const perm = await fetch(`https://www.googleapis.com/drive/v3/files/${file_.id}/permissions`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
  if (!perm.ok) await checkResponse(perm, 'Sharing the file');

  return {
    id: file_.id,
    name: file_.name,
    link: file_.webViewLink || `https://drive.google.com/file/d/${file_.id}/view`,
  };
}

/* ------------------------------------------------------------- Calendar */

/** Calendars this account can write to — includes shared family calendars. */
export async function listCalendars() {
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer',
    { headers: authHeaders() }
  );
  const data = await checkResponse(res, 'Loading your calendars');
  return (data.items || []).map((c) => ({
    id: c.id,
    name: c.summaryOverride || c.summary,
    primary: Boolean(c.primary),
  }));
}

/** Creates a 30-minute event carrying the video link. Optionally emails an invite to attendeeEmail. */
export async function createEvent({ calendarId, title, link, startsAt, notes, attendeeEmail }) {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        summary: title,
        description: [notes, link].filter(Boolean).join('\n\n'),
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        reminders: { useDefault: true },
        ...(attendeeEmail ? { attendees: [{ email: attendeeEmail }] } : {}),
      }),
    }
  );

  const event = await checkResponse(res, 'Creating the event');
  return { id: event.id, link: event.htmlLink };
}

/* ------------------------------------------------------------------ ICS */

function icsEscape(text = '') {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function icsStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Builds a .ics file entirely in the browser and downloads it.
 * Works with any calendar app — no Google account needed on the other end.
 */
export function downloadInvite({ title, link, startsAt, notes }) {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VideoShare//EN',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsEscape(title)}`,
    `DESCRIPTION:${icsEscape([notes, link].filter(Boolean).join('\n\n'))}`,
    `URL:${icsEscape(link)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[^\w -]/g, '') || 'invite'}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
