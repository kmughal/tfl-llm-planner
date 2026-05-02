import { useEffect, useRef, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Trash2, Pause, Play, ArrowDown, X } from "lucide-react"
import { cn } from "../lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────
interface LogEntry {
  id:    string
  ts:    string
  level: "info" | "warn" | "error" | "debug"
  tag:   "system" | "http" | "llm" | "tool" | "mcp"
  msg:   string
  data?: string
}

// ── Style maps ────────────────────────────────────────────────────────────────
const LEVEL_DOT: Record<string, string> = {
  info:  "#60a5fa",
  warn:  "#fbbf24",
  error: "#f87171",
  debug: "#4b5563",
}

const TAG_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  tool:   { bg: "#2e1065", text: "#c4b5fd", border: "#6d28d9" },
  llm:    { bg: "#022c22", text: "#6ee7b7", border: "#065f46" },
  http:   { bg: "#0c2847", text: "#7dd3fc", border: "#0369a1" },
  system: { bg: "#111827", text: "#9ca3af", border: "#374151" },
  mcp:    { bg: "#27150a", text: "#fdba74", border: "#92400e" },
}

const LEVEL_TEXT: Record<string, string> = {
  info:  "#93c5fd",
  warn:  "#fbbf24",
  error: "#fca5a5",
  debug: "#6b7280",
}

const TAG_LABELS = ["all", "tool", "llm", "http", "system", "mcp"] as const
type TagFilter = (typeof TAG_LABELS)[number]

// ── Single log row ────────────────────────────────────────────────────────────
function LogRow({ entry, index }: { readonly entry: LogEntry; readonly index: number }) {
  const [expanded, setExpanded] = useState(false)
  const tag  = TAG_STYLE[entry.tag]  ?? TAG_STYLE.system
  const dot  = LEVEL_DOT[entry.level] ?? LEVEL_DOT.info
  const text = LEVEL_TEXT[entry.level] ?? LEVEL_TEXT.info

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 24, backgroundColor: "#1e293b" }}
      animate={{ opacity: 1, x: 0, backgroundColor: "transparent" }}
      transition={{ duration: 0.28, delay: Math.min(index * 0.015, 0.3), ease: "easeOut" }}
      className="group border-b"
      style={{ borderColor: "#1e293b" }}
    >
      <button
        type="button"
        onClick={() => entry.data ? setExpanded(v => !v) : undefined}
        className={cn(
          "w-full text-left px-4 py-2 flex items-start gap-3 font-mono text-[11px]",
          entry.data ? "cursor-pointer hover:bg-white/[0.03]" : "cursor-default",
        )}
      >
        {/* Timestamp */}
        <span className="shrink-0 tabular-nums" style={{ color: "#4b5563", minWidth: 80 }}>
          {entry.ts}
        </span>

        {/* Level dot */}
        <span
          className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
          style={{ backgroundColor: dot }}
        />

        {/* Tag badge */}
        <span
          className="shrink-0 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded mt-0.5 leading-none"
          style={{ backgroundColor: tag.bg, color: tag.text, border: `1px solid ${tag.border}` }}
        >
          {entry.tag}
        </span>

        {/* Message */}
        <span className="flex-1 leading-relaxed break-all" style={{ color: text }}>
          {entry.msg}
        </span>

        {/* Expand indicator */}
        {entry.data && (
          <motion.span
            className="shrink-0 text-[9px] font-bold"
            style={{ color: "#4b5563" }}
            animate={{ rotate: expanded ? 90 : 0 }}
          >
            ▶
          </motion.span>
        )}
      </button>

      {/* Expanded data payload */}
      <AnimatePresence>
        {expanded && entry.data && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <pre
              className="px-4 pb-3 text-[10px] leading-relaxed break-all whitespace-pre-wrap font-mono"
              style={{ color: "#6b7280", borderLeft: `2px solid ${tag.border}`, marginLeft: 150 }}
            >
              {entry.data}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function LogsPage({ onClose }: { readonly onClose: () => void }) {
  const [entries, setEntries]     = useState<LogEntry[]>([])
  const [filter, setFilter]       = useState<TagFilter>("all")
  const [search, setSearch]       = useState("")
  const [paused, setPaused]       = useState(false)
  const [connected, setConnected] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)

  const pauseRef    = useRef(false)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const esRef       = useRef<EventSource | null>(null)
  const pendingRef  = useRef<LogEntry[]>([])

  // Flush pending entries when unpaused
  const flush = useCallback(() => {
    if (pendingRef.current.length === 0) return
    setEntries(prev => [...prev, ...pendingRef.current].slice(-2000))
    pendingRef.current = []
  }, [])

  useEffect(() => {
    const backendURL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8080"
    const es = new EventSource(`${backendURL}/api/logs/stream`)
    esRef.current = es

    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)

    es.onmessage = (ev) => {
      try {
        const entry: LogEntry = JSON.parse(ev.data)
        if (pauseRef.current) {
          pendingRef.current.push(entry)
        } else {
          setEntries(prev => [...prev, entry].slice(-2000))
        }
      } catch {
        // ignore malformed
      }
    }

    return () => { es.close(); setConnected(false) }
  }, [])

  // Keep pauseRef in sync
  useEffect(() => { pauseRef.current = paused }, [paused])

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && !paused) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [entries, autoScroll, paused])

  const handlePauseToggle = () => {
    if (paused) {
      flush()
    }
    setPaused(v => !v)
  }

  const visible = entries.filter(e => {
    if (filter !== "all" && e.tag !== filter) return false
    if (search && !e.msg.toLowerCase().includes(search.toLowerCase()) &&
        !(e.data ?? "").toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const counts = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.tag] = (acc[e.tag] ?? 0) + 1
    return acc
  }, {})

  return (
    <div
      className="flex flex-col h-screen w-full"
      style={{ background: "#060b12", color: "#e2e8f0" }}
    >
      {/* ── Top bar ── */}
      <div
        className="flex items-center gap-3 px-5 py-3 shrink-0"
        style={{ borderBottom: "1px solid #1e293b", background: "#0a0f1a" }}
      >
        {/* Back */}
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-white/10"
          aria-label="Close logs"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">
            Dev Logs
          </span>
          {/* Connection dot */}
          <div className="flex items-center gap-1.5">
            <motion.span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{ backgroundColor: connected ? "#10b981" : "#ef4444" }}
              animate={connected ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
              transition={{ repeat: Infinity, duration: 1.6 }}
            />
            <span className="text-[10px]" style={{ color: connected ? "#10b981" : "#ef4444" }}>
              {connected ? "connected" : "disconnected"}
            </span>
          </div>
        </div>

        {/* Entry count */}
        <span className="text-[10px] font-mono" style={{ color: "#4b5563" }}>
          {visible.length} / {entries.length} entries
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search */}
        <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: "#111827", border: "1px solid #1f2937" }}>
          <Search className="w-3 h-3" style={{ color: "#4b5563" }} />
          <input
            type="text"
            placeholder="search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent outline-none text-[11px] w-32 font-mono"
            style={{ color: "#9ca3af" }}
          />
          {search && (
            <button type="button" onClick={() => setSearch("")}>
              <X className="w-3 h-3" style={{ color: "#4b5563" }} />
            </button>
          )}
        </div>

        {/* Auto-scroll */}
        <button
          type="button"
          onClick={() => setAutoScroll(v => !v)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-colors"
          style={{
            background: autoScroll ? "#0c2847" : "#111827",
            color: autoScroll ? "#7dd3fc" : "#4b5563",
            border: `1px solid ${autoScroll ? "#0369a1" : "#1f2937"}`,
          }}
        >
          <ArrowDown className="w-3 h-3" />
          Auto
        </button>

        {/* Pause / Resume */}
        <button
          type="button"
          onClick={handlePauseToggle}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-colors"
          style={{
            background: paused ? "#27150a" : "#111827",
            color: paused ? "#fdba74" : "#4b5563",
            border: `1px solid ${paused ? "#92400e" : "#1f2937"}`,
          }}
        >
          {paused
            ? <><Play  className="w-3 h-3" /> Resume {pendingRef.current.length > 0 && `(+${pendingRef.current.length})`}</>
            : <><Pause className="w-3 h-3" /> Pause</>
          }
        </button>

        {/* Clear */}
        <button
          type="button"
          onClick={() => setEntries([])}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-colors hover:bg-white/5"
          style={{ color: "#4b5563", border: "1px solid #1f2937" }}
        >
          <Trash2 className="w-3 h-3" />
          Clear
        </button>
      </div>

      {/* ── Tag filter tabs ── */}
      <div
        className="flex items-center gap-1 px-5 py-2 overflow-x-auto shrink-0"
        style={{ borderBottom: "1px solid #1e293b", background: "#08101a" }}
      >
        {TAG_LABELS.map(tag => {
          const active = filter === tag
          const count = tag === "all" ? entries.length : (counts[tag] ?? 0)
          const style = tag !== "all" ? (TAG_STYLE[tag] ?? TAG_STYLE.system) : null
          return (
            <button
              key={tag}
              type="button"
              onClick={() => setFilter(tag)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all shrink-0"
              style={{
                background: active
                  ? (style?.bg ?? "#1e293b")
                  : "transparent",
                color: active
                  ? (style?.text ?? "#9ca3af")
                  : "#4b5563",
                border: `1px solid ${active ? (style?.border ?? "#374151") : "transparent"}`,
              }}
            >
              {tag}
              {count > 0 && (
                <span
                  className="tabular-nums rounded-full px-1.5 py-0.5 text-[8px] leading-none"
                  style={{ background: active ? "rgba(255,255,255,0.12)" : "#1e293b", color: active ? style?.text ?? "#9ca3af" : "#4b5563" }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Log entries ── */}
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <motion.div
              animate={{ opacity: [0.3, 0.8, 0.3] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="text-4xl"
            >
              📡
            </motion.div>
            <p className="text-xs font-mono" style={{ color: "#374151" }}>
              {connected ? "waiting for events…" : "connecting to backend…"}
            </p>
          </div>
        ) : (
          <div>
            {visible.map((entry, i) => (
              <LogRow key={entry.id} entry={entry} index={i} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Status bar ── */}
      <div
        className="flex items-center gap-4 px-5 py-1.5 shrink-0 font-mono text-[9px]"
        style={{ borderTop: "1px solid #1e293b", background: "#0a0f1a", color: "#374151" }}
      >
        <span>tool: {counts.tool ?? 0}</span>
        <span>llm: {counts.llm ?? 0}</span>
        <span>http: {counts.http ?? 0}</span>
        <span>mcp: {counts.mcp ?? 0}</span>
        <span>system: {counts.system ?? 0}</span>
        <span className="ml-auto">max 2000 entries · ring buffer 500</span>
      </div>
    </div>
  )
}
