"use client";

import * as React from "react";
import {
  ArrowRight,
  ArrowUp,
  Check,
  ChevronRight,
  Loader2,
  Mic,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Square,
  X,
} from "lucide-react";
import { cn } from "@/foundation/utils";

// ── 1. CONNECT INTEGRATION PILL BUTTON ──────────────────────────
// Used directly below agent messages when an integration tool is disconnected.
// Invariant: Never place inside card borders or timeline nodes.
export interface ConnectIntegrationPillProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  name: string;
  logoUrl?: string;
  logoSvg?: React.ReactNode;
}

export const ConnectIntegrationPill = React.forwardRef<
  HTMLButtonElement,
  ConnectIntegrationPillProps
>(({ name, logoUrl, logoSvg, className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "group/btn flex items-center gap-2 px-2.5 py-1.5 rounded-lg",
        "bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-700/80 hover:border-neutral-600",
        "transition-all text-left cursor-pointer select-none",
        className
      )}
      {...props}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={name}
          className="w-3.5 h-3.5 object-contain shrink-0"
        />
      ) : logoSvg ? (
        <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center">
          {logoSvg}
        </span>
      ) : null}
      <span className="text-xs text-neutral-300 group-hover/btn:text-white transition-colors font-medium">
        Connect {name}
      </span>
      <ChevronRight className="w-3 h-3 text-neutral-500 group-hover/btn:text-neutral-300 ml-auto transition-colors shrink-0" />
    </button>
  );
});
ConnectIntegrationPill.displayName = "ConnectIntegrationPill";

// ── 2. PRIMARY ACTION BUTTON ────────────────────────────────────
// High contrast solid white pill/rounded button for primary actions
export interface PrimaryButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  icon?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

export const PrimaryButton = React.forwardRef<
  HTMLButtonElement,
  PrimaryButtonProps
>(({ children, isLoading, icon, size = "md", className, disabled, ...props }, ref) => {
  const sizeClasses = {
    sm: "px-2.5 py-1 text-xs gap-1.5 rounded-md",
    md: "px-3.5 py-1.5 text-xs gap-2 rounded-lg font-medium",
    lg: "px-4 py-2 text-sm gap-2 rounded-xl font-medium",
  };

  return (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      className={cn(
        "inline-flex items-center justify-center bg-white text-zinc-950",
        "hover:bg-zinc-200 active:scale-[0.98] transition-all cursor-pointer select-none",
        "disabled:opacity-40 disabled:pointer-events-none disabled:active:scale-100",
        "shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        icon
      )}
      <span>{children}</span>
    </button>
  );
});
PrimaryButton.displayName = "PrimaryButton";

// ── 3. SECONDARY / GHOST BORDERED BUTTON ────────────────────────
// Dark hairline bordered button for secondary / utility actions
export interface SecondaryButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  icon?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

export const SecondaryButton = React.forwardRef<
  HTMLButtonElement,
  SecondaryButtonProps
>(({ children, isLoading, icon, size = "md", className, disabled, ...props }, ref) => {
  const sizeClasses = {
    sm: "px-2.5 py-1 text-xs gap-1.5 rounded-md",
    md: "px-3 py-1.5 text-xs gap-1.5 rounded-lg font-medium",
    lg: "px-4 py-2 text-sm gap-2 rounded-xl font-medium",
  };

  return (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      className={cn(
        "inline-flex items-center justify-center",
        "bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-white",
        "border border-white/[0.08] hover:border-white/15",
        "active:scale-[0.98] transition-all cursor-pointer select-none",
        "disabled:opacity-40 disabled:pointer-events-none",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20",
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        icon
      )}
      <span>{children}</span>
    </button>
  );
});
SecondaryButton.displayName = "SecondaryButton";

// ── 4. APPROVE ACTION BUTTON ────────────────────────────────────
// Emerald green action button for Human-In-The-Loop approvals
export interface ApproveButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
}

export const ApproveButton = React.forwardRef<
  HTMLButtonElement,
  ApproveButtonProps
>(({ children = "Approve", isLoading, className, disabled, ...props }, ref) => {
  return (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-md",
        "bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white",
        "text-xs font-medium transition-all cursor-pointer select-none",
        "disabled:opacity-40 disabled:pointer-events-none shadow-xs",
        className
      )}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <Check className="w-3 h-3 stroke-[2.5]" />
      )}
      <span>{children}</span>
    </button>
  );
});
ApproveButton.displayName = "ApproveButton";

// ── 5. REJECT / CANCEL / DANGER BUTTON ──────────────────────────
export interface RejectButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "neutral" | "destructive";
}

export const RejectButton = React.forwardRef<
  HTMLButtonElement,
  RejectButtonProps
>(({ children = "Cancel", variant = "neutral", className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer select-none",
        variant === "neutral"
          ? "bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-900 text-neutral-300 hover:text-white"
          : "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});
RejectButton.displayName = "RejectButton";

// ── 6. CIRCULAR SEND / STOP BUTTON ──────────────────────────────
// The iconic Devin chat circular submit button (toggles to square on loading)
export interface CircularSendButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  hasContent?: boolean;
}

export const CircularSendButton = React.forwardRef<
  HTMLButtonElement,
  CircularSendButtonProps
>(({ isLoading, hasContent, className, ...props }, ref) => {
  const active = hasContent || isLoading;
  return (
    <button
      ref={ref}
      type="button"
      disabled={!active}
      className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 select-none",
        active
          ? "bg-white text-black hover:bg-zinc-200 cursor-pointer shadow-md active:scale-95"
          : "bg-[#5a5a5a] text-[#1c1c1c] cursor-not-allowed opacity-90",
        className
      )}
      title={isLoading ? "Stop execution" : "Send message"}
      {...props}
    >
      {isLoading ? (
        <Square className="w-3.5 h-3.5 fill-current" />
      ) : (
        <ArrowUp className="w-4 h-4 stroke-[2.5]" />
      )}
    </button>
  );
});
CircularSendButton.displayName = "CircularSendButton";

// ── 7. VOICE MIC BUTTON ─────────────────────────────────────────
export interface VoiceMicButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isRecording?: boolean;
}

export const VoiceMicButton = React.forwardRef<
  HTMLButtonElement,
  VoiceMicButtonProps
>(({ isRecording, className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "p-1.5 rounded-lg transition-colors cursor-pointer select-none",
        isRecording
          ? "text-rose-400 bg-rose-500/10 animate-pulse"
          : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]",
        className
      )}
      title={isRecording ? "Stop voice input" : "Voice input"}
      {...props}
    >
      <Mic className="w-4 h-4" />
    </button>
  );
});
VoiceMicButton.displayName = "VoiceMicButton";

// ── 8. FILTER PILL TAB BUTTON ───────────────────────────────────
// Used in Automations Tab, Case Lists, Capability Filters
export interface FilterPillButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean;
  count?: number;
}

export const FilterPillButton = React.forwardRef<
  HTMLButtonElement,
  FilterPillButtonProps
>(({ children, isActive, count, className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer select-none inline-flex items-center gap-1.5",
        isActive
          ? "bg-white/10 text-white"
          : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]",
        className
      )}
      {...props}
    >
      <span>{children}</span>
      {typeof count === "number" && (
        <span
          className={cn(
            "text-[10px] px-1.5 py-0.2 rounded-full",
            isActive ? "bg-white/20 text-white" : "bg-white/5 text-zinc-500"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
});
FilterPillButton.displayName = "FilterPillButton";

// ── 9. MODE SELECTOR PILL BUTTON ────────────────────────────────
// The DevinChatBox mode switcher (Plus + Sliders + Mode badge)
export interface ModeSelectorPillProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  mode: string;
}

export const ModeSelectorPill = React.forwardRef<
  HTMLButtonElement,
  ModeSelectorPillProps
>(({ mode = "Normal", className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer group select-none",
        className
      )}
      {...props}
    >
      <Plus className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200" />
      <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200" />
      <span className="px-2 py-0.5 rounded-md bg-[#333333] text-white font-medium text-xs hover:bg-[#3d3d3d] transition-colors">
        {mode}
      </span>
    </button>
  );
});
ModeSelectorPill.displayName = "ModeSelectorPill";

// ── 10. PROCEED WITH TASKS BUTTON ───────────────────────────────
// Radiant blue action button from TasksDropdown
export interface ProceedWithTasksButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  taskCount?: number;
}

export const ProceedWithTasksButton = React.forwardRef<
  HTMLButtonElement,
  ProceedWithTasksButtonProps
>(({ taskCount, className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-[#0055FF] hover:text-[#3377FF] transition-colors w-fit px-2.5 py-1 rounded bg-[#0055FF]/10 hover:bg-[#0055FF]/20 cursor-pointer select-none",
        className
      )}
      {...props}
    >
      <span>Proceed with tasks{taskCount ? ` (${taskCount})` : ""}</span>
      <ArrowRight className="w-3 h-3" />
    </button>
  );
});
ProceedWithTasksButton.displayName = "ProceedWithTasksButton";

// ── 11. REFRESH ICON BUTTON ─────────────────────────────────────
export interface RefreshIconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isSpinning?: boolean;
}

export const RefreshIconButton = React.forwardRef<
  HTMLButtonElement,
  RefreshIconButtonProps
>(({ isSpinning, children = "Refresh", className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] text-zinc-400 hover:text-white border border-white/[0.06] hover:border-white/10 text-xs transition-colors cursor-pointer select-none",
        className
      )}
      {...props}
    >
      <RefreshCw
        className={cn("w-3 h-3", isSpinning && "animate-spin text-white")}
      />
      <span>{children}</span>
    </button>
  );
});
RefreshIconButton.displayName = "RefreshIconButton";

// ── 12. DIRECT OAUTH CONNECT CARD BUTTON ────────────────────────
// Large card button in modal/settings for OAuth services
export interface DirectOAuthConnectButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  name: string;
  description: string;
  icon: React.ReactNode;
  isConnected?: boolean;
}

export const DirectOAuthConnectButton = React.forwardRef<
  HTMLButtonElement,
  DirectOAuthConnectButtonProps
>(({ name, description, icon, isConnected, className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "w-full flex items-center justify-between p-3.5 rounded-xl text-left transition-all cursor-pointer select-none group",
        "bg-[#121214] hover:bg-[#18181b] border border-white/[0.08] hover:border-white/20",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-black/40 border border-white/5 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <div className="text-xs font-medium text-white flex items-center gap-2">
            <span>{name}</span>
            {isConnected && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Connected
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5">{description}</p>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 transition-colors shrink-0" />
    </button>
  );
});
DirectOAuthConnectButton.displayName = "DirectOAuthConnectButton";

// ── 13. SIDEBAR NAVIGATION BUTTON ───────────────────────────────
export interface SidebarNavButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  badge?: string | number;
  isActive?: boolean;
}

export const SidebarNavButton = React.forwardRef<
  HTMLButtonElement,
  SidebarNavButtonProps
>(({ icon, label, badge, isActive, className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer select-none",
        isActive
          ? "bg-white/10 text-white font-semibold"
          : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04]",
        className
      )}
      {...props}
    >
      <span className="w-4 h-4 shrink-0 flex items-center justify-center">
        {icon}
      </span>
      <span className="truncate">{label}</span>
      {badge !== undefined && (
        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-zinc-300">
          {badge}
        </span>
      )}
    </button>
  );
});
SidebarNavButton.displayName = "SidebarNavButton";

// ── 14. INTERACTIVE CATALOG & SHOWCASE ──────────────────────────
// Complete live interactive demo showing all 13 button variants side-by-side
export function ButtonShowcase() {
  const [sendText, setSendText] = React.useState("Analyze customer churn");
  const [isSending, setIsSending] = React.useState(false);
  const [isSpinning, setIsSpinning] = React.useState(false);
  const [activeFilter, setActiveFilter] = React.useState("all");

  return (
    <div className="p-6 bg-[#0a0a0c] text-white rounded-2xl border border-white/10 space-y-8 max-w-4xl mx-auto font-sans">
      <div>
        <h2 className="text-lg font-medium text-white tracking-tight">
          Allel Button Design System
        </h2>
        <p className="text-xs text-zinc-500 mt-1">
          Exhaustive canonical button components matching exact dark-mode tokens and interaction invariants.
        </p>
      </div>

      {/* Grid of button categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Category: Chat & Stream Controls */}
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
          <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">
            Chat & Prompt Actions
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <CircularSendButton
              hasContent={Boolean(sendText)}
              isLoading={isSending}
              onClick={() => setIsSending(!isSending)}
            />
            <VoiceMicButton />
            <ModeSelectorPill mode="Normal" />
          </div>
        </div>

        {/* Category: Integration Connect Pills */}
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
          <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">
            Integration Connect Pills (Inline Below Chat)
          </span>
          <div className="flex flex-col gap-2">
            <ConnectIntegrationPill
              name="Stripe"
              logoUrl="/logos/stripe.svg"
            />
            <ConnectIntegrationPill
              name="PostHog"
              logoUrl="/logos/posthog.svg"
            />
          </div>
        </div>

        {/* Category: Primary & Secondary Actions */}
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
          <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">
            Primary & Secondary Actions
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <PrimaryButton>Run Scan</PrimaryButton>
            <SecondaryButton>View Timeline</SecondaryButton>
            <RefreshIconButton
              isSpinning={isSpinning}
              onClick={() => {
                setIsSpinning(true);
                setTimeout(() => setIsSpinning(false), 1200);
              }}
            />
          </div>
        </div>

        {/* Category: Approval & Danger Actions */}
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
          <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">
            HITL Approval & Danger
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <ApproveButton />
            <RejectButton>Reject</RejectButton>
            <RejectButton variant="destructive">Disconnect</RejectButton>
          </div>
        </div>

        {/* Category: Filters & Tasks */}
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3 md:col-span-2">
          <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">
            Filter Tabs & Tasks Action
          </span>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <FilterPillButton
                isActive={activeFilter === "all"}
                count={14}
                onClick={() => setActiveFilter("all")}
              >
                All Cases
              </FilterPillButton>
              <FilterPillButton
                isActive={activeFilter === "engaged"}
                count={6}
                onClick={() => setActiveFilter("engaged")}
              >
                Engaged
              </FilterPillButton>
              <FilterPillButton
                isActive={activeFilter === "recovered"}
                count={3}
                onClick={() => setActiveFilter("recovered")}
              >
                Recovered
              </FilterPillButton>
            </div>
            <ProceedWithTasksButton taskCount={3} />
          </div>
        </div>
      </div>
    </div>
  );
}
