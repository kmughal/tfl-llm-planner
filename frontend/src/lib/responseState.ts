export type ResponseState = {
  stale: boolean
  cachedAt?: string
  reason?: string
  source: "realtime" | "cached-fallback"
  disabled?: boolean
  service?: string
  error?: string
}

export function readResponseState(response: Response, body?: unknown): ResponseState {
  const stale = response.headers.get("X-Response-Stale") === "true"
  const cachedAt = response.headers.get("X-Response-Cached-At") ?? undefined
  const reason = response.headers.get("X-Response-Stale-Reason") ?? undefined
  const source = response.headers.get("X-Response-Source") === "cached-fallback" ? "cached-fallback" : "realtime"
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : null
  const disabled = payload?.disabled === true
  const service = typeof payload?.service === "string" ? payload.service : undefined
  const error = typeof payload?.error === "string" ? payload.error : undefined
  return { stale, cachedAt, reason, source, disabled, service, error }
}

export function staleLabel(state?: ResponseState | null): string {
  if (!state?.stale) return ""
  if (state.cachedAt) {
    return `Last known response from ${new Date(state.cachedAt).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })}`
  }
  return "Last known response"
}

export function responseSourceLabel(state?: ResponseState | null): string {
  return state?.source === "cached-fallback" ? "Cached fallback" : "Realtime"
}

export function responseSourceMeta(state?: ResponseState | null) {
  if (state?.disabled) {
    return {
      label: "Service disabled",
      bg: "#fef2f2",
      border: "#fecaca",
      text: "#b91c1c",
      dot: "#ef4444",
    }
  }
  if (state?.source === "cached-fallback") {
    return {
      label: "Cached fallback",
      bg: "#fff7ed",
      border: "#fed7aa",
      text: "#9a3412",
      dot: "#f59e0b",
    }
  }
  return {
    label: "Realtime",
    bg: "#ecfdf3",
    border: "#bbf7d0",
    text: "#047857",
    dot: "#22c55e",
  }
}
