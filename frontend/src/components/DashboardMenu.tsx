import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown, LayoutDashboard, TrainFront } from "lucide-react"

export function DashboardMenu({ onEurostar, onTfl, onSncf, onNationalRail }: { readonly onEurostar: () => void; readonly onTfl: () => void; readonly onSncf: () => void; readonly onNationalRail: () => void }) {
  const [open, setOpen] = useState(false)
  const items = [
    { id: "eurostar", label: "Eurostar", detail: "Cross-channel operations", color: "#0072ce", action: onEurostar },
    { id: "tfl", label: "TfL", detail: "London network", color: "#e32017", action: onTfl },
    { id: "sncf", label: "SNCF", detail: "French national rail", color: "#e2001a", action: onSncf },
    { id: "national-rail", label: "National Rail", detail: "UK mainline operations", color: "#17365d", action: onNationalRail },
  ]
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(value => !value)} className="flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1.5 text-[11px] font-semibold text-white/55 transition hover:border-white/10 hover:bg-white/5 hover:text-white/80" aria-label="Open dashboard menu">
        <LayoutDashboard size={13}/><span className="hidden sm:inline">Dashboards</span><ChevronDown size={12}/>
      </button>
      <AnimatePresence>
        {open && <motion.div className="absolute right-0 top-full z-[90] mt-2 w-64 overflow-hidden rounded-lg border border-white/10 bg-[#0b1220] p-2 shadow-2xl" initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}}>
          <div className="px-2 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Operating dashboards</div>
          {items.map(item => <button key={item.id} type="button" onClick={() => { item.action(); setOpen(false) }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/7">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{background:item.color}}><TrainFront size={15}/></span>
            <span><span className="block text-xs font-black text-white">{item.label}</span><span className="block text-[10px] text-white/40">{item.detail}</span></span>
          </button>)}
        </motion.div>}
      </AnimatePresence>
    </div>
  )
}
