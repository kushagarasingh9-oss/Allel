"use client"

/**
 * AgentPane — The right-pane client component that wires
 * AgentFeed + AI_Prompt together using the shared ChatProvider.
 *
 * ChatProvider is now at the WorkspaceLayout level so both
 * panes can access the chat context.
 */

import * as React from "react"
import { useChatContext } from "@/ui/chat/chat-provider"
import { AgentFeed } from "@/ui/chat/agent-feed"
import { AI_Prompt } from "@/ui/primitives/animated-ai-input"
import { PinnedTodoPanel } from "@/ui/chat/pinned-todo-panel"

export function AgentPane() {
  const { sendMessage, isLoading, stop, resetActiveThread } = useChatContext()

  // Listen for "Proceed with tasks" events from the left pane
  React.useEffect(() => {
    const handleProceed = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.text) {
        sendMessage({ text: detail.text })
      }
    }
    window.addEventListener('allel:proceed-tasks', handleProceed)
    return () => window.removeEventListener('allel:proceed-tasks', handleProceed)
  }, [sendMessage])

  return (
    <main 
      className="flex-1 flex flex-col h-full bg-transparent relative overflow-hidden"
    >
      {/* Global Pinned Planning Panel */}
      <PinnedTodoPanel />

      {/* Scrollable Agent Feed (real messages, not mock) */}
      <AgentFeed />

      {/* Pinned AI Prompt — unified Allel agent */}
      <div className="w-full max-w-2xl px-8 pb-8 mx-auto mt-auto shrink-0 flex justify-center">
        <AI_Prompt
          onSubmit={(text) => sendMessage({ text })}
          onStop={stop}
          isLoading={isLoading}
          onResetThread={resetActiveThread}
        />
      </div>
    </main>
  )
}

