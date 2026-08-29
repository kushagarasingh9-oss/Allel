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
  currentSessionId: string
  messages: UIMessage[]
  sendMessage: (params: { text: string }) => void
  stop: () => void
  status: ChatStatus
  isLoading: boolean
  error: Error | undefined
  agentId: PersonaId
  setAgentId: (id: PersonaId) => void
  resetActiveThread: () => Promise<void>
  activeSessionTitle: string | null
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
  const [savedSessions, setSavedSessions] = React.useState<SavedChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = React.useState<string>(() => {
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

    // 1. Check if savedSessions has canonical messages for this active sessionId
    const foundInSaved = savedSessions.find((s) => s.id === resolvedStorageScope.sessionId)
    if (foundInSaved) {
      if (chatRef.current) {
        chatRef.current.chat.messages = foundInSaved.messages
      }
      setMessages(foundInSaved.messages)
      return
    }

    // 2. Fallback to sessionStorage for session-specific thread
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
  }, [resolvedStorageScope?.sessionId, savedSessions])

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
  if (userMsgs.length === 0) return "New Conversation"

  // Collect raw text from user messages
  const userTexts: string[] = []
  for (const m of userMsgs) {
    const textPart = Array.isArray(m.parts)
      ? m.parts.find((p) => p.type === "text")
      : null
    const txt = textPart && "text" in textPart ? textPart.text : (m as unknown as { content?: string }).content
    if (typeof txt === "string" && txt.trim().length > 0) {
      userTexts.push(txt.trim())
    }
  }

  if (userTexts.length === 0) return "New Conversation"

  const combinedRaw = userTexts.join(" ")

  // Clean prompt: strip leading dots, punctuation, greetings, bot names, filler phrases
  let cleaned = combinedRaw
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/^(hey|hi|hello|yo|heyyy|bruv|bro|sup|please|can\s+you|could\s+you|get\s+me|show\s+me|check|triage|look\s+at)\b[.,!?\s]*/i, "")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/^(allel|alex|bot|ai|agent)\b[.,!?\s]*/i, "")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/^(hey|hi|hello|get\s+me|show\s+me|check)\b[.,!?\s]*/i, "")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .trim()

  if (!cleaned) {
    cleaned = combinedRaw.replace(/^[^a-zA-Z0-9]+/, "").trim()
  }

  const lower = (cleaned + " " + combinedRaw).toLowerCase()

  // Domain matching rules
  if (/\b(e?mails?|inbox|gmail|gamil|mials?|drafts?|threads?|repl(y|ies)|newsletters?)\b/i.test(lower)) {
    return "Email & Inbox Management"
  }
  if (/\b(stri?pe?|bills?|billing|mrr|churn|revenues?|subscri(be|ption|ptions)|invoices?|payments?)\b/i.test(lower)) {
    return "Billing & Revenue"
  }
  if (/\b(posthogs?|analytics?|telemetr(y|ies)|cohorts?|events?|funnels?|metrics?|insights?|tracking)\b/i.test(lower)) {
    return "Product Analytics"
  }
  if (/\b(intercoms?|crisp|zendesk|support|tickets?|helpdesk|conversations?|chats?)\b/i.test(lower)) {
    return "Customer Support & Intercom"
  }
  if (/\b(calendars?|meetings?|schedules?|events?|briefs?|agendas?|sync)\b/i.test(lower)) {
    return "Calendar & Meetings"
  }
  if (/\b(notions?|knowledges?|docs?|wikis?|pages?|notes?)\b/i.test(lower)) {
    return "Knowledge Base"
  }
  if (/\b(linears?|issues?|bugs?|tickets?|sprints?|tasks?|projects?)\b/i.test(lower)) {
    return "Issue Tracking"
  }
  if (/\b(sentry|errors?|crash(es)?|exceptions?|monitors?|alerts?)\b/i.test(lower)) {
    return "Error Monitoring"
  }
  if (/\b(hubspots?|crms?|contacts?|deals?|sales?|leads?|pipelines?)\b/i.test(lower)) {
    return "CRM & Sales"
  }

  // Clean fallback: Capitalize first 4 words of cleaned prompt
  const words = cleaned
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)

  if (words.length > 0) {
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ")
  }

  return "New Session"
}

  // Auto-save active chat session immediately on user prompt and refresh history
  React.useEffect(() => {
    if (typeof window === "undefined" || messages.length === 0) return
    const hasUserMsg = messages.some((m) => m.role === "user")
    if (!hasUserMsg) return

    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get("sessionId") !== currentSessionId) {
        url.pathname = "/dashboard"
        url.searchParams.set("sessionId", currentSessionId)
        window.history.pushState({}, "", url.toString())
      }
    } catch {
      // Ignore
    }

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
      try {
        const url = new URL(window.location.href)
        url.pathname = "/dashboard"
        url.searchParams.set("sessionId", newSessionId)
        window.history.pushState({}, "", url.toString())
      } catch {
        // Ignore
      }

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
    if (chatRef.current) {
      chatRef.current.chat.messages = []
    }
    setActiveSessionId(newSessionId)
    setCurrentSessionId(newSessionId)
    setMessages([])
    window.dispatchEvent(new CustomEvent("allel:refresh-history"))
  }, [clearError, setMessages, stop, storageUserId, storageWorkspaceId])

  const loadChatSession = React.useCallback((session: SavedChatSession) => {
    stop()
    clearError()
    if (typeof window !== "undefined") {
      try {
        const url = new URL(window.location.href)
        url.pathname = "/dashboard"
        url.searchParams.set("sessionId", session.id)
        window.history.pushState({}, "", url.toString())
      } catch {
        // Ignore
      }

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
    if (chatRef.current) {
      chatRef.current.chat.messages = session.messages
    }
    pendingLoadRef.current = session.messages
    skipHydrationRef.current = true
    setActiveSessionId(session.id)
    setCurrentSessionId(session.id)
    setMessages(session.messages)
    window.dispatchEvent(new CustomEvent("allel:refresh-history"))
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

  const activeSessionTitle = React.useMemo(() => {
    if (!messages || messages.length === 0) return null
    const existing = savedSessions.find((s) => s.id === currentSessionId)
    if (existing && existing.title) return existing.title
    return generateRefinedTitle(messages)
  }, [messages, savedSessions, currentSessionId])

  const contextValue = React.useMemo<ChatContextType>(
    () => ({
      currentSessionId,
      messages,
      sendMessage,
      stop,
      status,
      isLoading,
      error,
      agentId: AGENT_ID,
      setAgentId,
      resetActiveThread,
      activeSessionTitle,
      threadStateByAgent: threadState,
      hydrationStatus,
      savedSessions,
      startNewChat,
      loadChatSession,
      deleteChatSession,
    }),
    [
      currentSessionId,
      messages,
      sendMessage,
      stop,
      status,
      isLoading,
      error,
      setAgentId,
      resetActiveThread,
      activeSessionTitle,
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
