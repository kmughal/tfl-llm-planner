import { motion, AnimatePresence } from "framer-motion"
import type { NetworkTheme } from "./NetworkBackground"

type ThemeKey = "default" | "tfl" | "sncf" | "eurostar"

type ThemeConfig = {
  bg: string
  orbs: [string, string, string, string, string]
}

const THEMES: Record<ThemeKey, ThemeConfig> = {
  default: {
    bg: "linear-gradient(160deg, #020812 0%, #050B1C 55%, #030A14 100%)",
    orbs: [
      "radial-gradient(circle, rgba(108,32,210,0.50) 0%, transparent 70%)",
      "radial-gradient(circle, rgba(210,100,8,0.40) 0%, transparent 70%)",
      "radial-gradient(circle, rgba(0,148,200,0.42) 0%, transparent 70%)",
      "radial-gradient(circle, rgba(200,18,90,0.36) 0%, transparent 70%)",
      "radial-gradient(circle, rgba(64,88,240,0.32) 0%, transparent 70%)",
    ],
  },
  tfl: {
    bg: "linear-gradient(160deg, #0C0202 0%, #180506 55%, #0A0202 100%)",
    orbs: [
      "radial-gradient(circle, rgba(227,32,23,0.58) 0%, transparent 70%)",
      "radial-gradient(circle, rgba(0,54,136,0.48) 0%, transparent 70%)",
      "radial-gradient(circle, rgba(185,10,10,0.48) 0%, transparent 70%)",
      "radial-gradient(circle, rgba(0,152,212,0.36) 0%, transparent 70%)",
      "radial-gradient(circle, rgba(110,0,40,0.36) 0%, transparent 70%)",
    ],
  },
  sncf: {
    bg: "linear-gradient(160deg, #0C0101 0%, #160406 55%, #0A0101 100%)",
    orbs: [
      "radial-gradient(circle, rgba(206,0,24,0.55) 0%, transparent 70%)",
      "radial-gradient(circle, rgba(75,75,90,0.44) 0%, transparent 70%)",
      "radial-gradient(circle, rgba(185,8,18,0.48) 0%, transparent 70%)",
      "radial-gradient(circle, rgba(95,95,108,0.36) 0%, transparent 70%)",
      "radial-gradient(circle, rgba(225,20,32,0.30) 0%, transparent 70%)",
    ],
  },
  eurostar: {
    bg: "linear-gradient(160deg, #010714 0%, #030C20 55%, #020A18 100%)",
    orbs: [
      "radial-gradient(circle, rgba(0,32,102,0.60) 0%, transparent 70%)",
      "radial-gradient(circle, rgba(195,150,12,0.50) 0%, transparent 70%)",
      "radial-gradient(circle, rgba(0,58,175,0.44) 0%, transparent 70%)",
      "radial-gradient(circle, rgba(175,130,8,0.38) 0%, transparent 70%)",
      "radial-gradient(circle, rgba(0,82,200,0.34) 0%, transparent 70%)",
    ],
  },
}

function toKey(theme: NetworkTheme): ThemeKey {
  return theme ?? "default"
}

export function ChatMeshGradient({ theme }: { readonly theme: NetworkTheme }) {
  const key = toKey(theme)
  const cfg = THEMES[key]

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ background: cfg.bg, transition: "background 2s ease-in-out" }}
    >
      <AnimatePresence mode="sync">
        <motion.div
          key={key}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.8, ease: "easeInOut" }}
        >
          {cfg.orbs.map((gradient, i) => (
            <div
              key={gradient}
              className={`mesh-orb mesh-orb-${i + 1}`}
              style={{ background: gradient }}
            />
          ))}
        </motion.div>
      </AnimatePresence>

      <div className="mesh-shimmer" />

      {/* Depth vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 85% 80% at 50% 50%, transparent 30%, rgba(2,6,16,0.65) 100%)",
        }}
      />
    </div>
  )
}
