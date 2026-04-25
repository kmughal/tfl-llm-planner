import { Wrench, CheckCircle } from "lucide-react"
import type { ToolEvent } from "../lib/types"

const TOOL_LABELS: Record<string, string> = {
  plan_journey:    "Planning journey",
  get_line_status: "Checking line status",
  search_stops:    "Searching stops",
}

export function ToolCallBadge({ event }: { readonly event: ToolEvent }) {
  const label = TOOL_LABELS[event.name] ?? event.name

  if (event.type === "tool_call") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-claude-muted bg-sand-100 border border-claude-border rounded-full px-2.5 py-1 animate-fade-in">
        <Wrench className="w-3 h-3 animate-pulse" />
        {label}…
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-claude-muted bg-sand-100 border border-claude-border rounded-full px-2.5 py-1 animate-fade-in">
      <CheckCircle className="w-3 h-3 text-green-500" />
      {label}
    </span>
  )
}
