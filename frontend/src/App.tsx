import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Train, History } from "lucide-react"
import { useChat } from "./hooks/useChat"
import { useConversations } from "./hooks/useConversations"
import { LandingPage } from "./components/LandingPage"
import { MessageBubble } from "./components/MessageBubble"
import { ChatInput } from "./components/ChatInput"
import { ConversationSidebar } from "./components/ConversationSidebar"
import { NetworkBackground, type NetworkTheme } from "./components/NetworkBackground"
import { LoadingCounter } from "./components/LoadingCounter"
import type { ChatMessage, LLMMessage } from "./lib/types"
import "./index.css"

const TFL_TOOLS      = new Set(["plan_journey", "get_line_status", "get_status_by_mode", "search_stops"])
const SNCF_TOOLS     = new Set(["plan_sncf_journey", "search_sncf_stations", "get_sncf_disruptions"])
const EUROSTAR_TOOLS = new Set(["get_euromap_plans", "get_euromap_technical_plans", "get_euromap_plan_by_id", "get_euromap_technical_plan_by_id", "get_eurostar_dashboard", "get_eurostar_live_map"])

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

export default function App() {
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const activeConvIdRef                 = useRef<string>(crypto.randomUUID())
  const [activeConvId, setActiveConvId] = useState(activeConvIdRef.current)
  const [prefill, setPrefill]           = useState("")

  const { conversations, upsert, remove } = useConversations()

  const handleSaved = useCallback((msgs: ChatMessage[], llmHist: LLMMessage[]) => {
    upsert(activeConvIdRef.current, msgs, llmHist)
  }, [upsert])

  const { messages, loading, sendMessage, resetTo } = useChat(handleSaved)

  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const isEmpty = messages.length === 0

  const lastMsg = messages.at(-1)
  const isWaiting = loading && lastMsg?.role === "assistant" && !lastMsg.content

  const activeNetwork = useMemo((): NetworkTheme => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role !== "assistant") continue
      for (const ev of msg.toolEvents ?? []) {
        if (TFL_TOOLS.has(ev.name))      return "tfl"
        if (SNCF_TOOLS.has(ev.name))     return "sncf"
        if (EUROSTAR_TOOLS.has(ev.name)) return "eurostar"
      }
    }
    return null
  }, [messages])

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

  return (
    <div className="flex flex-col h-screen relative" style={{ background: "transparent" }}>
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
      <header className="bg-white border-b border-gray-100 relative z-10">
        <div className="flex items-center gap-3 px-5 py-3">
          {/* History toggle */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-gray-100"
            aria-label="Open conversation history"
          >
            <History className="text-gray-500" style={{ width: 16, height: 16 }} />
          </button>

          {/* Logo */}
          <div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0" style={{ background: "linear-gradient(135deg, #e32017 0%, #003366 100%)" }}>
            <Train className="text-white" style={{ width: 16, height: 16 }} />
          </div>

          {/* Title + pills */}
          <span className="font-bold text-gray-800 text-sm">Rail Live</span>
          <div className="flex items-center gap-1.5 ml-1">
            <NetworkPill color="#003366" label="Eurostar" />
            <NetworkPill color="#c00014" label="SNCF" />
            <NetworkPill color="#e32017" label="TFL" />
          </div>

          {/* Live */}
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            <span className="text-[11px] font-medium text-emerald-600 hidden sm:inline">Live</span>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto relative z-10">
        {isEmpty ? (
          <LandingPage onSend={sendMessage} onTemplate={setPrefill} />
        ) : (
          <div className="max-w-[920px] mx-auto w-full px-4 py-6 flex flex-col gap-4">
            {messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      {/* Input */}
      <footer className="px-4 py-3.5 border-t border-claude-border bg-white/80 backdrop-blur-sm relative z-10">
        <div className="max-w-[920px] mx-auto">
          <ChatInput onSend={sendMessage} disabled={loading} prefill={prefill} />
          <p className="text-center text-[11px] text-claude-muted mt-2">
            Powered by Ollama + MCP · Real-time data · Press <kbd className="px-1 py-0.5 text-[10px] bg-sand-100 border border-claude-border rounded">↵</kbd> to send
          </p>
        </div>
      </footer>
    </div>
  )
}
