import type { ReactNode } from "react"
import { useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, Bot, Database, MonitorSmartphone, Network, Orbit, Wrench } from "lucide-react"

type Stop = {
  id: string
  label: string
  subtitle: string
  x: number
  y: number
  color: string
  icon: ReactNode
  notes: string[]
}

type Line = {
  id: string
  color: string
  stops: string[]
}

const STOPS: Stop[] = [
  {
    id: "client",
    label: "Client",
    subtitle: "prompt entry",
    x: 12,
    y: 24,
    color: "#38bdf8",
    icon: <MonitorSmartphone size={16} />,
    notes: ["Chat prompts", "Quick actions", "Dashboard taps"],
  },
  {
    id: "routing",
    label: "Routing",
    subtitle: "scope control",
    x: 28,
    y: 24,
    color: "#8b5cf6",
    icon: <Network size={16} />,
    notes: ["Network detection", "Date anchoring", "Argument repair"],
  },
  {
    id: "memory",
    label: "Session",
    subtitle: "short context",
    x: 28,
    y: 56,
    color: "#60a5fa",
    icon: <Orbit size={16} />,
    notes: ["Conversation memory", "Tool history", "Normalization"],
  },
  {
    id: "model",
    label: "Model Loop",
    subtitle: "selection engine",
    x: 47,
    y: 40,
    color: "#f59e0b",
    icon: <Bot size={16} />,
    notes: ["Tool choice", "Reasoning", "Response synthesis"],
  },
  {
    id: "tools",
    label: "MCP Tools",
    subtitle: "capability exchange",
    x: 66,
    y: 40,
    color: "#22c55e",
    icon: <Wrench size={16} />,
    notes: ["Eurostar", "TfL", "SNCF", "National Rail", "Paris RER"],
  },
  {
    id: "providers",
    label: "Live Providers",
    subtitle: "operational feeds",
    x: 84,
    y: 24,
    color: "#ec4899",
    icon: <Database size={16} />,
    notes: ["Schedules", "Passenger load", "Crew overlay"],
  },
  {
    id: "responses",
    label: "Responses",
    subtitle: "maps and boards",
    x: 84,
    y: 62,
    color: "#06b6d4",
    icon: <Orbit size={16} />,
    notes: ["Operations wall", "Command centers", "Prompt cards"],
  },
]

const LINES: Line[] = [
  { id: "request-line", color: "#38bdf8", stops: ["client", "routing", "model"] },
  { id: "context-line", color: "#8b5cf6", stops: ["routing", "memory", "model"] },
  { id: "tool-line", color: "#22c55e", stops: ["model", "tools", "providers"] },
  { id: "surface-line", color: "#06b6d4", stops: ["model", "tools", "responses"] },
]

function getStop(id: string) {
  return STOPS.find(stop => stop.id === id) ?? STOPS[0]
}

function linePath(stops: string[]) {
  const points = stops.map(getStop)
  if (points.length === 0) return ""
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let path = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]
    const curr = points[i]
    const midX = (prev.x + curr.x) / 2
    path += ` C ${midX} ${prev.y}, ${midX} ${curr.y}, ${curr.x} ${curr.y}`
  }
  return path
}

function MetroStop({
  stop,
  active,
  onHover,
}: {
  readonly stop: Stop
  readonly active: boolean
  readonly onHover: (id: string | null) => void
}) {
  const isRight = stop.x > 70
  return (
    <motion.button
      type="button"
      onMouseEnter={() => onHover(stop.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(stop.id)}
      onBlur={() => onHover(null)}
      className="absolute text-left"
      style={{
        left: `${stop.x}%`,
        top: `${stop.y}%`,
        transform: "translate(-50%, -50%)",
      }}
      animate={active ? { scale: 1.05 } : { scale: 1 }}
      transition={{ duration: 0.16 }}
    >
      <div className="relative flex items-center gap-3">
        <motion.div
          className="relative flex h-[26px] w-[26px] items-center justify-center rounded-full border-[4px] bg-[#08111e]"
          style={{
            borderColor: stop.color,
            boxShadow: active ? `0 0 24px ${stop.color}55` : "none",
          }}
        >
          <div className="h-[8px] w-[8px] rounded-full" style={{ background: stop.color }} />
        </motion.div>
        <div className="rounded-full bg-[rgba(8,17,30,0.88)] px-3 py-2 backdrop-blur-xl">
          <div className="text-sm font-black text-white">{stop.label}</div>
          <div className="text-[11px] text-white/52">{stop.subtitle}</div>
        </div>
      </div>

      <AnimatePresence>
        {active && (
          <motion.div
            className="pointer-events-none absolute top-1/2 z-20"
            style={{
              [isRight ? "right" : "left"]: "100%",
              marginRight: isRight ? "18px" : undefined,
              marginLeft: isRight ? undefined : "18px",
              transform: "translateY(-50%)",
            }}
            initial={{ opacity: 0, x: isRight ? -10 : 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: isRight ? -8 : 8 }}
            transition={{ duration: 0.16 }}
          >
            <div
              className="absolute top-1/2 h-px w-8 -translate-y-1/2"
              style={{
                [isRight ? "right" : "left"]: "-14px",
                background: `linear-gradient(${isRight ? "270deg" : "90deg"}, ${stop.color}, rgba(255,255,255,0.35))`,
              }}
            />
            <div className="min-w-[180px] rounded-[20px] border border-white/10 bg-[rgba(8,17,30,0.94)] px-4 py-3 shadow-[0_18px_40px_rgba(2,6,23,0.26)] backdrop-blur-xl">
              <div className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: stop.color }}>
                {stop.label}
              </div>
              <div className="mt-2 space-y-1.5">
                {stop.notes.map(note => (
                  <div key={note} className="flex items-center gap-2 text-sm text-white/84">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: stop.color }} />
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

export function SystemFlowPage({ onClose }: { readonly onClose: () => void }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const activeStop = useMemo(() => (activeId ? getStop(activeId) : null), [activeId])

  return (
    <div className="app-system-shell min-h-screen w-full bg-[#07111f] text-white">
      <div
        className="relative min-h-screen overflow-hidden"
        style={{
          background:
            "radial-gradient(circle at 18% 18%, rgba(125,211,252,0.1), transparent 22%), radial-gradient(circle at 82% 18%, rgba(167,139,250,0.1), transparent 20%), linear-gradient(180deg, #07111f 0%, #091523 100%)",
        }}
      >
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.24) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.24) 1px, transparent 1px)", backgroundSize: "80px 80px" }} />

        <div className="relative mx-auto max-w-[1500px] px-5 py-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/80"
              aria-label="Close system page"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-300">
              <Network size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-200">System</div>
              <h1 className="text-2xl font-black tracking-tight text-white">How Channex Works</h1>
            </div>
          </div>

          <section className="mt-8 overflow-hidden rounded-[38px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-4 shadow-[0_24px_80px_rgba(2,6,23,0.18)]">
            <div className="relative min-h-[920px] overflow-hidden rounded-[30px] border border-white/6 bg-[linear-gradient(180deg,rgba(8,14,26,0.78),rgba(4,8,16,0.92))]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.015),transparent_48%)]" />

              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {LINES.map(line => {
                  const active = activeStop ? line.stops.includes(activeStop.id) : false
                  const path = linePath(line.stops)
                  return (
                    <g key={line.id}>
                      <path
                        d={path}
                        fill="none"
                        stroke={line.color}
                        strokeWidth={active ? "2.8" : "2.2"}
                        opacity={active ? "1" : "0.78"}
                        strokeLinecap="round"
                      />
                      <motion.circle
                        r="0.9"
                        fill="#ffffff"
                        opacity={active ? 0.95 : 0.72}
                        style={{ filter: `drop-shadow(0 0 6px ${line.color})` }}
                      >
                        <animateMotion
                          dur={active ? "2.4s" : "4.6s"}
                          repeatCount="indefinite"
                          path={path}
                        />
                      </motion.circle>
                      <motion.circle
                        r="0.65"
                        fill={line.color}
                        opacity={active ? 0.9 : 0.6}
                        style={{ filter: `drop-shadow(0 0 8px ${line.color})` }}
                      >
                        <animateMotion
                          dur={active ? "3.2s" : "5.4s"}
                          repeatCount="indefinite"
                          path={path}
                        />
                      </motion.circle>
                    </g>
                  )
                })}
              </svg>

              {STOPS.map(stop => (
                <MetroStop key={stop.id} stop={stop} active={stop.id === activeId} onHover={setActiveId} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
