import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { readResponseState, responseSourceMeta, staleLabel, type ResponseState } from "../lib/responseState"

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8080"

export type ProjectionBookingClassTotal = {
  serviceClass: string
  count: number
}

export type ProjectionBookingFlow = {
  originCode: string
  originShort: string
  destCode: string
  destShort: string
  serviceClass: string
  count: number
}

export type ProjectionBookingSummary = {
  projectionEnabled: boolean
  date: string
  count: number
  totalBookings: number
  classTotals: ProjectionBookingClassTotal[]
  topFlows: ProjectionBookingFlow[]
}

export type ProjectionNewsItem = {
  id: string
  department: string
  category: string
  publishedAt: string
  updatedAt: string
}

export type ProjectionNewsSummary = {
  projectionEnabled: boolean
  department?: string
  category?: string
  count: number
  items: ProjectionNewsItem[]
}

export type ProjectionBeaconEvent = {
  stopCode: string
  shortCode: string
  stopName: string
  eventType: string
  actualTime: string
  isCorrection: boolean
  source: string
}

export type ProjectionBeaconSummary = {
  projectionEnabled: boolean
  date: string
  beacons: {
    count: number
    pathwayCount: number
    latest?: ProjectionBeaconEvent | null
  }
}

export type ProjectionJourneyBooking = {
  originCode?: string
  originShort?: string
  destCode?: string
  destShort?: string
  serviceClass: string
  count: number
}

export type ProjectionJourneyCoupling = {
  fromCode: string
  fromShort: string
  toCode: string
  toShort: string
}

export type ProjectionJourneyEvent = {
  stopCode: string
  shortCode: string
  stopName: string
  eventType: string
  actualTime: string
  isCorrection: boolean
  source: string
}

export type ProjectionJourneyDetail = {
  projectionEnabled: boolean
  date: string
  service: {
    serviceNumber: string
    serviceDate: string
    status: string
  }
  beacons: ProjectionJourneyEvent[]
  gps: ProjectionJourneyEvent[]
  bookings: ProjectionJourneyBooking[]
  couplings?: ProjectionJourneyCoupling[]
  news?: ProjectionNewsItem[]
}

export type ProjectionSnapshot = {
  bookings: ProjectionBookingSummary | null
  beacons: ProjectionBeaconSummary | null
  news: ProjectionNewsSummary | null
  journey: ProjectionJourneyDetail | null
}

type NoticeTone = {
  accent: string
  surface: string
  border: string
}

type SnapshotOptions = {
  date?: string
  enabled?: boolean
  serviceNumber?: string | null
}

type ProjectionFetchResult<T> = {
  body: T | null
  responseState: ResponseState | null
  error?: string
}

export type ProjectionSnapshotHealth = {
  loading: boolean
  refreshing: boolean
  stale: boolean
  disabled: boolean
  hasError: boolean
  label: string
  detail: string
  responseStates: ResponseState[]
  error?: string
}

type ProjectionHealthSummaryOptions = {
  responseStates?: ResponseState[]
  loading?: boolean
  hasLoadedOnce?: boolean
  error?: string | null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object"
}

async function readProjectionBody<T>(url: string, signal: AbortSignal): Promise<ProjectionFetchResult<T>> {
  const response = await fetch(url, { signal })
  const body = await response.json().catch(() => null)
  const responseState = readResponseState(response, body)

  if (!response.ok) {
    return {
      body: null,
      responseState,
      error: (isObject(body) && typeof body.error === "string") ? body.error : `HTTP ${response.status}`,
    }
  }

  if (!isObject(body)) {
    return { body: null, responseState, error: "Projection response was empty" }
  }

  if ("projectionEnabled" in body && body.projectionEnabled === false) {
    return { body: null, responseState: { ...responseState, disabled: true }, error: "Projection layer is disabled" }
  }

  return { body: body as T, responseState }
}

export function bookingClassLabel(serviceClass: string): string {
  switch (serviceClass) {
    case "SERVICE_CLASS_STANDARD":
      return "Standard"
    case "SERVICE_CLASS_PLUS":
      return "Plus"
    case "SERVICE_CLASS_PREMIER":
      return "Premier"
    default:
      return serviceClass
        .replace("SERVICE_CLASS_", "")
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, char => char.toUpperCase())
  }
}

function readableEnum(value: string, prefixes: string[]): string {
  const stripped = prefixes.reduce((text, prefix) => text.replace(prefix, ""), value || "")
  const normalized = stripped
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase())
    .trim()
  return normalized || "Operational Notice"
}

export function projectionNewsDepartmentLabel(value: string): string {
  return readableEnum(value, ["PUBLISHER_DEPARTMENT_"])
}

export function projectionNewsCategoryLabel(value: string): string {
  return readableEnum(value, ["INTERNAL_NEWS_CATEGORY_"])
}

export function projectionNoticeTone(category: string): NoticeTone {
  const key = category.toUpperCase()
  if (key.includes("SENSITIVE") || key.includes("FRAGILE")) {
    return {
      accent: "#c2410c",
      surface: "rgba(255,237,213,0.92)",
      border: "rgba(251,146,60,0.28)",
    }
  }
  if (key.includes("DISRUPT") || key.includes("ALERT") || key.includes("SECURITY")) {
    return {
      accent: "#b91c1c",
      surface: "rgba(254,226,226,0.92)",
      border: "rgba(248,113,113,0.26)",
    }
  }
  return {
    accent: "#1d4ed8",
    surface: "rgba(219,234,254,0.92)",
    border: "rgba(96,165,250,0.24)",
  }
}

function fmtTime(value?: string): string {
  if (!value) return "—"
  try {
    return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  } catch {
    return value
  }
}

function journeyBookingTotal(bookings: ProjectionJourneyBooking[]): number {
  return bookings.reduce((sum, booking) => sum + booking.count, 0)
}

function journeyBookingClassTotals(bookings: ProjectionJourneyBooking[]): ProjectionBookingClassTotal[] {
  const totals = new Map<string, number>()
  for (const booking of bookings) {
    totals.set(booking.serviceClass, (totals.get(booking.serviceClass) ?? 0) + booking.count)
  }
  return [...totals.entries()]
    .map(([serviceClass, count]) => ({ serviceClass, count }))
    .sort((a, b) => b.count - a.count)
}

function latestJourneyMovement(journey: ProjectionJourneyDetail | null): ProjectionJourneyEvent | null {
  if (!journey) return null
  return [...journey.gps, ...journey.beacons]
    .filter(event => !!event.actualTime)
    .sort((a, b) => a.actualTime.localeCompare(b.actualTime))
    .at(-1) ?? null
}

function hasSnapshot(snapshot: ProjectionSnapshot | null): boolean {
  if (!snapshot) return false
  return !!snapshot.bookings || !!snapshot.beacons || !!snapshot.news || !!snapshot.journey
}

export function useProjectionSnapshot({ date, enabled = true, serviceNumber }: SnapshotOptions) {
  const [snapshot, setSnapshot] = useState<ProjectionSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [responseStates, setResponseStates] = useState<ResponseState[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  useEffect(() => {
    if (!enabled || !date) {
      setSnapshot(null)
      setLoading(false)
      setResponseStates([])
      setError(null)
      setHasLoadedOnce(false)
      return
    }

    const controller = new AbortController()
    let intervalId: ReturnType<typeof setInterval> | null = null

    const load = () => {
      setLoading(true)

      const requests: Promise<ProjectionFetchResult<unknown>>[] = [
        readProjectionBody<ProjectionBookingSummary>(`${API_BASE}/api/eurostar/projection/bookings?date=${date}`, controller.signal),
        readProjectionBody<ProjectionBeaconSummary>(`${API_BASE}/api/eurostar/projection/beacons?date=${date}`, controller.signal),
        readProjectionBody<ProjectionNewsSummary>(`${API_BASE}/api/eurostar/projection/news`, controller.signal),
      ]

      if (serviceNumber) {
        requests.push(readProjectionBody<ProjectionJourneyDetail>(`${API_BASE}/api/eurostar/projection/journeys/${date}/${serviceNumber}`, controller.signal))
      }

      Promise.allSettled(requests)
        .then(results => {
          if (controller.signal.aborted) return

          const settled = results.map(result => result.status === "fulfilled" ? result.value : { body: null, responseState: null, error: "Projection request failed" })
          const [bookingsRes, beaconsRes, newsRes, journeyRes] = settled
          const next: ProjectionSnapshot = {
            bookings: (bookingsRes?.body as ProjectionBookingSummary | null) ?? null,
            beacons: (beaconsRes?.body as ProjectionBeaconSummary | null) ?? null,
            news: (newsRes?.body as ProjectionNewsSummary | null) ?? null,
            journey: (journeyRes?.body as ProjectionJourneyDetail | null) ?? null,
          }

          const nextResponseStates = settled.flatMap(result => result.responseState ? [result.responseState] : [])
          const nextError = settled.find(result => result.error)?.error ?? null

          setSnapshot(hasSnapshot(next) ? next : null)
          setResponseStates(nextResponseStates)
          setError(nextError)
          setHasLoadedOnce(true)
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }

    load()
    intervalId = setInterval(load, 30_000)

    return () => {
      controller.abort()
      if (intervalId) clearInterval(intervalId)
    }
  }, [date, enabled, serviceNumber])

  const health = useMemo(
    () => summarizeProjectionHealth({ responseStates, loading, hasLoadedOnce, error }),
    [error, hasLoadedOnce, loading, responseStates],
  )

  return { snapshot, loading, responseStates, error, health }
}

export function summarizeProjectionHealth({
  responseStates = [],
  loading = false,
  hasLoadedOnce = false,
  error = null,
}: ProjectionHealthSummaryOptions): ProjectionSnapshotHealth {
  const disabled = responseStates.some(state => state.disabled)
  const stale = responseStates.some(state => state.stale)
  const stateWithMeta = responseStates.find(state => state.disabled) ?? responseStates.find(state => state.stale) ?? responseStates[0] ?? null
  const sourceMeta = responseSourceMeta(stateWithMeta)
  const refreshing = loading && hasLoadedOnce
  const hasError = !!error && !disabled

  if (disabled) {
    return {
      loading,
      refreshing,
      stale,
      disabled: true,
      hasError: true,
      label: "Projection disabled",
      detail: stateWithMeta?.error || error || "Projection endpoints are turned off.",
      responseStates,
      error: stateWithMeta?.error || error || undefined,
    }
  }

  if (hasError && responseStates.length === 0) {
    return {
      loading,
      refreshing,
      stale,
      disabled: false,
      hasError: true,
      label: "Projection error",
      detail: error || "Projection feeds could not be reached.",
      responseStates,
      error: error || undefined,
    }
  }

  if (stale) {
    return {
      loading,
      refreshing,
      stale: true,
      disabled: false,
      hasError: !!error,
      label: "Projection stale",
      detail: staleLabel(stateWithMeta) || "Projection is showing the last known snapshot.",
      responseStates,
      error: error || undefined,
    }
  }

  if (refreshing) {
    return {
      loading,
      refreshing: true,
      stale: false,
      disabled: false,
      hasError: false,
      label: "Refreshing projection",
      detail: "Projection endpoints are refreshing in the background.",
      responseStates,
    }
  }

  if (loading) {
    return {
      loading: true,
      refreshing: false,
      stale: false,
      disabled: false,
      hasError: false,
      label: "Loading projection",
      detail: "Waiting for projection bookings, beacons, and notices.",
      responseStates,
    }
  }

  return {
    loading: false,
    refreshing: false,
    stale: false,
    disabled: false,
    hasError: false,
    label: sourceMeta.label === "Realtime" ? "Projection live" : sourceMeta.label,
    detail: error ? `Projection recovered, but one endpoint reported: ${error}` : "Projection feed is live and current.",
    responseStates,
    error: error || undefined,
  }
}

export function ProjectionHealthBanner({
  health,
  tone = "light",
  heading = "Projection Health",
}: {
  health: ProjectionSnapshotHealth
  tone?: "light" | "dark"
  heading?: string
}) {
  const palette = cardTone(tone)
  const accent = health.disabled ? "#f87171" : health.stale ? "#fbbf24" : health.hasError ? "#fb7185" : "#4ade80"
  const border = health.disabled ? "rgba(248,113,113,0.24)" : health.stale ? "rgba(251,191,36,0.24)" : health.hasError ? "rgba(251,113,133,0.24)" : "rgba(74,222,128,0.22)"
  const bg = tone === "dark"
    ? (health.disabled ? "rgba(127,29,29,0.16)" : health.stale ? "rgba(120,53,15,0.18)" : health.hasError ? "rgba(127,29,29,0.14)" : "rgba(6,95,70,0.16)")
    : (health.disabled ? "rgba(254,242,242,0.95)" : health.stale ? "rgba(255,247,237,0.96)" : health.hasError ? "rgba(255,241,242,0.96)" : "rgba(240,253,244,0.96)")

  return (
    <div className="rounded-2xl border px-4 py-3" style={{ background: bg, borderColor: border }}>
      <div className="flex flex-wrap items-center gap-3">
        <motion.span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: accent,
            boxShadow: `0 0 0 6px ${accent}22`,
          }}
          animate={health.loading ? { opacity: [0.35, 1, 0.35], scale: [0.95, 1.08, 0.95] } : { opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, repeat: health.loading ? Infinity : 0, ease: "easeInOut" }}
        />
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: palette.label }}>
            {heading}
          </div>
          <div className="mt-1 text-sm font-semibold" style={{ color: palette.text }}>
            {health.label}
          </div>
        </div>
        <div className="ml-auto max-w-2xl text-xs" style={{ color: palette.subtext }}>
          {health.detail}
        </div>
      </div>
    </div>
  )
}

function cardTone(tone: "dark" | "light") {
  return tone === "dark"
    ? {
        shell: "rgba(9,15,28,0.94)",
        border: "rgba(255,255,255,0.08)",
        label: "#93c5fd",
        text: "#f8fafc",
        subtext: "#94a3b8",
        chipBg: "rgba(255,255,255,0.06)",
        chipBorder: "rgba(255,255,255,0.09)",
      }
    : {
        shell: "linear-gradient(135deg, #f8fbff 0%, #eef4ff 100%)",
        border: "rgba(37,99,235,0.12)",
        label: "#1d4ed8",
        text: "#0f172a",
        subtext: "#475569",
        chipBg: "rgba(255,255,255,0.84)",
        chipBorder: "rgba(148,163,184,0.22)",
      }
}

export function ProjectionSignalBanner({
  snapshot,
  tone = "dark",
  heading = "Projection Layer",
}: {
  snapshot: ProjectionSnapshot | null
  tone?: "dark" | "light"
  heading?: string
}) {
  const palette = cardTone(tone)
  const journey = snapshot?.journey ?? null
  const bookingTotal = journey ? journeyBookingTotal(journey.bookings) : (snapshot?.bookings?.totalBookings ?? 0)
  const classTotals = journey ? journeyBookingClassTotals(journey.bookings) : (snapshot?.bookings?.classTotals ?? [])
  const latestMovement = journey ? latestJourneyMovement(journey) : (snapshot?.beacons?.beacons.latest ?? null)
  const beaconCount = journey ? journey.beacons.length : (snapshot?.beacons?.beacons.count ?? 0)
  const gpsCount = journey?.gps.length ?? 0
  const noticeItems = journey?.news?.length ? journey.news : (snapshot?.news?.items ?? [])
  const topFlows = snapshot?.bookings?.topFlows ?? []

  if (!snapshot) return null

  return (
    <div
      className="rounded-2xl border px-4 py-3"
      style={{ background: palette.shell, borderColor: palette.border }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: palette.label }}>
            {heading}
          </div>
          <div className="mt-1 text-sm font-semibold" style={{ color: palette.text }}>
            {journey ? "Projection-only service detail is live on this surface." : "Seats, beacons, and notices from the projection feed."}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <div className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ background: palette.chipBg, borderColor: palette.chipBorder, color: palette.text }}>
            Seats {bookingTotal.toLocaleString("en-GB")}
          </div>
          <div className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ background: palette.chipBg, borderColor: palette.chipBorder, color: palette.text }}>
            Beacons {beaconCount.toLocaleString("en-GB")}
          </div>
          {journey && (
            <div className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ background: palette.chipBg, borderColor: palette.chipBorder, color: palette.text }}>
              GPS {gpsCount.toLocaleString("en-GB")}
            </div>
          )}
          <div className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ background: palette.chipBg, borderColor: palette.chipBorder, color: palette.text }}>
            Notices {noticeItems.length.toLocaleString("en-GB")}
          </div>
          {journey?.couplings?.length ? (
            <div className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ background: palette.chipBg, borderColor: palette.chipBorder, color: palette.text }}>
              Couplings {journey.couplings.length}
            </div>
          ) : null}
        </div>
      </div>

      {classTotals.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {classTotals.slice(0, 4).map(classTotal => (
            <div
              key={classTotal.serviceClass}
              className="rounded-full border px-3 py-1 text-xs font-semibold"
              style={{ background: palette.chipBg, borderColor: palette.chipBorder, color: palette.text }}
            >
              {bookingClassLabel(classTotal.serviceClass)} {classTotal.count}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="rounded-2xl border px-3 py-2.5" style={{ background: palette.chipBg, borderColor: palette.chipBorder }}>
          <div className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: palette.subtext }}>
            Latest movement
          </div>
          {latestMovement ? (
            <>
              <div className="mt-1 text-sm font-semibold" style={{ color: palette.text }}>
                {latestMovement.stopName || latestMovement.shortCode || latestMovement.stopCode}
              </div>
              <div className="mt-1 text-xs" style={{ color: palette.subtext }}>
                {latestMovement.eventType} · {fmtTime(latestMovement.actualTime)} · {latestMovement.source}
              </div>
            </>
          ) : (
            <div className="mt-1 text-xs" style={{ color: palette.subtext }}>
              No live movement event exposed by the projection feed yet.
            </div>
          )}
        </div>

        <div className="rounded-2xl border px-3 py-2.5" style={{ background: palette.chipBg, borderColor: palette.chipBorder }}>
          <div className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: palette.subtext }}>
            Projection noticeboard
          </div>
          {noticeItems.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-2">
              {noticeItems.slice(0, 3).map(item => (
                <div
                  key={item.id}
                  className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: palette.shell, borderColor: palette.chipBorder, color: palette.text }}
                >
                  {projectionNewsDepartmentLabel(item.department || "Ops")} · {projectionNewsCategoryLabel(item.category || "Notice")}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-1 text-xs" style={{ color: palette.subtext }}>
              No active projection notices right now.
            </div>
          )}
        </div>
      </div>

      {!journey && topFlows.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {topFlows.slice(0, 3).map(flow => (
            <div
              key={`${flow.originShort}-${flow.destShort}-${flow.serviceClass}`}
              className="rounded-full border px-3 py-1 text-[11px] font-semibold"
              style={{ background: palette.chipBg, borderColor: palette.chipBorder, color: palette.subtext }}
            >
              {flow.originShort || flow.originCode} → {flow.destShort || flow.destCode} · {bookingClassLabel(flow.serviceClass)} {flow.count}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ProjectionServiceInsightCard({
  snapshot,
}: {
  snapshot: ProjectionSnapshot | null
}) {
  const journey = snapshot?.journey ?? null
  const classTotals = useMemo(() => journeyBookingClassTotals(journey?.bookings ?? []), [journey])
  const total = journeyBookingTotal(journey?.bookings ?? [])
  const latestMovement = latestJourneyMovement(journey)

  if (!journey) return null

  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(96,165,250,0.18)" }}
    >
      <div className="text-[8px] font-black uppercase tracking-[0.16em]" style={{ color: "#93c5fd" }}>
        Projection service layer
      </div>
      <div className="mt-2 text-2xl font-black tabular-nums text-white">{total.toLocaleString("en-GB")}</div>
      <div className="mt-1 text-[10px]" style={{ color: "rgba(255,255,255,0.56)" }}>
        Passengers on this service
      </div>

      {classTotals.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {classTotals.map(classTotal => (
            <span
              key={classTotal.serviceClass}
              className="rounded-full border px-2 py-1 text-[10px] font-semibold"
              style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.1)", color: "#dbeafe" }}
            >
              {bookingClassLabel(classTotal.serviceClass)} {classTotal.count}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-2">
        <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" }}>
          <div className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.42)" }}>
            Movement
          </div>
          <div className="mt-1 text-[11px] font-semibold text-white">
            {latestMovement ? `${latestMovement.stopName || latestMovement.shortCode || latestMovement.stopCode} · ${latestMovement.eventType}` : "No movement signal exposed"}
          </div>
          {latestMovement && (
            <div className="mt-1 text-[10px]" style={{ color: "rgba(255,255,255,0.58)" }}>
              {fmtTime(latestMovement.actualTime)} · {latestMovement.source} · GPS {journey.gps.length} · Beacon {journey.beacons.length}
            </div>
          )}
        </div>

        <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" }}>
          <div className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.42)" }}>
            Couplings and notices
          </div>
          <div className="mt-1 text-[11px] font-semibold text-white">
            {(journey.couplings?.length ?? 0) > 0 ? `${journey.couplings?.length} coupling links exposed` : "No coupling data on this service"}
          </div>
          <div className="mt-1 text-[10px]" style={{ color: "rgba(255,255,255,0.58)" }}>
            {(journey.news?.length ?? 0) > 0 ? `${journey.news?.length} active projection notices` : "No active projection notices"}
          </div>
        </div>
      </div>
    </div>
  )
}
