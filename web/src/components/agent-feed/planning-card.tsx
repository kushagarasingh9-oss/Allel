import * as React from "react"
import { cn } from "@/lib/utils"
import { CheckCircle2, Circle, Link, ChevronLeft, ChevronRight } from "lucide-react"

export interface PlanningItem {
  id: string
  label: string
  completed: boolean
}

export interface PlanningCardProps {
  title: string
  items: PlanningItem[]
  timestamp?: string
  page?: number
  totalPages?: number
}

export function GenerativePlanningCard({ 
    title, 
    items, 
    timestamp = "Created 6:39 AM", 
    page = 2, 
    totalPages = 2 
}: PlanningCardProps) {
  const completedCount = items.filter(i => i.completed).length
  const totalCount = items.length

  return (
    <div className="w-full max-w-[400px] bg-[#0a0a0a] border border-[#262626] rounded-sm flex flex-col mt-4">
      
      {/* Header Bar */}
      <div className="flex items-center justify-between p-4 border-b border-[#262626]">
         <div className="bg-[#1f1f1f] text-neutral-300 text-xs font-medium px-2.5 py-1 rounded-sm">
            Planning
         </div>
         <button className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors">
            <Link className="w-3.5 h-3.5" />
            <span>Share Chat</span>
         </button>
      </div>

      {/* Main Task Body */}
      <div className="p-5 flex flex-col">
         <div className="flex justify-between items-start mb-6">
            <h3 className="text-[14px] font-medium text-neutral-200">{title}</h3>
            <span className="text-xs text-neutral-500 font-medium whitespace-nowrap ml-4">
               {completedCount} of {totalCount} done
            </span>
         </div>

         <div className="flex flex-col gap-3.5">
            {items.map((item) => (
                <div key={item.id} className="flex gap-3 items-start group">
                    <div className="shrink-0 mt-[2px]">
                        {item.completed ? (
                            <CheckCircle2 className="w-[15px] h-[15px] text-neutral-500" />
                        ) : (
                            <Circle className="w-[15px] h-[15px] text-neutral-600" />
                        )}
                    </div>
                    <span className={cn(
                        "text-[13px] leading-[1.4] transition-colors",
                        item.completed 
                           ? "text-neutral-500 line-through decoration-neutral-600" 
                           : "text-neutral-300 group-hover:text-white"
                    )}>
                        {item.label}
                    </span>
                </div>
            ))}
         </div>
      </div>

      {/* Footer Area */}
      <div className="mt-auto flex items-center justify-between p-4 px-5 pt-2">
         <span className="text-xs text-neutral-500">{timestamp}</span>
         <div className="flex items-center gap-3">
             <div className="flex items-center gap-2">
                <button className="text-neutral-600 hover:text-white transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                <button className="text-neutral-600 hover:text-white transition-colors"><ChevronRight className="w-4 h-4" /></button>
             </div>
             <span className="text-xs text-neutral-500">{page} / {totalPages}</span>
         </div>
      </div>

    </div>
  )
}
