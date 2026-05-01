import { useState } from "react"
import type { ChatMessage, Conversation, LLMMessage } from "../lib/types"

const STORAGE_KEY = "rail-live-conversations"
const MAX_STORED  = 50

function loadFromStorage(): Conversation[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Conversation[]
  } catch {
    return []
  }
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>(loadFromStorage)

  function upsert(id: string, messages: ChatMessage[], llmHistory: LLMMessage[]) {
    const firstUser = messages.find(m => m.role === "user")?.content ?? "New conversation"
    const title = firstUser.length > 60 ? `${firstUser.slice(0, 57)}…` : firstUser

    setConversations(prev => {
      const existing = prev.find(c => c.id === id)
      const updated: Conversation = existing
        ? { ...existing, title, messages, llmHistory, updatedAt: Date.now() }
        : { id, title, createdAt: Date.now(), updatedAt: Date.now(), messages, llmHistory }
      const without = prev.filter(c => c.id !== id)
      const next = [updated, ...without].slice(0, MAX_STORED)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  function remove(id: string) {
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  return { conversations, upsert, remove }
}
