"use client";

import React, { useState, useEffect, useRef } from "react";
import { useChatContext } from "@/ui/chat/chat-provider";
import { AgentFeed } from "@/ui/chat/agent-feed";
import {
  ArrowUp,
  Square,
  Sparkles,
  Plus,
  Code2,
  Mic,
  Folder,
  Laptop,
  ArrowUpRight,
  ChevronDown,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  Cloud,
  GitPullRequest,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/foundation/utils";

const QUICK_ACTIONS = [
  {
    id: "morning-brief",
    badge: "Calendar + Inbox",
    title: "Morning Briefing",
    desc: "Scan calendar events, reply-worthy emails, and Stripe MRR standup.",
    prompt: "Give me a full morning brief across my calendar, inbox, and billing.",
  },
  {
    id: "churn-scan",
    badge: "Stripe + PostHog",
    title: "Revenue & Churn Scan",
    desc: "Scan all accounts in Stripe for churn risk and failed invoice retries.",
    prompt: "Scan all accounts in Stripe for churn risk and payment failures.",
  },
  {
    id: "inbox-triage",
    badge: "Gmail Triage",
    title: "Inbox Triage",
    desc: "Filter newsletters and pull important customer threads needing replies.",
    prompt: "Check my inbox and summarize threads that need replies.",
  },
  {
    id: "sentry-bugs",
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
  const [modelName, setModelName] = useState("SWE-1.6 Slow");
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
    <div className="flex flex-col h-full w-full bg-[#141414] text-[#F4F4F5] relative overflow-hidden font-sans select-none">
      {/* Top Navigation Bar (Devin Style: Arrows + Title + Avatar) */}
      <header className="h-11 border-b border-[#1f1f1f] px-3 flex items-center justify-between shrink-0 bg-[#141414] z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-zinc-500">
            <button
              type="button"
              className="p-1 hover:text-white rounded transition-colors cursor-pointer"
              title="Back"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1 hover:text-white rounded transition-colors cursor-pointer"
              title="Forward"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <span className="text-xs font-semibold text-zinc-200">
            {hasMessages ? "Operational Run" : "New Space"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {hasMessages && (
            <button
              onClick={() => resetActiveThread()}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-[#252525] border border-[#262626] transition-colors cursor-pointer"
              title="Reset space"
            >
              <RotateCcw className="w-3 h-3" />
              <span>New Run</span>
            </button>
          )}

          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0 border border-white/20">
            KS
          </div>
        </div>
      </header>

      {/* Main Space Workspace Body */}
      <div className="flex-1 min-h-0 overflow-y-auto relative flex flex-col items-center justify-between">
        {!hasMessages ? (
          /* ============================================================
             STATE 1: DEVIN CENTERED CANVAS (EXACT HOME MATCH)
             ============================================================ */
          <div className="w-full max-w-2xl px-4 py-8 flex flex-col items-center my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Devin Center Emblem Watermark */}
            <div className="flex flex-col items-center gap-3 mb-6 text-center">
              <div className="w-12 h-12 flex items-center justify-center opacity-40 hover:opacity-80 transition-opacity">
                <img src="/1.png" alt="Allel Emblem" className="w-8 h-8 object-contain filter grayscale" />
              </div>
            </div>

            {/* Devin Exact Centered Omnibar Container */}
            <div className="w-full bg-[#212121] border border-[#2c2c2c] rounded-2xl shadow-2xl shadow-black/80 focus-within:border-zinc-500 transition-all overflow-hidden">
              {/* Top Text Area */}
              <div className="p-3.5 pb-2">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  placeholder='Tip: Try typing "megaplan" to plan deeply before building'
                  className="w-full bg-transparent text-xs sm:text-sm text-zinc-200 placeholder-zinc-500 resize-none outline-none focus:outline-none min-h-[48px] max-h-[160px] leading-relaxed"
                />
              </div>

              {/* Action Row Inside Omnibar */}
              <div className="flex items-center justify-between px-3 pb-3 text-xs">
                <div className="flex items-center gap-2 text-zinc-400">
                  <button
                    type="button"
                    className="p-1 hover:text-white rounded bg-white/[0.04] border border-white/[0.06] transition-colors cursor-pointer"
                    title="Add context"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-[11px] font-medium hover:text-white transition-colors cursor-pointer"
                  >
                    <Code2 className="w-3 h-3 text-zinc-400" />
                    <span>Code</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModelName(modelName === "SWE-1.6 Slow" ? "SWE-1.6 Fast" : "SWE-1.6 Slow")}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <span>{modelName}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 text-zinc-400">
                  <div className="flex items-center gap-1 text-[11px] font-medium text-zinc-300 px-2 py-1 rounded-md bg-white/[0.04]">
                    <Sparkles className="w-3 h-3 text-blue-400" />
                    <span>Allel Local</span>
                  </div>

                  <button
                    type="button"
                    className="p-1 hover:text-white rounded transition-colors cursor-pointer"
                    title="Voice input"
                  >
                    <Mic className="w-3.5 h-3.5 text-zinc-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSubmit()}
                    disabled={!inputText.trim() && !isLoading}
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer",
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

              {/* Sub-bar inside Omnibar (Devin Footer Bar) */}
              <div className="flex items-center justify-between px-3.5 py-2 border-t border-[#2a2a2a] bg-[#1c1c1c] text-[11px] text-zinc-400">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 hover:text-zinc-200 cursor-pointer">
                    <Laptop className="w-3 h-3" /> Local
                  </span>
                  <span className="flex items-center gap-1 hover:text-zinc-200 cursor-pointer">
                    <Folder className="w-3 h-3" /> Choose folder
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => window.location.href = "/dashboard/flows"}
                  className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
                >
                  <span>Go to agent manager</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Quick 1-Click Action Cards Grid (Runable & Devin style) */}
            <div className="w-full mt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => handleSubmit(action.prompt)}
                    className="flex flex-col text-left p-3 rounded-xl bg-[#191919] hover:bg-[#202020] border border-[#242424] hover:border-[#2e2e2e] transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-xs font-semibold text-zinc-200 group-hover:text-blue-300 transition-colors">
                        {action.title}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-400">
                        {action.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-snug line-clamp-2">
                      {action.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Recent Sessions Box below Omnibar (Devin Exact Style) */}
            <div className="w-full mt-6">
              <div className="flex items-center justify-between mb-2 px-1 text-xs font-medium text-zinc-400">
                <div className="flex items-center gap-1 cursor-pointer hover:text-zinc-200">
                  <span>Recent sessions</span>
                  <ChevronDown className="w-3 h-3 text-zinc-500" />
                </div>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                >
                  View all
                </button>
              </div>

              <div className="w-full bg-[#191919] border border-[#242424] rounded-xl p-3 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSubmit("Give me a full morning brief across my calendar, inbox, and billing.")}
                  className="flex items-center justify-between text-left text-xs text-zinc-300 hover:text-white transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="truncate font-medium text-zinc-200 group-hover:text-white">
                      Close integration, draft-send, scoring, and config gaps
                    </span>
                    <span className="text-zinc-500">·</span>
                    <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                      <Cloud className="w-3 h-3 text-zinc-500" />
                      <span>2h ago</span>
                    </div>
                    <span className="text-zinc-500">·</span>
                    <div className="flex items-center gap-1 text-[11px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                      <GitPullRequest className="w-3 h-3" />
                      <span>1</span>
                    </div>
                  </div>
                </button>

                <div className="h-px bg-[#242424]" />

                <button
                  type="button"
                  onClick={() => handleSubmit("Scan all accounts in Stripe for churn risk and payment failures.")}
                  className="flex items-center justify-between text-left text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="truncate group-hover:text-zinc-200">
                      Generate new automation
                    </span>
                    <span className="text-zinc-500">·</span>
                    <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                      <Cloud className="w-3 h-3 text-zinc-500" />
                      <span>4d ago</span>
                    </div>
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 ml-1" />
                  </div>
                </button>
              </div>
            </div>
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
            <div className="sticky bottom-4 left-0 right-0 w-full pt-4 bg-gradient-to-t from-[#141414] via-[#141414]/95 to-transparent z-20">
              <div className="w-full bg-[#212121] border border-[#2c2c2c] rounded-2xl p-2.5 shadow-2xl shadow-black/80 focus-within:border-zinc-500 transition-all">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder="Ask a follow-up or provide instructions..."
                  className="w-full bg-transparent text-xs sm:text-sm text-white placeholder-zinc-500 resize-none outline-none focus:outline-none min-h-[38px] max-h-[140px] px-2 py-1 leading-relaxed"
                />

                <div className="flex items-center justify-between pt-1.5 border-t border-[#2a2a2a] px-1 text-xs">
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Live Context Sync</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSubmit()}
                    disabled={!inputText.trim() && !isLoading}
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer",
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

        {/* Devin Centered Footer Text */}
        {!hasMessages && (
          <footer className="py-4 text-center text-[11px] text-zinc-500 border-t border-transparent">
            <span>Free • </span>
            <button
              type="button"
              onClick={() => window.location.href = "/dashboard/settings"}
              className="text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
            >
              Settings
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
