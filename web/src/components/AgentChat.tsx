'use client'

/**
 * AgentChat — Founder's conversational interface with the Cofounder agent.
 *
 * Uses AI SDK v6 useChat() with HttpChatTransport for streaming.
 */

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useState, useRef, useEffect, useCallback } from 'react'

const SUGGESTIONS = [
  'Which accounts need attention today?',
  'What happened with Acme Studio?',
  'Draft a save email for high-risk accounts',
  'Give me a daily brief summary',
  'Show me all at-risk accounts',
]

export default function AgentChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/agent',
    }),
  })

  const isLoading = status === 'submitted' || status === 'streaming'

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim() || isLoading) return
      sendMessage({ text: text.trim() })
      setInputValue('')
    },
    [sendMessage, isLoading]
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSend(inputValue)
  }

  const handleSuggestion = (text: string) => {
    handleSend(text)
  }

  /**
   * Extract text content from a message's parts array (AI SDK v6 format)
   */
  const getMessageText = (msg: (typeof messages)[number]): string => {
    if (!msg.parts) return ''
    return msg.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('')
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        id="agent-chat-trigger"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] shadow-lg shadow-[#6366f130] transition-all hover:scale-105 hover:shadow-xl hover:shadow-[#6366f140]"
        title="Talk to Cofounder Agent"
      >
        {isOpen ? (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[540px] w-[420px] flex-col overflow-hidden rounded-[24px] border border-[#ffffff12] bg-[#0a0a0b] shadow-2xl shadow-black/40">
          {/* Header */}
          <div className="border-b border-[#ffffff0a] bg-[#0f0f11] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6]">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
                  <path d="M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41" />
                </svg>
              </div>
              <div>
                <p
                  className="text-[15px] font-medium text-white"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Cofounder Agent
                </p>
                <p className="text-[11px] text-[#666]">
                  {status === 'streaming' ? (
                    <span className="text-[#8b5cf6]">Responding...</span>
                  ) : status === 'submitted' ? (
                    <span className="text-[#8b5cf6]">Thinking...</span>
                  ) : (
                    'Ask about your customers'
                  )}
                </p>
              </div>
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  className="ml-auto text-[11px] text-[#555] hover:text-[#999]"
                  title="Clear chat"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4"
            style={{ scrollBehavior: 'smooth' }}
          >
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
                <div className="rounded-full bg-[#6366f115] p-4">
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#6366f1"
                    strokeWidth="1.5"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="mb-1 text-[14px] text-[#d9d9df]">
                    What can I help with?
                  </p>
                  <p className="text-[12px] leading-relaxed text-[#666]">
                    Ask about accounts, risk signals, or tell me to draft
                    follow-ups.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSuggestion(s)}
                      className="rounded-full border border-[#ffffff10] bg-[#0f0f11] px-3 py-1.5 text-[11px] text-[#888] transition-colors hover:border-[#6366f140] hover:text-[#d9d9df]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => {
              const text = getMessageText(message)
              if (!text) return null

              return (
                <div
                  key={message.id}
                  className={`mb-4 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-[16px] px-4 py-3 text-[13px] leading-relaxed ${
                      message.role === 'user'
                        ? 'bg-[#6366f1] text-white'
                        : 'border border-[#ffffff0a] bg-[#111113] text-[#d9d9df]'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{text}</div>
                  </div>
                </div>
              )
            })}

            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="mb-4 flex justify-start">
                <div className="flex items-center gap-2 rounded-[16px] border border-[#ffffff0a] bg-[#111113] px-4 py-3 text-[13px] text-[#666]">
                  <div className="flex gap-1">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#6366f1]" />
                    <span
                      className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#6366f1]"
                      style={{ animationDelay: '0.2s' }}
                    />
                    <span
                      className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#6366f1]"
                      style={{ animationDelay: '0.4s' }}
                    />
                  </div>
                  Analyzing...
                </div>
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-[12px] border border-[#5b1d1d] bg-[#1b0f11] px-4 py-3 text-[12px] text-[#ffb0b9]">
                Something went wrong. {error.message}
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="border-t border-[#ffffff0a] bg-[#0f0f11] px-4 py-3"
          >
            <div className="flex items-center gap-2 rounded-[14px] border border-[#ffffff10] bg-[#080809] px-3 py-2 focus-within:border-[#6366f150]">
              <input
                ref={inputRef}
                id="agent-chat-input"
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about your customers..."
                disabled={isLoading}
                className="flex-1 bg-transparent text-[13px] text-white placeholder-[#555] outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#6366f1] text-white transition-opacity disabled:opacity-30"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] text-[#444]">
              Agent can analyze accounts, generate drafts, and update risk
            </p>
          </form>
        </div>
      )}
    </>
  )
}
