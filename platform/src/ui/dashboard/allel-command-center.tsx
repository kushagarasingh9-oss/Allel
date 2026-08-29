"use client";

import React, { useState, useEffect, useRef } from "react";
import { useChatContext } from "@/ui/chat/chat-provider";
import { AgentFeed } from "@/ui/chat/agent-feed";
import { DevinChatBox } from "@/ui/primitives/devin-chat-box";
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
    <div className="flex flex-col h-full w-full bg-[#121212] text-[#F4F4F5] relative overflow-hidden font-sans select-none">
      {/* Top Navigation Bar (Devin Style: Arrows + Title + Avatar) */}
      <header className="h-11 border-b border-[#1c1c1c] px-3 flex items-center justify-between shrink-0 bg-[#121212] z-20">
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
          <div className="w-full max-w-[650px] px-4 py-6 flex flex-col items-center my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Devin Center Emblem Watermark */}
            <div className="flex flex-col items-center gap-3 mb-6 text-center">
              <div className="w-12 h-12 flex items-center justify-center opacity-40 hover:opacity-80 transition-opacity">
                <img src="/1.png" alt="Allel Emblem" className="w-8 h-8 object-contain filter grayscale" />
              </div>
            </div>

            {/* Devin Exact Chat Component */}
            <DevinChatBox
              value={inputText}
              onChange={setInputText}
              onSubmit={handleSubmit}
              isLoading={isLoading}
              onStop={stop}
              placeholder="Ask Allel to build features, fix bugs, or work on your code"
              modeLabel="Normal"
              statusMessage="Autonomous Engine Active • All integrations synchronized"
              statusLinkText="Explore automations"
              onStatusLinkClick={() => window.location.href = "/dashboard/flows"}
            />

            {/* Quick 1-Click Action Cards Grid (Devin Dual-Curved Card Style) */}
            <div className="w-full mt-6">
              <div className="flex items-center justify-between mb-2.5 px-1 text-xs font-medium text-zinc-400">
                <span>Suggested Autonomous Workflows</span>
                <span className="text-[11px] text-zinc-500">1-Click Launch</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => handleSubmit(action.prompt)}
                    className="flex flex-col text-left p-1.5 rounded-2xl bg-[#1e1e1e] border border-[#2a2a2a] hover:border-zinc-500 transition-all cursor-pointer group shadow-lg shadow-black/40"
                  >
                    <div className="w-full bg-[#292929] border border-[#363636] rounded-xl p-3 flex flex-col gap-1.5 transition-colors group-hover:bg-[#2e2e2e]">
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-semibold text-zinc-200 group-hover:text-white transition-colors">
                          {action.title}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.06] text-zinc-300 font-medium">
                          {action.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-snug line-clamp-2">
                        {action.desc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Recent Sessions Box below Omnibar (Devin Dual-Curved Card Style) */}
            <div className="w-full mt-6">
              <div className="flex items-center justify-between mb-2 px-1 text-xs font-medium text-zinc-400">
                <div className="flex items-center gap-1 cursor-pointer hover:text-zinc-200">
                  <span>Recent sessions</span>
                  <ChevronDown className="w-3 h-3 text-zinc-500" />
                </div>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="text-xs font-semibold text-[#38bdf8] hover:underline transition-colors cursor-pointer"
                >
                  View all
                </button>
              </div>

              <div className="w-full bg-[#1e1e1e] border border-[#2a2a2a] rounded-2xl p-1.5 shadow-lg shadow-black/40">
                <div className="w-full bg-[#292929] border border-[#363636] rounded-xl p-3 flex flex-col gap-2.5">
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
                      <div className="flex items-center gap-1 text-[11px] text-zinc-400">
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

                  <div className="h-px bg-[#363636]" />

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
                      <div className="flex items-center gap-1 text-[11px] text-zinc-400">
                        <Cloud className="w-3 h-3 text-zinc-500" />
                        <span>4d ago</span>
                      </div>
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 ml-1" />
                    </div>
                  </button>
                </div>
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
            <div className="sticky bottom-6 left-0 right-0 w-full z-20 px-4">
              <DevinChatBox
                value={inputText}
                onChange={setInputText}
                onSubmit={handleSubmit}
                isLoading={isLoading}
                onStop={stop}
                placeholder="Ask a follow-up or provide instructions..."
                modeLabel="Normal"
                statusMessage="Autonomous Engine Active • All 6 integrations synchronized"
                statusLinkText="Explore automations"
                onStatusLinkClick={() => window.location.href = "/dashboard/flows"}
              />
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
