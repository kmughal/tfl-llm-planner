import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import { AlertTriangle, Bell, CheckCircle2, ChevronDown, Check, Clock3, Plus, RefreshCw, Search, Siren, Train, Users, X } from "lucide-react"

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? ""
const EUROSTAR_BLUE = "#003366"
const EUROSTAR_GOLD = "#C89A0C"
const INK = "#101828"

const REFRESH_OPTIONS = [
  { label: "Manual", seconds: 0 },
  { label: "30s", seconds: 30 },
  { label: "60s", seconds: 60 },
  { label: "1 min", seconds: 60 },
  { label: "5 min", seconds: 300 },
] as const

type EuromapStation = {
  stopType: string
  shortCode: string
  country?: string
}

type EuromapPlan = {
  status: string
  serviceCode: string
  planID: string
  departureDateTime: string
  arrivalDateTime: string
  stations: EuromapStation[]
}

type TravelerService = {
  serviceCode: string
  totalCount: number
  origin: string
  destination: string
  classes: Record<string, number>
  types: Record<string, number>
}

type TravelerSummary = {
  date: string
  services: number
  totalPassengers: number
  busiestService: string
  peakLoad: number
  items: TravelerService[]
}

type EurostarWatchlistItem = {
  planID: string
  serviceCode: string
  market: string
  origin: string
  destination: string
  status: string
  severity: "good" | "warning" | "critical"
  departureDateTime: string
  arrivalDateTime: string
  active: boolean
  cancelled: boolean
  crewLinked: boolean
  crewCount: number
  passengerLoad: number
  leadClass: string
  riskScore: number
  reasons: string[]
  recommendedAsk: string
}

type EurostarWatchlist = {
  date: string
  services: number
  watched: number
  highestRisk: number
  generatedAt: string
  items: EurostarWatchlistItem[]
}

type NotificationData = {
  trains: EuromapPlan[]
  traveler: TravelerSummary | null
  watchlist: EurostarWatchlist | null
}

type EurostarCatalogItem = {
  planID: string
  serviceCode: string
  status: string
  departureDateTime: string
  arrivalDateTime: string
  originCode: string
  originName: string
  destinationCode: string
  destinationName: string
  routeKey: string
}

type EurostarCatalogResponse = {
  date: string
  cached: boolean
  fetchedAt: string
  count: number
  services: EurostarCatalogItem[]
  routeCount: number
}

type AlertItem = {
  id: string
  tone: "info" | "warning" | "critical" | "success"
  title: string
  message: string
  serviceCode?: string
  timeLabel: string
  routeLabel: string
  ask?: string
  matchedRules?: string[]
}

type SavedRule = {
  id: string
  label: string
  detail: string
  tone: string
  kind: "last-train" | "high-load" | "crew-gap" | "critical-disruption" | "service-watch" | "route-watch"
  enabled: boolean
  serviceCode?: string
  origin?: string
  destination?: string
}

const STATION_NAMES: Record<string, string> = {
  SPX: "London St Pancras",
  PNO: "Paris Gare du Nord",
  BXL: "Brussels-Midi",
  BRU: "Brussels-Midi",
  LIL: "Lille Europe",
  AMS: "Amsterdam Centraal",
  ASD: "Amsterdam Centraal",
  RTD: "Rotterdam Centraal",
  RDM: "Rotterdam Centraal",
  EBF: "Ebbsfleet International",
  ASH: "Ashford International",
}

const RULE_STORAGE_KEY = "eurostar-notification-rules-v1"
const CATALOG_STORAGE_KEY = "eurostar-train-catalog-v1"

const DEFAULT_RULES: SavedRule[] = [
  { id: "last-train", label: "Last train tonight", detail: "Alert when the final Eurostar from a market is approaching", tone: "#7c3aed", kind: "last-train", enabled: true },
  { id: "high-load", label: "High load", detail: "Flag services above expected passenger load", tone: EUROSTAR_GOLD, kind: "high-load", enabled: true },
  { id: "crew-gap", label: "Crew gap", detail: "Highlight services with no roster match", tone: "#f97316", kind: "crew-gap", enabled: true },
  { id: "critical-disruption", label: "Critical disruption", detail: "Push cancelled or suspended services to the top", tone: "#ef4444", kind: "critical-disruption", enabled: true },
]

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function normalizeServiceCode(value: string) {
  return value.replaceAll(/\D/g, "").replace(/^0+/, "").slice(-4)
}

function stationName(code: string) {
  return STATION_NAMES[code?.toUpperCase()] ?? code
}

function originCode(plan: EuromapPlan) {
  return plan.stations.find(stop => stop.stopType?.toLowerCase() === "origin")?.shortCode ?? plan.stations[0]?.shortCode ?? "TBC"
}

function destCode(plan: EuromapPlan) {
  return plan.stations.find(stop => stop.stopType?.toLowerCase() === "destination")?.shortCode ?? plan.stations.at(-1)?.shortCode ?? "TBC"
}

function fmtTime(value?: string) {
  if (!value) return "--:--"
  try {
    return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  } catch {
    return "--:--"
  }
}

function minutesUntil(value?: string) {
  if (!value) return null
  const diff = new Date(value).getTime() - Date.now()
  if (!Number.isFinite(diff)) return null
  return Math.round(diff / 60_000)
}

function toneMeta(tone: AlertItem["tone"]) {
  switch (tone) {
    case "critical":
      return { border: "#fecaca", bg: "linear-gradient(180deg, rgba(255,241,242,0.98), rgba(255,255,255,0.96))", text: "#991b1b", dot: "#ef4444" }
    case "warning":
      return { border: "#fed7aa", bg: "linear-gradient(180deg, rgba(255,247,237,0.98), rgba(255,255,255,0.96))", text: "#9a3412", dot: "#f59e0b" }
    case "success":
      return { border: "#bbf7d0", bg: "linear-gradient(180deg, rgba(240,253,244,0.98), rgba(255,255,255,0.96))", text: "#166534", dot: "#22c55e" }
    default:
      return { border: "#bfdbfe", bg: "linear-gradient(180deg, rgba(239,246,255,0.98), rgba(255,255,255,0.96))", text: "#1d4ed8", dot: "#3b82f6" }
  }
}

function defaultRules(): SavedRule[] {
  return DEFAULT_RULES.map(rule => ({ ...rule }))
}

function loadStoredRules(): SavedRule[] {
  if (typeof window === "undefined") return defaultRules()
  try {
    const raw = window.localStorage.getItem(RULE_STORAGE_KEY)
    if (!raw) return defaultRules()
    const parsed = JSON.parse(raw) as SavedRule[]
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultRules()
    return parsed
  } catch {
    return defaultRules()
  }
}

function saveStoredRules(rules: SavedRule[]) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(RULE_STORAGE_KEY, JSON.stringify(rules))
}

function loadStoredCatalog(date: string): EurostarCatalogResponse | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(CATALOG_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as EurostarCatalogResponse
    if (!parsed || parsed.date !== date || !Array.isArray(parsed.services)) return null
    const age = Date.now() - new Date(parsed.fetchedAt).getTime()
    if (!Number.isFinite(age) || age > 24 * 60 * 60 * 1000) return null
    return parsed
  } catch {
    return null
  }
}

function saveStoredCatalog(catalog: EurostarCatalogResponse) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalog))
}

async function loadNotifications(date: string): Promise<NotificationData> {
  const [trainsRes, travelerRes, watchlistRes] = await Promise.allSettled([
    fetch(`${API}/api/eurostar/trains?date=${date}`),
    fetch(`${API}/api/eurostar/traveler-summary?date=${date}`),
    fetch(`${API}/api/eurostar/watchlist?date=${date}`),
  ])

  let trains: EuromapPlan[] = []
  let traveler: TravelerSummary | null = null
  let watchlist: EurostarWatchlist | null = null

  if (trainsRes.status === "fulfilled" && trainsRes.value.ok) trains = await trainsRes.value.json()
  else throw new Error("Eurostar train plans are unavailable")

  if (travelerRes.status === "fulfilled" && travelerRes.value.ok) traveler = await travelerRes.value.json()
  if (watchlistRes.status === "fulfilled" && watchlistRes.value.ok) watchlist = await watchlistRes.value.json()

  return { trains, traveler, watchlist }
}

function buildAlerts(data: NotificationData): AlertItem[] {
  const alerts: AlertItem[] = []
  const trains = [...data.trains].sort((a, b) => a.departureDateTime.localeCompare(b.departureDateTime))
  const travelerByService = new Map<string, TravelerService>()
  for (const item of data.traveler?.items ?? []) travelerByService.set(normalizeServiceCode(item.serviceCode), item)

  for (const item of data.watchlist?.items ?? []) {
    const tone: AlertItem["tone"] = item.severity === "critical" ? "critical" : "warning"
    alerts.push({
      id: `watch-${item.planID}`,
      tone,
      title: tone === "critical" ? `Service ${item.serviceCode} needs intervention` : `Service ${item.serviceCode} needs attention`,
      message: item.reasons[0] ?? "Live operational risk detected on this service.",
      serviceCode: item.serviceCode,
      timeLabel: fmtTime(item.departureDateTime),
      routeLabel: `${item.origin} - ${item.destination}`,
      ask: item.recommendedAsk,
    })
  }

  const upcoming = trains
    .map(plan => ({ plan, mins: minutesUntil(plan.departureDateTime) }))
    .filter(entry => entry.mins !== null && entry.mins >= 0 && entry.mins <= 30)
    .slice(0, 4)

  for (const entry of upcoming) {
    alerts.push({
      id: `depart-${entry.plan.planID}`,
      tone: entry.mins !== null && entry.mins <= 10 ? "warning" : "info",
      title: `${entry.plan.serviceCode} departs soon`,
      message: `${stationName(originCode(entry.plan))} to ${stationName(destCode(entry.plan))} leaves in ${entry.mins} minutes.`,
      serviceCode: entry.plan.serviceCode,
      timeLabel: fmtTime(entry.plan.departureDateTime),
      routeLabel: `${stationName(originCode(entry.plan))} - ${stationName(destCode(entry.plan))}`,
      ask: `Find a train for me from ${stationName(originCode(entry.plan))} using Eurostar`,
    })
  }

  const parisToLondon = trains.filter(plan => originCode(plan) === "PNO" && destCode(plan) === "SPX")
  const lastParis = parisToLondon.at(-1)
  if (lastParis) {
    const mins = minutesUntil(lastParis.departureDateTime)
    alerts.push({
      id: `last-${lastParis.planID}`,
      tone: mins !== null && mins <= 45 ? "warning" : "info",
      title: "Last Paris to London tonight",
      message: mins !== null && mins >= 0
        ? `${lastParis.serviceCode} is the final Paris departure and leaves in ${mins} minutes.`
        : `${lastParis.serviceCode} is the final Paris departure scheduled tonight.`,
      serviceCode: lastParis.serviceCode,
      timeLabel: fmtTime(lastParis.departureDateTime),
      routeLabel: "Paris Gare du Nord - London St Pancras",
      ask: "Last Eurostar from Paris tonight",
    })
  }

  const highLoad = [...travelerByService.values()]
    .filter(item => item.totalCount >= 650)
    .sort((a, b) => b.totalCount - a.totalCount)
    .slice(0, 3)

  for (const item of highLoad) {
    alerts.push({
      id: `load-${item.serviceCode}`,
      tone: item.totalCount >= 850 ? "critical" : "warning",
      title: `${item.serviceCode} is carrying a heavy load`,
      message: `${item.totalCount} passengers are currently assigned across ${item.origin} to ${item.destination}.`,
      serviceCode: item.serviceCode,
      timeLabel: "Load watch",
      routeLabel: `${item.origin} - ${item.destination}`,
      ask: `How is passenger load looking today on Eurostar service ${item.serviceCode}?`,
    })
  }

  if (alerts.length === 0 && trains.length > 0) {
    alerts.push({
      id: "all-clear",
      tone: "success",
      title: "Eurostar network is currently settled",
      message: "No urgent departures, crew gaps, or disruption spikes are being promoted right now.",
      timeLabel: "Live now",
      routeLabel: "Cross-channel network",
    })
  }

  const deduped = new Map<string, AlertItem>()
  for (const alert of alerts) deduped.set(alert.id, alert)
  return [...deduped.values()].slice(0, 12)
}

function buildRuleMatches(data: NotificationData, rules: SavedRule[]): AlertItem[] {
  const trains = [...data.trains].sort((a, b) => a.departureDateTime.localeCompare(b.departureDateTime))
  const watchItems = data.watchlist?.items ?? []
  const travelerItems = data.traveler?.items ?? []
  const ruleAlerts: AlertItem[] = []

  for (const rule of rules) {
    if (!rule.enabled) continue

    switch (rule.kind) {
      case "critical-disruption": {
        for (const item of watchItems.filter(entry => entry.severity === "critical").slice(0, 3)) {
          ruleAlerts.push({
            id: `${rule.id}-${item.planID}`,
            tone: "critical",
            title: `${item.serviceCode} matched ${rule.label.toLowerCase()}`,
            message: item.reasons[0] ?? "Critical disruption detected on the watched service.",
            serviceCode: item.serviceCode,
            timeLabel: fmtTime(item.departureDateTime),
            routeLabel: `${item.origin} - ${item.destination}`,
            ask: item.recommendedAsk,
            matchedRules: [rule.label],
          })
        }
        break
      }
      case "crew-gap": {
        for (const item of watchItems.filter(entry => !entry.crewLinked).slice(0, 3)) {
          ruleAlerts.push({
            id: `${rule.id}-${item.planID}`,
            tone: "warning",
            title: `${item.serviceCode} has no crew link`,
            message: "This service is being tracked without a linked crew roster.",
            serviceCode: item.serviceCode,
            timeLabel: fmtTime(item.departureDateTime),
            routeLabel: `${item.origin} - ${item.destination}`,
            ask: `Show me crew coverage for Eurostar service ${item.serviceCode} today`,
            matchedRules: [rule.label],
          })
        }
        break
      }
      case "high-load": {
        for (const item of travelerItems.filter(entry => entry.totalCount >= 650).slice(0, 3)) {
          ruleAlerts.push({
            id: `${rule.id}-${item.serviceCode}`,
            tone: item.totalCount >= 850 ? "critical" : "warning",
            title: `${item.serviceCode} matched high-load rule`,
            message: `${item.totalCount} passengers are currently assigned across ${item.origin} to ${item.destination}.`,
            serviceCode: item.serviceCode,
            timeLabel: "Load watch",
            routeLabel: `${item.origin} - ${item.destination}`,
            ask: `How is passenger load looking today on Eurostar service ${item.serviceCode}?`,
            matchedRules: [rule.label],
          })
        }
        break
      }
      case "last-train": {
        const parisToLondon = trains.filter(plan => originCode(plan) === "PNO" && destCode(plan) === "SPX")
        const lastParis = parisToLondon.at(-1)
        if (lastParis) {
          const mins = minutesUntil(lastParis.departureDateTime)
          ruleAlerts.push({
            id: `${rule.id}-${lastParis.planID}`,
            tone: mins !== null && mins <= 45 ? "warning" : "info",
            title: "Last train rule is active",
            message: mins !== null && mins >= 0
              ? `${lastParis.serviceCode} is your last Paris to London train tonight and leaves in ${mins} minutes.`
              : `${lastParis.serviceCode} is the final Paris to London departure on this date.`,
            serviceCode: lastParis.serviceCode,
            timeLabel: fmtTime(lastParis.departureDateTime),
            routeLabel: "Paris Gare du Nord - London St Pancras",
            ask: "Last Eurostar from Paris tonight",
            matchedRules: [rule.label],
          })
        }
        break
      }
      case "service-watch": {
        const target = rule.serviceCode ? normalizeServiceCode(rule.serviceCode) : ""
        if (!target) break
        const matchedWatch = watchItems.find(item => normalizeServiceCode(item.serviceCode) === target)
        const matchedTrain = trains.find(plan => normalizeServiceCode(plan.serviceCode) === target)
        if (matchedWatch) {
          ruleAlerts.push({
            id: `${rule.id}-${matchedWatch.planID}`,
            tone: matchedWatch.severity === "critical" ? "critical" : "warning",
            title: `${matchedWatch.serviceCode} changed state`,
            message: matchedWatch.reasons[0] ?? "The watched service now requires attention.",
            serviceCode: matchedWatch.serviceCode,
            timeLabel: fmtTime(matchedWatch.departureDateTime),
            routeLabel: `${matchedWatch.origin} - ${matchedWatch.destination}`,
            ask: matchedWatch.recommendedAsk,
            matchedRules: [rule.label],
          })
        } else if (matchedTrain) {
          const mins = minutesUntil(matchedTrain.departureDateTime)
          ruleAlerts.push({
            id: `${rule.id}-${matchedTrain.planID}`,
            tone: mins !== null && mins <= 30 ? "info" : "success",
            title: `${matchedTrain.serviceCode} is still on watch`,
            message: mins !== null && mins >= 0
              ? `Watched service ${matchedTrain.serviceCode} departs in ${mins} minutes and is currently on time.`
              : `Watched service ${matchedTrain.serviceCode} is present in today's plan.`,
            serviceCode: matchedTrain.serviceCode,
            timeLabel: fmtTime(matchedTrain.departureDateTime),
            routeLabel: `${stationName(originCode(matchedTrain))} - ${stationName(destCode(matchedTrain))}`,
            ask: `Show me full stop times for Eurostar service ${matchedTrain.serviceCode} today`,
            matchedRules: [rule.label],
          })
        }
        break
      }
      case "route-watch": {
        const origin = rule.origin?.trim()
        const destination = rule.destination?.trim()
        if (!origin || !destination) break
        const matched = trains
          .filter(plan => stationName(originCode(plan)) === origin && stationName(destCode(plan)) === destination)
          .slice(0, 2)
        for (const plan of matched) {
          const mins = minutesUntil(plan.departureDateTime)
          ruleAlerts.push({
            id: `${rule.id}-${plan.planID}`,
            tone: mins !== null && mins <= 30 ? "warning" : "info",
            title: `${origin} to ${destination} route watch`,
            message: mins !== null && mins >= 0
              ? `${plan.serviceCode} departs in ${mins} minutes on your watched route.`
              : `${plan.serviceCode} is scheduled on your watched route today.`,
            serviceCode: plan.serviceCode,
            timeLabel: fmtTime(plan.departureDateTime),
            routeLabel: `${origin} - ${destination}`,
            ask: `Find a train for me from ${origin} using Eurostar`,
            matchedRules: [rule.label],
          })
        }
        break
      }
    }
  }

  return ruleAlerts.slice(0, 12)
}

function MetricTile({ label, value, sub, tone }: { readonly label: string; readonly value: string | number; readonly sub: string; readonly tone: string }) {
  return (
    <div className="rounded-[24px] border bg-white px-4 py-4 shadow-[0_10px_28px_rgba(0,0,0,.04)]" style={{ borderColor: "#e7ecf3" }}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "#667085" }}>{label}</div>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: tone }} />
      </div>
      <div className="mt-2 text-3xl font-black tabular-nums" style={{ color: INK }}>{value}</div>
      <div className="mt-1 text-xs" style={{ color: "#667085" }}>{sub}</div>
    </div>
  )
}

type SearchableOption = {
  value: string
  label: string
  sublabel?: string
}

function SearchableSelect({
  label,
  placeholder,
  value,
  options,
  onChange,
}: {
  readonly label: string
  readonly placeholder: string
  readonly value: string
  readonly options: SearchableOption[]
  readonly onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener("mousedown", onPointerDown)
    return () => window.removeEventListener("mousedown", onPointerDown)
  }, [open])

  const selected = options.find(option => option.value === value) ?? null
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, 80)
    return options
      .filter(option =>
        option.label.toLowerCase().includes(q) ||
        option.sublabel?.toLowerCase().includes(q) ||
        option.value.toLowerCase().includes(q),
      )
      .slice(0, 80)
  }, [options, query])

  return (
    <div className="relative min-w-0 flex-1" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2.5 text-left"
        style={{ borderColor: "#d0d5dd", color: INK }}
      >
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: "#667085" }}>{label}</div>
          <div className="truncate text-sm font-semibold">
            {selected?.label ?? placeholder}
          </div>
          {selected?.sublabel && (
            <div className="truncate text-xs" style={{ color: "#667085" }}>{selected.sublabel}</div>
          )}
        </div>
        <ChevronDown size={15} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border bg-white shadow-[0_20px_45px_rgba(16,24,40,.14)]"
          style={{ borderColor: "#d0d5dd" }}
        >
          <div className="border-b px-3 py-2.5" style={{ borderColor: "#eef2f6" }}>
            <div className="flex items-center gap-2 rounded-xl border bg-[#f8fafc] px-3" style={{ borderColor: "#e2e8f0" }}>
              <Search size={14} style={{ color: "#667085" }} />
              <input
                autoFocus
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search services, cities, route, time…"
                className="w-full bg-transparent py-2.5 text-sm outline-none"
                style={{ color: INK }}
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            {filtered.map(option => {
              const active = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors"
                  style={{ background: active ? "#eff6ff" : "white" }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold" style={{ color: INK }}>{option.label}</div>
                    {option.sublabel && <div className="truncate text-xs" style={{ color: "#667085" }}>{option.sublabel}</div>}
                  </div>
                  {active && <Check size={15} className="mt-0.5 shrink-0" style={{ color: EUROSTAR_BLUE }} />}
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-8 text-center text-sm" style={{ color: "#667085" }}>
                No matching Eurostar services found.
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}

export function EurostarNotifications({
  onClose,
  onAsk,
}: {
  readonly onClose: () => void
  readonly onAsk?: (query: string) => void
}) {
  const [date, setDate] = useState(todayDate())
  const [data, setData] = useState<NotificationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshSecs, setRefreshSecs] = useState(60)
  const [countdown, setCountdown] = useState(60)
  const [showRefreshMenu, setShowRefreshMenu] = useState(false)
  const [rules, setRules] = useState<SavedRule[]>(() => loadStoredRules())
  const [catalog, setCatalog] = useState<EurostarCatalogResponse | null>(() => loadStoredCatalog(todayDate()))
  const [selectedService, setSelectedService] = useState("")
  const [selectedRoute, setSelectedRoute] = useState("")
  const fetchRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cdRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const next = await loadNotifications(date)
      setData(next)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Eurostar notifications are unavailable")
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { void load() }, [load])
  useEffect(() => { saveStoredRules(rules) }, [rules])

  useEffect(() => {
    let cancelled = false
    const cached = loadStoredCatalog(date)
    if (cached) setCatalog(cached)

    async function loadCatalog() {
      try {
        const response = await fetch(`${API}/api/eurostar/catalog?date=${date}`)
        if (!response.ok) return
        const next = await response.json() as EurostarCatalogResponse
        if (cancelled) return
        setCatalog(next)
        saveStoredCatalog(next)
      } catch {
        // Keep the existing catalog if live refresh fails.
      }
    }

    void loadCatalog()
    return () => { cancelled = true }
  }, [date])

  useEffect(() => {
    if (fetchRef.current) clearInterval(fetchRef.current)
    if (cdRef.current) clearInterval(cdRef.current)
    if (refreshSecs === 0) return undefined

    setCountdown(refreshSecs)
    cdRef.current = setInterval(() => setCountdown(value => Math.max(0, value - 1)), 1_000)
    fetchRef.current = setInterval(() => {
      void load()
      setCountdown(refreshSecs)
    }, refreshSecs * 1_000)

    return () => {
      if (fetchRef.current) clearInterval(fetchRef.current)
      if (cdRef.current) clearInterval(cdRef.current)
    }
  }, [refreshSecs, load])

  const alerts = useMemo(() => data ? buildAlerts(data) : [], [data])
  const ruleAlerts = useMemo(() => data ? buildRuleMatches(data, rules) : [], [data, rules])
  const criticalCount = alerts.filter(alert => alert.tone === "critical").length
  const warningCount = alerts.filter(alert => alert.tone === "warning").length
  const departureCount = alerts.filter(alert => alert.id.startsWith("depart-")).length
  const refreshLabel = REFRESH_OPTIONS.find(option => option.seconds === refreshSecs)?.label ?? "60s"
  const routeOptions = useMemo(() => {
    const pairs = new Set<string>()
    for (const train of catalog?.services ?? []) {
      pairs.add(train.routeKey)
    }
    return [...pairs].sort()
  }, [catalog])
  const serviceOptions = useMemo<SearchableOption[]>(() => {
    return (catalog?.services ?? [])
      .slice()
      .sort((a, b) => a.departureDateTime.localeCompare(b.departureDateTime))
      .map(service => ({
        value: normalizeServiceCode(service.serviceCode),
        label: `${normalizeServiceCode(service.serviceCode) || service.serviceCode} · ${service.originName} -> ${service.destinationName}`,
        sublabel: `${fmtTime(service.departureDateTime)} departure · ${service.status}`,
      }))
  }, [catalog])
  const routeSelectOptions = useMemo<SearchableOption[]>(() => {
    return routeOptions.map(route => {
      const [origin, destination] = route.split("|||")
      return {
        value: route,
        label: `${origin} -> ${destination}`,
        sublabel: "Watch all scheduled services on this corridor",
      }
    })
  }, [routeOptions])

  const toggleRule = (id: string) => setRules(current => current.map(rule => rule.id === id ? { ...rule, enabled: !rule.enabled } : rule))
  const removeRule = (id: string) => setRules(current => current.filter(rule => rule.id !== id || DEFAULT_RULES.some(base => base.id === id)))
  const addServiceRule = () => {
    const code = normalizeServiceCode(selectedService)
    if (!code) return
    setRules(current => [
      {
        id: `service-watch-${code}`,
        label: `Service ${code}`,
        detail: `Watch live status and departures for service ${code}`,
        tone: "#3b82f6",
        kind: "service-watch",
        enabled: true,
        serviceCode: code,
      },
      ...current.filter(rule => rule.id !== `service-watch-${code}`),
    ])
    setSelectedService("")
  }
  const addRouteRule = () => {
    if (!selectedRoute) return
    const [origin, destination] = selectedRoute.split("|||")
    if (!origin || !destination) return
    const id = `route-watch-${origin}-${destination}`.replaceAll(/\s+/g, "-").toLowerCase()
    setRules(current => [
      {
        id,
        label: `${origin} to ${destination}`,
        detail: `Watch departures and changes on the ${origin} to ${destination} corridor`,
        tone: "#0ea5e9",
        kind: "route-watch",
        enabled: true,
        origin,
        destination,
      },
      ...current.filter(rule => rule.id !== id),
    ])
  }

  return (
    <motion.div
      className="fixed inset-0 z-[72] flex flex-col overflow-hidden"
      style={{ background: "#f7f5ef" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <header className="shrink-0 border-b bg-white" style={{ borderColor: "#e4e7ec" }}>
        <div className="flex items-center gap-3 px-5 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: EUROSTAR_BLUE, color: "white" }}>
            <Bell size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-black uppercase" style={{ color: INK }}>Eurostar Notifications</h1>
            <p className="text-xs" style={{ color: "#667085" }}>Live arrivals, departures, disruptions, load and crew-triggered alerts</p>
          </div>
          {refreshSecs > 0 && (
            <span className="rounded-lg border px-2.5 py-1 text-xs font-black tabular-nums" style={{ borderColor: "#bfdbfe", color: EUROSTAR_BLUE, background: "#eff6ff" }}>
              {countdown}s
            </span>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowRefreshMenu(value => !value)}
              className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-bold"
              style={{ borderColor: "#d0d5dd", color: INK }}
            >
              <RefreshCw size={13} />
              {refreshLabel}
              <ChevronDown size={13} />
            </button>
            {showRefreshMenu && (
              <div className="absolute right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border bg-white shadow-xl" style={{ borderColor: "#d0d5dd", minWidth: 112 }}>
                {REFRESH_OPTIONS.map(option => (
                  <button
                    key={`${option.label}-${option.seconds}`}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-xs font-bold"
                    style={{
                      background: option.label === refreshLabel ? "#eff6ff" : "white",
                      color: option.label === refreshLabel ? EUROSTAR_BLUE : "#475467",
                    }}
                    onClick={() => {
                      setRefreshSecs(option.seconds)
                      setCountdown(option.seconds)
                      setShowRefreshMenu(false)
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            type="date"
            value={date}
            onChange={event => setDate(event.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "#d0d5dd", color: INK }}
          />
          <button type="button" onClick={() => void load()} className="flex h-9 w-9 items-center justify-center rounded-lg border bg-white" style={{ borderColor: "#d0d5dd", color: "#475467" }}>
            <motion.span animate={loading ? { rotate: 360 } : { rotate: 0 }} transition={{ duration: 0.7, repeat: loading ? Infinity : 0, ease: "linear" }} className="flex">
              <RefreshCw size={15} />
            </motion.span>
          </button>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg border bg-white" style={{ borderColor: "#d0d5dd", color: "#475467" }}>
            <X size={16} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-5">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold" style={{ background: "#fff1f3", borderColor: "#fecdd3", color: "#be123c" }}>
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        <section className="mb-5 grid grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)] gap-4 max-xl:grid-cols-1">
          <div className="relative overflow-hidden rounded-[28px] border p-5" style={{ background: `linear-gradient(135deg, ${EUROSTAR_BLUE} 0%, #0f2f5f 58%, #111827 100%)`, borderColor: "rgba(0,51,102,0.18)", color: "white" }}>
            <motion.div
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)" }}
              animate={{ x: ["-100%", "100%"] }}
              transition={{ duration: 3.8, repeat: Infinity, ease: "linear" }}
            />
            <div className="mb-2 flex items-center gap-2">
              <motion.span className="h-2 w-2 rounded-full" style={{ background: "#67e8f9" }} animate={{ opacity: [1, 0.25, 1], scale: [1, 1.8, 1] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }} />
              <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: "#bfdbfe" }}>Notification center</p>
            </div>
            <h2 className="text-3xl font-black tracking-tight">Live Eurostar alerting</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: "rgba(255,255,255,0.72)" }}>
              This page turns your current Eurostar feeds into operational notifications for near departures, last trains, disruptions, crowding and crew-linked risk.
            </p>
            <div className="mt-5 grid grid-cols-4 gap-3 max-md:grid-cols-2">
              <MetricTile label="Alerts live" value={alerts.length} sub="currently surfaced on this page" tone="#7dd3fc" />
              <MetricTile label="Critical" value={criticalCount} sub="cancelled, suspended or severe risk" tone="#ef4444" />
              <MetricTile label="Watch" value={warningCount} sub="requires operator attention" tone="#f59e0b" />
              <MetricTile label="Soon" value={departureCount} sub="departures inside 30 minutes" tone={EUROSTAR_GOLD} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-[24px] border bg-white px-4 py-4 shadow-[0_10px_28px_rgba(0,0,0,.04)]" style={{ borderColor: "#e7ecf3" }}>
              <div className="text-sm font-black" style={{ color: INK }}>Create saved rule</div>
              <div className="mt-1 text-xs" style={{ color: "#667085" }}>
                Persist a service or route watch directly in the browser for quick demos. The Eurostar service list is cached and refreshed every 24 hours.
              </div>
              <div className="mt-3 flex gap-2">
                <SearchableSelect
                  label="Service"
                  placeholder={catalog ? `Choose from ${catalog.count} Eurostar services` : "Loading Eurostar services…"}
                  value={selectedService}
                  options={serviceOptions}
                  onChange={setSelectedService}
                />
                <button type="button" onClick={addServiceRule} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-black" style={{ borderColor: "#bfdbfe", background: "#eff6ff", color: EUROSTAR_BLUE }}>
                  <Plus size={13} />
                  Service
                </button>
              </div>
              <div className="mt-2 flex gap-2">
                <SearchableSelect
                  label="Route"
                  placeholder={catalog ? `Choose from ${catalog.routeCount} live routes` : "Loading live routes…"}
                  value={selectedRoute}
                  options={routeSelectOptions}
                  onChange={setSelectedRoute}
                />
                <button type="button" onClick={addRouteRule} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-black" style={{ borderColor: "#bfdbfe", background: "#eff6ff", color: EUROSTAR_BLUE }}>
                  <Plus size={13} />
                  Route
                </button>
              </div>
            </div>

            {rules.map(rule => (
              <div key={rule.id} className="rounded-[24px] border bg-white px-4 py-4 shadow-[0_10px_28px_rgba(0,0,0,.04)]" style={{ borderColor: "#e7ecf3" }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-black" style={{ color: INK }}>{rule.label}</div>
                    <div className="mt-1 text-xs" style={{ color: "#667085" }}>{rule.detail}</div>
                  </div>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: rule.tone }} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => toggleRule(rule.id)}
                    className="rounded-full border px-3 py-1 text-[11px] font-black"
                    style={{ borderColor: rule.enabled ? "#bbf7d0" : "#d0d5dd", background: rule.enabled ? "#ecfdf3" : "#f8fafc", color: rule.enabled ? "#047857" : "#667085" }}
                  >
                    {rule.enabled ? "Enabled" : "Paused"}
                  </button>
                  {!DEFAULT_RULES.some(base => base.id === rule.id) && (
                    <button type="button" onClick={() => removeRule(rule.id)} className="rounded-full border px-3 py-1 text-[11px] font-black" style={{ borderColor: "#fecaca", background: "#fff1f2", color: "#be123c" }}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-5 rounded-[28px] border bg-white p-4" style={{ borderColor: "#e2e8f0" }}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.16em]" style={{ color: INK }}>Saved rule matches</div>
              <div className="text-xs" style={{ color: "#667085" }}>Alerts produced specifically by your enabled notification rules</div>
            </div>
            <div className="rounded-full border px-3 py-1.5 text-[11px] font-black" style={{ borderColor: "#dbe7f3", background: "#f8fbff", color: "#475467" }}>
              {ruleAlerts.length} matches
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {ruleAlerts.map(alert => {
              const meta = toneMeta(alert.tone)
              return (
                <motion.div key={alert.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-[24px] border px-4 py-4" style={{ borderColor: meta.border, background: meta.bg }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.dot }} />
                        <div className="text-base font-black" style={{ color: INK }}>{alert.title}</div>
                      </div>
                      <div className="mt-1 text-sm" style={{ color: "#475467" }}>{alert.message}</div>
                    </div>
                    <span className="rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]" style={{ borderColor: meta.border, color: meta.text, background: "rgba(255,255,255,0.72)" }}>
                      {alert.matchedRules?.[0] ?? alert.tone}
                    </span>
                  </div>
                  {onAsk && alert.ask && (
                    <button type="button" className="mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black" style={{ borderColor: "#bfdbfe", background: "#eff6ff", color: EUROSTAR_BLUE }} onClick={() => { onClose(); onAsk(alert.ask!) }}>
                      <Bell size={12} />
                      Ask from this match
                    </button>
                  )}
                </motion.div>
              )
            })}
            {ruleAlerts.length === 0 && (
              <div className="col-span-full rounded-[24px] border border-dashed px-6 py-8 text-center" style={{ borderColor: "#d0d5dd", color: "#667085" }}>
                No enabled rules are matching the live Eurostar feed right now.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[28px] border bg-white p-4" style={{ borderColor: "#e2e8f0" }}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.16em]" style={{ color: INK }}>Live alert feed</div>
              <div className="text-xs" style={{ color: "#667085" }}>Auto-composed from watchlist, departures, last train and traveler load</div>
            </div>
            <div className="rounded-full border px-3 py-1.5 text-[11px] font-black" style={{ borderColor: "#dbe7f3", background: "#f8fbff", color: "#475467" }}>
              {date}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {alerts.map(alert => {
              const meta = toneMeta(alert.tone)
              return (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-[24px] border px-4 py-4"
                  style={{ borderColor: meta.border, background: meta.bg }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.dot }} />
                        <div className="text-base font-black" style={{ color: INK }}>{alert.title}</div>
                      </div>
                      <div className="mt-1 text-sm" style={{ color: "#475467" }}>{alert.message}</div>
                    </div>
                    <span className="rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]" style={{ borderColor: meta.border, color: meta.text, background: "rgba(255,255,255,0.72)" }}>
                      {alert.tone}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-2xl border px-3 py-2.5" style={{ borderColor: "#e2e8f0", background: "rgba(255,255,255,0.74)" }}>
                      <div className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: "#667085" }}>Time</div>
                      <div className="mt-1 text-sm font-black" style={{ color: INK }}>{alert.timeLabel}</div>
                    </div>
                    <div className="rounded-2xl border px-3 py-2.5" style={{ borderColor: "#e2e8f0", background: "rgba(255,255,255,0.74)" }}>
                      <div className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: "#667085" }}>Route</div>
                      <div className="mt-1 text-sm font-black" style={{ color: INK }}>{alert.routeLabel}</div>
                    </div>
                    <div className="rounded-2xl border px-3 py-2.5" style={{ borderColor: "#e2e8f0", background: "rgba(255,255,255,0.74)" }}>
                      <div className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: "#667085" }}>Service</div>
                      <div className="mt-1 text-sm font-black" style={{ color: INK }}>{alert.serviceCode ?? "Network"}</div>
                    </div>
                  </div>

                  {onAsk && alert.ask && (
                    <button
                      type="button"
                      className="mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black"
                      style={{ borderColor: "#bfdbfe", background: "#eff6ff", color: EUROSTAR_BLUE }}
                      onClick={() => { onClose(); onAsk(alert.ask!) }}
                    >
                      {alert.tone === "critical" ? <Siren size={12} /> : alert.id.startsWith("depart-") ? <Clock3 size={12} /> : alert.id.startsWith("load-") ? <Users size={12} /> : alert.id === "all-clear" ? <CheckCircle2 size={12} /> : <Train size={12} />}
                      Ask from this alert
                    </button>
                  )}
                </motion.div>
              )
            })}
          </div>
        </section>
      </main>
    </motion.div>
  )
}
