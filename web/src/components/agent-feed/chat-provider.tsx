"use client"

/**
 * ChatProvider — Shared context between AI_Prompt and AgentFeed.
 *
 * Wraps the Vercel AI SDK useChat() hook so:
 * - AI_Prompt can submit messages
 * - AgentFeed can render streaming responses with tool-call rendering
 *
 * Uses a single unified Cofounder agent (internal ID: 'alex').
 */

import * as React from "react"
import { Chat, useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import type { UIMessage } from "ai"
import type { PersonaId } from "@/lib/agent/personas"
import {
  buildPersonaThreadChatId,
  buildPersonaThreadStorageKey,
  resolveChatStorageScope,
  sanitizeStoredPersonaMessages,
  type ResolvedChatStorageScope,
  type ChatStorageScope,
} from "@/components/agent-feed/chat-storage"

type ChatStatus = "ready" | "submitted" | "streaming" | "error"

type HydrationStatus = "idle" | "loading" | "restored" | "empty"

/** The unified agent ID — backward-compatible with the old 'alex' persona */
const AGENT_ID: PersonaId = "alex"

type ChatContextType = {
  messages: UIMessage[]
  sendMessage: (params: { text: string }) => void
  status: ChatStatus
  isLoading: boolean
  error: Error | undefined
  agentId: PersonaId
  setAgentId: (id: PersonaId) => void
  resetActiveThread: () => Promise<void>
  threadStateByAgent: Record<PersonaId, {
    messageCount: number
    status: ChatStatus
    lastMessagePreview: string | null
    lastMessageRole: UIMessage["role"] | null
  }>
  hydrationStatus: HydrationStatus
}

const ChatContext = React.createContext<ChatContextType | null>(null)

type ObservableChat = Chat<UIMessage> & {
  ["~registerMessagesCallback"]?: (onChange: () => void) => () => void
  ["~registerStatusCallback"]?: (onChange: () => void) => () => void
}

function getMessagePreview(message: UIMessage | null | undefined) {
  if (!message) return null

  const parts = Array.isArray(message.parts) ? message.parts : []
  const preview = parts
    .filter((part): part is Extract<(typeof parts)[number], { type: "text" }> =>
      part.type === "text"
    )
    .map((part) => part.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    || (typeof (message as unknown as { content?: string }).content === 'string'
      ? (message as unknown as { content: string }).content.replace(/\s+/g, " ").trim()
      : '')

  if (!preview) return null
  if (preview.length <= 96) return preview

  return `${preview.slice(0, 93).trimEnd()}...`
}

function getThreadState(chat: Chat<UIMessage>) {
  const lastMessage = [...chat.messages]
    .reverse()
    .find((message) => getMessagePreview(message))

  return {
    messageCount: chat.messages.length,
    status: chat.status as ChatStatus,
    lastMessagePreview: getMessagePreview(lastMessage),
    lastMessageRole: lastMessage?.role ?? null,
  }
}

export function useChatContext() {
  const ctx = React.useContext(ChatContext)
  if (!ctx) {
    throw new Error("useChatContext must be used within ChatProvider")
  }
  return ctx
}

export function ChatProvider({
  children,
  storageScope,
}: {
  children: React.ReactNode
  storageScope?: ChatStorageScope | null
}) {
  const storageUserId = storageScope?.userId ?? null
  const storageWorkspaceId = storageScope?.workspaceId ?? null
  const resolvedStorageScope = React.useMemo(
    () =>
      storageUserId && storageWorkspaceId
        ? resolveChatStorageScope({
          userId: storageUserId,
          workspaceId: storageWorkspaceId,
        })
        : null,
    [storageUserId, storageWorkspaceId]
  )
  const scopeKey = resolvedStorageScope
    ? `${resolvedStorageScope.userId}:${resolvedStorageScope.workspaceId}:${resolvedStorageScope.sessionId}`
    : "anonymous"

  const chatRef = React.useRef<{
    scopeKey: string
    chat: Chat<UIMessage>
  } | null>(null)

  if (!chatRef.current || chatRef.current.scopeKey !== scopeKey) {
    chatRef.current = {
      scopeKey,
      chat: new Chat<UIMessage>({
        id: buildPersonaThreadChatId(AGENT_ID, resolvedStorageScope),
        transport: new DefaultChatTransport({
          api: `/api/agent?agentId=${AGENT_ID}`,
          body: resolvedStorageScope
            ? { sessionId: resolvedStorageScope.sessionId }
            : undefined,
        }),
      }),
    }
  }

  const chat = chatRef.current.chat
  const [hydrationStatus, setHydrationStatus] = React.useState<HydrationStatus>("idle")

  const persistThread = React.useCallback(() => {
    if (typeof window === "undefined" || !resolvedStorageScope) return

    const sanitized = sanitizeStoredPersonaMessages(chat.messages, {
      workspaceId: resolvedStorageScope.workspaceId,
      personaId: AGENT_ID,
    })

    // Store under the same key format for backward compatibility
    const payload = { alex: sanitized, henry: [], sarah: [] }
    window.sessionStorage.setItem(
      buildPersonaThreadStorageKey(resolvedStorageScope),
      JSON.stringify(payload)
    )
  }, [chat, resolvedStorageScope])

  const {
    messages,
    sendMessage,
    status,
    error,
    setMessages,
    stop,
    clearError,
  } = useChat({
    chat,
  })

  // Build a single-entry threadStateByAgent for backward compatibility
  const threadState = React.useMemo(() => {
    const state = getThreadState(chat)
    return {
      alex: state,
      henry: { messageCount: 0, status: "ready" as ChatStatus, lastMessagePreview: null, lastMessageRole: null },
      sarah: { messageCount: 0, status: "ready" as ChatStatus, lastMessagePreview: null, lastMessageRole: null },
    }
  }, [chat, messages, status])

  // ── Local Restore ──
  React.useEffect(() => {
    if (typeof window === "undefined" || !resolvedStorageScope) return

    const raw = window.sessionStorage.getItem(
      buildPersonaThreadStorageKey(resolvedStorageScope)
    )
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as Partial<Record<PersonaId, unknown>>
      const storedMessages = parsed[AGENT_ID]
      const sanitizedMessages = sanitizeStoredPersonaMessages(storedMessages, {
        workspaceId: resolvedStorageScope.workspaceId,
        personaId: AGENT_ID,
      })

      if (sanitizedMessages.length > 0) {
        chat.messages = sanitizedMessages
        setMessages(sanitizedMessages)
      }
    } catch {
      window.sessionStorage.removeItem(
        buildPersonaThreadStorageKey(resolvedStorageScope)
      )
    }
  }, [chat, resolvedStorageScope, setMessages])

  // ── Server Hydration ──
  React.useEffect(() => {
    if (typeof window === "undefined" || !resolvedStorageScope) return
    if (hydrationStatus !== "idle") return
    if (chat.messages.length > 0) {
      setHydrationStatus("empty")
      return
    }

    let cancelled = false
    setHydrationStatus("loading")

    async function hydrateFromServer() {
      try {
        const params = new URLSearchParams({
          agentId: AGENT_ID,
          sessionId: resolvedStorageScope!.sessionId,
        })
        const response = await fetch(`/api/agent/history?${params}`)
        if (!response.ok || cancelled) return

        const data = await response.json()
        const serverMessages = data.messages as UIMessage[] | undefined

        if (serverMessages && serverMessages.length > 0 && !cancelled) {
          chat.messages = serverMessages
          setMessages(serverMessages)
          setHydrationStatus("restored")
          persistThread()
        } else {
          setHydrationStatus("empty")
        }
      } catch {
        if (!cancelled) setHydrationStatus("empty")
      }
    }

    hydrateFromServer()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedStorageScope?.sessionId, chat, persistThread, setMessages])

  // ── Observable callbacks ──
  React.useEffect(() => {
    const observableChat = chat as ObservableChat
    const unregisterMessages = observableChat["~registerMessagesCallback"]?.(() => {
      persistThread()
    })
    const unregisterStatus = observableChat["~registerStatusCallback"]?.(() => {
      // status change handled by useChat hook
    })

    const cleanups = [unregisterMessages, unregisterStatus].filter(
      (cleanup): cleanup is () => void => typeof cleanup === "function"
    )

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [chat, persistThread])

  const isLoading = status === "submitted" || status === "streaming"

  // setAgentId is a no-op now (kept for backward compat)
  const setAgentId = React.useCallback((_id: PersonaId) => {
    // No-op: single unified agent
  }, [])

  const resetActiveThread = React.useCallback(async () => {
    stop()
    clearError()
    chat.messages = []
    setMessages([])
    persistThread()

    if (typeof window === "undefined") return

    try {
      const response = await fetch(`/api/agent?agentId=${AGENT_ID}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: resolvedStorageScope?.sessionId,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to reset thread")
      }
    } catch (resetError) {
      console.error("[chat-provider] Failed to reset persisted thread", resetError)
    }
  }, [
    chat,
    clearError,
    persistThread,
    resolvedStorageScope?.sessionId,
    setMessages,
    stop,
  ])

  const contextValue = React.useMemo<ChatContextType>(
    () => ({
      messages,
      sendMessage,
      status,
      isLoading,
      error,
      agentId: AGENT_ID,
      setAgentId,
      resetActiveThread,
      threadStateByAgent: threadState,
      hydrationStatus,
    }),
    [
      messages,
      sendMessage,
      status,
      isLoading,
      error,
      setAgentId,
      resetActiveThread,
      threadState,
      hydrationStatus,
    ]
  )

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  )
}
