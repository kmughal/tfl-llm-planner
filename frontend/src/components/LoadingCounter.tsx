import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { NetworkTheme } from "./NetworkBackground"

const THEME_ACCENT: Record<NonNullable<NetworkTheme>, string> = {
  tfl:      "#E32017",
  sncf:     "#E2001A",
  eurostar: "#FFD700",
}

const STATUS_MESSAGES = [
  "Querying live data",
  "Talking to network",
  "Computing route",
  "Fetching schedules",
  "Contacting MCP server",
  "Processing request",
]

// ── Split-flap digit panel ────────────────────────────────────────────────────
function SplitFlapDigit({ target }: { readonly target: string }) {
  const [display, setDisplay] = useState(target)
  const [hot, setHot] = useState(false)
  const prevRef = useRef(target)

  useEffect(() => {
    if (target === prevRef.current) return
    prevRef.current = target
    setHot(true)
    let count = 0
    const total = 9 + Math.floor(Math.random() * 8)
    const id = setInterval(() => {
      count++
      if (count >= total) {
        setDisplay(target)
        setHot(false)
        clearInterval(id)
      } else {
        setDisplay(String(Math.floor(Math.random() * 10)))
      }
    }, 36)
    return () => clearInterval(id)
  }, [target])

  return (
    <div
      style={{
        position: "relative",
        width: 90,
        height: 118,
        borderRadius: 14,
        background: "linear-gradient(170deg, #13132a 0%, #0b0b1a 100%)",
        border: `1px solid ${hot ? "rgba(120,160,255,0.28)" : "rgba(255,255,255,0.05)"}`,
        boxShadow: hot
          ? "0 0 48px rgba(100,150,255,0.32), 0 8px 36px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.08)"
          : "0 8px 36px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.04)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
        transition: "border-color 0.1s, box-shadow 0.15s",
      }}
    >
      {/* Top-half gloss */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "46%",
        background: "linear-gradient(180deg, rgba(255,255,255,0.045) 0%, transparent 100%)",
        borderRadius: "14px 14px 0 0",
        pointerEvents: "none",
      }} />
      {/* Center divider — the "flap" line */}
      <div style={{
        position: "absolute", left: 6, right: 6, top: "50%",
        height: 1,
        background: hot ? "rgba(120,160,255,0.18)" : "rgba(255,255,255,0.06)",
        transition: "background 0.1s",
        pointerEvents: "none",
      }} />
      {/* Digit */}
      <span style={{
        fontSize: 76,
        fontWeight: 900,
        lineHeight: 1,
        fontFamily: "'Courier New', 'SF Mono', 'JetBrains Mono', monospace",
        letterSpacing: "-0.035em",
        color: hot ? "#93c5fd" : "#dde8ff",
        textShadow: hot
          ? "0 0 32px rgba(147,197,253,0.75), 0 0 64px rgba(147,197,253,0.3)"
          : "0 0 14px rgba(221,232,255,0.35)",
        position: "relative",
        zIndex: 1,
        userSelect: "none",
        transition: "color 0.07s, text-shadow 0.1s",
      }}>
        {display}
      </span>
    </div>
  )
}

// ── Blinking colon ────────────────────────────────────────────────────────────
function Colon() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingBottom: 6, flexShrink: 0 }}>
      {[0, 1].map(i => (
        <motion.div
          key={i}
          style={{ width: 9, height: 9, borderRadius: "50%", background: "rgba(180,200,255,0.3)" }}
          animate={{ opacity: [0.15, 0.9, 0.15] }}
          transition={{ duration: 1, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
        />
      ))}
    </div>
  )
}

// ── Floating particle ─────────────────────────────────────────────────────────
const PARTICLE_DATA = Array.from({ length: 18 }, (_, i) => ({
  x: (((i * 73 + 19) % 100) - 50) * 3.2,
  y: (((i * 47 + 11) % 100) - 50) * 2.4,
  dur: 3.5 + (i % 6) * 0.8,
  delay: (i * 0.28) % 4,
  size: 2 + (i % 3),
}))

function Particles() {
  return (
    <>
      {PARTICLE_DATA.map((p, i) => (
        <motion.div
          key={i}
          style={{
            position: "absolute",
            width: p.size, height: p.size,
            borderRadius: "50%",
            background: "rgba(160,190,255,0.28)",
            left: `calc(50% + ${p.x}px)`,
            top: `calc(50% + ${p.y}px)`,
            pointerEvents: "none",
          }}
          animate={{ y: [0, -18, 0], opacity: [0, 0.75, 0], scale: [0.6, 1.3, 0.6] }}
          transition={{ duration: p.dur, repeat: Infinity, delay: p.delay, ease: "easeInOut" }}
        />
      ))}
    </>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export function LoadingCounter({
  visible,
  theme,
}: {
  readonly visible: boolean
  readonly theme: NetworkTheme
}) {
  const [elapsed, setElapsed] = useState(0)
  const [msgIdx, setMsgIdx] = useState(0)

  useEffect(() => {
    if (!visible) { setElapsed(0); setMsgIdx(0); return }
    const start = Date.now()
    const tickId = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250)
    const msgId  = setInterval(() => setMsgIdx(i => (i + 1) % STATUS_MESSAGES.length), 2400)
    return () => { clearInterval(tickId); clearInterval(msgId) }
  }, [visible])

  const mm     = String(Math.floor(elapsed / 60)).padStart(2, "0")
  const ss     = String(elapsed % 60).padStart(2, "0")
  const accent = theme ? THEME_ACCENT[theme] : "#6080ff"

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="loading-counter"
          style={{
            position: "fixed", inset: 0, zIndex: 60,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            background: "rgba(4, 4, 14, 0.86)",
            backdropFilter: "blur(18px) saturate(1.3)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.97, filter: "blur(6px)" }}
          transition={{ duration: 0.32, ease: "easeInOut" }}
        >
          <Particles />

          {/* Outermost ring — very slow */}
          <motion.div style={{
            position: "absolute", width: 480, height: 480, borderRadius: "50%",
            border: "1px solid rgba(100,140,255,0.05)",
          }}
            animate={{ rotate: 360 }}
            transition={{ duration: 35, repeat: Infinity, ease: "linear" }}
          />

          {/* Middle ring — medium, with themed arc */}
          <motion.div style={{
            position: "absolute", width: 350, height: 350, borderRadius: "50%",
            border: "1px solid rgba(100,140,255,0.04)",
            borderTopColor: `${accent}55`,
          }}
            animate={{ rotate: -360 }}
            transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
          />

          {/* Inner ring — fastest, bright accent arc */}
          <motion.div style={{
            position: "absolute", width: 240, height: 240, borderRadius: "50%",
            border: "1px solid rgba(100,140,255,0.05)",
            borderRightColor: `${accent}85`,
          }}
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          />

          {/* Radial glow behind the digit block */}
          <motion.div
            style={{
              position: "absolute",
              width: 280, height: 90,
              background: `radial-gradient(ellipse at center, ${accent}20 0%, transparent 70%)`,
              filter: "blur(28px)",
            }}
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Cycling status label */}
          <div style={{ height: 22, marginBottom: 26, overflow: "hidden" }}>
            <AnimatePresence mode="wait">
              <motion.p
                key={msgIdx}
                style={{
                  fontFamily: "'SF Mono', 'JetBrains Mono', 'Courier New', monospace",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.24em",
                  color: "rgba(160,185,230,0.52)",
                  textTransform: "uppercase",
                  textAlign: "center",
                  margin: 0,
                }}
                initial={{ opacity: 0, y: 7 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -7 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
              >
                {STATUS_MESSAGES[msgIdx]}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Split-flap digit display */}
          <motion.div
            style={{ display: "flex", alignItems: "center", gap: 8 }}
            initial={{ opacity: 0, scale: 0.78, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.07, type: "spring", stiffness: 240, damping: 22 }}
          >
            <SplitFlapDigit target={mm[0]} />
            <SplitFlapDigit target={mm[1]} />
            <Colon />
            <SplitFlapDigit target={ss[0]} />
            <SplitFlapDigit target={ss[1]} />
          </motion.div>

          {/* Pulsing dots */}
          <motion.div
            style={{ marginTop: 30, display: "flex", gap: 7, alignItems: "center" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.38 }}
          >
            {[0, 1, 2, 3, 4].map(i => (
              <motion.div
                key={i}
                style={{
                  width: i === 2 ? 6 : 4,
                  height: i === 2 ? 6 : 4,
                  borderRadius: "50%",
                  background: `${accent}80`,
                }}
                animate={{ opacity: [0.12, 1, 0.12], scale: [0.7, 1.35, 0.7] }}
                transition={{ duration: 1.7, repeat: Infinity, delay: i * 0.17, ease: "easeInOut" }}
              />
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
