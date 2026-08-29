"use client";

import { ArrowUp, Square, Paperclip, Sparkles, Image as ImageIcon, ChevronDown, SlidersHorizontal, Layers, Trash2, Smile } from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/foundation/utils";
import type { PersonaId } from "@/agent/personas/personas";
import { EMOJI_LIST } from "@/foundation/utils/emoji-palette";

// ── Auto-resize hook ──────────────────────────────────────────

interface UseAutoResizeTextareaProps {
    minHeight: number;
    maxHeight?: number;
}

function useAutoResizeTextarea({
    minHeight,
    maxHeight,
}: UseAutoResizeTextareaProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const adjustHeight = useCallback(
        (reset?: boolean) => {
            const textarea = textareaRef.current;
            if (!textarea) return;

            if (reset) {
                textarea.style.height = `${minHeight}px`;
                return;
            }

            textarea.style.height = `${minHeight}px`;

            const newHeight = Math.max(
                minHeight,
                Math.min(
                    textarea.scrollHeight,
                    maxHeight ?? Number.POSITIVE_INFINITY
                )
            );

            textarea.style.height = `${newHeight}px`;
        },
        [minHeight, maxHeight]
    );

    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = `${minHeight}px`;
        }
    }, [minHeight]);

    useEffect(() => {
        const handleResize = () => adjustHeight();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [adjustHeight]);

    return { textareaRef, adjustHeight };
}

// ── AI Prompt Component (Matching Reference Glass Design) ───────────────────────────────────────

interface AI_PromptProps {
    onSubmit?: (message: string) => void;
    onStop?: () => void;
    isLoading?: boolean;
    /** @deprecated Persona switching removed — kept for API compat */
    agentId?: PersonaId;
    /** @deprecated Persona switching removed — kept for API compat */
    onAgentChange?: (id: PersonaId) => void;
    threadStateByAgent?: Record<
        PersonaId,
        {
            messageCount: number;
            status: "ready" | "submitted" | "streaming" | "error";
            lastMessagePreview: string | null;
            lastMessageRole: "user" | "assistant" | "system" | null;
        }
    >;
    onResetThread?: () => void;
}

export function AI_Prompt({
    onSubmit,
    onStop,
    isLoading = false,
    onResetThread,
}: AI_PromptProps) {
    const [value, setValue] = useState("");
    const [selectedModel, setSelectedModel] = useState("Kling o3");
    const [autoMode, setAutoMode] = useState(true);
    const [showWorkflowPanel, setShowWorkflowPanel] = useState(true);
    const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
    const { textareaRef, adjustHeight } = useAutoResizeTextarea({
        minHeight: 64,
        maxHeight: 280,
    });

    const handleButtonClick = () => {
        if (isLoading) {
            onStop?.();
            return;
        }
        if (!value.trim()) return;
        onSubmit?.(value.trim());
        setValue("");
        adjustHeight(true);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey && value.trim() && !isLoading) {
            e.preventDefault();
            handleButtonClick();
        }
    };

    return (
        <div className="w-full max-w-[580px] relative flex flex-col items-center mx-auto">
            {/* ── Main Attached Floating Chat Prompt Card ── */}
            <div className="w-full bg-white/70 dark:bg-[#9699a1]/50 backdrop-blur-[80px] border border-black/10 dark:border-white/40 rounded-[28px] p-4 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.15)] relative z-10 transition-all duration-500">

                {/* Main Textarea */}
                <div className="relative mb-3">
                    <textarea
                        id="ai-input-prompt"
                        value={value}
                        placeholder="Enhance this classical landscape painting while preserving its original composition and artistic style. Introduce warm late-afternoon sunlight filtering through the trees..."
                        className={cn(
                            "w-full bg-transparent border-none text-[14.5px] text-neutral-900 dark:text-white placeholder:text-neutral-500 dark:placeholder:text-white/70 resize-none focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none leading-[1.5] font-normal px-1",
                            "min-h-[64px]"
                        )}
                        ref={textareaRef}
                        onKeyDown={handleKeyDown}
                        onChange={(e) => {
                            setValue(e.target.value);
                            adjustHeight();
                        }}
                    />
                </div>

                {/* Model & Parameter Selector Badges Row */}
                <div className="flex items-center gap-1.5 mb-3.5 flex-wrap px-1">
                    {/* Auto Mode Dropdown */}
                    <div className="relative flex items-center bg-transparent">
                        <select
                            value={autoMode ? "agent" : "manual"}
                            onChange={(e) => setAutoMode(e.target.value === "agent")}
                            className="appearance-none pl-1 pr-6 py-1 bg-transparent border-none text-[13px] font-medium text-neutral-800 dark:text-white/90 transition-colors cursor-pointer outline-none focus:ring-0"
                        >
                            <option value="agent" className="bg-white text-black dark:bg-[#44444e] dark:text-white">Agent Driven</option>
                            <option value="manual" className="bg-white text-black dark:bg-[#44444e] dark:text-white">Review Manually</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-neutral-500 dark:text-white/70 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>

                    <span className="text-neutral-300 dark:text-white/20 px-1">|</span>

                    {/* Model Selection Dropdown */}
                    <div className="relative flex items-center bg-transparent">
                        <select
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            className="appearance-none pl-6 pr-6 py-1 bg-transparent border-none text-[13px] font-medium text-neutral-800 dark:text-white/90 transition-colors cursor-pointer outline-none focus:ring-0"
                        >
                            <option value="Kling o3" className="bg-white text-black dark:bg-[#44444e] dark:text-white">Kling o3</option>
                            <option value="Claude" className="bg-white text-black dark:bg-[#44444e] dark:text-white">Claude</option>
                            <option value="GPT" className="bg-white text-black dark:bg-[#44444e] dark:text-white">GPT</option>
                            <option value="Gemini" className="bg-white text-black dark:bg-[#44444e] dark:text-white">Gemini</option>
                        </select>
                        <span className="text-neutral-500 dark:text-white/80 text-[12px] absolute left-1 top-1/2 -translate-y-1/2 pointer-events-none">◇</span>
                        <ChevronDown className="w-3.5 h-3.5 text-neutral-500 dark:text-white/70 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                </div>

                {/* Bottom Action Toolbar */}
                <div className="flex items-center justify-between">
                    {/* Left Attachment Button */}
                    <div className="flex items-center gap-2">
                        <label
                            className="flex items-center gap-1.5 px-2 py-1 rounded-[10px] text-[13px] font-medium text-neutral-600 hover:text-neutral-900 dark:text-white/80 dark:hover:text-white cursor-pointer transition-colors"
                            aria-label="Attach file"
                        >
                            <input type="file" className="hidden" />
                            <Paperclip className="w-[15px] h-[15px] text-neutral-500 dark:text-white/70" />
                            <span>Attach</span>
                        </label>

                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
                                className="p-1.5 rounded-[10px] text-neutral-400 hover:text-neutral-800 dark:text-white/60 dark:hover:text-white/90 transition-colors ml-1"
                                title="Insert custom saved emoji"
                            >
                                <Smile className="w-[15px] h-[15px]" />
                            </button>

                            {isEmojiPickerOpen && (
                                <div className="absolute bottom-9 left-0 z-50 bg-[#1C1C24] border border-white/20 rounded-xl p-2 shadow-2xl backdrop-blur-xl w-[260px] grid grid-cols-7 gap-1">
                                    {EMOJI_LIST.map((emoji, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => {
                                                setValue((prev) => prev + emoji);
                                                setIsEmojiPickerOpen(false);
                                            }}
                                            className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-[16px] transition-transform hover:scale-110"
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {onResetThread && (
                            <button
                                type="button"
                                onClick={onResetThread}
                                className="p-1.5 rounded-[10px] text-neutral-400 hover:text-neutral-800 dark:text-white/60 dark:hover:text-white/90 transition-colors ml-1"
                                title="Clear thread history"
                            >
                                <Trash2 className="w-[15px] h-[15px]" />
                            </button>
                        )}
                    </div>

                    {/* Right Tools Cluster + Submit Arrow */}
                    <div className="flex items-center gap-1 bg-transparent p-0">
                        {/* Magic Enhancement Tool */}
                        <button
                            type="button"
                            className="p-2 rounded-[10px] hover:bg-black/5 dark:hover:bg-white/10 text-neutral-600 hover:text-neutral-900 dark:text-white/80 transition-colors"
                            title="Enhance prompt"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-current">
                                <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" />
                                <path d="m14 7 3 3" />
                                <path d="M5 6v4" />
                                <path d="M19 14v4" />
                                <path d="M10 2v2" />
                                <path d="M7 8H3" />
                                <path d="M21 16h-4" />
                                <path d="M11 3H9" />
                            </svg>
                        </button>

                        {/* Video/Image Tool */}
                        <button
                            type="button"
                            className="p-2 rounded-[10px] hover:bg-black/5 dark:hover:bg-white/10 text-neutral-600 hover:text-neutral-900 dark:text-white/80 transition-colors"
                            title="Visual Canvas"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-current">
                                <rect width="18" height="14" x="3" y="5" rx="2" ry="2" />
                                <path d="m10 15 5-3-5-3v6Z" />
                            </svg>
                        </button>

                        {/* Token Credits Pill */}
                        <div className="px-3 py-2 rounded-[12px] bg-black/5 dark:bg-white/10 text-[13px] font-medium text-neutral-800 dark:text-white flex items-center gap-1.5 ml-1">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-600 dark:text-white/90">
                                <path d="M3 16h18" />
                                <path d="M8 16a4 4 0 0 1 8 0" />
                                <path d="M11 16a1 1 0 0 1 2 0" />
                                <path d="M12 5v3" />
                                <path d="M6 8l2.5 2" />
                                <path d="M18 8l-2.5 2" />
                            </svg>
                            <span>98</span>
                        </div>

                        {/* Submit / Stop Button - Liquid Glass */}
                        <button
                            type="button"
                            disabled={!isLoading && !value.trim()}
                            onClick={handleButtonClick}
                            className={cn(
                                "w-10 h-10 ml-1.5 rounded-[12px] transition-all duration-300 flex items-center justify-center backdrop-blur-md relative overflow-hidden",
                                isLoading
                                    ? "bg-red-500/20 text-red-500 dark:bg-red-500/30 dark:text-red-300 border border-red-500/40 hover:bg-red-500/35 hover:scale-105 active:scale-95 cursor-pointer shadow-[0_0_15px_rgba(239,68,68,0.25)]"
                                    : value.trim()
                                    ? "bg-neutral-200 text-neutral-900 shadow-[inset_1.5px_1.5px_2px_rgba(255,255,255,0.8),inset_-1.5px_-1.5px_3px_rgba(0,0,0,0.05),0_4px_10px_rgba(0,0,0,0.1)] hover:bg-neutral-300 dark:bg-white/20 dark:text-white dark:shadow-[inset_1.5px_1.5px_2px_rgba(255,255,255,0.4),inset_-1.5px_-1.5px_3px_rgba(0,0,0,0.1),0_4px_10px_rgba(0,0,0,0.15)] dark:hover:bg-white/25 hover:scale-105 active:scale-95 cursor-pointer"
                                    : "bg-neutral-100 text-neutral-400 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.8),inset_-1px_-1px_2px_rgba(0,0,0,0.02)] dark:bg-white/10 dark:text-white/50 dark:shadow-[inset_1px_1px_2px_rgba(255,255,255,0.2),inset_-1px_-1px_2px_rgba(0,0,0,0.05)] cursor-not-allowed"
                            )}
                            aria-label={isLoading ? "Stop agent execution" : "Send message"}
                            title={isLoading ? "Stop agent execution" : "Send message"}
                        >
                            {/* Inner glow element for the bevel */}
                            <div className="absolute inset-0 rounded-[12px] pointer-events-none bg-gradient-to-br from-white/60 dark:from-white/30 to-transparent opacity-50" />
                            {isLoading ? (
                                <Square className="w-3.5 h-3.5 fill-current relative z-10" />
                            ) : (
                                <ArrowUp className="w-4 h-4 stroke-[2.5] relative z-10" />
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

