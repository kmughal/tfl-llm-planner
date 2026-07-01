import { motion, AnimatePresence } from "framer-motion"
import { X, LayoutDashboard, Map, Users, Cloud, Train, Zap, Globe, CalendarRange, Cpu, Bell } from "lucide-react"
import { EurostarDisplayMenu, EurostarDisplayStyles, eurostarDisplayClass, useEurostarDisplay } from "./EurostarDisplay"

const NAVY = "#003366"
const GOLD = "#C89A0C"

type Action = {
  icon: React.ReactNode
  label: string
  sublabel: string
  query: string
  accent: string
}

const ACTIONS: Action[] = [
  {
    icon: <LayoutDashboard style={{ width: 20, height: 20 }} />,
    label: "Live Dashboard",
    sublabel: "Real-time status & operations",
    query: "Show me the Eurostar live dashboard",
    accent: NAVY,
  },
  {
    icon: <Map style={{ width: 20, height: 20 }} />,
    label: "Live Map",
    sublabel: "Trains moving across the network",
    query: "Show me the Eurostar live map",
    accent: "#0055cc",
  },
  {
    icon: <Users style={{ width: 20, height: 20 }} />,
    label: "Passenger Load",
    sublabel: "Seat availability & capacity",
    query: "Show me Eurostar passenger load and seat availability",
    accent: "#1a3a6b",
  },
  {
    icon: <Train style={{ width: 20, height: 20 }} />,
    label: "Next to Paris",
    sublabel: "Upcoming London → Paris departures",
    query: "When is the next Eurostar from London to Paris?",
    accent: "#c00014",
  },
  {
    icon: <Train style={{ width: 20, height: 20 }} />,
    label: "Next to Brussels",
    sublabel: "Upcoming London → Brussels departures",
    query: "When is the next Eurostar from London to Brussels?",
    accent: "#1a5276",
  },
  {
    icon: <Globe style={{ width: 20, height: 20 }} />,
    label: "Next to Amsterdam",
    sublabel: "Upcoming London → Amsterdam departures",
    query: "When is the next Eurostar from London to Amsterdam?",
    accent: "#154360",
  },
  {
    icon: <Zap style={{ width: 20, height: 20 }} />,
    label: "Disruptions",
    sublabel: "Delays, cancellations & alerts",
    query: "Show all delayed, cancelled, or disrupted Eurostar services today",
    accent: "#7d3c0e",
  },
  {
    icon: <Cloud style={{ width: 20, height: 20 }} />,
    label: "Weather Both Ends",
    sublabel: "London + Paris conditions now",
    query: "What's the weather in London and Paris right now?",
    accent: "#1a5276",
  },
]

export function EurostarHub({
  onClose,
  onSend,
  onSchedule,
  onProjectionJourney,
  onCommandCenter,
  onLoadAnalytics,
  onNotifications,
}: {
  readonly onClose:          () => void
  readonly onSend:           (msg: string) => void
  readonly onSchedule:       () => void
  readonly onProjectionJourney?: () => void
  readonly onCommandCenter?: () => void
  readonly onLoadAnalytics?: () => void
  readonly onNotifications?: () => void
}) {
  const { theme, compact } = useEurostarDisplay()
  function handleAction(query: string) {
    onClose()
    onSend(query)
  }

  return (
    <AnimatePresence>
      <motion.div
        key="eurostar-hub-backdrop"
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
        style={{ background: "rgba(1,5,16,0.75)", backdropFilter: "blur(8px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      >
        <motion.div
          key="eurostar-hub-panel"
          className={`${eurostarDisplayClass(theme, compact)} es-themed-panel es-legacy-dark relative w-full max-w-2xl max-h-[88vh] overflow-hidden flex flex-col rounded-lg`}
          style={{
            background: "rgba(6,12,30,0.96)",
            border: "1px solid rgba(0,51,102,0.5)",
            boxShadow: "0 32px 80px rgba(0,20,80,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
          }}
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.97 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          onClick={e => e.stopPropagation()}
        >
          <EurostarDisplayStyles />
          {/* Header */}
          <div
            className="flex items-center gap-3 px-5 py-4 border-b shrink-0"
            style={{ borderColor: "rgba(0,51,102,0.4)" }}
          >
            <div
              className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
              style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #0055cc 100%)` }}
            >
              <Train className="text-white" style={{ width: 18, height: 18 }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm" style={{ color: "rgba(255,255,255,0.95)" }}>
                Eurostar Hub
              </p>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                Quick access to live data &amp; tools
              </p>
            </div>
            <div
              className="h-1 w-16 rounded-full hidden sm:block"
              style={{ background: `linear-gradient(90deg, ${GOLD}, transparent)` }}
            />
            <EurostarDisplayMenu inverted={theme !== "light"} />
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors shrink-0"
              style={{ color: "rgba(255,255,255,0.4)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              aria-label="Close Eurostar hub"
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>

          <div className="overflow-y-auto p-4 flex flex-col gap-3">
            {/* ── Featured: Command Center ── */}
            {onCommandCenter && (
              <motion.button
                type="button"
                onClick={() => { onClose(); onCommandCenter() }}
                className="es-preserve-inverse w-full flex items-center gap-4 p-4 rounded-lg text-left"
                style={{
                  background: "linear-gradient(135deg, rgba(10,25,60,0.7) 0%, rgba(0,60,140,0.45) 100%)",
                  border: "1px solid rgba(0,130,255,0.4)",
                }}
                whileHover={{ scale: 1.015, borderColor: "rgba(0,160,255,0.6)" }}
                whileTap={{ scale: 0.985 }}
                transition={{ duration: 0.15 }}
              >
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-xl shrink-0"
                  style={{ background: "rgba(0,100,220,0.25)", border: "1px solid rgba(0,150,255,0.3)" }}
                >
                  <Cpu style={{ width: 22, height: 22, color: "#22d3ee" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm" style={{ color: "rgba(255,255,255,0.95)" }}>
                    Operational Dashboard
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                    All trains & crew for today · auto-refreshing · full screen
                  </p>
                </div>
                <div
                  className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
                  style={{ background: "rgba(0,160,255,0.15)", color: "#22d3ee", border: "1px solid rgba(0,160,255,0.3)" }}
                >
                  Open →
                </div>
              </motion.button>
            )}

            {/* ── Featured: Train Schedule ── */}
            <motion.button
              type="button"
              onClick={onSchedule}
              className="es-preserve-inverse w-full flex items-center gap-4 p-4 rounded-lg text-left"
              style={{
                background: `linear-gradient(135deg, rgba(0,51,102,0.55) 0%, rgba(0,80,180,0.35) 100%)`,
                border: "1px solid rgba(0,100,220,0.35)",
              }}
              whileHover={{ scale: 1.015, borderColor: "rgba(0,120,255,0.5)" }}
              whileTap={{ scale: 0.985 }}
              transition={{ duration: 0.15 }}
            >
              <div
                className="flex items-center justify-center w-12 h-12 rounded-xl shrink-0"
                style={{ background: "rgba(0,80,200,0.35)", border: "1px solid rgba(0,120,255,0.3)" }}
              >
                <CalendarRange style={{ width: 22, height: 22, color: "#7eaaff" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm" style={{ color: "rgba(255,255,255,0.95)" }}>
                  Train Schedule
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                  Browse all trains by date · pick any day · tap for full stop detail
                </p>
              </div>
              <div
                className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
                style={{ background: "rgba(0,100,220,0.25)", color: "#7eaaff", border: "1px solid rgba(0,120,255,0.25)" }}
              >
                Live →
              </div>
            </motion.button>

            {onProjectionJourney && (
              <motion.button
                type="button"
                onClick={() => { onClose(); onProjectionJourney() }}
                className="es-preserve-inverse w-full flex items-center gap-4 p-4 rounded-lg text-left"
                style={{
                  background: "linear-gradient(135deg, rgba(3,37,65,0.76) 0%, rgba(8,145,178,0.22) 100%)",
                  border: "1px solid rgba(34,211,238,0.26)",
                }}
                whileHover={{ scale: 1.015, borderColor: "rgba(34,211,238,0.46)" }}
                whileTap={{ scale: 0.985 }}
                transition={{ duration: 0.15 }}
              >
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-xl shrink-0"
                  style={{ background: "rgba(34,211,238,0.14)", border: "1px solid rgba(34,211,238,0.22)" }}
                >
                  <Map style={{ width: 22, height: 22, color: "#67e8f9" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm" style={{ color: "rgba(255,255,255,0.95)" }}>
                    Journey Story
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                    Projection-only stop story with schedule, GPS and beacon detail
                  </p>
                </div>
                <div
                  className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
                  style={{ background: "rgba(34,211,238,0.12)", color: "#67e8f9", border: "1px solid rgba(34,211,238,0.22)" }}
                >
                  New →
                </div>
              </motion.button>
            )}

            {onLoadAnalytics && (
              <motion.button
                type="button"
                onClick={() => { onClose(); onLoadAnalytics() }}
                className="es-preserve-inverse w-full flex items-center gap-4 p-4 rounded-lg text-left"
                style={{
                  background: "linear-gradient(135deg, rgba(56,33,0,0.68) 0%, rgba(200,154,12,0.22) 100%)",
                  border: "1px solid rgba(200,154,12,0.35)",
                }}
                whileHover={{ scale: 1.015, borderColor: "rgba(214,170,40,0.5)" }}
                whileTap={{ scale: 0.985 }}
                transition={{ duration: 0.15 }}
              >
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-xl shrink-0"
                  style={{ background: "rgba(200,154,12,0.18)", border: "1px solid rgba(200,154,12,0.24)" }}
                >
                  <LayoutDashboard style={{ width: 22, height: 22, color: "#facc15" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm" style={{ color: "rgba(255,255,255,0.95)" }}>
                    Open Eurostar Load Analytics
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                    Date-based passenger curves, busiest services and load patterns
                  </p>
                </div>
                <div
                  className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
                  style={{ background: "rgba(200,154,12,0.18)", color: "#facc15", border: "1px solid rgba(200,154,12,0.28)" }}
                >
                  Open →
                </div>
              </motion.button>
            )}

            {onNotifications && (
              <motion.button
                type="button"
                onClick={() => { onClose(); onNotifications() }}
                className="es-preserve-inverse w-full flex items-center gap-4 p-4 rounded-lg text-left"
                style={{
                  background: "linear-gradient(135deg, rgba(62,18,18,0.68) 0%, rgba(239,68,68,0.18) 100%)",
                  border: "1px solid rgba(248,113,113,0.28)",
                }}
                whileHover={{ scale: 1.015, borderColor: "rgba(248,113,113,0.46)" }}
                whileTap={{ scale: 0.985 }}
                transition={{ duration: 0.15 }}
              >
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-xl shrink-0"
                  style={{ background: "rgba(248,113,113,0.14)", border: "1px solid rgba(248,113,113,0.22)" }}
                >
                  <Bell style={{ width: 22, height: 22, color: "#fca5a5" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm" style={{ color: "rgba(255,255,255,0.95)" }}>
                    Notification Center
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                    Live departures, disruptions, high load and last-train alerts
                  </p>
                </div>
                <div
                  className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
                  style={{ background: "rgba(248,113,113,0.12)", color: "#fca5a5", border: "1px solid rgba(248,113,113,0.2)" }}
                >
                  Open →
                </div>
              </motion.button>
            )}

            {/* ── Regular action grid ── */}
            <div className="es-density-list grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {ACTIONS.map(action => (
                <motion.button
                  key={action.label}
                  type="button"
                  onClick={() => handleAction(action.query)}
                  className="es-density-card flex flex-col gap-2 p-4 rounded-lg text-left"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                  whileHover={{
                    background: "rgba(0,51,102,0.22)",
                    borderColor: `${action.accent}55`,
                    scale: 1.02,
                  }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                >
                  <div
                    className="flex items-center justify-center w-9 h-9 rounded-lg"
                    style={{
                      background: `${action.accent}28`,
                      color: action.accent === NAVY ? "#7eaaff" : `${action.accent}cc`,
                    }}
                  >
                    {action.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight" style={{ color: "rgba(255,255,255,0.88)" }}>
                      {action.label}
                    </p>
                    <p className="text-[11px] mt-0.5 leading-snug" style={{ color: "rgba(255,255,255,0.38)" }}>
                      {action.sublabel}
                    </p>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div
            className="px-5 py-3 border-t shrink-0 flex items-center gap-2"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}
          >
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#34d399" }} />
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
              Powered by Eurostar live data &amp; MCP tools
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
