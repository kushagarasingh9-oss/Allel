"use client";

import React, { useRef, useEffect, useState } from "react";
import {
  Plus,
  Mic,
  ArrowUp,
  Square,
  Code2,
  Sparkles,
  Laptop,
  Folder,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/foundation/utils";

export interface DevinChatBoxProps {
  value: string;
  onChange: (text: string) => void;
  onSubmit: (text?: string) => void;
  isLoading?: boolean;
  onStop?: () => void;
  placeholder?: string;
  className?: string;
}

export function DevinChatBox({
  value,
  onChange,
  onSubmit,
  isLoading = false,
  onStop,
  placeholder = 'Tip: Try typing "megaplan" to plan deeply before building',
  className,
}: DevinChatBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [modelName, setModelName] = useState("SWE-1.6 Slow");

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
        "w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-[22px] shadow-2xl shadow-black/80 flex flex-col transition-all overflow-hidden select-none",
        className
      )}
    >
      {/* 1. UPPER LAYER CARD (Prompt Input Box) */}
      <div className="w-full bg-[#252525] border border-[#303030] rounded-2xl p-3.5 focus-within:border-zinc-400 transition-all flex flex-col justify-between min-h-[110px]">
        {/* Textarea Input */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder={placeholder}
          className="w-full bg-transparent text-xs sm:text-sm text-zinc-200 placeholder-zinc-500 resize-none outline-none focus:outline-none min-h-[46px] max-h-[160px] leading-relaxed font-sans"
        />

        {/* Action Controls Row Inside Upper Card */}
        <div className="flex items-center justify-between text-xs pt-2">
          {/* Left Controls */}
          <div className="flex items-center gap-2 text-zinc-300">
            <button
              type="button"
              className="w-6.5 h-6.5 rounded-lg bg-[#303030] hover:bg-[#383838] border border-white/[0.08] flex items-center justify-center text-white transition-colors cursor-pointer"
              title="Add context or files"
            >
              <Plus className="w-3.5 h-3.5 text-white" />
            </button>

            <button
              type="button"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer"
            >
              <Code2 className="w-3.5 h-3.5 text-zinc-400" />
              <span>Code</span>
            </button>

            <button
              type="button"
              onClick={() => setModelName(modelName === "SWE-1.6 Slow" ? "SWE-1.6 Fast" : "SWE-1.6 Slow")}
              className="px-2 py-1 rounded-md text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer"
            >
              <span>{modelName}</span>
            </button>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-zinc-300 bg-white/[0.04]">
              <Sparkles className="w-3 h-3 text-blue-400" />
              <span>Devin Local</span>
            </div>

            <button
              type="button"
              className="p-1 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title="Voice input"
            >
              <Mic className="w-3.5 h-3.5" />
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

      {/* 2. BACKGROUND DOWN DIP CADDY SUB-BAR */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#1c1c1c] text-xs text-zinc-400 font-medium">
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="flex items-center gap-1.5 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <Laptop className="w-3.5 h-3.5 text-zinc-400" />
            <span>Local</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <Folder className="w-3.5 h-3.5 text-zinc-400" />
            <span>Choose folder</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => window.location.href = "/dashboard/flows"}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
        >
          <span>Go to agent manager</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
