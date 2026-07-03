'use strict';

const ONLINE_TTL_MS = 30_000; // a user is "online" if seen within the last 30s

/**
 * In-memory presence store: userId -> { username, lastSeen }
 * Kept as a plain class so it's trivially unit-testable without Redis.
 */
class PresenceStore {
  constructor(now = () => Date.now()) {
    this.users = new Map();
    this.now = now;
  }

  markOnline(userId, username) {
    this.users.set(userId, { username, lastSeen: this.now() });
  }

  markOffline(userId) {
    this.users.delete(userId);
  }

  isOnline(userId) {
    const entry = this.users.get(userId);
    if (!entry) return false;
    return this.now() - entry.lastSeen < ONLINE_TTL_MS;
  }

  getOnlineUsers() {
    const result = [];
    for (const [userId, entry] of this.users.entries()) {
      if (this.now() - entry.lastSeen < ONLINE_TTL_MS) {
        result.push({ userId, username: entry.username });
      }
    }
    return result;
  }

  sweepStale() {
    for (const [userId, entry] of this.users.entries()) {
      if (this.now() - entry.lastSeen >= ONLINE_TTL_MS) {
        this.users.delete(userId);
      }
    }
  }
}

module.exports = { PresenceStore, ONLINE_TTL_MS };
