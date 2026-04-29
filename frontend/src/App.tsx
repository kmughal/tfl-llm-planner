import { useEffect, useRef, useState } from "react"
import { Train, MapPin } from "lucide-react"
import { useChat } from "./hooks/useChat"
import { MessageBubble } from "./components/MessageBubble"
import { ChatInput } from "./components/ChatInput"
import { SuggestionPills } from "./components/SuggestionPills"
import "./index.css"

// Tri-color network identity strip
function NetworkStripe() {
  return (
    <div className="flex h-[3px] w-full shrink-0">
      <div className="flex-1" style={{ background: "#e32017" }} />
      <div className="flex-1" style={{ background: "#e2001a" }} />
      <div className="flex-1" style={{ background: "#003366" }} />
    </div>
  )
}

function NetworkPill({ color, label }: { readonly color: string; readonly label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide"
      style={{ backgroundColor: `${color}15`, color, border: `1px solid ${color}30` }}
    >
      {label}
    </span>
  )
}

export default function App() {
  const { messages, loading, sendMessage } = useChat()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [prefill, setPrefill] = useState("")

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col h-screen" style={{ background: "transparent" }}>

      {/* Header */}
      <header className="bg-white/90 backdrop-blur-sm border-b border-claude-border shadow-sm">
        <NetworkStripe />
        <div className="flex items-center gap-3 px-5 py-3.5">
          {/* Logo mark */}
          <div className="relative flex items-center justify-center w-9 h-9 rounded-xl shrink-0" style={{ background: "linear-gradient(135deg, #e32017 0%, #003366 100%)" }}>
            <Train className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
          </div>

          {/* Title */}
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold text-claude-text leading-none tracking-tight">Journey Planner</h1>
            <div className="flex items-center gap-2 mt-1">
              <NetworkPill color="#e32017" label="TFL" />
              <NetworkPill color="#c00014" label="SNCF" />
              <NetworkPill color="#003366" label="Eurostar" />
            </div>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[11px] font-medium text-emerald-600 hidden sm:inline">Live</span>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto w-full">

          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[55vh] gap-7 text-center">

              {/* Hero */}
              <div>
                <div
                  className="flex items-center justify-center w-16 h-16 rounded-2xl mx-auto mb-4 shadow-lg"
                  style={{ background: "linear-gradient(135deg, #e32017 0%, #003366 100%)" }}
                >
                  <Train className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-claude-text tracking-tight">What can I help with?</h2>
                <p className="text-sm text-claude-muted mt-1.5 max-w-sm mx-auto">
                  Real-time journey planning across three networks — London, France, and cross-channel.
                </p>
              </div>

              {/* Network coverage cards */}
              <div className="flex items-stretch gap-3 w-full max-w-xl flex-wrap justify-center">
                <CoverageCard color="#e32017" bg="#fff1f0" border="#fca5a5" icon={<Train className="w-4 h-4" />} title="TFL · London" desc="Tube, DLR, Overground, Elizabeth line" />
                <CoverageCard color="#c00014" bg="#fff0f1" border="#fbb6bc" icon={<Train className="w-4 h-4" />} title="SNCF · France" desc="TGV, Intercités, TER, Ouigo" />
                <CoverageCard color="#003366" bg="#eff6ff" border="#93c5fd" icon={<MapPin className="w-4 h-4" />} title="Eurostar" desc="London ↔ Paris, Brussels, Amsterdam" />
              </div>

              <SuggestionPills onSelect={sendMessage} onTemplate={setPrefill} />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              <div ref={bottomRef} />
            </div>
          )}

        </div>
      </main>

      {/* Input */}
      <footer className="px-4 py-3.5 border-t border-claude-border bg-white/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto">
          <ChatInput onSend={sendMessage} disabled={loading} prefill={prefill} />
          <p className="text-center text-[11px] text-claude-muted mt-2">
            Powered by Ollama + MCP · Real-time data · Press <kbd className="px-1 py-0.5 text-[10px] bg-sand-100 border border-claude-border rounded">↵</kbd> to send
          </p>
        </div>
      </footer>

    </div>
  )
}

function CoverageCard({
  color, bg, border, icon, title, desc,
}: {
  readonly color: string; readonly bg: string; readonly border: string; readonly icon: React.ReactNode; readonly title: string; readonly desc: string
}) {
  return (
    <div
      className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl text-center flex-1 min-w-[130px] max-w-[180px]"
      style={{ backgroundColor: bg, border: `1px solid ${border}` }}
    >
      <span style={{ color }}>{icon}</span>
      <span className="text-xs font-bold" style={{ color }}>{title}</span>
      <span className="text-[10px] leading-snug" style={{ color: `${color}99` }}>{desc}</span>
    </div>
  )
}
