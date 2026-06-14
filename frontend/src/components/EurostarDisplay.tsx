import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Eye, Moon, Rows3, Sun } from "lucide-react"

export type EurostarTheme = "light" | "dark" | "contrast"

const THEME_KEY = "rail-live-display-theme"
const COMPACT_KEY = "rail-live-compact"
const LEGACY_THEME_KEY = "eurostar-display-theme"
const LEGACY_COMPACT_KEY = "eurostar-compact"
const CHANGE_EVENT = "rail-live-display-change"

function readTheme(): EurostarTheme {
  const saved = localStorage.getItem(THEME_KEY) ?? localStorage.getItem(LEGACY_THEME_KEY)
  return saved === "dark" || saved === "contrast" ? saved : "light"
}

function readCompact(): boolean {
  return (localStorage.getItem(COMPACT_KEY) ?? localStorage.getItem(LEGACY_COMPACT_KEY)) === "true"
}

export function useEurostarDisplay() {
  const [theme, setThemeState] = useState<EurostarTheme>(readTheme)
  const [compact, setCompactState] = useState(readCompact)

  useEffect(() => {
    const sync = () => {
      setThemeState(readTheme())
      setCompactState(readCompact())
    }
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  const setTheme = (value: EurostarTheme) => {
    localStorage.setItem(THEME_KEY, value)
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }
  const setCompact = (value: boolean) => {
    localStorage.setItem(COMPACT_KEY, String(value))
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }


  useEffect(() => {
    const root = document.documentElement
    root.dataset.appTheme = theme
    root.classList.toggle("app-compact", compact)
    root.style.colorScheme = theme === "light" ? "light" : "dark"
  }, [theme, compact])

  return { theme, compact, setTheme, setCompact }
}

export function eurostarDisplayClass(theme: EurostarTheme, compact: boolean): string {
  return `es-display es-theme-${theme}${compact ? " es-compact" : ""}`
}

export function EurostarDisplayStyles() {
  return <style>{`
    :root { --es-bg:#f7f8fa; --es-surface:#fff; --es-surface-2:#f4f6f8; --es-text:#101828; --es-muted:#667085; --es-border:#dfe3e8; }
    :root[data-app-theme="dark"] { --es-bg:#09111f; --es-surface:#111c2e; --es-surface-2:#17243a; --es-text:#f8fafc; --es-muted:#b6c2d2; --es-border:#30425c; }
    :root[data-app-theme="contrast"] { --es-bg:#000; --es-surface:#000; --es-surface-2:#090909; --es-text:#fff; --es-muted:#fff; --es-border:#fff; }
    .es-display { color:var(--es-text); }
    .es-theme-dark { --es-bg:#09111f; --es-surface:#111c2e; --es-surface-2:#17243a; --es-text:#f8fafc; --es-muted:#b6c2d2; --es-border:#30425c; }
    .es-theme-contrast { --es-bg:#000; --es-surface:#000; --es-surface-2:#090909; --es-text:#fff; --es-muted:#fff; --es-border:#fff; }
    .es-themed-panel { background:var(--es-surface) !important; border-color:var(--es-border) !important; color:var(--es-text) !important; }
    .es-display .es-adaptive-surface { background:var(--es-surface) !important; border-color:var(--es-border) !important; }
    .es-display .es-adaptive-muted { background:var(--es-surface-2) !important; }
    .es-display .es-adaptive-text { color:var(--es-text) !important; }
    .es-display .es-adaptive-subtle { color:var(--es-muted) !important; }
    .es-theme-dark .bg-white, .es-theme-contrast .bg-white { background-color:var(--es-surface) !important; }
    .es-theme-dark .bg-gray-50, .es-theme-dark .bg-gray-100,
    .es-theme-contrast .bg-gray-50, .es-theme-contrast .bg-gray-100 { background-color:var(--es-surface-2) !important; }
    .es-theme-dark .text-gray-800, .es-theme-dark .text-gray-700, .es-theme-dark .text-gray-600,
    .es-theme-contrast .text-gray-800, .es-theme-contrast .text-gray-700, .es-theme-contrast .text-gray-600 { color:var(--es-text) !important; }
    .es-theme-dark .text-gray-500, .es-theme-dark .text-gray-400,
    .es-theme-contrast .text-gray-500, .es-theme-contrast .text-gray-400 { color:var(--es-muted) !important; }
    .es-theme-dark .border-gray-100, .es-theme-dark .border-gray-200,
    .es-theme-contrast .border-gray-100, .es-theme-contrast .border-gray-200 { border-color:var(--es-border) !important; }
    .es-theme-light.es-legacy-dark [style*="color: rgba(255,255,255"],
    .es-theme-light.es-legacy-dark [style*="color: rgba(255, 255, 255"] { color:var(--es-text) !important; }
    .es-theme-light.es-legacy-dark [style*="background: rgba(255,255,255,0.04)"],
    .es-theme-light.es-legacy-dark [style*="background: rgba(255, 255, 255, 0.04)"] { background:var(--es-surface-2) !important; }
    .es-theme-light.es-legacy-dark .es-preserve-inverse,
    .es-theme-light.es-legacy-dark .es-preserve-inverse * { color:#fff !important; }
    .es-theme-contrast button:focus-visible, .es-theme-contrast input:focus-visible { outline:3px solid #ffdf00 !important; outline-offset:2px; }
    .es-theme-contrast button, .es-theme-contrast input { border-color:#fff !important; }
    .es-theme-contrast [style*="color:"] { color:#fff !important; }
    .es-theme-contrast .text-white\/50, .es-theme-contrast .text-white\/60,
    .es-theme-contrast .text-white\/80 { color:#fff !important; }
    .es-theme-contrast svg { filter:none !important; }
    .es-compact .es-density-card, .app-compact .es-density-card { padding:10px !important; gap:8px !important; }
    .es-compact .es-density-list, .app-compact .es-density-list { gap:6px !important; padding:8px !important; }
    .es-compact .es-density-hide, .app-compact .es-density-hide { display:none !important; }
  `}</style>
}

export function EurostarDisplayMenu({ inverted = false }: { readonly inverted?: boolean }) {
  const { theme, compact, setTheme, setCompact } = useEurostarDisplay()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative z-50">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex h-8 w-8 items-center justify-center rounded-lg border"
        style={{
          background: inverted ? "rgba(255,255,255,0.1)" : "var(--es-surface, #fff)",
          borderColor: inverted ? "rgba(255,255,255,0.24)" : "var(--es-border, #d0d5dd)",
          color: inverted ? "white" : "var(--es-text, #101828)",
        }}
        aria-label="Application display options"
        title="Display options"
      >
        {theme === "dark" ? <Moon size={14} /> : theme === "contrast" ? <Eye size={14} /> : <Sun size={14} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="es-themed-panel absolute right-0 top-full mt-1 w-44 rounded-lg border p-1.5 shadow-xl"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            {([
              ["light", "Light", Sun],
              ["dark", "Dark", Moon],
              ["contrast", "High contrast", Eye],
            ] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTheme(id)}
                className="es-adaptive-text flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-bold"
                style={{ background: theme === id ? "rgba(0,114,206,0.14)" : "transparent" }}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
            <div className="my-1 border-t" style={{ borderColor: "var(--es-border)" }} />
            <button
              type="button"
              onClick={() => setCompact(!compact)}
              className="es-adaptive-text flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-bold"
              style={{ background: compact ? "rgba(0,114,206,0.14)" : "transparent" }}
              aria-pressed={compact}
            >
              <Rows3 size={13} /> Compact <span className="ml-auto">{compact ? "On" : "Off"}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
