// Storage may be disabled by site/privacy settings or unavailable after quota errors.
// UI state remains in React; a failed persistence write must not abort an order.
export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function readStoredJSON(key: string): unknown {
  try {
    return JSON.parse(readStored(key) || "null");
  } catch {
    return null;
  }
}
export function writeStored(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
export function removeStored(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* Storage may be blocked. */
  }
}
