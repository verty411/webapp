// Custom groupings of friends. Just names and membership, nothing sensitive — localStorage is fine.

const KEY = 'videoshare_lists';

export function getLists() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(lists) {
  localStorage.setItem(KEY, JSON.stringify(lists));
  return lists;
}

export function addList(name) {
  const list = { id: crypto.randomUUID(), name, memberEmails: [] };
  return save([...getLists(), list]);
}

export function removeList(id) {
  return save(getLists().filter((l) => l.id !== id));
}

export function addMemberToList(id, email) {
  return save(
    getLists().map((l) =>
      l.id === id && !l.memberEmails.includes(email) ? { ...l, memberEmails: [...l.memberEmails, email] } : l
    )
  );
}

export function removeMemberFromList(id, email) {
  return save(
    getLists().map((l) => (l.id === id ? { ...l, memberEmails: l.memberEmails.filter((e) => e !== email) } : l))
  );
}

/** Called when a friend is deleted entirely, so they don't linger in old lists. */
export function removeFriendEverywhere(email) {
  return save(getLists().map((l) => ({ ...l, memberEmails: l.memberEmails.filter((e) => e !== email) })));
}
