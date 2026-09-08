// Backs up friends/lists to Drive so they survive the browser (mainly iOS
// Safari) clearing local storage for a dormant site. Local storage stays the
// fast, synchronous copy the UI reads from; Drive is the durable one.

import { findSyncFile, readSyncFile, createSyncFile, updateSyncFile } from './google';
import { getFriends, replaceFriends } from './friends';
import { getLists, replaceLists } from './lists';

const FILE_ID_KEY = 'videoshare_sync_file_id';
const UPDATED_AT_KEY = 'videoshare_sync_updated_at';

function cachedFileId() {
  return localStorage.getItem(FILE_ID_KEY) || null;
}

function localUpdatedAt() {
  return localStorage.getItem(UPDATED_AT_KEY) || null;
}

function markSynced(fileId, updatedAt) {
  localStorage.setItem(FILE_ID_KEY, fileId);
  localStorage.setItem(UPDATED_AT_KEY, updatedAt);
}

/** Pushes the current local friends/lists up to Drive, creating the file on first use. */
export async function pushToDrive() {
  const data = { updatedAt: new Date().toISOString(), friends: getFriends(), lists: getLists() };
  const usingCachedId = Boolean(cachedFileId());
  try {
    let fileId = cachedFileId() || (await findSyncFile())?.id || null;
    if (fileId) {
      await updateSyncFile(fileId, data);
    } else {
      fileId = await createSyncFile(data);
    }
    markSynced(fileId, data.updatedAt);
  } catch {
    // The cached file id may be stale (e.g. the backup was deleted from Drive) —
    // clear it so the next push re-searches instead of failing the same way forever.
    if (usingCachedId) localStorage.removeItem(FILE_ID_KEY);
    // Best effort otherwise — sync is invisible to the user, so a failure (offline,
    // expired token) just means local storage stays the working copy until the next try.
  }
}

/**
 * Runs once after sign-in. Recovers friends/lists from Drive when this
 * device's local storage is empty (e.g. iOS wiped an inactive PWA's
 * storage), or when Drive holds a newer copy than this device has seen;
 * otherwise pushes local data up so Drive stays current.
 * Returns true if local data was replaced from Drive.
 */
export async function hydrateFromDrive() {
  let file;
  try {
    file = await findSyncFile();
  } catch {
    return false;
  }

  if (!file) {
    await pushToDrive();
    return false;
  }

  let remote;
  try {
    remote = await readSyncFile(file.id);
  } catch {
    return false;
  }

  const localHasData = getFriends().length > 0 || getLists().length > 0;
  const localTime = localUpdatedAt();
  const remoteIsNewer = Boolean(remote?.updatedAt) && (!localTime || remote.updatedAt > localTime);

  if (!localHasData || remoteIsNewer) {
    replaceFriends(remote.friends || []);
    replaceLists(remote.lists || []);
    markSynced(file.id, remote.updatedAt || new Date().toISOString());
    return true;
  }

  markSynced(file.id, localTime);
  await pushToDrive();
  return false;
}
