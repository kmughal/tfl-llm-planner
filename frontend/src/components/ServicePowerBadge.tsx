import { motion } from "framer-motion"
import { Lightbulb, LightbulbOff } from "lucide-react"

export function ServicePowerBadge({
  enabled,
  label,
  compact = false,
}: {
  readonly enabled: boolean
  readonly label?: string
  readonly compact?: boolean
}) {
  const Icon = enabled ? Lightbulb : LightbulbOff
  const bg = enabled ? "rgba(34,197,94,.12)" : "rgba(239,68,68,.12)"
  const border = enabled ? "rgba(34,197,94,.28)" : "rgba(239,68,68,.28)"
  const text = enabled ? "#16a34a" : "#dc2626"

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${compact ? "" : ""}`}
      style={{ background: bg, borderColor: border, color: text }}
    >
      <motion.span
        className="relative flex h-4 w-4 items-center justify-center"
        animate={enabled ? { opacity: [0.75, 1, 0.75] } : { opacity: [0.45, 0.85, 0.45] }}
        transition={{ duration: enabled ? 1.8 : 1.1, repeat: Infinity, ease: "easeInOut" }}
      >
        <Icon size={12} />
      </motion.span>
      {label ?? (enabled ? "Service on" : "Service off")}
    </div>
  )
}

export function DisabledServiceBanner({
  message,
}: {
  readonly message: string
}) {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-red-300/70 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
      <motion.span
        className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-red-600"
        animate={{ opacity: [0.45, 1, 0.45], scale: [1, 0.96, 1] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
      >
        <LightbulbOff size={16} />
      </motion.span>
      <div>
        <div className="font-black uppercase tracking-[0.16em]">Service disabled</div>
        <div className="mt-0.5">{message}</div>
      </div>
    </div>
  )
}
