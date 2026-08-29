"use client";

import React, { useState, useEffect, useRef } from "react";
import { useChatContext } from "@/ui/chat/chat-provider";
import { AgentFeed } from "@/ui/chat/agent-feed";
import { DevinChatBox } from "@/ui/primitives/devin-chat-box";
import {
  ArrowUp,
  ArrowDown,
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
  Upload,
  Share2,
  MoreHorizontal,
  PanelRight,
  Flag,
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
      {/* Top Header Bar (Devin Style: No Border Divider + Pure Icon Cluster matching media_1788036132936.png) */}
      <header className="h-11 px-4 flex items-center justify-between shrink-0 bg-[#121212] z-20">
        <div className="flex items-center gap-3">
          <span className="text-xs sm:text-sm font-medium text-zinc-300">
            {hasMessages ? "Operational Run" : "Generate new automation"}
          </span>
        </div>

        {/* Right Header Pure Icon Cluster (Flag, More Options, PanelRight - No Borders, No Covers) */}
        <div className="flex items-center gap-3 text-zinc-400">
          {hasMessages && (
            <button
              onClick={() => resetActiveThread()}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-zinc-400 hover:text-white hover:bg-[#252525] transition-colors cursor-pointer mr-1"
              title="Reset space"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>New Run</span>
            </button>
          )}

          <button
            type="button"
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Share session"
          >
            <Upload className="w-3.5 h-3.5 text-zinc-400" />
            <span>Share</span>
          </button>

          <button
            type="button"
            className="p-1 hover:text-white transition-colors cursor-pointer"
            title="More options"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          <button
            type="button"
            className="p-1 hover:text-white transition-colors cursor-pointer"
            title="Toggle right panel"
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Space Workspace Body */}
      <div className="flex-1 min-h-0 overflow-y-auto relative flex flex-col items-center justify-between">
        {!hasMessages ? (
          <div className="w-full max-w-[760px] px-4 py-6 flex flex-col items-center my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Header Row Above Chat Box (Logo on Left, Agent/Ask Mode Pill on Right) */}
            <div className="w-full flex items-center justify-between mb-3 px-1">
              {/* Brand Logo & Name */}
              <div className="flex items-center gap-2.5">
                <img
                  src="/1.png"
                  alt="Allel"
                  className="w-6 h-6 object-contain filter brightness-0 invert"
                />
                <span className="text-xl font-bold tracking-tight text-white">Allel</span>
              </div>

              {/* Mode Toggle Pill (Agent | Ask) */}
              <div className="flex items-center p-0.5 rounded-full bg-[#1c1c1c] border border-[#262626] text-xs">
                <button
                  type="button"
                  className="px-3 py-1 rounded-full bg-[#292929] text-white font-medium transition-colors shadow-xs cursor-pointer"
                >
                  Agent
                </button>
                <button
                  type="button"
                  className="px-3 py-1 rounded-full text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  Ask
                </button>
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
          </div>
        ) : (
          /* ============================================================
             STATE 2: FULL-WIDTH AGENT EXECUTION FEED (ACTIVE RUN)
             ============================================================ */
          <div className="w-full flex-1 flex flex-col justify-between max-w-[760px] mx-auto px-4 py-6">
            <div className="flex-1 w-full">
              <AgentFeed />
            </div>

            {/* Pinned Bottom Omnibar */}
            <div className="sticky bottom-6 left-0 right-0 w-full z-20 px-4 flex flex-col items-center">
              {/* Scroll Down Floating Indicator Button */}
              <button
                type="button"
                onClick={() => {
                  const feed = document.querySelector('.custom-scrollbar');
                  if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
                }}
                className="w-7 h-7 rounded-full bg-[#222222] border border-[#333333] hover:bg-[#2a2a2a] text-zinc-400 hover:text-white transition-all flex items-center justify-center mb-2.5 shadow-md cursor-pointer shrink-0"
                title="Scroll to bottom"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>

              <DevinChatBox
                value={inputText}
                onChange={setInputText}
                onSubmit={handleSubmit}
                isLoading={isLoading}
                onStop={stop}
                placeholder="Ask a follow-up"
                modeLabel="Auto"
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
