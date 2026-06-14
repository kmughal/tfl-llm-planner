import { motion, AnimatePresence } from "framer-motion"

export type NetworkTheme = "tfl" | "sncf" | "eurostar" | null

// ── TFL: animated tube lines + Underground roundel ───────────────────────────
const TFL_LINES = [
  { color: "#E32017", top: "10%", h: 4, delay: 0,   dur: 10 }, // Central
  { color: "#6950A1", top: "24%", h: 3, delay: 1.5, dur: 13 }, // Elizabeth
  { color: "#0098D4", top: "40%", h: 4, delay: 0.8, dur: 9  }, // Victoria
  { color: "#FFD300", top: "55%", h: 3, delay: 2.5, dur: 11 }, // Circle
  { color: "#A0A5A9", top: "68%", h: 3, delay: 1.0, dur: 14 }, // Jubilee
  { color: "#00782A", top: "82%", h: 3, delay: 3.0, dur: 12 }, // District
  { color: "#B36305", top: "92%", h: 2, delay: 0.3, dur: 15 }, // Bakerloo
]

function TFLBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {TFL_LINES.map((line, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{ top: line.top, height: line.h, width: 560, left: -620, backgroundColor: line.color, opacity: 0.28 }}
          animate={{ x: [0, 2600] }}
          transition={{ duration: line.dur, delay: line.delay, repeat: Infinity, ease: "linear" }}
        />
      ))}
      {/* Underground roundel watermark */}
      <div className="absolute right-14 top-1/2 -translate-y-1/2 opacity-[0.06] pointer-events-none select-none">
        <svg width="280" height="280" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="#E32017" strokeWidth="11" />
          <rect x="4" y="37" width="92" height="26" fill="#003688" />
          <circle cx="50" cy="50" r="44" fill="none" stroke="#E32017" strokeWidth="11" />
        </svg>
      </div>
      {/* Subtle top gradient band */}
      <div className="absolute top-0 left-0 right-0 h-1 opacity-60"
        style={{ background: "linear-gradient(to right, #E32017, #6950A1, #0098D4, #003688)" }} />
    </div>
  )
}

// ── SNCF: speed streaks + double-chevron logo ────────────────────────────────
const SNCF_STREAKS = Array.from({ length: 14 }, (_, i) => ({
  top: `${6 + i * 7}%`,
  width: 280 + ((i * 47) % 220),
  delay: i * 0.3,
  dur: 5 + ((i * 13) % 5),
  opacity: 0.22 + (i % 3) * 0.06,
}))

function SNCFBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {SNCF_STREAKS.map((s, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            top: s.top,
            height: 2,
            width: s.width,
            left: -400,
            opacity: s.opacity,
            background: "linear-gradient(to right, transparent, #E2001A 40%, #E2001A 60%, transparent)",
          }}
          animate={{ x: [0, 2400] }}
          transition={{ duration: s.dur, delay: s.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      {/* SNCF double-chevron watermark */}
      <div className="absolute right-12 top-1/2 -translate-y-1/2 opacity-[0.055] pointer-events-none select-none">
        <svg width="260" height="200" viewBox="0 0 130 100">
          <polyline points="5,85 48,15 91,85" fill="none" stroke="#E2001A" strokeWidth="13" strokeLinejoin="round" strokeLinecap="round" />
          <polyline points="39,85 82,15 125,85" fill="none" stroke="#E2001A" strokeWidth="13" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
      <div className="absolute top-0 left-0 right-0 h-1 opacity-70"
        style={{ background: "linear-gradient(to right, #E2001A, #b0000f, #E2001A)" }} />
    </div>
  )
}

// ── Eurostar: star field + moving train silhouette ───────────────────────────
const EURO_STARS = Array.from({ length: 48 }, (_, i) => ({
  cx: `${(i * 37 + 11) % 100}%`,
  cy: `${(i * 53 + 7) % 100}%`,
  r: i % 6 === 0 ? "0.9%" : "0.4%",
  pulseDur: 2 + ((i * 17) % 30) / 10,
  delay: (i * 0.13) % 3,
}))

function EurostarBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Twinkling stars */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {EURO_STARS.map((s, i) => (
          <motion.circle
            key={i}
            cx={s.cx}
            cy={s.cy}
            r={s.r}
            fill="#FFD700"
            animate={{ opacity: [0.15, 0.9, 0.15] }}
            transition={{ duration: s.pulseDur, delay: s.delay, repeat: Infinity }}
          />
        ))}
      </svg>

      {/* Moving train silhouette */}
      <motion.div
        className="absolute bottom-[18%] opacity-[0.07] pointer-events-none"
        style={{ left: -240 }}
        animate={{ x: [0, "calc(100vw + 280px)"] }}
        transition={{ duration: 22, repeat: Infinity, ease: "linear", delay: 0.5 }}
      >
        <svg width="220" height="38" viewBox="0 0 220 38" fill="white">
          <rect x="12" y="10" width="170" height="18" rx="6" />
          <rect x="0"   y="14" width="16"  height="11" rx="3" />
          <rect x="182" y="6"  width="32"  height="12" rx="3" />
          <circle cx="38"  cy="32" r="5" />
          <circle cx="82"  cy="32" r="5" />
          <circle cx="126" cy="32" r="5" />
          <circle cx="168" cy="32" r="5" />
          {/* Windows */}
          <rect x="22" y="14" width="10" height="8" rx="1.5" fill="#001a4d" />
          <rect x="40" y="14" width="10" height="8" rx="1.5" fill="#001a4d" />
          <rect x="58" y="14" width="10" height="8" rx="1.5" fill="#001a4d" />
          <rect x="76" y="14" width="10" height="8" rx="1.5" fill="#001a4d" />
          <rect x="94" y="14" width="10" height="8" rx="1.5" fill="#001a4d" />
          <rect x="112" y="14" width="10" height="8" rx="1.5" fill="#001a4d" />
          <rect x="130" y="14" width="10" height="8" rx="1.5" fill="#001a4d" />
          <rect x="148" y="14" width="10" height="8" rx="1.5" fill="#001a4d" />
        </svg>
      </motion.div>

      {/* Eurostar star watermark */}
      <div className="absolute right-12 top-1/2 -translate-y-1/2 opacity-[0.06] pointer-events-none select-none">
        <svg width="260" height="260" viewBox="0 0 100 100">
          <polygon points="50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35" fill="#FFD700" />
        </svg>
      </div>
      <div className="absolute top-0 left-0 right-0 h-1 opacity-60"
        style={{ background: "linear-gradient(to right, #003399, #FFD700, #003399)" }} />
    </div>
  )
}

// ── Theme config ─────────────────────────────────────────────────────────────
const THEME_BG: Record<NonNullable<NetworkTheme>, string> = {
  tfl:      "linear-gradient(160deg, #080f28 0%, #1a0810 45%, #0a0c20 100%)",
  sncf:     "linear-gradient(160deg, #180007 0%, #2a000e 45%, #120006 100%)",
  eurostar: "linear-gradient(160deg, #00071a 0%, #001040 45%, #00061a 100%)",
}

// ── Main export ───────────────────────────────────────────────────────────────
export function NetworkBackground({ theme }: { readonly theme: NetworkTheme }) {
  return (
    <AnimatePresence>
      {theme && (
        <motion.div
          key={theme}
          className="app-network-background fixed inset-0 z-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
          style={{ background: THEME_BG[theme] }}
        >
          {theme === "tfl"      && <TFLBackground />}
          {theme === "sncf"     && <SNCFBackground />}
          {theme === "eurostar" && <EurostarBackground />}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
