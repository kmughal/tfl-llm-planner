import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { ArrowRight, Clock3, RefreshCw, TrainFront, X } from "lucide-react"
import { EurostarDisplayMenu, EurostarDisplayStyles, eurostarDisplayClass, useEurostarDisplay } from "./EurostarDisplay"
import { readResponseState, responseSourceMeta, staleLabel, type ResponseState } from "../lib/responseState"
import { DisabledServiceBanner, ServicePowerBadge } from "./ServicePowerBadge"

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8080"
const PARIS_GREEN = "#009a44"
const PARIS_MINT = "#34d399"

type Service = { time: string; baseTime: string; delay: number; mode: string; line: string; direction: string; color: string; textColor: string }
type Board = { station: string; services: Service[] }
type Data = { boards: Board[]; fetchedAt: string; toolSources: string[]; errors?: Record<string, string>; responseState?: ResponseState }

async function readJsonOrThrow(response: Response): Promise<Data & { error?: string }> {
  const raw = await response.text()
  try {
    return JSON.parse(raw) as Data & { error?: string }
  } catch {
    const trimmed = raw.trim()
    if (response.status === 404 || trimmed.startsWith("404")) {
      throw new Error("Paris dashboard endpoint is not available on the running backend yet. Restart the backend to load /api/paris/command-center.")
    }
    if (!trimmed) {
      throw new Error("Paris dashboard returned an empty response.")
    }
    throw new Error(trimmed.slice(0, 220))
  }
}

const LINE_COLORS: Record<string, { bg: string; fg: string }> = {
  a: { bg: "#E2231A", fg: "#fff" },
  b: { bg: "#4B92DB", fg: "#fff" },
  c: { bg: "#FFCD00", fg: "#000" },
  d: { bg: "#007852", fg: "#fff" },
  e: { bg: "#BF7FB5", fg: "#fff" },
  h: { bg: "#8d5e2a", fg: "#fff" },
  j: { bg: "#7d4ab5", fg: "#fff" },
  l: { bg: "#8ec63f", fg: "#000" },
  n: { bg: "#00a3e0", fg: "#fff" },
  p: { bg: "#f28c28", fg: "#000" },
  u: { bg: "#ed6ea7", fg: "#000" },
}

function shortStation(name: string): string {
  return name.replace(/^Paris\s+/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim()
}

function lineStyle(service: Service) {
  const key = service.line.toLowerCase().trim()
  if (LINE_COLORS[key]) return LINE_COLORS[key]
  if (service.color) {
    return {
      bg: service.color.startsWith("#") ? service.color : `#${service.color}`,
      fg: service.textColor ? (service.textColor.startsWith("#") ? service.textColor : `#${service.textColor}`) : "#fff",
    }
  }
  return { bg: "#475569", fg: "#fff" }
}

function serviceQuery(board: Board, service: Service): string {
  const line = service.line.trim()
  if (line) return `Show ${line} departures from ${board.station}`
  return `Show live departures from ${board.station} toward ${service.direction}`
}

export function ParisRERCommandCenter({ onClose, onAsk }: { readonly onClose: () => void; readonly onAsk?: (query: string) => void }) {
  const { theme, compact } = useEurostarDisplay()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selectedStation, setSelectedStation] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch(`${API}/api/paris/command-center`)
      const body = await readJsonOrThrow(response)
      const responseState = readResponseState(response, body)
      if (!response.ok) {
        if (responseState.disabled) {
          setData({ boards: [], fetchedAt: new Date().toISOString(), toolSources: [], errors: {}, responseState })
          setSelectedStation("")
          return
        }
        throw new Error(body.error || "Paris RER tools are unavailable")
      }
      setData({ ...body, responseState })
      setSelectedStation(current => current || body.boards[0]?.station || "")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load Paris RER operations")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const board = data?.boards.find(item => item.station === selectedStation) ?? data?.boards[0]
  const services = data?.boards.flatMap(item => item.services) ?? []
  const delayed = services.filter(service => service.delay > 0).length
  const lineCount = useMemo(() => new Set(services.map(service => service.line).filter(Boolean)).size, [services])
  const latestUpdate = data?.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"
  const sourceMeta = responseSourceMeta(data?.responseState)
  const serviceEnabled = !data?.responseState?.disabled

  const ask = (query: string) => {
    if (!onAsk) return
    onClose()
    onAsk(query)
  }

  return (
    <motion.div
      className={`${eurostarDisplayClass(theme, compact)} fixed inset-0 z-[90] flex flex-col overflow-hidden`}
      style={{ background: "var(--es-bg)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <EurostarDisplayStyles />
      <header className="es-themed-panel flex shrink-0 items-center gap-3 border-b px-5 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg text-white" style={{ background: `linear-gradient(135deg, ${PARIS_GREEN}, ${PARIS_MINT})` }}>
          <TrainFront size={20} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2"><h1 className="es-adaptive-text text-base font-black">Paris RER Command Center</h1><ServicePowerBadge enabled={serviceEnabled} label={serviceEnabled ? "Paris on" : "Paris off"} compact /></div>
          <p className="es-adaptive-subtle text-xs">RER and Transilien departures across the key Paris interchange hubs</p>
        </div>
        <div className="es-adaptive-subtle ml-auto hidden items-center gap-2 text-xs md:flex"><Clock3 size={13} /> Updated {latestUpdate}</div>
        {data?.responseState && <div className="hidden items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-black md:flex" style={{ background: sourceMeta.bg, borderColor: sourceMeta.border, color: sourceMeta.text }}><span className="h-2 w-2 rounded-full" style={{ background: sourceMeta.dot }} />{sourceMeta.label}</div>}
        <EurostarDisplayMenu />
        <button type="button" onClick={() => void load()} className="es-themed-panel flex h-9 w-9 items-center justify-center rounded-lg border" aria-label="Refresh Paris RER data">
          <motion.span className="flex" animate={loading ? { rotate: 360 } : { rotate: 0 }} transition={{ repeat: loading ? Infinity : 0, duration: 0.8, ease: "linear" }}><RefreshCw size={15} /></motion.span>
        </button>
        <button type="button" onClick={onClose} className="es-themed-panel flex h-9 w-9 items-center justify-center rounded-lg border" aria-label="Close Paris RER command center"><X size={16} /></button>
      </header>

      <main className="flex-1 overflow-y-auto p-5">
        {data?.responseState?.disabled && <DisabledServiceBanner message={data.responseState.error || "Paris RER has been disabled in Config > Services."} />}
        {data?.responseState?.stale && <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{staleLabel(data.responseState)} is being shown while Paris live boards are reconnecting.</div>}
        {error && <div className="mb-4 rounded-lg border border-red-400 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div>}

        <section className="mb-4 grid grid-cols-[minmax(0,1.3fr)_minmax(280px,.7fr)] gap-4 max-xl:grid-cols-1">
          <div className="relative overflow-hidden rounded-lg p-5 text-white" style={{ background: "linear-gradient(120deg,#005f2b 0%,#009a44 52%,#34d399 100%)" }}>
            <motion.div className="absolute inset-y-0 w-28 bg-white/10 blur-2xl" animate={{ left: ["-15%", "110%"] }} transition={{ duration: 5.5, repeat: Infinity, ease: "linear" }} />
            <div className="relative">
              <div className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-white/70">Paris moving now</div>
              <h2 className="max-w-2xl text-3xl font-black">{delayed > 0 ? `${delayed} departures are running late` : "Paris suburban rail is flowing"}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/75">Live RER and Transilien departures from the stations most people use to move into and across Paris.</p>
              <div className="mt-5 grid grid-cols-4 gap-2 max-md:grid-cols-2">
                {[[services.length, "departures"], [lineCount, "lines"], [delayed, "delayed"], [data?.boards.length ?? 0, "stations"]].map(([value, label]) => (
                  <div key={label} className="rounded-lg border border-white/20 bg-black/10 px-3 py-3"><div className="text-2xl font-black tabular-nums">{loading ? "..." : value}</div><div className="text-[11px] text-white/65">{label}</div></div>
                ))}
              </div>
            </div>
          </div>

          <div className="es-themed-panel rounded-lg border p-4">
            <div className="mb-4 flex items-center justify-between"><div><h2 className="es-adaptive-text text-sm font-black">Station pulse</h2><p className="es-adaptive-subtle text-xs">Core interchange coverage</p></div><div className="text-3xl font-black" style={{ color: PARIS_GREEN }}>{data?.boards.length ?? 0}</div></div>
            <div className="space-y-2">
              {data?.boards.map(item => {
                const late = item.services.filter(service => service.delay > 0).length
                return (
                  <button key={item.station} type="button" onClick={() => setSelectedStation(item.station)} className="es-adaptive-muted flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left" style={{ borderColor: selectedStation === item.station ? PARIS_GREEN : "var(--es-border)" }}>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ background: selectedStation === item.station ? PARIS_GREEN : "#64748b" }}>{item.services.length}</span>
                    <span className="min-w-0 flex-1"><span className="es-adaptive-text block truncate text-xs font-black">{shortStation(item.station)}</span><span className="es-adaptive-subtle block text-[10px]">{late > 0 ? `${late} delayed departures` : "all shown services on time"}</span></span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)] gap-4 max-xl:grid-cols-1">
          <div className="es-themed-panel rounded-lg border p-4">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="mr-auto"><h2 className="es-adaptive-text text-sm font-black">Departure boards</h2><p className="es-adaptive-subtle text-xs">Pick a hub and inspect the next RER and Transilien moves</p></div>
              {data?.boards.map(item => <button key={item.station} type="button" onClick={() => setSelectedStation(item.station)} className="rounded-full border px-3 py-1.5 text-[11px] font-bold" style={{ borderColor: selectedStation === item.station ? PARIS_GREEN : "var(--es-border)", color: selectedStation === item.station ? PARIS_GREEN : "var(--es-muted)", background: selectedStation === item.station ? "rgba(0,154,68,.08)" : "transparent" }}>{shortStation(item.station)}</button>)}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {board?.services.map((service, index) => {
                const colors = lineStyle(service)
                return (
                  <motion.button key={`${service.line}-${service.time}-${index}`} type="button" onClick={() => ask(serviceQuery(board, service))} className="es-adaptive-muted flex min-h-24 items-center gap-3 rounded-lg border p-3 text-left" style={{ borderColor: service.delay ? "#f59e0b" : "var(--es-border)" }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} whileHover={{ y: -2 }}>
                    <div className="w-14 shrink-0">
                      <div className="es-adaptive-text text-xl font-black tabular-nums">{service.time}</div>
                      {service.delay > 0 ? <div className="text-[10px] font-bold text-amber-600">+{service.delay} min</div> : <div className="text-[10px] font-bold text-emerald-600">On time</div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-1.5">
                        <span className="rounded px-1.5 py-0.5 text-[9px] font-black" style={{ background: colors.bg, color: colors.fg }}>{service.line || service.mode}</span>
                        <span className="es-adaptive-subtle text-[10px] font-mono">{service.mode}</span>
                      </div>
                      <div className="es-adaptive-text truncate text-xs font-bold">{service.direction}</div>
                    </div>
                    <ArrowRight className="es-adaptive-subtle" size={14} />
                  </motion.button>
                )
              })}
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <div className="es-themed-panel rounded-lg border p-4">
              <h2 className="es-adaptive-text text-sm font-black">Quick asks</h2>
              <p className="es-adaptive-subtle mb-3 text-xs">Common Paris connection questions, directly from the dashboard</p>
              <div className="space-y-2">
                {[
                  "How do I get into Paris from Gare du Nord?",
                  "RER B departures from Gare du Nord",
                  "Paris transit from Chatelet",
                  "Next trains from Saint-Lazare",
                ].map(query => (
                  <button key={query} type="button" onClick={() => ask(query)} className="es-adaptive-muted flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-xs font-bold">
                    <span className="min-w-0 pr-3">{query}</span>
                    <ArrowRight size={13} className="shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            <div className="es-themed-panel rounded-lg border p-4">
              <div className="mb-3 flex items-center justify-between"><div><h2 className="es-adaptive-text text-sm font-black">Live lines</h2><p className="es-adaptive-subtle text-xs">Distinct services in the current boards</p></div><span className="rounded-full px-2 py-1 text-xs font-black text-white" style={{ background: PARIS_GREEN }}>{lineCount}</span></div>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set(services.map(service => service.line).filter(Boolean))).map(line => {
                  const colors = lineStyle({ time: "", baseTime: "", delay: 0, mode: "", line, direction: "", color: "", textColor: "" })
                  return <span key={line} className="rounded-full px-2.5 py-1 text-[11px] font-black" style={{ background: colors.bg, color: colors.fg }}>{line}</span>
                })}
              </div>
            </div>
          </aside>
        </section>
      </main>
    </motion.div>
  )
}
