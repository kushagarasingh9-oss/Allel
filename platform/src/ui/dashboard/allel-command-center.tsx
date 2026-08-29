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
  ChevronUp,
  Loader2,
  Bot,
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
    currentSessionId,
    messages,
    sendMessage,
    isLoading,
    status,
    stop,
    savedSessions,
    startNewChat,
    loadChatSession,
    resetActiveThread,
    activeSessionTitle,
    isResolvingTitle,
  } = useChatContext();

  const [inputText, setInputText] = useState("");
  const [isTaskTrayOpen, setIsTaskTrayOpen] = useState(false);
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

  const hasMessages = messages.length > 0;
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  useEffect(() => {
    const checkScroll = () => {
      const feed = document.getElementById("agent-chat-feed");
      if (feed) {
        const isNearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
        setShowScrollBottom(!isNearBottom);
      }
    };

    const feed = document.getElementById("agent-chat-feed");
    if (feed) {
      feed.addEventListener("scroll", checkScroll, { passive: true });
      checkScroll();
      return () => feed.removeEventListener("scroll", checkScroll);
    }
  }, [hasMessages, messages.length]);

  const handleScrollToBottom = () => {
    const feed = document.getElementById("agent-chat-feed");
    if (feed) {
      feed.scrollTo({ top: feed.scrollHeight, behavior: "smooth" });
    }
    setShowScrollBottom(false);
  };

  const handleSubmit = (textToSend?: string) => {
    const query = (textToSend || inputText).trim();
    if (!query) return;

    if (isLoading) {
      stop();
      return;
    }

    if (!hasMessages) {
      window.dispatchEvent(
        new CustomEvent("allel:session-starting", {
          detail: { sessionId: currentSessionId }
        })
      );
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

  return (
    <div className="flex flex-col h-full w-full bg-[#121214] text-[#F4F4F5] relative overflow-hidden font-sans select-none">
      {/* Top Header Bar (Devin Style: No Border Divider + Pure Icon Cluster) */}
      <header className="h-11 px-4 flex items-center justify-between shrink-0 bg-[#121214] z-20">
        <div className="flex items-center gap-3">
          {!hasMessages ? (
            <span className="text-xs sm:text-sm font-medium text-zinc-300">
              Generate new automation
            </span>
          ) : isResolvingTitle ? (
            <div className="flex items-center gap-2 select-none animate-in fade-in duration-200">
              <div className="relative overflow-hidden w-36 h-4 rounded bg-zinc-800/80 shrink-0">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-skeleton-shimmer" />
              </div>
            </div>
          ) : (
            <span className="text-xs sm:text-sm font-medium text-zinc-200 truncate max-w-[400px] animate-in fade-in duration-300">
              {activeSessionTitle || "Operational Run"}
            </span>
          )}
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
      <div className="flex-1 h-full min-h-0 relative flex flex-col items-center justify-between overflow-hidden">
        {!hasMessages ? (
          <div className="w-full max-w-[700px] px-4 py-6 flex flex-col items-center my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Clean Minimal Left-Aligned Title Above Chat Box */}
            <div className="w-full flex items-center justify-start mb-2.5 px-1 select-none">
              <span className="text-base sm:text-lg font-medium tracking-tight silver-shimmer-text">
                What do you want to automate today?
              </span>
            </div>

            {/* Devin Exact Chat Component */}
            <DevinChatBox
              value={inputText}
              onChange={setInputText}
              onSubmit={handleSubmit}
              isLoading={isLoading}
              onStop={stop}
              modeLabel="Normal"
              statusMessage="Connect your stack to automate your workflows"
              statusLinkText="+more"
              onStatusLinkClick={() => window.location.href = "/dashboard/connections"}
            />
          </div>
        ) : (
          /* ============================================================
             STATE 2: FULL-WIDTH AGENT EXECUTION FEED (ACTIVE RUN)
             ============================================================ */
          <div className="w-full h-full flex-1 min-h-0 flex flex-col justify-between max-w-[760px] mx-auto px-4 py-2 animate-in fade-in duration-200 relative">
            <div className="flex-1 h-full min-h-0 w-full flex flex-col relative overflow-hidden">
              <AgentFeed />
            </div>

            {/* Fixed Bottom Omnibar + Attached Top Task Runner Tray (100% Fixed at one place, masks scrolling text beneath) */}
            <div className="absolute bottom-0 left-0 right-0 w-full z-30 px-4 pb-3 pt-8 flex flex-col items-center bg-gradient-to-t from-[#121214] from-70% via-[#121214]/90 to-transparent pointer-events-none [&>*]:pointer-events-auto">
              {/* Minimal Scroll Down Indicator Button (Appears ONLY when scrolled above bottom of the chat, without circle cover) */}
              {showScrollBottom && (
                <button
                  type="button"
                  onClick={handleScrollToBottom}
                  className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-all flex items-center justify-center mb-1.5 cursor-pointer shrink-0 animate-in fade-in zoom-in-90 duration-150"
                  title="Scroll to bottom"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              )}

              {/* Conditional Attached Processing Header (Pops up attached when query is submitted & running) */}
              {isLoading ? (
                <div className="w-full max-w-[700px] mx-auto bg-[#121214] border border-white/[0.08] rounded-[24px] p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.6)] flex flex-col gap-1.5 transition-all select-none animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="w-full flex flex-col items-start transition-all px-1 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setIsTaskTrayOpen(!isTaskTrayOpen)}
                      className="w-full flex items-center justify-between px-2 py-1 bg-transparent border-0 hover:opacity-80 transition-opacity cursor-pointer text-xs select-none"
                    >
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-white shrink-0" />
                        <span className="font-semibold text-zinc-200 text-xs">Processing AI query...</span>
                      </div>
                      <ChevronUp
                        className={cn(
                          "w-3.5 h-3.5 text-zinc-400 transition-transform duration-200",
                          !isTaskTrayOpen && "rotate-180"
                        )}
                      />
                    </button>

                    {isTaskTrayOpen && (
                      <div className="w-full px-2 py-1.5 animate-in fade-in duration-150 flex items-center gap-2 text-xs text-zinc-400 select-none">
                        <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
                        <span className="text-xs text-zinc-400 font-normal">Executing tool calls across connected integrations...</span>
                      </div>
                    )}
                  </div>

                  <DevinChatBox
                    value={inputText}
                    onChange={setInputText}
                    onSubmit={handleSubmit}
                    isLoading={isLoading}
                    onStop={stop}
                    placeholder="Ask a follow-up..."
                    modeLabel="Auto"
                    hideStatusBanner={true}
                    className="max-w-none w-full bg-transparent border-0 p-0 shadow-none"
                  />
                </div>
              ) : (
                <DevinChatBox
                  value={inputText}
                  onChange={setInputText}
                  onSubmit={handleSubmit}
                  isLoading={isLoading}
                  onStop={stop}
                  placeholder="Ask a follow-up..."
                  modeLabel="Auto"
                  hideStatusBanner={true}
                  className="max-w-[700px] w-full mx-auto"
                />
              )}
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
