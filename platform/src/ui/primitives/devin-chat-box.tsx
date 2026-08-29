"use client";

import React, { useRef, useEffect, useState } from "react";
import { Plus, Mic, ArrowUp, Square, SlidersHorizontal, ChevronDown } from "lucide-react";
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

export function DevinChatBox({
  value,
  onChange,
  onSubmit,
  isLoading = false,
  onStop,
  placeholder = "Ask Allel to build features, fix bugs, or work on your code",
  modeLabel = "Normal",
  onModeToggle,
  statusMessage = "Autonomous Engine Active • All 6 integrations synchronized",
  statusLinkText = "Explore automations",
  onStatusLinkClick,
  className,
}: DevinChatBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        "w-full max-w-[760px] mx-auto bg-[#1e1e1e] border border-[#2c2c2c] rounded-[22px] p-2 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col gap-1.5 transition-all select-none",
        className
      )}
    >
      {/* 1. UPPER INNER FLOATING INPUT CARD */}
      <div className="w-full bg-[#292929] border border-[#363636] rounded-[16px] p-3.5 focus-within:border-zinc-400 transition-all flex flex-col justify-between min-h-[92px]">
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
          {/* Left Controls (+ Sliders Normal) */}
          <button
            type="button"
            onClick={onModeToggle}
            className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-zinc-400" />
            <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400" />
            <span>{modeLabel}</span>
          </button>

          {/* Right Controls (Construct Devin Prompt Hint + Mic + Send Button) */}
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-zinc-500 font-medium select-none mr-1">
              Construct Devin Prompt <kbd className="px-1 py-0.5 rounded bg-[#333333] text-[10px] text-zinc-400 font-mono">⌥↵</kbd>
            </span>

            <button
              type="button"
              className="p-1.5 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              title="Voice input"
            >
              <Mic className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleButtonClick}
              disabled={!value.trim() && !isLoading}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-xs",
                value.trim() || isLoading
                  ? "bg-white text-black hover:bg-zinc-200 shadow-md"
                  : "bg-[#5a5a5a] text-[#1c1c1c] cursor-not-allowed"
              )}
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
      <div className="flex items-center justify-between px-3 py-1 text-xs">
        <div className="flex items-center gap-2 text-zinc-300 font-medium truncate">
          <span className="w-3.5 h-3.5 rounded-full border border-zinc-400 flex items-center justify-center text-[10px] text-zinc-400 shrink-0 font-semibold">
            !
          </span>
          <span className="truncate text-xs text-zinc-300 font-medium">
            {statusMessage}
          </span>
        </div>

        <button
          type="button"
          onClick={onStatusLinkClick}
          className="text-xs font-semibold text-[#38bdf8] hover:underline cursor-pointer shrink-0 ml-2"
        >
          {statusLinkText}
        </button>
      </div>
    </div>
  );
}
