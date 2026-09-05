// Saved invite contacts. Just names and emails, nothing sensitive — localStorage is fine.

const KEY = 'videoshare_friends';

export function getFriends() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addFriend(name, email, calendarIds) {
  const existing = getFriends().find((f) => f.email === email);
  const next = [
    ...getFriends().filter((f) => f.email !== email),
    { name, email, calendarIds: calendarIds ?? existing?.calendarIds ?? [] },
  ];
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

/** The calendar(s) this contact has shared with the signed-in account, picked manually on the People screen. */
export function setFriendCalendars(email, calendarIds) {
  const next = getFriends().map((f) => (f.email === email ? { ...f, calendarIds } : f));
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function removeFriend(email) {
  const next = getFriends().filter((f) => f.email !== email);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
