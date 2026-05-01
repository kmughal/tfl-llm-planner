import { useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Plus, Trash2, MessageSquare } from "lucide-react"
import type { Conversation } from "../lib/types"

interface Props {
  readonly open: boolean
  readonly conversations: Conversation[]
  readonly activeId: string
  readonly onNew: () => void
  readonly onSelect: (id: string) => void
  readonly onDelete: (id: string) => void
  readonly onClose: () => void
}

// ── Date grouping ─────────────────────────────────────────────────────────────

interface Group { label: string; items: Conversation[] }

function groupConversations(convs: Conversation[]): Group[] {
  const todayStart     = new Date().setHours(0, 0, 0, 0)
  const yesterdayStart = todayStart - 86_400_000
  const weekStart      = todayStart - 7 * 86_400_000

  const groups: Group[] = [
    { label: "Today",       items: [] },
    { label: "Yesterday",   items: [] },
    { label: "Last 7 days", items: [] },
    { label: "Earlier",     items: [] },
  ]

  for (const c of convs) {
    if      (c.updatedAt >= todayStart)     groups[0].items.push(c)
    else if (c.updatedAt >= yesterdayStart) groups[1].items.push(c)
    else if (c.updatedAt >= weekStart)      groups[2].items.push(c)
    else                                    groups[3].items.push(c)
  }

  return groups.filter(g => g.items.length > 0)
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000)      return "just now"
  if (diff < 3_600_000)   return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000)  return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

// ── Conversation item ─────────────────────────────────────────────────────────

function ConvItem({
  conv, isActive, onSelect, onDelete,
}: {
  readonly conv: Conversation
  readonly isActive: boolean
  readonly onSelect: () => void
  readonly onDelete: () => void
}) {
  return (
    <motion.button
      onClick={onSelect}
      className="group relative w-full text-left px-3 py-2.5 rounded-lg flex items-start gap-2.5 transition-colors"
      style={{
        background: isActive ? "rgba(255,255,255,0.12)" : "transparent",
      }}
      whileHover={{ background: isActive ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)" }}
    >
      <MessageSquare
        style={{ width: 14, height: 14, color: isActive ? "#a5b4fc" : "#6b7280", flexShrink: 0, marginTop: 2 }}
      />
      <div className="flex-1 min-w-0">
        <p
          className="text-[12px] leading-snug truncate"
          style={{ color: isActive ? "#e0e7ff" : "#d1d5db", fontWeight: isActive ? 500 : 400 }}
        >
          {conv.title}
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: "#6b7280" }}>
          {relativeTime(conv.updatedAt)}
        </p>
      </div>

      {/* Delete button — appears on hover */}
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded"
        style={{ color: "#6b7280" }}
        aria-label="Delete conversation"
      >
        <Trash2 style={{ width: 12, height: 12 }} />
      </button>
    </motion.button>
  )
}

// ── Main sidebar ──────────────────────────────────────────────────────────────

export function ConversationSidebar({ open, conversations, activeId, onNew, onSelect, onDelete, onClose }: Props) {
  const groups = groupConversations(conversations)
  const panelRef = useRef<HTMLDivElement>(null)

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-30"
            style={{ background: "rgba(0,0,0,0.4)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            className="fixed left-0 top-0 bottom-0 z-40 flex flex-col"
            style={{ width: 272, background: "#111827", borderRight: "1px solid rgba(255,255,255,0.08)" }}
            initial={{ x: -272 }}
            animate={{ x: 0 }}
            exit={{ x: -272 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <span className="text-[13px] font-semibold" style={{ color: "#f9fafb" }}>Conversations</span>
              <button
                onClick={onClose}
                className="p-1 rounded-md transition-colors"
                style={{ color: "#6b7280" }}
                aria-label="Close sidebar"
              >
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {/* New conversation button */}
            <div className="px-3 pt-3 pb-2">
              <button
                onClick={onNew}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium transition-colors"
                style={{ background: "rgba(99,102,241,0.18)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.25)" }}
              >
                <Plus style={{ width: 14, height: 14 }} />
                New conversation
              </button>
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto px-2 pb-4">
              {groups.length === 0 ? (
                <p className="text-center text-[11px] py-8" style={{ color: "#4b5563" }}>
                  No conversations yet
                </p>
              ) : (
                groups.map(group => (
                  <div key={group.label} className="mb-3">
                    <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#4b5563" }}>
                      {group.label}
                    </p>
                    {group.items.map(conv => (
                      <ConvItem
                        key={conv.id}
                        conv={conv}
                        isActive={conv.id === activeId}
                        onSelect={() => onSelect(conv.id)}
                        onDelete={() => onDelete(conv.id)}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
