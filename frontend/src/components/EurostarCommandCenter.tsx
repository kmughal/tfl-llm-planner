import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  CircleDot,
  Clock,
  Globe2,
  Gauge,
  Map as MapIcon,
  MapPin,
  MessagesSquare,
  Moon,
  Phone,
  RefreshCw,
  Route,
  Rows3,
  ShieldCheck,
  Sun,
  Train,
  TrendingUp,
  Users,
  Eye,
  X,
  Bell,
} from "lucide-react"
import { useEurostarDisplay } from "./EurostarDisplay"
import { readResponseState, responseSourceMeta, staleLabel, type ResponseState } from "../lib/responseState"
import { DisabledServiceBanner, ServicePowerBadge } from "./ServicePowerBadge"

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? ""

const EUROSTAR_BLUE = "#003366"
const EUROSTAR_GOLD = "#C89A0C"
const CHANNEL_BLUE = "#0072CE"
const INK = "#101828"

type EuromapStation = {
  sequenceNumber: number
  stopType: string
  country?: string
  shortCode: string
  latitude?: string
  longitude?: string
  departureDateTime?: string
  arrivalDatetime?: string
}

type EuromapPlan = {
  range: string
  status: string
  planID: string
  planType: string
  serviceCode: string
  departureDateTime: string
  arrivalDateTime: string
  stations: EuromapStation[]
}

type EnrichedCrew = {
  crewType: string
  crewId: string
  firstName: string
  lastName: string
  phone: string
  homeDepot: string
  serviceCode: string
  origin: string
  destination: string
  departure: string
  arrival: string
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

type HubData = {
  trains: EuromapPlan[]
  crew: EnrichedCrew[]
  traveler: TravelerSummary | null
  watchlist: EurostarWatchlist | null
  fetchedAt: Date
  issues: string[]
  responseStates?: ResponseState[]
}

type TrainFilter = "all" | "active" | "watch" | "crew"

const REFRESH_OPTIONS = [
  { label: "30s", seconds: 30 },
  { label: "1 min", seconds: 60 },
  { label: "2 min", seconds: 120 },
  { label: "5 min", seconds: 300 },
  { label: "Manual", seconds: 0 },
] as const

const STATION_NAMES: Record<string, string> = {
  SPX: "London St Pancras",
  PNO: "Paris Gare du Nord",
  BXL: "Brussels-Midi",
  BRU: "Brussels-Midi",
  LIL: "Lille Europe",
  LEW: "Lille Europe",
  AMS: "Amsterdam Centraal",
  ASD: "Amsterdam Centraal",
  RTD: "Rotterdam Centraal",
  RDM: "Rotterdam Centraal",
  EBF: "Ebbsfleet International",
  EBD: "Ebbsfleet International",
  ASH: "Ashford International",
  AFK: "Ashford International",
  CFR: "Calais-Frethun",
  FTN: "Calais-Frethun",
  MVC: "Marne-la-Vallee Chessy",
}

const MARKET_LABELS: Record<string, string> = {
  "SPX-PNO": "London - Paris",
  "PNO-SPX": "Paris - London",
  "SPX-BXL": "London - Brussels",
  "BXL-SPX": "Brussels - London",
  "SPX-BRU": "London - Brussels",
  "BRU-SPX": "Brussels - London",
  "SPX-ASD": "London - Amsterdam",
  "ASD-SPX": "Amsterdam - London",
  "SPX-AMS": "London - Amsterdam",
  "AMS-SPX": "Amsterdam - London",
  "SPX-RTD": "London - Rotterdam",
  "RTD-SPX": "Rotterdam - London",
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function fmtISOTime(iso: string | undefined): string {
  if (!iso) return "--:--"
  try {
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  } catch {
    return "--:--"
  }
}

function fmtClock(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function fmtDuration(dep: string, arr: string): string {
  const start = new Date(dep).getTime()
  const end = new Date(arr).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "-"
  const mins = Math.round((end - start) / 60_000)
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}`
}

function minsUntil(iso: string | undefined, now: number): number | null {
  if (!iso) return null
  const target = new Date(iso).getTime()
  if (!Number.isFinite(target)) return null
  return Math.max(0, Math.round((target - now) / 60_000))
}

function isTrainActive(plan: EuromapPlan, now: number): boolean {
  const dep = new Date(plan.departureDateTime).getTime()
  const arr = new Date(plan.arrivalDateTime).getTime()
  return dep > 0 && arr > 0 && dep <= now && now <= arr
}

function isWatchStatus(status: string): boolean {
  const s = status.toUpperCase()
  return s.includes("DELAY") || s.includes("CANCEL") || s.includes("DELETE") || s.includes("SUSPEND") || s.includes("DISRUPT")
}

function originStation(plan: EuromapPlan): EuromapStation | undefined {
  return plan.stations.find(s => s.stopType?.toLowerCase() === "origin") ?? plan.stations[0]
}

function destStation(plan: EuromapPlan): EuromapStation | undefined {
  return plan.stations.find(s => s.stopType?.toLowerCase() === "destination") ?? plan.stations.at(-1)
}

function stationName(code: string): string {
  return STATION_NAMES[code?.toUpperCase()] ?? code
}

function originCode(plan: EuromapPlan): string {
  return originStation(plan)?.shortCode ?? "TBC"
}

function destCode(plan: EuromapPlan): string {
  return destStation(plan)?.shortCode ?? "TBC"
}

function marketLabel(plan: EuromapPlan): string {
  const key = `${originCode(plan)}-${destCode(plan)}`
  return MARKET_LABELS[key] ?? `${stationName(originCode(plan))} - ${stationName(destCode(plan))}`
}

function directionLabel(plan: EuromapPlan): "Outbound" | "Inbound" | "Continental" {
  if (originStation(plan)?.country === "GB") return "Outbound"
  if (destStation(plan)?.country === "GB") return "Inbound"
  return "Continental"
}

function statusLabel(status: string): string {
  const s = status.toUpperCase()
  if (s === "ON_TIME" || s === "ACTIVE") return "On time"
  if (s.includes("DELAY")) return "Delayed"
  if (s.includes("CANCEL") || s.includes("DELETE")) return "Cancelled"
  if (s.includes("SUSPEND")) return "Suspended"
  return status ? status.replaceAll("_", " ").toLowerCase() : "Scheduled"
}

function statusTone(status: string): { bg: string; border: string; text: string; dot: string } {
  if (isWatchStatus(status)) {
    return { bg: "#fff4e5", border: "#fed7aa", text: "#9a3412", dot: "#f97316" }
  }
  return { bg: "#ecfdf3", border: "#bbf7d0", text: "#047857", dot: "#10b981" }
}

function crewRoleLabel(crewType: string): string {
  switch (crewType) {
    case "TRAIN_DRIVER":
      return "Driver"
    case "TRAIN_MANAGER_A":
      return "Train manager A"
    case "TRAIN_MANAGER_B":
      return "Train manager B"
    default:
      return crewType.replaceAll("_", " ").toLowerCase()
  }
}

function normalizeServiceCode(value: string): string {
  return value.replaceAll(/\D/g, "").replace(/^0+/, "").slice(-4)
}

function travelerLeadClass(classes: Record<string, number>): string {
  let winner = ""
  let max = 0
  for (const [key, value] of Object.entries(classes)) {
    if (value > max) {
      winner = key
      max = value
    }
  }
  return winner
}

const TRAVELER_CLASS_META: Record<string, { label: string; color: string; glow: string }> = {
  standard: { label: "Standard", color: "#0ea5e9", glow: "rgba(14,165,233,0.18)" },
  comfort: { label: "Comfort", color: "#f59e0b", glow: "rgba(245,158,11,0.18)" },
  premium: { label: "Premium", color: "#1d4ed8", glow: "rgba(29,78,216,0.18)" },
}

const TRAVELER_TYPE_META: Record<string, { label: string; color: string }> = {
  normal: { label: "Adult", color: "#334155" },
  youth: { label: "Youth", color: "#b45309" },
  senior: { label: "Senior", color: "#047857" },
  kid: { label: "Child", color: "#7c3aed" },
  group: { label: "Group", color: "#2563eb" },
  vip: { label: "VIP", color: "#be185d" },
  pmr: { label: "PMR", color: "#1d4ed8" },
}

function travelerClassMeta(key: string) {
  return TRAVELER_CLASS_META[key] ?? { label: key.replace(/-/g, " "), color: "#64748b", glow: "rgba(100,116,139,0.18)" }
}

function travelerTypeMeta(key: string) {
  return TRAVELER_TYPE_META[key] ?? { label: key.replace(/-/g, " "), color: "#64748b" }
}

function TravelerLoadProfile({
  classEntries,
  totalCount,
}: {
  readonly classEntries: Array<[string, number]>
  readonly totalCount: number
}) {
  const graphEntries = classEntries.map(([key, value]) => ({
    key,
    value,
    share: totalCount > 0 ? Math.round((value / totalCount) * 100) : 0,
    meta: travelerClassMeta(key),
  }))
  const width = 320
  const height = 120
  const maxShare = Math.max(...graphEntries.map(entry => entry.share), 1)
  const step = graphEntries.length > 1 ? width / (graphEntries.length - 1) : width
  const points = graphEntries.map((entry, index) => {
    const x = index * step
    const y = height - (entry.share / maxShare) * 74 - 18
    return { x, y, entry }
  })
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")
  const area = `${path} L ${width} ${height} L 0 ${height} Z`

  return (
    <div className="rounded-[22px] border px-4 py-4" style={{ borderColor: "#dbe7f3", background: "linear-gradient(180deg, rgba(247,250,255,0.98), rgba(255,255,255,0.96))" }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "#667085" }}>
          Load profile
        </div>
        <div className="text-[11px] font-semibold" style={{ color: "#667085" }}>
          Share by cabin
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full overflow-visible">
        <defs>
          <linearGradient id="traveler-load-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.03" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#traveler-load-area)" />
        <path d={path} fill="none" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => (
          <motion.g
            key={point.entry.key}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.28, delay: 0.1 + index * 0.08 }}
          >
            <circle cx={point.x} cy={point.y} r="7" fill="white" stroke={point.entry.meta.color} strokeWidth="3" />
            <text x={point.x} y={point.y - 14} textAnchor="middle" fontSize="10" fontWeight="800" fill={point.entry.meta.color}>
              {point.entry.share}%
            </text>
            <text x={point.x} y={height - 2} textAnchor="middle" fontSize="10" fontWeight="700" fill="#667085">
              {point.entry.meta.label}
            </text>
          </motion.g>
        ))}
      </svg>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {graphEntries.map((entry, index) => (
          <motion.div
            key={entry.key}
            className="rounded-2xl border bg-white px-3 py-2.5"
            style={{ borderColor: "#e2e8f0" }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: 0.18 + index * 0.08 }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: entry.meta.color }} />
                <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: "#475467" }}>
                  {entry.meta.label}
                </span>
              </div>
              <span className="text-lg font-black tabular-nums" style={{ color: INK }}>{entry.value}</span>
            </div>
            <div className="mt-1 text-[11px] font-semibold" style={{ color: "#667085" }}>{entry.share}% of onboard load</div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function TravelerMixChart({ traveler }: { readonly traveler: TravelerService }) {
  const classEntries = Object.entries(traveler.classes).sort((a, b) => b[1] - a[1])
  const typeEntries = Object.entries(traveler.types).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const leadClass = classEntries[0]?.[0]

  return (
    <div className="rounded-[20px] border px-4 py-4" style={{ borderColor: "#dbe7f3", background: "linear-gradient(180deg, rgba(248,251,255,0.96), rgba(255,255,255,0.94))" }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "#667085" }}>
            Passenger load
          </div>
          <div className="mt-1 flex items-end gap-2">
            <span className="text-3xl font-black tabular-nums" style={{ color: INK }}>{traveler.totalCount}</span>
            <span className="pb-1 text-sm" style={{ color: "#667085" }}>on board</span>
          </div>
        </div>
        <div className="rounded-full border px-3 py-1 text-[11px] font-bold" style={{ borderColor: "#dbe7f3", background: "white", color: "#475467" }}>
          Cabin leader <span className="ml-1 font-black" style={{ color: travelerClassMeta(leadClass ?? "standard").color }}>{travelerClassMeta(leadClass ?? "standard").label}</span>
        </div>
      </div>

      <div className="mt-4">
        <TravelerLoadProfile classEntries={classEntries} totalCount={traveler.totalCount} />
      </div>

      {typeEntries.length > 0 && (
        <div className="mt-4 border-t pt-3" style={{ borderColor: "#e2e8f0" }}>
          <div className="mb-2 text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: "#667085" }}>
            Traveler profile
          </div>
          <div className="flex flex-wrap gap-2">
            {typeEntries.map(([key, value], index) => {
              const meta = travelerTypeMeta(key)
              return (
                <motion.div
                  key={key}
                  className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-[11px] font-bold"
                  style={{ borderColor: "#e2e8f0", color: "#475467" }}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.22, delay: 0.28 + index * 0.06 }}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
                  <span>{meta.label}</span>
                  <span className="font-black tabular-nums" style={{ color: INK }}>{value}</span>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

async function fetchHubData(date: string): Promise<HubData> {
  const [trainsRes, crewRes, travelerRes, watchlistRes] = await Promise.allSettled([
    fetch(`${API}/api/eurostar/trains?date=${date}`),
    fetch(`${API}/api/crew/activities?date=${date}`),
    fetch(`${API}/api/eurostar/traveler-summary?date=${date}`),
    fetch(`${API}/api/eurostar/watchlist?date=${date}`),
  ])

  const issues: string[] = []
  let trains: EuromapPlan[] = []
  let crew: EnrichedCrew[] = []
  let traveler: TravelerSummary | null = null
  let watchlist: EurostarWatchlist | null = null
  const responseStates: ResponseState[] = []

  if (trainsRes.status === "fulfilled" && trainsRes.value.ok) {
    const body = await trainsRes.value.json() as EuromapPlan[]
    responseStates.push(readResponseState(trainsRes.value, body))
    trains = body
  } else if (trainsRes.status === "fulfilled") {
    const body = await trainsRes.value.json().catch(() => ({}))
    const responseState = readResponseState(trainsRes.value, body)
    if (responseState.disabled) {
      responseStates.push(responseState)
      issues.push(responseState.error || "Eurostar has been disabled in Config > Services.")
    } else {
      throw new Error((body as { error?: string }).error || "Euromap service plans are unavailable.")
    }
  } else {
    issues.push("Euromap service plans are unavailable. Check the Eurostar API credentials and connection.")
  }

  if (crewRes.status === "fulfilled" && crewRes.value.ok) {
    const body = await crewRes.value.json() as EnrichedCrew[]
    responseStates.push(readResponseState(crewRes.value, body))
    crew = body
  } else {
    issues.push("Start-on-Time crew activity is unavailable. Service plans can still be used without crew coverage.")
  }

  if (travelerRes.status === "fulfilled" && travelerRes.value.ok) {
    const body = await travelerRes.value.json() as TravelerSummary
    responseStates.push(readResponseState(travelerRes.value, body))
    traveler = body
  } else {
    issues.push("Traveler summary is unavailable. The board is showing services without passenger load.")
  }

  if (watchlistRes.status === "fulfilled" && watchlistRes.value.ok) {
    const body = await watchlistRes.value.json() as EurostarWatchlist
    responseStates.push(readResponseState(watchlistRes.value, body))
    watchlist = body
  } else {
    issues.push("Operational watchlist is unavailable. Attention scoring is temporarily offline.")
  }

  return { trains, crew, traveler, watchlist, fetchedAt: new Date(), issues, responseStates }
}

function metricLabel(value: number | string, label: string, sub: string, accent: string) {
  return (
    <div className="rounded-lg border bg-white px-4 py-3" style={{ borderColor: "#eaecf0" }}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#667085" }}>
          {label}
        </span>
        <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
      </div>
      <div className="mt-2 text-3xl font-black tabular-nums" style={{ color: INK }}>
        {value}
      </div>
      <div className="mt-1 text-xs" style={{ color: "#667085" }}>
        {sub}
      </div>
    </div>
  )
}

function SectionHeader({
  icon,
  title,
  detail,
}: {
  readonly icon: React.ReactNode
  readonly title: string
  readonly detail?: string
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg"
        style={{ background: "#f2f4f7", color: EUROSTAR_BLUE }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-black uppercase tracking-wide" style={{ color: INK }}>
          {title}
        </h2>
        {detail && <p className="text-xs" style={{ color: "#667085" }}>{detail}</p>}
      </div>
    </div>
  )
}

function CommandButton({
  icon,
  label,
  query,
  onAsk,
}: {
  readonly icon: React.ReactNode
  readonly label: string
  readonly query: string
  readonly onAsk?: (query: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onAsk?.(query)}
      className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-left text-xs font-bold transition"
      style={{ borderColor: "#d0d5dd", color: INK }}
      disabled={!onAsk}
      title={query}
    >
      <span style={{ color: EUROSTAR_BLUE }}>{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}

function AnimatedHeroValue({
  value,
  className,
  style,
}: {
  readonly value: number | string
  readonly className?: string
  readonly style?: React.CSSProperties
}) {
  return (
    <AnimatePresence mode="popLayout">
      <motion.div
        key={String(value)}
        className={className}
        style={style}
        initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
        transition={{ duration: 0.32, ease: "easeOut" }}
      >
        {value}
      </motion.div>
    </AnimatePresence>
  )
}

function HeroMetric({
  value,
  label,
  tone,
}: {
  readonly value: number | string
  readonly label: string
  readonly tone: string
}) {
  return (
    <motion.div
      className="relative overflow-hidden rounded-lg p-3"
      style={{ background: "rgba(255,255,255,0.09)" }}
      animate={{ boxShadow: [`0 0 0 0 ${tone}00`, `0 0 0 1px ${tone}55`, `0 0 0 0 ${tone}00`] }}
      transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
    >
      <motion.div
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: tone }}
        animate={{ opacity: [0.35, 1, 0.35] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />
      <AnimatedHeroValue value={value} className="text-2xl font-black tabular-nums" />
      <div className="text-xs" style={{ color: "rgba(255,255,255,0.66)" }}>{label}</div>
    </motion.div>
  )
}

function serviceAlertMeta(watchItem?: EurostarWatchlistItem) {
  if (!watchItem) {
    return {
      border: "#eaecf0",
      glow: "none",
      bg: "white",
      hover: "#f8fbff",
      ribbon: CHANNEL_BLUE,
      bannerBg: "",
      bannerBorder: "",
      bannerText: "",
      label: "",
    }
  }
  if (watchItem.severity === "critical") {
    return {
      border: "#fca5a5",
      glow: "0 0 0 3px rgba(239,68,68,0.12)",
      bg: "linear-gradient(180deg, rgba(255,247,247,0.98), rgba(255,255,255,0.96))",
      hover: "#fff1f2",
      ribbon: "#ef4444",
      bannerBg: "#fff1f2",
      bannerBorder: "#fecdd3",
      bannerText: "#991b1b",
      label: "Critical service",
    }
  }
  return {
    border: "#fdba74",
    glow: "0 0 0 3px rgba(245,158,11,0.12)",
    bg: "linear-gradient(180deg, rgba(255,251,235,0.98), rgba(255,255,255,0.96))",
    hover: "#fff7ed",
    ribbon: "#f59e0b",
    bannerBg: "#fff7ed",
    bannerBorder: "#fed7aa",
    bannerText: "#9a3412",
    label: "Attention service",
  }
}

function ServiceRow({
  plan,
  hasCrew,
  traveler,
  active,
  watchItem,
  selected,
  onSelect,
}: {
  readonly plan: EuromapPlan
  readonly hasCrew: boolean
  readonly traveler?: TravelerService
  readonly active: boolean
  readonly watchItem?: EurostarWatchlistItem
  readonly selected: boolean
  readonly onSelect: () => void
}) {
  const tone = statusTone(plan.status)
  const alert = serviceAlertMeta(watchItem)
  const stops = plan.stations.length
  const leadClass = traveler ? travelerLeadClass(traveler.classes) : ""

  return (
    <motion.button
      type="button"
      layout
      className="eurostar-service-card group relative flex min-h-[176px] w-full flex-col overflow-hidden rounded-lg border bg-white p-4 text-left transition"
      style={{
        borderColor: selected ? CHANNEL_BLUE : watchItem ? alert.border : active ? "#7dd3fc" : "#eaecf0",
        background: watchItem ? alert.bg : "white",
        boxShadow: selected
          ? "0 0 0 3px rgba(0,114,206,0.16)"
          : watchItem ? alert.glow
          : active ? "0 0 0 3px rgba(0,114,206,0.09)" : "none",
      }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -1, borderColor: watchItem ? alert.ribbon : CHANNEL_BLUE, backgroundColor: watchItem ? alert.hover : "#f8fbff" }}
      whileTap={{ scale: 0.995 }}
      transition={{ duration: 0.18 }}
      onClick={onSelect}
      aria-expanded={selected}
    >
      <motion.span
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: watchItem ? alert.ribbon : active ? CHANNEL_BLUE : tone.dot }}
        animate={active || watchItem ? { opacity: [0.45, 1, 0.45] } : undefined}
        transition={{ duration: 1.5, repeat: Infinity }}
      />

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
          {active ? (
            <motion.span
              className="h-2 w-2 rounded-full"
              style={{ background: CHANNEL_BLUE }}
              animate={{ opacity: [1, 0.35, 1] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            />
          ) : (
            <span className="h-2 w-2 rounded-full" style={{ background: "#d0d5dd" }} />
          )}
            <span className="text-lg font-black tabular-nums" style={{ color: INK }}>{plan.serviceCode}</span>
          </div>
          <span className="text-[10px] font-black uppercase tracking-wide" style={{ color: "#667085" }}>{directionLabel(plan)}</span>
        </div>
        <div className="flex items-center gap-2">
          {watchItem && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]"
              style={{ background: alert.bannerBg, borderColor: alert.bannerBorder, color: alert.bannerText }}
            >
              <AlertTriangle size={11} />
              {alert.label}
            </span>
          )}
          <div
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black"
            style={{ background: tone.bg, borderColor: tone.border, color: tone.text }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.dot }} />
            {statusLabel(plan.status)}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div>
          <div className="text-2xl font-black tabular-nums" style={{ color: INK }}>{fmtISOTime(plan.departureDateTime)}</div>
          <div className="truncate text-xs font-bold" style={{ color: "#475467" }}>{stationName(originCode(plan))}</div>
        </div>
        <div className="flex min-w-16 items-center">
          <span className="h-2 w-2 rounded-full border-2 bg-white" style={{ borderColor: EUROSTAR_BLUE }} />
          <span className="relative h-px flex-1 overflow-visible" style={{ background: "#bfdbfe" }}>
            {active && (
              <motion.span
                className="absolute -top-1 h-2 w-4 rounded-full"
                style={{ background: EUROSTAR_GOLD }}
                animate={{ left: ["0%", "calc(100% - 16px)"] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
          </span>
          <span className="h-2 w-2 rounded-full" style={{ background: EUROSTAR_BLUE }} />
        </div>
        <div className="text-right">
          <div className="text-2xl font-black tabular-nums" style={{ color: INK }}>{fmtISOTime(plan.arrivalDateTime)}</div>
          <div className="truncate text-xs font-bold" style={{ color: "#475467" }}>{stationName(destCode(plan))}</div>
        </div>
      </div>

      <div className="mt-auto flex items-center gap-3 border-t pt-3 text-[11px] font-bold" style={{ borderColor: "#f2f4f7", color: "#667085" }}>
        <span>{fmtDuration(plan.departureDateTime, plan.arrivalDateTime)}</span>
        <span>{stops} stops</span>
        {traveler && (
          <span style={{ color: "#0369a1" }}>
            {traveler.totalCount} pax{leadClass ? ` · ${leadClass}` : ""}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5" style={{ color: hasCrew ? "#047857" : "#9a3412" }}>
          {hasCrew ? <BadgeCheck size={13} /> : <AlertTriangle size={13} />}
          {hasCrew ? "Crew linked" : "Crew gap"}
        </span>
        <motion.span animate={{ rotate: selected ? 180 : 0 }} transition={{ duration: 0.18 }}>
          <ChevronDown size={14} />
        </motion.span>
      </div>

      {watchItem && watchItem.reasons.length > 0 && (
        <div
          className="mt-3 rounded-md border px-3 py-2 text-[11px] font-semibold"
          style={{ background: alert.bannerBg, borderColor: alert.bannerBorder, color: alert.bannerText }}
        >
          {watchItem.reasons[0]}
        </div>
      )}
    </motion.button>
  )
}

function CrewCoverage({
  serviceCode,
  members,
}: {
  readonly serviceCode: string
  readonly members: EnrichedCrew[]
}) {
  const service = members[0]
  return (
    <div className="rounded-lg border bg-white p-3" style={{ borderColor: "#eaecf0" }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black tabular-nums" style={{ color: INK }}>{serviceCode}</div>
          <div className="text-[11px]" style={{ color: "#667085" }}>
            {service?.origin || "Origin"} to {service?.destination || "Destination"}
          </div>
        </div>
        <span className="rounded-full px-2 py-1 text-[11px] font-black" style={{ background: "#f2f4f7", color: "#475467" }}>
          {members.length} crew
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {members.slice(0, 3).map(member => {
          const name = [member.firstName, member.lastName].filter(Boolean).join(" ") || member.crewId || "Assigned crew"
          return (
            <div key={`${member.crewId}-${member.crewType}`} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: INK }}>{name}</span>
              <span className="shrink-0" style={{ color: "#667085" }}>{crewRoleLabel(member.crewType)}</span>
              {member.phone && <Phone size={12} style={{ color: "#98a2b3" }} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ServiceDetailPanel({
  plan,
  crewMembers,
  traveler,
  onAsk,
  onClose,
}: {
  readonly plan: EuromapPlan
  readonly crewMembers: EnrichedCrew[]
  readonly traveler?: TravelerService
  readonly onAsk?: (query: string) => void
  readonly onClose: () => void
}) {
  const tone = statusTone(plan.status)
  const stopCount = plan.stations.length
  const hasCrew = crewMembers.length > 0

  return (
    <motion.div
      layout
      className="overflow-hidden rounded-lg border bg-white"
      style={{ borderColor: "#bfdbfe" }}
      initial={{ opacity: 0, height: 0, y: -4 }}
      animate={{ opacity: 1, height: "auto", y: 0 }}
      exit={{ opacity: 0, height: 0, y: -4 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      onClick={onClose}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-4 p-4 max-lg:grid-cols-1">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-lg font-black tabular-nums" style={{ color: INK }}>
                {plan.serviceCode}
              </span>
              <span className="text-sm font-bold" style={{ color: "#475467" }}>
                {stationName(originCode(plan))} to {stationName(destCode(plan))}
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black"
                style={{ background: tone.bg, borderColor: tone.border, color: tone.text }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.dot }} />
                {statusLabel(plan.status)}
              </span>
            </div>
            <button
              type="button"
              onClick={event => {
                event.stopPropagation()
                onClose()
              }}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-black"
              style={{ borderColor: "#d0d5dd", background: "white", color: "#475467" }}
              aria-label={`Close detail for Eurostar service ${plan.serviceCode}`}
            >
              <X size={12} />
              Close
            </button>
          </div>

          <div className="mb-4 grid grid-cols-4 gap-2 max-md:grid-cols-2">
            {[
              { label: "Departs", value: fmtISOTime(plan.departureDateTime), icon: <Clock size={13} /> },
              { label: "Arrives", value: fmtISOTime(plan.arrivalDateTime), icon: <Clock size={13} /> },
              { label: "Duration", value: fmtDuration(plan.departureDateTime, plan.arrivalDateTime), icon: <Activity size={13} /> },
              { label: "Stops", value: stopCount, icon: <MapPin size={13} /> },
            ].map(item => (
              <div key={item.label} className="rounded-lg border px-3 py-2" style={{ borderColor: "#eaecf0", background: "#f9fafb" }}>
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide" style={{ color: "#667085" }}>
                  {item.icon}
                  {item.label}
                </div>
                <div className="text-sm font-black tabular-nums" style={{ color: INK }}>{item.value}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-max items-start px-1">
              {plan.stations.map((station, index) => {
                const stationTime = fmtISOTime(station.departureDateTime || station.arrivalDatetime)
                const terminal = index === 0 || index === plan.stations.length - 1
                return (
                  <div key={`${station.shortCode}-${station.sequenceNumber}`} className="flex items-start">
                    <div className="flex w-24 flex-col items-center text-center">
                      <span className="text-[11px] font-black tabular-nums" style={{ color: terminal ? EUROSTAR_BLUE : "#667085" }}>
                        {stationTime}
                      </span>
                      <span
                        className="my-2 h-3 w-3 rounded-full border-2"
                        style={{ borderColor: EUROSTAR_BLUE, background: terminal ? EUROSTAR_BLUE : "white" }}
                      />
                      <span className="text-[11px] font-bold leading-tight" style={{ color: INK }}>
                        {stationName(station.shortCode)}
                      </span>
                      <span className="mt-0.5 text-[10px]" style={{ color: "#98a2b3" }}>
                        {station.shortCode}
                      </span>
                    </div>
                    {index < plan.stations.length - 1 && (
                      <div className="mt-[25px] h-0.5 w-8 rounded-full" style={{ background: "#bfdbfe" }} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {traveler && (
            <div className="mt-4">
              <TravelerMixChart traveler={traveler} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-lg border p-3" style={{ borderColor: "#eaecf0", background: "#f9fafb" }}>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wide" style={{ color: INK }}>
              <Users size={14} />
              Crew coverage
            </div>
            {hasCrew ? (
              <div className="flex flex-col gap-2">
                {crewMembers.map(member => {
                  const name = [member.firstName, member.lastName].filter(Boolean).join(" ") || member.crewId || "Assigned crew"
                  return (
                    <div key={`${member.crewId}-${member.crewType}-detail`} className="rounded-md bg-white px-2.5 py-2 text-xs">
                      <div className="font-bold" style={{ color: INK }}>{name}</div>
                      <div style={{ color: "#667085" }}>{crewRoleLabel(member.crewType)} · {member.departure} to {member.arrival}</div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md px-2.5 py-2 text-xs" style={{ background: "#fff7ed", color: "#9a3412" }}>
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                No Start-on-Time crew roster is linked to this service yet.
              </div>
            )}
          </div>

          <div className="rounded-lg border p-3" style={{ borderColor: "#eaecf0" }}>
            <div className="mb-2 text-xs font-black uppercase tracking-wide" style={{ color: INK }}>
              Actions
            </div>
            <div className="grid grid-cols-1 gap-2" onClick={event => event.stopPropagation()}>
              <CommandButton
                icon={<Route size={14} />}
                label="Ask for stop detail"
                query={`Show me full stop times for Eurostar service ${plan.serviceCode} today`}
                onAsk={onAsk}
              />
              <CommandButton
                icon={<Users size={14} />}
                label="Ask for crew"
                query={`Show me crew activity for Eurostar service ${plan.serviceCode} today`}
                onAsk={onAsk}
              />
            </div>
          </div>

          <div className="rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: "#eaecf0", color: "#667085" }}>
            Plan ID <span className="font-bold tabular-nums" style={{ color: INK }}>{plan.planID}</span>
          </div>

          {!traveler && (
            <div className="rounded-lg border bg-white px-3 py-2 text-xs" style={{ borderColor: "#eaecf0", color: "#667085" }}>
              Traveler load is not available for this service yet.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export function EurostarCommandCenter({
  onClose,
  onAsk,
  onLoadAnalytics,
  onNotifications,
}: {
  readonly onClose: () => void
  readonly onAsk?: (query: string) => void
  readonly onLoadAnalytics?: () => void
  readonly onNotifications?: () => void
}) {
  const date = todayDate()

  const [data, setData] = useState<HubData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [refreshSecs, setRefreshSecs] = useState(60)
  const [countdown, setCountdown] = useState(60)
  const [showMenu, setShowMenu] = useState(false)
  const [showDisplayMenu, setShowDisplayMenu] = useState(false)
  const { theme: displayTheme, compact, setTheme: setDisplayTheme, setCompact } = useEurostarDisplay()
  const [trainFilter, setTrainFilter] = useState<TrainFilter>("all")
  const [pulseIndex, setPulseIndex] = useState(0)
  const [selectedPlanID, setSelectedPlanID] = useState<string | null>(null)

  const fetchRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cdRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sourceMeta = responseSourceMeta(data?.responseStates?.find(state => state.stale) ?? data?.responseStates?.[0])
  const serviceEnabled = !data?.responseStates?.some(state => state.disabled)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchHubData(date))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Eurostar data")
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    if (fetchRef.current) clearInterval(fetchRef.current)
    if (cdRef.current) clearInterval(cdRef.current)
    if (refreshSecs === 0) return undefined

    setCountdown(refreshSecs)
    cdRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1_000)
    fetchRef.current = setInterval(() => { void load(); setCountdown(refreshSecs) }, refreshSecs * 1_000)

    return () => {
      if (fetchRef.current) clearInterval(fetchRef.current)
      if (cdRef.current) clearInterval(cdRef.current)
    }
  }, [refreshSecs, load])

  useEffect(() => {
    const pulse = setInterval(() => setPulseIndex(i => i + 1), 3_800)
    return () => clearInterval(pulse)
  }, [])

  const trains = data?.trains ?? []
  const crew = data?.crew ?? []
  const traveler = data?.traveler ?? null
  const watchlist = data?.watchlist ?? null

  const crewByService = useMemo(() => {
    const grouped: Record<string, EnrichedCrew[]> = {}
    for (const member of crew) {
      const serviceCode = normalizeServiceCode(member.serviceCode)
      if (!serviceCode) continue
      if (!grouped[serviceCode]) grouped[serviceCode] = []
      grouped[serviceCode].push(member)
    }
    return grouped
  }, [crew])

  const travelerByService = useMemo(() => {
    const grouped: Record<string, TravelerService> = {}
    for (const item of traveler?.items ?? []) {
      const serviceCode = normalizeServiceCode(item.serviceCode)
      if (!serviceCode) continue
      grouped[serviceCode] = item
    }
    return grouped
  }, [traveler])

  const watchByPlanID = useMemo(() => {
    const grouped: Record<string, EurostarWatchlistItem> = {}
    for (const item of watchlist?.items ?? []) {
      grouped[item.planID] = item
    }
    return grouped
  }, [watchlist])

  const routeEntries = useMemo(() => {
    const counts = new Map<string, number>()
    for (const train of trains) {
      const label = marketLabel(train)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [trains])

  const stationEntries = useMemo(() => {
    const counts = new Map<string, number>()
    for (const train of trains) {
      for (const station of train.stations) {
        const label = `${station.shortCode} · ${stationName(station.shortCode)}`
        counts.set(label, (counts.get(label) ?? 0) + 1)
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [trains])

  const activeTrains = trains.filter(t => isTrainActive(t, now))
  const watchTrains = trains.filter(t => isWatchStatus(t.status))
  const crewedServices = new Set(Object.keys(crewByService))
  const uncrewedTrains = trains.filter(t => !crewedServices.has(normalizeServiceCode(t.serviceCode)))
  const nextDeparture = trains
    .filter(t => new Date(t.departureDateTime).getTime() >= now)
    .sort((a, b) => a.departureDateTime.localeCompare(b.departureDateTime))[0]
  const minutesToNext = minsUntil(nextDeparture?.departureDateTime, now)

  const filteredTrains = [...trains]
    .sort((a, b) => a.departureDateTime.localeCompare(b.departureDateTime))
    .filter(train => {
      if (trainFilter === "active") return isTrainActive(train, now)
      if (trainFilter === "watch") return isWatchStatus(train.status)
      if (trainFilter === "crew") return crewedServices.has(train.serviceCode.replaceAll(/\D/g, "").replace(/^0+/, "").slice(-4))
      return true
    })
  const selectedPlan = trains.find(train => train.planID === selectedPlanID)
  const refreshOpt = REFRESH_OPTIONS.find(o => o.seconds === refreshSecs) ?? REFRESH_OPTIONS[1]
  const lastUpdate = data ? fmtClock(data.fetchedAt) : "--:--:--"
  const commandAsk = onAsk
    ? (query: string) => {
        onClose()
        onAsk(query)
      }
    : undefined

  const filters: { id: TrainFilter; label: string; count: number }[] = [
    { id: "all", label: "All services", count: trains.length },
    { id: "active", label: "Running now", count: activeTrains.length },
    { id: "watch", label: "Needs attention", count: watchTrains.length },
    { id: "crew", label: "Crew assigned", count: crewedServices.size },
  ]

  const liveUpdates = [
    {
      icon: <Train size={14} />,
      label: "Next service",
      value: nextDeparture
        ? `${nextDeparture.serviceCode} leaves in ${minutesToNext ?? 0} min for ${stationName(destCode(nextDeparture))}`
        : "No later Eurostar services in the current plan",
      tone: "#bfdbfe",
    },
    {
      icon: <Gauge size={14} />,
      label: "Running now",
      value: `${activeTrains.length} active across ${routeEntries.length} markets`,
      tone: "#7dd3fc",
    },
    {
      icon: <AlertTriangle size={14} />,
      label: "Watchlist",
      value: watchTrains.length > 0
        ? `${watchTrains.length} service${watchTrains.length === 1 ? "" : "s"} need attention`
        : "No delayed or cancelled service flagged",
      tone: watchTrains.length > 0 ? "#fed7aa" : "#bbf7d0",
    },
    {
      icon: <Users size={14} />,
      label: "Crew link",
      value: `${crewedServices.size} crewed services, ${uncrewedTrains.length} still without roster match`,
      tone: "#c4b5fd",
    },
    {
      icon: <Users size={14} />,
      label: "Passenger load",
      value: traveler
        ? `${traveler.totalPassengers.toLocaleString("en-GB")} passengers across ${traveler.services} services`
        : "Traveler summary is waiting for the passenger feed",
      tone: "#f9a8d4",
    },
    {
      icon: <TrendingUp size={14} />,
      label: "Busiest market",
      value: routeEntries[0] ? `${routeEntries[0][0]} with ${routeEntries[0][1]} services` : "Route mix loading",
      tone: "#fde68a",
    },
  ]
  const activeUpdate = liveUpdates[pulseIndex % liveUpdates.length]

  return (
    <motion.div
      className={`eurostar-command-center eurostar-theme-${displayTheme} ${compact ? "eurostar-compact" : ""} fixed inset-0 z-[70] flex flex-col overflow-hidden`}
      style={{ background: "#f7f5ef" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <style>{`
        .eurostar-theme-dark { background: #0b1220 !important; color: #f8fafc; }
        .eurostar-theme-dark header, .eurostar-theme-dark footer,
        .eurostar-theme-dark main section:not(:first-of-type), .eurostar-theme-dark main aside > div,
        .eurostar-theme-dark main button { background-color: #111c2e; border-color: #2a3a52 !important; }
        .eurostar-theme-dark .bg-white { background-color: #111c2e !important; }
        .eurostar-theme-dark header h1, .eurostar-theme-dark header p,
        .eurostar-theme-dark header button, .eurostar-theme-dark footer { color: #f8fafc !important; }
        .eurostar-theme-dark main [style*="color: rgb(16, 24, 40)"],
        .eurostar-theme-dark main [style*="color: #101828"] { color: #f8fafc !important; }
        .eurostar-theme-dark main [style*="color: rgb(71, 84, 103)"],
        .eurostar-theme-dark main [style*="color: #475467"] { color: #cbd5e1 !important; }
        .eurostar-theme-dark main [style*="background: rgb(249, 250, 251)"],
        .eurostar-theme-dark main [style*="background: #f9fafb"] { background: #17243a !important; }
        .eurostar-theme-contrast { background: #000 !important; color: #fff; }
        .eurostar-theme-contrast header, .eurostar-theme-contrast footer,
        .eurostar-theme-contrast main section:not(:first-of-type), .eurostar-theme-contrast main aside > div,
        .eurostar-theme-contrast main button { background-color: #000; border-color: #fff !important; color: #fff !important; }
        .eurostar-theme-contrast .bg-white { background-color: #000 !important; }
        .eurostar-theme-contrast header h1, .eurostar-theme-contrast header p,
        .eurostar-theme-contrast header button, .eurostar-theme-contrast footer { color: #fff !important; }
        .eurostar-theme-contrast main * { text-shadow: none !important; }
        .eurostar-theme-contrast main [style*="color:"] { color: #fff !important; }
        .eurostar-theme-contrast main button:focus-visible { outline: 3px solid #ffdf00; outline-offset: 2px; }
        .eurostar-compact main { padding-top: 12px !important; padding-bottom: 12px !important; }
        .eurostar-compact main section { margin-bottom: 12px !important; }
        .eurostar-compact .eurostar-service-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
        .eurostar-compact .eurostar-service-card { min-height: 138px; padding: 12px; }
        @media (max-width: 1100px) { .eurostar-compact .eurostar-service-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 720px) { .eurostar-compact .eurostar-service-grid { grid-template-columns: minmax(0, 1fr); } }
      `}</style>
      <header className="shrink-0 border-b bg-white" style={{ borderColor: "#e4e7ec" }}>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              style={{ background: EUROSTAR_BLUE, color: "white" }}
            >
              <Train size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2"><h1 className="text-sm font-black uppercase sm:text-base" style={{ color: INK }}>
                Eurostar Command Center
              </h1><ServicePowerBadge enabled={serviceEnabled} label={serviceEnabled ? "Eurostar on" : "Eurostar off"} compact /></div>
              <p className="truncate text-[11px] sm:text-xs" style={{ color: "#667085" }}>
                Live services, crew and network operations · {date}
              </p>
            </div>
          </div>

          <div className="ml-auto hidden items-center gap-2 text-xs font-semibold lg:flex" style={{ color: "#667085" }}>
            <Clock size={14} />
            Updated {lastUpdate}
          </div>
          {data?.responseStates?.[0] && <div className="hidden items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-black md:flex" style={{ background: sourceMeta.bg, borderColor: sourceMeta.border, color: sourceMeta.text }}><span className="h-2 w-2 rounded-full" style={{ background: sourceMeta.dot }} />{sourceMeta.label}</div>}

          <div className="ml-auto flex w-full items-center justify-end gap-2 sm:w-auto">
          {refreshSecs > 0 && (
            <span className="rounded-lg border px-2.5 py-1 text-xs font-black tabular-nums" style={{ borderColor: "#bfdbfe", color: EUROSTAR_BLUE, background: "#eff6ff" }}>
              {countdown}s
            </span>
          )}

          <div className="relative">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-bold"
              style={{ borderColor: "#d0d5dd", color: INK }}
              onClick={() => setShowMenu(v => !v)}
            >
              <RefreshCw size={13} />
              <span className="hidden sm:inline">{refreshOpt.label}</span>
              <span className="sm:hidden">{refreshSecs === 0 ? "Off" : `${Math.round(refreshSecs / 60)}m`}</span>
              <ChevronDown size={13} />
            </button>
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  className="absolute right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border bg-white shadow-xl"
                  style={{ borderColor: "#d0d5dd", minWidth: 112 }}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                >
                  {REFRESH_OPTIONS.map(opt => (
                    <button
                      key={opt.label}
                      type="button"
                      className="block w-full px-3 py-2 text-left text-xs font-bold"
                      style={{
                        background: opt.seconds === refreshSecs ? "#eff6ff" : "white",
                        color: opt.seconds === refreshSecs ? EUROSTAR_BLUE : "#475467",
                      }}
                      onClick={() => { setRefreshSecs(opt.seconds); setShowMenu(false) }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-lg border bg-white"
              style={{ borderColor: "#d0d5dd", color: "#475467" }}
              onClick={() => setShowDisplayMenu(value => !value)}
              title="Display options"
              aria-label="Display options"
            >
              {displayTheme === "dark" ? <Moon size={15} /> : displayTheme === "contrast" ? <Eye size={15} /> : <Sun size={15} />}
            </button>
            <AnimatePresence>
              {showDisplayMenu && (
                <motion.div
                  className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-lg border bg-white p-1.5 shadow-xl"
                  style={{ borderColor: "#d0d5dd" }}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                >
                  {([
                    ["light", "Light", <Sun size={14} />],
                    ["dark", "Dark", <Moon size={14} />],
                    ["contrast", "High contrast", <Eye size={14} />],
                  ] as const).map(([id, label, icon]) => (
                    <button
                      key={id}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-bold"
                      style={{ background: displayTheme === id ? "#eff6ff" : "transparent", color: displayTheme === id ? EUROSTAR_BLUE : INK }}
                      onClick={() => setDisplayTheme(id)}
                    >
                      {icon}{label}
                    </button>
                  ))}
                  <div className="my-1 border-t" style={{ borderColor: "#eaecf0" }} />
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-bold"
                    style={{ background: compact ? "#eff6ff" : "transparent", color: compact ? EUROSTAR_BLUE : INK }}
                    onClick={() => setCompact(!compact)}
                    aria-pressed={compact}
                  >
                    <Rows3 size={14} /> Compact view
                    <span className="ml-auto">{compact ? "On" : "Off"}</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border bg-white"
            style={{ borderColor: "#d0d5dd", color: "#475467" }}
            title="Refresh now"
            onClick={() => void load()}
          >
            <motion.span
              animate={loading ? { rotate: 360 } : { rotate: 0 }}
              transition={{ duration: 0.7, repeat: loading ? Infinity : 0, ease: "linear" }}
              className="flex"
            >
              <RefreshCw size={15} />
            </motion.span>
          </button>

          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border bg-white"
            style={{ borderColor: "#d0d5dd", color: "#475467" }}
            onClick={onClose}
            aria-label="Close command center"
          >
            <X size={16} />
          </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-5">
        {data?.responseStates?.some(state => state.disabled) && (
          <DisabledServiceBanner message={data.responseStates.find(state => state.disabled)?.error || "Eurostar has been disabled in Config > Services."} />
        )}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold" style={{ background: "#fff1f3", borderColor: "#fecdd3", color: "#be123c" }}>
            <AlertTriangle size={16} />
            {error}
          </div>
        )}
        {data?.responseStates?.some(state => state.stale) && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold" style={{ background: displayTheme === "light" ? "#fff7ed" : "#2b1d0e", borderColor: "#f59e0b", color: displayTheme === "light" ? "#9a3412" : "#fed7aa" }}>
            <AlertTriangle size={16} />
            {staleLabel(data.responseStates.find(state => state.stale))} is being shown because one or more Eurostar feeds are down, so the last successful response is being used.
          </div>
        )}
        {data?.issues?.map(issue => (
          <div key={issue} className="mb-3 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold" style={{ background: displayTheme === "light" ? "#fff7ed" : "#2b1d0e", borderColor: "#f59e0b", color: displayTheme === "light" ? "#9a3412" : "#fed7aa" }}>
            <AlertTriangle size={16} />
            {issue}
          </div>
        ))}

        <section className="mb-5 grid grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] gap-4 max-xl:grid-cols-1">
          <div
            className="relative overflow-hidden rounded-lg border p-5"
            style={{
              background: `linear-gradient(135deg, ${EUROSTAR_BLUE} 0%, #0f2f5f 58%, #111827 100%)`,
              borderColor: "rgba(0,51,102,0.18)",
              color: "white",
            }}
          >
            <motion.div
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)" }}
              animate={{ x: ["-100%", "100%"] }}
              transition={{ duration: 3.8, repeat: Infinity, ease: "linear" }}
            />
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center gap-2">
                  <motion.span
                    className="h-2 w-2 rounded-full"
                    style={{ background: "#67e8f9" }}
                    animate={{ opacity: [1, 0.25, 1], scale: [1, 1.8, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: "#bfdbfe" }}>
                    Network operating picture
                  </p>
                </div>
                <AnimatePresence mode="wait">
                  <motion.h2
                    key={nextDeparture ? `${nextDeparture.serviceCode}-${nextDeparture.departureDateTime}` : "overview"}
                    className="text-3xl font-black tracking-tight"
                    initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -12, filter: "blur(6px)" }}
                    transition={{ duration: 0.34, ease: "easeOut" }}
                  >
                    {nextDeparture
                      ? `Next departure ${nextDeparture.serviceCode} to ${stationName(destCode(nextDeparture))}`
                      : "Eurostar network overview"}
                  </motion.h2>
                </AnimatePresence>
                <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: "rgba(255,255,255,0.72)" }}>
                  Combining Euromap train plans with Start-on-Time crew activity and traveler summary for a single view
                  of services, stations, routes, passenger load, active operations and coverage gaps.
                </p>
                <div className="mt-4 overflow-hidden rounded-lg border px-3 py-2" style={{ borderColor: "rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.08)" }}>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={pulseIndex}
                      className="flex items-center gap-2"
                      initial={{ opacity: 0, x: 18 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -18 }}
                      transition={{ duration: 0.28, ease: "easeOut" }}
                    >
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                        style={{ background: "rgba(255,255,255,0.12)", color: activeUpdate.tone }}
                      >
                        {activeUpdate.icon}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: activeUpdate.tone }}>
                          {activeUpdate.label}
                        </div>
                        <div className="truncate text-sm font-semibold" style={{ color: "rgba(255,255,255,0.86)" }}>
                          {activeUpdate.value}
                        </div>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
              <motion.div
                className="rounded-lg border px-4 py-3 text-right"
                style={{ borderColor: "rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)" }}
                animate={{ borderColor: ["rgba(255,255,255,0.18)", "rgba(191,219,254,0.62)", "rgba(255,255,255,0.18)"] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="text-xs font-bold uppercase" style={{ color: "#bfdbfe" }}>Next at</div>
                <AnimatedHeroValue
                  value={nextDeparture ? fmtISOTime(nextDeparture.departureDateTime) : "--:--"}
                  className="text-3xl font-black tabular-nums"
                />
                <div className="text-xs" style={{ color: "rgba(255,255,255,0.66)" }}>
                  {nextDeparture ? marketLabel(nextDeparture) : "No later services"}
                </div>
                {minutesToNext !== null && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.12)" }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: EUROSTAR_GOLD }}
                      animate={{ width: `${Math.max(8, Math.min(100, 100 - minutesToNext))}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                  </div>
                )}
              </motion.div>
            </div>

            <div className="mt-5 grid grid-cols-4 gap-3 max-md:grid-cols-2">
              <HeroMetric value={loading && !data ? "..." : trains.length} label="scheduled services" tone="#bfdbfe" />
              <HeroMetric value={loading && !data ? "..." : activeTrains.length} label="running now" tone="#67e8f9" />
              <HeroMetric value={loading && !data ? "..." : crew.length} label="crew records" tone="#c4b5fd" />
              <HeroMetric
                value={loading && !data ? "..." : traveler ? traveler.totalPassengers.toLocaleString("en-GB") : watchlist?.watched ?? watchTrains.length}
                label={traveler ? "passengers today" : "watchlist services"}
                tone={traveler ? "#f9a8d4" : "#fde68a"}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {metricLabel(routeEntries.length, "Markets", "unique origin/destination corridors", EUROSTAR_GOLD)}
            {metricLabel(stationEntries.length, "Stations", "covered in today's plans", CHANNEL_BLUE)}
            {metricLabel(crewedServices.size, "Crewed", "services with roster data", "#10b981")}
            {metricLabel(
              watchlist?.highestRisk ?? traveler?.peakLoad ?? uncrewedTrains.length,
              watchlist ? "Risk ceiling" : traveler ? "Peak load" : "Gaps",
              watchlist
                ? `${watchlist.watched} services on the live operational watchlist`
                : traveler
                  ? `${traveler.busiestService || "top service"} busiest traveler service`
                  : "services without crew link",
              watchlist ? "#ef4444" : traveler ? "#ec4899" : "#f97316",
            )}
          </div>
        </section>

        <section className="mb-5 grid grid-cols-6 gap-2 max-lg:grid-cols-2">
          <CommandButton icon={<MapIcon size={15} />} label="Live map" query="Show me the Eurostar live map" onAsk={commandAsk} />
          <CommandButton icon={<Activity size={15} />} label="Live dashboard" query="Show me the Eurostar live dashboard" onAsk={commandAsk} />
          <CommandButton icon={<AlertTriangle size={15} />} label="Disruptions" query="Are there any Eurostar or SNCF disruptions today?" onAsk={commandAsk} />
          <CommandButton icon={<CalendarDays size={15} />} label="Next Paris" query="When is the next Eurostar from London to Paris?" onAsk={commandAsk} />
          {onNotifications && (
            <button
              type="button"
              onClick={onNotifications}
              className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-left text-xs font-bold transition"
              style={{ borderColor: "#d0d5dd", color: INK }}
            >
              <Bell size={15} style={{ color: EUROSTAR_BLUE }} />
              <span className="truncate">Notifications</span>
            </button>
          )}
          {onLoadAnalytics && (
            <button
              type="button"
              onClick={onLoadAnalytics}
              className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-left text-xs font-bold transition"
              style={{ borderColor: "#d0d5dd", color: INK }}
            >
              <TrendingUp size={15} style={{ color: EUROSTAR_BLUE }} />
              <span className="truncate">Load analytics</span>
            </button>
          )}
          <CommandButton icon={<Globe2 size={15} />} label="Weather" query="What's the weather in London, Paris, Brussels and Amsterdam right now?" onAsk={commandAsk} />
        </section>

        <section className="mb-5 overflow-hidden rounded-lg border bg-white px-5 py-4" style={{ borderColor: "#eaecf0" }}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SectionHeader icon={<Route size={16} />} title="Channel Corridors" detail="Today's network at a glance" />
            <div className="flex flex-wrap gap-2">
              {routeEntries.slice(0, 4).map(([route, count]) => (
                <span key={route} className="rounded-full border px-3 py-1 text-[11px] font-black" style={{ borderColor: "#e4e7ec", color: "#475467" }}>
                  {route} <span style={{ color: EUROSTAR_BLUE }}>{count}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="relative mx-auto max-w-5xl py-4">
            <div className="absolute left-[8%] right-[8%] top-[31px] h-1 rounded-full" style={{ background: "linear-gradient(90deg, #003366, #0072ce 42%, #c89a0c 58%, #003366)" }} />
            <motion.div
              className="absolute top-[25px] h-4 w-8 rounded-full border-2 border-white shadow-lg"
              style={{ background: EUROSTAR_GOLD }}
              animate={{ left: ["8%", "calc(92% - 32px)"] }}
              transition={{ duration: 7, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
            />
            <div className="relative grid grid-cols-4 gap-2">
              {[
                ["SPX", "London"],
                ["PNO", "Paris"],
                ["BXL", "Brussels"],
                ["ASD", "Amsterdam"],
              ].map(([code, city], index) => (
                <div key={code} className={`flex flex-col ${index === 0 ? "items-start" : index === 3 ? "items-end" : "items-center"}`}>
                  <span className="z-10 h-4 w-4 rounded-full border-[3px] bg-white" style={{ borderColor: index === 0 ? EUROSTAR_GOLD : EUROSTAR_BLUE }} />
                  <span className="mt-3 text-xs font-black" style={{ color: INK }}>{city}</span>
                  <span className="text-[10px] font-bold" style={{ color: "#98a2b3" }}>{code}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-xl:grid-cols-1">
          <div className="min-w-0">
            <div className="rounded-lg border bg-white p-4" style={{ borderColor: "#eaecf0" }}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <SectionHeader icon={<Train size={16} />} title="Service Board" detail="Train plans, route timings, status, crew coverage and passenger load" />
                <div className="flex flex-wrap items-center gap-1.5">
                  {filters.map(filter => (
                    <button
                      key={filter.id}
                      type="button"
                      className="rounded-full border px-3 py-1.5 text-xs font-black"
                      style={{
                        background: trainFilter === filter.id ? "#eff6ff" : "white",
                        borderColor: trainFilter === filter.id ? "#bfdbfe" : "#d0d5dd",
                        color: trainFilter === filter.id ? EUROSTAR_BLUE : "#475467",
                      }}
                      onClick={() => setTrainFilter(filter.id)}
                    >
                      {filter.label} <span className="tabular-nums">{filter.count}</span>
                    </button>
                  ))}
                </div>
              </div>

              {(watchlist?.items?.length ?? 0) > 0 && (
                <div
                  className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
                  style={{ borderColor: "#fed7aa", background: "linear-gradient(90deg, rgba(255,247,237,0.98), rgba(255,255,255,0.96))", color: "#9a3412" }}
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} />
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.16em]">Attention on the board</div>
                      <div className="text-sm font-semibold">
                        {watchlist?.watched ?? watchTrains.length} service{(watchlist?.watched ?? watchTrains.length) === 1 ? "" : "s"} currently need attention.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border px-3 py-1 text-[11px] font-black" style={{ borderColor: "#fdba74", background: "#fff7ed", color: "#9a3412" }}>
                      Peak risk {watchlist?.highestRisk ?? 0}
                    </span>
                    {commandAsk && watchlist?.items?.[0] && (
                      <button
                        type="button"
                        className="rounded-full border px-3 py-1.5 text-[11px] font-black"
                        style={{ borderColor: "#fdba74", background: "#fff7ed", color: "#9a3412" }}
                        onClick={() => commandAsk(watchlist.items[0].recommendedAsk)}
                      >
                        Ask top alert
                      </button>
                    )}
                  </div>
                </div>
              )}

              <AnimatePresence initial={false}>
                {selectedPlan && (
                  <div className="mb-3">
                    <ServiceDetailPanel
                      plan={selectedPlan}
                      crewMembers={crewByService[normalizeServiceCode(selectedPlan.serviceCode)] ?? []}
                      traveler={travelerByService[normalizeServiceCode(selectedPlan.serviceCode)]}
                      onAsk={commandAsk}
                      onClose={() => setSelectedPlanID(null)}
                    />
                  </div>
                )}
              </AnimatePresence>

              <div className="eurostar-service-grid grid grid-cols-2 gap-3 max-lg:grid-cols-1">
                {loading && !data && Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-44 animate-pulse rounded-lg" style={{ background: "#f2f4f7" }} />
                ))}
                {!loading && filteredTrains.length === 0 && (
                  <div className="col-span-full flex h-36 flex-col items-center justify-center gap-2 rounded-lg border border-dashed" style={{ borderColor: "#d0d5dd", color: "#667085" }}>
                    <CircleDot size={22} />
                    <span className="text-sm font-semibold">No services match this view</span>
                  </div>
                )}
                {filteredTrains.map(plan => {
                  const selected = selectedPlanID === plan.planID
                  return (
                    <ServiceRow
                      key={plan.planID}
                      plan={plan}
                      active={isTrainActive(plan, now)}
                      hasCrew={crewedServices.has(normalizeServiceCode(plan.serviceCode))}
                      traveler={travelerByService[normalizeServiceCode(plan.serviceCode)]}
                      watchItem={watchByPlanID[plan.planID]}
                      selected={selected}
                      onSelect={() => setSelectedPlanID(current => current === plan.planID ? null : plan.planID)}
                    />
                  )
                })}
              </div>
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-lg border bg-white p-4" style={{ borderColor: "#eaecf0" }}>
              <SectionHeader icon={<Route size={16} />} title="Route Intelligence" detail="Most active Eurostar markets today" />
              <div className="flex flex-col gap-2">
                {routeEntries.length === 0 && !loading && <p className="text-sm" style={{ color: "#667085" }}>No route data available.</p>}
                {routeEntries.slice(0, 7).map(([route, count]) => {
                  const pct = trains.length > 0 ? Math.max(8, Math.round((count / trains.length) * 100)) : 0
                  return (
                    <div key={route}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-bold" style={{ color: INK }}>{route}</span>
                        <span className="font-black tabular-nums" style={{ color: EUROSTAR_BLUE }}>{count}</span>
                      </div>
                      <div className="h-2 rounded-full" style={{ background: "#f2f4f7" }}>
                        <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: EUROSTAR_GOLD }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-lg border bg-white p-4" style={{ borderColor: "#eaecf0" }}>
              <SectionHeader icon={<Users size={16} />} title="Crew Coverage" detail="SOT assignments grouped by service" />
              <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto pr-1">
                {loading && !data && Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-20 animate-pulse rounded-lg" style={{ background: "#f2f4f7" }} />
                ))}
                {!loading && Object.keys(crewByService).length === 0 && (
                  <p className="text-sm" style={{ color: "#667085" }}>No crew roster available for this date.</p>
                )}
                {Object.entries(crewByService).map(([serviceCode, members]) => (
                  <CrewCoverage key={serviceCode} serviceCode={serviceCode} members={members} />
                ))}
              </div>
            </div>

            <div className="rounded-lg border bg-white p-4" style={{ borderColor: "#eaecf0" }}>
              <SectionHeader icon={<MapPin size={16} />} title="Station Coverage" detail="Stops appearing across today's plans" />
              <div className="grid grid-cols-1 gap-2">
                {stationEntries.map(([station, count]) => (
                  <div key={station} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2" style={{ background: "#f9fafb" }}>
                    <span className="truncate text-xs font-bold" style={{ color: INK }}>{station}</span>
                    <span className="text-xs font-black tabular-nums" style={{ color: EUROSTAR_BLUE }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </main>

      <footer className="shrink-0 border-t bg-white px-5 py-2.5" style={{ borderColor: "#e4e7ec" }}>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold" style={{ color: "#667085" }}>
          <span className="flex items-center gap-1.5"><ShieldCheck size={13} /> Euromap train plans</span>
          <span className="flex items-center gap-1.5"><Users size={13} /> SOT crew activity</span>
          <span className="flex items-center gap-1.5"><MessagesSquare size={13} /> Chat commands available</span>
          <span className="ml-auto">Times displayed in local browser time from API timestamps</span>
        </div>
      </footer>
    </motion.div>
  )
}
