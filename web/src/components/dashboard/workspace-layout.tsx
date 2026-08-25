"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { ChatProvider } from "@/components/agent-feed/chat-provider"
import type { ChatStorageScope } from "@/components/agent-feed/chat-storage"

interface WorkspaceContextType {
  isExpanded: boolean
  toggleExpanded: () => void
}

export const WorkspaceContext = React.createContext<WorkspaceContextType>({
  isExpanded: false,
  toggleExpanded: () => {}
})

export function useWorkspace() {
  return React.useContext(WorkspaceContext)
}

export function WorkspaceLayout({ 
  leftPane, 
  rightPane,
  chatStorageScope,
}: { 
  leftPane: React.ReactNode, 
  rightPane: React.ReactNode 
  chatStorageScope?: ChatStorageScope | null
}) {
  const [isExpanded, setIsExpanded] = React.useState(false)

  return (
    <ChatProvider storageScope={chatStorageScope}>
      <WorkspaceContext.Provider value={{ isExpanded, toggleExpanded: () => setIsExpanded(!isExpanded) }}>
        <div className="flex h-full w-full bg-[#FAFAFC] dark:bg-[#141416] overflow-hidden">
          {/* Left Pane wrapped in transition */}
          <div 
            className={cn(
              "shrink-0 h-full transition-[width,opacity,padding,margin] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden bg-[#FAFAFC] dark:bg-[#141416]",
              isExpanded ? "w-0 opacity-0 pointer-events-none" : "w-[40%] opacity-100"
            )}
          >
            {leftPane}
          </div>
          
          {/* Right Pane stretches automatically */}
          <div className="flex-1 h-full min-w-0 bg-white dark:bg-[#141416] relative overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] border-l border-neutral-200 dark:border-[#222226]">
            {rightPane}
          </div>
        </div>
      </WorkspaceContext.Provider>
    </ChatProvider>
  )
}
