import { useEffect, useMemo, useState } from "react"
import {
  Activity, Bus, Check, ChevronRight, CloudSun, Eye, EyeOff, Gauge,
  Lock, Network, Power, RefreshCw, Save, Settings, Train, Users,
  Wrench, X,
} from "lucide-react"
import { motion } from "framer-motion"

// ── Types ─────────────────────────────────────────────────────────────────────
interface ConfigLine {
  type: "section" | "blank" | "entry" | "commented_entry"
  key?: string
  value?: string
  label?: string
}

interface EditState {
  value: string
  active: boolean
}

interface ServiceState {
  id: string
  label: string
  description: string
  enabled: boolean
  updatedAt: string
}

const SERVICE_THEME: Record<string, {
  icon: typeof Train
  logo: "tfl" | "sncf" | "eurostar" | "national-rail" | "paris-rer" | "crew" | "traveler" | "weather" | "wall" | "generic"
  family: string
  scope: string
  tools: string
  accent: string
  border: string
  glow: string
  surface: string
  statusOn: string
  statusOff: string
}> = {
  crew: {
    icon: Users,
    logo: "crew",
    family: "Crew tooling",
    scope: "Roster + activities",
    tools: "2 linked tools",
    accent: "#8b5cf6",
    border: "#4c1d95",
    glow: "rgba(139,92,246,0.24)",
    surface: "linear-gradient(180deg, rgba(91,33,182,0.22), rgba(10,15,26,0.94))",
    statusOn: "#c4b5fd",
    statusOff: "#cbd5e1",
  },
  eurostar: {
    icon: Train,
    logo: "eurostar",
    family: "Cross-channel",
    scope: "Plans + live map",
    tools: "6 linked tools",
    accent: "#3b82f6",
    border: "#1d4ed8",
    glow: "rgba(59,130,246,0.24)",
    surface: "linear-gradient(180deg, rgba(29,78,216,0.22), rgba(10,15,26,0.94))",
    statusOn: "#bfdbfe",
    statusOff: "#cbd5e1",
  },
  "national-rail": {
    icon: Activity,
    logo: "national-rail",
    family: "UK mainline",
    scope: "Boards + hubs",
    tools: "3 linked tools",
    accent: "#22c55e",
    border: "#15803d",
    glow: "rgba(34,197,94,0.22)",
    surface: "linear-gradient(180deg, rgba(21,128,61,0.22), rgba(10,15,26,0.94))",
    statusOn: "#bbf7d0",
    statusOff: "#cbd5e1",
  },
  "operations-wall": {
    icon: Network,
    logo: "wall",
    family: "Fusion layer",
    scope: "Cross-border picture",
    tools: "1 wall feed",
    accent: "#38bdf8",
    border: "#0369a1",
    glow: "rgba(56,189,248,0.22)",
    surface: "linear-gradient(180deg, rgba(3,105,161,0.22), rgba(10,15,26,0.94))",
    statusOn: "#bae6fd",
    statusOff: "#cbd5e1",
  },
  "paris-rer": {
    icon: Train,
    logo: "paris-rer",
    family: "Paris suburban",
    scope: "Interchange boards",
    tools: "1 live board",
    accent: "#f97316",
    border: "#c2410c",
    glow: "rgba(249,115,22,0.22)",
    surface: "linear-gradient(180deg, rgba(194,65,12,0.22), rgba(10,15,26,0.94))",
    statusOn: "#fed7aa",
    statusOff: "#cbd5e1",
  },
  sncf: {
    icon: Train,
    logo: "sncf",
    family: "French national",
    scope: "Stations + incidents",
    tools: "7 linked tools",
    accent: "#ec4899",
    border: "#9d174d",
    glow: "rgba(236,72,153,0.22)",
    surface: "linear-gradient(180deg, rgba(157,23,77,0.22), rgba(10,15,26,0.94))",
    statusOn: "#fbcfe8",
    statusOff: "#cbd5e1",
  },
  tfl: {
    icon: Bus,
    logo: "tfl",
    family: "London network",
    scope: "Rail + bus + roads",
    tools: "8 linked tools",
    accent: "#ef4444",
    border: "#b91c1c",
    glow: "rgba(239,68,68,0.22)",
    surface: "linear-gradient(180deg, rgba(185,28,28,0.22), rgba(10,15,26,0.94))",
    statusOn: "#fecaca",
    statusOff: "#cbd5e1",
  },
  traveler: {
    icon: Gauge,
    logo: "traveler",
    family: "Passenger analytics",
    scope: "Cabin + load mix",
    tools: "1 analytics feed",
    accent: "#f59e0b",
    border: "#b45309",
    glow: "rgba(245,158,11,0.22)",
    surface: "linear-gradient(180deg, rgba(180,83,9,0.22), rgba(10,15,26,0.94))",
    statusOn: "#fde68a",
    statusOff: "#cbd5e1",
  },
  weather: {
    icon: CloudSun,
    logo: "weather",
    family: "Journey context",
    scope: "Travel weather",
    tools: "1 forecast feed",
    accent: "#14b8a6",
    border: "#0f766e",
    glow: "rgba(20,184,166,0.22)",
    surface: "linear-gradient(180deg, rgba(15,118,110,0.22), rgba(10,15,26,0.94))",
    statusOn: "#99f6e4",
    statusOff: "#cbd5e1",
  },
}

function ServiceLogo({
  kind,
  accent,
  enabled,
}: {
  readonly kind: "tfl" | "sncf" | "eurostar" | "national-rail" | "paris-rer" | "crew" | "traveler" | "weather" | "wall" | "generic"
  readonly accent: string
  readonly enabled: boolean
}) {
  const muted = enabled ? accent : "#a1a1aa"
  const ink = enabled ? "#f8fafc" : "#e4e4e7"

  if (kind === "tfl") {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.5" fill="none" stroke="#E32017" strokeWidth="3" opacity={enabled ? 1 : 0.55} />
        <rect x="3" y="10" width="18" height="4" rx="1" fill="#003688" opacity={enabled ? 1 : 0.55} />
      </svg>
    )
  }

  if (kind === "sncf") {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <polyline points="3,17 9,7 15,17" fill="none" stroke="#E2001A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity={enabled ? 1 : 0.55} />
        <polyline points="8,17 14,7 20,17" fill="none" stroke="#E2001A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity={enabled ? 1 : 0.55} />
      </svg>
    )
  }

  if (kind === "eurostar") {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <polygon points="12,2.4 14.3,9 21.2,9 15.7,13.4 17.8,20.2 12,16.2 6.2,20.2 8.3,13.4 2.8,9 9.7,9" fill="#FFD700" opacity={enabled ? 1 : 0.55} />
      </svg>
    )
  }

  if (kind === "national-rail") {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 8h10.5l-2.6-2.6 1.5-1.5L19 9.5l-5.6 5.6-1.5-1.5 2.6-2.6H4z" fill={muted} />
        <path d="M20 16H9.5l2.6 2.6-1.5 1.5L5 14.5l5.6-5.6 1.5 1.5-2.6 2.6H20z" fill={ink} opacity={enabled ? 0.95 : 0.7} />
      </svg>
    )
  }

  if (kind === "paris-rer") {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" fill={muted} opacity={enabled ? 0.9 : 0.55} />
        <path d="M9 17V7h4.3c2 0 3.2 1.1 3.2 2.8 0 1.2-.7 2.1-1.9 2.5l2.2 4.7h-2.3l-2-4.2H11v4.2zm2-5.8h2.1c1 0 1.6-.5 1.6-1.4 0-.8-.6-1.3-1.6-1.3H11z" fill="#f8fafc" />
      </svg>
    )
  }

  if (kind === "crew") {
    return (
      <div className="flex items-center justify-center text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: ink }}>
        SOT
      </div>
    )
  }

  if (kind === "traveler") {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 16.5h16" stroke={muted} strokeWidth="2" strokeLinecap="round" />
        <path d="M6 13.5h12" stroke={muted} strokeWidth="2" strokeLinecap="round" opacity={0.75} />
        <path d="M8 10.5h8" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    )
  }

  if (kind === "weather") {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="10" r="3.5" fill={muted} opacity={0.9} />
        <path d="M10.5 18h6.1a3.2 3.2 0 0 0 .1-6.4 4.8 4.8 0 0 0-9.1 1.7A2.8 2.8 0 0 0 10.5 18Z" fill={ink} opacity={0.92} />
      </svg>
    )
  }

  if (kind === "wall") {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="2.6" fill={ink} />
        <circle cx="6" cy="7" r="1.7" fill={muted} />
        <circle cx="18" cy="7" r="1.7" fill={muted} />
        <circle cx="6" cy="17" r="1.7" fill={muted} />
        <circle cx="18" cy="17" r="1.7" fill={muted} />
        <path d="M12 12 6 7m6 5 6-5m-6 0-6 5m6-5 6 5" stroke={muted} strokeWidth="1.6" strokeLinecap="round" opacity={0.9} />
      </svg>
    )
  }

  return (
    <div className="flex items-center justify-center text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: ink }}>
      SYS
    </div>
  )
}

const SERVICE_TRACKS = [
  { top: "12%", color: "#3b82f6", width: 560, duration: 22, delay: 0 },
  { top: "26%", color: "#ef4444", width: 420, duration: 19, delay: 1.6 },
  { top: "42%", color: "#ec4899", width: 640, duration: 24, delay: 0.8 },
  { top: "58%", color: "#22c55e", width: 500, duration: 20, delay: 2.4 },
  { top: "74%", color: "#f59e0b", width: 440, duration: 18, delay: 1.1 },
]

function ServicesRailBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[32px]">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at top left, rgba(59,130,246,.12), transparent 26%), radial-gradient(circle at 82% 18%, rgba(236,72,153,.1), transparent 22%), linear-gradient(180deg, rgba(2,6,23,.92), rgba(3,7,18,.98))",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.08) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      {SERVICE_TRACKS.map((track, index) => (
        <motion.div
          key={index}
          className="absolute left-[-38rem] h-[3px] rounded-full"
          style={{
            top: track.top,
            width: track.width,
            background: `linear-gradient(90deg, transparent, ${track.color}, transparent)`,
            opacity: 0.28,
          }}
          animate={{ x: [0, 2200] }}
          transition={{ duration: track.duration, delay: track.delay, repeat: Infinity, ease: "linear" }}
        />
      ))}
      <div className="absolute inset-x-10 top-[17%] h-px bg-white/10" />
      <div className="absolute inset-x-16 top-[48%] h-px bg-white/10" />
      <div className="absolute inset-x-8 top-[80%] h-px bg-white/10" />
      <svg className="absolute right-10 top-10 opacity-[0.1]" width="280" height="180" viewBox="0 0 280 180" aria-hidden="true">
        <path d="M8 150C48 126 70 96 112 92c34-4 48 12 77 7 36-6 46-38 83-61" fill="none" stroke="#93c5fd" strokeWidth="3" strokeLinecap="round" />
        <path d="M18 158C58 134 80 105 122 101c34-4 48 12 77 7 36-6 46-38 83-61" fill="none" stroke="#fca5a5" strokeWidth="3" strokeLinecap="round" opacity="0.75" />
        <circle cx="112" cy="92" r="6" fill="#3b82f6" />
        <circle cx="189" cy="99" r="6" fill="#ec4899" />
        <circle cx="255" cy="38" r="6" fill="#22c55e" />
      </svg>
      <motion.div
        className="absolute bottom-12 left-[-10rem] opacity-[0.12]"
        animate={{ x: [0, 1900] }}
        transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
      >
        <svg width="180" height="34" viewBox="0 0 180 34" fill="none" aria-hidden="true">
          <rect x="12" y="9" width="122" height="14" rx="6" fill="#f8fafc" />
          <rect x="132" y="6" width="28" height="11" rx="3" fill="#f8fafc" />
          <circle cx="36" cy="27" r="4" fill="#f8fafc" />
          <circle cx="72" cy="27" r="4" fill="#f8fafc" />
          <circle cx="108" cy="27" r="4" fill="#f8fafc" />
        </svg>
      </motion.div>
    </div>
  )
}

// ── Static tool registry ──────────────────────────────────────────────────────
const TOOL_NETWORKS = [
  {
    id: "tfl",
    label: "Transport for London",
    dotColor: "#e32017",
    textColor: "#fca5a5",
    borderColor: "#7f1d1d",
    bgColor: "#110202",
    auth: "API Key — TFL_APP_KEY header",
    endpoints: [
      { url: "https://api.tfl.gov.uk", label: "TFL Unified API" },
    ],
    tools: [
      { name: "plan_journey",       desc: "Plan a journey between two stops" },
      { name: "get_line_status",    desc: "Disruptions on specific tube/rail lines" },
      { name: "get_status_by_mode", desc: "Status across all tube, rail, and bus modes" },
      { name: "search_stops",       desc: "Find stops by name keyword" },
    ],
  },
  {
    id: "sncf",
    label: "SNCF — French Rail",
    dotColor: "#c00014",
    textColor: "#fda4af",
    borderColor: "#9f1239",
    bgColor: "#110105",
    auth: "Basic auth — SNCF_API_KEY as username, empty password",
    endpoints: [
      { url: "https://api.sncf.com/v1/coverage/sncf", label: "SNCF Coverage API v1" },
    ],
    tools: [
      { name: "plan_sncf_journey",      desc: "Plan a French rail journey" },
      { name: "search_sncf_stations",   desc: "Search stations by name" },
      { name: "get_sncf_disruptions",   desc: "Active disruptions on the SNCF network" },
      { name: "get_sncf_departures",    desc: "Departures from a given station" },
      { name: "get_sncf_arrivals",      desc: "Arrivals at a given station" },
      { name: "get_sncf_train",         desc: "Track a specific train by number" },
      { name: "get_sncf_dashboard",     desc: "Major hubs, departures and national incidents" },
    ],
  },
  {
    id: "eurostar",
    label: "Eurostar — Euromap",
    dotColor: "#2563eb",
    textColor: "#93c5fd",
    borderColor: "#1e3a5f",
    bgColor: "#020810",
    auth: "OAuth2 Client Credentials — EUROMAP_CLIENT_ID + EUROMAP_CLIENT_SECRET",
    endpoints: [
      { url: "https://gateway.dm.eurostar.com/euromap-enabler",                               label: "Euromap Enabler API" },
      { url: "https://login.microsoftonline.com/a9e30ac5-22dd-40f6-a361-b234d4d99c66/oauth2/token", label: "Azure AD OAuth2 Token Endpoint" },
    ],
    tools: [
      { name: "get_euromap_plans",                   desc: "Commercial departure plans" },
      { name: "get_euromap_technical_plans",         desc: "Technical/operational train plans" },
      { name: "get_euromap_plan_by_id",              desc: "Single commercial plan with full detail" },
      { name: "get_euromap_technical_plan_by_id",    desc: "Single technical plan with full detail" },
      { name: "get_eurostar_dashboard",              desc: "Operations dashboard overview" },
      { name: "get_eurostar_live_map",               desc: "Live train positions on the Eurostar network" },
    ],
  },
  {
    id: "traveler",
    label: "Traveler API — Thalys/Eurostar",
    dotColor: "#d97706",
    textColor: "#fcd34d",
    borderColor: "#78350f",
    bgColor: "#0e0700",
    auth: "Custom headers — client_id + consumer.client_id",
    endpoints: [
      { url: "https://thapaas.thalys.com/traveler-sapi/v1/traveler-summary", label: "Traveler Summary API" },
    ],
    tools: [
      { name: "get_traveler_summary", desc: "Passenger load breakdown by class and traveler type" },
    ],
  },
] as const

// ── Helpers ───────────────────────────────────────────────────────────────────
function isSecret(key: string): boolean {
  const u = key.toUpperCase()
  return u.includes("_KEY") || u.includes("SECRET") || u.includes("_TOKEN") || u.includes("_PASSWORD")
}

// ── Config row ────────────────────────────────────────────────────────────────
function ConfigRow({
  line,
  edits,
  onChange,
}: {
  readonly line: ConfigLine
  readonly edits: Record<string, EditState>
  readonly onChange: (key: string, s: EditState) => void
}) {
  const key = line.key!
  const origValue  = line.value ?? ""
  const origActive = line.type === "entry"

  const cur = edits[key]
  const curValue  = cur?.value  ?? origValue
  const curActive = cur?.active ?? origActive

  const secret  = isSecret(key)
  const [shown, setShown] = useState(false)

  const dirty = cur !== undefined && (cur.value !== origValue || cur.active !== origActive)

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 border-b font-mono text-[11px]"
      style={{
        borderColor:     "#1e293b",
        backgroundColor: dirty ? "rgba(251,191,36,0.04)" : "transparent",
        borderLeft:      dirty ? "2px solid #fbbf24" : "2px solid transparent",
      }}
    >
      {/* Active toggle */}
      <button
        type="button"
        title={curActive ? "Comment out (disable)" : "Uncomment (enable)"}
        onClick={() => onChange(key, { value: curValue, active: !curActive })}
        className="shrink-0 w-8 h-4 rounded-full relative transition-colors"
        style={{ background: curActive ? "#064e3b" : "#1f2937" }}
      >
        <motion.span
          className="absolute top-0.5 w-3 h-3 rounded-full"
          style={{ background: curActive ? "#10b981" : "#374151" }}
          animate={{ left: curActive ? "calc(100% - 14px)" : "2px" }}
          transition={{ duration: 0.15 }}
        />
      </button>

      {/* Key name */}
      <span
        className="shrink-0 flex items-center gap-1 w-52 truncate"
        style={{ color: curActive ? "#c4b5fd" : "#4b5563" }}
      >
        {key}
        {secret && <Lock className="w-2.5 h-2.5 shrink-0" style={{ color: "#4b5563" }} />}
      </span>

      {/* Value input */}
      <input
        type={secret && !shown ? "password" : "text"}
        value={curValue}
        disabled={!curActive}
        onChange={e => onChange(key, { value: e.target.value, active: curActive })}
        placeholder={curActive ? "empty" : "commented out"}
        className="flex-1 bg-transparent rounded px-2 py-1 text-[11px] outline-none font-mono"
        style={{
          color:      curActive ? "#e2e8f0" : "#374151",
          background: "#0d1117",
          border:     "1px solid #1e293b",
        }}
      />

      {/* Reveal toggle for secrets */}
      {secret && (
        <button
          type="button"
          onClick={() => setShown(v => !v)}
          className="shrink-0 transition-opacity hover:opacity-80"
          style={{ color: "#4b5563" }}
        >
          {shown
            ? <EyeOff className="w-3.5 h-3.5" />
            : <Eye    className="w-3.5 h-3.5" />
          }
        </button>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function ConfigPage({ onClose }: { readonly onClose: () => void }) {
  const [lines,   setLines]   = useState<ConfigLine[]>([])
  const [edits,   setEdits]   = useState<Record<string, EditState>>({})
  const [services, setServices] = useState<ServiceState[]>([])
  const [serviceEdits, setServiceEdits] = useState<Record<string, boolean>>({})
  const [tab,     setTab]     = useState<"config" | "services" | "tools">("config")
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const backendURL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8080"

  useEffect(() => {
    Promise.all([
      fetch(`${backendURL}/api/config`).then(r => r.json()),
      fetch(`${backendURL}/api/services/status`).then(r => r.json()),
    ])
      .then(([configData, serviceData]) => {
        setLines(configData.lines ?? [])
        setServices(serviceData.services ?? [])
        setLoading(false)
      })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [backendURL])

  function handleChange(key: string, s: EditState) {
    setEdits(prev => ({ ...prev, [key]: s }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      if (tab === "config") {
        const req: Record<string, EditState> = {}
        for (const line of lines) {
          if (!line.key) continue
          req[line.key] = edits[line.key] ?? {
            value:  line.value ?? "",
            active: line.type === "entry",
          }
        }
        const r = await fetch(`${backendURL}/api/config`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(req),
        })
        if (!r.ok) throw new Error(await r.text())
      }

      if (tab === "services") {
        const r = await fetch(`${backendURL}/api/services/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            services: services.map(service => ({
              ...service,
              enabled: serviceEdits[service.id] ?? service.enabled,
            })),
          }),
        })
        if (!r.ok) throw new Error(await r.text())
      }

      setEdits({})
      setServiceEdits({})
      setSaved(true)
      const [freshConfig, freshServices] = await Promise.all([
        fetch(`${backendURL}/api/config`).then(r => r.json()),
        fetch(`${backendURL}/api/services/status`).then(r => r.json()),
      ])
      setLines(freshConfig.lines ?? [])
      setServices(freshServices.services ?? [])
      window.dispatchEvent(new CustomEvent("service-status-updated"))
      setTimeout(() => setSaved(false), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  // Group entry lines by section headers
  const sections = useMemo(() => {
    const result: { label: string; entries: ConfigLine[] }[] = []
    let cur: { label: string; entries: ConfigLine[] } = { label: "General", entries: [] }
    for (const line of lines) {
      if (line.type === "section") {
        if (cur.entries.length > 0) result.push(cur)
        cur = { label: line.label ?? "", entries: [] }
      } else if (line.type === "entry" || line.type === "commented_entry") {
        cur.entries.push(line)
      }
    }
    if (cur.entries.length > 0) result.push(cur)
    return result
  }, [lines])

  const isDirty   = Object.keys(edits).length > 0
  const servicesDirty = Object.keys(serviceEdits).length > 0
  const totalKeys = lines.filter(l => l.type === "entry" || l.type === "commented_entry").length

  return (
    <div
      className="flex flex-col h-screen w-full"
      style={{ background: "#060b12", color: "#e2e8f0" }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-5 py-3 shrink-0"
        style={{ borderBottom: "1px solid #1e293b", background: "#0a0f1a" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-white/10"
          aria-label="Close config"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>

        <Settings className="w-4 h-4" style={{ color: "#6b7280" }} />
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">Configuration</span>

        <div className="flex-1" />

        {/* Saved confirmation */}
        {saved && (
          <motion.div
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-1.5 text-[11px] mr-2"
            style={{ color: "#10b981" }}
          >
            <Check className="w-3.5 h-3.5" />
            Saved · restart services to apply
          </motion.div>
        )}

        {error && (
          <span className="text-[11px] mr-2" style={{ color: "#f87171" }}>{error}</span>
        )}

        {(tab === "config" || tab === "services") && (
          <button
            type="button"
            onClick={handleSave}
            disabled={tab === "config" ? !isDirty || saving : !servicesDirty || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
            style={{
              background: (tab === "config" ? isDirty : servicesDirty) ? "#064e3b" : "#0d1117",
              color:      (tab === "config" ? isDirty : servicesDirty) ? "#6ee7b7" : "#374151",
              border:    `1px solid ${(tab === "config" ? isDirty : servicesDirty) ? "#059669" : "#1f2937"}`,
              cursor:     (tab === "config" ? isDirty : servicesDirty) ? "pointer" : "not-allowed",
            }}
          >
            {saving
              ? <RefreshCw className="w-3 h-3 animate-spin" />
              : <Save className="w-3 h-3" />
            }
            {saving ? "Saving…" : "Save Changes"}
          </button>
        )}
      </div>

      {/* ── Tabs ── */}
      <div
        className="flex items-center gap-1 px-5 py-2 shrink-0"
        style={{ borderBottom: "1px solid #1e293b", background: "#08101a" }}
      >
        {(["config", "services", "tools"] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all shrink-0"
            style={{
              background: tab === t ? "#1e293b" : "transparent",
              color:      tab === t ? "#e2e8f0" : "#4b5563",
              border:    `1px solid ${tab === t ? "#334155" : "transparent"}`,
            }}
          >
            {t === "config" ? "Environment" : t === "services" ? "Services" : "MCP Tools"}
            {t === "config" && isDirty && (
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#fbbf24" }} />
            )}
            {t === "services" && servicesDirty && (
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#fbbf24" }} />
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Environment tab ── */}
        {tab === "config" && (
          <div className="max-w-3xl mx-auto px-4 py-6">
            {loading ? (
              <p className="text-center text-[12px] font-mono mt-16" style={{ color: "#374151" }}>
                Loading config…
              </p>
            ) : (
              <div className="flex flex-col gap-6">
                {sections.map((section, si) => (
                  <div key={si}>
                    {section.label && (
                      <div className="flex items-center gap-2 mb-3">
                        <span
                          className="text-[10px] font-black uppercase tracking-[0.18em]"
                          style={{ color: "#4b5563" }}
                        >
                          {section.label}
                        </span>
                        <div className="flex-1 h-px" style={{ background: "#1e293b" }} />
                      </div>
                    )}
                    <div
                      className="rounded-xl overflow-hidden"
                      style={{ border: "1px solid #1e293b", background: "#0a0f1a" }}
                    >
                      {section.entries.map(line => (
                        <ConfigRow
                          key={line.key}
                          line={line}
                          edits={edits}
                          onChange={handleChange}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                <p className="text-[10px] font-mono text-center mt-2" style={{ color: "#1f2937" }}>
                  Toggle the switch to comment/uncomment a key · Changes written to .env on save
                </p>
              </div>
            )}
          </div>
        )}

        {tab === "services" && (
          <div className="max-w-5xl mx-auto px-4 py-6">
            {loading ? (
              <p className="text-center text-[12px] font-mono mt-16" style={{ color: "#374151" }}>
                Loading service toggles…
              </p>
            ) : (
              <div className="relative overflow-hidden rounded-[32px] border p-5 md:p-6" style={{ borderColor: "#1e293b" }}>
                <ServicesRailBackdrop />
                <div className="relative z-10 space-y-5">
                <div
                  className="overflow-hidden rounded-[28px] border p-5"
                  style={{
                    borderColor: "#1e293b",
                    background:
                      "radial-gradient(circle at top right, rgba(56,189,248,.12), transparent 28%), linear-gradient(180deg, rgba(15,23,42,.95), rgba(2,6,23,.98))",
                  }}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl">
                      <div className="text-[11px] font-black uppercase tracking-[0.28em]" style={{ color: "#64748b" }}>
                        Service Control
                      </div>
                      <h2 className="mt-2 text-xl font-semibold tracking-tight" style={{ color: "#f8fafc" }}>
                        Live providers and tool families
                      </h2>
                      <p className="mt-2 text-sm leading-6" style={{ color: "#94a3b8" }}>
                        Each provider carries its own tool family, fallback cache, and command-center surface. Toggle them here without losing the visual identity of what each subsystem powers.
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "#1e293b", background: "rgba(15,23,42,.72)" }}>
                        <div className="text-lg font-semibold" style={{ color: "#f8fafc" }}>{services.length}</div>
                        <div className="text-[10px] uppercase tracking-[0.24em]" style={{ color: "#64748b" }}>Providers</div>
                      </div>
                      <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "#1e293b", background: "rgba(15,23,42,.72)" }}>
                        <div className="text-lg font-semibold" style={{ color: "#86efac" }}>
                          {services.filter(service => (serviceEdits[service.id] ?? service.enabled)).length}
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.24em]" style={{ color: "#64748b" }}>Enabled</div>
                      </div>
                      <div className="rounded-2xl border px-4 py-3" style={{ borderColor: "#1e293b", background: "rgba(15,23,42,.72)" }}>
                        <div className="text-lg font-semibold" style={{ color: servicesDirty ? "#facc15" : "#f8fafc" }}>
                          {Object.keys(serviceEdits).length}
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.24em]" style={{ color: "#64748b" }}>Pending</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className="overflow-hidden rounded-[28px] border"
                  style={{ borderColor: "#1e293b", background: "rgba(2,6,23,.76)", boxShadow: "0 18px 50px rgba(15,23,42,.28)" }}
                >
                  <div
                    className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.15fr)_minmax(0,0.95fr)_minmax(0,1fr)_120px] gap-3 border-b px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em]"
                    style={{ borderColor: "#1e293b", color: "#64748b", background: "rgba(15,23,42,.84)" }}
                  >
                    <div>Provider</div>
                    <div>Tool Family</div>
                    <div>Scope</div>
                    <div>Status</div>
                    <div className="text-right">Control</div>
                  </div>

                  {services.map(service => {
                    const enabled = serviceEdits[service.id] ?? service.enabled
                    const dirty = service.id in serviceEdits
                    const theme = SERVICE_THEME[service.id] ?? {
                      icon: Power,
                      logo: "generic",
                      family: "Generic service",
                      scope: "Shared runtime",
                      tools: "Live provider",
                      accent: "#94a3b8",
                      border: "#334155",
                      glow: "rgba(148,163,184,0.18)",
                      surface: "linear-gradient(180deg, rgba(51,65,85,0.16), rgba(10,15,26,0.94))",
                      statusOn: "#e2e8f0",
                      statusOff: "#cbd5e1",
                    }

                    return (
                      <div
                        key={service.id}
                        className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.15fr)_minmax(0,0.95fr)_minmax(0,1fr)_120px] gap-3 border-b px-4 py-3 transition-colors"
                        style={{
                          borderColor: "#1e293b",
                          background: enabled
                            ? `linear-gradient(90deg, ${theme.accent}12, rgba(2,6,23,.22) 24%, rgba(2,6,23,.08))`
                            : "rgba(9,12,19,.52)",
                          boxShadow: dirty ? `inset 2px 0 0 #facc15` : `inset 2px 0 0 ${enabled ? theme.accent : "#3f3f46"}`,
                        }}
                      >
                        <div className="min-w-0">
                          <div className="flex items-start gap-3">
                            <div
                              className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border"
                              style={{
                                background: enabled ? `${theme.accent}22` : "rgba(113,113,122,0.16)",
                                borderColor: enabled ? `${theme.accent}55` : "#3f3f46",
                              }}
                            >
                              <ServiceLogo kind={theme.logo} accent={theme.accent} enabled={enabled} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <div className="truncate text-sm font-black" style={{ color: "#f8fafc" }}>{service.label}</div>
                                {dirty && (
                                  <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: "#facc15" }}>
                                    Pending
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 line-clamp-2 text-[11px] leading-5" style={{ color: "#cbd5e1" }}>
                                {service.description}
                              </p>
                              <div className="mt-2 text-[10px] font-mono" style={{ color: "#64748b" }}>
                                Updated {service.updatedAt ? new Date(service.updatedAt).toLocaleString("en-GB") : "—"}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div
                            className="inline-flex rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.24em]"
                            style={{ borderColor: enabled ? `${theme.accent}55` : "#3f3f46", color: enabled ? theme.accent : "#a1a1aa", background: enabled ? `${theme.accent}14` : "rgba(113,113,122,0.08)" }}
                          >
                            {theme.family}
                          </div>
                          <div className="mt-2 text-xs font-semibold" style={{ color: "#e2e8f0" }}>{theme.tools}</div>
                        </div>

                        <div className="min-w-0">
                          <div className="text-xs font-semibold" style={{ color: "#e2e8f0" }}>{theme.scope}</div>
                          <div className="mt-2 text-[10px]" style={{ color: "#64748b" }}>
                            Frontend + backend ready
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-[11px] font-semibold" style={{ color: enabled ? theme.statusOn : theme.statusOff }}>
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: enabled ? "#22c55e" : "#f87171", boxShadow: enabled ? "0 0 14px rgba(34,197,94,.7)" : "0 0 14px rgba(248,113,113,.45)" }} />
                            {enabled ? "Enabled" : "Disabled"}
                          </div>
                          <div className="mt-2 text-[10px]" style={{ color: dirty ? "#facc15" : "#64748b" }}>
                            {dirty ? "Waiting for save" : "Synced to service registry"}
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-3">
                          <button
                            type="button"
                            title={enabled ? "Disable service" : "Enable service"}
                            onClick={() => setServiceEdits(current => ({ ...current, [service.id]: !enabled }))}
                            className="shrink-0 h-6 w-11 rounded-full relative transition-colors"
                            style={{ background: enabled ? "#14532d" : "#3f3f46" }}
                          >
                            <motion.span
                              className="absolute top-0.5 h-5 w-5 rounded-full"
                              style={{ background: enabled ? "#22c55e" : "#71717a" }}
                              animate={{ left: enabled ? "calc(100% - 22px)" : "2px" }}
                              transition={{ duration: 0.16 }}
                            />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MCP Tools tab ── */}
        {tab === "tools" && (
          <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-8">
            {TOOL_NETWORKS.map(network => (
              <div key={network.id}>
                {/* Network title */}
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: network.dotColor }}
                  />
                  <span className="text-[13px] font-bold" style={{ color: "#e2e8f0" }}>
                    {network.label}
                  </span>
                  <div className="flex-1 h-px" style={{ background: "#1e293b" }} />
                </div>

                {/* Auth + endpoints card */}
                <div
                  className="rounded-xl overflow-hidden mb-3"
                  style={{ border: `1px solid ${network.borderColor}`, background: network.bgColor }}
                >
                  <div className="px-4 py-2.5 border-b" style={{ borderColor: network.borderColor }}>
                    <span
                      className="text-[9px] font-black uppercase tracking-wider"
                      style={{ color: network.dotColor + "aa" }}
                    >
                      Auth
                    </span>
                    <p className="text-[11px] font-mono mt-0.5" style={{ color: "#6b7280" }}>
                      {network.auth}
                    </p>
                  </div>
                  {network.endpoints.map((ep, ei) => (
                    <div
                      key={ei}
                      className="flex items-start gap-3 px-4 py-2.5 border-b"
                      style={{ borderColor: network.borderColor }}
                    >
                      <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" style={{ color: "#4b5563" }} />
                      <div className="min-w-0">
                        <span
                          className="text-[9px] font-bold uppercase tracking-wider"
                          style={{ color: "#4b5563" }}
                        >
                          {ep.label}
                        </span>
                        <p
                          className="font-mono text-[11px] break-all mt-0.5"
                          style={{ color: network.textColor }}
                        >
                          {ep.url}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Tools list */}
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ border: "1px solid #1e293b", background: "#0a0f1a" }}
                >
                  {network.tools.map((tool, ti) => (
                    <div
                      key={ti}
                      className="flex items-start gap-3 px-4 py-2.5 border-b"
                      style={{ borderColor: "#1e293b" }}
                    >
                      <Wrench
                        className="w-3 h-3 mt-0.5 shrink-0"
                        style={{ color: network.dotColor + "66" }}
                      />
                      <div>
                        <span
                          className="text-[11px] font-mono font-bold"
                          style={{ color: network.textColor }}
                        >
                          {tool.name}
                        </span>
                        <p className="text-[11px] mt-0.5" style={{ color: "#6b7280" }}>
                          {tool.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Status bar ── */}
      <div
        className="flex items-center gap-4 px-5 py-1.5 shrink-0 font-mono text-[9px]"
        style={{ borderTop: "1px solid #1e293b", background: "#0a0f1a", color: "#374151" }}
      >
        <span>file: ../.env</span>
        <span>{totalKeys} keys</span>
        {tab === "services" && <span>{services.length} service toggles</span>}
        {tab === "tools" && (
          <span>
            {TOOL_NETWORKS.reduce((n, nw) => n + nw.tools.length, 0)} tools registered
          </span>
        )}
        <span className="ml-auto">
          {tab === "services"
            ? (servicesDirty ? `${Object.keys(serviceEdits).length} unsaved service change(s)` : "no unsaved changes")
            : (isDirty ? `${Object.keys(edits).length} unsaved change(s)` : "no unsaved changes")}
        </span>
      </div>
    </div>
  )
}
