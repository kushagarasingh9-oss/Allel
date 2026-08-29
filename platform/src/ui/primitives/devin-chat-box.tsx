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
        "w-full max-w-[620px] mx-auto bg-[#1e1e1e] border border-[#2a2a2a] rounded-[24px] p-2 shadow-2xl shadow-black/80 flex flex-col gap-2 transition-all select-none",
        className
      )}
    >
      {/* 1. UPPER INNER FLOATING INPUT CARD */}
      <div className="w-full bg-[#292929] border border-[#363636] rounded-[18px] p-3.5 focus-within:border-zinc-500 transition-all flex flex-col justify-between min-h-[92px]">
        {/* Textarea Input */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder={placeholder}
          className="w-full bg-transparent text-xs sm:text-sm text-zinc-200 placeholder-zinc-500 resize-none outline-none focus:outline-none min-h-[44px] max-h-[140px] leading-relaxed font-sans px-0.5"
        />

        {/* Action Controls Row Inside Inner Card */}
        <div className="flex items-center justify-between text-xs pt-1">
          {/* Left Controls (+ Normal) */}
          <button
            type="button"
            onClick={() => setModelName(modelName === "Normal" ? "Fast" : "Normal")}
            className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-zinc-400" />
            <span>{modelName}</span>
          </button>

          {/* Right Controls (Mic & Send Button) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="p-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer"
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

      {/* 2. OUTER CARD STATUS FOOTER BANNER */}
      <div className="flex items-center justify-between px-3 py-1 text-xs">
        <div className="flex items-center gap-2 text-zinc-300 font-medium truncate">
          <span className="w-3.5 h-3.5 rounded-full border border-zinc-400 flex items-center justify-center text-[10px] text-zinc-400 shrink-0 font-bold">
            !
          </span>
          <span className="truncate text-xs text-zinc-300">
            Autonomous Engine Active • All 6 integrations synchronized
          </span>
        </div>

        <button
          type="button"
          onClick={() => window.location.href = "/dashboard/flows"}
          className="text-xs font-semibold text-[#38bdf8] hover:underline cursor-pointer shrink-0 ml-2"
        >
          Explore automations
        </button>
      </div>
    </div>
  );
}
