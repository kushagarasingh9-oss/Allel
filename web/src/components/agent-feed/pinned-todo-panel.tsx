"use client"

import * as React from "react"
import { Maximize2, Minimize2, ChevronDown, ExternalLink, Loader2 } from "lucide-react"
import { useWorkspace } from "@/components/dashboard/workspace-layout"

export function PinnedTodoPanel() {
    const { isExpanded, toggleExpanded } = useWorkspace()
    const [isOpen, setIsOpen] = React.useState(true)

    return (
        <div className="absolute top-6 left-6 right-6 z-40 flex items-start justify-between pointer-events-none">
            {/* Left Top Floating Workflow Status Box (Removed) */}

            {/* Right Layout Expand/Collapse Toggle */}
            <div className="pointer-events-auto">
                <button 
                    onClick={toggleExpanded}
                    className="flex items-center justify-center p-2 bg-[#4A4D54]/75 backdrop-blur-2xl border border-white/20 rounded-xl hover:bg-white/20 transition-all shadow-md text-white/80 hover:text-white"
                    title={isExpanded ? "Collapse View" : "Expand View"}
                >
                    {isExpanded ? (
                       <Minimize2 className="w-4 h-4" />
                    ) : (
                       <Maximize2 className="w-4 h-4" />
                    )}
                </button>
            </div>
        </div>
    )
}

