const SESSION_KEY = "rail-live-session-id"

/** Returns the stable per-user session ID, creating one on first call. */
export function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, id)
  }
  return id
}

/** Clears the current session ID so the next call to getSessionId() creates a new one. */
export function resetSessionId(): void {
  localStorage.removeItem(SESSION_KEY)
}
