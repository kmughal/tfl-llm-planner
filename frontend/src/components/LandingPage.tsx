import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Train, MapPin, Zap, Pencil } from "lucide-react";

// ── Full-page animated backgrounds ───────────────────────────────────────────
const TFL_FULL_RIBBONS = [
  { color: "#E32017", top: "8%", w: 480, delay: 0, dur: 9 },
  { color: "#0098D4", top: "18%", w: 360, delay: 2.5, dur: 12 },
  { color: "#6950A1", top: "29%", w: 520, delay: 1, dur: 10 },
  { color: "#FFD300", top: "38%", w: 300, delay: 3.5, dur: 14 },
  { color: "#00782A", top: "48%", w: 420, delay: 0.5, dur: 11 },
  { color: "#B36305", top: "57%", w: 350, delay: 2, dur: 13 },
  { color: "#003688", top: "65%", w: 460, delay: 1.5, dur: 10 },
  { color: "#545454", top: "73%", w: 280, delay: 4, dur: 15 },
  { color: "#A0A5A9", top: "80%", w: 390, delay: 0.8, dur: 12 },
  { color: "#9B0056", top: "87%", w: 440, delay: 3, dur: 11 },
  { color: "#F3A9BB", top: "93%", w: 310, delay: 1.8, dur: 13 },
];
function TFLBg() {
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      aria-hidden
    >
      {TFL_FULL_RIBBONS.map((r) => (
        <motion.div
          key={r.color + r.top}
          style={{
            position: "absolute",
            top: r.top,
            left: -(r.w + 60),
            width: r.w,
            height: 3,
            borderRadius: 999,
            background: `linear-gradient(to right, transparent, ${r.color} 30%, ${r.color} 70%, transparent)`,
            opacity: 0.2,
          }}
          animate={{ x: [0, 2600] }}
          transition={{
            duration: r.dur,
            delay: r.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </motion.div>
  );
}

const SNCF_FULL_STREAKS = [
  { top: "12%", w: 320, delay: 0, dur: 1.8, dir: 1 },
  { top: "28%", w: 440, delay: 0.6, dur: 2.2, dir: -1 },
  { top: "42%", w: 260, delay: 1.2, dur: 1.6, dir: 1 },
  { top: "56%", w: 380, delay: 0.3, dur: 2.4, dir: -1 },
  { top: "70%", w: 300, delay: 0.9, dur: 2, dir: 1 },
  { top: "84%", w: 420, delay: 0.15, dur: 1.9, dir: -1 },
];
function SNCFBg() {
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      aria-hidden
    >
      {SNCF_FULL_STREAKS.map((s) => (
        <motion.div
          key={s.top}
          style={{
            position: "absolute",
            top: s.top,
            left: s.dir === 1 ? -(s.w + 60) : "100%",
            width: s.w,
            height: 2,
            background:
              s.dir === 1
                ? "linear-gradient(to right, transparent, #c00014 40%, transparent)"
                : "linear-gradient(to left, transparent, #c00014 40%, transparent)",
            opacity: 0.18,
          }}
          animate={{ x: s.dir === 1 ? [0, 2600] : [0, -2600] }}
          transition={{
            duration: s.dur,
            delay: s.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </motion.div>
  );
}

function starRadius(i: number) {
  if (i % 9 === 0) return 2.2;
  if (i % 4 === 0) return 1.5;
  return 0.9;
}
const BG_STARS = Array.from({ length: 60 }, (_, i) => ({
  cx: `${((i * 37 + 13) % 92) + 4}%`,
  cy: `${((i * 53 + 9) % 88) + 6}%`,
  r: starRadius(i),
  dur: 2 + ((i * 7) % 24) / 10,
  delay: (i * 0.18) % 3.5,
}));
function EurostarBg() {
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      aria-hidden
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "45%",
          background:
            "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(0,51,102,0.10) 0%, transparent 100%)",
        }}
      />
      <svg className="absolute inset-0 w-full h-full">
        {BG_STARS.map((s) => (
          <motion.circle
            key={`${s.cx}-${s.cy}`}
            cx={s.cx}
            cy={s.cy}
            r={s.r}
            fill="#003366"
            animate={{ opacity: [0.02, 0.16, 0.02] }}
            transition={{ duration: s.dur, delay: s.delay, repeat: Infinity }}
          />
        ))}
      </svg>
      <motion.div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          height: 1.5,
          background:
            "linear-gradient(to right, transparent 5%, #c9a227 30%, #f0c040 50%, #c9a227 70%, transparent 95%)",
        }}
        animate={{ opacity: [0.06, 0.24, 0.06] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
}

function DefaultBg() {
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      aria-hidden
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
          radial-gradient(ellipse 80% 50% at 18% 18%, rgba(227,32,23,0.05) 0%, transparent 60%),
          radial-gradient(ellipse 60% 50% at 82% 12%, rgba(0,51,102,0.06) 0%, transparent 55%),
          radial-gradient(ellipse 60% 55% at 50% 95%, rgba(105,80,161,0.04) 0%, transparent 60%)
        `,
        }}
      />
    </motion.div>
  );
}

const BG_COLORS: Record<string, string> = {
  TFL: "#fff7f7",
  SNCF: "#fff7f6",
  EUROSTAR: "#f1f5ff",
  default: "#f8faff",
};

function AnimatedBg({ selected }: { readonly selected: NetworkKey | null }) {
  const bg = selected
    ? (BG_COLORS[selected] ?? BG_COLORS.default)
    : BG_COLORS.default;
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none"
      animate={{ backgroundColor: bg }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      aria-hidden
    >
      <svg
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0, opacity: 0.45 }}
      >
        <defs>
          <pattern
            id="ldg"
            x="0"
            y="0"
            width="44"
            height="44"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="22" cy="22" r="0.9" fill="rgba(0,20,80,0.055)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ldg)" />
      </svg>
      <AnimatePresence mode="wait">
        {selected === "TFL" && <TFLBg key="tfl" />}
        {selected === "SNCF" && <SNCFBg key="sncf" />}
        {selected === "EUROSTAR" && <EurostarBg key="eurostar" />}
        {!selected && <DefaultBg key="default" />}
      </AnimatePresence>
    </motion.div>
  );
}

// ── TFL card bg ───────────────────────────────────────────────────────────────
const TFL_RIBBONS = [
  { color: "#E32017", top: "18%", h: 3, delay: 0, dur: 8 },
  { color: "#6950A1", top: "44%", h: 2, delay: 1, dur: 10 },
  { color: "#0098D4", top: "67%", h: 3, delay: 0.5, dur: 9 },
  { color: "#FFD300", top: "86%", h: 2, delay: 2, dur: 12 },
];
function TFLCardBg() {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
      {TFL_RIBBONS.map((r) => (
        <motion.div
          key={r.color}
          style={{
            position: "absolute",
            top: r.top,
            left: -260,
            width: 200,
            height: r.h,
            borderRadius: 999,
            backgroundColor: r.color,
            opacity: 0.13,
          }}
          animate={{ x: [0, 800] }}
          transition={{
            duration: r.dur,
            delay: r.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
}

// ── SNCF card bg ──────────────────────────────────────────────────────────────
const SNCF_STREAKS = [
  { top: "24%", w: 200, delay: 0, dur: 3, op: 0.15 },
  { top: "52%", w: 280, delay: 0.8, dur: 4, op: 0.11 },
  { top: "76%", w: 160, delay: 1.5, dur: 3, op: 0.13 },
];
function SNCFCardBg() {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
      {SNCF_STREAKS.map((s) => (
        <motion.div
          key={s.top}
          style={{
            position: "absolute",
            top: s.top,
            left: -340,
            height: 2,
            width: s.w,
            background:
              "linear-gradient(to right, transparent, #c00014 40%, transparent)",
            opacity: s.op,
          }}
          animate={{ x: [0, 780] }}
          transition={{
            duration: s.dur,
            delay: s.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// ── Eurostar card bg ──────────────────────────────────────────────────────────
const STARS = Array.from({ length: 22 }, (_, i) => ({
  cx: `${((i * 37 + 13) % 82) + 9}%`,
  cy: `${((i * 53 + 9) % 70) + 15}%`,
  r: i % 7 === 0 ? 1.8 : 1,
  dur: 1.8 + ((i * 7) % 20) / 10,
  delay: (i * 0.22) % 2.8,
}));
function EuroCardBg() {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
      <svg className="absolute inset-0 w-full h-full">
        {STARS.map((s) => (
          <motion.circle
            key={`${s.cx}-${s.cy}`}
            cx={s.cx}
            cy={s.cy}
            r={s.r}
            fill="#003366"
            animate={{ opacity: [0.03, 0.18, 0.03] }}
            transition={{ duration: s.dur, delay: s.delay, repeat: Infinity }}
          />
        ))}
      </svg>
    </div>
  );
}

// ── Network card + examples data ──────────────────────────────────────────────
type NetworkKey = "TFL" | "SNCF" | "EUROSTAR";

const NETWORKS: {
  key: NetworkKey;
  tag: string;
  tagLabel: string;
  accent: string;
  icon: React.ReactNode;
  title: string;
  meta: string;
  featured?: boolean;
  CardBg: React.ComponentType;
  examples: { text: string; tool: string; template?: boolean }[];
}[] = [
  {
    key: "EUROSTAR",
    tag: "EUROSTAR",
    tagLabel: "Core Network",
    accent: "#003366",
    icon: <MapPin className="w-5 h-5" />,
    title: "Cross-Channel",
    meta: "London · Paris · Brussels · Amsterdam",
    featured: true,
    CardBg: EuroCardBg,
    examples: [
      {
        text: "Show live map of all trains now",
        tool: "get_eurostar_live_map",
      },
      { text: "Departure board for today", tool: "get_eurostar_dashboard" },
      {
        text: "What trains run London to Paris today?",
        tool: "get_euromap_plans",
      },
      {
        text: "Last train from Paris to London tonight?",
        tool: "get_euromap_plans",
      },
      {
        text: "Where does train {number} stop on {date}?",
        tool: "get_euromap_plan_by_id",
        template: true,
      },
      {
        text: "Technical plan for train {number} on {date}",
        tool: "get_euromap_technical_plan_by_id",
        template: true,
      },
    ],
  },
  {
    key: "SNCF",
    tag: "SNCF",
    tagLabel: "France",
    accent: "#c00014",
    icon: <Zap className="w-5 h-5" />,
    title: "French Rail",
    meta: "TGV · TER · Intercités",
    CardBg: SNCFCardBg,
    examples: [
      {
        text: "Next trains from Paris Gare de Lyon",
        tool: "get_sncf_departures",
      },
      {
        text: "Arrivals board at Lyon Part-Dieu",
        tool: "get_sncf_arrivals",
      },
      {
        text: "Full schedule for TGV {number}",
        tool: "get_sncf_train",
        template: true,
      },
      {
        text: "Paris Montparnasse → Bordeaux trains",
        tool: "plan_sncf_journey",
      },
      { text: "Any SNCF disruptions today?", tool: "get_sncf_disruptions" },
      {
        text: "Departures from {station}",
        tool: "get_sncf_departures",
        template: true,
      },
    ],
  },
  {
    key: "TFL",
    tag: "TFL",
    tagLabel: "London",
    accent: "#e32017",
    icon: <Train className="w-5 h-5" />,
    title: "London Underground",
    meta: "11 lines · 272 stations",
    CardBg: TFLCardBg,
    examples: [
      { text: "Route from Paddington to Canary Wharf", tool: "plan_journey" },
      { text: "Is the Elizabeth line running?", tool: "get_line_status" },
      {
        text: "Status of all tube lines right now",
        tool: "get_status_by_mode",
      },
      { text: "Find stops near King's Cross", tool: "search_stops" },
    ],
  },
];

// ── Selector card helpers ─────────────────────────────────────────────────────
const GOLD = "#c9a227";

function cardBorder(selected: boolean, featured: boolean, accent: string): string {
  if (selected && featured) return `1.5px solid ${GOLD}70`;
  if (selected)             return `1.5px solid ${accent}70`;
  if (featured)             return `1.5px solid ${GOLD}45`;
  return "1.5px solid rgba(0,0,0,0.06)";
}

function cardShadow(selected: boolean, featured: boolean, accent: string): string {
  if (selected)  return `0 8px 32px ${accent}18, 0 2px 8px ${accent}0e`;
  if (featured)  return `0 4px 18px ${accent}10, 0 1px 4px ${GOLD}12`;
  return "0 2px 10px rgba(0,0,0,0.05)";
}

function barScaleX(selected: boolean, featured: boolean): number {
  if (selected)  return 1;
  if (featured)  return 0.6;
  return 0.3;
}

function barOpacity(selected: boolean, featured: boolean): number {
  if (selected)  return 1;
  if (featured)  return 0.7;
  return 0.35;
}

function CardAccentBar({ featured, accent, selected }: { readonly featured: boolean; readonly accent: string; readonly selected: boolean }) {
  return (
    <motion.div
      className="absolute top-0 left-4 right-4 rounded-full"
      style={{
        background: featured ? `linear-gradient(to right, ${accent}, ${GOLD})` : accent,
        height: featured ? 3.5 : 3,
        originX: "left",
      }}
      animate={{ scaleX: barScaleX(selected, featured), opacity: barOpacity(selected, featured) }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    />
  );
}

function CardHeader({ tag, tagLabel, accent, featured }: { readonly tag: string; readonly tagLabel: string; readonly accent: string; readonly featured: boolean }) {
  return (
    <div className="relative z-10 flex items-center justify-between">
      <span className="text-[9px] font-black tracking-[0.22em] px-2 py-0.5 rounded-full" style={{ backgroundColor: `${accent}10`, color: accent }}>
        {tag}
      </span>
      <span className="text-[10px] font-semibold" style={{ color: featured ? GOLD : "#9ca3af" }}>
        {tagLabel}
      </span>
    </div>
  );
}

function CardIconTitle({ icon, title, meta, accent, featured }: { readonly icon: React.ReactNode; readonly title: string; readonly meta: string; readonly accent: string; readonly featured: boolean }) {
  return (
    <div className="relative z-10 flex items-center gap-3">
      <div
        className="flex items-center justify-center rounded-xl shrink-0"
        style={{
          width: featured ? 40 : 36,
          height: featured ? 40 : 36,
          backgroundColor: featured ? `${accent}12` : `${accent}0d`,
          border: `1px solid ${featured ? GOLD : accent}22`,
        }}
      >
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <div>
        <p className="font-bold text-gray-700 leading-tight" style={{ fontSize: featured ? 14 : 13 }}>{title}</p>
        <p className="text-[10px] text-gray-400 font-medium mt-0.5">{meta}</p>
      </div>
    </div>
  );
}

function CardSelectedDot({ selected, featured, accent }: { readonly selected: boolean; readonly featured: boolean; readonly accent: string }) {
  const color = featured ? GOLD : accent;
  return (
    <motion.div
      className="relative z-10 text-[10px] font-semibold flex items-center gap-1"
      style={{ color }}
      animate={{ opacity: selected ? 1 : 0, y: selected ? 0 : 4 }}
      transition={{ duration: 0.18 }}
    >
      <span className="w-1 h-1 rounded-full inline-block" style={{ backgroundColor: color }} />
      {selected ? "Showing examples" : ""}
    </motion.div>
  );
}

// ── Selector card ─────────────────────────────────────────────────────────────
function NetworkCard({
  net,
  selected,
  index,
  onSelect,
}: {
  readonly net: (typeof NETWORKS)[number];
  readonly selected: boolean;
  readonly index: number;
  readonly onSelect: () => void;
}) {
  const { accent, tag, tagLabel, icon, title, meta, CardBg, featured } = net;
  const isFeatured = !!featured;

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      className="group relative flex-1 flex flex-col gap-3 rounded-2xl p-5 text-left bg-white"
      style={{
        minWidth: isFeatured ? 240 : 190,
        maxWidth: isFeatured ? 340 : 260,
        border: cardBorder(selected, isFeatured, accent),
        boxShadow: cardShadow(selected, isFeatured, accent),
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 + index * 0.09, type: "spring", stiffness: 300, damping: 28 }}
      whileHover={{ y: -3, transition: { duration: 0.18 } }}
      whileTap={{ scale: 0.98 }}
    >
      <CardBg />
      <CardAccentBar featured={isFeatured} accent={accent} selected={selected} />
      <CardHeader tag={tag} tagLabel={tagLabel} accent={accent} featured={isFeatured} />
      <CardIconTitle icon={icon} title={title} meta={meta} accent={accent} featured={isFeatured} />
      <CardSelectedDot selected={selected} featured={isFeatured} accent={accent} />
    </motion.button>
  );
}

// ── Example pills for selected network ────────────────────────────────────────
function ExamplePills({
  net,
  onSend,
  onTemplate,
}: {
  readonly net: (typeof NETWORKS)[number];
  readonly onSend: (t: string) => void;
  readonly onTemplate: (t: string) => void;
}) {
  return (
    <motion.div
      key={net.key}
      className="w-full flex flex-col gap-3"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      {/* Section label */}
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border"
          style={{
            backgroundColor: `${net.accent}08`,
            color: net.accent,
            borderColor: `${net.accent}22`,
          }}
        >
          {net.icon}
          {net.tag} · {net.tagLabel}
        </span>
        <div
          className="flex-1 h-px"
          style={{ backgroundColor: `${net.accent}18` }}
        />
      </div>

      {/* Pills */}
      <div className="flex flex-wrap gap-2">
        {net.examples.map((ex, i) => (
          <motion.button
            key={ex.text}
            type="button"
            onClick={() =>
              ex.template ? onTemplate(ex.text) : onSend(ex.text)
            }
            className="flex flex-col items-start gap-0.5 text-xs border rounded-xl px-3 py-2 bg-white font-medium transition-colors duration-150"
            style={{
              color: net.accent,
              borderColor: ex.template ? net.accent : `${net.accent}28`,
              borderStyle: ex.template ? "dashed" : "solid",
            }}
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              delay: i * 0.06,
              type: "spring",
              stiffness: 340,
              damping: 22,
            }}
            whileHover={{ backgroundColor: `${net.accent}08` }}
            whileTap={{ scale: 0.96 }}
          >
            {/* Query text row */}
            <span className="flex items-center gap-1.5">
              {ex.template ? (
                <Pencil className="w-2.5 h-2.5 shrink-0" />
              ) : (
                <span
                  className="w-1 h-1 rounded-full shrink-0 opacity-50"
                  style={{ backgroundColor: net.accent }}
                />
              )}
              {ex.text}
            </span>
            {/* Tool name badge */}
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 rounded self-start leading-none"
              style={{
                backgroundColor: `${net.accent}10`,
                color: `${net.accent}99`,
              }}
            >
              {ex.tool}
            </span>
          </motion.button>
        ))}
      </div>
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
  const [selected, setSelected] = useState<NetworkKey | null>("EUROSTAR");
  const selectedNet = NETWORKS.find((n) => n.key === selected) ?? null;

  return (
    <div
      className="relative w-full flex flex-col"
      style={{ minHeight: "100%" }}
    >
      <AnimatedBg selected={selected} />

      <div className="relative z-10 flex flex-col items-center gap-8 px-6 py-12 w-full max-w-4xl mx-auto">
        {/* Wordmark + live badge row */}
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
        >
          <span
            className="text-[13px] font-black tracking-[0.18em] uppercase"
            style={{ color: "#003366", letterSpacing: "0.22em" }}
          >
            CHANNEX
          </span>
          <div className="w-px h-3 bg-gray-200" />
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-emerald-100 shadow-sm">
            <motion.span
              className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.8, repeat: Infinity }}
            />
            <span className="text-[11px] font-semibold text-emerald-700 tracking-wide">
              Live
            </span>
          </div>
        </motion.div>

        {/* Headline */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="overflow-hidden">
            <motion.h1
              className="text-5xl sm:text-[60px] font-black tracking-tight text-gray-700 leading-[1.06]"
              initial={{ y: "108%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{
                delay: 0.14,
                type: "spring",
                stiffness: 200,
                damping: 28,
              }}
            >
              {"Cross-channel, live"}
              <span
                style={{
                  background:
                    "linear-gradient(135deg, #003366 0%, #c9a227 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                .
              </span>
            </motion.h1>
          </div>
          <motion.div
            className="h-[3px] rounded-full"
            style={{
              background:
                "linear-gradient(to right, #003366, #c9a227)",
            }}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "45%", opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6, ease: "easeOut" }}
          />
          <motion.p
            className="text-[14px] text-gray-400 max-w-sm leading-relaxed mt-1"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.52 }}
          >
            Eurostar real-time intelligence — live maps, departure boards,
            disruptions and journey planning. Plus TFL and SNCF.
          </motion.p>
        </div>

        {/* Network selector cards */}
        <div className="flex items-stretch gap-3 w-full flex-wrap justify-center">
          {NETWORKS.map((net, i) => (
            <NetworkCard
              key={net.key}
              net={net}
              index={i}
              selected={selected === net.key}
              onSelect={() =>
                setSelected((s) => (s === net.key ? null : net.key))
              }
            />
          ))}
        </div>

        {/* Hint when nothing selected */}
        <AnimatePresence mode="wait">
          {!selectedNet && (
            <motion.p
              key="hint"
              className="text-[12px] text-gray-400 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              Select a network above to see example queries
            </motion.p>
          )}

          {/* Network examples */}
          {selectedNet && (
            <ExamplePills
              key={selectedNet.key}
              net={selectedNet}
              onSend={onSend}
              onTemplate={onTemplate}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
