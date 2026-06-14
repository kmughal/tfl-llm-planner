import { Activity, AlertTriangle, TrainFront } from "lucide-react"
import { motion } from "framer-motion"

export function NationalRailDashboardCard({result}:{readonly result:string}) {
  const hubs=result.split("\n").filter(l=>l.startsWith("NRAIL_HUB:")).map(l=>{const p=l.slice(10).split("|");return{name:p[0],crs:p[1],services:+p[2],delayed:+p[3],cancelled:+p[4],state:p[5]}})
  const alerts=result.split("\n").filter(l=>l.startsWith("NRAIL_ALERT:")).map(l=>{const p=l.slice(12).split("|");return{hub:p[0],message:p.slice(1).join("|")}})
  if(!hubs.length)return null
  return <motion.div className="es-themed-panel w-full max-w-3xl overflow-hidden rounded-lg border shadow-xl" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}}>
    <div className="es-preserve-inverse flex items-center gap-3 bg-[#17365d] px-5 py-4 text-white"><Activity size={19}/><div><div className="text-[10px] font-black uppercase tracking-[.15em] text-white/55">National Rail</div><div className="text-base font-black">Mainline operating picture</div></div><span className="ml-auto text-xs font-bold text-emerald-300">Live</span></div>
    <div className="grid grid-cols-2 gap-px bg-[var(--es-border)] sm:grid-cols-3">{hubs.map((h,i)=><motion.div key={h.crs} className="bg-[var(--es-surface)] p-4" initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*.05}}><div className="flex items-center justify-between"><TrainFront size={15}/><span className="font-mono text-[10px] font-black" style={{color:"var(--es-muted)"}}>{h.crs}</span></div><div className="mt-3 truncate text-xs font-black">{h.name}</div><div className="mt-2 flex gap-3 text-[10px]"><span>{h.services} trains</span><span className={h.delayed?"text-amber-600":"text-emerald-600"}>{h.delayed} late</span></div></motion.div>)}</div>
    {alerts.slice(0,3).map((a,i)=><div key={i} className="flex gap-2 border-t px-5 py-2.5 text-xs" style={{borderColor:"var(--es-border)"}}><AlertTriangle size={13} className="shrink-0 text-amber-600"/><b>{a.hub}</b><span>{a.message}</span></div>)}
  </motion.div>
}
