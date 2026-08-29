"use client";

import React, { useState, useEffect, useRef } from "react";
import { useChatContext } from "@/ui/chat/chat-provider";
import { AgentFeed } from "@/ui/chat/agent-feed";
import {
  ArrowUp,
  Square,
  Sparkles,
  Zap,
  Mail,
  Calendar,
  CreditCard,
  Bug,
  ChevronDown,
  Plus,
  Clock,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/foundation/utils";

const QUICK_ACTIONS = [
  {
    id: "morning-brief",
    icon: Mail,
    badge: "Calendar + Inbox",
    title: "Morning Briefing",
    desc: "Scan calendar events, reply-worthy emails, and Stripe MRR standup.",
    prompt: "Give me a full morning brief across my calendar, inbox, and billing.",
  },
  {
    id: "churn-scan",
    icon: CreditCard,
    badge: "Stripe + PostHog",
    title: "Revenue & Churn Scan",
    desc: "Scan all accounts in Stripe for churn risk and failed invoice retries.",
    prompt: "Scan all accounts in Stripe for churn risk and payment failures.",
  },
  {
    id: "inbox-triage",
    icon: Mail,
    badge: "Gmail Triage",
    title: "Inbox Triage",
    desc: "Filter newsletters and pull important customer threads needing replies.",
    prompt: "Check my inbox and summarize threads that need replies.",
  },
  {
    id: "sentry-bugs",
    icon: Bug,
    badge: "Sentry Monitor",
    title: "Sentry Bug Roundup",
    desc: "Inspect unresolved crash exceptions and affected user counts.",
    prompt: "Check unresolved Sentry issues affecting users in the last 24 hours.",
  },
];

export function AllelCommandCenter() {
  const {
    messages,
    sendMessage,
    isLoading,
    stop,
    savedSessions,
    startNewChat,
    loadChatSession,
    resetActiveThread,
  } = useChatContext();

  const [inputText, setInputText] = useState("");
  const [mode, setMode] = useState<"agent" | "ask">("agent");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [inputText]);

  // Listen for global new-session trigger from sidebar
  useEffect(() => {
    const handleNewSession = () => {
      startNewChat();
      setInputText("");
    };
    window.addEventListener("allel:new-session", handleNewSession);
    return () => window.removeEventListener("allel:new-session", handleNewSession);
  }, [startNewChat]);

  const handleSubmit = (textToSend?: string) => {
    const query = (textToSend || inputText).trim();
    if (!query) return;

    if (isLoading) {
      stop();
      return;
    }

    sendMessage({ text: query });
    setInputText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isLoading) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full w-full bg-[#0E0E10] text-[#F4F4F5] relative overflow-hidden font-sans">
      {/* Top Bar Navigation */}
      <header className="h-12 border-b border-white/[0.06] px-4 flex items-center justify-between shrink-0 bg-[#141417]/80 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
            <span className="text-zinc-500">Space</span>
            <span>/</span>
            <span className="text-white font-semibold">
              {hasMessages ? "Operational Run" : "Command Center"}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-white/[0.08] text-[11px] text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Autonomous Engine Active</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasMessages && (
            <button
              onClick={() => resetActiveThread()}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-white/[0.06] border border-white/[0.06] transition-colors cursor-pointer"
              title="Reset conversation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>New Run</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex-1 min-h-0 overflow-y-auto relative flex flex-col items-center">
        {!hasMessages ? (
          /* ============================================================
             STATE 1: DEVIN / RUNABLE CENTERED COMMAND HERO (HOME STATE)
             ============================================================ */
          <div className="w-full max-w-3xl px-4 py-12 flex flex-col items-center justify-center my-auto animate-in fade-in zoom-in-95 duration-200">
            {/* Center Subtle Allel Watermark */}
            <div className="flex flex-col items-center gap-3 mb-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#1A1A1E] border border-white/[0.1] flex items-center justify-center shadow-lg shadow-black/40">
                <img src="/1.png" alt="Allel" className="w-6 h-6 object-contain" />
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
                What would you like to automate today?
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 max-w-md">
                Allel autonomously operates across Gmail, Stripe, Calendar, Linear, Sentry, and PostHog.
              </p>
            </div>

            {/* Devin-Style Centered Command Omnibar */}
            <div className="w-full bg-[#1A1A1E] border border-white/[0.1] rounded-2xl p-3 shadow-2xl shadow-black/60 focus-within:border-blue-500/60 focus-within:ring-1 focus-within:ring-blue-500/40 transition-all">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                placeholder="Ask anything across your tools, or describe what to automate..."
                className="w-full bg-transparent text-sm text-white placeholder-zinc-500 resize-none outline-none focus:outline-none min-h-[52px] max-h-[180px] leading-relaxed"
              />

              {/* Bottom Control Bar inside Omnibar */}
              <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] mt-2 text-xs">
                <div className="flex items-center gap-2">
                  {/* Mode Selector Pill */}
                  <div className="flex items-center bg-[#141417] p-0.5 rounded-lg border border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => setMode("agent")}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1.5",
                        mode === "agent"
                          ? "bg-[#27272E] text-white shadow-xs"
                          : "text-zinc-400 hover:text-zinc-200"
                      )}
                    >
                      <Sparkles className="w-3 h-3 text-blue-400" />
                      <span>Autonomous</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("ask")}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1.5",
                        mode === "ask"
                          ? "bg-[#27272E] text-white shadow-xs"
                          : "text-zinc-400 hover:text-zinc-200"
                      )}
                    >
                      <span>Direct Ask</span>
                    </button>
                  </div>

                  {/* Connected Integrations Badge */}
                  <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.06] text-[11px] text-zinc-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>6 Tools Connected</span>
                  </div>
                </div>

                {/* Submit / Stop Button */}
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={!inputText.trim() && !isLoading}
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer",
                    inputText.trim() || isLoading
                      ? "bg-white text-black hover:bg-zinc-200 shadow-md"
                      : "bg-white/10 text-zinc-500 cursor-not-allowed"
                  )}
                >
                  {isLoading ? (
                    <Square className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <ArrowUp className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Quick 1-Click Action Cards Grid (Runable & Devin style) */}
            <div className="w-full mt-6">
              <div className="flex items-center justify-between mb-3 px-1 text-xs font-medium text-zinc-400">
                <span>Suggested Autonomous Workflows</span>
                <span className="text-[11px] text-zinc-500">1-Click Launch</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                {QUICK_ACTIONS.map((action) => {
                  const IconComp = action.icon;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => handleSubmit(action.prompt)}
                      className="flex flex-col text-left p-3.5 rounded-xl bg-[#161619] hover:bg-[#1C1C20] border border-white/[0.06] hover:border-white/[0.15] transition-all group cursor-pointer"
                    >
                      <div className="flex items-center justify-between w-full mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-white/[0.06] flex items-center justify-center text-zinc-300 group-hover:text-blue-400 transition-colors">
                            <IconComp className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-xs font-semibold text-white group-hover:text-blue-300 transition-colors">
                            {action.title}
                          </span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.04] text-zinc-400 border border-white/[0.04]">
                          {action.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-snug line-clamp-2">
                        {action.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Recent Sessions List below Omnibar (Devin style) */}
            {savedSessions.length > 0 && (
              <div className="w-full mt-8 pt-6 border-t border-white/[0.06]">
                <div className="flex items-center justify-between mb-2.5 px-1 text-xs font-medium text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Recent Sessions</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1 w-full">
                  {savedSessions.slice(0, 3).map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => loadChatSession(session)}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#141417] hover:bg-[#1A1A1E] border border-white/[0.04] hover:border-white/[0.1] text-xs text-zinc-300 hover:text-white transition-all text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                        <span className="truncate">{session.title}</span>
                      </div>
                      <span className="text-[11px] text-zinc-500 shrink-0">
                        {session.messageCount} messages
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ============================================================
             STATE 2: FULL-WIDTH AGENT EXECUTION FEED (ACTIVE RUN)
             ============================================================ */
          <div className="w-full flex-1 flex flex-col justify-between max-w-4xl px-4 py-6">
            <div className="flex-1 w-full">
              <AgentFeed />
            </div>

            {/* Pinned Bottom Omnibar */}
            <div className="sticky bottom-4 left-0 right-0 w-full pt-4 bg-gradient-to-t from-[#0E0E10] via-[#0E0E10]/95 to-transparent z-20">
              <div className="w-full bg-[#1A1A1E] border border-white/[0.1] rounded-2xl p-2.5 shadow-2xl shadow-black/80 focus-within:border-blue-500/60 transition-all">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder="Ask a follow-up or provide instructions..."
                  className="w-full bg-transparent text-sm text-white placeholder-zinc-500 resize-none outline-none focus:outline-none min-h-[38px] max-h-[140px] px-2 py-1 leading-relaxed"
                />

                <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.06] px-1 text-xs">
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Live Context Sync</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSubmit()}
                    disabled={!inputText.trim() && !isLoading}
                    className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer",
                      inputText.trim() || isLoading
                        ? "bg-white text-black hover:bg-zinc-200"
                        : "bg-white/10 text-zinc-500 cursor-not-allowed"
                    )}
                  >
                    {isLoading ? (
                      <Square className="w-3 h-3 fill-current" />
                    ) : (
                      <ArrowUp className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
