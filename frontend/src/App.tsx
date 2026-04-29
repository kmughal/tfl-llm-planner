import { useEffect, useRef, useState } from "react"
import { Train } from "lucide-react"
import { useChat } from "./hooks/useChat"
import { MessageBubble } from "./components/MessageBubble"
import { ChatInput } from "./components/ChatInput"
import { SuggestionPills } from "./components/SuggestionPills"
import "./index.css"

export default function App() {
  const { messages, loading, sendMessage } = useChat()
  const bottomRef   = useRef<HTMLDivElement>(null)
  const [prefill, setPrefill] = useState("")

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col h-screen bg-claude-bg">

      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-4 border-b border-claude-border bg-white/80 backdrop-blur-sm">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-tfl-tube">
          <Train className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-claude-text leading-none">Journey Planner</h1>
          <p className="text-xs text-claude-muted mt-0.5">TFL · SNCF · Eurostar · Powered by Ollama + MCP</p>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto w-full">

          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[50vh] gap-8 text-center">
              <div>
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-tfl-tube mx-auto mb-4">
                  <Train className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-xl font-semibold text-claude-text">Transport assistant</h2>
                <p className="text-sm text-claude-muted mt-1">TFL · SNCF · Eurostar — plan journeys across three networks</p>
              </div>
              <SuggestionPills
                onSelect={sendMessage}
                onTemplate={setPrefill}
              />
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
      <footer className="px-4 py-4 border-t border-claude-border bg-claude-bg">
        <div className="max-w-2xl mx-auto">
          <ChatInput
            onSend={sendMessage}
            disabled={loading}
            prefill={prefill}
          />
          <p className="text-center text-xs text-claude-muted mt-2">
            Real-time TFL · SNCF · Eurostar data · Free &amp; open source
          </p>
        </div>
      </footer>

    </div>
  )
}
