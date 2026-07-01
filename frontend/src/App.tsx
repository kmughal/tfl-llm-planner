import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Train, History, BookOpen, Terminal, Settings, House, Bus, Trash2, Zap, Network, Activity } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useChat } from "./hooks/useChat"
import { useMemoryTimer } from "./hooks/useMemoryTimer"
import { useConversations } from "./hooks/useConversations"
import { LandingPage } from "./components/LandingPage"
import { MessageBubble } from "./components/MessageBubble"
import { ChatInput } from "./components/ChatInput"
import { ConversationSidebar } from "./components/ConversationSidebar"
import { ExamplesPanel } from "./components/ExamplesPanel"
import { LogsPage } from "./components/LogsPage"
import { ConfigPage } from "./components/ConfigPage"
import { ToolsPage } from "./components/ToolsPage"
import { SystemFlowPage } from "./components/SystemFlowPage"
import { NetworkBackground, type NetworkTheme } from "./components/NetworkBackground"
import { ChatMeshGradient } from "./components/ChatMeshGradient"
import { LoadingCounter } from "./components/LoadingCounter"
import { BusLinesExplorer } from "./components/BusLinesExplorer"
import { EurostarHub } from "./components/EurostarHub"
import { EurostarSchedule } from "./components/EurostarSchedule"
import { EurostarProjectionJourney } from "./components/EurostarProjectionJourney"
import { EurostarCommandCenter } from "./components/EurostarCommandCenter"
import { EurostarLoadAnalytics } from "./components/EurostarLoadAnalytics"
import { EurostarNotifications } from "./components/EurostarNotifications"
import { TflCommandCenter } from "./components/TflCommandCenter"
import { TflHub } from "./components/TflHub"
import { SNCFCommandCenter } from "./components/SNCFCommandCenter"
import { NationalRailCommandCenter } from "./components/NationalRailCommandCenter"
import { ParisRERCommandCenter } from "./components/ParisRERCommandCenter"
import { OperationsWall } from "./components/OperationsWall"
import { DashboardMenu } from "./components/DashboardMenu"
import { EurostarDisplayMenu, EurostarDisplayStyles, useEurostarDisplay } from "./components/EurostarDisplay"
import { getSessionId, resetSessionId } from "./lib/session"
import type { ChatMessage, LLMMessage } from "./lib/types"
import "./index.css"

const TFL_TOOLS      = new Set(["plan_journey", "get_line_status", "get_status_by_mode", "search_stops"])
const SNCF_TOOLS     = new Set(["plan_sncf_journey", "search_sncf_stations", "get_sncf_disruptions", "get_sncf_departures", "get_sncf_arrivals", "get_sncf_train", "get_sncf_dashboard"])
const EUROSTAR_TOOLS = new Set(["get_euromap_plans", "get_euromap_technical_plans", "get_euromap_plan_by_id", "get_euromap_technical_plan_by_id", "get_eurostar_dashboard", "get_eurostar_live_map", "get_traveler_summary", "get_crew_activities", "get_crew_monthly_schedule", "get_projection_live_map", "get_projection_commercial_services", "get_projection_service_detail", "get_projection_journey_explorer", "get_projection_services", "get_projection_news"])
const EUROSTAR_CATALOG_STORAGE_KEY = "eurostar-train-catalog-v1"
const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8080"

type ServiceState = {
  id: string
  label: string
  description: string
  enabled: boolean
  updatedAt: string
}

// ── Nav tab button with animated active indicator ─────────────────────────────
const NAV_TAB_COLORS: Record<string, { text: string; bg: string; border: string; glow: string }> = {
  tools:  { text: "#fbbf24", bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.35)",  glow: "rgba(251,191,36,0.25)" },
  logs:   { text: "#60a5fa", bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.35)",  glow: "rgba(96,165,250,0.25)" },
  config: { text: "#a78bfa", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.35)", glow: "rgba(167,139,250,0.25)" },
  system: { text: "#22d3ee", bg: "rgba(34,211,238,0.12)", border: "rgba(34,211,238,0.35)", glow: "rgba(34,211,238,0.25)" },
}

function NavTab({
  id, label, icon, active, onClick,
}: {
  readonly id:      string
  readonly label:   string
  readonly icon:    React.ReactNode
  readonly active:  boolean
  readonly onClick: () => void
}) {
  const c = NAV_TAB_COLORS[id] ?? NAV_TAB_COLORS.logs

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold overflow-hidden"
      style={{
        color:           active ? c.text : "rgba(255,255,255,0.45)",
        backgroundColor: active ? c.bg   : "transparent",
        border:          active ? `1px solid ${c.border}` : "1px solid transparent",
        boxShadow:       active ? `0 0 12px ${c.glow}, inset 0 0 8px ${c.glow}` : "none",
      }}
      animate={{
        color:           active ? c.text : "rgba(255,255,255,0.45)",
        backgroundColor: active ? c.bg   : "rgba(255,255,255,0)",
      }}
      transition={{ duration: 0.2 }}
      whileHover={active ? {} : { backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.75)" }}
      whileTap={{ scale: 0.95 }}
    >
      {/* Active glow sweep */}
      {active && (
        <motion.div
          className="absolute inset-0 pointer-events-none rounded-lg"
          style={{ background: `linear-gradient(105deg, transparent 30%, ${c.glow} 50%, transparent 70%)` }}
          animate={{ x: ["-100%", "200%"] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut", repeatDelay: 1.8 }}
        />
      )}

      {/* Active underline with layoutId — slides between tabs */}
      {active && (
        <motion.div
          layoutId="nav-tab-underline"
          className="absolute bottom-0 left-1/2 h-[2px] rounded-full"
          style={{ backgroundColor: c.text, width: "60%", x: "-50%" }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}

      {/* Pulsing dot when active */}
      {active && (
        <motion.span
          className="absolute top-1 right-1 w-1 h-1 rounded-full"
          style={{ backgroundColor: c.text }}
          animate={{ opacity: [1, 0.3, 1], scale: [1, 1.5, 1] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        />
      )}

      <motion.span
        animate={active ? { scale: [1, 1.2, 1] } : { scale: 1 }}
        transition={{ duration: 0.35, ease: "backOut" }}
        className="shrink-0"
      >
        {icon}
      </motion.span>
      <span className="hidden sm:inline">{label}</span>
    </motion.button>
  )
}

const ALL_SERVICES = [
  { label: "Eurostar",      color: "#7eaaff" },
  { label: "SNCF",          color: "#ff7676" },
  { label: "TFL",           color: "#ff6b5e" },
  { label: "National Rail", color: "#93c5fd" },
  { label: "Paris Métro",   color: "#6ee7b7" },
  { label: "Crew · SOT",    color: "#fbbf24" },
  { label: "London Buses",  color: "#fca5a5" },
  { label: "Weather",       color: "#7dd3fc" },
]

function ServiceTicker() {
  const items = [...ALL_SERVICES, ...ALL_SERVICES]
  return (
    <div
      className="flex items-center overflow-hidden ml-1.5"
      style={{
        maxWidth: 200,
        maskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
        WebkitMaskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
      }}
    >
      <motion.div
        className="flex items-center gap-1.5"
        style={{ width: "max-content" }}
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
      >
        {items.map((s, i) => (
          <span
            key={`${s.label}-${i}`}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0"
            style={{ backgroundColor: `${s.color}12`, color: s.color, border: `1px solid ${s.color}28` }}
          >
            <motion.span
              className="w-1 h-1 rounded-full shrink-0"
              style={{ background: s.color }}
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 % 2 }}
            />
            {s.label}
          </span>
        ))}
      </motion.div>
    </div>
  )
}

function memoryClearColor(cleared: boolean, expiring: boolean): string {
  if (cleared)  return "#6ee7b7"
  if (expiring) return "#fb923c"
  return "rgba(255,255,255,0.45)"
}

function detectNetwork(
  messages: ChatMessage[],
  tfl:      ReadonlySet<string>,
  sncf:     ReadonlySet<string>,
  eurostar: ReadonlySet<string>,
): NetworkTheme {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== "assistant") continue
    for (const ev of msg.toolEvents ?? []) {
      if (tfl.has(ev.name))     return "tfl"
      if (sncf.has(ev.name))    return "sncf"
      if (eurostar.has(ev.name)) return "eurostar"
    }
  }
  return null
}

function eurostarBtnStyle(open: boolean) {
  return open
    ? { backgroundColor: "rgba(0,51,102,0.28)", color: "#7eaaff", border: "1px solid rgba(0,51,102,0.5)" }
    : { backgroundColor: "transparent",          color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.1)" }
}

function timerColors(s: number) {
  if (s <= 20) return { bg: "#fef2f2", border: "#fecaca", text: "#dc2626", dot: "#ef4444" }
  if (s <= 60) return { bg: "#fff7ed", border: "#fed7aa", text: "#ea580c", dot: "#f97316" }
  return       { bg: "#f0fdf4", border: "#bbf7d0", text: "#16a34a", dot: "#22c55e" }
}

function MemoryTimerBadge({ secondsLeft }: { readonly secondsLeft: number }) {
  const isUrgent   = secondsLeft <= 20
  const isExpiring = secondsLeft <= 60
  const c          = timerColors(secondsLeft)
  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const label = `${mins}:${String(secs).padStart(2, "0")}`

  return (
    <motion.div
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold select-none"
      style={{ backgroundColor: c.bg, border: `1px solid ${c.border}`, color: c.text }}
      animate={isUrgent ? { x: [-1.5, 1.5, -1.5, 1.5, 0] } : {}}
      transition={isUrgent ? { duration: 0.3, repeat: Infinity, repeatDelay: 1 } : {}}
      title={`Memory auto-clears in ${label}`}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <motion.span
          className="absolute inline-flex h-full w-full rounded-full"
          style={{ backgroundColor: c.dot, opacity: 0.7 }}
          animate={{ scale: [1, isExpiring ? 2.2 : 1.8, 1] }}
          transition={{ duration: isExpiring ? 0.7 : 2, repeat: Infinity, ease: "easeInOut" }}
        />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ backgroundColor: c.dot }} />
      </span>
      <span>{label}</span>
    </motion.div>
  )
}

function ServiceStatusPill({ services }: { readonly services: ServiceState[] }) {
  const liveCount = services.filter(service => service.enabled).length
  const offCount = services.length - liveCount
  const liveRatio = services.length ? liveCount / services.length : 0
  const accent = offCount > 0 ? "#f59e0b" : "#22c55e"
  const glow = offCount > 0 ? "rgba(245,158,11,0.24)" : "rgba(34,197,94,0.22)"
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="relative hidden xl:block"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.div
        className="relative flex items-center gap-2 overflow-hidden rounded-xl px-3 py-2"
        style={{
          border: `1px solid ${offCount > 0 ? "rgba(245,158,11,0.24)" : "rgba(34,197,94,0.22)"}`,
          background: "linear-gradient(135deg, rgba(8,15,30,0.96), rgba(12,22,39,0.9))",
          boxShadow: `0 0 0 1px rgba(255,255,255,0.02), 0 0 16px ${glow}`,
        }}
        whileHover={{ y: -1 }}
      >
        <motion.span
          className="pointer-events-none absolute inset-y-0 -left-12 w-12 skew-x-[-20deg]"
          style={{ background: `linear-gradient(90deg, transparent, ${glow}, transparent)` }}
          animate={{ x: ["0%", "420%"] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "linear" }}
        />
        <span className="relative flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${accent}20`, color: accent }}>
          <Activity size={14} />
          <motion.span
            className="absolute h-2 w-2 rounded-full"
            style={{ right: 3, top: 3, background: accent }}
            animate={{ opacity: [1, 0.35, 1], scale: [1, 1.7, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
        </span>
        <div className="relative min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: offCount > 0 ? "#fde68a" : "#bbf7d0" }}>
            Service status
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold">
            <span style={{ color: "white" }}>{liveCount}/{services.length} live</span>
            <span style={{ color: offCount > 0 ? "#fdba74" : "#86efac" }}>{offCount > 0 ? `${offCount} off` : "all on"}</span>
          </div>
        </div>
        <div className="relative ml-1 h-1.5 w-16 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.09)" }}>
          <motion.span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ background: `linear-gradient(90deg, ${accent}, ${offCount > 0 ? "#fcd34d" : "#86efac"})` }}
            animate={{ width: `${Math.max(10, Math.round(liveRatio * 100))}%` }}
            transition={{ duration: 0.35 }}
          />
        </div>
      </motion.div>

      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute right-0 top-full z-[80] mt-2 w-[320px] rounded-2xl border p-3 shadow-[0_20px_55px_rgba(0,0,0,.35)]"
            style={{
              borderColor: "rgba(255,255,255,0.1)",
              background: "linear-gradient(180deg, rgba(7,11,24,0.98), rgba(10,18,32,0.96))",
              backdropFilter: "blur(18px)",
            }}
          >
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: "#cbd5e1" }}>Legend</div>
                <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>Services currently on and off</div>
              </div>
              <div className="rounded-full px-2 py-1 text-[10px] font-black" style={{ background: `${accent}18`, color: accent }}>
                {offCount > 0 ? `${offCount} off` : "All on"}
              </div>
            </div>
            <div className="space-y-2">
              {services.map(service => (
                <div
                  key={service.id}
                  className="flex items-start gap-3 rounded-xl border px-3 py-2.5"
                  style={{
                    borderColor: service.enabled ? "rgba(34,197,94,0.14)" : "rgba(248,113,113,0.14)",
                    background: service.enabled ? "rgba(20,83,45,0.16)" : "rgba(127,29,29,0.14)",
                  }}
                >
                  <motion.span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: service.enabled ? "#22c55e" : "#ef4444" }}
                    animate={{ opacity: [1, 0.45, 1], scale: [1, 1.4, 1] }}
                    transition={{ duration: service.enabled ? 1.8 : 1.2, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-[12px] font-black text-white">{service.label}</div>
                      <span
                        className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em]"
                        style={{
                          background: service.enabled ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)",
                          color: service.enabled ? "#bbf7d0" : "#fecaca",
                        }}
                      >
                        {service.enabled ? "On" : "Off"}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] leading-4" style={{ color: "rgba(255,255,255,0.5)" }}>
                      {service.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function App() {
  useEurostarDisplay()
  const [page, setPage] = useState<"chat" | "logs" | "config" | "tools" | "system">(() => {
    const h = globalThis.location.hash
    if (h === "#logs")   return "logs"
    if (h === "#config") return "config"
    if (h === "#tools")  return "tools"
    if (h === "#system") return "system"
    return "chat"
  })
  const [sidebarOpen, setSidebarOpen]           = useState(false)
  const [examplesOpen, setExamplesOpen]         = useState(false)
  const [busExplorerOpen, setBusExplorerOpen]   = useState(false)
  const [eurostarHubOpen, setEurostarHubOpen]               = useState(false)
  const [eurostarScheduleOpen, setEurostarScheduleOpen]     = useState(false)
  const [eurostarProjectionJourneyOpen, setEurostarProjectionJourneyOpen] = useState(false)
  const [eurostarLoadAnalyticsOpen, setEurostarLoadAnalyticsOpen] = useState(false)
  const [eurostarNotificationsOpen, setEurostarNotificationsOpen] = useState(false)
  const [commandCenterOpen, setCommandCenterOpen]           = useState(false)
  const [tflHubOpen, setTflHubOpen]                         = useState(false)
  const [tflCommandCenterOpen, setTflCommandCenterOpen]     = useState(false)
  const [sncfCommandCenterOpen, setSncfCommandCenterOpen]   = useState(false)
  const [nationalRailCommandCenterOpen, setNationalRailCommandCenterOpen] = useState(false)
  const [parisCommandCenterOpen, setParisCommandCenterOpen] = useState(false)
  const [operationsWallOpen, setOperationsWallOpen] = useState(false)
  const [memoryCleared, setMemoryCleared]       = useState(false)
  const activeConvIdRef                   = useRef<string>(crypto.randomUUID())
  const [activeConvId, setActiveConvId] = useState(activeConvIdRef.current)
  const [prefill, setPrefill]           = useState("")
  const [services, setServices]         = useState<ServiceState[]>([])

  const { conversations, upsert, remove } = useConversations()

  // Shared flush: wipes server-side memory, regenerates the session ID, and
  // briefly shows a "Cleared" confirmation. Called both by the button and on
  // timer expiry — so it must not depend on timer state to avoid a cycle.
  const onMemoryExpire = useCallback(() => {
    const sid = getSessionId()
    void fetch(`${import.meta.env.VITE_API_URL ?? "http://localhost:8080"}/api/memory/${sid}`, { method: "DELETE" })
    resetSessionId()
    setMemoryCleared(true)
    setTimeout(() => setMemoryCleared(false), 2000)
  }, [])

  const {
    secondsLeft,
    isActive:   timerActive,
    isExpiring: timerExpiring,
    start:      timerStart,
    clear:      timerClear,
  } = useMemoryTimer(onMemoryExpire)

  // Fires after every completed turn — saves the conversation and resets the
  // 10-minute auto-flush countdown.
  const handleSaved = useCallback((msgs: ChatMessage[], llmHist: LLMMessage[]) => {
    upsert(activeConvIdRef.current, msgs, llmHist)
    timerStart()
  }, [upsert, timerStart])

  const { messages, loading, sendMessage, resetTo } = useChat(handleSaved, activeConvIdRef)

  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    const onHash = () => {
      const h = globalThis.location.hash
      if (h === "#logs")        setPage("logs")
      else if (h === "#config") setPage("config")
      else if (h === "#tools")  setPage("tools")
      else if (h === "#system") setPage("system")
      else setPage("chat")
    }
    globalThis.addEventListener("hashchange", onHash)
    return () => globalThis.removeEventListener("hashchange", onHash)
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadServices = async () => {
      try {
        const response = await fetch(`${API}/api/services/status`)
        if (!response.ok) return
        const body = await response.json() as { services?: ServiceState[] }
        if (!cancelled) setServices(body.services ?? [])
      } catch {
        // Keep the shell usable even if service status cannot be loaded.
      }
    }

    void loadServices()
    const timer = window.setInterval(() => void loadServices(), 30000)
    const handleUpdate = () => { void loadServices() }
    window.addEventListener("service-status-updated", handleUpdate)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener("service-status-updated", handleUpdate)
    }
  }, [])

  useEffect(() => {
    const date = new Date().toISOString().slice(0, 10)
    try {
      const raw = window.localStorage.getItem(EUROSTAR_CATALOG_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { date?: string; fetchedAt?: string }
        const age = parsed?.fetchedAt ? Date.now() - new Date(parsed.fetchedAt).getTime() : Number.POSITIVE_INFINITY
        if (parsed?.date === date && Number.isFinite(age) && age < 24 * 60 * 60 * 1000) return
      }
    } catch {
      // Ignore stale local cache parse issues and fetch again.
    }

    void fetch(`/api/eurostar/catalog?date=${date}`)
      .then(response => response.ok ? response.json() : null)
      .then(payload => {
        if (!payload) return
        window.localStorage.setItem(EUROSTAR_CATALOG_STORAGE_KEY, JSON.stringify(payload))
      })
      .catch(() => {
        // Silent preload failure; target screens will retry on demand.
      })
  }, [])

  const isEmpty = messages.length === 0

  const lastMsg = messages.at(-1)
  const isWaiting = loading && lastMsg?.role === "assistant" && !lastMsg.content

  const activeNetwork = useMemo(
    () => detectNetwork(messages, TFL_TOOLS, SNCF_TOOLS, EUROSTAR_TOOLS),
    [messages],
  )
  const projectionEnabled = useMemo(
    () => services.some(service => service.id === "eurostar-projection" && service.enabled),
    [services],
  )

  function handleNewConversation() {
    const id = crypto.randomUUID()
    activeConvIdRef.current = id
    setActiveConvId(id)
    resetTo([], [])
    setSidebarOpen(false)
  }

  function handleSelectConversation(id: string) {
    const conv = conversations.find(c => c.id === id)
    if (!conv) return
    activeConvIdRef.current = id
    setActiveConvId(id)
    resetTo(conv.messages, conv.llmHistory)
    setSidebarOpen(false)
  }

  function handleClearMemory() {
    timerClear()
    onMemoryExpire()
  }

  if (page === "logs") {
    return (
      <><EurostarDisplayStyles /><AnimatePresence mode="wait">
        <motion.div
          key="logs"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          className="app-system-shell h-screen w-full"
        >
          <LogsPage onClose={() => { globalThis.location.hash = ""; setPage("chat") }} />
          <div className="fixed bottom-3 right-3 z-[90]"><EurostarDisplayMenu /></div>
        </motion.div>
      </AnimatePresence></>
    )
  }

  if (page === "config") {
    return (
      <><EurostarDisplayStyles /><AnimatePresence mode="wait">
        <motion.div
          key="config"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          className="app-system-shell h-screen w-full"
        >
          <ConfigPage onClose={() => { globalThis.location.hash = ""; setPage("chat") }} />
          <div className="fixed bottom-3 right-3 z-[90]"><EurostarDisplayMenu /></div>
        </motion.div>
      </AnimatePresence></>
    )
  }

  if (page === "tools") {
    return (
      <><EurostarDisplayStyles /><AnimatePresence mode="wait">
        <motion.div
          key="tools"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          className="app-system-shell h-screen w-full"
        >
          <ToolsPage onClose={() => { globalThis.location.hash = ""; setPage("chat") }} />
          <div className="fixed bottom-3 right-3 z-[90]"><EurostarDisplayMenu /></div>
        </motion.div>
      </AnimatePresence></>
    )
  }

  if (page === "system") {
    return (
      <><EurostarDisplayStyles /><AnimatePresence mode="wait">
        <motion.div
          key="system"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          className="app-system-shell h-screen w-full"
        >
          <SystemFlowPage onClose={() => { globalThis.location.hash = ""; setPage("chat") }} />
          <div className="fixed bottom-3 right-3 z-[90]"><EurostarDisplayMenu /></div>
        </motion.div>
      </AnimatePresence></>
    )
  }

  return (
    <div className="flex flex-col h-screen relative" style={{ background: "transparent" }}>
      <EurostarDisplayStyles />
      <ChatMeshGradient theme={activeNetwork} />
      <NetworkBackground theme={activeNetwork} />
      <LoadingCounter visible={isWaiting} theme={activeNetwork} />

      <ConversationSidebar
        open={sidebarOpen}
        conversations={conversations}
        activeId={activeConvId}
        onNew={handleNewConversation}
        onSelect={handleSelectConversation}
        onDelete={remove}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Header */}
      <header
        className="relative z-50 border-b"
        style={{
          background: "rgba(3,7,18,0.82)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderColor: "rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex items-center gap-3 px-5 py-3">
          {/* History toggle */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="relative flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
            style={{ color: "rgba(255,255,255,0.55)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            aria-label="Open conversation history"
          >
            <History style={{ width: 16, height: 16 }} />
            <AnimatePresence>
              {conversations.length > 0 && (
                <motion.span
                  key={conversations.length}
                  className="absolute -top-1.5 -right-1.5 flex items-center justify-center rounded-full text-[8px] font-black tabular-nums leading-none"
                  style={{
                    minWidth: 15, height: 15,
                    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                    color: "#fff",
                    border: "1.5px solid rgba(3,7,18,0.85)",
                    padding: "0 3px",
                    boxShadow: "0 0 6px rgba(99,102,241,0.6)",
                  }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 520, damping: 18 }}
                >
                  <motion.span
                    animate={{ scale: [1, 1.25, 1] }}
                    transition={{ duration: 0.5, delay: 0.15 }}
                  >
                    {conversations.length}
                  </motion.span>
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {/* Logo */}
          <div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0" style={{ background: "linear-gradient(135deg, #e32017 0%, #003366 100%)" }}>
            <Train className="text-white" style={{ width: 16, height: 16 }} />
          </div>

          {/* Title + animated service ticker */}
          <motion.span
            className="font-black text-sm shrink-0"
            style={{
              background: "linear-gradient(90deg, #fff 0%, #a5b4fc 40%, #7eaaff 70%, #fff 100%)",
              backgroundSize: "200% 100%",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
            animate={{ backgroundPosition: ["0% 0%", "100% 0%", "0% 0%"] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          >
            Rail Live
          </motion.span>
          <ServiceTicker />

          {/* Live */}
          <div className="ml-auto flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              <span className="text-[11px] font-medium hidden sm:inline" style={{ color: "#34d399" }}>Live</span>
            </div>

            {/* Home */}
            {!isEmpty && (
              <button
                onClick={() => { globalThis.location.hash = ""; setPage("chat"); handleNewConversation() }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
                style={{ color: "rgba(255,255,255,0.45)", border: "1px solid transparent" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                aria-label="Go to home"
              >
                <House style={{ width: 13, height: 13 }} />
                <span className="hidden sm:inline">Home</span>
              </button>
            )}

            {/* Examples panel toggle */}
            {!isEmpty && (
              <button
                onClick={() => setExamplesOpen(v => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
                style={{
                  backgroundColor: examplesOpen ? "rgba(100,120,255,0.18)" : "transparent",
                  color:           examplesOpen ? "#a5b4fc" : "rgba(255,255,255,0.45)",
                  border:          examplesOpen ? "1px solid rgba(100,120,255,0.3)" : "1px solid transparent",
                }}
                aria-label="Toggle examples panel"
              >
                <BookOpen style={{ width: 13, height: 13 }} />
                <span className="hidden sm:inline">Examples</span>
              </button>
            )}

          {/* Eurostar Hub */}
          <button
            onClick={() => setEurostarHubOpen(value => {
              if (!value) setTflHubOpen(false)
              return !value
            })}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
              style={eurostarBtnStyle(eurostarHubOpen)}
              aria-label="Open Eurostar hub"
            >
              <Train style={{ width: 13, height: 13 }} />
              <span className="hidden sm:inline">Eurostar</span>
            </button>

            <button
              onClick={() => setTflHubOpen(value => {
                if (!value) setEurostarHubOpen(false)
                return !value
              })}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
              style={{
                backgroundColor: tflHubOpen ? "rgba(227,32,23,0.18)" : "transparent",
                color:           tflHubOpen ? "#ffb4a8" : "rgba(255,255,255,0.45)",
                border:          tflHubOpen ? "1px solid rgba(227,32,23,0.35)" : "1px solid transparent",
              }}
              aria-label="Open TfL hub"
            >
              <Bus style={{ width: 13, height: 13 }} />
              <span className="hidden sm:inline">TfL</span>
            </button>

            <DashboardMenu
              onOperationsWall={() => setOperationsWallOpen(true)}
              onSncf={() => setSncfCommandCenterOpen(true)}
              onNationalRail={() => setNationalRailCommandCenterOpen(true)}
              onParis={() => setParisCommandCenterOpen(true)}
            />

            <motion.button
              type="button"
              onClick={() => { globalThis.location.hash = "#system"; setPage("system") }}
              className="relative overflow-hidden rounded-lg px-3 py-1.5 text-[11px] font-black"
              style={{
                color: "#a5f3fc",
                background: "linear-gradient(135deg, rgba(8,47,73,0.72), rgba(37,99,235,0.22))",
                border: "1px solid rgba(34,211,238,0.34)",
                boxShadow: "0 0 0 1px rgba(34,211,238,0.08), 0 0 16px rgba(34,211,238,0.18)",
              }}
              whileHover={{ y: -1, boxShadow: "0 0 0 1px rgba(34,211,238,0.18), 0 0 24px rgba(34,211,238,0.32)" }}
              whileTap={{ scale: 0.98 }}
              aria-label="See how the system works"
            >
              <motion.span
                className="pointer-events-none absolute inset-y-0 -left-10 w-10 skew-x-[-24deg]"
                style={{ background: "linear-gradient(90deg, transparent, rgba(125,211,252,0.95), transparent)" }}
                animate={{ x: ["0%", "380%"] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
              />
              <motion.span
                className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
                style={{ background: "#67e8f9" }}
                animate={{ opacity: [1, 0.3, 1], scale: [1, 1.65, 1] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              />
              <span className="relative flex items-center gap-1.5">
                <Network style={{ width: 13, height: 13 }} />
                <span className="hidden sm:inline">How It Works</span>
                <span className="sm:hidden">System</span>
              </span>
            </motion.button>

            {services.length > 0 && <ServiceStatusPill services={services} />}

            <EurostarDisplayMenu inverted />

            {/* Memory timer badge */}
            <AnimatePresence>
              {timerActive && secondsLeft !== null && (
                <motion.div
                  key="memory-timer"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.2 }}
                >
                  <MemoryTimerBadge secondsLeft={secondsLeft} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Clear Memory */}
            <button
              onClick={handleClearMemory}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
              style={{
                backgroundColor: memoryCleared ? "rgba(16,185,129,0.15)" : "transparent",
                color:           memoryClearColor(memoryCleared, timerExpiring),
                border:          memoryCleared ? "1px solid rgba(16,185,129,0.3)" : "1px solid transparent",
              }}
              aria-label="Clear conversation memory"
              title="Clear all memory for this session"
            >
              <Trash2 style={{ width: 13, height: 13 }} />
              <span className="hidden sm:inline">{memoryCleared ? "Cleared" : "Memory"}</span>
            </button>

            {/* Page tabs — Tools / Logs / Config */}
            <NavTab
              id="tools"
              label="Tools"
              icon={<Zap style={{ width: 13, height: 13 }} />}
              active={false}
              onClick={() => { globalThis.location.hash = "#tools"; setPage("tools") }}
            />
            <NavTab
              id="logs"
              label="Logs"
              icon={<Terminal style={{ width: 13, height: 13 }} />}
              active={false}
              onClick={() => { globalThis.location.hash = "#logs"; setPage("logs") }}
            />
            <NavTab
              id="config"
              label="Config"
              icon={<Settings style={{ width: 13, height: 13 }} />}
              active={false}
              onClick={() => { globalThis.location.hash = "#config"; setPage("config") }}
            />
          </div>
        </div>

      </header>

      {/* Body — horizontal split when chat is active */}
      <div className="flex-1 flex min-h-0 relative z-10">

        {/* Messages */}
        <main className="flex-1 overflow-y-auto">
          {isEmpty ? (
            <LandingPage
              onSend={sendMessage}
              onTemplate={setPrefill}
            />
          ) : (
            <div className="max-w-[1180px] mx-auto w-full px-4 py-6 flex flex-col gap-4">
              {messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </main>

        {/* Examples panel */}
        <AnimatePresence>
          {!isEmpty && examplesOpen && (
            <motion.div
              key="examples"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 272, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
              className="overflow-hidden shrink-0 h-full"
            >
              <ExamplesPanel
                onSend={sendMessage}
                onTemplate={setPrefill}
                onClose={() => setExamplesOpen(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Eurostar hub modal */}
      {eurostarHubOpen && (
        <EurostarHub
          onClose={() => setEurostarHubOpen(false)}
          onSend={sendMessage}
          onSchedule={() => { setEurostarHubOpen(false); setEurostarScheduleOpen(true) }}
          onProjectionJourney={projectionEnabled ? () => { setEurostarHubOpen(false); setEurostarProjectionJourneyOpen(true) } : undefined}
          onCommandCenter={() => setCommandCenterOpen(true)}
          onLoadAnalytics={() => setEurostarLoadAnalyticsOpen(true)}
          onNotifications={() => setEurostarNotificationsOpen(true)}
        />
      )}

      {tflHubOpen && (
        <TflHub
          onClose={() => setTflHubOpen(false)}
          onCommandCenter={() => { setTflHubOpen(false); setTflCommandCenterOpen(true) }}
          onBusExplorer={() => { setTflHubOpen(false); setBusExplorerOpen(true) }}
          onSend={sendMessage}
        />
      )}

      <AnimatePresence>
        {operationsWallOpen && (
          <OperationsWall
            onClose={() => setOperationsWallOpen(false)}
            onAsk={sendMessage}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {commandCenterOpen && (
          <EurostarCommandCenter
            onClose={() => setCommandCenterOpen(false)}
            onAsk={sendMessage}
            onLoadAnalytics={() => { setCommandCenterOpen(false); setEurostarLoadAnalyticsOpen(true) }}
            onNotifications={() => { setCommandCenterOpen(false); setEurostarNotificationsOpen(true) }}
            projectionEnabled={projectionEnabled}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {eurostarLoadAnalyticsOpen && (
          <EurostarLoadAnalytics
            onClose={() => setEurostarLoadAnalyticsOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {eurostarNotificationsOpen && (
          <EurostarNotifications
            onClose={() => setEurostarNotificationsOpen(false)}
            onAsk={sendMessage}
            projectionEnabled={projectionEnabled}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tflCommandCenterOpen && (
          <TflCommandCenter
            onClose={() => setTflCommandCenterOpen(false)}
            onAsk={sendMessage}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sncfCommandCenterOpen && (
          <SNCFCommandCenter
            onClose={() => setSncfCommandCenterOpen(false)}
            onAsk={sendMessage}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {nationalRailCommandCenterOpen && (
          <NationalRailCommandCenter onClose={() => setNationalRailCommandCenterOpen(false)} onAsk={sendMessage} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {parisCommandCenterOpen && (
          <ParisRERCommandCenter
            onClose={() => setParisCommandCenterOpen(false)}
            onAsk={sendMessage}
          />
        )}
      </AnimatePresence>

      {/* Eurostar schedule modal */}
      {eurostarScheduleOpen && (
        <EurostarSchedule onClose={() => setEurostarScheduleOpen(false)} />
      )}

      <AnimatePresence>
        {eurostarProjectionJourneyOpen && (
          <EurostarProjectionJourney onClose={() => setEurostarProjectionJourneyOpen(false)} />
        )}
      </AnimatePresence>

      {/* Bus lines explorer modal */}
      <AnimatePresence>
        {busExplorerOpen && (
          <BusLinesExplorer onClose={() => setBusExplorerOpen(false)} />
        )}
      </AnimatePresence>

      {/* Input */}
      <footer
        className="px-4 py-3.5 relative z-10 border-t"
        style={{
          background: "rgba(3,7,18,0.82)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderColor: "rgba(255,255,255,0.08)",
        }}
      >
        <div className="max-w-[920px] mx-auto">
          <ChatInput onSend={sendMessage} disabled={loading} prefill={prefill} />
          <p className="text-center text-[11px] mt-2" style={{ color: "rgba(255,255,255,0.28)" }}>
            Powered by Ollama + MCP · Real-time data · Press <kbd className="px-1 py-0.5 text-[10px] rounded" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)" }}>↵</kbd> to send
          </p>
        </div>
      </footer>
    </div>
  )
}
