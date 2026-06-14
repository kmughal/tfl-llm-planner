import { motion } from "framer-motion"
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Clock3 } from "lucide-react"
import { eurostarDisplayClass, useEurostarDisplay } from "./EurostarDisplay"

interface Service { scheduled:string; expected:string; delay:number; operator:string; place:string; placeCrs:string; platform:string; status:string; trainId:string; reason:string }
interface Board { kind:"departures"|"arrivals"; station:string; crs:string; generated:string; filter:string; notices:string[]; services:Service[] }

function parseBoard(raw:string): Board | null {
  const header = raw.match(/NRAIL_BOARD_START:([^|]+)\|([^|]+)\|([^|]+)\|([^|]*)\|(\d+)\|([^\n]*)/)
  if (header) {
    const services = raw.split("\n").filter(line => line.startsWith("NRAIL_SERVICE:")).map(line => {
      const p = line.slice(14).split("|")
      return { scheduled:p[0]||"--:--", expected:p[1]||"On time", delay:Number(p[2])||0, operator:p[3]||"National Rail", place:p[4]||"Unknown", placeCrs:p[5]||"", platform:p[6]||"TBC", status:p[7]||"on-time", trainId:p[8]||"", reason:p[10]||"" }
    })
    return { kind:header[1] === "arrivals" ? "arrivals" : "departures", station:header[2], crs:header[3], generated:header[4], filter:header[6].trim(), notices:raw.split("\n").filter(l=>l.startsWith("NRAIL_NOTICE:")).map(l=>l.slice(13)), services }
  }
  const legacy = raw.match(/NRAIL_START:([^|]+)\|([^|]+)\|(\d+)/)
  if (!legacy) return null
  const services = raw.split("\n").filter(l=>l.startsWith("DEP:")).map(line => { const p=line.slice(4).split("|"); return {scheduled:p[0],expected:p[1],delay:Number(p[2])||0,operator:p[3],place:p[4],placeCrs:"",platform:p[5]||"TBC",status:p[1]==="Cancelled"?"cancelled":Number(p[2])>0?"delayed":"on-time",trainId:"",reason:""} })
  return {kind:"departures",station:legacy[1],crs:legacy[2],generated:"",filter:"",notices:[],services}
}

export function NationalRailCard({ result }: { readonly result:string }) {
  const board = parseBoard(result)
  const { theme, compact } = useEurostarDisplay()
  if (!board) return null
  const delayed = board.services.filter(s=>s.status==="delayed").length
  const cancelled = board.services.filter(s=>s.status==="cancelled").length
  const accent = board.kind === "arrivals" ? "#00a88f" : "#ee7203"
  const Icon = board.kind === "arrivals" ? ArrowDownToLine : ArrowUpFromLine
  return <motion.section className={`${eurostarDisplayClass(theme,compact)} es-themed-panel w-full max-w-3xl overflow-hidden rounded-lg border shadow-xl`} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
    <div className="es-preserve-inverse relative overflow-hidden bg-[#17365d] px-5 py-4 text-white">
      <motion.div className="absolute bottom-0 left-0 h-1 bg-white/90" initial={{width:0}} animate={{width:`${Math.max(12,Math.min(100,board.services.length*8))}%`}} transition={{duration:1}} />
      <div className="relative flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md" style={{background:accent}}><Icon size={19}/></span>
        <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/60">National Rail live {board.kind}</p><h3 className="text-lg font-black">{board.station} <span className="text-white/45">{board.crs}</span></h3></div>
        <div className="ml-auto flex gap-4 text-right"><Metric value={board.services.length} label="Services"/><Metric value={delayed} label="Delayed" warn={delayed>0}/><Metric value={cancelled} label="Cancelled" warn={cancelled>0}/></div>
      </div>
    </div>
    {board.notices.map((notice,i)=><div key={i} className="flex items-start gap-2 border-b px-5 py-2.5 text-xs" style={{borderColor:"var(--es-border)",background:"color-mix(in srgb, #f59e0b 12%, var(--es-surface))"}}><AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600"/><span>{notice}</span></div>)}
    <div className="grid gap-px" style={{background:"var(--es-border)"}}>
      {board.services.map((s,i)=><motion.div key={`${s.trainId}-${s.scheduled}-${i}`} className="es-density-card grid grid-cols-[58px_minmax(130px,1fr)_86px_66px] items-center gap-3 bg-[var(--es-surface)] px-5 py-3" initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}} transition={{delay:i*.035}}>
        <div><div className="font-mono text-lg font-black tabular-nums">{s.scheduled||"--:--"}</div><div className="text-[9px] font-bold uppercase" style={{color:"var(--es-muted)"}}>{board.kind==="arrivals"?"Due":"Departs"}</div></div>
        <div className="min-w-0"><div className="truncate text-sm font-black">{s.place} {s.placeCrs&&<span style={{color:"var(--es-muted)"}}>· {s.placeCrs}</span>}</div><div className="truncate text-[10px]" style={{color:"var(--es-muted)"}}>{s.operator}{s.trainId?` · ${s.trainId}`:""}</div></div>
        <Status service={s}/>
        <div className="text-right"><div className="inline-flex min-w-10 justify-center rounded-md border px-2 py-1 font-mono text-sm font-black" style={{borderColor:"var(--es-border)",background:"var(--es-surface-2)"}}>{s.platform}</div><div className="mt-1 text-[8px] font-bold uppercase" style={{color:"var(--es-muted)"}}>Platform</div></div>
      </motion.div>)}
    </div>
    <div className="flex items-center gap-2 px-5 py-2 text-[10px]" style={{color:"var(--es-muted)"}}><Clock3 size={11}/><span>{board.generated ? `Feed generated ${new Date(board.generated).toLocaleTimeString("en-GB")}` : "Live Darwin data via Huxley2"}</span>{board.filter&&<span className="ml-auto font-bold">Filtered: {board.filter}</span>}</div>
  </motion.section>
}

function Metric({value,label,warn=false}:{value:number;label:string;warn?:boolean}) { return <div><div className={`text-lg font-black ${warn?"text-amber-300":"text-white"}`}>{value}</div><div className="text-[8px] font-bold uppercase text-white/45">{label}</div></div> }
function Status({service}:{service:Service}) {
  if(service.status==="cancelled") return <div className="text-xs font-black text-red-600"><AlertTriangle size={13} className="mb-1"/>Cancelled</div>
  if(service.delay>0) return <div><div className="font-mono text-sm font-black text-amber-600">{service.expected}</div><div className="text-[9px] font-bold text-amber-600">+{service.delay} min</div></div>
  return <div className="flex items-center gap-1 text-xs font-black text-emerald-600"><CheckCircle2 size={13}/>On time</div>
}
