import { useState, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring } from "framer-motion";
import { Pencil, ArrowRight } from "lucide-react";

// ── Brand colours ─────────────────────────────────────────────────────────────
const GOLD   = "#c9a227";
const NAVY   = "#003366";
const SILVER = "rgba(255,255,255,0.55)";

// ── Network definitions ───────────────────────────────────────────────────────
type NetworkKey = "EUROSTAR" | "TFL" | "SNCF" | "NRAIL" | "WEATHER" | "RATP";

const NETWORKS: {
  key: NetworkKey;
  label: string;
  sub: string;
  color: string;
  glow: string;
  examples: { text: string; tool: string; template?: boolean }[];
}[] = [
  {
    key: "EUROSTAR",
    label: "Eurostar",
    sub: "Cross-Channel",
    color: NAVY,
    glow: "rgba(0,51,102,0.6)",
    examples: [
      { text: "Show live map of all Eurostar trains",       tool: "get_eurostar_live_map" },
      { text: "Full departure board for today",             tool: "get_eurostar_dashboard" },
      { text: "London → Paris trains today",                tool: "get_euromap_plans" },
      { text: "Last Eurostar from Paris tonight",           tool: "get_euromap_plans" },
      { text: "Which services are cancelled today?",        tool: "get_eurostar_dashboard" },
      { text: "How busy is service 9005 today?",            tool: "get_traveler_summary" },
      { text: "Stop times for service {number} on {date}", tool: "get_euromap_plan_by_id",           template: true },
      { text: "Technical plan for {number} on {date}",     tool: "get_euromap_technical_plan_by_id", template: true },
    ],
  },
  {
    key: "NRAIL",
    label: "National Rail",
    sub: "UK Connections",
    color: "#003C71",
    glow: "rgba(0,60,113,0.6)",
    examples: [
      { text: "Trains from King's Cross right now",         tool: "get_national_rail_departures" },
      { text: "Departures from St Pancras",                 tool: "get_national_rail_departures" },
      { text: "Connecting trains from Ebbsfleet",           tool: "get_national_rail_departures" },
      { text: "Trains from Ashford International",          tool: "get_national_rail_departures" },
      { text: "Next trains from {station}",                 tool: "get_national_rail_departures", template: true },
      { text: "Is the St Pancras to Sheffield train on time?", tool: "get_national_rail_departures" },
    ],
  },
  {
    key: "TFL",
    label: "TFL",
    sub: "London",
    color: "#E32017",
    glow: "rgba(227,32,23,0.6)",
    examples: [
      { text: "Route from Paddington to Canary Wharf",     tool: "plan_journey" },
      { text: "Journey from {origin} to {destination}",    tool: "plan_journey",       template: true },
      { text: "Is the Elizabeth line running?",             tool: "get_line_status" },
      { text: "All tube line status right now",             tool: "get_status_by_mode" },
      { text: "Any Underground delays today?",              tool: "get_status_by_mode" },
      { text: "Live bus arrivals at Oxford Circus",         tool: "get_bus_arrivals" },
    ],
  },
  {
    key: "SNCF",
    label: "SNCF",
    sub: "France",
    color: "#c00014",
    glow: "rgba(192,0,20,0.6)",
    examples: [
      { text: "Next trains from Paris Gare de Lyon",       tool: "get_sncf_departures" },
      { text: "Arrivals board at Paris Montparnasse",      tool: "get_sncf_arrivals" },
      { text: "Paris Montparnasse → Bordeaux trains",      tool: "plan_sncf_journey" },
      { text: "Any SNCF disruptions today?",               tool: "get_sncf_disruptions" },
      { text: "Departures from {station}",                 tool: "get_sncf_departures", template: true },
    ],
  },
  {
    key: "RATP",
    label: "Paris RER",
    sub: "Metro · RER",
    color: "#009A44",
    glow: "rgba(0,154,68,0.6)",
    examples: [
      { text: "How do I get into Paris from Gare du Nord?", tool: "get_paris_metro_departures" },
      { text: "RER B departures from Gare du Nord",         tool: "get_paris_metro_departures" },
      { text: "Next trains from Gare de Lyon",              tool: "get_paris_metro_departures" },
      { text: "Paris transit from Chatelet les Halles",     tool: "get_paris_metro_departures" },
      { text: "Metro from {station}",                       tool: "get_paris_metro_departures", template: true },
    ],
  },
  {
    key: "WEATHER",
    label: "Weather",
    sub: "Live Conditions",
    color: "#0ea5e9",
    glow: "rgba(14,165,233,0.6)",
    examples: [
      { text: "What's the weather in London today?",       tool: "get_weather" },
      { text: "Will it rain in Paris today?",              tool: "get_weather" },
      { text: "Weather in Brussels right now",             tool: "get_weather" },
      { text: "Weather at both ends of my Eurostar trip",  tool: "get_weather" },
      { text: "Should I pack an umbrella for Paris?",      tool: "get_weather" },
    ],
  },
];

// ── Animated background grid ──────────────────────────────────────────────────
function GridBg() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.045 }}>
        <defs>
          <pattern id="grid" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>
  );
}

// ── Glowing orbs ──────────────────────────────────────────────────────────────
const ORBS = [
  { cx: "15%",  cy: "20%", r: 280, color: "#003366", dur: 8,  delay: 0 },
  { cx: "80%",  cy: "15%", r: 220, color: "#c9a227", dur: 11, delay: 2 },
  { cx: "60%",  cy: "70%", r: 260, color: "#003C71", dur: 9,  delay: 1 },
  { cx: "25%",  cy: "75%", r: 200, color: "#E32017", dur: 13, delay: 3 },
];

function GlowOrbs({ accent }: { readonly accent: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {ORBS.map((o, i) => (
        <motion.div
          key={i}
          style={{
            position: "absolute",
            left: o.cx,
            top: o.cy,
            width: o.r * 2,
            height: o.r * 2,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${i === 1 ? accent : o.color}18 0%, transparent 70%)`,
            transform: "translate(-50%, -50%)",
          }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: o.dur, delay: o.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ── Sweeping route lines ──────────────────────────────────────────────────────
const SWEEPS = [
  { top: "18%", color: "#003366", w: 500, dur: 12, delay: 0    },
  { top: "33%", color: "#E32017", w: 380, dur: 9,  delay: 1.5  },
  { top: "48%", color: "#c9a227", w: 600, dur: 15, delay: 0.7  },
  { top: "62%", color: "#009A44", w: 420, dur: 11, delay: 2.8  },
  { top: "76%", color: "#0ea5e9", w: 340, dur: 10, delay: 0.3  },
  { top: "88%", color: "#003C71", w: 460, dur: 13, delay: 1.9  },
];

function SweepLines() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {SWEEPS.map((s) => (
        <motion.div
          key={s.top}
          style={{
            position: "absolute",
            top: s.top,
            left: -(s.w + 40),
            width: s.w,
            height: 1,
            background: `linear-gradient(to right, transparent, ${s.color}55 40%, ${s.color}90 60%, transparent)`,
          }}
          animate={{ x: [0, globalThis.innerWidth + s.w + 80] }}
          transition={{ duration: s.dur, delay: s.delay, repeat: Infinity, ease: "linear" }}
        />
      ))}
    </div>
  );
}

// ── Animated title letters ────────────────────────────────────────────────────
function AnimatedTitle() {
  const chars = "CHANNEX".split("");
  return (
    <div className="flex items-center gap-0 overflow-hidden" aria-label="CHANNEX">
      {chars.map((ch, i) => (
        <motion.span
          key={i}
          style={{
            display: "inline-block",
            fontSize: "clamp(52px, 10vw, 96px)",
            fontWeight: 900,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            color: i >= 4 ? GOLD : "white",
          }}
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 + i * 0.06, type: "spring", stiffness: 220, damping: 24 }}
        >
          {ch}
        </motion.span>
      ))}
    </div>
  );
}

// ── Live pulse badge ──────────────────────────────────────────────────────────
function LiveBadge() {
  return (
    <motion.div
      className="flex items-center gap-2"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.9, type: "spring", stiffness: 260, damping: 22 }}
    >
      <div className="relative flex items-center justify-center w-5 h-5">
        <motion.div
          className="absolute rounded-full"
          style={{ width: 20, height: 20, background: "rgba(52,211,153,0.2)" }}
          animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
        />
        <div className="w-2 h-2 rounded-full bg-emerald-400" />
      </div>
      <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600, letterSpacing: "0.12em" }}>
        LIVE
      </span>
    </motion.div>
  );
}

// ── Network tab bar ───────────────────────────────────────────────────────────
function NetworkTabs({
  selected,
  onSelect,
}: {
  readonly selected: NetworkKey;
  readonly onSelect: (k: NetworkKey) => void;
}) {
  return (
    <motion.div
      className="flex items-center gap-2 flex-wrap justify-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1, duration: 0.5 }}
    >
      {NETWORKS.map((net) => {
        const active = net.key === selected;
        return (
          <motion.button
            key={net.key}
            type="button"
            onClick={() => onSelect(net.key)}
            style={{
              position: "relative",
              padding: "6px 16px",
              borderRadius: 999,
              border: `1px solid ${active ? net.color : "rgba(255,255,255,0.12)"}`,
              background: active ? `${net.color}22` : "rgba(255,255,255,0.04)",
              color: active ? net.color : "rgba(255,255,255,0.5)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              cursor: "pointer",
              backdropFilter: "blur(8px)",
            }}
            whileHover={{ scale: 1.06, borderColor: net.color }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
          >
            {active && (
              <motion.div
                layoutId="tab-pill"
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 999,
                  background: `${net.color}18`,
                  boxShadow: `0 0 18px ${net.glow}`,
                }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span style={{ position: "relative", zIndex: 1 }}>{net.label}</span>
          </motion.button>
        );
      })}
    </motion.div>
  );
}

// ── Example cards ─────────────────────────────────────────────────────────────
function ExampleCards({
  net,
  onSend,
  onTemplate,
}: {
  readonly net: (typeof NETWORKS)[number];
  readonly onSend: (t: string) => void;
  readonly onTemplate: (t: string) => void;
}) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={net.key}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="w-full"
      >
        {/* Section header */}
        <motion.div
          className="flex items-center gap-3 mb-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div style={{ width: 3, height: 18, borderRadius: 2, background: net.color }} />
          <span style={{ color: net.color, fontSize: 11, fontWeight: 800, letterSpacing: "0.16em" }}>
            {net.label.toUpperCase()} · {net.sub.toUpperCase()}
          </span>
          <div style={{ flex: 1, height: 1, background: `${net.color}22` }} />
        </motion.div>

        {/* Example grid */}
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {net.examples.map((ex, i) => (
            <motion.button
              key={ex.text}
              type="button"
              onClick={() => ex.template ? onTemplate(ex.text) : onSend(ex.text)}
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.055, type: "spring", stiffness: 320, damping: 26 }}
              whileHover={{ y: -3, scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              style={{
                textAlign: "left",
                padding: "12px 16px",
                borderRadius: 12,
                border: `1px solid ${ex.template ? net.color + "50" : "rgba(255,255,255,0.08)"}`,
                borderStyle: ex.template ? "dashed" : "solid",
                background: "rgba(255,255,255,0.03)",
                backdropFilter: "blur(8px)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                transition: "background 0.2s, border-color 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = `${net.color}12`;
                e.currentTarget.style.borderColor = `${net.color}50`;
                e.currentTarget.style.boxShadow = `0 4px 24px ${net.glow}40`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                e.currentTarget.style.borderColor = ex.template ? `${net.color}50` : "rgba(255,255,255,0.08)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div className="flex items-center gap-2">
                {ex.template
                  ? <Pencil style={{ width: 10, height: 10, color: net.color, opacity: 0.7, flexShrink: 0 }} />
                  : <ArrowRight style={{ width: 10, height: 10, color: net.color, opacity: 0.5, flexShrink: 0 }} />
                }
                <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 12.5, fontWeight: 500, lineHeight: 1.4 }}>
                  {ex.text}
                </span>
              </div>
              <span style={{ color: net.color, opacity: 0.45, fontSize: 9.5, fontFamily: "monospace", letterSpacing: "0.04em" }}>
                {ex.tool}
              </span>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Magnetic cursor orb ───────────────────────────────────────────────────────
function CursorOrb() {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 80, damping: 18 });
  const sy = useSpring(y, { stiffness: 80, damping: 18 });

  useEffect(() => {
    function onMove(e: MouseEvent) {
      x.set(e.clientX - 200);
      y.set(e.clientY - 200);
    }
    globalThis.addEventListener("mousemove", onMove);
    return () => globalThis.removeEventListener("mousemove", onMove);
  }, [x, y]);

  return (
    <motion.div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 400,
        height: 400,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(201,162,39,0.06) 0%, transparent 70%)",
        pointerEvents: "none",
        zIndex: 0,
        translateX: sx,
        translateY: sy,
      }}
    />
  );
}

// ── Departure ticker (ambient live feel) ──────────────────────────────────────
function tickerStatusColor(status: string) {
  if (status === "Cancelled") return "#f87171";
  if (status === "On time")   return "#34d399";
  return "#fbbf24";
}
function tickerBgColor(status: string) {
  if (status === "Cancelled") return "rgba(248,113,113,0.12)";
  if (status === "On time")   return "rgba(52,211,153,0.12)";
  return "rgba(251,191,36,0.12)";
}

const TICKER_ITEMS = [
  { code: "9002", from: "London St Pancras", to: "Paris Gare du Nord", time: "06:04", status: "On time" },
  { code: "9009", from: "London St Pancras", to: "Brussels-Midi",       time: "07:31", status: "On time" },
  { code: "TL",   from: "London King's Cross", to: "Sheffield",         time: "08:02", status: "+4 min" },
  { code: "9016", from: "Paris Gare du Nord", to: "London St Pancras",  time: "07:13", status: "On time" },
  { code: "TGV",  from: "Paris Montparnasse", to: "Bordeaux",           time: "08:35", status: "On time" },
  { code: "9018", from: "London St Pancras", to: "Paris Gare du Nord",  time: "08:04", status: "On time" },
  { code: "EMR",  from: "London St Pancras", to: "Nottingham",          time: "08:30", status: "Cancelled" },
];

function DepartureTicker() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % TICKER_ITEMS.length), 2800);
    return () => clearInterval(t);
  }, []);

  const item = TICKER_ITEMS[idx];

  return (
    <motion.div
      className="flex items-center gap-3 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1.4 }}
      style={{
        padding: "8px 16px",
        borderRadius: 8,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(8px)",
        maxWidth: 480,
      }}
    >
      <motion.div
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: tickerStatusColor(item.status) }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.4, repeat: Infinity }}
      />
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="flex items-center gap-2 flex-wrap"
        >
          <span style={{ color: GOLD, fontFamily: "monospace", fontSize: 11, fontWeight: 700 }}>{item.code}</span>
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>·</span>
          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>{item.from}</span>
          <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>→</span>
          <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: 600 }}>{item.to}</span>
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>·</span>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "monospace" }}>{item.time}</span>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "1px 7px",
            borderRadius: 99,
            color: tickerStatusColor(item.status),
            background: tickerBgColor(item.status),
          }}>
            {item.status}
          </span>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function LandingPage({
  onSend,
  onTemplate,
}: {
  readonly onSend: (msg: string) => void;
  readonly onTemplate: (t: string) => void;
}) {
  const [selected, setSelected] = useState<NetworkKey>("EUROSTAR");
  const net = NETWORKS.find(n => n.key === selected)!;

  return (
    <div
      style={{
        minHeight: "100%",
        background: "linear-gradient(160deg, #080e1a 0%, #0c1628 50%, #07111f 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <CursorOrb />
      <GridBg />
      <GlowOrbs accent={net.color} />
      <SweepLines />

      <div
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
          padding: "60px 24px 48px",
          maxWidth: 860,
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* ── Top wordmark ── */}
        <motion.div
          style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 40 }}
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          <span style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.28em",
            color: "rgba(255,255,255,0.35)",
          }}>
            CHANNEX
          </span>
          <div style={{ width: 1, height: 12, background: "rgba(255,255,255,0.15)" }} />
          <LiveBadge />
        </motion.div>

        {/* ── Hero title ── */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <AnimatedTitle />
          <motion.div
            style={{
              height: 2,
              background: `linear-gradient(to right, transparent, ${GOLD}, transparent)`,
              marginTop: 12,
              marginBottom: 16,
              borderRadius: 1,
            }}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ delay: 0.85, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          />
          <motion.p
            style={{ color: SILVER, fontSize: 14, lineHeight: 1.65, maxWidth: 440, margin: "0 auto" }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.5 }}
          >
            Real-time Eurostar intelligence — live maps, departure boards,
            disruptions and journey planning across UK, France and Europe.
          </motion.p>
        </div>

        {/* ── Live ticker ── */}
        <div style={{ marginBottom: 48 }}>
          <DepartureTicker />
        </div>

        {/* ── Network tabs ── */}
        <div style={{ marginBottom: 32, width: "100%" }}>
          <NetworkTabs selected={selected} onSelect={setSelected} />
        </div>

        {/* ── Examples ── */}
        <div style={{ width: "100%" }}>
          <ExampleCards net={net} onSend={onSend} onTemplate={onTemplate} />
        </div>

        {/* ── Bottom hint ── */}
        <motion.p
          style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, marginTop: 40, textAlign: "center" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6 }}
        >
          <span style={{ borderBottom: "1px dashed rgba(255,255,255,0.15)", paddingBottom: 1 }}>Dashed</span>
          {" "}= fill template · Click to send instantly
        </motion.p>
      </div>
    </div>
  );
}
