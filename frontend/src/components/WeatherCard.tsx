import { useRef } from "react"
import { motion, useInView } from "framer-motion"
import { Wind, Droplets, Thermometer } from "lucide-react"

const WMO_ICON: Record<string, string> = {
  "Clear sky": "☀️",
  "Partly cloudy": "⛅",
  "Fog": "🌫️",
  "Drizzle": "🌦️",
  "Rain": "🌧️",
  "Snow": "🌨️",
  "Snow grains": "🌨️",
  "Showers": "🌦️",
  "Snow showers": "🌨️",
  "Thunderstorm": "⛈️",
  "Unknown": "🌡️",
}

const BG_GRADIENT: Record<string, string> = {
  "Clear sky": "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
  "Partly cloudy": "linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)",
  "Fog": "linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)",
  "Drizzle": "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
  "Rain": "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
  "Snow": "linear-gradient(135deg, #bfdbfe 0%, #93c5fd 100%)",
  "Snow grains": "linear-gradient(135deg, #bfdbfe 0%, #93c5fd 100%)",
  "Showers": "linear-gradient(135deg, #818cf8 0%, #6366f1 100%)",
  "Snow showers": "linear-gradient(135deg, #bfdbfe 0%, #93c5fd 100%)",
  "Thunderstorm": "linear-gradient(135deg, #374151 0%, #111827 100%)",
  "Unknown": "linear-gradient(135deg, #374151 0%, #1f2937 100%)",
}

interface CurrentData {
  temp: number
  feelsLike: number
  humidity: number
  windMph: number
  description: string
}

interface ForecastItem {
  time: string
  temp: number
  description: string
}

interface Parsed {
  city: string
  current: CurrentData
  forecast: ForecastItem[]
}

function parseWeather(raw: string): Parsed | null {
  const startMatch = /WEATHER_START:([^|\n]+)\|/.exec(raw)
  if (!startMatch) return null
  const city = startMatch[1].trim()

  const currentMatch = /CURRENT:([\d.]+)\|([\d.]+)\|(\d+)\|([\d.]+)\|\d+\|([^\n]+)/.exec(raw)
  if (!currentMatch) return null

  const current: CurrentData = {
    temp: parseFloat(currentMatch[1]),
    feelsLike: parseFloat(currentMatch[2]),
    humidity: parseInt(currentMatch[3]),
    windMph: parseFloat(currentMatch[4]),
    description: currentMatch[5].trim(),
  }

  const forecast: ForecastItem[] = []
  for (const line of raw.split("\n")) {
    if (!line.startsWith("FORECAST:")) continue
    const p = line.slice(9).split("|")
    if (p.length < 3) continue
    forecast.push({ time: p[0], temp: parseFloat(p[1]), description: p[3]?.trim() ?? p[2]?.trim() })
  }

  return { city, current, forecast }
}

function ForecastDot({ item, index }: { readonly item: ForecastItem; readonly index: number }) {
  const icon = WMO_ICON[item.description] ?? "🌡️"
  return (
    <motion.div
      className="flex flex-col items-center gap-1"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 + index * 0.06, duration: 0.3 }}
    >
      <span className="text-white/40 text-[9px] font-mono tabular-nums">{item.time}</span>
      <span className="text-base leading-none">{icon}</span>
      <span className="text-white text-[11px] font-bold tabular-nums">{Math.round(item.temp)}°</span>
    </motion.div>
  )
}

export function WeatherCard({ result }: { readonly result: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true })
  const parsed = parseWeather(result)
  if (!parsed) return null

  const { city, current, forecast } = parsed
  const icon = WMO_ICON[current.description] ?? "🌡️"
  const headerBg = BG_GRADIENT[current.description] ?? BG_GRADIENT["Unknown"]

  return (
    <motion.div
      ref={ref}
      className="rounded-2xl overflow-hidden shadow-2xl"
      style={{ border: "1px solid rgba(255,255,255,0.07)", backgroundColor: "#0B1018", maxWidth: 380 }}
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Header */}
      <div className="relative overflow-hidden px-5 py-4" style={{ background: headerBg }}>
        <motion.div
          className="absolute inset-y-0 w-32 pointer-events-none"
          style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent)" }}
          animate={{ x: [-128, 500] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear", repeatDelay: 3 }}
        />
        <div className="relative flex items-center justify-between">
          <div>
            <div className="text-white font-bold text-base leading-tight">{city}</div>
            <div className="text-white/70 text-[11px] font-semibold uppercase tracking-widest mt-0.5">
              Current Weather
            </div>
          </div>
          <motion.span
            className="text-5xl leading-none"
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            {icon}
          </motion.span>
        </div>
      </div>

      {/* Current stats */}
      <div className="px-5 py-4">
        <div className="flex items-end gap-3 mb-4">
          <motion.span
            className="text-6xl font-black tabular-nums leading-none text-white"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.15, duration: 0.35, ease: "backOut" }}
          >
            {Math.round(current.temp)}°
          </motion.span>
          <div className="pb-1">
            <div className="text-white/60 text-sm font-medium">{current.description}</div>
            <div className="text-white/35 text-[11px]">Feels {Math.round(current.feelsLike)}°C</div>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-4">
          {[
            { icon: <Droplets className="w-3.5 h-3.5" />, value: `${current.humidity}%`, label: "Humidity" },
            { icon: <Wind className="w-3.5 h-3.5" />, value: `${Math.round(current.windMph)} mph`, label: "Wind" },
            { icon: <Thermometer className="w-3.5 h-3.5" />, value: `${Math.round(current.feelsLike)}°C`, label: "Feels like" },
          ].map(({ icon, value, label }, i) => (
            <motion.div
              key={label}
              className="flex items-center gap-1.5"
              style={{ color: "rgba(255,255,255,0.45)" }}
              initial={{ opacity: 0, x: -6 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.2 + i * 0.07, duration: 0.3 }}
            >
              {icon}
              <div>
                <div className="text-white text-[12px] font-bold leading-none">{value}</div>
                <div className="text-[9px] mt-0.5 leading-none">{label}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Hourly forecast */}
      {forecast.length > 0 && (
        <div
          className="px-5 pb-4"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="text-white/25 text-[9px] font-bold uppercase tracking-widest pt-3 mb-3">Today's forecast</div>
          <div className="flex justify-between">
            {forecast.slice(0, 6).map((item, i) => (
              <ForecastDot key={item.time} item={item} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div
        className="flex items-center gap-1.5 px-5 py-2"
        style={{ backgroundColor: "#080D14", borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <motion.div
          className="w-1.5 h-1.5 rounded-full bg-emerald-400"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 2.5, repeat: Infinity }}
        />
        <span className="text-[9px] font-mono text-white/20">Open-Meteo · Live</span>
      </div>
    </motion.div>
  )
}
