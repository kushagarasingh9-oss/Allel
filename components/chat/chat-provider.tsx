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
import { usePathname } from "next/navigation"
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
import { generateRefinedTitle, generateChatSessionTitle } from "@/intelligence/chat-titles"

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
  isResolvingTitle: boolean
  threadStateByAgent: Record<PersonaId, {
    messageCount: number
    status: ChatStatus
    lastMessagePreview: string | null
    lastMessageRole: UIMessage["role"] | null
  }>
  hydrationStatus: HydrationStatus
  savedSessions: SavedChatSession[]
  startNewChat: () => void
  switchSession: (sessionId: string, force?: boolean) => Promise<void> | void
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

  const pathname = usePathname()
  const isBriefPage = pathname === "/dashboard/brief"

  const [savedSessions, setSavedSessions] = React.useState<SavedChatSession[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const raw = window.localStorage.getItem("allel.chat-history.v1")
      if (raw) {
        const parsed = JSON.parse(raw) as SavedChatSession[]
        if (Array.isArray(parsed)) return parsed
      }
    } catch {}
    return []
  })
  const [currentSessionId, setCurrentSessionId] = React.useState<string>(() => {
    if (typeof window !== "undefined") {
      const urlSession = new URLSearchParams(window.location.search).get("sessionId")
      if (urlSession && urlSession !== "daily-brief") return urlSession
      const stored = window.localStorage.getItem("allel.current-session-id") || window.sessionStorage.getItem("allel.current-session-id")
      if (stored && stored !== "daily-brief") return stored
    }
    const fresh = `session-${Date.now()}`
    if (typeof window !== "undefined") {
      window.localStorage.setItem("allel.current-session-id", fresh)
    }
    return fresh
  })

  const currentSessionIdRef = React.useRef(currentSessionId)
  currentSessionIdRef.current = currentSessionId

  const isSwitchingSessionRef = React.useRef(false)
  const isHydratingSessionRef = React.useRef(false)
  const pendingLoadRef = React.useRef<UIMessage[] | null>(null)
  const skipHydrationRef = React.useRef(false)
  const restoredSessionIdRef = React.useRef<string | null>(null)
  const activeMessagesSessionIdRef = React.useRef<string>(currentSessionId)

  const resolvedStorageScope = React.useMemo(() => {
    if (!storageUserId || !storageWorkspaceId) return null
    return buildAgentChatStorageScope(
      { userId: storageUserId, workspaceId: storageWorkspaceId },
      currentSessionId
    )
  }, [storageUserId, storageWorkspaceId, currentSessionId])

  const scopeKey = resolvedStorageScope
    ? `${resolvedStorageScope.userId}:${resolvedStorageScope.workspaceId}:${resolvedStorageScope.sessionId}`
    : "anonymous"

  const chatRef = React.useRef<{
    scopeKey: string
    chat: Chat<UIMessage>
  } | null>(null)

  if (!chatRef.current || chatRef.current.scopeKey !== scopeKey) {
    const initialMessages = pendingLoadRef.current && pendingLoadRef.current.length > 0
      ? pendingLoadRef.current
      : undefined
    pendingLoadRef.current = null

    chatRef.current = {
      scopeKey,
      chat: new Chat<UIMessage>({
        id: buildPersonaThreadChatId(AGENT_ID, resolvedStorageScope),
        messages: initialMessages,
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
    onError: (err) => {
      console.warn("[chat-provider] Handled chat error:", err)
    },
  })

  // Prevent raw browser DOM Event rejections (e.g. chunk loading / network disconnect)
  // from crashing the application with [object Event]
  React.useEffect(() => {
    if (typeof window === "undefined") return
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (
        event.reason instanceof Event ||
        (event.reason && typeof event.reason === "object" && "isTrusted" in event.reason) ||
        String(event.reason) === "[object Event]"
      ) {
        event.preventDefault()
      }
    }
    window.addEventListener("unhandledrejection", handleUnhandledRejection)
    return () => window.removeEventListener("unhandledrejection", handleUnhandledRejection)
  }, [])

  const wrappedSendMessage = React.useCallback(
    (options: { text: string }) => {
      activeMessagesSessionIdRef.current = currentSessionId
      if (!messages || messages.length === 0) {
        if (typeof window !== "undefined" && currentSessionId !== "daily-brief" && !isBriefPage) {
          try {
            const url = new URL(window.location.href)
            if (url.pathname === "/dashboard") {
              url.searchParams.set("sessionId", currentSessionId)
              window.history.replaceState({}, "", url.toString())
            }
          } catch {
            // Ignore
          }
          window.sessionStorage.setItem("allel.current-session-id", currentSessionId)
          window.localStorage.setItem("allel.current-session-id", currentSessionId)
          window.dispatchEvent(
            new CustomEvent("allel:session-starting", {
              detail: { sessionId: currentSessionId },
            })
          )
        }
      }

      sendMessage(options)
    },
    [messages, sendMessage, currentSessionId, isBriefPage]
  )

  const persistThread = React.useCallback(() => {
    if (typeof window === "undefined" || !resolvedStorageScope) return

    const messagesToPersist = messages && messages.length > 0 ? messages : chat.messages
    const sanitized = sanitizeStoredPersonaMessages(messagesToPersist, {
      workspaceId: resolvedStorageScope.workspaceId,
      personaId: AGENT_ID,
    })

    const payload = { alex: sanitized, henry: [], sarah: [] }
    window.sessionStorage.setItem(
      buildPersonaThreadStorageKey(resolvedStorageScope),
      JSON.stringify(payload)
    )
  }, [chat.messages, messages, resolvedStorageScope])

  // Automatically persist messages whenever stream finishes or updates
  React.useEffect(() => {
    if (messages.length > 0 && status === "ready" && !isSwitchingSessionRef.current) {
      persistThread()
    }
  }, [messages, status, persistThread])

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
    const targetSessionId = resolvedStorageScope.sessionId
    if (!targetSessionId || restoredSessionIdRef.current === targetSessionId) return
    restoredSessionIdRef.current = targetSessionId

    // 1. Check if savedSessions has canonical messages for this active sessionId
    const foundInSaved = savedSessions.find((s) => s.id === targetSessionId)
    if (foundInSaved && foundInSaved.messages && foundInSaved.messages.length > 0) {
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
  }, [resolvedStorageScope?.sessionId])

  // ── Server Hydration ──
  React.useEffect(() => {
    if (typeof window === "undefined" || !resolvedStorageScope || !chatRef.current) return
    if (skipHydrationRef.current) {
      skipHydrationRef.current = false
      setHydrationStatus("restored")
      return
    }
    let cancelled = false
    const targetSessionId = resolvedStorageScope.sessionId
    isHydratingSessionRef.current = true
    setHydrationStatus("loading")

    async function hydrateFromServer() {
      try {
        const params = new URLSearchParams({
          agentId: AGENT_ID,
          sessionId: targetSessionId,
        })
        const response = await fetch(`/api/agent/history?${params}`)
        if (cancelled || targetSessionId !== currentSessionIdRef.current) return

        if (!response.ok) {
          setHydrationStatus("empty")
          return
        }

        const data = await response.json()
        const serverMessages = data.messages as UIMessage[] | undefined

        if (serverMessages && serverMessages.length > 0 && !cancelled && targetSessionId === currentSessionIdRef.current && chatRef.current) {
          const merged = reconcileConversationHistory(
            chatRef.current.chat.messages,
            serverMessages
          )
          chatRef.current.chat.messages = merged
          activeMessagesSessionIdRef.current = targetSessionId
          setMessages(merged)
          setHydrationStatus("restored")
          persistThread()
        } else {
          setHydrationStatus("empty")
        }
      } catch {
        if (!cancelled && targetSessionId === currentSessionIdRef.current) setHydrationStatus("empty")
      } finally {
        isHydratingSessionRef.current = false
      }
    }

    hydrateFromServer()
    return () => { cancelled = true; isHydratingSessionRef.current = false }
  }, [resolvedStorageScope?.sessionId])

  // ── Observable callbacks ──
  React.useEffect(() => {
    if (!chatRef.current) return
    const observableChat = chatRef.current.chat as ObservableChat
    const unregisterMessages = observableChat["~registerMessagesCallback"]?.(() => {
      if (!isSwitchingSessionRef.current) {
        persistThread()
      }
    })
    const unregisterStatus = observableChat["~registerStatusCallback"]?.(() => {})

    const cleanups = [unregisterMessages, unregisterStatus].filter(
      (cleanup): cleanup is () => void => typeof cleanup === "function"
    )

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [resolvedStorageScope?.sessionId])

  const isLoading = status === "submitted" || status === "streaming"

  const setAgentId = React.useCallback((_id: PersonaId) => {}, [])

  const resetActiveThread = React.useCallback(async () => {
    stop()
    clearError()
    chat.messages = []
    setMessages([])

    if (currentSessionId === "daily-brief") {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("allel.daily-brief-messages")
      }
      return
    }

    persistThread()

    if (typeof window === "undefined") return

    try {
      const response = await fetch(`/api/agent/sessions?sessionId=${encodeURIComponent(currentSessionId)}`, {
        method: "DELETE",
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
    currentSessionId,
    persistThread,
    setMessages,
    stop,
  ])

  // ── Saved Chat History Management ──
  // Reconcile saved sessions with authoritative server sessions on mount
  React.useEffect(() => {
    if (typeof window === "undefined") return

    async function syncSavedSessions() {
      try {
        const res = await fetch("/api/agent/sessions")
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data.sessions)) {
            const serverSessionIds = new Set(data.sessions.map((s: any) => s.sessionId))
            const raw = window.localStorage.getItem("allel.chat-history.v1")
            let validSessions: SavedChatSession[] = []
            if (raw) {
              try {
                const parsed = JSON.parse(raw) as SavedChatSession[]
                if (Array.isArray(parsed)) {
                  validSessions = parsed
                    .filter((s) => s && s.id && serverSessionIds.has(s.id))
                    .map((s) => {
                      const isContaminated =
                        s.id !== "daily-brief" &&
                        s.messages?.some((m) =>
                          m.parts?.some(
                            (p: any) =>
                              typeof p.text === "string" &&
                              (p.text.includes("Reading your inbox") ||
                                p.text.includes("threads total,") ||
                                p.text.includes("auto-cleared digests"))
                          )
                        )
                      if (isContaminated) {
                        return { ...s, messages: [], messageCount: 0 }
                      }
                      return s
                    })
                }
              } catch {
                validSessions = []
              }
            }

            // Merge server sessions not already in validSessions (e.g. fresh browser, new device, or DB sync)
            const existingIds = new Set(validSessions.map((s) => s.id))
            for (const s of data.sessions) {
              if (s.sessionId && !existingIds.has(s.sessionId)) {
                validSessions.push({
                  id: s.sessionId,
                  title: s.title || "Operational Run",
                  createdAt: s.updatedAt
                    ? new Date(s.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                  messageCount: s.messageCount || 0,
                  messages: [],
                })
              }
            }

            setSavedSessions(validSessions)
            try {
              window.localStorage.setItem("allel.chat-history.v1", JSON.stringify(validSessions))
            } catch {
              // Ignore storage write error
            }
          }
        }
      } catch {
        // Ignore network failure
      }
    }

    syncSavedSessions()
  }, [])

  const switchSession = React.useCallback(
    async (targetSessionId: string, force?: boolean) => {
      if (!targetSessionId || (!force && targetSessionId === currentSessionIdRef.current)) return

      stop()
      clearError()
      isSwitchingSessionRef.current = true

      // 1. Update session tracking
      currentSessionIdRef.current = targetSessionId
      setCurrentSessionId(targetSessionId)

      // 2. Sync browser URL & storage (only update history state if already on /dashboard)
      if (typeof window !== "undefined") {
        try {
          const url = new URL(window.location.href)
          if (url.pathname === "/dashboard") {
            url.searchParams.set("sessionId", targetSessionId)
            window.history.replaceState({}, "", url.toString())
          }
        } catch {
          // Ignore
        }

        window.sessionStorage.setItem("allel.current-session-id", targetSessionId)
        window.localStorage.setItem("allel.current-session-id", targetSessionId)
        if (storageUserId && storageWorkspaceId) {
          const storageKey = `allel.chat-session.${AGENT_CHAT_STORAGE_VERSION}:${storageUserId}:${storageWorkspaceId}`
          try {
            window.sessionStorage.setItem(storageKey, targetSessionId)
            window.localStorage.setItem(storageKey, targetSessionId)
          } catch {
            // Ignore
          }
        }
      }

      // 3. Check memory/localStorage cache
      let cached = savedSessions.find(
        (s) => s.id === targetSessionId && Array.isArray(s.messages) && s.messages.length > 0
      )
      if (!cached && typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem("allel.chat-history.v1")
          if (raw) {
            const parsed = JSON.parse(raw) as SavedChatSession[]
            if (Array.isArray(parsed)) {
              cached = parsed.find(
                (s) => s.id === targetSessionId && Array.isArray(s.messages) && s.messages.length > 0
              )
            }
          }
        } catch {
          // Ignore
        }
      }

      // Guard: If cached messages for a normal session appear contaminated with brief messages, skip cache and re-hydrate from authoritative server history
      const isContaminated =
        cached &&
        targetSessionId !== "daily-brief" &&
        cached.messages.some((m) =>
          m.parts?.some(
            (p: any) =>
              typeof p.text === "string" &&
              (p.text.includes("Reading your inbox") ||
                p.text.includes("threads total,") ||
                p.text.includes("auto-cleared digests") ||
                p.text.includes("reply-worthy"))
          )
        )

      if (cached && !isContaminated) {
        activeMessagesSessionIdRef.current = targetSessionId
        if (chatRef.current) {
          chatRef.current.chat.messages = cached.messages
        }
        pendingLoadRef.current = cached.messages
        skipHydrationRef.current = true
        restoredSessionIdRef.current = targetSessionId
        setMessages(cached.messages)
        setHydrationStatus("restored")
        isSwitchingSessionRef.current = false
        window.dispatchEvent(new CustomEvent("allel:refresh-history"))
        return
      }

      // 4. If not in cache, clear current messages immediately to prevent session bleeding
      activeMessagesSessionIdRef.current = targetSessionId
      if (chatRef.current) {
        chatRef.current.chat.messages = []
      }
      pendingLoadRef.current = null
      setMessages([])
      setHydrationStatus("loading")

      try {
        const params = new URLSearchParams({
          agentId: AGENT_ID,
          sessionId: targetSessionId,
        })
        const response = await fetch(`/api/agent/history?${params}`)
        if (response.ok && currentSessionIdRef.current === targetSessionId) {
          const data = await response.json()
          const serverMessages = (data.messages as UIMessage[]) || []
          if (serverMessages.length > 0) {
            activeMessagesSessionIdRef.current = targetSessionId
            if (chatRef.current) {
              chatRef.current.chat.messages = serverMessages
            }
            setMessages(serverMessages)
            setHydrationStatus("restored")
            // Cache locally so future clicks are instant
            setSavedSessions((prev) => {
              const existing = prev.find((s) => s.id === targetSessionId)
              const title =
                existing?.title &&
                existing.title !== "New Session" &&
                existing.title !== "New Conversation"
                  ? existing.title
                  : generateRefinedTitle(serverMessages)
              const item: SavedChatSession = {
                id: targetSessionId,
                title,
                createdAt: existing?.createdAt || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                messageCount: serverMessages.length,
                messages: serverMessages,
              }
              const updated = [item, ...prev.filter((s) => s.id !== targetSessionId)]
              try {
                window.localStorage.setItem("allel.chat-history.v1", JSON.stringify(updated))
              } catch {
                // Ignore
              }
              return updated
            })
          } else {
            setHydrationStatus("empty")
          }
        } else {
          setHydrationStatus("empty")
        }
      } catch (err) {
        console.error("[chat-provider] Failed to fetch session history:", err)
        setHydrationStatus("empty")
      } finally {
        isSwitchingSessionRef.current = false
        window.dispatchEvent(new CustomEvent("allel:refresh-history"))
      }
    },
    [clearError, savedSessions, setMessages, stop, storageUserId, storageWorkspaceId]
  )

  // Auto-save active chat session ONLY when streaming completes (status === 'ready')
  // Isolate Daily Brief session from main task sessions on route navigation
  // Sync active chat session on dashboard route navigation
  React.useEffect(() => {
    if (pathname === "/dashboard") {
      const urlSession = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("sessionId") : null
      if (urlSession && urlSession !== "daily-brief") {
        if (urlSession !== currentSessionIdRef.current || messages.length === 0 || activeMessagesSessionIdRef.current === "daily-brief") {
          switchSession(urlSession, true)
          return
        }
      } else if (!urlSession) {
        if (currentSessionId === "daily-brief" || activeMessagesSessionIdRef.current === "daily-brief") {
          const lastTask = typeof window !== "undefined" ? window.sessionStorage.getItem("allel.last-task-session-id") : null
          const targetId = (lastTask && lastTask !== "daily-brief") ? lastTask : `session-${Date.now()}`
          switchSession(targetId, true)
        } else if (currentSessionId && messages.length === 0) {
          const isKnownExisting = savedSessions.some((s) => s.id === currentSessionId)
          if (isKnownExisting) {
            switchSession(currentSessionId, true)
          }
        }
      }
    }
  }, [pathname, currentSessionId, switchSession, messages.length])

  React.useEffect(() => {
    if (typeof window === "undefined" || messages.length === 0) return
    if (isSwitchingSessionRef.current || isHydratingSessionRef.current) return
    if (status !== "ready") return // Settle all updates before persisting
    if (activeMessagesSessionIdRef.current !== currentSessionId) return // Guard: Never persist stale messages from previous session

    const hasUserMsg = messages.some((m) => m.role === "user")
    if (!hasUserMsg) return

    if (currentSessionId === "daily-brief" || isBriefPage || activeMessagesSessionIdRef.current === "daily-brief") {
      return
    }

    if (pathname === "/dashboard") {
      try {
        const url = new URL(window.location.href)
        if (url.searchParams.get("sessionId") !== currentSessionId) {
          url.searchParams.set("sessionId", currentSessionId)
          window.history.replaceState({}, "", url.toString())
        }
      } catch {
        // Ignore
      }
    }

    setSavedSessions((prev) => {
      const existing = prev.find((s) => s.id === currentSessionId)
      // Keep established title; only derive new title if uninitialized
      const title = existing && existing.title && existing.title !== "New Session" && existing.title !== "New Conversation"
        ? existing.title
        : generateRefinedTitle(messages)

      if (existing && existing.messageCount === messages.length && existing.title === title) {
        return prev
      }

      const sessionItem: SavedChatSession = {
        id: currentSessionId,
        title,
        createdAt: existing?.createdAt || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        messageCount: messages.length,
        messages,
      }

      const filtered = prev.filter((s) => s.id !== currentSessionId)
      const updated = [sessionItem, ...filtered]
      try {
        window.localStorage.setItem("allel.chat-history.v1", JSON.stringify(updated))
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("allel:refresh-history"))
        }, 0)
      } catch {
        // Ignore
      }
      return updated
    })
  }, [messages, currentSessionId, status, isBriefPage])

  const startNewChat = React.useCallback(() => {
    stop()
    clearError()
    isSwitchingSessionRef.current = true
    const newSessionId = `session-${Date.now()}`
    activeMessagesSessionIdRef.current = newSessionId
    if (typeof window !== "undefined") {
      try {
        const url = new URL(window.location.href)
        if (url.pathname === "/dashboard") {
          url.searchParams.delete("sessionId")
          window.history.replaceState({}, "", url.toString())
        }
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
    restoredSessionIdRef.current = newSessionId
    currentSessionIdRef.current = newSessionId
    setCurrentSessionId(newSessionId)
    setMessages([])
    setHydrationStatus("empty")
    isSwitchingSessionRef.current = false
    window.dispatchEvent(new CustomEvent("allel:refresh-history"))
  }, [clearError, setMessages, stop, storageUserId, storageWorkspaceId])

  const loadChatSession = React.useCallback((session: SavedChatSession) => {
    if (session && session.id) {
      switchSession(session.id)
    }
  }, [switchSession])

  // Listen for custom allel:load-session event from sidebar for smooth hydration without full browser reload
  React.useEffect(() => {
    const handleLoadSession = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail && detail.sessionId) {
        switchSession(detail.sessionId)
      }
    }
    window.addEventListener("allel:load-session", handleLoadSession)
    return () => window.removeEventListener("allel:load-session", handleLoadSession)
  }, [switchSession])

  const deleteChatSession = React.useCallback(async (id: string) => {
    // 1. Immediately remove from local history state & storage so any immediate reload/history poll never sees it
    setSavedSessions((prev) => {
      const updated = prev.filter((s) => s.id !== id)
      try {
        window.localStorage.setItem("allel.chat-history.v1", JSON.stringify(updated))
      } catch {
        // Ignore
      }
      return updated
    })

    // 2. Clean sessionStorage and per-session thread caches using AGENT_CHAT_STORAGE_VERSION
    if (typeof window !== "undefined") {
      try {
        if (storageUserId && storageWorkspaceId) {
          window.sessionStorage.removeItem(`allel.persona-threads.${AGENT_CHAT_STORAGE_VERSION}:${storageUserId}:${storageWorkspaceId}:${id}`)
          window.sessionStorage.removeItem(`allel.persona-threads.v1:${storageUserId}:${storageWorkspaceId}:${id}`)
        }
      } catch {
        // Ignore
      }
    }

    // 3. If currently open session was deleted, immediately reset active chat state
    if (id === currentSessionIdRef.current) {
      stop()
      clearError()
      isSwitchingSessionRef.current = true
      const newSessionId = `session-${Date.now()}`
      if (typeof window !== "undefined") {
        try {
          const url = new URL(window.location.href)
          if (url.pathname === "/dashboard") {
            url.searchParams.delete("sessionId")
            window.history.replaceState({}, "", url.toString())
          }
        } catch {
          // Ignore
        }
        window.sessionStorage.setItem("allel.current-session-id", newSessionId)
        window.localStorage.setItem("allel.current-session-id", newSessionId)
      }
      if (chatRef.current) {
        chatRef.current.chat.messages = []
      }
      restoredSessionIdRef.current = newSessionId
      currentSessionIdRef.current = newSessionId
      setCurrentSessionId(newSessionId)
      setMessages([])
      isSwitchingSessionRef.current = false
    }

    // 4. Delete database record in Supabase via unified endpoint
    try {
      await fetch(`/api/agent/sessions?sessionId=${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
    } catch (dbErr) {
      console.error("[chat-provider] Failed to delete conversation from DB", dbErr)
    }

    // 5. Notify sidebar to refresh history from updated local + remote state
    window.dispatchEvent(new CustomEvent("allel:refresh-history"))
  }, [clearError, setMessages, stop, storageUserId, storageWorkspaceId])

  const activeSessionTitle = React.useMemo(() => {
    const existing = savedSessions.find((s) => s.id === currentSessionId)
    if (existing && existing.title && existing.title !== "New Session" && existing.title !== "New Conversation") {
      return existing.title
    }
    if (!messages || messages.length === 0) return null
    if (activeMessagesSessionIdRef.current !== currentSessionId) return null
    return generateRefinedTitle(messages)
  }, [messages, savedSessions, currentSessionId])

  const isResolvingTitle = React.useMemo(() => {
    if (!messages || messages.length === 0) return false
    const existing = savedSessions.find((s) => s.id === currentSessionId)
    const hasAssistantText = messages.some((m) => {
      if (m.role !== "assistant") return false
      const textParts = m.parts?.filter((p) => p.type === "text").map((p) => (p as { text?: string }).text ?? "").join("").trim() ?? ""
      return textParts.length > 0
    })
    return isLoading && !hasAssistantText && (!existing || existing.title === "New Session" || existing.title === "New Conversation")
  }, [messages, savedSessions, currentSessionId, isLoading])

  const contextValue = React.useMemo<ChatContextType>(
    () => ({
      currentSessionId,
      messages,
      sendMessage: wrappedSendMessage,
      stop,
      status,
      isLoading,
      error,
      agentId: AGENT_ID,
      setAgentId,
      resetActiveThread,
      activeSessionTitle,
      isResolvingTitle,
      threadStateByAgent: threadState,
      hydrationStatus,
      savedSessions,
      startNewChat,
      switchSession,
      loadChatSession,
      deleteChatSession,
    }),
    [
      currentSessionId,
      messages,
      wrappedSendMessage,
      stop,
      status,
      isLoading,
      error,
      setAgentId,
      resetActiveThread,
      activeSessionTitle,
      isResolvingTitle,
      threadState,
      hydrationStatus,
      savedSessions,
      startNewChat,
      switchSession,
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
