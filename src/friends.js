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

export function addFriend(name, email) {
  const next = [...getFriends().filter((f) => f.email !== email), { name, email }];
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function removeFriend(email) {
  const next = getFriends().filter((f) => f.email !== email);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
