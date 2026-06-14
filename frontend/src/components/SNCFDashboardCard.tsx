import { motion } from "framer-motion"
import { AlertTriangle, ArrowRight, TrainFront } from "lucide-react"
import { EurostarDisplayStyles, eurostarDisplayClass, useEurostarDisplay } from "./EurostarDisplay"

type Service = { time: string; delay: number; mode: string; direction: string }
type Board = { station: string; services: Service[] }

function parseDashboard(raw: string) {
  const start = /SNCF_DASHBOARD_START:(\d+)\|(\d+)/.exec(raw)
  if (!start) return null
  const boards: Board[] = []
  let current: Board | null = null
  let incidents = 0
  for (const line of raw.split("\n")) {
    if (line.startsWith("SNCF_BOARD:")) {
      current = { station: line.slice(11).split("|")[0], services: [] }
      boards.push(current)
    } else if (line.startsWith("SNCF_SERVICE:") && current) {
      const p = line.slice(13).split("|")
      current.services.push({ time:p[0], delay:Number(p[2]) || 0, mode:p[3], direction:p[5] })
    } else if (line.startsWith("SNCF_INCIDENT:")) incidents++
  }
  return { boards, incidents: incidents || Number(start[2]) }
}

export function SNCFDashboardCard({ result }: { readonly result: string }) {
  const data = parseDashboard(result)
  const { theme, compact } = useEurostarDisplay()
  if (!data) return null
  const services = data.boards.flatMap(board => board.services)
  const delayed = services.filter(service => service.delay > 0).length
  const health = services.length ? Math.round(((services.length - delayed) / services.length) * 100) : 0

  return <motion.div className={`${eurostarDisplayClass(theme,compact)} es-themed-panel overflow-hidden rounded-lg border`} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}}>
    <EurostarDisplayStyles />
    <div className="p-4 text-white" style={{background:"linear-gradient(120deg,#8f001e,#d6006d)"}}>
      <div className="flex items-center gap-2"><TrainFront size={17}/><span className="text-sm font-black">SNCF network picture</span><span className="ml-auto text-2xl font-black">{health}%</span></div>
      <div className="mt-3 grid grid-cols-3 gap-2">{[[services.length,"departures"],[delayed,"delayed"],[data.incidents,"incidents"]].map(([value,label])=><div key={label} className="rounded-lg border border-white/20 bg-black/10 p-2"><div className="text-xl font-black">{value}</div><div className="text-[10px] text-white/65">{label}</div></div>)}</div>
    </div>
    <div className="grid grid-cols-2 gap-2 p-3 max-md:grid-cols-1">
      {data.boards.map((board,index)=><motion.div key={board.station} className="es-adaptive-muted rounded-lg p-3" initial={{opacity:0,x:-6}} animate={{opacity:1,x:0}} transition={{delay:index*.06}}><div className="es-adaptive-text mb-2 truncate text-xs font-black">{board.station}</div>{board.services.slice(0,2).map((service,i)=><div key={`${service.time}-${i}`} className="flex items-center gap-2 py-1 text-[11px]"><span className="es-adaptive-text font-black tabular-nums">{service.time}</span><span className="rounded px-1 text-[9px] font-bold text-white" style={{background:"#e05206"}}>{service.mode}</span><span className="es-adaptive-subtle min-w-0 flex-1 truncate">{service.direction}</span><ArrowRight size={11}/></div>)}</motion.div>)}
    </div>
    {data.incidents > 0 && <div className="flex items-center gap-2 border-t px-4 py-2 text-xs font-bold text-amber-600" style={{borderColor:"var(--es-border)"}}><AlertTriangle size={13}/>{data.incidents} active SNCF network alerts</div>}
  </motion.div>
}
