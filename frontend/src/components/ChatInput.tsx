import { useState, useRef, type KeyboardEvent } from "react"
import { ArrowUp } from "lucide-react"
import { cn } from "../lib/utils"

interface Props {
  readonly onSend: (text: string) => void
  readonly disabled: boolean
}

export function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const handleInput = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 160) + "px"
  }

  return (
    <div className="flex items-end gap-3 bg-white border border-claude-border rounded-2xl px-4 py-3 shadow-sm focus-within:border-claude-accent transition-colors">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onInput={handleInput}
        onKeyDown={handleKey}
        placeholder="Ask about journeys, delays, or stations…"
        rows={1}
        disabled={disabled}
        className="flex-1 resize-none bg-transparent text-sm text-claude-text placeholder:text-claude-muted outline-none leading-relaxed"
        style={{ minHeight: "24px" }}
      />
      <button
        onClick={submit}
        disabled={disabled || !text.trim()}
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all",
          text.trim() && !disabled
            ? "bg-claude-accent hover:bg-claude-accentHover text-white"
            : "bg-sand-200 text-sand-400 cursor-not-allowed",
        )}
        aria-label="Send"
      >
        <ArrowUp className="w-4 h-4" />
      </button>
    </div>
  )
}
