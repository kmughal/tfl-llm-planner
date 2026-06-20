import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  AlertTriangle, ArrowRight, Clock3, RefreshCw, Search,
  TrainFront, X, Zap,
} from "lucide-react"
import { EurostarDisplayMenu, EurostarDisplayStyles, eurostarDisplayClass, useEurostarDisplay } from "./EurostarDisplay"
import { readResponseState, responseSourceMeta, staleLabel, type ResponseState } from "../lib/responseState"
import { DisabledServiceBanner, ServicePowerBadge } from "./ServicePowerBadge"

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8080"
const SNCF_RED = "#e2001a"
const SNCF_PINK = "#d6006d"

type Service = { time: string; baseTime: string; delay: number; mode: string; number: string; direction: string }
type Board = { station: string; services: Service[] }
type Incident = { effect: string; severity: string; impacted: string; message: string; begin: string; end: string }
type DashboardData = { boards: Board[]; incidents: Incident[]; fetchedAt: string; toolSources: string[]; errors?: Record<string, string>; responseState?: ResponseState }

function modeColor(mode: string): string {
  const value = mode.toLowerCase()
  if (value.includes("ouigo")) return "#d6006d"
  if (value.includes("ter")) return "#1671b9"
  if (value.includes("inter")) return "#6b7280"
  return "#e05206"
}

function shortStation(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/^Paris\s*-?\s*/i, "")
    .replace(/\s*-\s*Hall.*$/i, "")
    .replace(/Saint-/g, "St-")
}

function cleanPlace(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim()
}

function extractTrainNumber(service: Service): string {
  const sources = [service.number, service.direction]
  for (const source of sources) {
    const match = source.match(/\b\d{3,6}\b/)
    if (match) return match[0]
  }
  return ""
}

function serviceQuery(station: string, service: Service): string {
  const trainNumber = extractTrainNumber(service)
  if (trainNumber) {
    return `Show the full SNCF schedule for train ${trainNumber}`
  }

  const origin = cleanPlace(station)
  const destination = cleanPlace(service.direction)
  if (destination && destination.toLowerCase() !== origin.toLowerCase()) {
    return `Plan an SNCF journey from ${origin} to ${destination}`
  }

  return `Show SNCF departures from ${station} around ${service.time}`
}

export function SNCFCommandCenter({ onClose, onAsk }: { readonly onClose: () => void; readonly onAsk?: (query: string) => void }) {
  const { theme, compact } = useEurostarDisplay()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selectedStation, setSelectedStation] = useState("")
  const [from, setFrom] = useState("Paris Gare de Lyon")
  const [to, setTo] = useState("Lyon Part-Dieu")
  const [stationSearch, setStationSearch] = useState("")
  const [trainNumber, setTrainNumber] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch(`${API}/api/sncf/command-center`)
      const body = await response.json() as DashboardData & { error?: string }
      const responseState = readResponseState(response, body)
      if (!response.ok) {
        if (responseState.disabled) {
          setData({ boards: [], incidents: [], fetchedAt: new Date().toISOString(), toolSources: [], errors: {}, responseState })
          setSelectedStation("")
          return
        }
        throw new Error(body.error || "SNCF live tools are unavailable")
      }
      setData({ ...body, responseState })
      setSelectedStation(current => current || body.boards[0]?.station || "")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load SNCF operations")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const services = data?.boards.flatMap(board => board.services) ?? []
  const delayed = services.filter(service => service.delay > 0)
  const modes = new Set(services.map(service => service.mode).filter(Boolean))
  const board = data?.boards.find(item => item.station === selectedStation) ?? data?.boards[0]
  const latestUpdate = data?.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"
  const health = services.length ? Math.round(((services.length - delayed.length) / services.length) * 100) : 0
  const cities = useMemo(() => data?.boards.map(item => shortStation(item.station)) ?? [], [data])
  const sourceMeta = responseSourceMeta(data?.responseState)
  const serviceEnabled = !data?.responseState?.disabled

  const ask = (query: string) => {
    if (!onAsk) return
    onClose()
    onAsk(query)
  }

  return (
    <motion.div
      className={`${eurostarDisplayClass(theme, compact)} fixed inset-0 z-[75] flex flex-col overflow-hidden`}
      style={{ background: "var(--es-bg)" }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <EurostarDisplayStyles />
      <header className="es-themed-panel flex shrink-0 items-center gap-3 border-b px-5 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg text-white" style={{ background: `linear-gradient(135deg, ${SNCF_RED}, ${SNCF_PINK})` }}>
          <TrainFront size={20} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2"><h1 className="es-adaptive-text text-base font-black">SNCF Command Center</h1><ServicePowerBadge enabled={serviceEnabled} label={serviceEnabled ? "SNCF on" : "SNCF off"} compact /></div>
          <p className="es-adaptive-subtle text-xs">National operations, station departures, disruptions and journey tools</p>
        </div>
        <div className="es-adaptive-subtle ml-auto hidden items-center gap-2 text-xs md:flex"><Clock3 size={13} /> Updated {latestUpdate}</div>
        {data?.responseState && <div className="hidden items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-black md:flex" style={{ background: sourceMeta.bg, borderColor: sourceMeta.border, color: sourceMeta.text }}><span className="h-2 w-2 rounded-full" style={{ background: sourceMeta.dot }} />{sourceMeta.label}</div>}
        <EurostarDisplayMenu />
        <button type="button" onClick={() => void load()} className="es-themed-panel flex h-9 w-9 items-center justify-center rounded-lg border" aria-label="Refresh SNCF data">
          <motion.span className="flex" animate={loading ? { rotate: 360 } : { rotate: 0 }} transition={{ repeat: loading ? Infinity : 0, duration: 0.8, ease: "linear" }}><RefreshCw size={15} /></motion.span>
        </button>
        <button type="button" onClick={onClose} className="es-themed-panel flex h-9 w-9 items-center justify-center rounded-lg border" aria-label="Close SNCF command center"><X size={16} /></button>
      </header>

      <main className="flex-1 overflow-y-auto p-5">
        {data?.responseState?.disabled && <DisabledServiceBanner message={data.responseState.error || "SNCF has been disabled in Config > Services."} />}
        {data?.responseState?.stale && <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{staleLabel(data.responseState)} is being shown while SNCF live feeds are degraded.</div>}
        {error && <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-400 bg-red-50 px-4 py-3 text-sm font-bold text-red-800"><AlertTriangle size={16} />{error}</div>}

        <section className="mb-4 grid grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)] gap-4 max-xl:grid-cols-1">
          <div className="relative overflow-hidden rounded-lg p-5 text-white" style={{ background: "linear-gradient(120deg,#720018 0%,#c90035 52%,#d6006d 100%)" }}>
            <motion.div className="absolute inset-y-0 w-28 bg-white/10 blur-2xl" animate={{ left: ["-15%", "110%"] }} transition={{ duration: 5, repeat: Infinity, ease: "linear" }} />
            <div className="relative">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-white/70"><Zap size={13} /> France moving now</div>
              <h2 className="max-w-2xl text-3xl font-black">{data?.incidents.length ? `${data.incidents.length} network alerts need attention` : "The national network is moving"}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/75">Live SNCF departures and active disruption intelligence across major French rail hubs.</p>
              <div className="mt-5 grid grid-cols-4 gap-2 max-md:grid-cols-2">
                {[[services.length,"departures"],[health,"on time %"],[delayed.length,"delayed"],[data?.incidents.length ?? 0,"incidents"]].map(([value,label]) => (
                  <div key={label} className="rounded-lg border border-white/20 bg-black/10 px-3 py-3"><div className="text-2xl font-black tabular-nums">{loading ? "..." : value}</div><div className="text-[11px] text-white/65">{label}</div></div>
                ))}
              </div>
            </div>
          </div>

          <div className="es-themed-panel rounded-lg border p-4">
            <div className="mb-4 flex items-center justify-between"><div><h2 className="es-adaptive-text text-sm font-black">Network pulse</h2><p className="es-adaptive-subtle text-xs">Live feed coverage</p></div><div className="text-3xl font-black" style={{ color: SNCF_RED }}>{health}%</div></div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-200"><motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg,${SNCF_RED},${SNCF_PINK})` }} animate={{ width: `${health}%` }} /></div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="es-adaptive-muted rounded-lg p-3"><div className="es-adaptive-subtle text-[10px] font-bold uppercase">Stations</div><div className="es-adaptive-text mt-1 text-2xl font-black">{data?.boards.length ?? 0}</div></div>
              <div className="es-adaptive-muted rounded-lg p-3"><div className="es-adaptive-subtle text-[10px] font-bold uppercase">Modes</div><div className="es-adaptive-text mt-1 text-2xl font-black">{modes.size}</div></div>
            </div>
          </div>
        </section>

        <section className="es-themed-panel mb-4 overflow-hidden rounded-lg border p-4">
          <div className="mb-5 flex items-center justify-between"><div><h2 className="es-adaptive-text text-sm font-black">National city spine</h2><p className="es-adaptive-subtle text-xs">Monitored departure hubs</p></div><span className="es-adaptive-subtle text-xs">{cities.length} live boards</span></div>
          <div className="relative grid grid-cols-4 gap-2 max-md:grid-cols-2">
            <div className="absolute left-[8%] right-[8%] top-2 h-1 rounded-full max-md:hidden" style={{ background: `linear-gradient(90deg,${SNCF_RED},${SNCF_PINK},#e05206)` }} />
            <motion.div className="absolute top-0 h-5 w-5 rounded-full border-4 border-white shadow-lg max-md:hidden" style={{ background: SNCF_RED }} animate={{ left: ["8%", "90%"] }} transition={{ duration: 6, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }} />
            {cities.map((city, index) => <div key={city} className="relative pt-7 text-center"><span className="es-adaptive-text text-xs font-black">{city}</span><div className="es-adaptive-subtle text-[10px]">Hub {index + 1}</div></div>)}
          </div>
        </section>

        <section className="grid grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)] gap-4 max-xl:grid-cols-1">
          <div className="es-themed-panel rounded-lg border p-4">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="mr-auto"><h2 className="es-adaptive-text text-sm font-black">Departure pulse</h2><p className="es-adaptive-subtle text-xs">Select a station to inspect its next services</p></div>
              {data?.boards.map(item => <button key={item.station} type="button" onClick={() => setSelectedStation(item.station)} className="rounded-full border px-3 py-1.5 text-[11px] font-bold" style={{ borderColor: selectedStation === item.station ? SNCF_RED : "var(--es-border)", color: selectedStation === item.station ? SNCF_RED : "var(--es-muted)", background: selectedStation === item.station ? "rgba(226,0,26,.08)" : "transparent" }}>{shortStation(item.station)}</button>)}
            </div>
            <div className={`grid ${compact ? "grid-cols-3" : "grid-cols-2"} gap-2 max-md:grid-cols-1`}>
              {board?.services.map((service, index) => (
                <motion.button key={`${service.number}-${service.time}-${index}`} type="button" onClick={() => ask(serviceQuery(board.station, service))} className="es-adaptive-muted flex min-h-24 items-center gap-3 rounded-lg border p-3 text-left" style={{ borderColor: service.delay ? "#f59e0b" : "var(--es-border)" }} initial={{ opacity:0,y:8 }} animate={{opacity:1,y:0}} transition={{delay:index*.04}} whileHover={{y:-2}}>
                  <div className="w-14 shrink-0"><div className="es-adaptive-text text-xl font-black tabular-nums">{service.time}</div>{service.delay > 0 && <div className="text-[10px] font-bold text-amber-600">+{service.delay} min</div>}</div>
                  <div className="min-w-0 flex-1"><div className="mb-1 flex items-center gap-1.5"><span className="rounded px-1.5 py-0.5 text-[9px] font-black text-white" style={{background:modeColor(service.mode)}}>{service.mode || "TRAIN"}</span><span className="es-adaptive-subtle text-[10px] font-mono">{service.number}</span></div><div className="es-adaptive-text truncate text-xs font-bold">{service.direction}</div></div>
                  <ArrowRight className="es-adaptive-subtle" size={14}/>
                </motion.button>
              ))}
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <div className="es-themed-panel rounded-lg border p-4">
              <h2 className="es-adaptive-text text-sm font-black">Ask SNCF</h2><p className="es-adaptive-subtle mb-3 text-xs">Live tools, directly from this dashboard</p>
              <div className="space-y-3">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"><input value={from} onChange={event=>setFrom(event.target.value)} className="es-themed-panel min-w-0 rounded-lg border px-3 py-2 text-xs" aria-label="SNCF journey origin"/><ArrowRight size={14}/><input value={to} onChange={event=>setTo(event.target.value)} className="es-themed-panel min-w-0 rounded-lg border px-3 py-2 text-xs" aria-label="SNCF journey destination"/></div>
                <button type="button" onClick={()=>ask(`Plan an SNCF journey from ${from} to ${to}`)} className="w-full rounded-lg px-3 py-2 text-xs font-black text-white" style={{background:SNCF_RED}}>Plan journey</button>
                <div className="flex gap-2"><input value={stationSearch} onChange={event=>setStationSearch(event.target.value)} placeholder="Find a French station" className="es-themed-panel min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs"/><button type="button" disabled={!stationSearch.trim()} onClick={()=>ask(`Find SNCF station ${stationSearch}`)} className="es-themed-panel flex h-9 w-9 items-center justify-center rounded-lg border"><Search size={14}/></button></div>
                <div className="flex gap-2"><input value={trainNumber} onChange={event=>setTrainNumber(event.target.value)} placeholder="TGV or train number" className="es-themed-panel min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs"/><button type="button" disabled={!trainNumber.trim()} onClick={()=>ask(`Show the full SNCF schedule for train ${trainNumber}`)} className="es-themed-panel flex h-9 w-9 items-center justify-center rounded-lg border"><TrainFront size={14}/></button></div>
              </div>
            </div>

            <div className="es-themed-panel rounded-lg border p-4">
              <div className="mb-3 flex items-center justify-between"><div><h2 className="es-adaptive-text text-sm font-black">Active alerts</h2><p className="es-adaptive-subtle text-xs">SNCF network disruptions</p></div><span className="rounded-full px-2 py-1 text-xs font-black text-white" style={{background:data?.incidents.length ? SNCF_RED : "#059669"}}>{data?.incidents.length ?? 0}</span></div>
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {!data?.incidents.length && <div className="es-adaptive-muted rounded-lg p-3 text-xs font-bold text-emerald-600">No active disruption returned by SNCF.</div>}
                {data?.incidents.slice(0,6).map((incident,index)=><button type="button" key={`${incident.effect}-${index}`} onClick={()=>ask("Show all active SNCF disruptions today")} className="es-adaptive-muted w-full rounded-lg border-l-4 p-3 text-left" style={{borderLeftColor:incident.effect==="NO_SERVICE"?SNCF_RED:"#f59e0b"}}><div className="es-adaptive-text text-xs font-black">{incident.impacted || incident.severity}</div><div className="es-adaptive-subtle mt-1 line-clamp-2 text-[11px]">{incident.message || incident.effect.replaceAll("_"," ")}</div></button>)}
              </div>
            </div>
          </aside>
        </section>
      </main>
      <footer className="es-themed-panel flex shrink-0 items-center gap-3 border-t px-5 py-2 text-[10px]"><span className="es-adaptive-subtle">Live via MCP</span><span className="es-adaptive-subtle">get_sncf_departures</span><span className="es-adaptive-subtle">get_sncf_disruptions</span><span className="es-adaptive-subtle ml-auto">No mock data</span></footer>
    </motion.div>
  )
}
