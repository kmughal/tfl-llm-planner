import { useState, useCallback, useRef } from "react"
import type { ChatMessage, LLMMessage, ToolEvent } from "../lib/types"

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8080"

export function useChat() {
  const [messages, setMessages]       = useState<ChatMessage[]>([])
  const [loading, setLoading]         = useState(false)
  const llmHistoryRef                 = useRef<LLMMessage[]>([])  // full LLM sequence
  const abortRef                      = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return

    const userMsg: ChatMessage     = { id: crypto.randomUUID(), role: "user", content: text }
    const assistantId              = crypto.randomUUID()
    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "", streaming: true, toolEvents: [] }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setLoading(true)
    abortRef.current = new AbortController()

    try {
      const resp = await fetch(`${API_BASE}/api/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        // Send the full LLM history (includes tool call/result pairs from
        // previous turns) so the model has complete context.
        body:    JSON.stringify({ message: text, history: llmHistoryRef.current }),
        signal:  abortRef.current.signal,
      })

      if (!resp.ok || !resp.body) throw new Error(`Server error ${resp.status}`)

      const reader  = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ""

      const patch = (fn: (msg: ChatMessage) => ChatMessage) =>
        setMessages(prev => prev.map(m => m.id === assistantId ? fn(m) : m))

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const blocks = buffer.split("\n\n")
        buffer = blocks.pop() ?? ""

        for (const block of blocks.filter(Boolean)) {
          applyEvent(block, patch, llmHistoryRef)
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: "Something went wrong. Please try again.", streaming: false } : m
      ))
    } finally {
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, streaming: false } : m
      ))
      setLoading(false)
    }
  }, [loading])

  return { messages, loading, sendMessage }
}

function applyEvent(
  block:         string,
  patch:         (fn: (msg: ChatMessage) => ChatMessage) => void,
  llmHistoryRef: { current: LLMMessage[] },
) {
  let event = ""
  let data  = ""
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7).trim()
    if (line.startsWith("data: "))  data  = line.slice(6).trim()
  }
  if (!event || !data) return

  switch (event) {
    case "token": {
      const token = JSON.parse(data) as string
      patch(m => ({ ...m, content: m.content + token }))
      break
    }
    case "tool_call": {
      const { name } = JSON.parse(data) as { name: string }
      const ev: ToolEvent = { type: "tool_call", name }
      patch(m => ({ ...m, toolEvents: [...(m.toolEvents ?? []), ev] }))
      break
    }
    case "tool_result": {
      const { name, result } = JSON.parse(data) as { name: string; result: string }
      const ev: ToolEvent = { type: "tool_result", name, result }
      patch(m => ({ ...m, toolEvents: [...(m.toolEvents ?? []), ev] }))
      break
    }
    case "done": {
      const { reply, messages } = JSON.parse(data) as { reply: string; messages?: LLMMessage[] }
      patch(m => ({ ...m, content: reply, streaming: false }))
      // Store the full LLM message sequence (user + assistant tool_calls + tool
      // results + final assistant) so it can be replayed as history next turn.
      if (messages) llmHistoryRef.current = messages
      break
    }
    case "error": {
      patch(m => ({ ...m, content: `Error: ${data}`, streaming: false }))
      break
    }
  }
}
