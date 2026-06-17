import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { Activity, AlertTriangle, ArrowRight, GitBranch, Globe2, Link2, Network, RefreshCw, Shield, TrainFront, Waves, X } from "lucide-react"
import { EurostarDisplayMenu, EurostarDisplayStyles, eurostarDisplayClass, useEurostarDisplay } from "./EurostarDisplay"

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8080"

type EuromapStation = { shortCode: string; stopType: string; departureDateTime?: string; arrivalDatetime?: string; country?: string }
type EuromapPlan = { serviceCode: string; status: string; departureDateTime: string; arrivalDateTime: string; stations: EuromapStation[] }
type EnrichedCrew = { serviceCode: string }
type Line = { id: string; name: string; lineStatuses: Array<{ statusSeverity: number; statusSeverityDescription: string }> }
type Road = { id: string; displayName: string; statusSeverity: string; statusSeverityDescription: string }
type BusLine = { id: string; name: string }
type SNCFBoard = { station: string; services: Array<{ time: string; delay: number; mode: string; number: string; direction: string }> }
type SNCFIncident = { impacted: string; message: string; severity: string; effect: string }
type NationalHub = { name: string; crs: string; services: number; delayed: number; cancelled: number }
type NationalService = { hub: string; scheduled: string; expected: string; destination: string; delay: number; operator: string }
type NationalAlert = { hub: string; message: string }
type ParisBoard = { station: string; services: Array<{ time: string; delay: number; line: string; direction: string; color: string; textColor: string; mode: string }> }
type TransferNode = { id: string; label: string; group: string; status: string; headline: string; value: string }
type Correlation = { id: string; severity: string; headline: string; explanation: string; cause: string; effect: string; networks: string[]; confidence: number }
type Propagation = { id: string; severity: string; title: string; summary: string; primaryService: string; origin: string; destination: string; departure: string; impactedNetworks: string[]; impactSummary: string[]; confidence: number }
type Data = {
  overview: { narrative: string; networksLive: number; activeServices: number; watchedServices: number; networkAlerts: number; crewCoverage: number; disruptionPoints: number }
  eurostar: { trains: EuromapPlan[]; crew: EnrichedCrew[]; servicesToday: number; active: number; watched: number; cancelled: number; crewCoverage: number; issues?: string[] }
  tfl: { lines: Line[]; roads: Road[]; buses: BusLine[]; goodLines: number; disrupted: number; roadIssues: number; errors?: Record<string, string> }
  sncf: { boards: SNCFBoard[]; incidents: SNCFIncident[]; delayed: number; services: number; errors?: Record<string, string> }
  nationalRail: { hubs: NationalHub[]; services: NationalService[]; alerts: NationalAlert[]; delayed: number; cancelled: number; errors?: Record<string, string> }
  paris: { boards: ParisBoard[]; delayed: number; lines: number; errors?: Record<string, string> }
  correlations: Correlation[]
  propagations: Propagation[]
  transferMap: TransferNode[]
  fetchedAt: string
  errors?: Record<string, string>
}

type FeedHealth = "live" | "degraded" | "unavailable"

async function readJsonOrThrow(response: Response): Promise<Data & { error?: string }> {
  const raw = await response.text()
  try {
    return JSON.parse(raw) as Data & { error?: string }
  } catch {
    const trimmed = raw.trim()
    if (response.status === 404 || trimmed.startsWith("404")) {
      throw new Error("Operations wall endpoint is not available on the running backend yet. Restart the backend to load /api/operations/wall.")
    }
    if (!trimmed) {
      throw new Error("Operations wall returned an empty response.")
    }
    throw new Error(trimmed.slice(0, 220))
  }
}

const RING_POSITIONS: Record<string, { x: string; y: string; tint: string }> = {
  eurostar: { x: "50%", y: "14%", tint: "#0ea5e9" },
  tfl: { x: "17%", y: "48%", tint: "#ef4444" },
  "national-rail": { x: "31%", y: "79%", tint: "#60a5fa" },
  paris: { x: "69%", y: "79%", tint: "#22c55e" },
  sncf: { x: "83%", y: "48%", tint: "#f472b6" },
}

function severityStyle(severity: string) {
  if (severity === "critical") return { glow: "rgba(248,113,113,.42)", border: "rgba(248,113,113,.55)", text: "#fecaca", fill: "#ef4444" }
  if (severity === "warning") return { glow: "rgba(251,191,36,.34)", border: "rgba(251,191,36,.55)", text: "#fde68a", fill: "#f59e0b" }
  return { glow: "rgba(74,222,128,.28)", border: "rgba(74,222,128,.45)", text: "#bbf7d0", fill: "#22c55e" }
}

function feedHealthStyle(status: FeedHealth) {
  if (status === "unavailable") return { dot: "#f87171", text: "#fecaca", border: "rgba(248,113,113,.26)", bg: "rgba(127,29,29,.22)", label: "Unavailable" }
  if (status === "degraded") return { dot: "#f59e0b", text: "#fde68a", border: "rgba(245,158,11,.26)", bg: "rgba(120,53,15,.22)", label: "Degraded" }
  return { dot: "#22c55e", text: "#bbf7d0", border: "rgba(34,197,94,.24)", bg: "rgba(20,83,45,.22)", label: "Live" }
}

function computeFeedHealth(hasData: boolean, errorCount: number): FeedHealth {
  if (!hasData) return "unavailable"
  if (errorCount > 0) return "degraded"
  return "live"
}

function countTruthy(values: boolean[]) {
  return values.reduce((sum, value) => sum + (value ? 1 : 0), 0)
}

function clock(value: string) {
  if (!value) return "--:--"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "--:--"
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

function stationLabel(plan: EuromapPlan, destination = false) {
  const station = destination
    ? plan.stations.find(item => item.stopType.toLowerCase() === "destination") ?? plan.stations.at(-1)
    : plan.stations.find(item => item.stopType.toLowerCase() === "origin") ?? plan.stations[0]
  const code = station?.shortCode ?? "?"
  return ({
    SPX: "London St Pancras",
    PNO: "Paris Gare du Nord",
    BXL: "Brussels-Midi",
    BRU: "Brussels-Midi",
    ASD: "Amsterdam Centraal",
    AMS: "Amsterdam Centraal",
    RTD: "Rotterdam Centraal",
    RDM: "Rotterdam Centraal",
    EBF: "Ebbsfleet International",
  } as Record<string, string>)[code] ?? code
}

function NodeOrb({ node, index }: { readonly node: TransferNode; readonly index: number }) {
  const pos = RING_POSITIONS[node.id]
  const tone = severityStyle(node.status)
  return (
    <motion.div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: pos.x, top: pos.y }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.08 }}
    >
      <motion.div
        className="absolute inset-0 rounded-full blur-2xl"
        style={{ background: tone.glow }}
        animate={{ scale: [1, 1.25, 1], opacity: [0.25, 0.55, 0.25] }}
        transition={{ repeat: Infinity, duration: 2.6 + index * 0.25, ease: "easeInOut" }}
      />
      <div
        className="relative w-32 rounded-[24px] border px-3 py-3 text-center shadow-[0_24px_80px_rgba(2,6,23,.35)] backdrop-blur-xl"
        style={{ borderColor: tone.border, background: "rgba(7,12,24,.76)" }}
      >
        <div className="mb-1 text-[9px] font-black uppercase tracking-[0.16em]" style={{ color: tone.text }}>{node.group.replace("-", " ")}</div>
        <div className="text-[13px] font-black leading-4 text-white">{node.label}</div>
        <div className="mt-1 text-[10px] leading-4 text-white/55">{node.headline}</div>
        <div className="mt-2 text-base font-black" style={{ color: tone.text }}>{node.value}</div>
      </div>
    </motion.div>
  )
}

function TransferCard({ node }: { readonly node: TransferNode }) {
  const tone = severityStyle(node.status)
  return (
    <div
      className="rounded-[22px] border bg-white/[.04] px-4 py-4"
      style={{ borderColor: tone.border }}
    >
      <div className="mb-1 text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: tone.text }}>
        {node.group.replace("-", " ")}
      </div>
      <div className="text-sm font-black text-white">{node.label}</div>
      <div className="mt-1 text-[11px] text-white/50">{node.headline}</div>
      <div className="mt-3 text-lg font-black" style={{ color: tone.text }}>{node.value}</div>
    </div>
  )
}

function FeedCard({
  title, tint, subtitle, value, statLabel, children, actionLabel, onAction,
}: {
  readonly title: string
  readonly tint: string
  readonly subtitle: string
  readonly value: string | number
  readonly statLabel: string
  readonly children: ReactNode
  readonly actionLabel: string
  readonly onAction?: () => void
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-[rgba(8,14,28,.82)] p-5 shadow-[0_18px_60px_rgba(2,6,23,.28)] backdrop-blur-xl">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: `${tint}20`, color: tint }}>
          <TrainFront size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-white">{title}</div>
          <div className="mt-1 text-[11px] text-white/50">{subtitle}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black" style={{ color: tint }}>{value}</div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">{statLabel}</div>
        </div>
      </div>
      <div className="space-y-2">{children}</div>
      {onAction && (
        <button type="button" onClick={onAction} className="mt-4 flex items-center gap-2 text-xs font-bold" style={{ color: tint }}>
          {actionLabel} <ArrowRight size={13} />
        </button>
      )}
    </div>
  )
}

export function OperationsWall({ onClose, onAsk }: { readonly onClose: () => void; readonly onAsk?: (query: string) => void }) {
  const { theme, compact } = useEurostarDisplay()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch(`${API}/api/operations/wall`)
      const body = await readJsonOrThrow(response)
      if (!response.ok) throw new Error(body.error || "Operations wall is unavailable")
      setData(body)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load cross-border wall")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 60000)
    return () => window.clearInterval(timer)
  }, [load])

  const topEurostar = useMemo(() => (data?.eurostar.trains ?? []).filter(plan => /delay|cancel|suspend|disrupt/i.test(plan.status)).slice(0, 3), [data])
  const tflTop = useMemo(() => (data?.tfl.lines ?? []).filter(line => (line.lineStatuses[0]?.statusSeverity ?? 0) < 10).slice(0, 3), [data])
  const sncfTop = useMemo(() => data?.sncf.incidents.slice(0, 3) ?? [], [data])
  const nrailTop = useMemo(() => (data?.nationalRail.services ?? []).filter(service => service.delay > 0).slice(0, 3), [data])
  const parisTop = useMemo(() => (data?.paris.boards[0]?.services ?? []).slice(0, 4), [data])
  const correlations = data?.correlations ?? []
  const updated = data?.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"
  const providerStrip = useMemo(() => {
    const items = [
      {
        id: "eurostar",
        label: "Eurostar",
        detail: `${data?.eurostar.servicesToday ?? 0} services`,
        status: computeFeedHealth(Boolean((data?.eurostar.trains.length ?? 0) || (data?.eurostar.crew.length ?? 0)), data?.eurostar.issues?.length ?? 0),
      },
      {
        id: "tfl",
        label: "TfL",
        detail: `${data?.tfl.lines.length ?? 0} lines`,
        status: computeFeedHealth(Boolean((data?.tfl.lines.length ?? 0) || (data?.tfl.roads.length ?? 0) || (data?.tfl.buses.length ?? 0)), Object.keys(data?.tfl.errors ?? {}).length),
      },
      {
        id: "national-rail",
        label: "National Rail",
        detail: `${data?.nationalRail.hubs.length ?? 0} hubs`,
        status: computeFeedHealth(Boolean((data?.nationalRail.hubs.length ?? 0) || (data?.nationalRail.services.length ?? 0)), Object.keys(data?.nationalRail.errors ?? {}).length),
      },
      {
        id: "paris",
        label: "Paris RER",
        detail: `${data?.paris.boards.length ?? 0} boards`,
        status: computeFeedHealth(Boolean(data?.paris.boards.length ?? 0), Object.keys(data?.paris.errors ?? {}).length),
      },
      {
        id: "sncf",
        label: "SNCF",
        detail: `${data?.sncf.boards.length ?? 0} hubs`,
        status: computeFeedHealth(Boolean((data?.sncf.boards.length ?? 0) || (data?.sncf.incidents.length ?? 0)), Object.keys(data?.sncf.errors ?? {}).length),
      },
    ] as const
    return items
  }, [data])
  const liveFeeds = countTruthy(providerStrip.map(item => item.status === "live"))
  const degradedFeeds = countTruthy(providerStrip.map(item => item.status === "degraded"))
  const unavailableFeeds = countTruthy(providerStrip.map(item => item.status === "unavailable"))

  const ask = (query: string) => {
    if (!onAsk) return
    onClose()
    onAsk(query)
  }

  return (
    <motion.div
      className={`${eurostarDisplayClass(theme, compact)} fixed inset-0 z-[120] flex flex-col overflow-hidden`}
      style={{ background: "radial-gradient(circle at top, rgba(30,64,175,.22), transparent 26%), #050914" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <EurostarDisplayStyles />
      <header className="border-b border-white/10 bg-[rgba(5,9,20,.72)] px-5 py-3 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1500px] items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white">
            <Globe2 size={20} />
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-black text-white">Operations Wall</h1>
            <p className="text-xs text-white/45">Eurostar, TfL, SNCF, National Rail and Paris RER in one live cross-border view</p>
          </div>
          <div className="ml-auto hidden items-center gap-2 text-xs text-white/55 lg:flex">
            <motion.span className="h-2 w-2 rounded-full bg-emerald-400" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.6, repeat: Infinity }} />
            Updated {updated}
          </div>
          <EurostarDisplayMenu inverted />
          <button type="button" onClick={() => void load()} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white" aria-label="Refresh operations wall">
            <motion.span animate={loading ? { rotate: 360 } : { rotate: 0 }} transition={{ repeat: loading ? Infinity : 0, duration: 0.8, ease: "linear" }}>
              <RefreshCw size={15} />
            </motion.span>
          </button>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white" aria-label="Close operations wall">
            <X size={16} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1500px] px-5 py-6">
          {error && <div className="mb-4 rounded-2xl border border-red-400/45 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">{error}</div>}

          <section className="mb-6 rounded-[26px] border border-white/10 bg-[rgba(8,14,28,.82)] p-4 shadow-[0_18px_60px_rgba(2,6,23,.22)] backdrop-blur-xl">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div>
                <div className="text-sm font-black text-white">Live provider health</div>
                <div className="text-[11px] text-white/45">Which feeds are fully live, partially degraded, or currently unavailable</div>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {[
                  { label: "Live", value: liveFeeds, color: "#22c55e" },
                  { label: "Degraded", value: degradedFeeds, color: "#f59e0b" },
                  { label: "Unavailable", value: unavailableFeeds, color: "#f87171" },
                ].map(item => (
                  <span key={item.label} className="rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]" style={{ borderColor: `${item.color}40`, color: item.color, background: `${item.color}14` }}>
                    {item.label} {item.value}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
              {providerStrip.map(item => {
                const style = feedHealthStyle(item.status)
                return (
                  <div key={item.id} className="rounded-[22px] border px-4 py-3" style={{ borderColor: style.border, background: style.bg }}>
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: style.dot }} />
                      <span className="text-xs font-black text-white">{item.label}</span>
                      <span className="ml-auto text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: style.text }}>{style.label}</span>
                    </div>
                    <div className="mt-2 text-[11px] text-white/55">{item.detail}</div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(420px,.8fr)]">
            <div className="relative overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(135deg,rgba(8,20,46,.96),rgba(10,10,20,.88))] p-6 shadow-[0_28px_120px_rgba(2,6,23,.38)]">
              <motion.div className="absolute -top-16 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-sky-500/15 blur-3xl" animate={{ scale: [1, 1.18, 1] }} transition={{ duration: 6, repeat: Infinity }} />
              <div className="relative">
                <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-sky-300">
                  <Network size={13} /> True multi-network operations wall
                </div>
                <h2 className="max-w-4xl text-4xl font-black leading-[1.02] text-white sm:text-5xl">
                  {data?.overview.narrative ?? "Building the live cross-border picture"}
                </h2>
                <p className="mt-4 max-w-3xl text-sm leading-6 text-white/60">
                  One screen for Channel services, London distribution, UK mainline handoff, Paris interchange flow, and French national continuation.
                </p>

                <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    [data?.overview.networksLive ?? "--", "live networks", "#38bdf8"],
                    [data?.overview.activeServices ?? "--", "active services", "#c084fc"],
                    [data?.overview.watchedServices ?? "--", "watched services", "#f59e0b"],
                    [data?.overview.crewCoverage ?? "--", "crewed Eurostar", "#22c55e"],
                  ].map(([value, label, tint]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-white/[.045] px-4 py-4">
                      <div className="text-3xl font-black" style={{ color: String(tint) }}>{value}</div>
                      <div className="mt-1 text-[11px] text-white/45">{label}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 grid gap-4 xl:hidden">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {data?.transferMap.map(node => <TransferCard key={node.id} node={node} />)}
                  </div>
                  <div className="flex items-center justify-between rounded-[24px] border border-cyan-300/20 bg-[rgba(8,16,34,.92)] px-4 py-4">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">Transfer core</div>
                      <div className="mt-1 text-[11px] text-white/45">cross-network propagation paths</div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-black text-white">{data?.overview.disruptionPoints ?? "--"}</div>
                      <div className="text-[10px] text-cyan-200">active paths</div>
                    </div>
                  </div>
                </div>

                <div className="relative mt-8 hidden h-[70vh] min-h-[720px] max-h-[900px] overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(125,211,252,.1),transparent_35%),rgba(255,255,255,.02)] xl:block">
                  <motion.div className="absolute left-1/2 top-1/2 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" animate={{ rotate: 360 }} transition={{ duration: 40, repeat: Infinity, ease: "linear" }} />
                  <motion.div className="absolute left-1/2 top-1/2 h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" animate={{ rotate: -360 }} transition={{ duration: 26, repeat: Infinity, ease: "linear" }} />
                  {data?.transferMap.map((node, index) => <NodeOrb key={node.id} node={node} index={index} />)}
                  <div className="absolute left-1/2 top-1/2 flex h-36 w-36 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-cyan-300/30 bg-[rgba(8,16,34,.92)] text-center shadow-[0_0_80px_rgba(56,189,248,.18)]">
                    <motion.div className="absolute inset-0 rounded-full border border-cyan-300/25" animate={{ scale: [1, 1.14, 1], opacity: [0.4, 0.9, 0.4] }} transition={{ duration: 2.8, repeat: Infinity }} />
                    <div className="relative text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">Transfer core</div>
                    <div className="relative mt-2 text-3xl font-black text-white">{data?.overview.disruptionPoints ?? "--"}</div>
                    <div className="relative mt-1 text-[11px] text-white/45">propagation paths</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-[30px] border border-white/10 bg-[rgba(8,14,28,.82)] p-5 shadow-[0_20px_80px_rgba(2,6,23,.28)] backdrop-blur-xl">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300"><GitBranch size={18} /></span>
                  <div>
                    <div className="text-sm font-black text-white">Disruption propagation</div>
                    <div className="text-[11px] text-white/45">How one network is likely to change the next</div>
                  </div>
                </div>
                <div className="space-y-3">
                  {(data?.propagations ?? []).map(item => {
                    const tone = severityStyle(item.severity)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => item.primaryService ? ask(`Track Eurostar service ${item.primaryService} and explain onward impact`) : ask("Show the current cross-border operating picture")}
                        className="w-full rounded-[24px] border p-4 text-left transition hover:-translate-y-0.5"
                        style={{ borderColor: tone.border, background: "rgba(255,255,255,.03)" }}
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: tone.fill }} />
                          <span className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: tone.text }}>{item.severity}</span>
                          <span className="ml-auto text-[11px] text-white/35">{item.confidence}% confidence</span>
                        </div>
                        <div className="text-sm font-black text-white">{item.title}</div>
                        <div className="mt-2 text-[12px] leading-5 text-white/58">{item.summary}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.impactedNetworks.map(label => <span key={label} className="rounded-full border border-white/10 bg-white/[.05] px-2.5 py-1 text-[10px] font-bold text-white/70">{label}</span>)}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-[30px] border border-white/10 bg-[rgba(8,14,28,.82)] p-5 shadow-[0_20px_80px_rgba(2,6,23,.28)] backdrop-blur-xl">
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300"><Waves size={18} /></span>
                  <div>
                    <div className="text-sm font-black text-white">Operator pulse</div>
                    <div className="text-[11px] text-white/45">Fast read across all five feeds</div>
                  </div>
                </div>
                <div className="space-y-2">
                  {(data?.transferMap ?? []).map(item => {
                    const tone = severityStyle(item.status)
                    return (
                      <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[.03] px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: tone.fill }} />
                          <span className="text-xs font-black text-white">{item.label}</span>
                          <span className="ml-auto text-[11px]" style={{ color: tone.text }}>{item.value}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-white/45">{item.headline}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-5 xl:grid-cols-5">
            <FeedCard title="Eurostar" tint="#38bdf8" subtitle="Cross-Channel service state" value={data?.eurostar.watched ?? 0} statLabel="watched" actionLabel="Ask Eurostar" onAction={() => ask("Show all delayed or cancelled Eurostar services today")}>
              {topEurostar.length === 0 && <div className="rounded-2xl bg-white/[.04] px-3 py-3 text-xs text-white/55">No delayed or cancelled Eurostar stands out right now.</div>}
              {topEurostar.map(plan => (
                <div key={plan.serviceCode} className="rounded-2xl bg-white/[.04] px-3 py-3 text-xs">
                  <div className="flex items-center gap-2"><span className="font-black text-white">{plan.serviceCode}</span><span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/65">{plan.status.replaceAll("_", " ")}</span></div>
                  <div className="mt-1 text-white/58">{stationLabel(plan)} to {stationLabel(plan, true)} at {clock(plan.departureDateTime)}</div>
                </div>
              ))}
            </FeedCard>

            <FeedCard title="TfL" tint="#f87171" subtitle="London distribution layer" value={data?.tfl.disrupted ?? 0} statLabel="lines off-good" actionLabel="Ask TfL" onAction={() => ask("All TfL line status right now")}>
              {tflTop.length === 0 && <div className="rounded-2xl bg-white/[.04] px-3 py-3 text-xs text-white/55">All monitored lines are currently reporting good service.</div>}
              {tflTop.map(line => <div key={line.id} className="rounded-2xl bg-white/[.04] px-3 py-3 text-xs"><div className="font-black text-white">{line.name}</div><div className="mt-1 text-white/58">{line.lineStatuses[0]?.statusSeverityDescription ?? "Check feed"}</div></div>)}
            </FeedCard>

            <FeedCard title="National Rail" tint="#93c5fd" subtitle="UK onward movement" value={data?.nationalRail.delayed ?? 0} statLabel="late services" actionLabel="Ask mainline" onAction={() => ask("Show the National Rail operating picture")}>
              {nrailTop.length === 0 && <div className="rounded-2xl bg-white/[.04] px-3 py-3 text-xs text-white/55">No delayed mainline services are being highlighted in the dashboard slice.</div>}
              {nrailTop.map((service, index) => <div key={`${service.hub}-${index}`} className="rounded-2xl bg-white/[.04] px-3 py-3 text-xs"><div className="font-black text-white">{service.destination}</div><div className="mt-1 text-white/58">{service.hub} {service.scheduled} · +{service.delay} min</div></div>)}
            </FeedCard>

            <FeedCard title="Paris RER" tint="#4ade80" subtitle="Interchange and suburban flow" value={data?.paris.delayed ?? 0} statLabel="late departures" actionLabel="Ask Paris" onAction={() => ask("Show Paris RER departures from Gare du Nord")}>
              {parisTop.length === 0 && <div className="rounded-2xl bg-white/[.04] px-3 py-3 text-xs text-white/55">Paris departure boards are still reconnecting.</div>}
              {parisTop.map((service, index) => <div key={`${service.line}-${service.time}-${index}`} className="rounded-2xl bg-white/[.04] px-3 py-3 text-xs"><div className="font-black text-white">{service.line || service.mode} to {service.direction}</div><div className="mt-1 text-white/58">{service.time}{service.delay > 0 ? ` · +${service.delay} min` : " · on time"}</div></div>)}
            </FeedCard>

            <FeedCard title="SNCF" tint="#f472b6" subtitle="French national continuation" value={data?.sncf.incidents.length ?? 0} statLabel="alerts" actionLabel="Ask SNCF" onAction={() => ask("Show all active SNCF disruptions today")}>
              {sncfTop.length === 0 && <div className="rounded-2xl bg-white/[.04] px-3 py-3 text-xs text-white/55">No SNCF alert is currently being flagged in this feed slice.</div>}
              {sncfTop.map((incident, index) => <div key={`${incident.impacted}-${index}`} className="rounded-2xl bg-white/[.04] px-3 py-3 text-xs"><div className="font-black text-white">{incident.impacted || incident.severity}</div><div className="mt-1 line-clamp-2 text-white/58">{incident.message || incident.effect}</div></div>)}
            </FeedCard>
          </section>

          <section className="mt-6 rounded-[30px] border border-white/10 bg-[rgba(8,14,28,.82)] p-5 shadow-[0_20px_80px_rgba(2,6,23,.28)] backdrop-blur-xl">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-fuchsia-400/15 text-fuchsia-300"><Link2 size={18} /></span>
              <div>
                <div className="text-sm font-black text-white">Incident correlation layer</div>
                <div className="text-[11px] text-white/45">Shared pressure points between Eurostar, city access, and onward networks</div>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
              {correlations.map(item => {
                const tone = severityStyle(item.severity)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => ask(`Explain this network correlation: ${item.headline}`)}
                    className="rounded-[24px] border p-4 text-left transition hover:-translate-y-0.5"
                    style={{ borderColor: tone.border, background: "rgba(255,255,255,.03)" }}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: tone.fill }} />
                      <span className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: tone.text }}>{item.severity}</span>
                      <span className="ml-auto text-[11px] text-white/35">{item.confidence}%</span>
                    </div>
                    <div className="text-sm font-black text-white">{item.headline}</div>
                    <div className="mt-2 text-[12px] leading-5 text-white/58">{item.explanation}</div>
                    <div className="mt-3 rounded-2xl bg-white/[.04] px-3 py-2.5">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Cause</div>
                      <div className="mt-1 text-[12px] text-white/70">{item.cause}</div>
                    </div>
                    <div className="mt-2 rounded-2xl bg-white/[.04] px-3 py-2.5">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Effect</div>
                      <div className="mt-1 text-[12px] text-white/70">{item.effect}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.networks.map(label => <span key={label} className="rounded-full border border-white/10 bg-white/[.05] px-2.5 py-1 text-[10px] font-bold text-white/70">{label}</span>)}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(350px,.8fr)]">
            <div className="rounded-[30px] border border-white/10 bg-[rgba(8,14,28,.82)] p-5 shadow-[0_20px_80px_rgba(2,6,23,.28)] backdrop-blur-xl">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-400/15 text-sky-300"><Activity size={18} /></span>
                <div>
                  <div className="text-sm font-black text-white">Live transfer prompts</div>
                  <div className="text-[11px] text-white/45">Useful follow-up questions directly from the wall</div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  "If Eurostar into Paris is late, what are the best onward options right now?",
                  "How is London handling arrivals from Eurostar tonight?",
                  "Show the current cross-border operating picture",
                  "Which network is most likely to break the passenger chain right now?",
                ].map(query => (
                  <button
                    key={query}
                    type="button"
                    onClick={() => ask(query)}
                    className="rounded-[24px] border px-4 py-4 text-left text-sm font-bold transition hover:-translate-y-0.5"
                    style={{
                      borderColor: "rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.06)",
                      color: "#f8fafc",
                    }}
                  >
                    {query}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[30px] border border-white/10 bg-[rgba(8,14,28,.82)] p-5 shadow-[0_20px_80px_rgba(2,6,23,.28)] backdrop-blur-xl">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300"><Shield size={18} /></span>
                <div>
                  <div className="text-sm font-black text-white">Feed health</div>
                  <div className="text-[11px] text-white/45">Any missing live sections are listed here</div>
                </div>
              </div>
              <div className="space-y-2">
                {!data?.errors || Object.keys(data.errors).length === 0 ? (
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100">All wall sections responded on the last refresh.</div>
                ) : Object.entries(data.errors).slice(0, 8).map(([key, value]) => (
                  <div key={key} className="rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-black text-amber-100"><AlertTriangle size={14} /> {key}</div>
                    <div className="mt-1 text-[12px] text-amber-50/75">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    </motion.div>
  )
}
