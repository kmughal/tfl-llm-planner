import { useCallback, useEffect, useRef, useState } from "react"
import { motion, useInView } from "framer-motion"
import { cn } from "../lib/utils"
import type { ChatMessage, ToolEvent } from "../lib/types"
import { ToolCallBadge } from "./ToolCallBadge"
import { EuromapCard } from "./EuromapCard"
import { EuromapDashboard } from "./EuromapDashboard"
import { EuromapLiveMap } from "./EuromapLiveMap"
import { SNCFDisruptions } from "./SNCFDisruptions"
import { SNCFDepartures } from "./SNCFDepartures"
import { SNCFArrivals } from "./SNCFArrivals"
import { SNCFTrain } from "./SNCFTrain"
import { TravelerSummaryCard } from "./TravelerSummaryCard"
import { Train, Bus, MapPin, Clock, ArrowRight, Volume2, VolumeX } from "lucide-react"

const DASHBOARD_TOOL     = "get_eurostar_dashboard"
const LIVEMAP_TOOL       = "get_eurostar_live_map"
const DISRUPTIONS_TOOL   = "get_sncf_disruptions"
const DEPARTURES_TOOL    = "get_sncf_departures"
const ARRIVALS_TOOL      = "get_sncf_arrivals"
const TRAIN_TOOL         = "get_sncf_train"
const TRAVELER_TOOL      = "get_traveler_summary"
const SNCF_RICH_TOOLS    = new Set([DISRUPTIONS_TOOL, DEPARTURES_TOOL, ARRIVALS_TOOL, TRAIN_TOOL])
const EUROMAP_TOOLS = new Set([
  "get_euromap_plans",
  "get_euromap_technical_plans",
  "get_euromap_plan_by_id",
  "get_euromap_technical_plan_by_id",
  DASHBOARD_TOOL,
  LIVEMAP_TOOL,
])

// ── TFL line colours ──────────────────────────────────────────────────────────
const LINE_COLOURS: Record<string, { bg: string; fg: string }> = {
  central:      { bg: "#E32017", fg: "#fff" },
  circle:       { bg: "#FFD300", fg: "#1a1a1a" },
  district:     { bg: "#00782A", fg: "#fff" },
  jubilee:      { bg: "#A0A5A9", fg: "#fff" },
  metropolitan: { bg: "#9B0056", fg: "#fff" },
  northern:     { bg: "#1C1C1C", fg: "#fff" },
  piccadilly:   { bg: "#003688", fg: "#fff" },
  victoria:     { bg: "#0098D4", fg: "#fff" },
  bakerloo:     { bg: "#B36305", fg: "#fff" },
  elizabeth:    { bg: "#6950A1", fg: "#fff" },
  hammersmith:  { bg: "#F3A9BB", fg: "#1a1a1a" },
  overground:   { bg: "#EE7C0E", fg: "#fff" },
  dlr:          { bg: "#00A4A7", fg: "#fff" },
}

// ── Block types ───────────────────────────────────────────────────────────────
type Stop = { name: string; time: string }

type JourneyDetail = {
  departure:   { time: string; station: string }
  arrival:     { time: string; station: string }
  duration:    string
  connections: number | null
  steps:       string[]
  stops:       Stop[]
}

type Block =
  | { kind: "para";    lines: string[] }
  | { kind: "steps";   items: string[] }
  | { kind: "route";   items: string[] }   // numbered list of station names
  | { kind: "bullets"; items: string[] }
  | { kind: "h3";      text: string }
  | { kind: "journey"; optionNum: number; header: string; details: JourneyDetail }

// ── Journey detail parsing ────────────────────────────────────────────────────
function parseJourneyHeader(header: string, info: JourneyDetail): void {
  const durM = /—\s*([\dh ]+min)/i.exec(header)
  if (durM) info.duration = durM[1].trim().replaceAll(" ", "")
  if (/\|\s*Direct/i.test(header)) {
    info.connections = 0
  } else {
    const conM = /\|\s*(\d+)\s*connection/i.exec(header)
    if (conM) info.connections = Number.parseInt(conM[1])
  }
}

function mergeFragmentedLines(lines: string[]): string[] {
  const result: string[] = []
  for (const raw of lines) {
    const t = raw.trim()
    if (!t) continue
    if (/^h?\d{2}$|^min$/.test(t) && result.length > 0) {
      result[result.length - 1] += t
    } else {
      result.push(t)
    }
  }
  return result
}

function applyConnectionLine(val: string, info: JourneyDetail): void {
  if (/^0$|direct/i.test(val)) { info.connections = 0; return }
  const n = Number.parseInt(val)
  if (!Number.isNaN(n)) info.connections = n
}

function applyDetailLine(line: string, info: JourneyDetail): void {
  const depM  = /^Depart(?:ure)?[:\s]+(\d{1,2}:\d{2})(?:\s+from\s+|\s+)(.+)/i.exec(line)
  const arrM  = /^Arriv(?:al|es?)[:\s]+(\d{1,2}:\d{2})(?:\s+at\s+|\s+)(.+)/i.exec(line)
  const bothM = /^Departs?:\s*(\S+)\s*\|\s*Arrives?:\s*(\S+)/i.exec(line)
  const durM  = /^Journey\s+time[:\s]+(.+)/i.exec(line)
  const conM  = /^Connections?[:\s]+(.+)/i.exec(line)
  const stepM = /^Step\s+\d+:\s*(.+)/i.exec(line)
  const stopM = /^Stop:\s*(.+?)\s*\((\d{1,2}:\d{2})\)\s*$/i.exec(line)
  const stopBareM = stopM ? null : /^Stop:\s*(.+)$/i.exec(line)

  if (depM)                        { info.departure.time = depM[1]; info.departure.station = depM[2].trim() }
  else if (arrM)                   { info.arrival.time   = arrM[1]; info.arrival.station   = arrM[2].trim() }
  else if (bothM)                  { info.departure.time = bothM[1]; info.arrival.time     = bothM[2] }
  else if (durM && !info.duration) { info.duration = durM[1].trim() }
  else if (conM)                   { applyConnectionLine(conM[1].trim(), info) }
  else if (stepM)                  { info.steps.push(stepM[1]) }
  else if (stopM)                  { info.stops.push({ name: stopM[1].trim(), time: stopM[2] }) }
  else if (stopBareM)              { info.stops.push({ name: stopBareM[1].trim(), time: "" }) }
}

function parseJourneyDetails(header: string, rawLines: string[]): JourneyDetail {
  const info: JourneyDetail = {
    departure:   { time: "", station: "" },
    arrival:     { time: "", station: "" },
    duration:    "",
    connections: null,
    steps:       [],
    stops:       [],
  }
  parseJourneyHeader(header, info)
  for (const line of mergeFragmentedLines(rawLines)) applyDetailLine(line, info)
  return info
}

// ── Route detection (station-name lists vs step-by-step directions) ──────────
const ACTION_VERBS = /\b(?:take|walk|get|board|exit|turn|follow|go|head|catch|ride|alight|transfer|towards?|depart|arrive|change|switch)\b/i

function isRouteStop(item: string): boolean {
  return item.length < 65 && !ACTION_VERBS.test(item)
}

function isRouteList(items: string[]): boolean {
  if (items.length < 3) return false
  return items.filter(isRouteStop).length >= Math.ceil(items.length * 0.75)
}

// ── Block-level parser ────────────────────────────────────────────────────────
type LineKind =
  | { t: "option";   num: number; raw: string }
  | { t: "numbered"; text: string }
  | { t: "bullet";   text: string }
  | { t: "heading";  text: string }
  | { t: "text";     text: string }

function classifyLine(line: string): LineKind {
  const opt = /^Option\s+(\d+)/i.exec(line)
  if (opt) return { t: "option", num: Number.parseInt(opt[1]), raw: line }
  const nm = /^(\d+)\.\s+(.+)/.exec(line)
  if (nm)  return { t: "numbered", text: nm[2] }
  const bm = /^[-*•]\s+(.+)/.exec(line)
  if (bm)  return { t: "bullet",   text: bm[1] }
  const hm = /^#{1,3}\s+(.+)/.exec(line)
  if (hm)  return { t: "heading",  text: hm[1] }
  return { t: "text", text: line }
}

type Accumulator =
  | { kind: "para" | "steps" | "bullets"; lines: string[] }
  | { kind: "journey"; optionNum: number; header: string; lines: string[] }

type ListAcc = { kind: "para" | "steps" | "bullets"; lines: string[] }

function flushAccumulator(acc: Accumulator, blocks: Block[]): void {
  if (acc.kind === "journey") {
    blocks.push({ kind: "journey", optionNum: acc.optionNum, header: acc.header, details: parseJourneyDetails(acc.header, acc.lines) })
  } else if (acc.lines.length > 0) {
    if (acc.kind === "steps")   blocks.push(isRouteList(acc.lines) ? { kind: "route", items: acc.lines } : { kind: "steps", items: acc.lines })
    if (acc.kind === "bullets") blocks.push({ kind: "bullets", items: acc.lines })
    if (acc.kind === "para")    blocks.push({ kind: "para",    lines: acc.lines })
  }
}

// Returns (and creates if needed) a list accumulator of the correct kind.
function ensureAccumulator(kind: ListAcc["kind"], acc: Accumulator | null, blocks: Block[]): ListAcc {
  if (acc?.kind === kind) return acc as ListAcc
  if (acc) flushAccumulator(acc, blocks)
  return { kind, lines: [] }
}

function prep(text: string): string {
  return text
    .replaceAll(/([.!?;:])\s*(\d+\.)\s+/g, "$1\n$2 ")
    .replaceAll(/([.!?])\s+(Here'?s|Alternatively|The journey|Note:|Please check)/g, "$1\n\n$2")
    .replaceAll(/([^\n])(Option\s+\d+)/gi, "$1\n$2")
}

function parseBlocks(raw: string): Block[] {
  const blocks: Block[] = []
  let acc: Accumulator | null = null
  const flush = () => { if (acc) { flushAccumulator(acc, blocks); acc = null } }

  for (const line of prep(raw).split("\n")) {
    const t = line.trim()
    if (!t) { flush(); continue }
    const lk = classifyLine(t)
    if (lk.t === "option") {
      flush(); acc = { kind: "journey", optionNum: lk.num, header: lk.raw, lines: [] }
    } else if (acc?.kind === "journey") {
      acc.lines.push(t)
    } else if (lk.t === "numbered") {
      acc = ensureAccumulator("steps", acc, blocks); acc.lines.push(lk.text)
    } else if (lk.t === "bullet") {
      acc = ensureAccumulator("bullets", acc, blocks); acc.lines.push(lk.text)
    } else if (lk.t === "heading") {
      flush(); blocks.push({ kind: "h3", text: lk.text })
    } else {
      acc = ensureAccumulator("para", acc, blocks); acc.lines.push(lk.text)
    }
  }
  flush()
  return blocks
}

// ── Inline span tokeniser ─────────────────────────────────────────────────────
// pos = character offset in original string — used as a stable, non-index key
type Span =
  | { k: "text";  v: string; pos: number }
  | { k: "bold";  v: string; pos: number }
  | { k: "tube";  v: string; line: string; pos: number }
  | { k: "bus";   v: string; pos: number }

// Simplified bus pattern: one uppercase letter + 2-3 digits (e.g. H101, 296 excluded
// here — numeric-only routes are too ambiguous to detect inline).
const SPAN_RE = new RegExp(
  [
    /\*\*[^*]+\*\*/,
    /(?:central|circle|district|jubilee|metropolitan|northern|piccadilly|victoria|bakerloo|elizabeth|overground|dlr|hammersmith(?: & city| and city)?)(?: line)?/,
    /[A-Z]\d{2,3}/,
  ].map(r => r.source).join("|"),
  "gi"
)

function classifySpan(raw: string, pos: number): Span {
  if (raw.startsWith("**")) return { k: "bold", v: raw.slice(2, -2), pos }
  if (/^[A-Z]\d/i.test(raw)) return { k: "bus", v: raw, pos }
  const lineKey = raw.toLowerCase()
    .replace(/ line$/, "").replace(/ & city.*/, "").replace(/ and city.*/, "")
    .split(" ")[0]
  return { k: "tube", v: raw, line: lineKey, pos }
}

function tokenize(text: string): Span[] {
  const spans: Span[] = []
  let last = 0
  let m: RegExpExecArray | null
  const re = new RegExp(SPAN_RE.source, "gi")
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) spans.push({ k: "text", v: text.slice(last, m.index), pos: last })
    spans.push(classifySpan(m[0], m.index))
    last = re.lastIndex
  }
  if (last < text.length) spans.push({ k: "text", v: text.slice(last), pos: last })
  return spans
}

// ── Inline content renderer ───────────────────────────────────────────────────
function Inline({ text }: { readonly text: string }) {
  return (
    <>
      {tokenize(text).map((span) => {
        if (span.k === "bold") {
          return <strong key={`${span.k}-${span.pos}`} className="font-semibold text-claude-text">{span.v}</strong>
        }
        if (span.k === "tube") {
          const colour = LINE_COLOURS[span.line] ?? { bg: "#003688", fg: "#fff" }
          return (
            <span
              key={`${span.k}-${span.pos}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold mx-0.5 align-middle whitespace-nowrap"
              style={{ backgroundColor: colour.bg, color: colour.fg }}
            >
              <Train className="w-2.5 h-2.5 shrink-0" />{span.v}
            </span>
          )
        }
        if (span.k === "bus") {
          return (
            <span
              key={`${span.k}-${span.pos}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold mx-0.5 align-middle whitespace-nowrap bg-[#E1251B] text-white"
            >
              <Bus className="w-2.5 h-2.5 shrink-0" />{span.v}
            </span>
          )
        }
        return <span key={`${span.k}-${span.pos}`}>{span.v}</span>
      })}
    </>
  )
}

// ── Step icon ─────────────────────────────────────────────────────────────────
function StepIcon({ text }: { readonly text: string }) {
  if (/\bwalk|foot|pedestrian/i.test(text)) return <MapPin className="w-3 h-3" />
  if (/\bbus|coach/i.test(text))            return <Bus className="w-3 h-3" />
  return <Train className="w-3 h-3" />
}

// ── Journey card colors ───────────────────────────────────────────────────────
// Detect network from the raw message text so TFL and SNCF cards look distinct.
const TFL_BLUE = "#003688"
const SNCF_RED = "#E2001A"

function detectJourneyColor(rawText: string): string {
  return /^sncf\s/i.test(rawText.trimStart()) ? SNCF_RED : TFL_BLUE
}

// ── Horizontal animated stop timeline ────────────────────────────────────────
// Each stop "arrives" sequentially: track draws first, then dot pops in.
const STOP_STEP = 0.32
const TRACK_DUR = 0.28
const DOT_DUR   = 0.2

function stopDelay(i: number) { return i * STOP_STEP }

function HorizontalRoute({ stops, color }: { readonly stops: Stop[]; readonly color: string }) {
  const ref   = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })
  const last  = stops.length - 1

  return (
    <div ref={ref} className="overflow-x-auto -mx-4 px-4 py-1 scrollbar-none">
      <div style={{ minWidth: `${Math.max(stops.length * 100, 280)}px` }}>

        {/* Times */}
        <div className="flex">
          {stops.map((s, i) => (
            <motion.div
              key={`t-${s.name}-${s.time}`}
              className="flex-1 text-center text-[11px] font-bold tabular-nums pb-1.5 leading-none"
              style={{ color: i === 0 || i === last ? "#111827" : "#9ca3af" }}
              initial={{ opacity: 0, y: -8 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: stopDelay(i), duration: DOT_DUR, ease: "easeOut" }}
            >
              {s.time}
            </motion.div>
          ))}
        </div>

        {/* Track + dots */}
        <div className="flex items-center py-0.5">
          {stops.map((s, i) => (
            <div key={`r-${s.name}-${s.time}`} className="flex items-center" style={{ flex: i < last ? 1 : "none" }}>
              <motion.div
                className="rounded-full border-[2.5px] shrink-0 cursor-default"
                style={{
                  width:           i === 0 || i === last ? 20 : 14,
                  height:          i === 0 || i === last ? 20 : 14,
                  borderColor:     color,
                  backgroundColor: i === 0 || i === last ? color : "#fff",
                  boxShadow:       `0 0 0 ${i === 0 || i === last ? 5 : 3}px ${color}22`,
                  zIndex: 10,
                  position: "relative",
                }}
                initial={{ scale: 0, opacity: 0 }}
                animate={inView ? { scale: 1, opacity: 1 } : {}}
                transition={{ delay: stopDelay(i), type: "spring", stiffness: 480, damping: 16 }}
                whileHover={{ scale: 1.5, boxShadow: `0 0 0 8px ${color}28` }}
              />
              {i < last && (
                <motion.div
                  className="flex-1 h-[2.5px] origin-left"
                  style={{ backgroundColor: color }}
                  initial={{ scaleX: 0 }}
                  animate={inView ? { scaleX: 1 } : {}}
                  transition={{ delay: stopDelay(i) + 0.08, duration: TRACK_DUR, ease: "easeInOut" }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Names */}
        <div className="flex">
          {stops.map((s, i) => (
            <motion.div
              key={`n-${s.name}-${s.time}`}
              className="flex-1 text-center text-[10px] leading-tight pt-1.5 px-0.5"
              style={{
                fontWeight: i === 0 || i === last ? 600 : 400,
                color:      i === 0 || i === last ? "#111827" : "#6b7280",
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: stopDelay(i) + 0.1, duration: DOT_DUR, ease: "easeOut" }}
            >
              {s.name}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ConnectionDots({ connections, color }: { readonly connections: number; readonly color: string }) {
  const count = Math.min(connections, 3)
  const positions = ["25%", "50%", "75%"] as const
  return (
    <>
      {count >= 1 && <div className="absolute top-1/2 w-2 h-2 rounded-full bg-white border-2" style={{ borderColor: color, left: positions[0], transform: "translate(-50%, -50%)" }} />}
      {count >= 2 && <div className="absolute top-1/2 w-2 h-2 rounded-full bg-white border-2" style={{ borderColor: color, left: positions[1], transform: "translate(-50%, -50%)" }} />}
      {count >= 3 && <div className="absolute top-1/2 w-2 h-2 rounded-full bg-white border-2" style={{ borderColor: color, left: positions[2], transform: "translate(-50%, -50%)" }} />}
    </>
  )
}

// Detect network label from step text like "Elizabeth line (elizabeth-line, 12 min)"
function stepNetworkLabel(step: string): string {
  const m = /\(([^,)]+),/.exec(step)
  return m ? m[1].trim() : ""
}

function JourneyCard({ block, color }: { readonly block: Block & { kind: "journey" }; readonly color: string }) {
  const { optionNum, details } = block
  const { departure, arrival, duration, connections, steps, stops } = details
  const isDirect = connections === 0
  const hasStops = stops.length >= 2
  const hasTime  = departure.time || arrival.time

  return (
    <div className="rounded-xl overflow-hidden shadow-sm bg-white" style={{ border: `1px solid ${color}25` }}>

      {/* Header band */}
      <div className="flex items-center justify-between px-4 py-2.5 text-white" style={{ backgroundColor: color }}>
        <div className="flex items-center gap-2">
          <Train className="w-4 h-4 shrink-0" />
          <span className="font-semibold text-sm tracking-tight">Option {optionNum}</span>
        </div>
        <div className="flex items-center gap-2">
          {connections !== null && (
            isDirect
              ? <span className="flex items-center gap-1 bg-white/20 rounded-full px-2 py-0.5 text-[11px] font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />Direct</span>
              : <span className="flex items-center gap-1 bg-white/20 rounded-full px-2 py-0.5 text-[11px] font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-amber-300" />{connections} change{connections === 1 ? "" : "s"}</span>
          )}
          {duration && (
            <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-2.5 py-0.5">
              <Clock className="w-3 h-3" />
              <span className="text-xs font-semibold">{duration}</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 py-3 flex flex-col gap-3">
        {/* Animated stop timeline — shown only for short journeys; vertical list handles larger sets */}
        {hasStops && stops.length <= 6 && <HorizontalRoute stops={stops} color={color} />}

        {/* Fallback dep→arr bar when no stop data */}
        {!hasStops && hasTime && (
          <div className="flex items-center gap-2">
            <div className="min-w-0 shrink-0">
              <div className="text-xl font-bold text-gray-900 tabular-nums leading-none">{departure.time || "—"}</div>
              {departure.station && <div className="text-[11px] text-gray-500 mt-0.5 max-w-[110px] leading-tight line-clamp-2">{departure.station}</div>}
            </div>
            <div className="flex-1 flex items-center gap-0.5">
              <div className="w-2 h-2 rounded-full border-2 shrink-0" style={{ borderColor: color }} />
              <div className="flex-1 h-0.5 relative" style={{ backgroundColor: `${color}30` }}>
                {connections !== null && connections > 0 && <ConnectionDots connections={connections} color={color} />}
              </div>
              <ArrowRight className="w-3 h-3 shrink-0" style={{ color }} />
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            </div>
            <div className="min-w-0 shrink-0 text-right">
              <div className="text-xl font-bold text-gray-900 tabular-nums leading-none">{arrival.time || "—"}</div>
              {arrival.station && <div className="text-[11px] text-gray-500 mt-0.5 max-w-[110px] leading-tight line-clamp-2 text-right">{arrival.station}</div>}
            </div>
          </div>
        )}

        {/* All stops — vertical list */}
        {hasStops && (
          <div className="border-t pt-2 flex flex-col gap-0" style={{ borderColor: `${color}15` }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider pb-1.5" style={{ color: `${color}99` }}>
              All stops · {stops.length}
            </div>
            {stops.map((stop, i) => {
              const isFirst = i === 0
              const isLast  = i === stops.length - 1
              return (
                <div key={`vs-${stop.name}-${i}`} className="flex items-stretch gap-2 min-w-0">
                  {/* dot + connector */}
                  <div className="flex flex-col items-center shrink-0" style={{ width: 14 }}>
                    <div
                      className="rounded-full border-2 shrink-0 mt-1"
                      style={{
                        width:           isFirst || isLast ? 10 : 7,
                        height:          isFirst || isLast ? 10 : 7,
                        borderColor:     color,
                        backgroundColor: isFirst || isLast ? color : "#fff",
                      }}
                    />
                    {!isLast && (
                      <div className="flex-1 w-px min-h-[10px]" style={{ backgroundColor: `${color}35` }} />
                    )}
                  </div>
                  {/* name + time */}
                  <div className="flex items-center justify-between w-full pb-1.5 min-w-0">
                    <span
                      className="text-xs leading-snug truncate"
                      style={{
                        fontWeight: isFirst || isLast ? 600 : 400,
                        color:      isFirst || isLast ? "#111827" : "#4b5563",
                      }}
                    >
                      {stop.name}
                    </span>
                    {stop.time && (
                      <span className="text-[10px] tabular-nums text-gray-400 ml-2 shrink-0">{stop.time}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Step-by-step legs */}
        {steps.length > 0 && (
          <div className="border-t pt-2 flex flex-col gap-1.5" style={{ borderColor: `${color}15` }}>
            {steps.map((step) => {
              const mode = stepNetworkLabel(step)
              return (
                <div key={step.slice(0, 40)} className="flex items-start gap-2 text-xs text-gray-600">
                  <span className="mt-0.5 shrink-0" style={{ color }}>
                    <StepIcon text={mode || step} />
                  </span>
                  <Inline text={step} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Animated train route diagram ─────────────────────────────────────────────
const TRACK = "#1e3a5f"

function RouteMap({ items }: { readonly items: string[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })
  const last = items.length - 1

  return (
    <div ref={ref} className="rounded-xl overflow-hidden border border-[#1e3a5f]/15 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#1e3a5f]/10 bg-[#f5f8ff]">
        <Train className="w-3.5 h-3.5 text-[#1e3a5f]" />
        <span className="text-xs font-semibold uppercase tracking-wide text-[#1e3a5f]">Route</span>
        <span className="ml-auto text-xs text-gray-400">{items.length} stops</span>
      </div>

      {/* Stops */}
      <div className="px-4 py-3">
        {items.map((item, i) => {
          const isTerminal = i === 0 || i === last
          return (
            <motion.div
              key={item.slice(0, 30)}
              className="flex gap-4 group cursor-default"
              initial={{ opacity: 0, x: -10 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.28, delay: i * 0.07, ease: "easeOut" }}
            >
              {/* Track column */}
              <div className="flex flex-col items-center shrink-0" style={{ width: 36 }}>
                <motion.div
                  className="z-10 flex items-center justify-center rounded-full border-2 shrink-0"
                  style={{
                    width: isTerminal ? 36 : 28,
                    height: isTerminal ? 36 : 28,
                    borderColor: TRACK,
                    backgroundColor: isTerminal ? TRACK : "#fff",
                    color: isTerminal ? "#fff" : TRACK,
                  }}
                  whileHover={{ scale: 1.18 }}
                  transition={{ type: "spring", stiffness: 420, damping: 18 }}
                >
                  {isTerminal
                    ? <Train className="w-3.5 h-3.5" />
                    : <span className="text-[10px] font-bold">{i + 1}</span>
                  }
                </motion.div>

                {i < last && (
                  <motion.div
                    className="rounded-full"
                    style={{ width: 3, backgroundColor: `${TRACK}40`, minHeight: 18, flex: 1, marginTop: 2, marginBottom: 2 }}
                    initial={{ scaleY: 0, originY: "top" }}
                    animate={inView ? { scaleY: 1 } : {}}
                    transition={{ duration: 0.2, delay: i * 0.07 + 0.18 }}
                  />
                )}
              </div>

              {/* Station name */}
              <div
                className="flex items-center text-sm leading-snug py-1 transition-colors duration-150 group-hover:text-[#1e3a5f]"
                style={{
                  paddingBottom: i < last ? 8 : 4,
                  paddingTop: 6,
                  fontWeight: isTerminal ? 600 : 400,
                  color: isTerminal ? "#111827" : "#374151",
                  minHeight: isTerminal ? 36 : 28,
                }}
              >
                {item}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ── Last train detection & card ───────────────────────────────────────────────
interface LastTrainInfo {
  time: string
  from: string
  to: string
  operator: string
}

const LAST_TRAIN_TIME_RE = /last\s+(?:departure|service|train|eurostar)[^.]*?(?:is\s+at\s+|at\s+)?(\d{1,2}:\d{2})/i

const KNOWN_EUROSTAR_STATIONS = [
  "Paris Gare du Nord", "London St Pancras", "Brussels Midi",
  "Amsterdam Centraal", "Lille Europe", "Ebbsfleet", "Ashford",
  "Calais Frethun", "Rotterdam Centraal",
]

function detectLastTrain(text: string): LastTrainInfo | null {
  const timeM = LAST_TRAIN_TIME_RE.exec(text)
  if (!timeM) return null

  let from = ""
  let to = ""
  for (const station of KNOWN_EUROSTAR_STATIONS) {
    if (new RegExp(`from\\s+${station}`, "i").test(text)) from = station
    if (new RegExp(`to\\s+${station}`, "i").test(text)) to = station
  }

  return {
    time: timeM[1],
    from,
    to,
    operator: /eurostar/i.test(text) ? "Eurostar" : "Train",
  }
}

const EUROSTAR_NAVY = "#003366"
const LAST_TRAIN_AMBER = "#f59e0b"

const STATION_BOOKING_SLUG: Record<string, string> = {
  "London St Pancras":  "london",
  "Paris Gare du Nord": "paris",
  "Brussels Midi":      "brussels",
  "Amsterdam Centraal": "amsterdam",
  "Rotterdam Centraal": "rotterdam",
  "Lille Europe":       "lille",
  "Ebbsfleet":          "ebbsfleet",
  "Ashford":            "ashford",
}

function buildLastTrainUrl(from: string, to: string): string {
  const slug = (s: string) =>
    STATION_BOOKING_SLUG[s] ?? s.toLowerCase().split(/\s+/).join("-")
  const today = new Date().toISOString().slice(0, 10)
  return `https://www.eurostar.com/rw-en/train-tickets/${slug(from)}-to-${slug(to)}/${today}`
}

function useCountdown(timeStr: string): string {
  const [remaining, setRemaining] = useState("")
  useEffect(() => {
    const compute = () => {
      const parts = timeStr.split(":")
      const h = Number(parts[0])
      const m = Number(parts[1])
      if (Number.isNaN(h) || Number.isNaN(m)) { setRemaining(""); return }
      const now = new Date()
      const dep = new Date(now)
      dep.setHours(h, m, 0, 0)
      if (dep <= now) dep.setDate(dep.getDate() + 1)
      const diff = dep.getTime() - now.getTime()
      const hrs  = Math.floor(diff / 3_600_000)
      const mins = Math.floor((diff % 3_600_000) / 60_000)
      setRemaining(hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`)
    }
    compute()
    const id = setInterval(compute, 30_000)
    return () => clearInterval(id)
  }, [timeStr])
  return remaining
}

function isWithin2h(timeStr: string): boolean {
  const parts = timeStr.split(":")
  const h = Number(parts[0])
  const m = Number(parts[1])
  if (Number.isNaN(h) || Number.isNaN(m)) return false
  const now = new Date()
  const dep = new Date(now)
  dep.setHours(h, m, 0, 0)
  if (dep <= now) return false
  return dep.getTime() - now.getTime() < 2 * 3_600_000
}

function LastTrainCard({ info }: { readonly info: LastTrainInfo }) {
  const countdown = useCountdown(info.time)
  const urgent    = isWithin2h(info.time)
  const bookUrl   = info.from && info.to ? buildLastTrainUrl(info.from, info.to) : null

  return (
    <motion.div
      className="rounded-2xl overflow-hidden shadow-md"
      style={{ border: `1.5px solid ${EUROSTAR_NAVY}25` }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Header */}
      <div className="px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: EUROSTAR_NAVY }}>
        <div className="flex items-center gap-2 text-white">
          <Train className="w-4 h-4 shrink-0" />
          <span className="font-semibold text-sm tracking-tight">{info.operator}</span>
        </div>
        <div
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold"
          style={{ backgroundColor: LAST_TRAIN_AMBER, color: "#1a1a1a" }}
        >
          <Clock className="w-3 h-3" />
          Last service
        </div>
      </div>

      {/* Body */}
      <div className="bg-white px-5 py-4">
        <div className="flex items-center justify-center gap-4 py-1">
          {/* Departure block */}
          <div className="text-center min-w-0">
            {info.from && <div className="text-[10px] text-gray-400 mb-1 font-semibold uppercase tracking-wider">From</div>}
            <div
              className="text-4xl font-bold tabular-nums leading-none"
              style={{ color: EUROSTAR_NAVY, letterSpacing: "-0.02em" }}
            >
              {info.time}
            </div>
            {info.from && (
              <div className="text-[11px] text-gray-500 mt-1.5 font-medium max-w-[130px] leading-tight">{info.from}</div>
            )}
          </div>

          {/* Arrow */}
          {info.to && (
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <div className="w-8 h-px" style={{ backgroundColor: `${EUROSTAR_NAVY}30` }} />
              <ArrowRight className="w-4 h-4" style={{ color: `${EUROSTAR_NAVY}50` }} />
              <div className="w-8 h-px" style={{ backgroundColor: `${EUROSTAR_NAVY}30` }} />
            </div>
          )}

          {/* Destination block */}
          {info.to && (
            <div className="text-center min-w-0">
              <div className="text-[10px] text-gray-400 mb-1 font-semibold uppercase tracking-wider">To</div>
              <div className="text-[11px] text-gray-700 font-semibold max-w-[130px] leading-tight mt-6">
                {info.to}
              </div>
            </div>
          )}
        </div>

        {/* Countdown */}
        {countdown && (
          <motion.div
            className="mt-3 flex items-center justify-center gap-2 rounded-xl py-2.5 px-4"
            style={{
              background: urgent
                ? "linear-gradient(135deg, #fff7ed, #fef3c7)"
                : "linear-gradient(135deg, #f0f9ff, #e0f2fe)",
              border: `1px solid ${urgent ? "#fbbf24" : "#7dd3fc"}`,
            }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div
              animate={urgent ? { scale: [1, 1.25, 1] } : {}}
              transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
            >
              <Clock className="w-3.5 h-3.5" style={{ color: urgent ? "#d97706" : "#0284c7" }} />
            </motion.div>
            <span className="text-sm font-bold tabular-nums" style={{ color: urgent ? "#92400e" : "#075985" }}>
              Departs in {countdown}
            </span>
            {urgent && (
              <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
                Hurry
              </span>
            )}
          </motion.div>
        )}

        {/* Book Now CTA */}
        {bookUrl && (
          <motion.a
            href={bookUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center justify-center gap-2 w-full rounded-xl py-3 text-sm font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${EUROSTAR_NAVY} 0%, #0055cc 100%)` }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32 }}
            whileHover={{ scale: 1.02, boxShadow: `0 6px 20px ${EUROSTAR_NAVY}50` }}
            whileTap={{ scale: 0.98 }}
          >
            Book on Eurostar.com ↗
          </motion.a>
        )}

        {/* Warning footer */}
        <div
          className="mt-3 pt-3 border-t text-[11px] text-center font-medium leading-snug"
          style={{ borderColor: `${LAST_TRAIN_AMBER}50`, color: LAST_TRAIN_AMBER }}
        >
          {urgent
            ? "⚡ Seats may be limited — secure your spot now"
            : "Last service of the day — book early to avoid missing it"}
        </div>
      </div>
    </motion.div>
  )
}

// ── Block renderers ───────────────────────────────────────────────────────────
function StepList({ items }: { readonly items: string[] }) {
  return (
    <div className="flex flex-col mt-1">
      {items.map((item, i) => (
        <div key={item.slice(0, 30)} className="flex gap-3">
          <div className="flex flex-col items-center shrink-0">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm" style={{ backgroundColor: "#003688" }}>
              {i + 1}
            </div>
            {i < items.length - 1 && <div className="w-px flex-1 bg-[#003688]/20 my-1" />}
          </div>
          <div className={cn("text-sm text-claude-text leading-relaxed", i < items.length - 1 ? "pb-3" : "pb-0")}>
            <span className="inline-flex items-center gap-1 text-[#003688] mr-1 align-middle"><StepIcon text={item} /></span>
            <Inline text={item} />
          </div>
        </div>
      ))}
    </div>
  )
}

function BulletList({ items }: { readonly items: string[] }) {
  const last = items.length - 1
  return (
    <div className="bg-[#f5f7fc] rounded-xl px-3 py-2.5 border border-[#003688]/10">
      {items.map((item, i) => (
        <div key={item.slice(0, 30)} className="flex gap-3">
          {/* Rail dot + connector */}
          <div className="flex flex-col items-center shrink-0">
            <div
              className={cn(
                "w-3 h-3 rounded-full border-2 border-[#003688] mt-1 shrink-0",
                i === 0 || i === last ? "bg-[#003688]" : "bg-white",
              )}
            />
            {i < last && <div className="w-0.5 flex-1 bg-[#003688]/30 my-0.5" style={{ minHeight: "14px" }} />}
          </div>
          {/* Content */}
          <div className={cn("text-sm text-claude-text leading-relaxed", i < last ? "pb-2.5" : "pb-0")}>
            <Inline text={item} />
          </div>
        </div>
      ))}
    </div>
  )
}

function RichMessage({ text }: { readonly text: string }) {
  const jColor = detectJourneyColor(text)
  const lastTrain = detectLastTrain(text)
  return (
    <div className="flex flex-col gap-2.5">
      {lastTrain && <LastTrainCard info={lastTrain} />}
      {parseBlocks(text).map((block) => {
        if (block.kind === "h3") {
          return <p key={`h3-${block.text.slice(0, 20)}`} className="text-xs font-semibold uppercase tracking-wide text-[#003688] mt-1">{block.text}</p>
        }
        if (block.kind === "journey") {
          return <JourneyCard key={`journey-${block.optionNum}`} block={block} color={jColor} />
        }
        if (block.kind === "route") {
          return <RouteMap key={`route-${block.items[0]?.slice(0, 15)}`} items={block.items} />
        }
        if (block.kind === "steps") {
          return <div key={`steps-${block.items[0]?.slice(0, 15)}`} className="bg-[#f5f7fc] rounded-xl px-3 py-2.5 border border-[#003688]/10"><StepList items={block.items} /></div>
        }
        if (block.kind === "bullets") {
          return <BulletList key={`bullets-${block.items[0]?.slice(0, 15)}`} items={block.items} />
        }
        return (
          <p key={`para-${block.lines[0]?.slice(0, 15)}`} className="text-sm text-claude-text leading-relaxed">
            <Inline text={block.lines.join(" ")} />
          </p>
        )
      })}
    </div>
  )
}

// ── Message content — extracted to avoid nested ternary ───────────────────────
function MessageContent({ message, isUser }: { readonly message: ChatMessage; readonly isUser: boolean }) {
  if (!message.content) {
    if (message.streaming) return <span className="inline-block w-1.5 h-4 bg-claude-muted rounded-sm animate-blink" />
    return null
  }
  if (isUser) return <span>{message.content}</span>
  return <RichMessage text={message.content} />
}

// ── Text-to-speech ────────────────────────────────────────────────────────────

// Strip markdown and control chars so speechSynthesis reads clean prose.
function toPlainText(content: string): string {
  return content
    .replaceAll(/\*\*(.+?)\*\*/g, "$1")
    .replaceAll(/^#{1,3}\s+/gm, "")
    .replaceAll(/^[-*•]\s+/gm, "")
    .replaceAll(/^\d+\.\s+/gm, "")
    .replaceAll(/[⚠🚫]/gu, "")
    .replaceAll(/\s{2,}/g, " ")
    .trim()
}

function SpeakButton({ content }: { readonly content: string }) {
  const [speaking, setSpeaking] = useState(false)

  const toggle = useCallback(() => {
    if (!globalThis.speechSynthesis) return
    if (speaking) {
      globalThis.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const utterance = new SpeechSynthesisUtterance(toPlainText(content))
    utterance.lang  = "en-GB"
    utterance.onend   = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    globalThis.speechSynthesis.speak(utterance)
    setSpeaking(true)
  }, [content, speaking])

  if (!globalThis.speechSynthesis) return null

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "mt-1.5 flex items-center gap-1 text-[11px] transition-colors",
        speaking
          ? "text-claude-accent"
          : "text-claude-muted hover:text-claude-text",
      )}
      aria-label={speaking ? "Stop speaking" : "Read aloud"}
    >
      {speaking
        ? <VolumeX className="w-3.5 h-3.5" />
        : <Volume2 className="w-3.5 h-3.5" />}
      <span>{speaking ? "Stop" : "Read aloud"}</span>
    </button>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export function MessageBubble({ message }: { readonly message: ChatMessage }) {
  const isUser = message.role === "user"
  const toolEvents: ToolEvent[] = message.toolEvents ?? []

  return (
    <div className={cn("flex flex-col gap-2 animate-fade-in", isUser ? "items-end" : "items-start")}>
      {!isUser && toolEvents.length > 0 && (
        <div className="flex flex-col gap-2 w-full max-w-[90%]">
          {/* Regular tool badges (and euromap tool_call pending badges) */}
          <div className="flex flex-wrap gap-1.5 px-1">
            {toolEvents
              .filter(ev => (!EUROMAP_TOOLS.has(ev.name) && !SNCF_RICH_TOOLS.has(ev.name) && ev.name !== TRAVELER_TOOL) || ev.type === "tool_call")
              .map((ev) => (
                <ToolCallBadge key={`${ev.type}-${ev.name}`} event={ev} />
              ))}
          </div>
          {/* SNCF rich cards */}
          {toolEvents
            .filter(ev => SNCF_RICH_TOOLS.has(ev.name) && ev.type === "tool_result" && !!ev.result)
            .map((ev) => {
              const r = ev.result ?? ""
              if (ev.name === DISRUPTIONS_TOOL) return <SNCFDisruptions key={`disruptions-${ev.name}`} result={r} />
              if (ev.name === DEPARTURES_TOOL)  return <SNCFDepartures  key={`departures-${ev.name}`}  result={r} />
              if (ev.name === ARRIVALS_TOOL)    return <SNCFArrivals    key={`arrivals-${ev.name}`}    result={r} />
              if (ev.name === TRAIN_TOOL)       return <SNCFTrain       key={`train-${ev.name}`}       result={r} />
              return null
            })}
          {/* Traveler summary cards */}
          {toolEvents
            .filter(ev => ev.name === TRAVELER_TOOL && ev.type === "tool_result" && !!ev.result)
            .map(ev => <TravelerSummaryCard key={`traveler-${ev.name}`} result={ev.result ?? ""} />)}
          {/* Euromap map cards / dashboard — rendered from raw tool result data */}
          {toolEvents
            .filter(ev => EUROMAP_TOOLS.has(ev.name) && ev.type === "tool_result" && !!ev.result)
            .map((ev) => {
              const r = ev.result ?? ""
              if (ev.name === DASHBOARD_TOOL) return <EuromapDashboard key={`dashboard-${ev.name}`} result={r} />
              if (ev.name === LIVEMAP_TOOL)   return <EuromapLiveMap   key={`livemap-${ev.name}`}   result={r} />
              return <EuromapCard key={`euromap-${ev.name}`} result={r} />
            })}
        </div>
      )}
      <div
        className={cn(
          "px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-claude-accent text-white rounded-3xl rounded-br-md max-w-[75%]"
            : "bg-white border border-claude-border rounded-3xl rounded-bl-md max-w-[90%] shadow-sm text-claude-text",
        )}
      >
        <MessageContent message={message} isUser={isUser} />
        {!isUser && message.content && !message.streaming && (
          <SpeakButton content={message.content} />
        )}
      </div>
    </div>
  )
}
