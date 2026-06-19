import { AnimatePresence, motion } from "framer-motion"
import { X, Bus, Map, Route, TrainFront, LayoutDashboard } from "lucide-react"
import { EurostarDisplayMenu, EurostarDisplayStyles, eurostarDisplayClass, useEurostarDisplay } from "./EurostarDisplay"

const RED = "#e32017"

type TflHubProps = {
  readonly onClose: () => void
  readonly onCommandCenter: () => void
  readonly onBusExplorer: () => void
  readonly onSend: (msg: string) => void
}

const ACTIONS = [
  {
    icon: <TrainFront style={{ width: 20, height: 20 }} />,
    label: "All line status",
    sublabel: "Tube, DLR, Overground and Elizabeth line",
    query: "All tube line status right now",
    accent: "#0a84ff",
  },
  {
    icon: <Route style={{ width: 20, height: 20 }} />,
    label: "Road status",
    sublabel: "TfL-managed corridors and current issues",
    query: "Road status update operated by TFL today",
    accent: "#ff9f0a",
  },
  {
    icon: <Bus style={{ width: 20, height: 20 }} />,
    label: "Bus network",
    sublabel: "Browse routes and live arrivals",
    query: "Show me all TfL bus routes",
    accent: "#ff453a",
  },
  {
    icon: <Map style={{ width: 20, height: 20 }} />,
    label: "Plan journey",
    sublabel: "Live routing across London",
    query: "Plan a TfL journey across London",
    accent: "#34c759",
  },
]

export function TflHub({ onClose, onCommandCenter, onBusExplorer, onSend }: TflHubProps) {
  const { theme, compact } = useEurostarDisplay()

  return (
    <AnimatePresence>
      <motion.div
        key="tfl-hub-backdrop"
        className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
        style={{ background: "rgba(1,5,16,0.75)", backdropFilter: "blur(8px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      >
        <motion.div
          key="tfl-hub-panel"
          className={`${eurostarDisplayClass(theme, compact)} es-themed-panel es-legacy-dark relative flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-lg`}
          style={{
            background: "rgba(16,10,10,0.96)",
            border: "1px solid rgba(227,32,23,0.45)",
            boxShadow: "0 32px 80px rgba(80,10,10,0.5), 0 0 0 1px rgba(255,255,255,0.04)",
          }}
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.97 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          onClick={event => event.stopPropagation()}
        >
          <EurostarDisplayStyles />

          <div className="flex shrink-0 items-center gap-3 border-b px-5 py-4" style={{ borderColor: "rgba(227,32,23,0.28)" }}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "linear-gradient(135deg, #e32017 0%, #ff6b5e 100%)" }}>
              <Bus className="text-white" style={{ width: 18, height: 18 }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.95)" }}>TfL Hub</p>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>London lines, roads, buses and journey tools</p>
            </div>
            <EurostarDisplayMenu inverted={theme !== "light"} />
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
              style={{ color: "rgba(255,255,255,0.4)" }}
              aria-label="Close TfL hub"
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>

          <div className="flex flex-col gap-3 overflow-y-auto p-4">
            <motion.button
              type="button"
              onClick={() => { onClose(); onCommandCenter() }}
              className="w-full rounded-lg p-4 text-left"
              style={{
                background: "linear-gradient(135deg, rgba(60,12,12,0.78) 0%, rgba(227,32,23,0.32) 100%)",
                border: "1px solid rgba(255,107,94,0.4)",
              }}
              whileHover={{ scale: 1.015, borderColor: "rgba(255,140,120,0.6)" }}
              whileTap={{ scale: 0.985 }}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: "rgba(255,107,94,0.2)", border: "1px solid rgba(255,107,94,0.3)" }}>
                  <LayoutDashboard style={{ width: 22, height: 22, color: "#ffb4a8" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.95)" }}>London Command Center</p>
                  <p className="mt-0.5 text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>All lines, roads, crowding and bus coverage in one place</p>
                </div>
              </div>
            </motion.button>

            <motion.button
              type="button"
              onClick={() => { onClose(); onBusExplorer() }}
              className="w-full rounded-lg p-4 text-left"
              style={{
                background: "linear-gradient(135deg, rgba(42,12,12,0.75) 0%, rgba(255,69,58,0.28) 100%)",
                border: "1px solid rgba(255,99,88,0.35)",
              }}
              whileHover={{ scale: 1.015, borderColor: "rgba(255,140,120,0.55)" }}
              whileTap={{ scale: 0.985 }}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: "rgba(255,99,88,0.18)", border: "1px solid rgba(255,99,88,0.28)" }}>
                  <Bus style={{ width: 22, height: 22, color: "#ffb4a8" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.95)" }}>Bus Explorer</p>
                  <p className="mt-0.5 text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>Dedicated route browser and arrivals view</p>
                </div>
              </div>
            </motion.button>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {ACTIONS.map(action => (
                <motion.button
                  key={action.label}
                  type="button"
                  onClick={() => { onClose(); onSend(action.query) }}
                  className="flex flex-col gap-2 rounded-lg p-4 text-left"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                  whileHover={{ background: "rgba(227,32,23,0.14)", borderColor: `${action.accent}55`, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${action.accent}28`, color: action.accent }}>
                    {action.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight" style={{ color: "rgba(255,255,255,0.88)" }}>{action.label}</p>
                    <p className="mt-0.5 text-[11px] leading-snug" style={{ color: "rgba(255,255,255,0.38)" }}>{action.sublabel}</p>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t px-5 py-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <div className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: RED }} />
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>TfL live feeds, road status, buses and line crowding</p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
