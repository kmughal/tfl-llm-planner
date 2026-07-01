import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Train, ChevronDown, ChevronUp, Search, X, Users, Phone } from "lucide-react"
import { cn } from "../lib/utils"
import { EurostarDisplayMenu, EurostarDisplayStyles, eurostarDisplayClass, useEurostarDisplay } from "./EurostarDisplay"
import { ProjectionSignalBanner, useProjectionSnapshot } from "./EurostarProjectionSnapshot"

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8080"

const STATION_NAMES: Record<string, string> = {
  SPX: "St Pancras",
  PNO: "Paris Nord",
  BXL: "Brussels Midi",
  ASD: "Amsterdam",
  RTD: "Rotterdam",
  LIL: "Lille Europe",
  EBF: "Ebbsfleet",
  ASI: "Ashford",
  CFR: "Calais",
  FTN: "Frethun",
}

function stationName(code: string): string {
  return STATION_NAMES[code?.toUpperCase()] ?? code
}

interface DashboardSummary {
  date: string
  total: number
  active: number
  cancelled: number
  outbound: number
  inbound: number
}

interface ServiceStop {
  code: string
  time: string
}

interface DashboardService {
  serviceCode: string
  status: string
  dep: string
  arr: string
  origin: string
  dest: string
  stops: ServiceStop[]
}

interface DashboardData {
  summary: DashboardSummary
  services: DashboardService[]
}

function parseDashboard(raw: string): DashboardData | null {
  const startMatch = /DASHBOARD_START:([^\n]+)/.exec(raw)
  if (!startMatch) return null

  const [date, total, active, cancelled, outbound, inbound] = startMatch[1].split("|")
  const summary: DashboardSummary = {
    date: date ?? "",
    total: Number(total ?? 0),
    active: Number(active ?? 0),
    cancelled: Number(cancelled ?? 0),
    outbound: Number(outbound ?? 0),
    inbound: Number(inbound ?? 0),
  }

  const services: DashboardService[] = []
  const svcRe = /^DASHBOARD_SERVICE:(.+)$/gm
  let m: RegExpExecArray | null
  while ((m = svcRe.exec(raw)) !== null) {
    const [serviceCode = "", status = "", dep = "", arr = "", origin = "", dest = "", stopsStr = ""] = m[1].split("|")
    const stops: ServiceStop[] = stopsStr
      .split(",")
      .filter(Boolean)
      .map(s => {
        const colonIdx = s.indexOf(":")
        return colonIdx === -1
          ? { code: s, time: "" }
          : { code: s.slice(0, colonIdx), time: s.slice(colonIdx + 1) }
      })
    const normalizedStatus = /delete|cancel/i.test(status) ? "cancelled" : status
    services.push({ serviceCode, status: normalizedStatus, dep, arr, origin, dest, stops })
  }

  return { summary, services }
}

type FilterTab = "all" | "outbound" | "inbound" | "cancelled"

const EURO_COLOR = "#003399"

function StatTile({
  label,
  value,
  textColor,
  bgColor,
}: {
  label: string
  value: number
  textColor: string
  bgColor: string
}) {
  return (
    <div
      className="flex flex-col items-center px-3 py-2 rounded-xl min-w-[56px]"
      style={{ backgroundColor: bgColor }}
    >
      <span className="text-xl font-black tabular-nums leading-none" style={{ color: textColor }}>
        {value}
      </span>
      <span className="text-[9px] uppercase tracking-wider font-semibold mt-0.5" style={{ color: textColor, opacity: 0.85 }}>
        {label}
      </span>
    </div>
  )
}

// ── Stop timeline (shown when a row is expanded) ──────────────────────────────
function StopTimeline({ stops }: { readonly stops: ServiceStop[] }) {
  return (
    <div className="flex items-start gap-0 overflow-x-auto scrollbar-none py-2 px-2">
      {stops.map((stop, i) => {
        const isTerminal = i === 0 || i === stops.length - 1
        const name = stationName(stop.code)
        return (
          <div key={`${stop.code}-${i}`} className="flex items-center shrink-0">
            <motion.div
              className="flex flex-col items-center"
              style={{ minWidth: 58 }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.22 }}
            >
              <span
                className="text-[10px] tabular-nums font-bold pb-1 leading-none"
                style={{ color: isTerminal ? "#111827" : "#9ca3af" }}
              >
                {stop.time || "—"}
              </span>
              <motion.div
                className="rounded-full border-[2.5px]"
                style={{
                  width: isTerminal ? 14 : 10,
                  height: isTerminal ? 14 : 10,
                  borderColor: EURO_COLOR,
                  backgroundColor: isTerminal ? EURO_COLOR : "#fff",
                }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.06 + 0.08, type: "spring", stiffness: 380, damping: 16 }}
              />
              <span
                className="text-[9px] text-center leading-tight pt-1 px-0.5"
                style={{
                  color: isTerminal ? "#111827" : "#6b7280",
                  fontWeight: isTerminal ? 600 : 400,
                  maxWidth: 58,
                  wordBreak: "break-word",
                }}
              >
                {name}
              </span>
            </motion.div>
            {i < stops.length - 1 && (
              <motion.div
                style={{
                  width: 20,
                  height: 2,
                  backgroundColor: `${EURO_COLOR}28`,
                  marginBottom: 20,
                  flexShrink: 0,
                }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: i * 0.06 + 0.12, duration: 0.18 }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Current-time helpers ─────────────────────────────────────────────────────
function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function isRunningNow(dep: string, arr: string, now: string): boolean {
  if (!dep || !arr || dep === "—" || arr === "—") return false
  // handle overnight (dep=23:00 arr=01:00)
  if (arr < dep) return now >= dep || now <= arr
  return now >= dep && now <= arr
}

// ── Animated train badge ──────────────────────────────────────────────────────
function trainIconAnimate(isNow: boolean, isCancelled: boolean) {
  if (isNow) return { x: [0, 2, 0] }
  if (isCancelled) return { rotate: [0, -5, 0] }
  return {}
}

function trainIconTransition(isNow: boolean, isCancelled: boolean) {
  if (isNow) return { duration: 1.1, repeat: Infinity, ease: "easeInOut" as const }
  if (isCancelled) return { duration: 2.5, repeat: Infinity, ease: "easeInOut" as const }
  return {}
}

function TrainBadge({
  serviceCode,
  color,
  isNow,
  isCancelled,
}: {
  readonly serviceCode: string
  readonly color: string
  readonly isNow: boolean
  readonly isCancelled: boolean
}) {
  return (
    <div className="shrink-0 w-14 flex flex-col items-center gap-[3px]">
      {/* Train icon with motion */}
      <div className="relative flex items-center justify-center" style={{ width: 40, height: 20 }}>
        {/* Speed streaks — only for active trains */}
        {isNow && (
          <>
            {[{ w: 12, top: 5,  delay: 0    },
              { w: 7,  top: 11, delay: 0.18 },
              { w: 9,  top: 15, delay: 0.08 }].map((s) => (
              <motion.div
                key={s.top}
                style={{
                  position: "absolute",
                  left: 0,
                  top: s.top,
                  width: s.w,
                  height: 1.5,
                  borderRadius: 1,
                  background: `linear-gradient(to right, transparent, ${color})`,
                  transformOrigin: "right center",
                }}
                animate={{ opacity: [0, 0.55, 0], scaleX: [0.3, 1, 0.3] }}
                transition={{ duration: 0.9, delay: s.delay, repeat: Infinity, ease: "easeInOut" }}
              />
            ))}
          </>
        )}

        {/* The train icon */}
        <motion.div
          style={{ position: "absolute", right: 2, top: 2, color }}
          animate={trainIconAnimate(isNow, isCancelled)}
          transition={trainIconTransition(isNow, isCancelled)}
        >
          <Train style={{ width: 14, height: 14 }} />
        </motion.div>
      </div>

      {/* Service code */}
      <span
        className="text-[11px] font-black tabular-nums tracking-tight font-mono leading-none"
        style={{
          color,
          textDecoration: isCancelled ? "line-through" : "none",
          textDecorationColor: color,
        }}
      >
        {serviceCode}
      </span>
    </div>
  )
}

// ── Animated track with moving train ─────────────────────────────────────────
function trackTransition(isNow: boolean) {
  if (isNow) return { duration: 3.5, repeat: Infinity, ease: "linear" as const, repeatDelay: 0.8 }
  return {}
}

function TrainTrackRoute({ isNow, isOutbound, isCancelled }: {
  readonly isNow: boolean
  readonly isOutbound: boolean
  readonly isCancelled: boolean
}) {
  const color = isCancelled ? "#ef4444" : isNow ? "#d97706" : EURO_COLOR
  const fromLeft = isOutbound ? "4%"  : "80%"
  const toLeft   = isOutbound ? "80%" : "4%"

  return (
    <div className="relative" style={{ height: 16 }}>
      {/* Track line */}
      <div style={{
        position: "absolute", top: "50%", left: 8, right: 8, height: 2,
        transform: "translateY(-50%)", borderRadius: 1,
        background: isCancelled
          ? `repeating-linear-gradient(to right, ${color}55 0 5px, transparent 5px 9px)`
          : `${color}25`,
      }} />

      {/* Station dots */}
      <div style={{
        position: "absolute", left: 4, top: "50%", transform: "translateY(-50%)",
        width: 7, height: 7, borderRadius: "50%", backgroundColor: color, opacity: 0.75,
      }} />
      <div style={{
        position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
        width: 7, height: 7, borderRadius: "50%", backgroundColor: color, opacity: 0.75,
      }} />

      {/* Moving train */}
      <motion.div
        style={{ position: "absolute", top: 2, color }}
        initial={{ left: fromLeft }}
        animate={{ left: isNow ? [fromLeft, toLeft] : fromLeft }}
        transition={trackTransition(isNow)}
      >
        <div style={{ transform: isOutbound ? "none" : "scaleX(-1)" }}>
          <Train style={{ width: 12, height: 12 }} />
        </div>
      </motion.div>
    </div>
  )
}

// ── Crew types + strip ───────────────────────────────────────────────────────

interface EnrichedCrew {
  crewType:    string
  crewId:      string
  firstName:   string
  lastName:    string
  phone:       string
  homeDepot:   string
  serviceCode: string
  departure:   string
  arrival:     string
}

function CrewStrip({ crew, loading }: { readonly crew: EnrichedCrew[]; readonly loading: boolean }) {
  if (loading) {
    return (
      <div className="px-2 pb-3 pt-1 border-t border-amber-100">
        <p className="text-[9px] font-bold uppercase tracking-widest text-amber-500 mb-1.5">Crew on duty</p>
        <div className="flex gap-1.5">
          {[1, 2].map(i => (
            <div key={i} className="h-9 w-28 rounded-lg animate-pulse" style={{ background: "#fef3c7" }} />
          ))}
        </div>
      </div>
    )
  }

  if (crew.length === 0) return null

  return (
    <div className="px-2 pb-3 pt-2 border-t border-amber-100">
      <div className="flex items-center gap-1 mb-1.5">
        <Users className="w-2.5 h-2.5 text-amber-500" />
        <span className="text-[9px] font-black uppercase tracking-widest text-amber-600">Crew on duty</span>
        <span className="text-[8px] font-bold px-1 py-0.5 rounded-full bg-amber-100 text-amber-600 tabular-nums">{crew.length}</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
        {crew.map((m, i) => {
          const isDriver = m.crewType === "TRAIN_DRIVER"
          const name = [m.firstName, m.lastName].filter(Boolean).join(" ") || m.crewId
          const initials = ((m.firstName[0] ?? "") + (m.lastName[0] ?? "")).toUpperCase() || "?"
          return (
            <motion.div
              key={`${m.crewId}-${m.serviceCode}`}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 shrink-0"
              style={{
                background: isDriver ? "#fffbeb" : "#f9fafb",
                border: isDriver ? "1px solid #fcd34d" : "1px solid #e5e7eb",
              }}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, type: "spring", stiffness: 400, damping: 24 }}
            >
              <motion.div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black shrink-0"
                style={{ background: isDriver ? "#003366" : "#e5e7eb", color: isDriver ? "#fbbf24" : "#6b7280" }}
                animate={isDriver ? { boxShadow: ["0 0 0 0 rgba(251,191,36,0.4)", "0 0 0 4px rgba(251,191,36,0)"] } : {}}
                transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
              >
                {initials}
              </motion.div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold truncate max-w-[80px]" style={{ color: isDriver ? "#92400e" : "#374151" }}>
                  {name}
                </p>
                <p className="text-[8px]" style={{ color: isDriver ? "#b45309" : "#9ca3af" }}>
                  {isDriver ? "Driver" : m.crewType.replace(/_/g, " ").toLowerCase()}
                </p>
              </div>
              {m.phone && (
                <a
                  href={`tel:${m.phone.replaceAll(" ", "")}`}
                  onClick={e => e.stopPropagation()}
                  className="shrink-0 ml-0.5 flex items-center justify-center w-5 h-5 rounded"
                  style={{ background: isDriver ? "#fef3c7" : "#f3f4f6" }}
                >
                  <Phone className="w-2.5 h-2.5" style={{ color: isDriver ? "#d97706" : "#9ca3af" }} />
                </a>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ── Individual service row ────────────────────────────────────────────────────
const UK_CODES = new Set(["SPX", "EBF", "ASI"])

function ServiceRow({
  svc,
  nowTime,
  highlightActive,
  date,
}: {
  readonly svc: DashboardService
  readonly nowTime: string
  readonly highlightActive: boolean
  readonly date: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [crew, setCrew] = useState<EnrichedCrew[]>([])
  const [crewLoading, setCrewLoading] = useState(false)
  const crewFetched = useRef(false)

  useEffect(() => {
    if (!expanded || crewFetched.current) return
    crewFetched.current = true
    setCrewLoading(true)
    fetch(`${API_BASE}/api/crew/activities?date=${date}&serviceCode=${svc.serviceCode}`)
      .then(r => r.json())
      .then((data: unknown) => { if (Array.isArray(data)) setCrew(data as EnrichedCrew[]) })
      .catch(() => {})
      .finally(() => setCrewLoading(false))
  }, [expanded, date, svc.serviceCode])
  const isCancelled = svc.status === "cancelled"
  const isOutbound = UK_CODES.has(svc.origin.toUpperCase())
  const isNow = highlightActive && !isCancelled && isRunningNow(svc.dep, svc.arr, nowTime)

  let rowBorder = "border-gray-100 bg-white"
  if (isNow) rowBorder = "border-amber-300 bg-amber-50/70 shadow-sm"
  else if (isCancelled) rowBorder = "border-red-200/70 bg-red-50/30"

  let codeColor = EURO_COLOR
  if (isNow) codeColor = "#d97706"
  else if (isCancelled) codeColor = "#ef4444"

  return (
    <div className={cn("rounded-xl border relative", rowBorder)} data-now={isNow ? "true" : undefined}>
      {/* Animated left accent for in-progress trains */}
      {isNow && (
        <motion.div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-amber-400"
          animate={{ opacity: [1, 0.25, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* Shimmer sweep across active rows */}
      {isNow && (
        <motion.div
          className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden"
          aria-hidden
        >
          <motion.div
            style={{
              position: "absolute", top: 0, bottom: 0, width: 60,
              background: "linear-gradient(to right, transparent, rgba(251,191,36,0.12), transparent)",
            }}
            animate={{ x: [-60, 420] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "linear", repeatDelay: 1.2 }}
          />
        </motion.div>
      )}

      <button
        type="button"
        className="w-full text-left px-3 py-3 flex items-center gap-3 text-gray-900 min-h-[48px]"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Animated train badge */}
        <TrainBadge
          serviceCode={svc.serviceCode}
          color={codeColor}
          isNow={isNow}
          isCancelled={isCancelled}
        />

        {/* Route */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-[11px] font-semibold text-gray-800">
            <span className="truncate max-w-[72px]">{stationName(svc.origin)}</span>
            <span className="truncate max-w-[72px] text-right">{stationName(svc.dest)}</span>
          </div>
          <TrainTrackRoute isNow={isNow} isOutbound={isOutbound} isCancelled={isCancelled} />
          <div className="text-[9px] text-gray-400 flex items-center gap-1">
            <span
              className={cn(
                "inline-block w-1.5 h-1.5 rounded-full",
                isOutbound ? "bg-blue-400" : "bg-violet-400",
              )}
            />
            {isOutbound ? "Outbound" : "Inbound"} · {svc.stops.length} stops
          </div>
        </div>

        {/* Times */}
        <div className="shrink-0 text-right flex items-center gap-1.5">
          <span className="text-sm font-bold tabular-nums text-gray-900">{svc.dep || "—"}</span>
          <span className="text-gray-300 text-xs">→</span>
          <span className="text-sm font-bold tabular-nums text-gray-900">{svc.arr || "—"}</span>
        </div>

        {/* Status / Now badge */}
        {isNow ? (
          <motion.span
            className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide bg-amber-400 text-white"
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          >
            Now
          </motion.span>
        ) : (
          <span
            className={cn(
              "shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide",
              isCancelled ? "bg-red-100 text-red-600" : "bg-emerald-50 text-emerald-700",
            )}
          >
            {isCancelled ? "Canc" : "Live"}
          </span>
        )}

        {/* Chevron */}
        <div className="shrink-0 text-gray-300">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && svc.stops.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="border-t border-gray-100 px-2">
              <StopTimeline stops={svc.stops} />
              <CrewStrip crew={crew} loading={crewLoading} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export function EuromapDashboard({ result, projectionMode = false }: { readonly result: string; readonly projectionMode?: boolean }) {
  const { theme, compact } = useEurostarDisplay()
  const [filter, setFilter] = useState<FilterTab>("all")
  const [search, setSearch] = useState("")
  const [highlightActive, setHighlightActive] = useState(true)
  const [nowTime, setNowTime] = useState(nowHHMM)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const scrollToNow = useCallback(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-now="true"]')
    el?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [])

  useEffect(() => {
    if (!highlightActive) return
    const id = setInterval(() => setNowTime(nowHHMM()), 30_000)
    return () => clearInterval(id)
  }, [highlightActive])

  // Auto-scroll to the active train whenever filter changes or on first render
  useEffect(() => {
    if (!highlightActive) return
    // Small delay so the DOM has painted the data-now attribute
    const t = setTimeout(scrollToNow, 120)
    return () => clearTimeout(t)
  }, [highlightActive, filter, scrollToNow])

  const data = parseDashboard(result)
  if (!data) return null

  const { summary, services } = data
  const { snapshot: projectionSnapshot } = useProjectionSnapshot({ date: summary.date, enabled: projectionMode })

  const isOutbound = (s: DashboardService) => UK_CODES.has(s.origin.toUpperCase())

  const q = search.trim().toLowerCase()

  const filtered = services.filter(s => {
    if (filter === "outbound" && !isOutbound(s)) return false
    if (filter === "inbound" && isOutbound(s)) return false
    if (filter === "cancelled" && s.status !== "cancelled") return false
    if (!q) return true
    return (
      s.serviceCode.toLowerCase().includes(q) ||
      stationName(s.origin).toLowerCase().includes(q) ||
      stationName(s.dest).toLowerCase().includes(q) ||
      s.origin.toLowerCase().includes(q) ||
      s.dest.toLowerCase().includes(q)
    )
  })

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: "all",       label: "All",       count: summary.total },
    { id: "outbound",  label: "Outbound",  count: summary.outbound },
    { id: "inbound",   label: "Inbound",   count: summary.inbound },
    { id: "cancelled", label: "Cancelled", count: summary.cancelled },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={`${eurostarDisplayClass(theme, compact)} es-themed-panel w-full rounded-lg overflow-hidden border border-gray-100 shadow-lg`}
    >
      <EurostarDisplayStyles />
      {/* Header */}
      <div
        className="px-4 py-4"
        style={{ background: `linear-gradient(135deg, #002080 0%, #003399 60%, #1a4db3 100%)` }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1">
            <Train className="w-3.5 h-3.5 text-white" />
            <span className="text-white font-bold text-[13px] tracking-tight">Eurostar</span>
          </div>
          <span className="text-white/60 text-xs">Departure Board</span>
          <span className="ml-auto text-[11px] bg-white/15 text-white/90 px-2 py-0.5 rounded-full font-mono border border-white/10">
            {summary.date}
          </span>
          <EurostarDisplayMenu inverted />
        </div>
        <div className="flex gap-2 flex-wrap">
          <StatTile label="Total"     value={summary.total}     textColor="#fff"     bgColor="rgba(255,255,255,0.12)" />
          <StatTile label="Active"    value={summary.active}    textColor="#86efac"  bgColor="rgba(134,239,172,0.15)" />
          <StatTile label="Cancelled" value={summary.cancelled} textColor="#fca5a5"  bgColor="rgba(252,165,165,0.15)" />
          <StatTile label="Outbound"  value={summary.outbound}  textColor="#93c5fd"  bgColor="rgba(147,197,253,0.15)" />
          <StatTile label="Inbound"   value={summary.inbound}   textColor="#c4b5fd"  bgColor="rgba(196,181,253,0.15)" />
        </div>
      </div>

      {projectionMode && projectionSnapshot && (
        <div className="border-b border-gray-100 bg-white px-3 py-3">
          <ProjectionSignalBanner snapshot={projectionSnapshot} tone="light" heading="Projection Signal Layer" />
        </div>
      )}

      {/* Filter tabs + live highlight toggle */}
      <div className="flex items-center gap-1 px-3 py-2 bg-white border-b border-gray-100 overflow-x-auto scrollbar-none">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all duration-150",
              filter === tab.id
                ? "text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
            )}
            style={filter === tab.id ? { backgroundColor: EURO_COLOR } : {}}
          >
            {tab.label}
            <span
              className={cn(
                "text-[9px] px-1.5 py-0.5 rounded-full tabular-nums font-bold",
                filter === tab.id ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500",
              )}
            >
              {tab.count}
            </span>
          </button>
        ))}
        {/* Live highlight toggle */}
        <div className="ml-auto shrink-0 flex items-center gap-1.5">
          {highlightActive && (
            <button
              type="button"
              onClick={scrollToNow}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 transition-all"
            >
              ↓ Jump to Now
            </button>
          )}
          <button
            type="button"
            onClick={() => setHighlightActive(h => !h)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-all",
              highlightActive
                ? "bg-amber-400 text-white"
                : "bg-gray-100 text-gray-400 hover:bg-gray-200",
            )}
          >
            {highlightActive && (
              <motion.span
                className="inline-block w-1.5 h-1.5 rounded-full bg-white"
                animate={{ opacity: [1, 0.2, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
            )}
            {highlightActive ? `Now ${nowTime}` : "Live off"}
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="px-3 py-2 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-200 focus-within:border-blue-300 focus-within:ring-1 focus-within:ring-blue-100 transition-all">
          <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search train, origin or destination…"
            className="flex-1 bg-transparent text-[12px] text-gray-800 placeholder-gray-400 outline-none min-w-0"
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(""); searchRef.current?.focus() }}
              className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {q && (
            <span className="shrink-0 text-[10px] font-semibold tabular-nums text-gray-400">
              {filtered.length}
            </span>
          )}
        </div>
      </div>

      {/* Service list */}
      <div ref={listRef} className="es-density-list bg-gray-50 flex flex-col gap-1.5 p-2.5 max-h-[520px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-10">
            {q ? `No results for "${search}"` : "No services"}
          </div>
        ) : (
          filtered.map((svc, i) => (
            <ServiceRow
              key={`${svc.serviceCode}-${i}`}
              svc={svc}
              nowTime={nowTime}
              highlightActive={highlightActive}
              date={summary.date}
            />
          ))
        )}
      </div>
    </motion.div>
  )
}
