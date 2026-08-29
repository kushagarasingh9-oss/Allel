"use client";

import React, { useRef, useEffect, useState } from "react";
import { Plus, Mic, ArrowUp, Square, SlidersHorizontal, ChevronDown, Check, Info, ChevronRight } from "lucide-react";
import {
  SiGithub,
  SiStripe,
  SiPosthog,
  SiGmail,
  SiGooglecalendar,
} from "@icons-pack/react-simple-icons";
import { cn } from "@/foundation/utils";

export interface DevinChatBoxProps {
  value: string;
  onChange: (text: string) => void;
  onSubmit: (text?: string) => void;
  isLoading?: boolean;
  onStop?: () => void;
  placeholder?: string;
  modeLabel?: string;
  onModeToggle?: () => void;
  statusMessage?: string;
  statusLinkText?: string;
  onStatusLinkClick?: () => void;
  className?: string;
}

const INTEGRATIONS_TOOLTIPS = [
  {
    id: "gmail",
    name: "Gmail",
    icon: "/logos/gmail.svg",
    connected: true,
    desc: "Connected to triage inbox threads and draft email replies.",
  },
  {
    id: "stripe",
    name: "Stripe",
    icon: "/logos/stripe.svg",
    connected: true,
    desc: "Connected to monitor failed invoice retries & MRR churn risk.",
  },
  {
    id: "calendar",
    name: "Google Calendar",
    icon: "/logos/google-calendar.svg",
    connected: true,
    desc: "Connected to sync daily meeting briefs & schedule events.",
  },
  {
    id: "posthog",
    name: "PostHog",
    icon: "/logos/posthog.svg",
    connected: false,
    desc: "Connect to track user telemetry & feature usage analytics.",
  },
  {
    id: "slack",
    name: "Slack",
    icon: "/logos/slack.svg",
    connected: true,
    desc: "Connected to send real-time agent notifications and alerts.",
  },
];

export function DevinChatBox({
  value,
  onChange,
  onSubmit,
  isLoading = false,
  onStop,
  placeholder = "Ask Allel to build features, fix bugs, or work on your code",
  modeLabel = "Normal",
  onModeToggle,
  statusMessage = "Connect your stack to automate your workflows",
  statusLinkText = "+more",
  onStatusLinkClick,
  className,
}: DevinChatBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<string>(modeLabel || "Normal");
  const [hoveredLogo, setHoveredLogo] = useState<string | null>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modeMenuRef.current && !modeMenuRef.current.contains(event.target as Node)) {
        setIsModeMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isLoading) {
      e.preventDefault();
      onSubmit();
    }
  };

  const handleButtonClick = () => {
    if (isLoading && onStop) {
      onStop();
      return;
    }
    onSubmit();
  };

  return (
    <div
      className={cn(
        "w-full max-w-[700px] mx-auto bg-[#191919] border border-[#282828] rounded-[24px] p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col gap-1.5 transition-all select-none",
        className
      )}
    >
      {/* 1. UPPER INNER FLOATING INPUT CARD */}
      <div className="w-full bg-[#292929] border border-[#363636] rounded-[18px] p-3.5 sm:p-4 focus-within:border-zinc-400 transition-all flex flex-col justify-between min-h-[102px]">
        {/* Textarea Input */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder={placeholder}
          className="w-full bg-transparent text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 resize-none outline-none focus:outline-none min-h-[44px] max-h-[140px] leading-relaxed font-sans px-0.5 tracking-tight"
        />

        {/* Action Controls Row Inside Inner Card */}
        <div className="flex items-center justify-between text-xs pt-1">
          {/* Left Controls (+ Sliders Mode Selector Pill Dropdown) */}
          <div className="relative" ref={modeMenuRef}>
            <button
              type="button"
              onClick={() => setIsModeMenuOpen(!isModeMenuOpen)}
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer group"
            >
              <Plus className="w-3.5 h-3.5 text-zinc-400" />
              <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400" />
              <span className="px-2 py-0.5 rounded-md bg-[#333333] text-white font-medium text-xs hover:bg-[#3d3d3d] transition-colors">
                {selectedMode}
              </span>
            </button>

            {/* Mode Selector Dropdown Popover (Matching media_1788037283326.png) */}
            {isModeMenuOpen && (
              <div className="absolute top-7 left-0 z-50 w-[210px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-150 select-none text-xs text-zinc-300">
                {/* Item 1: Fusion Preview */}
                <button
                  type="button"
                  onClick={() => { setSelectedMode("Fusion"); setIsModeMenuOpen(false); }}
                  className="flex items-center justify-between w-full px-2 py-1.5 rounded-lg hover:bg-[#252525] transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full border border-zinc-400 flex items-center justify-center">
                      {selectedMode === "Fusion" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="text-zinc-200 font-medium">Fusion</span>
                  </div>
                  <span className="text-[#38bdf8] text-[11px] font-medium">Preview</span>
                </button>

                <div className="h-px bg-[#262626] my-1.5" />

                {/* Subheader: Capability */}
                <div className="flex items-center justify-between px-2 py-1 text-[11px] text-zinc-500 font-medium">
                  <span>Capability</span>
                  <Info className="w-3 h-3 text-zinc-500" />
                </div>

                {/* Item 2: Ultra */}
                <button
                  type="button"
                  onClick={() => { setSelectedMode("Ultra"); setIsModeMenuOpen(false); }}
                  className="flex items-center justify-between w-full px-2 py-1.5 rounded-lg hover:bg-[#252525] transition-colors cursor-pointer text-zinc-300 hover:text-white"
                >
                  <span className="pl-5">Ultra</span>
                  {selectedMode === "Ultra" && <Check className="w-3 h-3 text-white" />}
                </button>

                {/* Item 3: Normal Standard (Active Checked) */}
                <button
                  type="button"
                  onClick={() => { setSelectedMode("Normal"); setIsModeMenuOpen(false); }}
                  className={cn(
                    "flex items-center justify-between w-full px-2 py-1.5 rounded-lg hover:bg-[#252525] transition-colors cursor-pointer",
                    selectedMode === "Normal" ? "text-white font-medium bg-[#222222]" : "text-zinc-300 hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Check className={cn("w-3 h-3 shrink-0", selectedMode === "Normal" ? "text-white" : "opacity-0")} />
                    <span>Normal</span>
                  </div>
                  <div className="flex items-center gap-1 text-zinc-400 text-[11px]">
                    <span>Standard</span>
                    <ChevronRight className="w-3 h-3 text-zinc-500" />
                  </div>
                </button>

                {/* Item 4: Lite */}
                <button
                  type="button"
                  onClick={() => { setSelectedMode("Lite"); setIsModeMenuOpen(false); }}
                  className="flex items-center justify-between w-full px-2 py-1.5 rounded-lg hover:bg-[#252525] transition-colors cursor-pointer text-zinc-300 hover:text-white"
                >
                  <span className="pl-5">Lite</span>
                  {selectedMode === "Lite" && <Check className="w-3 h-3 text-white" />}
                </button>

                {/* Item 5: SWE-1.7 */}
                <button
                  type="button"
                  onClick={() => { setSelectedMode("SWE-1.7"); setIsModeMenuOpen(false); }}
                  className="flex items-center justify-between w-full px-2 py-1.5 rounded-lg hover:bg-[#252525] transition-colors cursor-pointer text-zinc-300 hover:text-white"
                >
                  <span className="pl-5">SWE-1.7</span>
                  <div className="flex items-center gap-1">
                    {selectedMode === "SWE-1.7" && <Check className="w-3 h-3 text-white mr-1" />}
                    <ChevronRight className="w-3 h-3 text-zinc-500" />
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Right Controls (Mic + Dual Pill Send Dropdown [ ↑ | ˅ ]) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="p-1.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              title="Voice input"
            >
              <Mic className="w-4 h-4" />
            </button>

            {/* Simple Circular Send Button (Highlights WHITE when text is typed) */}
            <button
              type="button"
              onClick={handleButtonClick}
              disabled={!value.trim() && !isLoading}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-xs",
                value.trim() || isLoading
                  ? "bg-white text-black hover:bg-zinc-200 shadow-md"
                  : "bg-[#5a5a5a] text-[#1c1c1c] cursor-not-allowed opacity-90"
              )}
              title={isLoading ? "Stop execution" : "Send prompt"}
            >
              {isLoading ? (
                <Square className="w-3.5 h-3.5 fill-current" />
              ) : (
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 2. OUTER CARD STATUS FOOTER BANNER */}
      <div className="flex items-center justify-between px-3.5 pt-2 pb-2.5 text-xs">
        <div className="flex items-center gap-2 text-zinc-300 font-medium truncate">
          <span className="w-3.5 h-3.5 rounded-full border border-zinc-400 flex items-center justify-center text-[10px] text-zinc-400 shrink-0 font-semibold">
            !
          </span>
          <span className="truncate text-xs text-zinc-300 font-medium">
            {statusMessage}
          </span>

          {/* Overlapping 40-50% Official Integration SVG Logos with Hover Popover Cards */}
          <div className="flex items-center -space-x-2 ml-1.5 shrink-0 relative">
            {INTEGRATIONS_TOOLTIPS.map((item) => (
              <div
                key={item.id}
                className={cn("relative transition-all duration-150", hoveredLogo === item.id ? "z-30" : "z-10")}
                onMouseEnter={() => setHoveredLogo(item.id)}
                onMouseLeave={() => setHoveredLogo(null)}
              >
                <div
                  onClick={() => window.location.href = "/dashboard/connections"}
                  className={cn(
                    "w-5.5 h-5.5 rounded-full flex items-center justify-center p-1 shadow-sm transition-all duration-150 cursor-pointer",
                    hoveredLogo === item.id
                      ? "scale-115 bg-[#252525] border border-zinc-300 shadow-xl"
                      : "bg-[#1c1c1c] border border-[#2a2a2a]"
                  )}
                >
                  <img src={item.icon} alt={item.name} className="w-3.5 h-3.5 object-contain shrink-0" />
                </div>

                {/* Hover Tooltip Popover Card (Interactive) */}
                {hoveredLogo === item.id && (
                  <div className="absolute bottom-9 -left-20 z-50 w-[220px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-xs text-zinc-300 select-none">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <img src={item.icon} alt={item.name} className="w-3.5 h-3.5 object-contain" />
                        <span className="font-semibold text-white">{item.name}</span>
                      </div>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1",
                        item.connected
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      )}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", item.connected ? "bg-emerald-400" : "bg-amber-400")} />
                        {item.connected ? "Connected" : "Connect"}
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-400 leading-snug mb-2.5">
                      {item.desc}
                    </p>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.location.href = `/dashboard/connections?provider=${item.id}`;
                      }}
                      className="w-full py-1.5 px-2.5 rounded-lg bg-white text-black font-semibold text-[11px] hover:bg-zinc-200 transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-xs"
                    >
                      <span>{item.connected ? "Configure connection" : `Connect ${item.name}`}</span>
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Inline +more link directly after the 5th logo icon */}
            <button
              type="button"
              onClick={onStatusLinkClick || (() => window.location.href = "/dashboard/connections")}
              className="text-xs font-semibold text-[#38bdf8] hover:underline cursor-pointer shrink-0 ml-3.5 pl-1"
            >
              +more
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
