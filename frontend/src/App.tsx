import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Train, History, BookOpen, Terminal, Settings, House, Bus, Trash2, Zap } from "lucide-react"
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
import { NetworkBackground, type NetworkTheme } from "./components/NetworkBackground"
import { ChatMeshGradient } from "./components/ChatMeshGradient"
import { LoadingCounter } from "./components/LoadingCounter"
import { BusLinesExplorer } from "./components/BusLinesExplorer"
import { EurostarHub } from "./components/EurostarHub"
import { EurostarSchedule } from "./components/EurostarSchedule"
import { getSessionId, resetSessionId } from "./lib/session"
import type { ChatMessage, LLMMessage } from "./lib/types"
import "./index.css"

const TFL_TOOLS      = new Set(["plan_journey", "get_line_status", "get_status_by_mode", "search_stops"])
const SNCF_TOOLS     = new Set(["plan_sncf_journey", "search_sncf_stations", "get_sncf_disruptions"])
const EUROSTAR_TOOLS = new Set(["get_euromap_plans", "get_euromap_technical_plans", "get_euromap_plan_by_id", "get_euromap_technical_plan_by_id", "get_eurostar_dashboard", "get_eurostar_live_map"])

// ── Nav tab button with animated active indicator ─────────────────────────────
const NAV_TAB_COLORS: Record<string, { text: string; bg: string; border: string; glow: string }> = {
  tools:  { text: "#fbbf24", bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.35)",  glow: "rgba(251,191,36,0.25)" },
  logs:   { text: "#60a5fa", bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.35)",  glow: "rgba(96,165,250,0.25)" },
  config: { text: "#a78bfa", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.35)", glow: "rgba(167,139,250,0.25)" },
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

function NetworkPill({ color, label }: { readonly color: string; readonly label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ backgroundColor: `${color}10`, color, border: `1px solid ${color}22` }}
    >
      {label}
    </span>
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

export default function App() {
  const [page, setPage] = useState<"chat" | "logs" | "config" | "tools">(() => {
    const h = globalThis.location.hash
    if (h === "#logs")   return "logs"
    if (h === "#config") return "config"
    if (h === "#tools")  return "tools"
    return "chat"
  })
  const [sidebarOpen, setSidebarOpen]           = useState(false)
  const [examplesOpen, setExamplesOpen]         = useState(true)
  const [busExplorerOpen, setBusExplorerOpen]   = useState(false)
  const [eurostarHubOpen, setEurostarHubOpen]         = useState(false)
  const [eurostarScheduleOpen, setEurostarScheduleOpen] = useState(false)
  const [memoryCleared, setMemoryCleared]       = useState(false)
  const activeConvIdRef                   = useRef<string>(crypto.randomUUID())
  const [activeConvId, setActiveConvId] = useState(activeConvIdRef.current)
  const [prefill, setPrefill]           = useState("")

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
      else setPage("chat")
    }
    globalThis.addEventListener("hashchange", onHash)
    return () => globalThis.removeEventListener("hashchange", onHash)
  }, [])

  const isEmpty = messages.length === 0

  const lastMsg = messages.at(-1)
  const isWaiting = loading && lastMsg?.role === "assistant" && !lastMsg.content

  const activeNetwork = useMemo(
    () => detectNetwork(messages, TFL_TOOLS, SNCF_TOOLS, EUROSTAR_TOOLS),
    [messages],
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
      <AnimatePresence mode="wait">
        <motion.div
          key="logs"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          className="h-screen w-full"
        >
          <LogsPage onClose={() => { globalThis.location.hash = ""; setPage("chat") }} />
        </motion.div>
      </AnimatePresence>
    )
  }

  if (page === "config") {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="config"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          className="h-screen w-full"
        >
          <ConfigPage onClose={() => { globalThis.location.hash = ""; setPage("chat") }} />
        </motion.div>
      </AnimatePresence>
    )
  }

  if (page === "tools") {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="tools"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          className="h-screen w-full"
        >
          <ToolsPage onClose={() => { globalThis.location.hash = ""; setPage("chat") }} />
        </motion.div>
      </AnimatePresence>
    )
  }

  return (
    <div className="flex flex-col h-screen relative" style={{ background: "transparent" }}>
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
        className="relative z-10 border-b"
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
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
            style={{ color: "rgba(255,255,255,0.55)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            aria-label="Open conversation history"
          >
            <History style={{ width: 16, height: 16 }} />
          </button>

          {/* Logo */}
          <div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0" style={{ background: "linear-gradient(135deg, #e32017 0%, #003366 100%)" }}>
            <Train className="text-white" style={{ width: 16, height: 16 }} />
          </div>

          {/* Title + pills */}
          <span className="font-bold text-sm" style={{ color: "rgba(255,255,255,0.92)" }}>Rail Live</span>
          <div className="flex items-center gap-1.5 ml-1">
            <NetworkPill color="#7eaaff" label="Eurostar" />
            <NetworkPill color="#ff7676" label="SNCF" />
            <NetworkPill color="#ff6b5e" label="TFL" />
          </div>

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
              onClick={() => setEurostarHubOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
              style={eurostarBtnStyle(eurostarHubOpen)}
              aria-label="Open Eurostar hub"
            >
              <Train style={{ width: 13, height: 13 }} />
              <span className="hidden sm:inline">Eurostar</span>
            </button>

            {/* Bus explorer */}
            <button
              onClick={() => setBusExplorerOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
              style={{
                backgroundColor: busExplorerOpen ? "rgba(225,37,27,0.18)" : "transparent",
                color:           busExplorerOpen ? "#fca5a5" : "rgba(255,255,255,0.45)",
                border:          busExplorerOpen ? "1px solid rgba(225,37,27,0.35)" : "1px solid transparent",
              }}
              aria-label="Browse London bus lines"
            >
              <Bus style={{ width: 13, height: 13 }} />
              <span className="hidden sm:inline">Buses</span>
            </button>

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
              active={page === "tools"}
              onClick={() => { globalThis.location.hash = "#tools"; setPage("tools") }}
            />
            <NavTab
              id="logs"
              label="Logs"
              icon={<Terminal style={{ width: 13, height: 13 }} />}
              active={page === "logs"}
              onClick={() => { globalThis.location.hash = "#logs"; setPage("logs") }}
            />
            <NavTab
              id="config"
              label="Config"
              icon={<Settings style={{ width: 13, height: 13 }} />}
              active={page === "config"}
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
            <LandingPage onSend={sendMessage} onTemplate={setPrefill} />
          ) : (
            <div className="max-w-[860px] mx-auto w-full px-4 py-6 flex flex-col gap-4">
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
        />
      )}

      {/* Eurostar schedule modal */}
      {eurostarScheduleOpen && (
        <EurostarSchedule onClose={() => setEurostarScheduleOpen(false)} />
      )}

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
