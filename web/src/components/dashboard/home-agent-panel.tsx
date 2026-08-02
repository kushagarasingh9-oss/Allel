"use client";

import React, { useState, useRef } from "react";
import { useChatContext } from "@/components/agent-feed/chat-provider";
import { AgentFeed } from "@/components/agent-feed/agent-feed";
import { Plus, ArrowUp, ChevronUp, ChevronDown, Loader2, History, Trash2, Search, MessageSquare, ArrowRight } from "lucide-react";

export function HomeAgentPanel() {
  const {
    sendMessage,
    isLoading,
    savedSessions,
    startNewChat,
    loadChatSession,
    deleteChatSession,
  } = useChatContext();
  const [inputText, setInputText] = useState("");
  const [activeTab, setActiveTab] = useState("Home");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [isProcessExpanded, setIsProcessExpanded] = useState(false);
  const [panelWidth, setPanelWidth] = useState(580);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const tabs = ["Home", "Company", "Tasks", "Library"];

  const handleMouseDown = (e: React.MouseEvent) => {
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = panelWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) return;
      const deltaX = startX.current - moveEvent.clientX;
      const maxAllowed = typeof window !== "undefined" ? Math.min(640, window.innerWidth - 60) : 640;
      const newWidth = Math.min(Math.max(startWidth.current + deltaX, 450), maxAllowed);
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleSend = () => {
    if (!inputText.trim() || isLoading) return;
    sendMessage({ text: inputText.trim() });
    setInputText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const filteredHistory = historySearch.trim()
    ? savedSessions.filter((s) => s.title.toLowerCase().includes(historySearch.toLowerCase()))
    : savedSessions;

  return (
    <div
      style={{ width: `${panelWidth}px` }}
      className="relative shrink-0 h-full flex flex-col rounded-lg overflow-hidden font-sans bg-[#0B0B0D]/95 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.8),_0_0_20px_rgba(255,255,255,0.02)] max-w-[calc(100vw-60px)] min-w-[450px]"
    >
      {/* Interactive Drag-to-Resize Left Border Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute left-0 top-0 bottom-0 w-3 -ml-1.5 cursor-col-resize z-50 flex items-center justify-center group"
        title="Drag to resize panel width"
      >
        <div className="w-[3px] h-14 rounded-full bg-white/20 group-hover:bg-white/70 group-hover:w-[4px] group-hover:h-20 group-hover:shadow-[0_0_12px_rgba(255,255,255,0.5)] transition-all duration-200" />
      </div>

      {/* Tab Header Bar — deep obsidian shade */}
      <div className="bg-[#0B0B0D] px-4 pt-3.5 pb-1 shrink-0">
        <div className="flex items-center justify-between text-[13px]">
          <div className="flex items-center gap-1.5">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setIsHistoryOpen(false);
                }}
                className={`px-3.5 py-1.5 rounded-md font-medium transition-all duration-150 ${
                  activeTab === tab && !isHistoryOpen
                    ? "bg-[#1C1C22] text-white border border-white/15 shadow-sm"
                    : "text-neutral-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <span>{tab}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            {/* Recent History Free-floating Icon Button */}
            <div className="relative group">
              <button
                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                className="p-2 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-all flex items-center justify-center"
              >
                <History className="w-4 h-4" />
              </button>
              {/* Tooltip on hover */}
              <div className="absolute right-0 top-full mt-1.5 hidden group-hover:block z-50 pointer-events-none">
                <div className="bg-[#1C1C24] text-white text-[11px] font-medium px-2.5 py-1 rounded shadow-xl border border-white/10 whitespace-nowrap">
                  Recent history
                </div>
              </div>
            </div>

            {/* New Session Free-floating Icon Button */}
            <div className="relative group">
              <button
                onClick={() => {
                  startNewChat();
                  setIsHistoryOpen(false);
                  setActiveTab("Home");
                }}
                className="p-2 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-all flex items-center justify-center"
              >
                <Plus className="w-4 h-4" />
              </button>
              {/* Tooltip on hover */}
              <div className="absolute right-0 top-full mt-1.5 hidden group-hover:block z-50 pointer-events-none">
                <div className="bg-[#1C1C24] text-white text-[11px] font-medium px-2.5 py-1 rounded shadow-xl border border-white/10 whitespace-nowrap">
                  New session
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Inner Content Panel */}
      <div className="flex-1 flex flex-col bg-[#0B0B0D]/95 backdrop-blur-lg rounded-t-lg border-t border-x border-white/20 mt-3 overflow-hidden shadow-[0_-6px_24px_rgba(0,0,0,0.6)]">
        {isHistoryOpen ? (
          /* Recent History Panel Overlay View */
          <div className="flex-1 flex flex-col p-5 overflow-y-auto">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
              <h3 className="text-[14px] font-medium text-white flex items-center gap-2">
                <History className="w-4 h-4 text-neutral-400" />
                Recent Conversations
              </h3>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="text-neutral-400 hover:text-white text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors"
              >
                ✕ Close
              </button>
            </div>

            {/* Session Cards List */}
            {savedSessions.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 rounded-xl my-4">
                <MessageSquare className="w-8 h-8 text-neutral-600 mb-2" />
                <p className="text-xs text-neutral-400 mb-4">No recent conversations yet.</p>
                <button
                  onClick={() => {
                    startNewChat();
                    setIsHistoryOpen(false);
                    setActiveTab("Home");
                  }}
                  className="px-3.5 py-1.5 rounded-md text-xs font-medium bg-white text-black hover:bg-neutral-200 transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Start New Session</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col">
                  <div className="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase px-2 mb-1.5">
                    Today
                  </div>
                  <div className="flex flex-col divide-y divide-white/5">
                    {savedSessions.map((session) => (
                      <div
                        key={session.id}
                        className="group py-2.5 px-2 rounded-md hover:bg-white/[0.04] flex items-center justify-between transition-all"
                      >
                        <div className="flex-1 min-w-0 pr-3">
                          <h4 className="text-[13px] font-medium text-neutral-200 group-hover:text-white truncate mb-0.5 transition-colors">
                            {session.title}
                          </h4>
                          <p className="text-[11px] text-neutral-500">
                            {session.createdAt}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              loadChatSession(session);
                              setIsHistoryOpen(false);
                              setActiveTab("Home");
                            }}
                            className="px-2.5 py-1 rounded text-[11.5px] font-medium text-neutral-300 hover:text-white hover:bg-white/10 transition-all flex items-center gap-1"
                          >
                            <span>Open</span>
                            <ArrowRight className="w-3 h-3 text-neutral-400" />
                          </button>

                          <button
                            onClick={() => deleteChatSession(session.id)}
                            className="p-1 rounded text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Delete chat history item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Active Chat Feed & Input */
          <>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <AgentFeed />
            </div>

            {/* Emerging Process Status Tab */}
            <div className="px-4 shrink-0 -mb-1 relative z-10">
              <div className="mx-2 bg-[#16161C] border-t border-x border-white/20 rounded-t-lg px-3.5 py-1.5 flex items-center justify-between text-[12px] font-medium text-neutral-300 shadow-md transition-all">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isLoading ? "bg-amber-400 animate-pulse" : "bg-neutral-500"}`} />
                  <span className="text-neutral-300 text-[12px] tracking-tight">
                    {isLoading ? "Processing AI query..." : "0 workflows running"}
                  </span>
                </div>
                <button
                  onClick={() => setIsProcessExpanded(!isProcessExpanded)}
                  className="text-neutral-400 hover:text-white transition-colors p-0.5"
                >
                  {isProcessExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronUp className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              {isProcessExpanded && (
                <div className="mx-2 bg-[#121216] border-x border-white/20 p-3 flex flex-col gap-2 text-xs text-neutral-300 animate-in slide-in-from-bottom-2 duration-150">
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
                      <span>Agent is thinking and generating response...</span>
                    </div>
                  ) : (
                    <div className="text-neutral-500 text-[11px]">
                      No active workflows running.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Pinned Glassy Obsidian Chat Input Box */}
            <div className="p-4 pt-0 shrink-0 bg-[#0B0B0D] relative z-20">
              <div className="bg-[#121216]/95 backdrop-blur-md border border-white/20 rounded-lg p-3.5 shadow-xl flex flex-col gap-2.5 focus-within:border-white/40 focus-within:ring-1 focus-within:ring-white/10 transition-all w-full">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything about your company..."
                  rows={2}
                  className="w-full bg-transparent text-sm text-white placeholder-neutral-500 focus:outline-none resize-none leading-relaxed"
                />

                <div className="flex items-center justify-between pt-1">
                  <button className="text-neutral-400 hover:text-white transition-colors p-1.5 rounded-md hover:bg-white/10">
                    <Plus className="w-4 h-4" />
                  </button>

                  <button
                    onClick={handleSend}
                    disabled={!inputText.trim() || isLoading}
                    className={`w-9 h-9 rounded-xl transition-all duration-200 flex items-center justify-center ${
                      inputText.trim() && !isLoading
                        ? "bg-white text-black hover:bg-neutral-200 cursor-pointer shadow-md"
                        : "bg-[#1C1C24] text-neutral-500 cursor-not-allowed border border-white/5"
                    }`}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
