import { useEffect, useRef, useState, useMemo } from "react"
import { motion, AnimatePresence, useSpring, useTransform } from "framer-motion"
import {
  X, Zap, Train, Bus, Cloud, Navigation, Map, Users,
  Radio, AlertCircle, CheckCircle2, Clock, Activity,
  ChevronRight, Search, Layers,
} from "lucide-react"

// ── Tool catalogue (static definition) ───────────────────────────────────────
interface ToolDef {
  name:     string
  label:    string
  desc:     string
  provider: string
  icon:     React.ReactNode
}

const PROVIDERS: { id: string; label: string; color: string; bg: string; border: string; icon: React.ReactNode }[] = [
  { id: "eurostar", label: "Eurostar",     color: "#7eaaff", bg: "#001f4d", border: "#003388",  icon: <Train   className="w-4 h-4" /> },
  { id: "crew",     label: "Crew (SOT)",   color: "#fbbf24", bg: "#1c1000", border: "#78350f",  icon: <Users   className="w-4 h-4" /> },
  { id: "tfl",      label: "TFL London",   color: "#f87171", bg: "#1c0505", border: "#7f1d1d",  icon: <Bus     className="w-4 h-4" /> },
  { id: "sncf",     label: "SNCF France",  color: "#fb923c", bg: "#1c0a00", border: "#7c2d12",  icon: <Train   className="w-4 h-4" /> },
  { id: "nrail",    label: "National Rail",color: "#a78bfa", bg: "#0d0020", border: "#4c1d95",  icon: <Navigation className="w-4 h-4" /> },
  { id: "ratp",     label: "Paris Metro",  color: "#34d399", bg: "#001c10", border: "#064e3b",  icon: <Map     className="w-4 h-4" /> },
  { id: "weather",  label: "Weather",      color: "#67e8f9", bg: "#001418", border: "#164e63",  icon: <Cloud   className="w-4 h-4" /> },
  { id: "traveler", label: "Traveler",     color: "#f472b6", bg: "#1a001a", border: "#701a75",  icon: <Activity className="w-4 h-4" /> },
]

const TOOL_DEFS: ToolDef[] = [
  // Eurostar
  { name: "get_euromap_plans",              label: "Service Plans",         desc: "Commercial schedules with stops & coordinates",        provider: "eurostar", icon: <Train   className="w-3.5 h-3.5" /> },
  { name: "get_euromap_plan_by_id",         label: "Plan by ID",            desc: "Single commercial plan by date + service code",        provider: "eurostar", icon: <Train   className="w-3.5 h-3.5" /> },
  { name: "get_euromap_technical_plans",    label: "Technical Plans",       desc: "Operational/engineering movement plans",               provider: "eurostar", icon: <Layers  className="w-3.5 h-3.5" /> },
  { name: "get_euromap_technical_plan_by_id", label: "Tech Plan by ID",     desc: "Single technical plan by date + service code",         provider: "eurostar", icon: <Layers  className="w-3.5 h-3.5" /> },
  { name: "get_eurostar_dashboard",         label: "Dashboard",             desc: "Live departure board — all services today",            provider: "eurostar", icon: <Radio   className="w-3.5 h-3.5" /> },
  { name: "get_eurostar_live_map",          label: "Live Map",              desc: "Real-time train positions across the network",         provider: "eurostar", icon: <Map     className="w-3.5 h-3.5" /> },
  // Crew
  { name: "get_crew_activities",            label: "Crew Activities",       desc: "Drivers & crew assigned to services for a date",       provider: "crew",     icon: <Users   className="w-3.5 h-3.5" /> },
  { name: "get_crew_monthly_schedule",      label: "Monthly Schedule",      desc: "Full month's shifts for a specific crew member",       provider: "crew",     icon: <Users   className="w-3.5 h-3.5" /> },
  // TFL
  { name: "plan_journey",                   label: "Journey Planner",       desc: "London A→B journey with stops & timing",               provider: "tfl",      icon: <Navigation className="w-3.5 h-3.5" /> },
  { name: "get_line_status",                label: "Line Status",           desc: "Live status for a specific TFL line",                  provider: "tfl",      icon: <Activity className="w-3.5 h-3.5" /> },
  { name: "get_status_by_mode",             label: "Mode Status",           desc: "Status overview for all lines of a mode",             provider: "tfl",      icon: <Activity className="w-3.5 h-3.5" /> },
  { name: "search_stops",                   label: "Stop Search",           desc: "Find London stations & bus stops by name",            provider: "tfl",      icon: <Search  className="w-3.5 h-3.5" /> },
  { name: "get_tfl_roads",                  label: "Road Status",           desc: "TFL-managed road network live status",                 provider: "tfl",      icon: <Map     className="w-3.5 h-3.5" /> },
  { name: "get_road_disruptions",           label: "Road Disruptions",      desc: "Active disruptions on a specific road",               provider: "tfl",      icon: <AlertCircle className="w-3.5 h-3.5" /> },
  { name: "get_bus_arrivals",               label: "Bus Arrivals",          desc: "Live arrivals at a stop or for a route",              provider: "tfl",      icon: <Bus     className="w-3.5 h-3.5" /> },
  { name: "get_all_bus_lines",              label: "All Bus Lines",         desc: "Browse the complete London bus network",              provider: "tfl",      icon: <Bus     className="w-3.5 h-3.5" /> },
  // SNCF
  { name: "plan_sncf_journey",              label: "Journey Planner",       desc: "France A→B train journey planning",                   provider: "sncf",     icon: <Navigation className="w-3.5 h-3.5" /> },
  { name: "search_sncf_stations",           label: "Station Search",        desc: "Find French rail stations by name",                   provider: "sncf",     icon: <Search  className="w-3.5 h-3.5" /> },
  { name: "get_sncf_disruptions",           label: "Disruptions",           desc: "Active SNCF service disruptions",                     provider: "sncf",     icon: <AlertCircle className="w-3.5 h-3.5" /> },
  { name: "get_sncf_departures",            label: "Departures",            desc: "Live departures from a French station",               provider: "sncf",     icon: <Radio   className="w-3.5 h-3.5" /> },
  { name: "get_sncf_arrivals",              label: "Arrivals",              desc: "Live arrivals at a French station",                   provider: "sncf",     icon: <Radio   className="w-3.5 h-3.5" /> },
  { name: "get_sncf_train",                 label: "Train Details",         desc: "Full journey detail for a specific SNCF train",       provider: "sncf",     icon: <Train   className="w-3.5 h-3.5" /> },
  { name: "get_sncf_dashboard",             label: "Network Dashboard",     desc: "Major hubs, departures and active SNCF incidents",    provider: "sncf",     icon: <Radio   className="w-3.5 h-3.5" /> },
  // National Rail
  { name: "get_national_rail_departures",   label: "Departures",            desc: "Live departure board for UK mainline stations",        provider: "nrail",    icon: <Radio   className="w-3.5 h-3.5" /> },
  { name: "get_national_rail_arrivals",     label: "Arrivals",              desc: "Live arrival board with origin and expected time",     provider: "nrail",    icon: <Radio   className="w-3.5 h-3.5" /> },
  { name: "get_national_rail_dashboard",    label: "Network Dashboard",     desc: "Major London terminals, delays and station notices",   provider: "nrail",    icon: <Train   className="w-3.5 h-3.5" /> },
  // Paris Metro
  { name: "get_paris_metro_departures",     label: "Metro Departures",      desc: "RER/Metro departures from Paris stations",            provider: "ratp",     icon: <Map     className="w-3.5 h-3.5" /> },
  // Weather
  { name: "get_weather",                    label: "Forecast",              desc: "Current weather & forecast for any city",             provider: "weather",  icon: <Cloud   className="w-3.5 h-3.5" /> },
  // Traveler
  { name: "get_traveler_summary",           label: "Passenger Load",        desc: "Eurostar passenger occupancy summary",                provider: "traveler", icon: <Users   className="w-3.5 h-3.5" /> },
]

// ── Log entry (mirrors LogsPage) ──────────────────────────────────────────────
interface LogEntry {
  id:    string
  ts:    string
  level: "info" | "warn" | "error" | "debug"
  tag:   string
  msg:   string
  data?: string
}

// ── Per-tool dynamic state ────────────────────────────────────────────────────
interface ToolState {
  calls:     number
  errors:    number
  lastCall:  string | null
  lastLevel: "info" | "warn" | "error" | "debug" | null
  lastMsg:   string | null
}

type ToolStateMap = Record<string, ToolState>

function blankState(): ToolState {
  return { calls: 0, errors: 0, lastCall: null, lastLevel: null, lastMsg: null }
}

function toolHealth(s: ToolState): "idle" | "healthy" | "warning" | "error" {
  if (!s.lastLevel)           return "idle"
  if (s.lastLevel === "error") return "error"
  if (s.lastLevel === "warn")  return "warning"
  if (s.errors > 0)            return "warning"
  return "healthy"
}

// Try to detect which tool name a log entry relates to.
function detectTool(entry: LogEntry, names: string[]): string | null {
  const haystack = `${entry.msg} ${entry.data ?? ""}`.toLowerCase()
  for (const name of names) {
    if (haystack.includes(name.toLowerCase())) return name
  }
  return null
}

// ── Health dot ────────────────────────────────────────────────────────────────
const HEALTH_COLORS = {
  idle:    { dot: "#374151", ring: "#374151", label: "Idle",    text: "#6b7280" },
  healthy: { dot: "#10b981", ring: "#10b981", label: "Healthy", text: "#34d399" },
  warning: { dot: "#f59e0b", ring: "#f59e0b", label: "Warning", text: "#fbbf24" },
  error:   { dot: "#ef4444", ring: "#ef4444", label: "Error",   text: "#f87171" },
}

function HealthDot({ status, pulse = false }: { readonly status: keyof typeof HEALTH_COLORS; readonly pulse?: boolean }) {
  const c = HEALTH_COLORS[status]
  return (
    <span className="relative flex w-2 h-2 shrink-0">
      {pulse && status !== "idle" && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: c.dot, opacity: 0.5 }}
          animate={{ scale: [1, 2.2, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        />
      )}
      <span className="relative inline-flex rounded-full w-2 h-2" style={{ backgroundColor: c.dot }} />
    </span>
  )
}

// ── Animated count ────────────────────────────────────────────────────────────
function AnimCount({ value }: { readonly value: number }) {
  const spring = useSpring(0, { stiffness: 120, damping: 20 })
  const display = useTransform(spring, v => Math.round(v))
  const [shown, setShown] = useState(0)

  useEffect(() => { spring.set(value) }, [value, spring])
  useEffect(() => { const u = display.on("change", v => setShown(v)); return u }, [display])

  return <>{shown}</>
}

// ── Top stats strip ───────────────────────────────────────────────────────────
function StatPill({
  label, value, color, delay,
}: {
  readonly label: string
  readonly value: number
  readonly color: string
  readonly delay: number
}) {
  return (
    <motion.div
      className="flex flex-col items-center gap-0.5 px-5 py-3 rounded-2xl"
      style={{ background: `${color}0d`, border: `1px solid ${color}28` }}
      initial={{ opacity: 0, y: 12, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 280, damping: 22 }}
      whileHover={{ scale: 1.04, boxShadow: `0 4px 24px ${color}22` }}
    >
      <span className="text-2xl font-black tabular-nums" style={{ color, letterSpacing: "-0.03em" }}>
        <AnimCount value={value} />
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: `${color}99` }}>
        {label}
      </span>
    </motion.div>
  )
}

// ── Tool card ─────────────────────────────────────────────────────────────────
function ToolCard({
  tool, state, providerColor, index, selected, onSelect,
}: {
  readonly tool:          ToolDef
  readonly state:         ToolState
  readonly providerColor: string
  readonly index:         number
  readonly selected:      boolean
  readonly onSelect:      () => void
}) {
  const health = toolHealth(state)
  const hc = HEALTH_COLORS[health]

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      className="w-full text-left relative overflow-hidden rounded-xl"
      style={{
        background:   selected ? `${providerColor}12` : "rgba(255,255,255,0.03)",
        border:       `1px solid ${selected ? providerColor + "40" : "rgba(255,255,255,0.07)"}`,
        backdropFilter: "blur(12px)",
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, type: "spring", stiffness: 260, damping: 22 }}
      whileHover={{ scale: 1.015, boxShadow: `0 4px 20px ${providerColor}14` }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Selected accent bar */}
      {selected && (
        <motion.div
          className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl"
          style={{ backgroundColor: providerColor }}
          layoutId="selected-bar"
        />
      )}

      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Tool icon */}
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${providerColor}18`, color: providerColor }}
        >
          {tool.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold truncate" style={{ color: "rgba(255,255,255,0.88)" }}>
              {tool.label}
            </span>
            {state.calls > 0 && (
              <span
                className="text-[8px] font-black px-1.5 py-0.5 rounded-full shrink-0 tabular-nums"
                style={{ background: `${providerColor}20`, color: providerColor }}
              >
                ×{state.calls}
              </span>
            )}
          </div>
          <div className="text-[9px] truncate mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
            {tool.name}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <HealthDot status={health} pulse={health === "error" || health === "healthy"} />
          <span className="text-[9px] font-semibold" style={{ color: hc.text }}>{hc.label}</span>
          <ChevronRight className="w-3 h-3" style={{ color: "rgba(255,255,255,0.2)" }} />
        </div>
      </div>
    </motion.button>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function DetailPanel({
  tool, state, provider, logs,
}: {
  readonly tool:     ToolDef
  readonly state:    ToolState
  readonly provider: typeof PROVIDERS[number]
  readonly logs:     LogEntry[]
}) {
  const health = toolHealth(state)
  const hc = HEALTH_COLORS[health]

  const relevantLogs = useMemo(
    () => logs.filter(e => `${e.msg} ${e.data ?? ""}`.toLowerCase().includes(tool.name.toLowerCase())).slice(-30),
    [logs, tool.name],
  )

  const LEVEL_DOT: Record<string, string> = { info: "#60a5fa", warn: "#fbbf24", error: "#f87171", debug: "#4b5563" }
  const LEVEL_TEXT: Record<string, string> = { info: "#93c5fd", warn: "#fbbf24", error: "#fca5a5", debug: "#6b7280" }

  return (
    <motion.div
      key={tool.name}
      className="flex flex-col h-full"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {/* Tool hero */}
      <div
        className="relative overflow-hidden px-6 py-5 shrink-0"
        style={{ background: `linear-gradient(135deg, ${provider.bg} 0%, #050a14 100%)`, borderBottom: `1px solid ${provider.border}40` }}
      >
        {/* Background shimmer */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `linear-gradient(105deg, transparent 35%, ${provider.color}08 50%, transparent 65%)` }}
          animate={{ x: ["-100%", "200%"] }}
          transition={{ repeat: Infinity, duration: 4, ease: "easeInOut", repeatDelay: 3 }}
        />

        <div className="flex items-start gap-4">
          {/* Icon */}
          <motion.div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: `${provider.color}18`, border: `1px solid ${provider.color}30`, color: provider.color }}
            animate={health === "error" ? { boxShadow: [`0 0 0 0 ${provider.color}40`, `0 0 0 8px ${provider.color}00`] } : {}}
            transition={{ repeat: Infinity, duration: 1.6 }}
          >
            <div className="scale-125">{tool.icon}</div>
          </motion.div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-black text-base" style={{ color: "rgba(255,255,255,0.92)" }}>{tool.label}</span>
              <span
                className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider"
                style={{ background: provider.color + "20", color: provider.color, border: `1px solid ${provider.color}30` }}
              >
                {provider.label}
              </span>
            </div>
            <div className="font-mono text-[10px] mb-2" style={{ color: "rgba(255,255,255,0.35)" }}>{tool.name}</div>
            <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>{tool.desc}</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 mt-4">
          {[
            { label: "Total calls", val: state.calls.toString(), color: provider.color },
            { label: "Errors",      val: state.errors.toString(), color: state.errors > 0 ? "#f87171" : "#374151" },
            { label: "Last call",   val: state.lastCall ?? "—",   color: "rgba(255,255,255,0.4)" },
          ].map(({ label, val, color }) => (
            <div key={label}>
              <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</div>
              <div className="text-sm font-black tabular-nums" style={{ color }}>{val}</div>
            </div>
          ))}

          <div className="ml-auto flex items-center gap-2">
            <HealthDot status={health} pulse />
            <span className="text-xs font-black" style={{ color: hc.text }}>{hc.label}</span>
          </div>
        </div>
      </div>

      {/* Log feed */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        <div
          className="flex items-center gap-2 px-4 py-2 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.2)" }}
        >
          <Activity className="w-3 h-3" style={{ color: "rgba(255,255,255,0.3)" }} />
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
            Recent log entries
          </span>
          <span
            className="ml-auto text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.3)" }}
          >
            {relevantLogs.length} entries
          </span>
        </div>

        {relevantLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3">
            <motion.div
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ repeat: Infinity, duration: 2.5 }}
              className="text-3xl select-none"
            >
              📡
            </motion.div>
            <p className="text-[11px] font-mono" style={{ color: "#374151" }}>
              No log entries yet for this tool
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y" style={{ divideColor: "rgba(255,255,255,0.04)" }}>
            {relevantLogs.map((e, i) => (
              <motion.div
                key={e.id}
                className="flex items-start gap-2.5 px-4 py-2 font-mono text-[10px]"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.02, duration: 0.2 }}
              >
                <span className="shrink-0 tabular-nums" style={{ color: "#374151", minWidth: 64 }}>{e.ts}</span>
                <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: LEVEL_DOT[e.level] ?? "#4b5563" }} />
                <span className="flex-1 leading-relaxed break-all" style={{ color: LEVEL_TEXT[e.level] ?? "#6b7280" }}>
                  {e.msg}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Provider section ──────────────────────────────────────────────────────────
function ProviderSection({
  provider, tools, states, selectedTool, onSelect,
}: {
  readonly provider:     typeof PROVIDERS[number]
  readonly tools:        ToolDef[]
  readonly states:       ToolStateMap
  readonly selectedTool: string | null
  readonly onSelect:     (name: string) => void
}) {
  const totalCalls = tools.reduce((a, t) => a + (states[t.name]?.calls ?? 0), 0)
  const hasError   = tools.some(t => toolHealth(states[t.name] ?? blankState()) === "error")
  const hasHealthy = tools.some(t => toolHealth(states[t.name] ?? blankState()) === "healthy")
  const provHealth = hasError ? "error" : hasHealthy ? "healthy" : "idle"

  return (
    <div className="mb-5">
      {/* Provider header */}
      <div className="flex items-center gap-2 mb-2 px-1">
        <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: provider.bg, color: provider.color, border: `1px solid ${provider.border}` }}>
          {provider.icon}
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: provider.color }}>
          {provider.label}
        </span>
        <HealthDot status={provHealth} />
        {totalCalls > 0 && (
          <span className="text-[9px] tabular-nums font-bold" style={{ color: `${provider.color}80` }}>
            {totalCalls} calls
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {tools.map((tool, i) => (
          <ToolCard
            key={tool.name}
            tool={tool}
            state={states[tool.name] ?? blankState()}
            providerColor={provider.color}
            index={i}
            selected={selectedTool === tool.name}
            onSelect={() => onSelect(tool.name)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
const TOOL_NAMES = TOOL_DEFS.map(t => t.name)

export function ToolsPage({ onClose }: { readonly onClose: () => void }) {
  const [logs, setLogs]         = useState<LogEntry[]>([])
  const [connected, setConn]    = useState(false)
  const [toolStates, setStates] = useState<ToolStateMap>({})
  const [selected, setSelected] = useState<string | null>(TOOL_DEFS[0].name)
  const [search, setSearch]     = useState("")
  const bottomRef               = useRef<HTMLDivElement>(null)

  // SSE log stream (same endpoint as LogsPage)
  useEffect(() => {
    const url  = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8080"
    const es   = new EventSource(`${url}/api/logs/stream`)
    es.onopen  = () => setConn(true)
    es.onerror = () => setConn(false)
    es.onmessage = (ev) => {
      try {
        const entry: LogEntry = JSON.parse(ev.data)
        setLogs(prev => [...prev, entry].slice(-5000))

        // Update per-tool state from matching log entry.
        const name = detectTool(entry, TOOL_NAMES)
        if (!name) return
        setStates(prev => {
          const cur = prev[name] ?? blankState()
          return {
            ...prev,
            [name]: {
              calls:     cur.calls + (entry.tag === "tool" || entry.tag === "mcp" ? 1 : 0),
              errors:    cur.errors + (entry.level === "error" ? 1 : 0),
              lastCall:  entry.ts,
              lastLevel: entry.level,
              lastMsg:   entry.msg,
            },
          }
        })
      } catch { /* ignore */ }
    }
    return () => { es.close(); setConn(false) }
  }, [])

  // Derived stats
  const totalTools   = TOOL_DEFS.length
  const healthyCount = TOOL_DEFS.filter(t => toolHealth(toolStates[t.name] ?? blankState()) === "healthy").length
  const errorCount   = TOOL_DEFS.filter(t => toolHealth(toolStates[t.name] ?? blankState()) === "error").length
  const idleCount    = TOOL_DEFS.filter(t => toolHealth(toolStates[t.name] ?? blankState()) === "idle").length
  const totalCalls   = Object.values(toolStates).reduce((a, s) => a + s.calls, 0)

  // Filtered tool list
  const filteredTools = search
    ? TOOL_DEFS.filter(t =>
        t.name.includes(search.toLowerCase()) ||
        t.label.toLowerCase().includes(search.toLowerCase()) ||
        t.provider.includes(search.toLowerCase()),
      )
    : TOOL_DEFS

  const selectedDef      = TOOL_DEFS.find(t => t.name === selected) ?? null
  const selectedProvider = selectedDef ? PROVIDERS.find(p => p.id === selectedDef.provider)! : null
  const selectedState    = selected ? (toolStates[selected] ?? blankState()) : null

  // Group tools by provider (respecting search filter)
  const groupedTools = useMemo(() => {
    return PROVIDERS.map(p => ({
      provider: p,
      tools:    filteredTools.filter(t => t.provider === p.id),
    })).filter(g => g.tools.length > 0)
  }, [filteredTools])

  return (
    <div
      className="flex flex-col h-screen w-full font-sans"
      style={{ background: "#060b12", color: "#e2e8f0" }}
    >
      {/* ── Top bar ── */}
      <div
        className="flex items-center gap-3 px-5 py-3 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(6,11,18,0.95)", backdropFilter: "blur(20px)" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-white/10"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>

        <div className="flex items-center gap-2">
          <motion.div
            className="w-7 h-7 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #003388 0%, #004db3 100%)" }}
            animate={{ boxShadow: ["0 0 0 0 #003388", "0 0 0 6px #00338800"] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
          >
            <Zap className="w-4 h-4 text-yellow-300" />
          </motion.div>
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">
            Integrated Tools
          </span>
        </div>

        {/* Connection status */}
        <div className="flex items-center gap-1.5">
          <motion.span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: connected ? "#10b981" : "#ef4444" }}
            animate={connected ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
            transition={{ repeat: Infinity, duration: 1.6 }}
          />
          <span className="text-[10px]" style={{ color: connected ? "#10b981" : "#ef4444" }}>
            {connected ? "live" : "offline"}
          </span>
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <Search className="w-3 h-3" style={{ color: "rgba(255,255,255,0.3)" }} />
          <input
            type="text"
            placeholder="filter tools…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent outline-none text-[11px] w-28"
            style={{ color: "rgba(255,255,255,0.6)" }}
          />
          <AnimatePresence>
            {search && (
              <motion.button
                type="button"
                onClick={() => setSearch("")}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.1 }}
              >
                <X className="w-3 h-3" style={{ color: "rgba(255,255,255,0.3)" }} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div
        className="flex items-center gap-3 px-5 py-3 shrink-0 overflow-x-auto"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.3)" }}
      >
        <StatPill label="Total tools"  value={totalTools}   color="#7eaaff" delay={0}    />
        <StatPill label="Healthy"      value={healthyCount} color="#10b981" delay={0.06} />
        <StatPill label="Errors"       value={errorCount}   color="#ef4444" delay={0.12} />
        <StatPill label="Idle"         value={idleCount}    color="#6b7280" delay={0.18} />
        <StatPill label="Total calls"  value={totalCalls}   color="#a78bfa" delay={0.24} />

        {/* Provider legend */}
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          {PROVIDERS.map(p => (
            <motion.div
              key={p.id}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold"
              style={{ background: `${p.color}12`, border: `1px solid ${p.color}28`, color: p.color }}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.2 }}
            >
              <div className="w-3 h-3" style={{ color: p.color }}>{p.icon}</div>
              {p.label}
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Main body: sidebar + detail ── */}
      <div className="flex flex-1 min-h-0">

        {/* Left: tool list */}
        <div
          className="w-72 shrink-0 overflow-y-auto flex flex-col"
          style={{ borderRight: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.2)" }}
        >
          <div className="px-3 py-4 flex flex-col gap-1" ref={bottomRef}>
            {groupedTools.length === 0 ? (
              <div className="text-center py-12 text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                No tools match "{search}"
              </div>
            ) : (
              groupedTools.map(({ provider, tools }) => (
                <ProviderSection
                  key={provider.id}
                  provider={provider}
                  tools={tools}
                  states={toolStates}
                  selectedTool={selected}
                  onSelect={setSelected}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: detail panel */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          <AnimatePresence mode="wait">
            {selectedDef && selectedProvider && selectedState ? (
              <DetailPanel
                key={selectedDef.name}
                tool={selectedDef}
                state={selectedState}
                provider={selectedProvider}
                logs={logs}
              />
            ) : (
              <motion.div
                key="empty"
                className="flex flex-col items-center justify-center flex-1 gap-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                  className="text-5xl select-none"
                >
                  🔧
                </motion.div>
                <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.2)" }}>
                  Select a tool to view details
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Status bar ── */}
      <div
        className="flex items-center gap-4 px-5 py-1.5 shrink-0 font-mono text-[9px]"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.4)", color: "#374151" }}
      >
        {PROVIDERS.map(p => {
          const calls = filteredTools
            .filter(t => t.provider === p.id)
            .reduce((a, t) => a + (toolStates[t.name]?.calls ?? 0), 0)
          return (
            <span key={p.id} style={{ color: calls > 0 ? p.color : "#374151" }}>
              {p.id}: {calls}
            </span>
          )
        })}
        <span className="ml-auto">{totalTools} tools registered · {logs.length} log entries</span>
      </div>
    </div>
  )
}
