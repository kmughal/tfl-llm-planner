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
  Search,
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

const STATION_ALIASES: Record<string, string> = {
  BRU: "BXL",
  AMS: "ASD",
  RDM: "RTD",
  LEW: "LIL",
  EBD: "EBF",
  AFK: "ASH",
  CFR: "FTN",
}

const PRIMARY_HUB_CODES = ["SPX", "PNO", "BXL", "LIL", "ASD", "RTD", "EBF", "ASH"] as const
const PRIMARY_HUB_SET = new Set<string>(PRIMARY_HUB_CODES)

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
  const key = canonicalStationCode(code)
  return STATION_NAMES[key] ?? key
}

function canonicalStationCode(code: string): string {
  const key = code?.toUpperCase() ?? ""
  return STATION_ALIASES[key] ?? key
}

function isPrimaryHubCode(code: string): boolean {
  return PRIMARY_HUB_SET.has(canonicalStationCode(code))
}

function originCode(plan: EuromapPlan): string {
  return canonicalStationCode(originStation(plan)?.shortCode ?? "TBC")
}

function destCode(plan: EuromapPlan): string {
  return canonicalStationCode(destStation(plan)?.shortCode ?? "TBC")
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

function isPassengerJourney(plan: EuromapPlan): boolean {
  return isPrimaryHubCode(originCode(plan)) && isPrimaryHubCode(destCode(plan))
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

function InfoLegend({
  items,
}: {
  readonly items: Array<{ label: string; text: string; tone?: string }>
}) {
  return (
    <div
      className="mt-4 mb-5 rounded-[22px] border px-3 py-3 md:px-4 md:py-4"
      style={{ borderColor: "#dbe7f3", background: "linear-gradient(180deg, rgba(252,253,255,0.98), rgba(247,250,255,0.94))" }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: "#eff6ff", color: CHANNEL_BLUE }}>
          <CircleDot size={12} />
        </span>
        <div className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: "#667085" }}>
          How to read this
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {items.map(item => (
          <div
            key={item.label}
            className="inline-flex max-w-full items-start gap-2 rounded-full border px-3 py-2.5"
            style={{ borderColor: "#dbe7f3", background: "white" }}
          >
            <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: item.tone ?? CHANNEL_BLUE }}>
              {item.label}
            </span>
            <span className="text-xs leading-5" style={{ color: "#475467" }}>
              {item.text}
            </span>
          </div>
        ))}
      </div>
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
    <div className="searchable-select-force-light relative min-w-0 flex-1" ref={panelRef}>
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
            <div className="flex items-center gap-2 rounded-xl border bg-[#f8fafc] px-3 transition focus-within:border-[#7aa2d6] focus-within:shadow-[0_0_0_2px_rgba(0,51,102,.12)]" style={{ borderColor: "#e2e8f0" }}>
              <Search size={14} style={{ color: "#667085" }} />
              <input
                autoFocus
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search service, city, route, time…"
                className="w-full bg-transparent py-2.5 text-sm outline-none"
                style={{ color: INK, WebkitTextFillColor: INK, colorScheme: "light", caretColor: INK }}
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
                  {active && <BadgeCheck size={15} className="mt-0.5 shrink-0" style={{ color: EUROSTAR_BLUE }} />}
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

type StationIntelligence = {
  code: string
  name: string
  touchCount: number
  outbound: number
  inbound: number
  active: number
  watch: number
  crewLinked: number
  passengerEstimate: number
  nextDeparture?: string
  nextArrival?: string
  markets: string[]
}

function stationSeverity(station: StationIntelligence) {
  if (station.watch > 0) return { ring: "#ef4444", glow: "rgba(239,68,68,0.22)", label: "Watch" }
  if (station.active > 0) return { ring: "#0ea5e9", glow: "rgba(14,165,233,0.18)", label: "Live" }
  return { ring: "#94a3b8", glow: "rgba(148,163,184,0.14)", label: "Idle" }
}

function HeroNetworkCanvas({
  stations,
  trains,
  selectedStationCode,
  onSelectStation,
}: {
  readonly stations: StationIntelligence[]
  readonly trains: EuromapPlan[]
  readonly selectedStationCode: string
  readonly onSelectStation: (code: string) => void
}) {
  const nodes = [
    { code: "SPX", x: 14, y: 54, short: "London" },
    { code: "LIL", x: 37, y: 58, short: "Lille" },
    { code: "BXL", x: 52, y: 35, short: "Brussels" },
    { code: "PNO", x: 68, y: 73, short: "Paris" },
    { code: "RTD", x: 70, y: 20, short: "Rotterdam" },
    { code: "ASD", x: 86, y: 14, short: "Amsterdam" },
  ] as const

  const stationByCode = new Map(stations.map(station => [station.code, station]))
  const edgeCounts = new Map<string, number>()
  for (const train of trains) {
    const origin = originCode(train)
    const destination = destCode(train)
    const key = `${origin}-${destination}`
    edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1)
  }

  const edges = [
    ["SPX", "LIL"],
    ["LIL", "PNO"],
    ["LIL", "BXL"],
    ["BXL", "RTD"],
    ["RTD", "ASD"],
    ["BXL", "PNO"],
    ["SPX", "BXL"],
  ] as const

  const corridorLeaders = [...new Map(
    trains.map(train => [marketLabel(train), (trains.filter(item => marketLabel(item) === marketLabel(train)).length)]),
  ).entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)

  return (
    <div
      className="core-network-force-dark relative overflow-hidden rounded-[28px] border p-4"
      style={{ borderColor: "#d7e3f0", background: "linear-gradient(180deg, rgba(248,251,255,0.98), rgba(255,255,255,0.96))", color: INK }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-black uppercase tracking-[0.16em]" style={{ color: INK }}>Core network map</div>
          <div className="text-xs font-semibold" style={{ color: "#344054" }}>Passenger-facing Eurostar hubs and the busiest live corridors</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border px-3 py-1.5 text-[11px] font-black shadow-[0_1px_2px_rgba(16,24,40,.04)]" style={{ borderColor: "#bfd6ee", background: "#ffffff", color: "#1f2937" }}>
            {trains.length} passenger services
          </span>
          <span className="rounded-full border px-3 py-1.5 text-[11px] font-black shadow-[0_1px_2px_rgba(16,24,40,.04)]" style={{ borderColor: "#bfdbfe", background: "#eff6ff", color: "#1d4ed8" }}>
            Blue hub = live
          </span>
          <span className="rounded-full border px-3 py-1.5 text-[11px] font-black shadow-[0_1px_2px_rgba(16,24,40,.04)]" style={{ borderColor: "#fecaca", background: "#fff1f2", color: "#991b1b" }}>
            Red pulse = watch
          </span>
        </div>
      </div>

      <InfoLegend
        items={[
          { label: "What this is", text: "A simplified Eurostar network sketch. Each circle is a major passenger hub and each line is a busy corridor." },
          { label: "How to read it", text: "Blue activity means live movement on that hub or corridor. A red pulse means at least one watched service is touching that path." },
          { label: "What to do", text: "Click a hub to focus the station panel below and inspect the services currently feeding that part of the network." },
        ]}
      />

      <div className="relative h-[420px] overflow-hidden rounded-[24px] border xl:h-[520px]" style={{ borderColor: "#dbe7f3", background: "radial-gradient(circle at 28% 20%, rgba(14,165,233,.18), transparent 24%), radial-gradient(circle at 82% 14%, rgba(200,154,12,.16), transparent 22%), linear-gradient(180deg, #061328 0%, #0b1d38 100%)" }}>
        <motion.div
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.04) 45%, transparent 65%)" }}
          animate={{ x: ["-45%", "85%"] }}
          transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
        />
        <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full">
          {edges.map(([from, to], index) => {
            const fromNode = nodes.find(node => node.code === from)
            const toNode = nodes.find(node => node.code === to)
            if (!fromNode || !toNode) return null
            const fromStation = stationByCode.get(from)
            const toStation = stationByCode.get(to)
            const hasTraffic = (edgeCounts.get(`${from}-${to}`) ?? 0) + (edgeCounts.get(`${to}-${from}`) ?? 0) > 0
            const edgeColor = from === "LIL" || to === "LIL" ? "rgba(200,154,12,.58)" : "rgba(125,211,252,.46)"
            return (
              <g key={`${from}-${to}`}>
                <line
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  stroke={edgeColor}
                  strokeWidth="0.42"
                  strokeLinecap="round"
                  opacity={hasTraffic ? 1 : 0.42}
                />
                {hasTraffic && (
                  <motion.circle
                    r="0.95"
                    fill={index % 2 === 0 ? EUROSTAR_GOLD : "#7dd3fc"}
                    style={{ filter: `drop-shadow(0 0 8px ${index % 2 === 0 ? EUROSTAR_GOLD : "#7dd3fc"})` }}
                    animate={{ cx: [fromNode.x, toNode.x], cy: [fromNode.y, toNode.y] }}
                    transition={{ duration: 4.5 + index * 0.35, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: index * 0.2 }}
                  />
                )}
                {(fromStation?.watch || toStation?.watch) ? (
                  <motion.circle
                    cx={(fromNode.x + toNode.x) / 2}
                    cy={(fromNode.y + toNode.y) / 2}
                    r="1.2"
                    fill="#ef4444"
                    animate={{ r: [0.8, 1.5, 0.8], opacity: [0.45, 1, 0.45] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                  />
                ) : null}
              </g>
            )
          })}
        </svg>

        {nodes.map((node, index) => {
          const station = stationByCode.get(node.code)
          const selected = selectedStationCode === node.code
          const severity = station ? stationSeverity(station) : { ring: "#94a3b8", glow: "rgba(148,163,184,0.16)", label: "Idle" }
          return (
            <motion.button
              key={node.code}
              type="button"
              className="absolute flex w-[144px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2"
              style={{ left: `${node.x}%`, top: `${node.y}%`, color: "#e2e8f0" }}
              onClick={() => onSelectStation(node.code)}
            >
              <motion.span
                className="absolute h-20 w-20 rounded-full"
                style={{ background: `radial-gradient(circle, ${severity.glow} 0%, transparent 72%)` }}
                animate={{ scale: selected ? [1, 1.24, 1] : [0.96, 1.12, 0.96], opacity: [0.55, 0.95, 0.55] }}
                transition={{ duration: selected ? 1.5 : 2.4, repeat: Infinity, ease: "easeInOut", delay: index * 0.05 }}
              />
              <motion.div
                className="relative flex h-14 w-14 items-center justify-center rounded-full border text-sm font-black text-white"
                style={{
                  borderColor: selected ? "#ffffff" : severity.ring,
                  background: selected ? `linear-gradient(135deg, ${CHANNEL_BLUE}, ${EUROSTAR_BLUE})` : "rgba(3,12,28,0.82)",
                  boxShadow: selected ? "0 0 0 3px rgba(255,255,255,0.2)" : `0 0 24px ${severity.glow}`,
                }}
                whileHover={{ scale: 1.04, boxShadow: `0 0 0 2px rgba(255,255,255,0.14), 0 0 24px ${severity.glow}` }}
                transition={{ duration: 0.16, ease: "easeOut" }}
              >
                {node.code}
              </motion.div>
              <motion.div
                className="rounded-2xl border px-3 py-2 text-center"
                style={{
                  width: 144,
                  borderColor: selected ? "#7dd3fc" : "rgba(255,255,255,0.12)",
                  background: selected ? "rgba(4,18,43,0.88)" : "rgba(8,20,41,0.72)",
                  boxShadow: selected ? "0 0 0 1px rgba(125,211,252,0.32)" : "none",
                  backdropFilter: "blur(10px)",
                }}
                whileHover={{ borderColor: "rgba(125,211,252,0.65)", backgroundColor: selected ? "rgba(4,18,43,0.9)" : "rgba(10,24,49,0.82)" }}
                transition={{ duration: 0.16, ease: "easeOut" }}
              >
                <div className="max-w-[132px] text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: selected ? "#f8fafc" : "#cbd5e1" }}>{node.short}</div>
                <div className="mt-1 text-[11px] font-semibold" style={{ color: selected ? "#bae6fd" : "#94a3b8" }}>
                  {station ? `${station.active} active · ${station.touchCount} touches` : "0 active · 0 touches"}
                </div>
              </motion.div>
            </motion.button>
          )
        })}

      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {corridorLeaders.map(([route, count]) => (
          <div key={route} className="rounded-2xl border px-3 py-3" style={{ borderColor: "#dbe7f3", background: "white", color: INK }}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: "#667085" }}>Busiest corridor</div>
              <span className="rounded-full px-2 py-1 text-[10px] font-black" style={{ background: "#eff6ff", color: CHANNEL_BLUE }}>Live</span>
            </div>
            <div className="mt-2 flex items-end gap-2">
              <div className="text-2xl font-black tabular-nums" style={{ color: INK }}>{count}</div>
              <div className="pb-1 text-[11px]" style={{ color: "#667085" }}>services</div>
            </div>
            <div className="mt-1 text-[11px] font-semibold" style={{ color: "#475467" }}>{route}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CrossBorderJourneyChain({
  plan,
  plans,
  traveler,
  watchItem,
  crewCount,
  onAsk,
  onOpenProfile,
  onSelectPlan,
}: {
  readonly plan?: EuromapPlan
  readonly plans: EuromapPlan[]
  readonly traveler?: TravelerService
  readonly watchItem?: EurostarWatchlistItem
  readonly crewCount: number
  readonly onAsk?: (query: string) => void
  readonly onOpenProfile?: (planID: string) => void
  readonly onSelectPlan?: (planID: string) => void
}) {
  if (!plan) {
    return (
      <div className="rounded-[28px] border bg-white p-4" style={{ borderColor: "#eaecf0" }}>
        <SectionHeader icon={<Globe2 size={16} />} title="Cross-border journey chain" detail="Select a service to trace its operating path" />
        <div className="rounded-[24px] border border-dashed px-6 py-10 text-center text-sm font-semibold" style={{ borderColor: "#d0d5dd", color: "#667085" }}>
          No service is available to render the chain yet.
        </div>
      </div>
    )
  }

  const origin = stationName(originCode(plan))
  const destination = stationName(destCode(plan))
  const hasWatch = Boolean(watchItem)
  const borderLabel = originCode(plan) === "SPX" || destCode(plan) === "SPX" ? "Channel tunnel passage" : "Continental corridor"
  const riskText = hasWatch ? watchItem?.reasons?.[0] ?? "Service needs attention" : "No active operating issue is standing out on this service."
  const planOptions: SearchableOption[] = plans.map(option => ({
    value: option.planID,
    label: `${option.serviceCode} · ${stationName(originCode(option))} to ${stationName(destCode(option))}`,
    sublabel: `${fmtISOTime(option.departureDateTime)} departure · ${statusLabel(option.status)}`,
  }))

  const steps = [
    {
      id: "origin",
      title: origin,
      subtitle: `Departs ${fmtISOTime(plan.departureDateTime)}`,
      detail: `${crewCount} crew linked${traveler ? ` · ${traveler.totalCount} passengers` : ""}`,
      color: CHANNEL_BLUE,
    },
    {
      id: "border",
      title: borderLabel,
      subtitle: fmtDuration(plan.departureDateTime, plan.arrivalDateTime),
      detail: hasWatch ? riskText : "Cross-border segment is flowing in the current plan.",
      color: EUROSTAR_GOLD,
    },
    {
      id: "arrival",
      title: destination,
      subtitle: `Arrives ${fmtISOTime(plan.arrivalDateTime)}`,
      detail: destCode(plan) === "PNO" ? "Paris onward distribution via RER and SNCF." : destCode(plan) === "SPX" ? "London onward distribution via TfL and National Rail." : "European onward distribution from the arrival hub.",
      color: hasWatch ? "#ef4444" : "#22c55e",
    },
  ] as const

  return (
    <div className="chain-force-dark rounded-[28px] border bg-white p-4" style={{ borderColor: "#eaecf0", color: INK }}>
        <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: "#eff6ff", color: EUROSTAR_BLUE }}
          >
            <Globe2 size={16} />
          </span>
          <div className="min-w-0">
            <h2 className="chain-header-title text-sm font-black uppercase tracking-wide" style={{ color: INK }}>
              Cross-border journey chain
            </h2>
            <p className="chain-header-subtitle text-xs" data-chain-tone="muted" style={{ color: "#667085" }}>
              How the selected service moves from origin to arrival and beyond
            </p>
          </div>
        </div>
        <div className="rounded-full border px-3 py-1.5 text-[11px] font-black" style={{ borderColor: hasWatch ? "#fecaca" : "#dbe7f3", background: hasWatch ? "#fff1f2" : "#f8fbff", color: hasWatch ? "#b91c1c" : "#475467" }}>
          Service {plan.serviceCode}
        </div>
      </div>

      <div className="mb-4 rounded-[20px] border p-3" style={{ borderColor: "#dbe7f3", background: "#f8fbff" }}>
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: "#667085" }}>
          Pick a service
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchableSelect
            label="Service"
            placeholder="Pick a Eurostar service"
            value={plan.planID}
            options={planOptions}
            onChange={nextPlanID => onSelectPlan?.(nextPlanID)}
          />
          <span className="rounded-full border px-3 py-2 text-[11px] font-black" style={{ borderColor: "#dbe7f3", background: "white", color: "#475467" }}>
            {plans.length} visible services
          </span>
        </div>
      </div>

      <InfoLegend
        items={[
          { label: "What this shows", text: "A single service broken into departure hub, cross-border segment, and arrival side so you can read the journey as one operating chain." },
          { label: "Risk read", text: "If the selected train is on the watchlist, the chain explains why it matters and where the fragility is likely to show up next." },
          { label: "Actions", text: "Use the quick actions to jump straight into stop detail, crew coverage, or passenger load for the selected service." },
        ]}
      />

        <div className="mt-2 rounded-[24px] border p-4" style={{ borderColor: "#dbe7f3", background: "linear-gradient(180deg, rgba(248,251,255,0.98), rgba(255,255,255,0.96))" }}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-black" style={{ color: INK }}>{origin} to {destination}</div>
              <div className="text-xs" data-chain-tone="muted" style={{ color: "#667085" }}>{marketLabel(plan)} · {statusLabel(plan.status)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-black uppercase tracking-[0.16em]" data-chain-tone="muted" style={{ color: "#667085" }}>Passenger posture</div>
              <div className="text-sm font-black" style={{ color: traveler ? travelerClassMeta(travelerLeadClass(traveler.classes)).color : INK }}>
                {traveler ? `${traveler.totalCount} pax · ${travelerClassMeta(travelerLeadClass(traveler.classes)).label}` : "Traveler feed pending"}
              </div>
            </div>
          </div>

        <div className="relative grid gap-4">
          <div className="absolute left-7 top-8 bottom-8 w-0.5 rounded-full" style={{ background: "linear-gradient(180deg, rgba(0,114,206,.36), rgba(200,154,12,.36), rgba(34,197,94,.36))" }} />
          {steps.map((step, index) => (
            <motion.div
              key={step.id}
              className="relative flex gap-3 rounded-[22px] border bg-white px-4 py-3"
              style={{ borderColor: "#e2e8f0" }}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.24, delay: index * 0.08 }}
            >
              <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-white" style={{ borderColor: step.color }}>
                <motion.span className="h-2.5 w-2.5 rounded-full" style={{ background: step.color }} animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", delay: index * 0.1 }} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-black" style={{ color: INK }}>{step.title}</div>
                <div
                  className="text-xs font-bold"
                  data-chain-tone="accent"
                  style={{ color: step.color, ["--chain-accent" as string]: step.color }}
                >
                  {step.subtitle}
                </div>
                <div className="mt-1 text-xs leading-5" data-chain-tone="muted" style={{ color: "#667085" }}>{step.detail}</div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <div className="rounded-2xl border px-3 py-3" style={{ borderColor: hasWatch ? "#fecaca" : "#dbe7f3", background: hasWatch ? "#fff7f7" : "white" }}>
            <div className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: hasWatch ? "#b91c1c" : "#667085" }}>Chain read</div>
            <div className="mt-1 text-xs leading-5" data-chain-tone="soft" style={{ color: hasWatch ? "#9f1239" : "#475467" }}>
              {hasWatch
                ? `This service is carrying a live risk signal: ${riskText}. The chain should be read as fragile from departure through arrival.`
                : "This service currently reads as a stable cross-border movement with no elevated watch signal attached."}
            </div>
          </div>
          <div className="rounded-2xl border px-3 py-3" style={{ borderColor: "#dbe7f3", background: "white" }}>
            <div className="text-[10px] font-black uppercase tracking-[0.16em]" data-chain-tone="muted" style={{ color: "#667085" }}>Operator next step</div>
            <div className="mt-1 text-xs leading-5" data-chain-tone="soft" style={{ color: "#475467" }}>
              {destCode(plan) === "PNO"
                ? "Use this chain to judge Paris arrival pressure, onward SNCF/RER sensitivity, and whether the service needs extra arrival handling."
                : destCode(plan) === "SPX"
                  ? "Use this chain to judge London arrival pressure, TfL access sensitivity, and onward National Rail handoff risk."
                  : "Use this chain to inspect whether the selected service is stable enough for onward European distribution."}
            </div>
          </div>
        </div>

        {onAsk && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onOpenProfile?.(plan.planID)}
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black"
              style={{ borderColor: "#bfdbfe", background: "#eff6ff", color: CHANNEL_BLUE }}
            >
              <Eye size={12} />
              Open profile
            </button>
            <CommandButton icon={<Train size={14} />} label="Ask this service" query={`Show me full stop times for Eurostar service ${plan.serviceCode} today`} onAsk={onAsk} />
            <CommandButton icon={<Users size={14} />} label="Ask crew" query={`Show me crew activity for Eurostar service ${plan.serviceCode} today`} onAsk={onAsk} />
            {traveler && <CommandButton icon={<Gauge size={14} />} label="Ask load" query={`How is passenger load looking today on Eurostar service ${plan.serviceCode}?`} onAsk={onAsk} />}
          </div>
        )}
      </div>
    </div>
  )
}

function StationIntelligencePanel({
  stations,
  selectedStationCode,
  onSelectStation,
  trains,
  onAsk,
  onOpenProfile,
}: {
  readonly stations: StationIntelligence[]
  readonly selectedStationCode: string
  readonly onSelectStation: (code: string) => void
  readonly trains: EuromapPlan[]
  readonly onAsk?: (query: string) => void
  readonly onOpenProfile?: (planID: string) => void
}) {
  const selectedStation = stations.find(station => station.code === selectedStationCode) ?? stations[0]
  const relatedServices = selectedStation
    ? trains
        .filter(train => train.stations.some(stop => canonicalStationCode(stop.shortCode) === selectedStation.code))
        .sort((a, b) => a.departureDateTime.localeCompare(b.departureDateTime))
        .slice(0, 6)
    : []

  return (
    <section className="station-intelligence-force-dark mb-5 rounded-lg border bg-white p-4" style={{ borderColor: "#eaecf0", color: INK }}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <SectionHeader icon={<MapPin size={16} />} title="Station intelligence" detail="Clickable hub intelligence for departures, arrivals, crew linkage and network pressure" />
        <div className="rounded-full border px-3 py-1.5 text-[11px] font-black" style={{ borderColor: "#dbe7f3", background: "#f8fbff", color: "#475467" }}>
          {stations.length} live hubs
        </div>
      </div>

      <InfoLegend
        items={[
          { label: "Touches", text: "How many service movements in the current Eurostar plan include this hub." },
          { label: "Out / In", text: "Outbound counts start from the hub. Inbound counts terminate at the hub." },
          { label: "Watch", text: "How many services through this hub are currently carrying a warning or critical signal." },
        ]}
      />

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(340px,0.65fr)]">
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {stations.map(station => {
            const selected = station.code === selectedStationCode
            const severity = stationSeverity(station)
            return (
              <motion.button
                key={station.code}
                type="button"
                className="rounded-[24px] border px-4 py-4 text-left"
                style={{
                  color: INK,
                  borderColor: selected ? CHANNEL_BLUE : "#e2e8f0",
                  background: selected ? "linear-gradient(180deg, rgba(239,246,255,0.98), rgba(255,255,255,0.96))" : "linear-gradient(180deg, rgba(249,250,251,0.98), rgba(255,255,255,0.96))",
                  boxShadow: selected ? "0 0 0 3px rgba(0,114,206,0.12)" : "none",
                }}
                onClick={() => onSelectStation(station.code)}
                whileHover={{ y: -1 }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: "#667085" }}>{station.code}</div>
                    <div className="text-sm font-black" style={{ color: INK }}>{station.name}</div>
                  </div>
                  <span className="rounded-full px-2 py-1 text-[10px] font-black" style={{ background: severity.glow, color: severity.ring }}>{severity.label}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border px-3 py-2.5" style={{ borderColor: "#e2e8f0", background: "white" }}>
                    <div className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: "#667085" }}>Touches</div>
                    <div className="mt-1 text-xl font-black tabular-nums" style={{ color: INK }}>{station.touchCount}</div>
                  </div>
                  <div className="rounded-2xl border px-3 py-2.5" style={{ borderColor: "#e2e8f0", background: "white" }}>
                    <div className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: "#667085" }}>Active</div>
                    <div className="mt-1 text-xl font-black tabular-nums" style={{ color: INK }}>{station.active}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
                  <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "#dbe7f3", background: "white", color: "#475467" }}>Out {station.outbound}</span>
                  <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "#dbe7f3", background: "white", color: "#475467" }}>In {station.inbound}</span>
                  <span className="rounded-full border px-2.5 py-1" style={{ borderColor: station.watch > 0 ? "#fecaca" : "#dbe7f3", background: station.watch > 0 ? "#fff1f2" : "white", color: station.watch > 0 ? "#b91c1c" : "#475467" }}>
                    Watch {station.watch}
                  </span>
                </div>
              </motion.button>
            )
          })}
        </div>

        <div className="rounded-[28px] border p-4" style={{ borderColor: "#dbe7f3", background: "linear-gradient(180deg, rgba(248,251,255,0.98), rgba(255,255,255,0.96))", color: INK }}>
          {selectedStation ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: "#667085" }}>Focused hub</div>
                  <div className="text-xl font-black" style={{ color: INK }}>{selectedStation.name}</div>
                  <div className="text-xs" style={{ color: "#667085" }}>{selectedStation.code} · {selectedStation.markets.slice(0, 3).join(" · ") || "Live Eurostar hub"}</div>
                </div>
                <div className="rounded-full border px-3 py-1.5 text-[11px] font-black" style={{ borderColor: "#dbe7f3", background: "white", color: "#475467" }}>
                  {selectedStation.passengerEstimate > 0 ? `${selectedStation.passengerEstimate.toLocaleString("en-GB")} pax estimate` : "Traveler estimate pending"}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {[
                  { label: "Next departure", value: selectedStation.nextDeparture ? fmtISOTime(selectedStation.nextDeparture) : "--:--" },
                  { label: "Next arrival", value: selectedStation.nextArrival ? fmtISOTime(selectedStation.nextArrival) : "--:--" },
                  { label: "Crew-linked", value: selectedStation.crewLinked },
                  { label: "Watch signals", value: selectedStation.watch },
                ].map(metric => (
                  <div key={metric.label} className="rounded-2xl border px-3 py-3" style={{ borderColor: "#e2e8f0", background: "white" }}>
                    <div className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: "#667085" }}>{metric.label}</div>
                    <div className="mt-1 text-xl font-black tabular-nums" style={{ color: INK }}>{metric.value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <div className="mb-2 text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: "#667085" }}>Next services through this hub</div>
                <div className="grid gap-2">
                  {relatedServices.slice(0, 5).map(service => (
                    <button
                      key={`${selectedStation.code}-${service.planID}`}
                      type="button"
                      onClick={() => onOpenProfile?.(service.planID)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition"
                      style={{ borderColor: "#e2e8f0", background: "white", color: INK }}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-black" style={{ color: INK }}>{service.serviceCode} · {stationName(originCode(service))} to {stationName(destCode(service))}</div>
                        <div className="truncate text-xs" style={{ color: "#667085" }}>{statusLabel(service.status)} · {fmtDuration(service.departureDateTime, service.arrivalDateTime)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black tabular-nums" style={{ color: INK }}>{fmtISOTime(service.departureDateTime)}</div>
                        <div className="text-[11px]" style={{ color: "#667085" }}>{fmtISOTime(service.arrivalDateTime)}</div>
                      </div>
                    </button>
                  ))}
                  {relatedServices.length === 0 && (
                    <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm font-semibold" style={{ borderColor: "#d0d5dd", color: "#667085" }}>
                      No live service is currently linked to this station.
                    </div>
                  )}
                </div>
              </div>

              {onAsk && (
                <div className="station-actions-force-contrast mt-4 flex flex-wrap gap-2">
                  <CommandButton icon={<Train size={14} />} label="Ask departures" query={`Show Eurostar trains from ${selectedStation.name} today`} onAsk={onAsk} />
                  <CommandButton icon={<MapPin size={14} />} label="Ask station detail" query={`Which Eurostar services stop at ${selectedStation.name} today?`} onAsk={onAsk} />
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm font-semibold" style={{ borderColor: "#d0d5dd", color: "#667085" }}>
              Select a station to inspect its live intelligence.
            </div>
          )}
        </div>
      </div>
    </section>
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
  watchItem,
  onAsk,
  onClose,
  onOpenProfile,
}: {
  readonly plan: EuromapPlan
  readonly crewMembers: EnrichedCrew[]
  readonly traveler?: TravelerService
  readonly watchItem?: EurostarWatchlistItem
  readonly onAsk?: (query: string) => void
  readonly onClose: () => void
  readonly onOpenProfile?: (planID: string) => void
}) {
  const tone = statusTone(plan.status)
  const stopCount = plan.stations.length
  const hasCrew = crewMembers.length > 0
  const alert = serviceAlertMeta(watchItem)

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
              <button
                type="button"
                onClick={() => onOpenProfile?.(plan.planID)}
                className="flex items-center gap-2 rounded-lg border bg-[#eff6ff] px-3 py-2 text-left text-xs font-bold transition"
                style={{ borderColor: "#bfdbfe", color: CHANNEL_BLUE }}
              >
                <Eye size={14} />
                Open service profile
              </button>
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

          {watchItem && watchItem.reasons.length > 0 && (
            <div className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: alert.bannerBorder, background: alert.bannerBg, color: alert.bannerText }}>
              <div className="mb-1 text-[10px] font-black uppercase tracking-[0.16em]">Profile watch reason</div>
              {watchItem.reasons[0]}
            </div>
          )}

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

function EurostarServiceProfile({
  plan,
  crewMembers,
  traveler,
  watchItem,
  onClose,
  onAsk,
}: {
  readonly plan: EuromapPlan
  readonly crewMembers: EnrichedCrew[]
  readonly traveler?: TravelerService
  readonly watchItem?: EurostarWatchlistItem
  readonly onClose: () => void
  readonly onAsk?: (query: string) => void
}) {
  const tone = statusTone(plan.status)
  const origin = stationName(originCode(plan))
  const destination = stationName(destCode(plan))
  const hasCrew = crewMembers.length > 0
  const alert = serviceAlertMeta(watchItem)
  const leadClass = traveler ? travelerClassMeta(travelerLeadClass(traveler.classes)) : null
  const hasWatch = Boolean(watchItem)

  return (
    <motion.div
      className="fixed inset-0 z-[82] flex flex-col overflow-hidden"
      style={{ background: "#f7f5ef" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <header className="shrink-0 border-b bg-white" style={{ borderColor: "#e4e7ec" }}>
        <div className="flex items-center gap-3 px-5 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: EUROSTAR_BLUE, color: "white" }}>
            <Train size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-black uppercase" style={{ color: INK }}>Eurostar Service Profile</h2>
              <span className="rounded-full border px-2.5 py-1 text-[11px] font-black" style={{ background: tone.bg, borderColor: tone.border, color: tone.text }}>
                {statusLabel(plan.status)}
              </span>
              {hasWatch && (
                <span className="rounded-full border px-2.5 py-1 text-[11px] font-black" style={{ background: alert.bannerBg, borderColor: alert.bannerBorder, color: alert.bannerText }}>
                  Watchlist
                </span>
              )}
            </div>
            <p className="truncate text-xs" style={{ color: "#667085" }}>
              Service {plan.serviceCode} · {origin} to {destination} · Plan {plan.planID}
            </p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg border bg-white" style={{ borderColor: "#d0d5dd", color: "#475467" }}>
            <X size={16} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-5">
        <section className="mb-5 rounded-[28px] border p-5" style={{ borderColor: "#d7e3f0", background: `linear-gradient(135deg, ${EUROSTAR_BLUE} 0%, #0f2f5f 58%, #111827 100%)`, color: "white" }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "#bfdbfe" }}>Service overview</div>
              <div className="mt-2 text-3xl font-black tracking-tight">{origin} to {destination}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold" style={{ color: "rgba(255,255,255,0.76)" }}>
                <span>{fmtISOTime(plan.departureDateTime)} departure</span>
                <span>{fmtISOTime(plan.arrivalDateTime)} arrival</span>
                <span>{fmtDuration(plan.departureDateTime, plan.arrivalDateTime)}</span>
                <span>{plan.stations.length} stops</span>
              </div>
            </div>
            <div className="grid min-w-[280px] grid-cols-2 gap-3 max-sm:min-w-0 max-sm:w-full">
              {[
                { label: "Passengers", value: traveler ? traveler.totalCount.toLocaleString("en-GB") : "--" },
                { label: "Crew linked", value: crewMembers.length },
                { label: "Cabin leader", value: leadClass?.label ?? "--" },
                { label: "Risk", value: watchItem ? `${watchItem.riskScore}` : "Stable" },
              ].map(metric => (
                <div key={metric.label} className="rounded-2xl border px-3 py-3" style={{ borderColor: "rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.08)" }}>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: "#bfdbfe" }}>{metric.label}</div>
                  <div className="mt-1 text-xl font-black tabular-nums">{metric.value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-5 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="rounded-[28px] border bg-white p-4" style={{ borderColor: "#eaecf0" }}>
            <SectionHeader icon={<Route size={16} />} title="Full stop pattern" detail="Departure, passage points and arrival timings for this service" />
            <div className="mt-3 overflow-x-auto pb-2">
              <div className="flex min-w-max items-start px-1">
                {plan.stations.map((station, index) => {
                  const stationTime = fmtISOTime(station.departureDateTime || station.arrivalDatetime)
                  const terminal = index === 0 || index === plan.stations.length - 1
                  return (
                    <div key={`${plan.planID}-${station.shortCode}-${station.sequenceNumber}`} className="flex items-start">
                      <div className="flex w-28 flex-col items-center text-center">
                        <span className="text-[11px] font-black tabular-nums" style={{ color: terminal ? EUROSTAR_BLUE : "#667085" }}>{stationTime}</span>
                        <span className="my-2 h-3 w-3 rounded-full border-2" style={{ borderColor: EUROSTAR_BLUE, background: terminal ? EUROSTAR_BLUE : "white" }} />
                        <span className="text-[11px] font-bold leading-tight" style={{ color: INK }}>{stationName(station.shortCode)}</span>
                        <span className="mt-0.5 text-[10px]" style={{ color: "#98a2b3" }}>{canonicalStationCode(station.shortCode)}</span>
                      </div>
                      {index < plan.stations.length - 1 && <div className="mt-[25px] h-0.5 w-10 rounded-full" style={{ background: "#bfdbfe" }} />}
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

          <div className="flex flex-col gap-4">
            <div className="rounded-[28px] border bg-white p-4" style={{ borderColor: hasWatch ? alert.bannerBorder : "#eaecf0", background: hasWatch ? "linear-gradient(180deg, rgba(255,247,247,0.98), rgba(255,255,255,0.96))" : "white" }}>
              <SectionHeader icon={<AlertTriangle size={16} />} title="Watch and impact" detail="Why this service is stable or why it needs attention" />
              {hasWatch ? (
                <div className="mt-3 space-y-2">
                  {watchItem?.reasons.map(reason => (
                    <div key={reason} className="rounded-2xl border px-3 py-3 text-sm font-semibold" style={{ borderColor: alert.bannerBorder, background: alert.bannerBg, color: alert.bannerText }}>
                      {reason}
                    </div>
                  ))}
                  <div className="rounded-2xl border px-3 py-3 text-xs leading-5" style={{ borderColor: "#fecaca", background: "white", color: "#7f1d1d" }}>
                    Recommended next ask: {watchItem?.recommendedAsk}
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border px-3 py-3 text-sm" style={{ borderColor: "#dbe7f3", background: "#f8fbff", color: "#475467" }}>
                  This service is not currently carrying a warning or critical signal in the live Eurostar watchlist.
                </div>
              )}
            </div>

            <div className="rounded-[28px] border bg-white p-4" style={{ borderColor: "#eaecf0" }}>
              <SectionHeader icon={<Users size={16} />} title="Crew coverage" detail="Start-on-Time assignments currently linked to this service" />
              <div className="mt-3 space-y-2">
                {hasCrew ? crewMembers.map(member => {
                  const name = [member.firstName, member.lastName].filter(Boolean).join(" ") || member.crewId || "Assigned crew"
                  return (
                    <div key={`${member.crewId}-${member.crewType}-profile`} className="rounded-2xl border bg-[#f9fafb] px-3 py-3" style={{ borderColor: "#e2e8f0" }}>
                      <div className="text-sm font-black" style={{ color: INK }}>{name}</div>
                      <div className="mt-1 text-xs" style={{ color: "#667085" }}>{crewRoleLabel(member.crewType)} · {member.departure} to {member.arrival}</div>
                    </div>
                  )
                }) : (
                  <div className="rounded-2xl border px-3 py-3 text-sm" style={{ borderColor: "#fed7aa", background: "#fff7ed", color: "#9a3412" }}>
                    No linked crew roster is currently attached to this service.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border bg-white p-4" style={{ borderColor: "#eaecf0" }}>
              <SectionHeader icon={<MessagesSquare size={16} />} title="Actions" detail="Ask directly from this service profile" />
              <div className="mt-3 grid gap-2">
                <CommandButton icon={<Route size={14} />} label="Ask stop detail" query={`Show me full stop times for Eurostar service ${plan.serviceCode} today`} onAsk={onAsk} />
                <CommandButton icon={<Users size={14} />} label="Ask crew" query={`Show me crew activity for Eurostar service ${plan.serviceCode} today`} onAsk={onAsk} />
                {traveler && <CommandButton icon={<Gauge size={14} />} label="Ask load" query={`How is passenger load looking today on Eurostar service ${plan.serviceCode}?`} onAsk={onAsk} />}
              </div>
            </div>
          </div>
        </section>
      </main>
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
  const [profilePlanID, setProfilePlanID] = useState<string | null>(null)
  const [selectedStationCode, setSelectedStationCode] = useState("")
  const [serviceSearch, setServiceSearch] = useState("")
  const [originSearch, setOriginSearch] = useState("")
  const [destinationSearch, setDestinationSearch] = useState("")

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

  const passengerTrains = useMemo(() => trains.filter(isPassengerJourney), [trains])

  const routeEntries = useMemo(() => {
    const counts = new Map<string, number>()
    for (const train of passengerTrains) {
      const label = marketLabel(train)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [passengerTrains])

  const crewedServices = new Set(Object.keys(crewByService))

  const stationEntries = useMemo(() => {
    const counts = new Map<string, number>()
    for (const train of passengerTrains) {
      for (const station of train.stations) {
        const canonical = canonicalStationCode(station.shortCode)
        if (!isPrimaryHubCode(canonical)) continue
        const label = `${canonical} · ${stationName(canonical)}`
        counts.set(label, (counts.get(label) ?? 0) + 1)
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [passengerTrains])

  const stationIntelligence = useMemo<StationIntelligence[]>(() => {
    const grouped = new Map<string, StationIntelligence>()
    const ensure = (code: string) => {
      const key = code.toUpperCase()
      if (!grouped.has(key)) {
        grouped.set(key, {
          code: key,
          name: stationName(key),
          touchCount: 0,
          outbound: 0,
          inbound: 0,
          active: 0,
          watch: 0,
          crewLinked: 0,
          passengerEstimate: 0,
          markets: [],
        })
      }
      return grouped.get(key)!
    }

    for (const train of passengerTrains) {
      const origin = originCode(train)
      const destination = destCode(train)
      const market = marketLabel(train)
      const active = isTrainActive(train, now)
      const watch = isWatchStatus(train.status) || Boolean(watchByPlanID[train.planID])
      const serviceCode = normalizeServiceCode(train.serviceCode)
      const hasCrew = crewedServices.has(serviceCode)
      const travelerLoad = travelerByService[serviceCode]?.totalCount ?? 0

      const originSummary = ensure(origin)
      originSummary.outbound += 1
      originSummary.passengerEstimate += travelerLoad
      if (!originSummary.nextDeparture || new Date(train.departureDateTime).getTime() < new Date(originSummary.nextDeparture).getTime()) {
        originSummary.nextDeparture = train.departureDateTime
      }

      const destinationSummary = ensure(destination)
      destinationSummary.inbound += 1
      destinationSummary.passengerEstimate += travelerLoad
      if (!destinationSummary.nextArrival || new Date(train.arrivalDateTime).getTime() < new Date(destinationSummary.nextArrival).getTime()) {
        destinationSummary.nextArrival = train.arrivalDateTime
      }

      for (const stop of train.stations) {
        const canonicalStop = canonicalStationCode(stop.shortCode)
        if (!isPrimaryHubCode(canonicalStop)) continue
        const station = ensure(canonicalStop)
        station.touchCount += 1
        if (!station.markets.includes(market)) station.markets.push(market)
        if (active) station.active += 1
        if (watch) station.watch += 1
        if (hasCrew) station.crewLinked += 1
      }
    }

    return [...grouped.values()].sort((a, b) => {
      if (b.touchCount !== a.touchCount) return b.touchCount - a.touchCount
      return a.name.localeCompare(b.name)
    })
  }, [passengerTrains, now, watchByPlanID, crewedServices, travelerByService])

  const activeTrains = passengerTrains.filter(t => isTrainActive(t, now))
  const watchTrains = passengerTrains.filter(t => isWatchStatus(t.status))
  const uncrewedTrains = passengerTrains.filter(t => !crewedServices.has(normalizeServiceCode(t.serviceCode)))
  const originOptions = useMemo(
    () => [...new Set(passengerTrains.map(train => stationName(originCode(train))))].sort((a, b) => a.localeCompare(b)),
    [passengerTrains],
  )
  const destinationOptions = useMemo(
    () => [...new Set(passengerTrains.map(train => stationName(destCode(train))))].sort((a, b) => a.localeCompare(b)),
    [passengerTrains],
  )
  const displayTrains = passengerTrains
  const nextDeparture = displayTrains
    .filter(t => new Date(t.departureDateTime).getTime() >= now)
    .sort((a, b) => a.departureDateTime.localeCompare(b.departureDateTime))[0]
  const minutesToNext = minsUntil(nextDeparture?.departureDateTime, now)

  const filteredTrains = [...displayTrains]
    .sort((a, b) => a.departureDateTime.localeCompare(b.departureDateTime))
    .filter(train => {
      if (trainFilter === "active") return isTrainActive(train, now)
      if (trainFilter === "watch") return isWatchStatus(train.status)
      if (trainFilter === "crew") return crewedServices.has(train.serviceCode.replaceAll(/\D/g, "").replace(/^0+/, "").slice(-4))
      return true
    })
    .filter(train => {
      const serviceNeedle = serviceSearch.trim().toLowerCase()
      const originNeedle = originSearch.trim().toLowerCase()
      const destinationNeedle = destinationSearch.trim().toLowerCase()

      if (serviceNeedle && !train.serviceCode.toLowerCase().includes(serviceNeedle)) return false
      if (originNeedle && stationName(originCode(train)).toLowerCase() !== originNeedle) return false
      if (destinationNeedle && stationName(destCode(train)).toLowerCase() !== destinationNeedle) return false
      return true
    })
  const focusedPlan = filteredTrains.find(train => train.planID === selectedPlanID) ?? nextDeparture ?? filteredTrains[0] ?? trains[0]
  const focusedTraveler = focusedPlan ? travelerByService[normalizeServiceCode(focusedPlan.serviceCode)] : undefined
  const focusedWatchItem = focusedPlan ? watchByPlanID[focusedPlan.planID] : undefined
  const focusedCrewCount = focusedPlan ? (crewByService[normalizeServiceCode(focusedPlan.serviceCode)]?.length ?? 0) : 0
  const profilePlan = trains.find(train => train.planID === profilePlanID) ?? null
  const profileTraveler = profilePlan ? travelerByService[normalizeServiceCode(profilePlan.serviceCode)] : undefined
  const profileWatchItem = profilePlan ? watchByPlanID[profilePlan.planID] : undefined
  const profileCrewMembers = profilePlan ? (crewByService[normalizeServiceCode(profilePlan.serviceCode)] ?? []) : []
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

  useEffect(() => {
    if (selectedPlanID && !filteredTrains.some(train => train.planID === selectedPlanID)) {
      setSelectedPlanID(null)
    }
  }, [filteredTrains, selectedPlanID])

  useEffect(() => {
    if (profilePlanID && !trains.some(train => train.planID === profilePlanID)) {
      setProfilePlanID(null)
    }
  }, [profilePlanID, trains])

  useEffect(() => {
    if (!selectedStationCode && stationIntelligence[0]) {
      setSelectedStationCode(nextDeparture ? originCode(nextDeparture) : stationIntelligence[0].code)
      return
    }
    if (selectedStationCode && !stationIntelligence.some(station => station.code === selectedStationCode)) {
      setSelectedStationCode(stationIntelligence[0]?.code ?? "")
    }
  }, [selectedStationCode, stationIntelligence, nextDeparture])

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
        .eurostar-command-center .station-intelligence-force-dark,
        .eurostar-command-center .station-intelligence-force-dark * {
          color: #101828 !important;
          -webkit-text-fill-color: #101828 !important;
        }
        .eurostar-command-center .station-actions-force-contrast button,
        .eurostar-command-center .station-actions-force-contrast button * {
          color: #1d4ed8 !important;
          -webkit-text-fill-color: #1d4ed8 !important;
        }
        .eurostar-command-center .station-actions-force-contrast button {
          background: #eff6ff !important;
          border-color: #bfdbfe !important;
        }
        .eurostar-command-center .searchable-select-force-light button,
        .eurostar-command-center .searchable-select-force-light input,
        .eurostar-command-center .searchable-select-force-light div {
          color: #101828;
          -webkit-text-fill-color: #101828;
        }
        .eurostar-command-center .searchable-select-force-light > button,
        .eurostar-command-center .searchable-select-force-light .absolute {
          background: #ffffff !important;
          border-color: #d0d5dd !important;
        }
        .eurostar-command-center .searchable-select-force-light input::placeholder {
          color: #667085 !important;
          -webkit-text-fill-color: #667085 !important;
        }
        .eurostar-command-center .chain-force-dark {
          color: #101828 !important;
          -webkit-text-fill-color: #101828 !important;
        }
        .eurostar-command-center .chain-force-dark [data-chain-tone="muted"] {
          color: #667085 !important;
          -webkit-text-fill-color: #667085 !important;
        }
        .eurostar-command-center .chain-force-dark [data-chain-tone="soft"] {
          color: #475467 !important;
          -webkit-text-fill-color: #475467 !important;
        }
        .eurostar-command-center .chain-force-dark [data-chain-tone="accent"] {
          color: var(--chain-accent, #1d4ed8) !important;
          -webkit-text-fill-color: var(--chain-accent, #1d4ed8) !important;
        }
        .eurostar-theme-dark .chain-header-title,
        .eurostar-theme-contrast .chain-header-title {
          color: #f8fafc !important;
          -webkit-text-fill-color: #f8fafc !important;
        }
        .eurostar-theme-dark .chain-header-subtitle,
        .eurostar-theme-contrast .chain-header-subtitle {
          color: #cbd5e1 !important;
          -webkit-text-fill-color: #cbd5e1 !important;
        }
        .eurostar-command-center .core-network-force-dark,
        .eurostar-command-center .core-network-force-dark * {
          -webkit-text-fill-color: inherit;
        }
        .eurostar-command-center .core-network-force-dark > div:first-child,
        .eurostar-command-center .core-network-force-dark > div:first-child *,
        .eurostar-command-center .core-network-force-dark > div:last-child,
        .eurostar-command-center .core-network-force-dark > div:last-child * {
          color: #101828 !important;
          -webkit-text-fill-color: #101828 !important;
        }
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

        <section className="mb-5 grid gap-4 2xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.7fr)]">
          <HeroNetworkCanvas
            stations={stationIntelligence}
            trains={displayTrains}
            selectedStationCode={selectedStationCode}
            onSelectStation={setSelectedStationCode}
          />
          <CrossBorderJourneyChain
            plan={focusedPlan}
            plans={filteredTrains}
            traveler={focusedTraveler}
            watchItem={focusedWatchItem}
            crewCount={focusedCrewCount}
            onAsk={commandAsk}
            onOpenProfile={setProfilePlanID}
            onSelectPlan={setSelectedPlanID}
          />
        </section>

        <StationIntelligencePanel
          stations={stationIntelligence.slice(0, 8)}
          selectedStationCode={selectedStationCode}
          onSelectStation={setSelectedStationCode}
          trains={displayTrains}
          onAsk={commandAsk}
          onOpenProfile={setProfilePlanID}
        />

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

              <div className="mb-4 grid grid-cols-[minmax(0,1.1fr)_minmax(0,.95fr)_minmax(0,.95fr)_auto] gap-2 max-lg:grid-cols-1">
                <label className="flex items-center gap-2 rounded-lg border bg-[#f8fafc] px-3 py-2.5 transition focus-within:border-[#7aa2d6] focus-within:shadow-[0_0_0_2px_rgba(0,51,102,.12)]" style={{ borderColor: "#e4e7ec" }}>
                  <Search size={14} style={{ color: "#667085" }} />
                  <input
                    value={serviceSearch}
                    onChange={event => setServiceSearch(event.target.value)}
                    placeholder="Search train number"
                    className="w-full bg-transparent text-sm outline-none"
                    style={{ color: INK, WebkitTextFillColor: INK, colorScheme: "light", caretColor: INK }}
                  />
                </label>
                <label className="rounded-lg border bg-[#f8fafc] px-3 py-2.5" style={{ borderColor: "#e4e7ec" }}>
                  <div className="mb-1 text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: "#667085" }}>Origin</div>
                  <select value={originSearch} onChange={event => setOriginSearch(event.target.value)} className="w-full bg-transparent text-sm outline-none" style={{ color: INK, WebkitTextFillColor: INK, colorScheme: "light" }}>
                    <option value="">All origins</option>
                    {originOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label className="rounded-lg border bg-[#f8fafc] px-3 py-2.5" style={{ borderColor: "#e4e7ec" }}>
                  <div className="mb-1 text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: "#667085" }}>Destination</div>
                  <select value={destinationSearch} onChange={event => setDestinationSearch(event.target.value)} className="w-full bg-transparent text-sm outline-none" style={{ color: INK, WebkitTextFillColor: INK, colorScheme: "light" }}>
                    <option value="">All destinations</option>
                    {destinationOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => { setServiceSearch(""); setOriginSearch(""); setDestinationSearch("") }}
                  className="rounded-lg border bg-white px-3 py-2.5 text-xs font-black"
                  style={{ borderColor: "#d0d5dd", color: "#475467" }}
                >
                  Clear
                </button>
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
                    <div key={plan.planID} className={selected ? "col-span-full" : undefined}>
                      <ServiceRow
                        plan={plan}
                        active={isTrainActive(plan, now)}
                        hasCrew={crewedServices.has(normalizeServiceCode(plan.serviceCode))}
                        traveler={travelerByService[normalizeServiceCode(plan.serviceCode)]}
                        watchItem={watchByPlanID[plan.planID]}
                        selected={selected}
                        onSelect={() => setSelectedPlanID(current => current === plan.planID ? null : plan.planID)}
                      />
                      <AnimatePresence initial={false}>
                        {selected && (
                          <div className="mt-3">
                            <ServiceDetailPanel
                              plan={plan}
                              crewMembers={crewByService[normalizeServiceCode(plan.serviceCode)] ?? []}
                              traveler={travelerByService[normalizeServiceCode(plan.serviceCode)]}
                              watchItem={watchByPlanID[plan.planID]}
                              onAsk={commandAsk}
                              onClose={() => setSelectedPlanID(null)}
                              onOpenProfile={setProfilePlanID}
                            />
                          </div>
                        )}
                      </AnimatePresence>
                    </div>
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

      <AnimatePresence>
        {profilePlan && (
          <EurostarServiceProfile
            plan={profilePlan}
            crewMembers={profileCrewMembers}
            traveler={profileTraveler}
            watchItem={profileWatchItem}
            onClose={() => setProfilePlanID(null)}
            onAsk={commandAsk}
          />
        )}
      </AnimatePresence>

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
