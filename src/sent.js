// History of videos sent — what was recorded, who it went to, and the
// calendar events tied to it. Local cache only; the durable copy lives in
// Drive via sync.js, same as friends/lists.

const KEY = 'videoshare_sent';
const MAX = 60;

export function getSent() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSent(list) {
  const next = list.slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

/** Overwrites the whole list — used to restore a backup pulled from Drive. */
export function replaceSent(list) {
  return saveSent(list);
}
