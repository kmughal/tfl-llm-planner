import { useState, useCallback, useRef, useEffect } from "react"
import type { ChatMessage, LLMMessage, ToolEvent } from "../lib/types"

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8080"

// Module-level helper — keeps nesting shallow inside useCallback.
function patchMessage(
  id: string,
  fn: (msg: ChatMessage) => ChatMessage,
  prev: ChatMessage[],
): ChatMessage[] {
  return prev.map(m => (m.id === id ? fn(m) : m))
}

export function useChat(onSaved?: (messages: ChatMessage[], llmHistory: LLMMessage[]) => void) {
  const [messages, setMessages]      = useState<ChatMessage[]>([])
  const [loading, setLoading]        = useState(false)
  const llmHistoryRef                = useRef<LLMMessage[]>([])
  const messagesRef                  = useRef<ChatMessage[]>([])
  const abortRef                     = useRef<AbortController | null>(null)
  const onSavedRef                   = useRef(onSaved)

  useEffect(() => { onSavedRef.current = onSaved }, [onSaved])

  // Keeps messagesRef in sync whenever state is updated via a functional updater.
  const syncedSet = useCallback((fn: (prev: ChatMessage[]) => ChatMessage[]) => {
    setMessages(prev => {
      const next = fn(prev)
      messagesRef.current = next
      return next
    })
  }, [setMessages])

  // Replace the current session with a previously saved conversation.
  const resetTo = useCallback((savedMessages: ChatMessage[], savedLlmHistory: LLMMessage[]) => {
    const clean = savedMessages.map(m => ({ ...m, streaming: false }))
    setMessages(clean)
    messagesRef.current = clean
    llmHistoryRef.current = savedLlmHistory
    setLoading(false)
  }, [setMessages])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return

    const userMsg: ChatMessage      = { id: crypto.randomUUID(), role: "user", content: text }
    const assistantId               = crypto.randomUUID()
    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "", streaming: true, toolEvents: [] }

    syncedSet(prev => [...prev, userMsg, assistantMsg])
    setLoading(true)
    abortRef.current = new AbortController()

    let savedSuccessfully = false

    try {
      const resp = await fetch(`${API_BASE}/api/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: text, history: llmHistoryRef.current }),
        signal:  abortRef.current.signal,
      })

      if (!resp.ok || !resp.body) throw new Error(`Server error ${resp.status}`)

      const reader  = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ""

      const patch = (fn: (msg: ChatMessage) => ChatMessage) =>
        syncedSet(prev => patchMessage(assistantId, fn, prev))

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const blocks = buffer.split("\n\n")
        buffer = blocks.pop() ?? ""

        for (const block of blocks.filter(Boolean)) {
          if (applyEvent(block, patch, llmHistoryRef)) savedSuccessfully = true
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return
      syncedSet(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: "Something went wrong. Please try again.", streaming: false } : m
      ))
    } finally {
      syncedSet(prev => prev.map(m =>
        m.id === assistantId ? { ...m, streaming: false } : m
      ))
      setLoading(false)
      if (savedSuccessfully) {
        onSavedRef.current?.(messagesRef.current, llmHistoryRef.current)
      }
    }
  }, [loading, syncedSet])

  return { messages, loading, sendMessage, resetTo }
}

// Returns true when the "done" event is processed (successful turn).
function applyEvent(
  block:         string,
  patch:         (fn: (msg: ChatMessage) => ChatMessage) => void,
  llmHistoryRef: { current: LLMMessage[] },
): boolean {
  let event = ""
  let data  = ""
  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7).trim()
    if (line.startsWith("data: "))  data  = line.slice(6).trim()
  }
  if (!event || !data) return false

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
      if (messages) llmHistoryRef.current = messages
      return true
    }
    case "error": {
      patch(m => ({ ...m, content: `Error: ${data}`, streaming: false }))
      break
    }
  }
  return false
}
