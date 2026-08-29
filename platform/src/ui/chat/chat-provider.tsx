"use client"

/**
 * ChatProvider — Shared context between AI_Prompt and AgentFeed.
 *
 * Wraps the Vercel AI SDK useChat() hook so:
 * - AI_Prompt can submit messages
 * - AgentFeed can render streaming responses with tool-call rendering
 *
 * Uses a single unified Allel agent (internal ID: 'alex').
 */

import * as React from "react"
import { Chat, useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import type { UIMessage } from "ai"
import type { PersonaId } from "@/agent/personas/personas"
import { buildAgentChatStorageScope, AGENT_CHAT_STORAGE_VERSION } from "@/agent/memory/chat-session"
import {
  buildPersonaThreadChatId,
  buildPersonaThreadStorageKey,
  reconcileConversationHistory,
  resolveChatStorageScope,
  sanitizeStoredPersonaMessages,
  type ResolvedChatStorageScope,
  type ChatStorageScope,
} from "@/ui/chat/chat-storage"

type ChatStatus = "ready" | "submitted" | "streaming" | "error"

type HydrationStatus = "idle" | "loading" | "restored" | "empty"

/** The unified agent ID — backward-compatible with the old 'alex' persona */
const AGENT_ID: PersonaId = "alex"

export type SavedChatSession = {
  id: string
  title: string
  createdAt: string
  messageCount: number
  messages: UIMessage[]
}

type ChatContextType = {
  messages: UIMessage[]
  sendMessage: (params: { text: string }) => void
  stop: () => void
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
  savedSessions: SavedChatSession[]
  startNewChat: () => void
  loadChatSession: (session: SavedChatSession) => void
  deleteChatSession: (id: string) => void
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

export function useOptionalChatContext() {
  return React.useContext(ChatContext)
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
  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(null)
  const pendingLoadRef = React.useRef<UIMessage[] | null>(null)
  const skipHydrationRef = React.useRef(false)

  const resolvedStorageScope = React.useMemo(() => {
    if (!storageUserId || !storageWorkspaceId) return null
    if (activeSessionId) {
      return buildAgentChatStorageScope(
        { userId: storageUserId, workspaceId: storageWorkspaceId },
        activeSessionId
      )
    }
    return resolveChatStorageScope({
      userId: storageUserId,
      workspaceId: storageWorkspaceId,
    })
  }, [storageUserId, storageWorkspaceId, activeSessionId])

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

  // Apply pending messages from loadChatSession after Chat object is recreated
  if (pendingLoadRef.current && pendingLoadRef.current.length > 0) {
    chat.messages = pendingLoadRef.current
    pendingLoadRef.current = null
  }
  const [hydrationStatus, setHydrationStatus] = React.useState<HydrationStatus>("idle")

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

  const persistThread = React.useCallback(() => {
    if (typeof window === "undefined" || !resolvedStorageScope) return

    const messagesToPersist = messages && messages.length > 0 ? messages : chat.messages
    const sanitized = sanitizeStoredPersonaMessages(messagesToPersist, {
      workspaceId: resolvedStorageScope.workspaceId,
      personaId: AGENT_ID,
    })

    // Store under the same key format for backward compatibility
    const payload = { alex: sanitized, henry: [], sarah: [] }
    window.sessionStorage.setItem(
      buildPersonaThreadStorageKey(resolvedStorageScope),
      JSON.stringify(payload)
    )
  }, [chat.messages, messages, resolvedStorageScope])

  // Automatically persist messages whenever stream finishes or updates
  React.useEffect(() => {
    if (messages.length > 0 && status === "ready") {
      persistThread()
    }
  }, [messages, status, persistThread])

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

      if (sanitizedMessages.length > 0 && chatRef.current) {
        chatRef.current.chat.messages = sanitizedMessages
        setMessages(sanitizedMessages)
      }
    } catch {
      window.sessionStorage.removeItem(
        buildPersonaThreadStorageKey(resolvedStorageScope)
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedStorageScope?.sessionId])

  // ── Server Hydration ──
  React.useEffect(() => {
    if (typeof window === "undefined" || !resolvedStorageScope || !chatRef.current) return
    if (hydrationStatus !== "idle") return
    // Skip server hydration when explicitly loading from local history
    if (skipHydrationRef.current) {
      skipHydrationRef.current = false
      setHydrationStatus("restored")
      return
    }
    // Deliberately no "local state already populated, skip the fetch" shortcut.
    // Local Restore runs first (it is declared above this effect), so that
    // shortcut meant the lossy sessionStorage copy always beat the canonical
    // server record and earlier turns disappeared on reload.
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

        if (serverMessages && serverMessages.length > 0 && !cancelled && chatRef.current) {
          // Server wins, but a turn appended after the last save exists only
          // locally and must survive.
          const merged = reconcileConversationHistory(
            chatRef.current.chat.messages,
            serverMessages
          )
          chatRef.current.chat.messages = merged
          setMessages(merged)
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
  }, [resolvedStorageScope?.sessionId])

  // ── Observable callbacks ──
  React.useEffect(() => {
    if (!chatRef.current) return
    const observableChat = chatRef.current.chat as ObservableChat
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedStorageScope?.sessionId])

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

  // ── Saved Chat History Management ──
  const [savedSessions, setSavedSessions] = React.useState<SavedChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = React.useState<string>(() => {
    // Restore session ID from localStorage to prevent resetting history on reload
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("allel.current-session-id") || window.sessionStorage.getItem("allel.current-session-id")
      if (stored) return stored
    }
    const fresh = `session-${Date.now()}`
    if (typeof window !== "undefined") {
      window.localStorage.setItem("allel.current-session-id", fresh)
    }
    return fresh
  })

  // Load saved sessions from localStorage on mount, re-title and deduplicate
  React.useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const raw = window.localStorage.getItem("allel.chat-history.v1")
      if (raw) {
        const parsed = JSON.parse(raw) as SavedChatSession[]
        // Re-generate titles for all stored sessions using the latest logic
        const refreshed = parsed.map((session) => ({
          ...session,
          title: session.messages?.length > 0
            ? generateRefinedTitle(session.messages)
            : session.title,
        }))
        // Deduplicate: if multiple entries share the same title, keep only the newest
        const seen = new Set<string>()
        const deduped = refreshed.filter((session) => {
          if (seen.has(session.title)) return false
          seen.add(session.title)
          return true
        })
        setSavedSessions(deduped)
        // Persist the cleaned list back
        window.localStorage.setItem("allel.chat-history.v1", JSON.stringify(deduped))
      }
    } catch {
      // Ignore storage read error
    }
  }, [])

function generateRefinedTitle(messages: UIMessage[]): string {
  const userMsgs = messages.filter((m) => m.role === "user")
  if (userMsgs.length === 0) return "Casual Greeting"

  // Collect all user text, strip greeting prefixes
  const allUserText = userMsgs
    .map((m) => {
      const textPart = Array.isArray(m.parts)
        ? m.parts.find((p) => p.type === "text")
        : null
      return textPart && "text" in textPart ? textPart.text : (m as unknown as { content?: string }).content
    })
    .filter((txt): txt is string => typeof txt === "string" && txt.trim().length > 0)
    .map((txt) =>
      txt
        .trim()
        .replace(/^(hey|hi|hello|yo|heyyy|bruv|bro|sup)(\s+(brother|bro|man|friend|fam|dude))?,?\s*/i, "")
        .trim()
    )
    .join(" ")
    .toLowerCase()

  // Fuzzy domain matching — catches typos like "rveneu", "gamil", "strpi", etc.
  const domainRules: [RegExp, string][] = [
    [/\b(e?mail|inbox|gmail|gamil|mial|draft|thread|reply)\b/, "Email & Inbox Management"],
    [/\b(stri?pe?|bill|mrr|churn|reven|subscri|invoice|payment)\b/, "Billing & Revenue"],
    [/\b(posthog|analyt|usage|event|engage|metric|track)\b/, "Product Analytics"],
    [/\b(notion|knowle|docs?|wiki|knowledge|page)\b/, "Knowledge Base"],
    [/\b(linear|issue|bug|ticket|sprint|project)\b/, "Issue Tracking"],
    [/\b(sentry|error|crash|exception|monitor)\b/, "Error Monitoring"],
    [/\b(hubspot|crm|contact|deal|sales|lead|pipeline)\b/, "CRM & Sales"],
    [/\b(discount|rescue|coupon|save|retain)\b/, "Rescue & Retention"],
    [/\b(what can|capabilit|feature|integrat|connect)\b/, "Exploring Capabilities"],
    [/\b(onboard|signup|activat|convert|funnel)\b/, "Onboarding & Activation"],
    [/\b(compet|market|benchmark|research|trend)\b/, "Market Research"],
    [/\b(team|hire|ops|process|workflow)\b/, "Operations & Team"],
  ]

  for (const [pattern, title] of domainRules) {
    if (pattern.test(allUserText)) {
      return title
    }
  }

  return "General Discussion"
}

  // Notify sidebar on session initialization and auto-save active chat session when status is ready
  React.useEffect(() => {
    if (typeof window === "undefined" || messages.length === 0) return
    const hasUserMsg = messages.some((m) => m.role === "user")
    if (!hasUserMsg) return

    if (status === "submitted" || status === "streaming") {
      const isExistingSession = savedSessions.some((s) => s.id === currentSessionId)
      const userMsgCount = messages.filter((m) => m.role === "user").length
      if (!isExistingSession && userMsgCount <= 1) {
        window.dispatchEvent(
          new CustomEvent("allel:session-starting", {
            detail: { sessionId: currentSessionId }
          })
        )
      }
      return
    }

    if (status !== "ready") return

    const title = generateRefinedTitle(messages)

    const sessionItem: SavedChatSession = {
      id: currentSessionId,
      title,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      messageCount: messages.length,
      messages,
    }

    setSavedSessions((prev) => {
      const existing = prev.find((s) => s.id === currentSessionId)
      if (existing && existing.messageCount === messages.length && existing.title === title) {
        return prev
      }

      const filtered = prev.filter((s) => s.id !== currentSessionId)
      const updated = [sessionItem, ...filtered].slice(0, 30)
      try {
        window.localStorage.setItem("allel.chat-history.v1", JSON.stringify(updated))
      } catch {
        // Ignore
      }
      return updated
    })

    window.dispatchEvent(new CustomEvent("allel:refresh-history"))
  }, [messages, currentSessionId, status])

  const startNewChat = React.useCallback(() => {
    stop()
    clearError()
    const newSessionId = `session-${Date.now()}`
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("allel.current-session-id", newSessionId)
      window.localStorage.setItem("allel.current-session-id", newSessionId)
      if (storageUserId && storageWorkspaceId) {
        const storageKey = `allel.chat-session.${AGENT_CHAT_STORAGE_VERSION}:${storageUserId}:${storageWorkspaceId}`
        try {
          window.sessionStorage.setItem(storageKey, newSessionId)
          window.localStorage.setItem(storageKey, newSessionId)
        } catch {
          // Ignore storage write error
        }
      }
    }
    chatRef.current = null
    setActiveSessionId(newSessionId)
    setCurrentSessionId(newSessionId)
    setMessages([])
  }, [clearError, setMessages, stop, storageUserId, storageWorkspaceId])

  const loadChatSession = React.useCallback((session: SavedChatSession) => {
    stop()
    clearError()
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("allel.current-session-id", session.id)
      window.localStorage.setItem("allel.current-session-id", session.id)
      if (storageUserId && storageWorkspaceId) {
        const storageKey = `allel.chat-session.${AGENT_CHAT_STORAGE_VERSION}:${storageUserId}:${storageWorkspaceId}`
        try {
          window.sessionStorage.setItem(storageKey, session.id)
          window.localStorage.setItem(storageKey, session.id)
        } catch {
          // Ignore storage write error
        }
      }
    }
    // Queue the messages to be applied after the new Chat object is created
    pendingLoadRef.current = session.messages
    skipHydrationRef.current = true
    chatRef.current = null
    setActiveSessionId(session.id)
    setCurrentSessionId(session.id)
    setMessages(session.messages)
  }, [clearError, setMessages, stop, storageUserId, storageWorkspaceId])

  // Listen for custom allel:load-session event from sidebar for smooth hydration without full browser reload
  React.useEffect(() => {
    const handleLoadSession = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.sessionId) {
        const found = savedSessions.find((s) => s.id === detail.sessionId);
        if (found) {
          loadChatSession(found);
        } else {
          stop();
          clearError();
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem("allel.current-session-id", detail.sessionId);
            window.localStorage.setItem("allel.current-session-id", detail.sessionId);
          }
          chatRef.current = null;
          setActiveSessionId(detail.sessionId);
          setCurrentSessionId(detail.sessionId);
        }
      }
    };
    window.addEventListener("allel:load-session", handleLoadSession);
    return () => window.removeEventListener("allel:load-session", handleLoadSession);
  }, [savedSessions, loadChatSession, stop, clearError])

  const deleteChatSession = React.useCallback(async (id: string) => {
    // 1. Remove from local history list
    setSavedSessions((prev) => {
      const updated = prev.filter((s) => s.id !== id)
      try {
        window.localStorage.setItem("allel.chat-history.v1", JSON.stringify(updated))
      } catch {
        // Ignore
      }
      return updated
    })

    // 2. Delete database record in Supabase
    try {
      await fetch(`/api/agent?agentId=${AGENT_ID}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id }),
      })
    } catch (dbErr) {
      console.error("[chat-provider] Failed to delete conversation from DB", dbErr)
    }

    // 3. If currently open session was deleted, start clean fresh chat
    if (id === currentSessionId) {
      startNewChat()
    }
  }, [currentSessionId, startNewChat])

  const contextValue = React.useMemo<ChatContextType>(
    () => ({
      messages,
      sendMessage,
      stop,
      status,
      isLoading,
      error,
      agentId: AGENT_ID,
      setAgentId,
      resetActiveThread,
      threadStateByAgent: threadState,
      hydrationStatus,
      savedSessions,
      startNewChat,
      loadChatSession,
      deleteChatSession,
    }),
    [
      messages,
      sendMessage,
      stop,
      status,
      isLoading,
      error,
      setAgentId,
      resetActiveThread,
      threadState,
      hydrationStatus,
      savedSessions,
      startNewChat,
      loadChatSession,
      deleteChatSession,
    ]
  )

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  )
}
