import { useEffect, useMemo, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Activity, CalendarDays, Link2, MapPin, Newspaper, Search, Train, Users, X, Zap } from "lucide-react"
import { EurostarDisplayMenu, EurostarDisplayStyles, eurostarDisplayClass, useEurostarDisplay } from "./EurostarDisplay"
import { ProjectionHealthBanner, projectionNewsCategoryLabel, projectionNewsDepartmentLabel, projectionNoticeTone, useProjectionSnapshot } from "./EurostarProjectionSnapshot"

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8080"

type JourneyService = {
  serviceNumber: string
  serviceDate: string
  status: string
  routeType: string
  trainSetNumber: string
  equipmentType: string
  originCode: string
  originName: string
  destinationCode: string
  destinationName: string
  scheduledDeparture: string
  scheduledArrival: string
}

type JourneyStop = {
  index: number
  code: string
  shortCode: string
  name: string
  pointType: string
  country: string
  latitude?: string
  longitude?: string
  arrivalTime?: string
  departureTime?: string
  passingTime?: string
  arrivalPlatform?: string
  departurePlatform?: string
  isCancelled: boolean
}

type JourneyEvent = {
  stopCode: string
  shortCode: string
  stopName: string
  eventType: string
  actualTime: string
  isCorrection: boolean
  source: string
}

type JourneyBooking = {
  originCode?: string
  originShort?: string
  destCode?: string
  destShort?: string
  serviceClass: string
  count: number
}

type JourneyCoupling = {
  fromCode: string
  fromShort: string
  toCode: string
  toShort: string
}

type JourneyNewsItem = {
  id: string
  department: string
  category: string
  publishedAt: string
  updatedAt: string
}

type JourneyDetail = {
  projectionEnabled: boolean
  date: string
  service: JourneyService
  stops: JourneyStop[]
  beacons: JourneyEvent[]
  gps: JourneyEvent[]
  bookings: JourneyBooking[]
  couplings?: JourneyCoupling[]
  news?: JourneyNewsItem[]
}

type StatusFilter = "all" | "active" | "cancelled"

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function fmtShort(dt?: string) {
  if (!dt) return "No time"
  try {
    return new Date(dt).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return dt
  }
}

function fmtTime(dt?: string) {
  if (!dt) return "—"
  try {
    return new Date(dt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  } catch {
    return dt
  }
}

function fmtDay(dt?: string) {
  if (!dt) return ""
  try {
    return new Date(dt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
  } catch {
    return dt
  }
}

function newsRecencyLabel(publishedAt: string, updatedAt: string) {
  if (updatedAt && updatedAt !== publishedAt) return `Updated ${fmtShort(updatedAt)}`
  return `Published ${fmtShort(publishedAt)}`
}

function routeDuration(start?: string, end?: string) {
  if (!start || !end) return "—"
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms <= 0) return "—"
  const hours = Math.floor(ms / 3_600_000)
  const mins = Math.round((ms % 3_600_000) / 60_000)
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
}

function statusLabel(status: string) {
  if (status === "deleted") return "Cancelled"
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function isCancelledStatus(status: string) {
  return status === "deleted" || status === "cancelled"
}

function signalLabel(eventType: string) {
  return eventType
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase())
}

function bookingClassLabel(serviceClass: string) {
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

function bookingSummary(bookings: JourneyBooking[]) {
  const totals = bookingClassTotals(bookings)
  if (totals.length === 0) return "No class mix exposed"
  return totals.map(([serviceClass, count]) => `${bookingClassLabel(serviceClass)} ${count}`).join(" · ")
}

function bookingTotal(bookings: JourneyBooking[]) {
  return bookings.reduce((sum, booking) => sum + booking.count, 0)
}

function bookingClassTotals(bookings: JourneyBooking[]) {
  const totals = new Map<string, number>()
  for (const booking of bookings) {
    totals.set(booking.serviceClass, (totals.get(booking.serviceClass) ?? 0) + booking.count)
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1])
}

function bookingFlowLabel(booking: JourneyBooking) {
  const from = booking.originShort || booking.originCode || "Origin"
  const to = booking.destShort || booking.destCode || "Destination"
  return `${from} → ${to}`
}

function latestEvent(detail: JourneyDetail | null): JourneyEvent | null {
  if (!detail) return null
  const all = [...detail.gps, ...detail.beacons]
    .filter(event => !!event.actualTime)
    .sort((a, b) => a.actualTime.localeCompare(b.actualTime))
  return all.at(-1) ?? null
}

function latestByStop(events: JourneyEvent[]) {
  const map = new Map<string, JourneyEvent>()
  for (const event of events) {
    const current = map.get(event.stopCode)
    if (!current || current.actualTime < event.actualTime) {
      map.set(event.stopCode, event)
    }
    if (event.shortCode) {
      const currentShort = map.get(event.shortCode)
      if (!currentShort || currentShort.actualTime < event.actualTime) {
        map.set(event.shortCode, event)
      }
    }
  }
  return map
}

function summarizeSchedule(stop: JourneyStop) {
  const parts: string[] = []
  if (stop.arrivalTime) parts.push(`Arr ${fmtTime(stop.arrivalTime)}`)
  if (stop.departureTime) parts.push(`Dep ${fmtTime(stop.departureTime)}`)
  if (!stop.arrivalTime && !stop.departureTime && stop.passingTime) parts.push(`Pass ${fmtTime(stop.passingTime)}`)
  return parts.length > 0 ? parts.join(" · ") : "No schedule exposed"
}

function stopMoment(stop: JourneyStop) {
  return stop.arrivalTime || stop.departureTime || stop.passingTime
}

function stopState(index: number, activeIndex: number) {
  if (index === activeIndex) return "Live now"
  if (index < activeIndex) return "Passed"
  return "Upcoming"
}

function couplingStopLabel(stop: JourneyStop | undefined, fallbackShort: string) {
  if (!stop) return fallbackShort
  return stop.name || stop.shortCode || fallbackShort
}

function statusTone(status: string) {
  if (isCancelledStatus(status)) {
    return {
      bg: "rgba(153,27,27,0.08)",
      border: "rgba(220,38,38,0.14)",
      text: "#b91c1c",
    }
  }
  return {
    bg: "rgba(15,23,42,0.06)",
    border: "rgba(15,23,42,0.08)",
    text: "#0f172a",
  }
}

function StopNode({
  active,
  passed,
}: {
  readonly active: boolean
  readonly passed: boolean
}) {
  return (
    <div className="relative flex h-7 w-7 items-center justify-center">
      <div
        className="h-3.5 w-3.5 rounded-full border-[3px]"
        style={{
          borderColor: active ? "#0f172a" : passed ? "#64748b" : "#cbd5e1",
          background: active ? "#0f172a" : passed ? "#94a3b8" : "#ffffff",
        }}
      />
      {active && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ border: "1px solid rgba(15,23,42,0.14)" }}
          animate={{ scale: [1, 1.35, 1], opacity: [0.9, 0.2, 0.9] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}
    </div>
  )
}

function FilterChip({
  active,
  children,
  onClick,
}: {
  readonly active: boolean
  readonly children: ReactNode
  readonly onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors"
      style={{
        background: active ? "#0f172a" : "rgba(255,255,255,0.86)",
        color: active ? "#ffffff" : "#475569",
        boxShadow: active ? "0 10px 24px rgba(15,23,42,0.12)" : "inset 0 0 0 1px rgba(148,163,184,0.18)",
      }}
    >
      {children}
    </button>
  )
}

function SummaryPill({
  icon,
  label,
  value,
}: {
  readonly icon: ReactNode
  readonly label: string
  readonly value: string
}) {
  return (
    <div
      className="rounded-[24px] px-4 py-3"
      style={{
        background: "rgba(255,255,255,0.76)",
        boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.14)",
      }}
    >
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-base font-semibold tracking-[-0.03em] text-slate-950">
        {value}
      </div>
    </div>
  )
}

function DetailRow({
  label,
  value,
  muted,
}: {
  readonly label: string
  readonly value: string
  readonly muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`text-right font-medium ${muted ? "text-slate-400" : "text-slate-900"}`}>
        {value}
      </span>
    </div>
  )
}

export function EurostarProjectionJourney({
  onClose,
}: {
  readonly onClose: () => void
}) {
  const { theme, compact } = useEurostarDisplay()
  const [date, setDate] = useState(todayISO())
  const [services, setServices] = useState<JourneyService[]>([])
  const [selectedServiceNumber, setSelectedServiceNumber] = useState("")
  const [detail, setDetail] = useState<JourneyDetail | null>(null)
  const [loadingServices, setLoadingServices] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState("")
  const [disabled, setDisabled] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const { health: projectionHealth } = useProjectionSnapshot({
    date,
    enabled: !disabled,
    serviceNumber: selectedServiceNumber || null,
  })

  useEffect(() => {
    let cancelled = false
    setLoadingServices(true)
    setError("")
    setDisabled(false)
    setDetail(null)
    setServices([])
    void fetch(`${API_BASE}/api/eurostar/projection/journeys?date=${date}`)
      .then(async response => {
        if (response.status === 503) {
          setDisabled(true)
          return { services: [] }
        }
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { error?: string } | null
          throw new Error(body?.error || "Could not load projection journeys")
        }
        return response.json()
      })
      .then((payload: { services?: JourneyService[] }) => {
        if (cancelled) return
        const next = payload.services ?? []
        setServices(next)
        setSelectedServiceNumber(current =>
          current && next.some(service => service.serviceNumber === current) ? current : (next[0]?.serviceNumber ?? ""),
        )
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoadingServices(false)
      })
    return () => { cancelled = true }
  }, [date])

  useEffect(() => {
    if (!selectedServiceNumber || disabled) return
    let cancelled = false
    setLoadingDetail(true)
    setError("")
    void fetch(`${API_BASE}/api/eurostar/projection/journeys/${date}/${selectedServiceNumber}`)
      .then(async response => {
        if (response.status === 503) {
          setDisabled(true)
          return null
        }
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { error?: string } | null
          throw new Error(body?.error || "Could not load journey detail")
        }
        return response.json() as Promise<JourneyDetail>
      })
      .then(payload => {
        if (!cancelled) setDetail(payload)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false)
      })
    return () => { cancelled = true }
  }, [date, selectedServiceNumber, disabled])

  const filteredServices = useMemo(() => {
    const q = search.trim().toLowerCase()
    return services.filter(service => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "cancelled" ? isCancelledStatus(service.status) : !isCancelledStatus(service.status))
      if (!matchesStatus) return false
      if (!q) return true
      return [
        service.serviceNumber,
        service.originName,
        service.destinationName,
        service.originCode,
        service.destinationCode,
        statusLabel(service.status),
      ].some(value => value.toLowerCase().includes(q))
    })
  }, [services, search, statusFilter])

  useEffect(() => {
    if (filteredServices.length === 0) return
    if (!filteredServices.some(service => service.serviceNumber === selectedServiceNumber)) {
      setSelectedServiceNumber(filteredServices[0].serviceNumber)
    }
  }, [filteredServices, selectedServiceNumber])

  const currentService = useMemo(
    () => services.find(service => service.serviceNumber === selectedServiceNumber) ?? null,
    [services, selectedServiceNumber],
  )

  const currentEvent = useMemo(() => latestEvent(detail), [detail])
  const activeStopIndex = useMemo(() => {
    if (!detail || !currentEvent) return 0
    const idx = detail.stops.findIndex(stop => stop.code === currentEvent.stopCode || stop.shortCode === currentEvent.shortCode)
    return idx >= 0 ? idx : 0
  }, [detail, currentEvent])
  const progressPercent = detail?.stops.length && detail.stops.length > 1
    ? (activeStopIndex / Math.max(detail.stops.length - 1, 1)) * 100
    : 0
  const beaconByStop = useMemo(() => latestByStop(detail?.beacons ?? []), [detail])
  const gpsByStop = useMemo(() => latestByStop(detail?.gps ?? []), [detail])
  const couplings = detail?.couplings ?? []
  const news = detail?.news ?? []
  const servicePassengers = bookingTotal(detail?.bookings ?? [])
  const bookingClasses = useMemo(() => bookingClassTotals(detail?.bookings ?? []), [detail])
  const bookingFlows = useMemo(
    () => (detail?.bookings ?? []).filter(booking => booking.originShort || booking.destShort).slice(0, 6),
    [detail],
  )
  const latestSignalSentence = currentEvent
    ? `Latest live trace reached ${currentEvent.stopName || currentEvent.shortCode} at ${fmtShort(currentEvent.actualTime)} via ${currentEvent.source}.`
    : "No live trace is exposed yet, so this story is currently running on scheduled stops only."
  const stopByCode = useMemo(() => {
    const map = new Map<string, JourneyStop>()
    for (const stop of detail?.stops ?? []) {
      map.set(stop.code, stop)
      map.set(stop.shortCode, stop)
    }
    return map
  }, [detail])
  const couplingsByStop = useMemo(() => {
    const map = new Map<string, Array<{ direction: "from" | "to", coupling: JourneyCoupling }>>()
    for (const coupling of couplings) {
      const fromEntries = [coupling.fromCode, coupling.fromShort].filter(Boolean)
      const toEntries = [coupling.toCode, coupling.toShort].filter(Boolean)
      for (const key of fromEntries) {
        map.set(key, [...(map.get(key) ?? []), { direction: "from", coupling }])
      }
      for (const key of toEntries) {
        map.set(key, [...(map.get(key) ?? []), { direction: "to", coupling }])
      }
    }
    return map
  }, [couplings])

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.52)] p-4 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className={`${eurostarDisplayClass(theme, compact)} relative w-full max-w-[1500px] overflow-hidden rounded-[34px]`}
          style={{
            maxHeight: "94vh",
            background: "linear-gradient(180deg, #f8f7f4 0%, #f3f2ef 100%)",
            boxShadow: "0 34px 90px rgba(15,23,42,0.24)",
          }}
          initial={{ opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.985 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          onClick={event => event.stopPropagation()}
        >
          <EurostarDisplayStyles />
          <style>{`
            .projection-story-light .text-slate-950,
            .projection-story-light .text-slate-900,
            .projection-story-light .text-slate-800,
            .projection-story-light .text-slate-700,
            .projection-story-light .text-slate-600 {
              color: #0f172a !important;
            }
            .projection-story-light .text-slate-500,
            .projection-story-light .text-slate-400,
            .projection-story-light .text-slate-300 {
              color: #64748b !important;
            }
          `}</style>

          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: "radial-gradient(circle at top right, rgba(56,189,248,0.14), transparent 28%), radial-gradient(circle at top left, rgba(15,23,42,0.08), transparent 24%)",
            }}
          />

          <div className="relative border-b border-[rgba(148,163,184,0.16)] px-6 py-6 sm:px-8">
            <div className="flex items-start gap-4">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-[20px]"
                style={{
                  background: "linear-gradient(145deg, #0f172a 0%, #1e293b 100%)",
                  boxShadow: "0 18px 36px rgba(15,23,42,0.16)",
                }}
              >
                <Train className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Eurostar Projection
                </div>
                <div className="mt-2 text-[30px] font-semibold tracking-[-0.06em] text-slate-950 sm:text-[40px]">
                  Journey Story
                </div>
                <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                  Select a train, then follow one clean route line through every stop with schedule, GPS, beacon and passenger context where the projection API exposes it.
                </div>
              </div>
              <div className="flex items-center gap-3">
                <EurostarDisplayMenu inverted={false} />
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white/80 text-slate-500 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)]"
                  aria-label="Close journey story"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="relative grid max-h-[calc(94vh-127px)] grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)]">
            <aside className="projection-story-light border-b border-[rgba(148,163,184,0.16)] px-5 py-5 xl:max-h-[calc(94vh-127px)] xl:overflow-y-auto xl:border-b-0 xl:border-r xl:px-6">
              <div
                className="rounded-[28px] p-4"
                style={{
                  background: "rgba(255,255,255,0.72)",
                  boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.14)",
                  backdropFilter: "blur(10px)",
                }}
              >
                <label className="flex items-center gap-3 rounded-[20px] bg-white/90 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.12)]">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  <input
                    type="date"
                    value={date}
                    onChange={event => setDate(event.target.value)}
                    className="w-full bg-transparent text-sm text-slate-900 outline-none"
                    style={{ colorScheme: "light" }}
                  />
                </label>

                <div className="mt-3 flex items-center gap-3 rounded-[20px] bg-white/90 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.12)]">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Search train or route"
                    className="w-full bg-transparent text-sm text-slate-900 outline-none"
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>All</FilterChip>
                  <FilterChip active={statusFilter === "active"} onClick={() => setStatusFilter("active")}>Running</FilterChip>
                  <FilterChip active={statusFilter === "cancelled"} onClick={() => setStatusFilter("cancelled")}>Cancelled</FilterChip>
                </div>
              </div>

              {currentService && (
                <div
                  className="mt-5 rounded-[30px] p-5"
                  style={{
                    background: "linear-gradient(165deg, #0f172a 0%, #162036 100%)",
                    color: "#ffffff",
                    boxShadow: "0 20px 50px rgba(15,23,42,0.18)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
                        Selected Service
                      </div>
                      <div className="mt-2 text-[28px] font-semibold tracking-[-0.06em]">
                        {currentService.serviceNumber}
                      </div>
                    </div>
                    <span
                      className="rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                      style={{
                        background: isCancelledStatus(currentService.status) ? "rgba(248,113,113,0.16)" : "rgba(255,255,255,0.12)",
                        color: isCancelledStatus(currentService.status) ? "#fecaca" : "#ffffff",
                      }}
                    >
                      {statusLabel(currentService.status)}
                    </span>
                  </div>

                  <div className="mt-4 text-lg font-medium text-white/90">
                    {currentService.originName} to {currentService.destinationName}
                  </div>
                  <div className="mt-1 text-sm text-white/55">
                    {fmtTime(currentService.scheduledDeparture)} to {fmtTime(currentService.scheduledArrival)} · {routeDuration(currentService.scheduledDeparture, currentService.scheduledArrival)}
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-white/80">
                    <div className="rounded-[20px] bg-white/8 px-3 py-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                        Trainset
                      </div>
                      <div className="mt-1 font-medium">{currentService.trainSetNumber || "Not exposed"}</div>
                    </div>
                    <div className="rounded-[20px] bg-white/8 px-3 py-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                        Equipment
                      </div>
                      <div className="mt-1 font-medium">{currentService.equipmentType || "Not exposed"}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-5 flex items-center justify-between px-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Trains
                </div>
                <div className="text-[11px] text-slate-400">
                  {loadingServices ? "Loading..." : `${filteredServices.length} shown`}
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 xl:max-h-[44vh] xl:overflow-y-auto xl:pr-1">
                {filteredServices.map(service => {
                  const selected = service.serviceNumber === selectedServiceNumber
                  const tone = statusTone(service.status)
                  return (
                    <button
                      key={`${service.serviceDate}-${service.serviceNumber}`}
                      type="button"
                      onClick={() => setSelectedServiceNumber(service.serviceNumber)}
                      className="rounded-[24px] px-4 py-4 text-left transition-transform hover:-translate-y-0.5"
                      style={{
                        background: selected ? "#ffffff" : "rgba(255,255,255,0.6)",
                        boxShadow: selected
                          ? "0 18px 34px rgba(15,23,42,0.1), inset 0 0 0 1px rgba(15,23,42,0.06)"
                          : "inset 0 0 0 1px rgba(148,163,184,0.12)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-base font-semibold tracking-[-0.03em] text-slate-950">
                            {service.serviceNumber}
                          </div>
                          <div className="mt-1 text-sm text-slate-500">
                            {service.originName} to {service.destinationName}
                          </div>
                        </div>
                        <span
                          className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
                          style={{
                            background: tone.bg,
                            borderColor: tone.border,
                            color: tone.text,
                          }}
                        >
                          {statusLabel(service.status)}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                        <span>{fmtTime(service.scheduledDeparture)} to {fmtTime(service.scheduledArrival)}</span>
                        <span>{routeDuration(service.scheduledDeparture, service.scheduledArrival)}</span>
                      </div>
                    </button>
                  )
                })}

                {!loadingServices && filteredServices.length === 0 && !error && !disabled && (
                  <div
                    className="rounded-[24px] px-4 py-5 text-sm text-slate-500"
                    style={{ background: "rgba(255,255,255,0.64)", boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.12)" }}
                  >
                    No services match this search.
                  </div>
                )}
              </div>
            </aside>

            <main className="projection-story-light max-h-[calc(94vh-127px)] overflow-y-auto px-5 py-5 sm:px-6 sm:py-6 xl:px-8 xl:py-7">
              {disabled && (
                <div className="rounded-[28px] bg-rose-50 px-5 py-4 text-sm text-rose-700 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.16)]">
                  This page only works when the new Eurostar projection API is enabled.
                </div>
              )}

              {error && (
                <div className="rounded-[28px] bg-rose-50 px-5 py-4 text-sm text-rose-700 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.16)]">
                  {error}
                </div>
              )}

              {!disabled && (
                <ProjectionHealthBanner health={projectionHealth} tone="light" heading="Projection Refresh" />
              )}

              {!disabled && currentService && detail && (
                <div className="space-y-6">
                  <section
                    className="overflow-hidden rounded-[34px]"
                    style={{
                      background: "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(245,247,250,0.92) 100%)",
                      boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.12)",
                    }}
                  >
                    <div className="px-6 py-6 sm:px-8 sm:py-7">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                          Service {detail.service.serviceNumber}
                        </span>
                        <span
                          className="rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                          style={{
                            background: statusTone(detail.service.status).bg,
                            borderColor: statusTone(detail.service.status).border,
                            color: statusTone(detail.service.status).text,
                          }}
                        >
                          {statusLabel(detail.service.status)}
                        </span>
                        <span className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.12)]">
                          Projection Only
                        </span>
                      </div>

                      <div className="mt-5 text-[32px] font-semibold leading-none tracking-[-0.07em] text-slate-950 sm:text-[48px]">
                        {detail.service.originName}
                        <span className="mx-3 text-slate-300">→</span>
                        {detail.service.destinationName}
                      </div>

                      <div className="mt-3 max-w-3xl text-base leading-7 text-slate-500">
                        {latestSignalSentence}
                      </div>

                      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <SummaryPill
                          icon={<CalendarDays className="h-3.5 w-3.5 text-slate-400" />}
                          label="Planned Run"
                          value={`${fmtTime(detail.service.scheduledDeparture)} to ${fmtTime(detail.service.scheduledArrival)}`}
                        />
                        <SummaryPill
                          icon={<MapPin className="h-3.5 w-3.5 text-slate-400" />}
                          label="Stops"
                          value={`${detail.stops.length} on this route`}
                        />
                        <SummaryPill
                          icon={<Users className="h-3.5 w-3.5 text-slate-400" />}
                          label="Bookings"
                          value={detail.bookings.length > 0 ? `${servicePassengers} seat bookings` : "Not exposed"}
                        />
                        <SummaryPill
                          icon={<Activity className="h-3.5 w-3.5 text-slate-400" />}
                          label="Live Coverage"
                          value={`${detail.gps.length} GPS · ${detail.beacons.length} beacon`}
                        />
                      </div>

                      {bookingClasses.length > 0 && (
                        <div className="mt-5 flex flex-wrap gap-2">
                          {bookingClasses.map(([serviceClass, count]) => (
                            <span
                              key={serviceClass}
                              className="rounded-full bg-white/85 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.12)]"
                            >
                              {bookingClassLabel(serviceClass)} {count}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="border-t border-[rgba(148,163,184,0.12)] px-6 py-4 sm:px-8">
                      <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                        <span>Duration {routeDuration(detail.service.scheduledDeparture, detail.service.scheduledArrival)}</span>
                        <span className="text-slate-300">•</span>
                        <span>{bookingSummary(detail.bookings)}</span>
                        {couplings.length > 0 && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span>{couplings.length} formation link{couplings.length === 1 ? "" : "s"}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </section>

                  {detail.bookings.length > 0 && (
                    <section
                      className="rounded-[34px] px-5 py-6 sm:px-8 sm:py-7"
                      style={{
                        background: "rgba(255,255,255,0.74)",
                        boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.12)",
                      }}
                    >
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Demand
                          </div>
                          <div className="mt-2 text-[28px] font-semibold tracking-[-0.06em] text-slate-950">
                            Booking pattern
                          </div>
                        </div>
                        <div className="max-w-xl text-sm text-slate-500">
                          Booking data is projection-only. When it is unavailable, this layer simply stays hidden.
                        </div>
                      </div>

                      <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                        <div
                          className="rounded-[28px] px-5 py-5"
                          style={{
                            background: "rgba(255,255,255,0.9)",
                            boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.12)",
                          }}
                        >
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                            Class Mix
                          </div>
                          <div className="mt-4 grid gap-3 sm:grid-cols-3">
                            {bookingClasses.map(([serviceClass, count]) => (
                              <div
                                key={serviceClass}
                                className="rounded-[22px] bg-slate-50 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.12)]"
                              >
                                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                  {bookingClassLabel(serviceClass)}
                                </div>
                                <div className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                                  {count}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  booked seats
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div
                          className="rounded-[28px] px-5 py-5"
                          style={{
                            background: "rgba(255,255,255,0.9)",
                            boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.12)",
                          }}
                        >
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                            Strongest Booking Flows
                          </div>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {bookingFlows.map((booking, index) => (
                              <div
                                key={`${booking.serviceClass}-${booking.originShort}-${booking.destShort}-${index}`}
                                className="rounded-[22px] bg-slate-50 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.12)]"
                              >
                                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                  {bookingClassLabel(booking.serviceClass)}
                                </div>
                                <div className="mt-2 text-base font-semibold tracking-[-0.03em] text-slate-950">
                                  {bookingFlowLabel(booking)}
                                </div>
                                <div className="mt-1 text-sm text-slate-500">
                                  {booking.count} booked seats
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </section>
                  )}

                  {couplings.length > 0 && (
                    <section
                      className="rounded-[34px] px-5 py-6 sm:px-8 sm:py-7"
                      style={{
                        background: "rgba(255,255,255,0.74)",
                        boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.12)",
                      }}
                    >
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Formation
                          </div>
                          <div className="mt-2 text-[28px] font-semibold tracking-[-0.06em] text-slate-950">
                            Coupling path
                          </div>
                        </div>
                        <div className="max-w-xl text-sm text-slate-500">
                          This layer only appears when the projection API exposes coupling data. If the older Eurostar feeds are active, it simply stays hidden.
                        </div>
                      </div>

                      <div className="mt-6 grid gap-3 lg:grid-cols-2">
                        {couplings.map((coupling, index) => {
                          const fromStop = stopByCode.get(coupling.fromCode) ?? stopByCode.get(coupling.fromShort)
                          const toStop = stopByCode.get(coupling.toCode) ?? stopByCode.get(coupling.toShort)
                          return (
                            <motion.div
                              key={`${coupling.fromCode}-${coupling.toCode}-${index}`}
                              className="rounded-[28px] px-5 py-5"
                              style={{
                                background: "rgba(255,255,255,0.9)",
                                boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.12)",
                              }}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.04 }}
                            >
                              <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                <Link2 className="h-3.5 w-3.5" />
                                Coupling Link {index + 1}
                              </div>
                              <div className="mt-4 flex flex-wrap items-center gap-3">
                                <div className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-900">
                                  {coupling.fromShort}
                                </div>
                                <div className="text-slate-300">→</div>
                                <div className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-900">
                                  {coupling.toShort}
                                </div>
                              </div>
                              <div className="mt-4 text-sm text-slate-500">
                                {couplingStopLabel(fromStop, coupling.fromShort)} to {couplingStopLabel(toStop, coupling.toShort)}
                              </div>
                            </motion.div>
                          )
                        })}
                      </div>
                    </section>
                  )}

                  {news.length > 0 && (
                    <section
                      className="rounded-[34px] px-5 py-6 sm:px-8 sm:py-7"
                      style={{
                        background: "rgba(255,255,255,0.74)",
                        boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.12)",
                      }}
                    >
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Operational Notices
                          </div>
                          <div className="mt-2 text-[28px] font-semibold tracking-[-0.06em] text-slate-950">
                            Live noticeboard
                          </div>
                        </div>
                        <div className="max-w-xl text-sm text-slate-500">
                          Projection-only service notices, grouped into a calmer board so the important changes stand out quickly.
                        </div>
                      </div>

                      <div className="mt-6 grid gap-3 lg:grid-cols-[1.15fr,0.85fr]">
                        <div className="grid gap-3">
                          {news.slice(0, 4).map(item => {
                            const tone = projectionNoticeTone(item.category || "")
                            return (
                              <motion.div
                                key={item.id}
                                className="rounded-[30px] px-5 py-5"
                                style={{
                                  background: "rgba(255,255,255,0.92)",
                                  boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.12)",
                                }}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                              >
                                <div className="flex flex-wrap items-start gap-3">
                                  <div
                                    className="flex h-11 w-11 items-center justify-center rounded-2xl"
                                    style={{ background: tone.surface, color: tone.accent, boxShadow: `inset 0 0 0 1px ${tone.border}` }}
                                  >
                                    <Newspaper className="h-4.5 w-4.5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span
                                        className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
                                        style={{ background: tone.surface, color: tone.accent, boxShadow: `inset 0 0 0 1px ${tone.border}` }}
                                      >
                                        {projectionNewsCategoryLabel(item.category || "Operational notice")}
                                      </span>
                                      <span className="text-[11px] font-medium text-slate-400">
                                        {projectionNewsDepartmentLabel(item.department || "Projection")}
                                      </span>
                                    </div>
                                    <div className="mt-3 text-lg font-semibold tracking-[-0.04em] text-slate-950">
                                      {projectionNewsCategoryLabel(item.category || "Operational notice")}
                                    </div>
                                    <div className="mt-1 text-sm text-slate-500">
                                      Shared by {projectionNewsDepartmentLabel(item.department || "Projection")}
                                    </div>
                                  </div>
                                  <div className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-600">
                                    {newsRecencyLabel(item.publishedAt, item.updatedAt)}
                                  </div>
                                </div>
                              </motion.div>
                            )
                          })}
                        </div>

                        <div className="grid gap-3">
                          <div
                            className="rounded-[30px] px-5 py-5"
                            style={{
                              background: "rgba(248,250,252,0.92)",
                              boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.12)",
                            }}
                          >
                            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              Board Summary
                            </div>
                            <div className="mt-3 text-4xl font-semibold tracking-[-0.08em] text-slate-950">
                              {news.length}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              Active notices in the projection feed
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              {Array.from(new Set(news.map(item => projectionNewsDepartmentLabel(item.department || "Projection")))).slice(0, 3).map(label => (
                                <div key={label} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)]">
                                  {label}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div
                            className="rounded-[30px] px-5 py-5"
                            style={{
                              background: "rgba(248,250,252,0.92)",
                              boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.12)",
                            }}
                          >
                            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              Latest refresh
                            </div>
                            <div className="mt-3 text-base font-semibold text-slate-950">
                              {fmtShort(news[0]?.updatedAt || news[0]?.publishedAt)}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              This board only appears when the new projection API is enabled.
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                  )}

                  <section
                    className="rounded-[34px] px-5 py-6 sm:px-8 sm:py-8"
                    style={{
                      background: "rgba(255,255,255,0.74)",
                      boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.12)",
                    }}
                  >
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Stop Story
                        </div>
                        <div className="mt-2 text-[28px] font-semibold tracking-[-0.06em] text-slate-950">
                          One route line, all live context
                        </div>
                      </div>
                      <div className="text-sm text-slate-500">
                        GPS and beacon are shown per stop when projection exposes them.
                      </div>
                    </div>

                    <div className="relative mt-8 pl-2 sm:pl-4">
                      <div
                        className="absolute bottom-4 left-[14px] top-2 w-[2px] rounded-full bg-slate-200 sm:left-[22px]"
                      />
                      <motion.div
                        className="absolute left-[14px] top-2 w-[2px] rounded-full sm:left-[22px]"
                        style={{
                          height: `${progressPercent}%`,
                          background: "linear-gradient(180deg, #0f172a 0%, #38bdf8 100%)",
                        }}
                      />

                      <div className="space-y-5">
                        {detail.stops.map((stop, index) => {
                          const beacon = beaconByStop.get(stop.code) ?? beaconByStop.get(stop.shortCode)
                          const gps = gpsByStop.get(stop.code) ?? gpsByStop.get(stop.shortCode)
                          const stopCouplings = couplingsByStop.get(stop.code) ?? couplingsByStop.get(stop.shortCode) ?? []
                          const current = index === activeStopIndex
                          const passed = index < activeStopIndex
                          const moment = stopMoment(stop)
                          return (
                            <motion.article
                              key={`${stop.index}-${stop.shortCode}`}
                              className="grid grid-cols-[30px_minmax(0,1fr)] gap-4 sm:grid-cols-[46px_minmax(0,1fr)] sm:gap-5"
                              initial={{ opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.03 }}
                            >
                              <div className="relative z-10 pt-3">
                                <StopNode active={current} passed={passed} />
                              </div>

                              <div
                                className="overflow-hidden rounded-[28px]"
                                style={{
                                  background: current ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.72)",
                                  boxShadow: current
                                    ? "0 22px 48px rgba(15,23,42,0.1), inset 0 0 0 1px rgba(15,23,42,0.06)"
                                    : "inset 0 0 0 1px rgba(148,163,184,0.12)",
                                }}
                              >
                                <div className="px-5 py-5 sm:px-6">
                                  <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                          {stop.shortCode}
                                        </span>
                                        <span
                                          className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                                          style={{
                                            background: current ? "rgba(15,23,42,0.08)" : "rgba(226,232,240,0.65)",
                                            color: current ? "#0f172a" : "#475569",
                                          }}
                                        >
                                          {stopState(index, activeStopIndex)}
                                        </span>
                                        {stop.isCancelled && (
                                          <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-600">
                                            Cancelled Stop
                                          </span>
                                        )}
                                      </div>

                                      <div className="mt-3 text-[24px] font-semibold tracking-[-0.05em] text-slate-950">
                                        {stop.name}
                                      </div>
                                      <div className="mt-1 text-sm text-slate-500">
                                        {stop.pointType}
                                        {stop.country ? ` · ${stop.country}` : ""}
                                        {moment ? ` · ${fmtDay(moment)}` : ""}
                                      </div>
                                      {stopCouplings.length > 0 && (
                                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                                          {stopCouplings.map(({ direction, coupling }, couplingIndex) => {
                                            const peerStop = direction === "from"
                                              ? (stopByCode.get(coupling.toCode) ?? stopByCode.get(coupling.toShort))
                                              : (stopByCode.get(coupling.fromCode) ?? stopByCode.get(coupling.fromShort))
                                            const peerShort = direction === "from" ? coupling.toShort : coupling.fromShort
                                            return (
                                              <span
                                                key={`${direction}-${coupling.fromCode}-${coupling.toCode}-${couplingIndex}`}
                                                className="rounded-full bg-slate-100 px-3 py-1.5"
                                              >
                                                {direction === "from" ? "Couples onward to" : "Receives from"} {couplingStopLabel(peerStop, peerShort)}
                                              </span>
                                            )
                                          })}
                                        </div>
                                      )}
                                    </div>

                                    <div className="min-w-[140px] rounded-[22px] bg-slate-50 px-4 py-3 text-right shadow-[inset_0_0_0_1px_rgba(148,163,184,0.12)]">
                                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                        Scheduled
                                      </div>
                                      <div className="mt-2 text-base font-semibold tracking-[-0.03em] text-slate-950">
                                        {moment ? fmtShort(moment) : "Not exposed"}
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="border-t border-[rgba(148,163,184,0.1)] bg-white/60 px-5 py-4 sm:px-6">
                                  <div className="grid gap-3 lg:grid-cols-3">
                                    <div className="rounded-[22px] bg-white/90 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.12)]">
                                      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                        <CalendarDays className="h-3.5 w-3.5" />
                                        Schedule
                                      </div>
                                      <div className="mt-2 text-sm font-medium text-slate-900">
                                        {summarizeSchedule(stop)}
                                      </div>
                                      {(stop.arrivalPlatform || stop.departurePlatform) && (
                                        <div className="mt-2 text-xs text-slate-500">
                                          Platform {stop.departurePlatform || stop.arrivalPlatform}
                                        </div>
                                      )}
                                    </div>

                                    <div className="rounded-[22px] bg-white/90 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.12)]">
                                      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                        <Activity className="h-3.5 w-3.5" />
                                        GPS
                                      </div>
                                      <div className="mt-2 space-y-1">
                                        <DetailRow label="Time" value={gps ? fmtShort(gps.actualTime) : "No GPS trace"} muted={!gps} />
                                        <DetailRow label="Signal" value={gps ? signalLabel(gps.eventType) : "Waiting"} muted={!gps} />
                                      </div>
                                    </div>

                                    <div className="rounded-[22px] bg-white/90 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.12)]">
                                      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                        <Zap className="h-3.5 w-3.5" />
                                        Beacon
                                      </div>
                                      <div className="mt-2 space-y-1">
                                        <DetailRow label="Time" value={beacon ? fmtShort(beacon.actualTime) : "No beacon trace"} muted={!beacon} />
                                        <DetailRow label="Signal" value={beacon ? signalLabel(beacon.eventType) : "Waiting"} muted={!beacon} />
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                                    {detail.bookings.length > 0 && (
                                      <span className="rounded-full bg-slate-100 px-3 py-1.5">
                                        Demand signal {servicePassengers} booked seats
                                      </span>
                                    )}
                                    {beacon?.source && (
                                      <span className="rounded-full bg-slate-100 px-3 py-1.5">
                                        Beacon source {beacon.source}
                                      </span>
                                    )}
                                    {gps?.source && gps?.source !== beacon?.source && (
                                      <span className="rounded-full bg-slate-100 px-3 py-1.5">
                                        GPS source {gps.source}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </motion.article>
                          )
                        })}
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {!disabled && !currentService && !loadingServices && !error && (
                <div
                  className="rounded-[34px] px-8 py-14 text-center"
                  style={{
                    background: "rgba(255,255,255,0.7)",
                    boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.12)",
                  }}
                >
                  <div className="text-[32px] font-semibold tracking-[-0.06em] text-slate-950">
                    Pick a service to start the story
                  </div>
                  <div className="mt-3 text-sm leading-6 text-slate-500">
                    Search on the left, choose a train, and the route will unfold with schedule, GPS and beacon detail stop by stop.
                  </div>
                </div>
              )}

              {loadingDetail && (
                <div
                  className="rounded-[34px] px-8 py-14 text-center"
                  style={{
                    background: "rgba(255,255,255,0.7)",
                    boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.12)",
                  }}
                >
                  <div className="text-[30px] font-semibold tracking-[-0.05em] text-slate-950">
                    Loading journey story
                  </div>
                  <div className="mt-3 text-sm leading-6 text-slate-500">
                    Pulling projection schedule, GPS and beacon events for this service.
                  </div>
                </div>
              )}
            </main>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
