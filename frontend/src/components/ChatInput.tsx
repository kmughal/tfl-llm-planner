import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react"
import { ArrowUp, Mic, MicOff } from "lucide-react"
import { cn } from "../lib/utils"
import { useVoiceInput } from "../hooks/useVoiceInput"

interface Props {
  readonly onSend:   (text: string) => void
  readonly disabled: boolean
  readonly prefill?: string
}

export function ChatInput({ onSend, disabled, prefill }: Props) {
  const [text, setText]   = useState("")
  const textareaRef       = useRef<HTMLTextAreaElement>(null)
  const lastPrefillRef    = useRef("")

  // When a template suggestion is clicked, fill the input and select the
  // first {placeholder} so the user can start typing immediately.
  useEffect(() => {
    if (!prefill || prefill === lastPrefillRef.current) return
    lastPrefillRef.current = prefill
    setText(prefill)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.style.height = "auto"
      el.style.height = Math.min(el.scrollHeight, 160) + "px"
      const start = prefill.indexOf("{")
      const end   = prefill.indexOf("}") + 1
      if (start !== -1 && end > start) el.setSelectionRange(start, end)
    })
  }, [prefill])

  const resizeTextarea = (value: string) => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 160) + "px"
    setText(value)
  }

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText("")
    lastPrefillRef.current = ""
    if (textareaRef.current) textareaRef.current.style.height = "auto"
  }

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit() }
  }

  // Voice: fill textarea with transcript and focus so user can review before sending
  const handleTranscript = useCallback((transcript: string) => {
    resizeTextarea(transcript)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [])

  const { isSupported, isListening, error, start, stop } = useVoiceInput(handleTranscript)

  return (
    <div className="flex flex-col gap-1.5">
      <div className={cn(
        "flex items-end gap-3 bg-white border rounded-2xl px-4 py-3 shadow-sm transition-colors",
        isListening
          ? "border-red-400 ring-2 ring-red-100"
          : "border-claude-border focus-within:border-claude-accent",
      )}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => resizeTextarea(e.target.value)}
          onKeyDown={handleKey}
          placeholder={isListening ? "Listening…" : "Ask about journeys, delays, or stations…"}
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none bg-transparent text-sm text-claude-text placeholder:text-claude-muted outline-none leading-relaxed"
          style={{ minHeight: "24px" }}
        />

        {/* Mic button — hidden on browsers that don't support SpeechRecognition */}
        {isSupported && (
          <button
            type="button"
            onClick={isListening ? stop : start}
            disabled={disabled}
            className={cn(
              "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all",
              isListening
                ? "bg-red-500 text-white animate-pulse shadow-md shadow-red-200"
                : "text-claude-muted hover:text-claude-text hover:bg-sand-100 disabled:opacity-40",
            )}
            aria-label={isListening ? "Stop recording" : "Speak your question"}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        )}

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

      {/* Permission / error hint */}
      {error && (
        <p className="text-xs text-red-500 px-1">{error}</p>
      )}
    </div>
  )
}
