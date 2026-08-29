"use client";

import React, { useRef, useEffect } from "react";
import { Plus, Mic, ArrowUp, Square, Info } from "lucide-react";
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
  statusMessage = "Autonomous Engine Active • All integrations synchronized",
  statusLinkText = "Explore workflows",
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
        "w-full bg-[#1e1e1e] border border-[#2a2a2a] rounded-2xl p-2.5 shadow-2xl shadow-black/80 flex flex-col gap-2 transition-all",
        className
      )}
    >
      {/* Inner Input Container Box */}
      <div className="w-full bg-[#292929] border border-[#363636] rounded-xl p-3 flex flex-col gap-3 focus-within:border-zinc-500 transition-all">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder={placeholder}
          className="w-full bg-transparent text-xs sm:text-sm text-zinc-200 placeholder-zinc-500 resize-none outline-none focus:outline-none min-h-[46px] max-h-[160px] leading-relaxed"
        />

        {/* Action Row Inside Inner Box */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-zinc-400">
            <button
              type="button"
              className="p-1 hover:text-white rounded hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Add context or files"
            >
              <Plus className="w-4 h-4 text-zinc-400" />
            </button>

            <button
              type="button"
              onClick={onModeToggle}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <span>{modeLabel}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="p-1.5 text-zinc-400 hover:text-white rounded transition-colors cursor-pointer"
              title="Voice input"
            >
              <Mic className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleButtonClick}
              disabled={!value.trim() && !isLoading}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0",
                value.trim() || isLoading
                  ? "bg-white text-black hover:bg-zinc-200 shadow-md"
                  : "bg-[#5a5a5a] text-zinc-300 cursor-not-allowed"
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
      </div>

      {/* Outer Card Status Footer Banner */}
      <div className="flex items-center justify-between px-2 py-0.5 text-xs">
        <div className="flex items-center gap-2 text-zinc-300 font-medium truncate">
          <Info className="w-4 h-4 text-zinc-400 shrink-0" />
          <span className="truncate">{statusMessage}</span>
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
