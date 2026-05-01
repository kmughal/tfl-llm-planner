import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react"
import { ArrowUp, Mic, MicOff } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "../lib/utils"
import { useVoiceInput } from "../hooks/useVoiceInput"

interface Props {
  readonly onSend:   (text: string) => void
  readonly disabled: boolean
  readonly prefill?: string
}

// ── Animated waveform bars ────────────────────────────────────────────────────
const BAR_CONFIG = [
  { id: "b0", dur: 0.45, delay: 0    },
  { id: "b1", dur: 0.6,  delay: 0.08 },
  { id: "b2", dur: 0.38, delay: 0.16 },
  { id: "b3", dur: 0.52, delay: 0.04 },
  { id: "b4", dur: 0.44, delay: 0.2  },
  { id: "b5", dur: 0.58, delay: 0.12 },
  { id: "b6", dur: 0.4,  delay: 0.24 },
  { id: "b7", dur: 0.5,  delay: 0.06 },
  { id: "b8", dur: 0.35, delay: 0.18 },
]

function WaveformBars({ active }: { readonly active: boolean }) {
  return (
    <div className="flex items-center gap-[3px]" style={{ height: 28 }}>
      {BAR_CONFIG.map((b) => (
        <motion.span
          key={b.id}
          style={{
            display: "inline-block",
            width: 3,
            borderRadius: 4,
            backgroundColor: "#e32017",
            transformOrigin: "center",
          }}
          animate={active
            ? { scaleY: [0.15, 0.9, 0.3, 1, 0.2, 0.75, 0.15], height: 28 }
            : { scaleY: 0.12, height: 28 }
          }
          transition={active
            ? { duration: b.dur, delay: b.delay, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.25 }
          }
        />
      ))}
    </div>
  )
}

// ── Ripple rings ──────────────────────────────────────────────────────────────
function RippleRings() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {[0, 0.4, 0.8].map((delay) => (
        <motion.span
          key={delay}
          className="absolute rounded-full border border-red-400"
          style={{ width: 40, height: 40 }}
          animate={{ scale: [1, 2.6], opacity: [0.5, 0] }}
          transition={{ duration: 1.4, delay, repeat: Infinity, ease: "easeOut" }}
        />
      ))}
    </div>
  )
}

// ── Voice overlay panel ───────────────────────────────────────────────────────
function VoicePanel({
  interim,
  onStop,
}: {
  readonly interim: string
  readonly onStop: () => void
}) {
  return (
    <motion.div
      className="absolute left-0 right-0 bottom-full mb-3 z-50"
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 360, damping: 28 }}
    >
      <div
        className="mx-auto rounded-2xl border border-red-100 shadow-xl overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.96)",
          backdropFilter: "blur(16px)",
          maxWidth: 480,
        }}
      >
        {/* Red gradient top strip */}
        <div style={{
          height: 3,
          background: "linear-gradient(to right, #e32017, #ff6b6b, #e32017)",
          backgroundSize: "200% 100%",
        }}>
          <motion.div
            style={{ height: "100%", background: "inherit", backgroundSize: "inherit" }}
            animate={{ backgroundPosition: ["0% 0%", "200% 0%"] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />
        </div>

        <div className="px-5 py-4 flex flex-col items-center gap-4">
          {/* Mic + rings row */}
          <div className="flex items-center gap-5">
            {/* Mic button with ripples */}
            <button
              type="button"
              onClick={onStop}
              className="relative flex items-center justify-center w-12 h-12 rounded-full bg-red-500 text-white shadow-lg shadow-red-200 shrink-0"
              aria-label="Stop recording"
            >
              <RippleRings />
              <MicOff className="w-5 h-5 relative z-10" />
            </button>

            {/* Waveform */}
            <WaveformBars active />
          </div>

          {/* Live transcript */}
          <div className="w-full min-h-[28px] text-center">
            <AnimatePresence mode="wait">
              {interim ? (
                <motion.p
                  key={interim}
                  className="text-sm text-gray-700 font-medium leading-snug"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {interim}
                </motion.p>
              ) : (
                <motion.p
                  key="hint"
                  className="text-xs text-gray-400 flex items-center justify-center gap-1.5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.span
                    className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block"
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                  Listening — speak now
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <p className="text-[10px] text-gray-300">Tap the mic to stop</p>
        </div>
      </div>
    </motion.div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function ChatInput({ onSend, disabled, prefill }: Props) {
  const [text, setText]   = useState("")
  const textareaRef       = useRef<HTMLTextAreaElement>(null)
  const lastPrefillRef    = useRef("")

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

  const handleTranscript = useCallback((transcript: string) => {
    resizeTextarea(transcript)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [])

  const { isSupported, isListening, interim, error, start, stop } = useVoiceInput(handleTranscript)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        {/* Voice panel — sits above the input bar */}
        <AnimatePresence>
          {isListening && (
            <VoicePanel interim={interim} onStop={stop} />
          )}
        </AnimatePresence>

        <div className={cn(
          "flex items-end gap-3 bg-white border rounded-2xl px-4 py-3 shadow-sm transition-colors duration-200",
          isListening
            ? "border-red-300 ring-2 ring-red-100"
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

          {isSupported && (
            <button
              type="button"
              onClick={isListening ? stop : start}
              disabled={disabled}
              className={cn(
                "relative flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200",
                isListening
                  ? "bg-red-500 text-white shadow-md shadow-red-200"
                  : "text-claude-muted hover:text-claude-text hover:bg-sand-100 disabled:opacity-40",
              )}
              aria-label={isListening ? "Stop recording" : "Speak your question"}
            >
              {isListening && (
                <motion.span
                  className="absolute inset-0 rounded-full bg-red-400"
                  animate={{ scale: [1, 1.5], opacity: [0.4, 0] }}
                  transition={{ duration: 1, repeat: Infinity, ease: "easeOut" }}
                />
              )}
              {isListening
                ? <MicOff className="w-4 h-4 relative z-10" />
                : <Mic className="w-4 h-4" />
              }
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
      </div>

      {error && (
        <p className="text-xs text-red-500 px-1">{error}</p>
      )}
    </div>
  )
}
