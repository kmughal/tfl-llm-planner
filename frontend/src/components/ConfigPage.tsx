import { useEffect, useMemo, useState } from "react"
import {
  Check, ChevronRight, Eye, EyeOff, Lock,
  RefreshCw, Save, Settings, Wrench, X,
} from "lucide-react"
import { motion } from "framer-motion"

// ── Types ─────────────────────────────────────────────────────────────────────
interface ConfigLine {
  type: "section" | "blank" | "entry" | "commented_entry"
  key?: string
  value?: string
  label?: string
}

interface EditState {
  value: string
  active: boolean
}

// ── Static tool registry ──────────────────────────────────────────────────────
const TOOL_NETWORKS = [
  {
    id: "tfl",
    label: "Transport for London",
    dotColor: "#e32017",
    textColor: "#fca5a5",
    borderColor: "#7f1d1d",
    bgColor: "#110202",
    auth: "API Key — TFL_APP_KEY header",
    endpoints: [
      { url: "https://api.tfl.gov.uk", label: "TFL Unified API" },
    ],
    tools: [
      { name: "plan_journey",       desc: "Plan a journey between two stops" },
      { name: "get_line_status",    desc: "Disruptions on specific tube/rail lines" },
      { name: "get_status_by_mode", desc: "Status across all tube, rail, and bus modes" },
      { name: "search_stops",       desc: "Find stops by name keyword" },
    ],
  },
  {
    id: "sncf",
    label: "SNCF — French Rail",
    dotColor: "#c00014",
    textColor: "#fda4af",
    borderColor: "#9f1239",
    bgColor: "#110105",
    auth: "Basic auth — SNCF_API_KEY as username, empty password",
    endpoints: [
      { url: "https://api.sncf.com/v1/coverage/sncf", label: "SNCF Coverage API v1" },
    ],
    tools: [
      { name: "plan_sncf_journey",      desc: "Plan a French rail journey" },
      { name: "search_sncf_stations",   desc: "Search stations by name" },
      { name: "get_sncf_disruptions",   desc: "Active disruptions on the SNCF network" },
      { name: "get_sncf_departures",    desc: "Departures from a given station" },
      { name: "get_sncf_arrivals",      desc: "Arrivals at a given station" },
      { name: "get_sncf_train",         desc: "Track a specific train by number" },
      { name: "get_sncf_dashboard",     desc: "Major hubs, departures and national incidents" },
    ],
  },
  {
    id: "eurostar",
    label: "Eurostar — Euromap",
    dotColor: "#2563eb",
    textColor: "#93c5fd",
    borderColor: "#1e3a5f",
    bgColor: "#020810",
    auth: "OAuth2 Client Credentials — EUROMAP_CLIENT_ID + EUROMAP_CLIENT_SECRET",
    endpoints: [
      { url: "https://gateway.dm.eurostar.com/euromap-enabler",                               label: "Euromap Enabler API" },
      { url: "https://login.microsoftonline.com/a9e30ac5-22dd-40f6-a361-b234d4d99c66/oauth2/token", label: "Azure AD OAuth2 Token Endpoint" },
    ],
    tools: [
      { name: "get_euromap_plans",                   desc: "Commercial departure plans" },
      { name: "get_euromap_technical_plans",         desc: "Technical/operational train plans" },
      { name: "get_euromap_plan_by_id",              desc: "Single commercial plan with full detail" },
      { name: "get_euromap_technical_plan_by_id",    desc: "Single technical plan with full detail" },
      { name: "get_eurostar_dashboard",              desc: "Operations dashboard overview" },
      { name: "get_eurostar_live_map",               desc: "Live train positions on the Eurostar network" },
    ],
  },
  {
    id: "traveler",
    label: "Traveler API — Thalys/Eurostar",
    dotColor: "#d97706",
    textColor: "#fcd34d",
    borderColor: "#78350f",
    bgColor: "#0e0700",
    auth: "Custom headers — client_id + consumer.client_id",
    endpoints: [
      { url: "https://thapaas.thalys.com/traveler-sapi/v1/traveler-summary", label: "Traveler Summary API" },
    ],
    tools: [
      { name: "get_traveler_summary", desc: "Passenger load breakdown by class and traveler type" },
    ],
  },
] as const

// ── Helpers ───────────────────────────────────────────────────────────────────
function isSecret(key: string): boolean {
  const u = key.toUpperCase()
  return u.includes("_KEY") || u.includes("SECRET") || u.includes("_TOKEN") || u.includes("_PASSWORD")
}

// ── Config row ────────────────────────────────────────────────────────────────
function ConfigRow({
  line,
  edits,
  onChange,
}: {
  readonly line: ConfigLine
  readonly edits: Record<string, EditState>
  readonly onChange: (key: string, s: EditState) => void
}) {
  const key = line.key!
  const origValue  = line.value ?? ""
  const origActive = line.type === "entry"

  const cur = edits[key]
  const curValue  = cur?.value  ?? origValue
  const curActive = cur?.active ?? origActive

  const secret  = isSecret(key)
  const [shown, setShown] = useState(false)

  const dirty = cur !== undefined && (cur.value !== origValue || cur.active !== origActive)

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 border-b font-mono text-[11px]"
      style={{
        borderColor:     "#1e293b",
        backgroundColor: dirty ? "rgba(251,191,36,0.04)" : "transparent",
        borderLeft:      dirty ? "2px solid #fbbf24" : "2px solid transparent",
      }}
    >
      {/* Active toggle */}
      <button
        type="button"
        title={curActive ? "Comment out (disable)" : "Uncomment (enable)"}
        onClick={() => onChange(key, { value: curValue, active: !curActive })}
        className="shrink-0 w-8 h-4 rounded-full relative transition-colors"
        style={{ background: curActive ? "#064e3b" : "#1f2937" }}
      >
        <motion.span
          className="absolute top-0.5 w-3 h-3 rounded-full"
          style={{ background: curActive ? "#10b981" : "#374151" }}
          animate={{ left: curActive ? "calc(100% - 14px)" : "2px" }}
          transition={{ duration: 0.15 }}
        />
      </button>

      {/* Key name */}
      <span
        className="shrink-0 flex items-center gap-1 w-52 truncate"
        style={{ color: curActive ? "#c4b5fd" : "#4b5563" }}
      >
        {key}
        {secret && <Lock className="w-2.5 h-2.5 shrink-0" style={{ color: "#4b5563" }} />}
      </span>

      {/* Value input */}
      <input
        type={secret && !shown ? "password" : "text"}
        value={curValue}
        disabled={!curActive}
        onChange={e => onChange(key, { value: e.target.value, active: curActive })}
        placeholder={curActive ? "empty" : "commented out"}
        className="flex-1 bg-transparent rounded px-2 py-1 text-[11px] outline-none font-mono"
        style={{
          color:      curActive ? "#e2e8f0" : "#374151",
          background: "#0d1117",
          border:     "1px solid #1e293b",
        }}
      />

      {/* Reveal toggle for secrets */}
      {secret && (
        <button
          type="button"
          onClick={() => setShown(v => !v)}
          className="shrink-0 transition-opacity hover:opacity-80"
          style={{ color: "#4b5563" }}
        >
          {shown
            ? <EyeOff className="w-3.5 h-3.5" />
            : <Eye    className="w-3.5 h-3.5" />
          }
        </button>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function ConfigPage({ onClose }: { readonly onClose: () => void }) {
  const [lines,   setLines]   = useState<ConfigLine[]>([])
  const [edits,   setEdits]   = useState<Record<string, EditState>>({})
  const [tab,     setTab]     = useState<"config" | "tools">("config")
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const backendURL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8080"

  useEffect(() => {
    fetch(`${backendURL}/api/config`)
      .then(r => r.json())
      .then(d => { setLines(d.lines ?? []); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [backendURL])

  function handleChange(key: string, s: EditState) {
    setEdits(prev => ({ ...prev, [key]: s }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const req: Record<string, EditState> = {}
    for (const line of lines) {
      if (!line.key) continue
      req[line.key] = edits[line.key] ?? {
        value:  line.value ?? "",
        active: line.type === "entry",
      }
    }
    try {
      const r = await fetch(`${backendURL}/api/config`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(req),
      })
      if (!r.ok) throw new Error(await r.text())
      setEdits({})
      setSaved(true)
      const fresh = await fetch(`${backendURL}/api/config`)
      const d = await fresh.json()
      setLines(d.lines ?? [])
      setTimeout(() => setSaved(false), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  // Group entry lines by section headers
  const sections = useMemo(() => {
    const result: { label: string; entries: ConfigLine[] }[] = []
    let cur: { label: string; entries: ConfigLine[] } = { label: "General", entries: [] }
    for (const line of lines) {
      if (line.type === "section") {
        if (cur.entries.length > 0) result.push(cur)
        cur = { label: line.label ?? "", entries: [] }
      } else if (line.type === "entry" || line.type === "commented_entry") {
        cur.entries.push(line)
      }
    }
    if (cur.entries.length > 0) result.push(cur)
    return result
  }, [lines])

  const isDirty   = Object.keys(edits).length > 0
  const totalKeys = lines.filter(l => l.type === "entry" || l.type === "commented_entry").length

  return (
    <div
      className="flex flex-col h-screen w-full"
      style={{ background: "#060b12", color: "#e2e8f0" }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-5 py-3 shrink-0"
        style={{ borderBottom: "1px solid #1e293b", background: "#0a0f1a" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-white/10"
          aria-label="Close config"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>

        <Settings className="w-4 h-4" style={{ color: "#6b7280" }} />
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">Configuration</span>

        <div className="flex-1" />

        {/* Saved confirmation */}
        {saved && (
          <motion.div
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-1.5 text-[11px] mr-2"
            style={{ color: "#10b981" }}
          >
            <Check className="w-3.5 h-3.5" />
            Saved · restart services to apply
          </motion.div>
        )}

        {error && (
          <span className="text-[11px] mr-2" style={{ color: "#f87171" }}>{error}</span>
        )}

        {tab === "config" && (
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
            style={{
              background: isDirty ? "#064e3b" : "#0d1117",
              color:      isDirty ? "#6ee7b7" : "#374151",
              border:    `1px solid ${isDirty ? "#059669" : "#1f2937"}`,
              cursor:     isDirty ? "pointer" : "not-allowed",
            }}
          >
            {saving
              ? <RefreshCw className="w-3 h-3 animate-spin" />
              : <Save className="w-3 h-3" />
            }
            {saving ? "Saving…" : "Save Changes"}
          </button>
        )}
      </div>

      {/* ── Tabs ── */}
      <div
        className="flex items-center gap-1 px-5 py-2 shrink-0"
        style={{ borderBottom: "1px solid #1e293b", background: "#08101a" }}
      >
        {(["config", "tools"] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all shrink-0"
            style={{
              background: tab === t ? "#1e293b" : "transparent",
              color:      tab === t ? "#e2e8f0" : "#4b5563",
              border:    `1px solid ${tab === t ? "#334155" : "transparent"}`,
            }}
          >
            {t === "config" ? "Environment" : "MCP Tools"}
            {t === "config" && isDirty && (
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#fbbf24" }} />
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Environment tab ── */}
        {tab === "config" && (
          <div className="max-w-3xl mx-auto px-4 py-6">
            {loading ? (
              <p className="text-center text-[12px] font-mono mt-16" style={{ color: "#374151" }}>
                Loading config…
              </p>
            ) : (
              <div className="flex flex-col gap-6">
                {sections.map((section, si) => (
                  <div key={si}>
                    {section.label && (
                      <div className="flex items-center gap-2 mb-3">
                        <span
                          className="text-[10px] font-black uppercase tracking-[0.18em]"
                          style={{ color: "#4b5563" }}
                        >
                          {section.label}
                        </span>
                        <div className="flex-1 h-px" style={{ background: "#1e293b" }} />
                      </div>
                    )}
                    <div
                      className="rounded-xl overflow-hidden"
                      style={{ border: "1px solid #1e293b", background: "#0a0f1a" }}
                    >
                      {section.entries.map(line => (
                        <ConfigRow
                          key={line.key}
                          line={line}
                          edits={edits}
                          onChange={handleChange}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                <p className="text-[10px] font-mono text-center mt-2" style={{ color: "#1f2937" }}>
                  Toggle the switch to comment/uncomment a key · Changes written to .env on save
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── MCP Tools tab ── */}
        {tab === "tools" && (
          <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-8">
            {TOOL_NETWORKS.map(network => (
              <div key={network.id}>
                {/* Network title */}
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: network.dotColor }}
                  />
                  <span className="text-[13px] font-bold" style={{ color: "#e2e8f0" }}>
                    {network.label}
                  </span>
                  <div className="flex-1 h-px" style={{ background: "#1e293b" }} />
                </div>

                {/* Auth + endpoints card */}
                <div
                  className="rounded-xl overflow-hidden mb-3"
                  style={{ border: `1px solid ${network.borderColor}`, background: network.bgColor }}
                >
                  <div className="px-4 py-2.5 border-b" style={{ borderColor: network.borderColor }}>
                    <span
                      className="text-[9px] font-black uppercase tracking-wider"
                      style={{ color: network.dotColor + "aa" }}
                    >
                      Auth
                    </span>
                    <p className="text-[11px] font-mono mt-0.5" style={{ color: "#6b7280" }}>
                      {network.auth}
                    </p>
                  </div>
                  {network.endpoints.map((ep, ei) => (
                    <div
                      key={ei}
                      className="flex items-start gap-3 px-4 py-2.5 border-b"
                      style={{ borderColor: network.borderColor }}
                    >
                      <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" style={{ color: "#4b5563" }} />
                      <div className="min-w-0">
                        <span
                          className="text-[9px] font-bold uppercase tracking-wider"
                          style={{ color: "#4b5563" }}
                        >
                          {ep.label}
                        </span>
                        <p
                          className="font-mono text-[11px] break-all mt-0.5"
                          style={{ color: network.textColor }}
                        >
                          {ep.url}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Tools list */}
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ border: "1px solid #1e293b", background: "#0a0f1a" }}
                >
                  {network.tools.map((tool, ti) => (
                    <div
                      key={ti}
                      className="flex items-start gap-3 px-4 py-2.5 border-b"
                      style={{ borderColor: "#1e293b" }}
                    >
                      <Wrench
                        className="w-3 h-3 mt-0.5 shrink-0"
                        style={{ color: network.dotColor + "66" }}
                      />
                      <div>
                        <span
                          className="text-[11px] font-mono font-bold"
                          style={{ color: network.textColor }}
                        >
                          {tool.name}
                        </span>
                        <p className="text-[11px] mt-0.5" style={{ color: "#6b7280" }}>
                          {tool.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Status bar ── */}
      <div
        className="flex items-center gap-4 px-5 py-1.5 shrink-0 font-mono text-[9px]"
        style={{ borderTop: "1px solid #1e293b", background: "#0a0f1a", color: "#374151" }}
      >
        <span>file: ../.env</span>
        <span>{totalKeys} keys</span>
        {tab === "tools" && (
          <span>
            {TOOL_NETWORKS.reduce((n, nw) => n + nw.tools.length, 0)} tools registered
          </span>
        )}
        <span className="ml-auto">
          {isDirty ? `${Object.keys(edits).length} unsaved change(s)` : "no unsaved changes"}
        </span>
      </div>
    </div>
  )
}
