import { useCallback, useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertCircle, ArrowRight, Bus, ChevronRight, Clock3, MapPin, Navigation, RefreshCw, Route, Search, TrainFront, X } from "lucide-react"

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? ""
const BLUE = "#003688"
const RED = "#e32017"

type Detail = { statusSeverity: number; statusSeverityDescription: string; reason?: string }
type Line = { id: string; name: string; modeName: string; lineStatuses: Detail[] }
type Road = { id: string; displayName: string; statusSeverity: string; statusSeverityDescription: string }
type BusLine = { id: string; name: string }
type Arrival = { stopName: string; lineName: string; etaMs: number }
type Arrivals = { lineID: string; serverTimeMs: number; arrivals: Arrival[] }
type CrowdingSample = { timeBand: string; percentageOfBaseline: number }
type CrowdingStop = {
  id: string
  name: string
  currentTimeBand: string
  currentLevel: number
  peakLevel: number
  amPeakTimeBand: string
  pmPeakTimeBand: string
  samples: CrowdingSample[]
}
type LineCrowding = {
  lineId: string
  lineName: string
  dayOfWeek: string
  fetchedAt: string
  stops: CrowdingStop[]
  stopCount: number
  coverage: number
  missing: number
  currentBand: string
}
type TflData = { lines: Line[]; roads: Road[]; buses: BusLine[]; fetchedAt: Date; errors: Record<string, string> }

const COLORS: Record<string, string> = {
  bakerloo: "#B36305", central: "#E32017", circle: "#FFD300", district: "#00782A", elizabeth: "#6950A1",
  "hammersmith-city": "#F3A9BB", jubilee: "#7B868C", metropolitan: "#9B0056", northern: "#111111",
  piccadilly: "#003688", victoria: "#0098D4", "waterloo-city": "#76D0BD", dlr: "#00A4A7",
  liberty: "#61686b", lioness: "#ffa600", mildmay: "#0077ad", suffragette: "#18a95b", weaver: "#9b0058", windrush: "#dc241f",
}

function color(id: string) { return COLORS[id] ?? BLUE }
function statusOf(line: Line) { return line.lineStatuses[0] ?? { statusSeverity: 0, statusSeverityDescription: "Pending" } }
function goodLine(line: Line) { return statusOf(line).statusSeverity >= 10 }
function goodRoad(road: Road) { return road.statusSeverity.toLowerCase() === "good" }
function eta(when: number, now: number) { const mins = Math.max(0, Math.round((when - now) / 60000)); return mins < 1 ? "Due" : `${mins} min` }

async function loadData(): Promise<TflData> {
  const response = await fetch(`${API}/api/tfl/command-center`)
  if (!response.ok) throw new Error("The TfL service is not connected yet")
  const value = await response.json()
  return { ...value, errors: value.errors ?? {}, fetchedAt: new Date(value.fetchedAt) }
}
async function loadArrivals(id: string): Promise<Arrivals> {
  const response = await fetch(`${API}/api/buses/${encodeURIComponent(id)}/arrivals`)
  if (!response.ok) throw new Error("Live arrivals are unavailable")
  return response.json()
}
async function loadLineCrowding(id: string, name: string): Promise<LineCrowding> {
  const response = await fetch(`${API}/api/tfl/lines/${encodeURIComponent(id)}/crowding?lineName=${encodeURIComponent(name)}`)
  if (!response.ok) throw new Error("Station crowding is unavailable")
  return response.json()
}

function Roundel() {
  return <span className="relative block h-9 w-9 shrink-0"><span className="absolute inset-0 rounded-full border-[7px] border-[#e32017]" /><span className="absolute left-0 right-0 top-1/2 h-2.5 -translate-y-1/2 bg-[#003688]" /></span>
}

function SectionTitle({ icon, title, subtitle, count, inverse = false }: { readonly icon: React.ReactNode; readonly title: string; readonly subtitle: string; readonly count?: number; readonly inverse?: boolean }) {
  return <div className="mb-4 flex items-center gap-3">
    <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: inverse ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.045)", color: inverse ? "white" : "#202124" }}>{icon}</span>
    <div className="min-w-0"><h2 className="truncate text-[15px] font-bold" style={{ color: inverse ? "white" : "#161617" }}>{title}</h2><p className="truncate text-xs" style={{ color: inverse ? "rgba(255,255,255,.5)" : "#6e6e73" }}>{subtitle}</p></div>
    {count !== undefined && <span className="ml-auto rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: inverse ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.055)", color: inverse ? "rgba(255,255,255,.65)" : "#6e6e73" }}>{count}</span>}
  </div>
}

function Unavailable({ label }: { readonly label: string }) {
  return <div className="flex min-h-28 items-center justify-center gap-2 rounded-2xl border border-dashed border-black/10 bg-black/[.018] text-xs text-[#86868b]"><AlertCircle size={15} />{label} is reconnecting</div>
}

function crowdingTone(level: number) {
  if (level >= 70) return { color: "#ff453a", bg: "rgba(255,69,58,.12)", label: "Busy" }
  if (level >= 40) return { color: "#ff9f0a", bg: "rgba(255,159,10,.12)", label: "Building" }
  return { color: "#30d158", bg: "rgba(48,209,88,.12)", label: "Light" }
}

function Sparkline({ samples, tint }: { readonly samples: CrowdingSample[]; readonly tint: string }) {
  if (!samples.length) return null
  const width = 180
  const height = 42
  const max = Math.max(...samples.map(sample => sample.percentageOfBaseline), 1)
  const points = samples.map((sample, index) => {
    const x = (index / Math.max(samples.length - 1, 1)) * width
    const y = height - (sample.percentageOfBaseline / max) * (height - 6) - 3
    return `${x},${y}`
  }).join(" ")

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-11 w-full overflow-visible">
      <polyline
        fill="none"
        stroke={tint}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

export function TflCommandCenter({ onClose, onAsk }: { readonly onClose: () => void; readonly onAsk?: (query: string) => void }) {
  const [data, setData] = useState<TflData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLine, setSelectedLine] = useState<string | null>(null)
  const [busQuery, setBusQuery] = useState("")
  const [selectedBus, setSelectedBus] = useState<string | null>(null)
  const [arrivals, setArrivals] = useState<Arrivals | null>(null)
  const [arrivalLoading, setArrivalLoading] = useState(false)
  const [arrivalError, setArrivalError] = useState<string | null>(null)
  const [crowding, setCrowding] = useState<LineCrowding | null>(null)
  const [crowdingLoading, setCrowdingLoading] = useState(false)
  const [crowdingError, setCrowdingError] = useState<string | null>(null)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [stop, setStop] = useState("")

  const load = useCallback(async () => { setLoading(true); try { setData(await loadData()); setError(null) } catch (cause) { setError(cause instanceof Error ? cause.message : "TfL connection unavailable") } finally { setLoading(false) } }, [])
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 60000); return () => window.clearInterval(timer) }, [load])

  const lines = data?.lines ?? []
  const buses = data?.buses ?? []
  const roads = data?.roads ?? []
  const disruptions = lines.filter(line => !goodLine(line))
  const roadIssues = roads.filter(road => !goodRoad(road))
  const health = lines.length ? Math.round(((lines.length - disruptions.length) / lines.length) * 100) : null
  const activeLine = lines.find(line => line.id === selectedLine) ?? null
  const visibleBuses = useMemo(() => { const query = busQuery.trim().toLowerCase(); return (query ? buses.filter(bus => bus.id.toLowerCase().includes(query) || bus.name.toLowerCase().includes(query)) : buses).slice(0, 72) }, [buses, busQuery])
  const ask = (query: string) => { onClose(); onAsk?.(query) }
  const submitJourney = (event: FormEvent) => { event.preventDefault(); if (from.trim() && to.trim()) ask(`Plan a live TfL journey from ${from.trim()} to ${to.trim()}`) }
  const submitStop = (event: FormEvent) => { event.preventDefault(); if (stop.trim()) ask(`Find TfL stations and stops matching ${stop.trim()}`) }
  const chooseBus = async (id: string) => { setSelectedBus(id); setArrivalLoading(true); setArrivalError(null); setArrivals(null); try { setArrivals(await loadArrivals(id)) } catch (cause) { setArrivalError(cause instanceof Error ? cause.message : "Arrivals unavailable") } finally { setArrivalLoading(false) } }

  useEffect(() => {
    if (!activeLine) {
      setCrowding(null)
      setCrowdingError(null)
      setCrowdingLoading(false)
      return
    }
    let cancelled = false
    setCrowdingLoading(true)
    setCrowdingError(null)
    setCrowding(null)
    loadLineCrowding(activeLine.id, activeLine.name)
      .then(value => {
        if (!cancelled) setCrowding(value)
      })
      .catch(cause => {
        if (!cancelled) setCrowdingError(cause instanceof Error ? cause.message : "Crowding unavailable")
      })
      .finally(() => {
        if (!cancelled) setCrowdingLoading(false)
      })
    return () => { cancelled = true }
  }, [activeLine?.id, activeLine?.name])

  return <motion.div className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#f5f5f7] text-[#161617]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <header className="relative z-20 flex h-16 shrink-0 items-center gap-3 border-b border-black/[.07] bg-white/85 px-5 backdrop-blur-2xl">
      <Roundel /><div><h1 className="text-sm font-bold">TfL Live</h1><p className="text-[11px] text-[#6e6e73]">All of London, one operating view</p></div>
      <div className="ml-auto hidden items-center gap-2 text-[11px] text-[#6e6e73] sm:flex"><motion.span className="h-2 w-2 rounded-full" style={{ background: error ? "#ff9f0a" : "#30d158" }} animate={{ opacity: [.4, 1, .4] }} transition={{ repeat: Infinity, duration: 1.7 }} />{data ? `Live at ${data.fetchedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : loading ? "Connecting" : "Connection paused"}</div>
      <button type="button" title="Refresh TfL data" onClick={() => void load()} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/[.045]"><motion.span animate={{ rotate: loading ? 360 : 0 }} transition={{ repeat: loading ? Infinity : 0, duration: .8 }}><RefreshCw size={15} /></motion.span></button>
      <button type="button" aria-label="Close TfL command center" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/[.045]"><X size={16} /></button>
    </header>

    <main className="flex-1 overflow-y-auto">
      <section className="relative overflow-hidden border-b border-black/[.06] bg-white px-5 py-8 sm:px-8">
        <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle at 22% 25%,rgba(0,113,227,.13),transparent 27%),radial-gradient(circle at 82% 18%,rgba(227,32,23,.1),transparent 24%)" }} />
        <div className="relative mx-auto max-w-7xl">
          <div className="grid grid-cols-[minmax(0,1fr)_310px] items-center gap-8 max-lg:grid-cols-1">
            <div><div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[#0071e3]"><motion.span className="h-2 w-2 rounded-full bg-[#30d158]" animate={{ scale: [1, 1.8, 1] }} transition={{ repeat: Infinity, duration: 1.8 }} />London network now</div><h2 className="max-w-3xl text-4xl font-semibold leading-[1.06] tracking-[-.035em] sm:text-5xl">{error ? "London is reconnecting." : disruptions.length ? "London is moving. Here’s what needs attention." : "London is moving beautifully."}</h2><p className="mt-4 max-w-2xl text-[15px] leading-6 text-[#6e6e73]">Live rail status, every bus route, road conditions, stops and journey planning in one continuous workspace.</p></div>
            <div className="relative mx-auto flex h-64 w-64 items-center justify-center">{[0,1,2].map(ring => <motion.div key={ring} className="absolute rounded-full border" style={{ inset: ring * 24, borderColor: "rgba(0,54,136,.16)" }} animate={{ rotate: ring % 2 ? -360 : 360 }} transition={{ duration: 28 + ring * 8, repeat: Infinity, ease: "linear" }}><span className="absolute left-1/2 top-[-4px] h-2 w-2 rounded-full" style={{ background: ring ? BLUE : RED }} /></motion.div>)}<div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-white shadow-[0_18px_60px_rgba(0,54,136,.14)]"><span className="text-4xl font-semibold tracking-[-.04em]">{health ?? "--"}<small className="text-base text-[#0071e3]">%</small></span><span className="text-[10px] font-semibold uppercase tracking-[.15em] text-[#86868b]">Network health</span></div></div>
          </div>
          <div className="mt-8 grid grid-cols-4 overflow-hidden rounded-2xl border border-black/[.06] bg-white/75 shadow-[0_12px_40px_rgba(0,0,0,.05)] backdrop-blur-xl max-md:grid-cols-2">{[[lines.length,"Lines",BLUE],[disruptions.length,"Disruptions","#ff9f0a"],[buses.length,"Bus routes",RED],[roadIssues.length,"Road issues","#ff453a"]].map(([value,label,tint]) => <div key={String(label)} className="relative px-5 py-4 after:absolute after:right-0 after:top-4 after:h-10 after:w-px after:bg-black/[.07] last:after:hidden"><div className="text-2xl font-semibold tabular-nums" style={{ color: String(tint) }}>{data ? value : "--"}</div><div className="text-[11px] text-[#86868b]">{label}</div></div>)}</div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-6 px-5 py-6 sm:px-8">
        <section className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <form onSubmit={submitJourney} className="rounded-3xl border border-black/[.06] bg-white p-5 shadow-[0_10px_35px_rgba(0,0,0,.045)]"><SectionTitle icon={<Navigation size={17} />} title="Plan a journey" subtitle="Live multimodal routing" /><div className="flex items-center gap-2"><input value={from} onChange={event => setFrom(event.target.value)} placeholder="From" className="min-w-0 flex-1 rounded-xl bg-[#f5f5f7] px-3 py-2.5 text-sm outline-none" /><ArrowRight size={14} className="text-[#86868b]" /><input value={to} onChange={event => setTo(event.target.value)} placeholder="To" className="min-w-0 flex-1 rounded-xl bg-[#f5f5f7] px-3 py-2.5 text-sm outline-none" /><button disabled={!from.trim() || !to.trim()} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0071e3] text-white disabled:opacity-30"><ChevronRight size={17} /></button></div></form>
          <form onSubmit={submitStop} className="rounded-3xl border border-black/[.06] bg-white p-5 shadow-[0_10px_35px_rgba(0,0,0,.045)]"><SectionTitle icon={<MapPin size={17} />} title="Find a stop" subtitle="Stations, platforms and bus stops" /><div className="flex gap-2"><div className="flex flex-1 items-center gap-2 rounded-xl bg-[#f5f5f7] px-3"><Search size={14} className="text-[#86868b]" /><input value={stop} onChange={event => setStop(event.target.value)} placeholder="Search London" className="w-full bg-transparent py-2.5 text-sm outline-none" /></div><button disabled={!stop.trim()} className="rounded-xl bg-[#1d1d1f] px-4 text-xs font-semibold text-white disabled:opacity-30">Find</button></div></form>
        </section>

        <section className="rounded-3xl border border-black/[.06] bg-white p-5 shadow-[0_10px_35px_rgba(0,0,0,.045)] sm:p-6"><SectionTitle icon={<TrainFront size={17} />} title="Every line" subtitle="Select a line for live status, stops and crowding" count={lines.length} />{data?.errors.lines && !lines.length ? <Unavailable label="Line status" /> : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{lines.map((line,index) => <motion.button type="button" key={line.id} onClick={() => setSelectedLine(selectedLine === line.id ? null : line.id)} initial={{ opacity:0,y:10 }} animate={{ opacity:1,y:0 }} transition={{ delay:Math.min(index*.025,.35) }} whileHover={{ y:-2 }} className="relative min-h-24 overflow-hidden rounded-2xl border border-black/[.055] bg-[#fafafa] p-3 text-left"><span className="absolute inset-y-0 left-0 w-1.5" style={{ background:color(line.id) }} /><div className="flex items-start justify-between gap-2 pl-1"><span className="text-xs font-bold">{line.name}</span><span className="mt-0.5 h-2 w-2 rounded-full" style={{ background:goodLine(line)?"#30d158":"#ff9f0a" }} /></div><div className="mt-4 pl-1 text-[10px] font-semibold text-[#6e6e73]">{statusOf(line).statusSeverityDescription}</div></motion.button>)}</div>}<AnimatePresence>{activeLine && <motion.div initial={{ opacity:0,height:0 }} animate={{ opacity:1,height:"auto" }} exit={{ opacity:0,height:0 }} className="overflow-hidden"><div className="mt-4 space-y-4 rounded-[28px] bg-[#f5f5f7] p-4"><div className="flex items-center gap-4 rounded-2xl bg-white px-4 py-4 shadow-[0_8px_24px_rgba(0,0,0,.04)]"><span className="h-12 w-1.5 rounded-full" style={{ background:color(activeLine.id) }} /><div><div className="text-sm font-bold">{activeLine.name}</div><p className="mt-1 text-xs leading-5 text-[#6e6e73]">{statusOf(activeLine).reason || statusOf(activeLine).statusSeverityDescription}</p></div></div>{crowdingLoading && <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-4 text-xs text-[#6e6e73]"><motion.span className="h-4 w-4 rounded-full border-2 border-black/10 border-t-[#0071e3]" animate={{ rotate:360 }} transition={{ repeat:Infinity,duration:.8 }} />Loading stops and crowding</div>}{crowdingError && <div className="rounded-2xl bg-white px-4 py-4 text-xs text-[#8a5700]">{crowdingError}</div>}{crowding && <div className="space-y-4"><div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">{[[crowding.stopCount,"Stops"],[crowding.coverage,"Crowding live"],[crowding.missing,"No data"],[crowding.currentBand,"Current band"]].map(([value,label]) => <div key={String(label)} className="rounded-2xl bg-white px-4 py-3 shadow-[0_6px_20px_rgba(0,0,0,.035)]"><div className="text-xl font-semibold tabular-nums text-[#161617]">{String(value)}</div><div className="text-[11px] text-[#86868b]">{label}</div></div>)}</div><div className="grid gap-3 lg:grid-cols-2">{crowding.stops.map((stop,index) => { const tone = crowdingTone(stop.currentLevel); return <motion.div key={stop.id} initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} transition={{ delay:Math.min(index*.02,.24) }} className="overflow-hidden rounded-3xl border border-black/[.06] bg-white p-4 shadow-[0_10px_28px_rgba(0,0,0,.035)]"><div className="flex items-start gap-3"><span className="mt-1 h-2.5 w-2.5 rounded-full" style={{ background:tone.color }} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><div className="truncate text-sm font-bold text-[#161617]">{stop.name}</div><div className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ color:tone.color, background:tone.bg }}>{tone.label}</div></div><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6e6e73]"><span className="font-semibold text-[#161617]">{Math.round(stop.currentLevel)}%</span><span>now</span><span>peak {Math.round(stop.peakLevel)}%</span></div><div className="mt-3"><Sparkline samples={stop.samples} tint={tone.color} /></div><div className="mt-2 flex flex-wrap gap-2 text-[10px] text-[#86868b]"><span className="rounded-full bg-[#f5f5f7] px-2.5 py-1">{stop.currentTimeBand}</span><span className="rounded-full bg-[#f5f5f7] px-2.5 py-1">AM {stop.amPeakTimeBand}</span><span className="rounded-full bg-[#f5f5f7] px-2.5 py-1">PM {stop.pmPeakTimeBand}</span></div></div></div></motion.div>})}</div></div>}</div></motion.div>}</AnimatePresence></section>

        <section className="grid grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)] gap-6 max-lg:grid-cols-1">
          <div className="rounded-3xl border border-black/[.06] bg-white p-5 shadow-[0_10px_35px_rgba(0,0,0,.045)] sm:p-6"><SectionTitle icon={<Bus size={17} />} title="London buses" subtitle="Search a route and see arrivals here" count={buses.length} /><div className="mb-4 flex items-center gap-2 rounded-xl bg-[#f5f5f7] px-3"><Search size={14} className="text-[#86868b]" /><input value={busQuery} onChange={event => setBusQuery(event.target.value)} placeholder="Route number or name" className="w-full bg-transparent py-2.5 text-sm outline-none" /></div>{data?.errors.buses && !buses.length ? <Unavailable label="Bus routes" /> : <div className="grid max-h-[390px] grid-cols-5 gap-2 overflow-y-auto pr-1 sm:grid-cols-7 lg:grid-cols-8">{visibleBuses.map((bus,index) => <motion.button type="button" key={bus.id} onClick={() => void chooseBus(bus.id)} initial={{ opacity:0,scale:.9 }} animate={{ opacity:1,scale:1 }} transition={{ delay:Math.min(index*.008,.25) }} className="relative aspect-square min-h-14 rounded-full border-[5px] bg-white text-xs font-bold shadow-sm" style={{ borderColor:selectedBus===bus.id?BLUE:RED }}><span className="absolute left-[-5px] right-[-5px] top-1/2 h-3 -translate-y-1/2" style={{ background:selectedBus===bus.id?BLUE:RED }} /><span className="relative z-10 rounded bg-white px-1">{bus.id}</span></motion.button>)}</div>}</div>
          <div className="rounded-3xl border border-black/[.06] bg-[#1d1d1f] p-5 text-white shadow-[0_16px_45px_rgba(0,0,0,.12)] sm:p-6"><SectionTitle inverse icon={<Clock3 size={17} />} title={selectedBus?`Route ${selectedBus}`:"Live arrivals"} subtitle={selectedBus?"Upcoming buses across the route":"Select any roundel to begin"} />{arrivalLoading && <div className="flex h-48 items-center justify-center"><motion.span className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white" animate={{ rotate:360 }} transition={{ repeat:Infinity,duration:.8 }} /></div>}{arrivalError && <div className="rounded-2xl bg-white/10 p-4 text-xs text-white/65">{arrivalError}</div>}{!selectedBus && !arrivalLoading && <div className="flex h-48 flex-col items-center justify-center text-center text-white/40"><Bus size={30} /><p className="mt-3 text-xs">Choose a route for live arrivals.</p></div>}{arrivals && <div className="max-h-[390px] space-y-2 overflow-y-auto">{arrivals.arrivals.slice(0,16).map((arrival,index) => <motion.div key={`${arrival.stopName}-${arrival.etaMs}-${index}`} initial={{ opacity:0,x:12 }} animate={{ opacity:1,x:0 }} className="flex items-center gap-3 rounded-2xl bg-white/[.08] px-3 py-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e32017] text-xs font-bold">{arrival.lineName}</span><span className="min-w-0 flex-1 truncate text-xs text-white/75">{arrival.stopName}</span><span className="text-xs font-semibold">{eta(arrival.etaMs,arrivals.serverTimeMs)}</span></motion.div>)}</div>}</div>
        </section>

        <section className="rounded-3xl border border-black/[.06] bg-white p-5 shadow-[0_10px_35px_rgba(0,0,0,.045)] sm:p-6"><SectionTitle icon={<Route size={17} />} title="Road conditions" subtitle="Every TfL-managed corridor" count={roads.length} />{data?.errors.roads && !roads.length ? <Unavailable label="Road network" /> : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{roads.map((road,index) => <motion.div key={road.id} initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} transition={{ delay:Math.min(index*.02,.3) }} className="rounded-2xl bg-[#f5f5f7] p-3"><div className="flex items-center justify-between"><span className="rounded-md bg-[#087443] px-2 py-1 text-[10px] font-bold text-white">{road.id.toUpperCase()}</span><span className="h-2 w-2 rounded-full" style={{ background:goodRoad(road)?"#30d158":"#ff9f0a" }} /></div><div className="mt-3 truncate text-xs font-semibold">{road.displayName}</div><div className="mt-1 text-[10px] text-[#86868b]">{road.statusSeverityDescription}</div></motion.div>)}</div>}</section>
        {(error || (data && Object.keys(data.errors).length > 0)) && <div className="flex items-center gap-2 rounded-2xl border border-[#ff9f0a]/20 bg-[#fff7e8] px-4 py-3 text-xs text-[#8a5700]"><AlertCircle size={15} />{error ?? "Some live sections are reconnecting; available information remains visible."}</div>}
      </div>
    </main>
  </motion.div>
}
