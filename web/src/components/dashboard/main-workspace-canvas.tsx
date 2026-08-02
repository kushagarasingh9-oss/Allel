"use client";

import React from "react";
import {
  Sun,
  Map,
  Search,
  Plus,
  X,
  Check,
  ChevronDown,
  Bell,
  AlertCircle,
} from "lucide-react";

export function MainWorkspaceCanvas() {
  return (
    <div className="flex-1 h-full flex flex-col bg-[#111113] text-white relative overflow-hidden rounded-xl border border-[#222226]">
      {/* Top Header Bar across Left Workspace Canvas */}
      <div className="h-12 px-5 flex items-center justify-between border-b border-[#222226] bg-[#141417]/80 backdrop-blur-md z-20 shrink-0">
        {/* Left Section */}
        <div className="flex items-center gap-3 text-xs font-medium">
          <div className="flex items-center gap-1.5 bg-[#1E1E22] hover:bg-[#25252A] px-2.5 py-1 rounded-md cursor-pointer transition-colors border border-white/5">
            <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-[9px] font-bold text-white">
              KS
            </div>
            <span className="text-white">ideasaas</span>
            <ChevronDown className="w-3 h-3 text-neutral-400" />
          </div>
          <span className="text-neutral-500">|</span>
          <span className="text-neutral-400 hover:text-white transition-colors cursor-pointer">
            ideasaas
          </span>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 text-white text-xs px-3 py-1 rounded-md font-medium border border-white/15 transition-all shadow-sm">
            <span className="text-amber-400 text-xs">🌻</span>
            <span>Upgrade</span>
          </button>

          <div className="flex items-center gap-1.5 text-neutral-400">
            <button className="p-1.5 hover:text-white hover:bg-[#1E1E22] rounded-md transition-colors">
              <Sun className="w-4 h-4" />
            </button>
            <button className="p-1.5 hover:text-white hover:bg-[#1E1E22] rounded-md transition-colors">
              <Map className="w-4 h-4" />
            </button>
            <button className="p-1.5 hover:text-white hover:bg-[#1E1E22] rounded-md transition-colors">
              <Search className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Center Interactive Node Graph / Mindmap View */}
      <div className="flex-1 relative flex items-center justify-center bg-[radial-gradient(#222226_1px,transparent_1px)] [background-size:24px_24px]">
        {/* Orbit Grid Pattern */}
        <div className="absolute w-[420px] h-[420px] rounded-full border border-dashed border-neutral-800/80 pointer-events-none" />

        {/* Orbiting Nodes */}
        {/* Support Top Node */}
        <div className="absolute top-16 bg-[#1A1A1E] border border-neutral-700/60 px-3 py-1 rounded-md text-[11px] font-medium text-neutral-300 shadow-md">
          Support
        </div>

        {/* Sales Top Left Node */}
        <div className="absolute top-36 left-28 bg-[#1A1A1E] border border-neutral-700/60 px-3 py-1 rounded-md text-[11px] font-medium text-neutral-300 shadow-md flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Sales
        </div>

        {/* Operations Top Right Node */}
        <div className="absolute top-36 right-28 bg-[#1A1A1E] border border-neutral-700/60 px-3 py-1 rounded-md text-[11px] font-medium text-neutral-300 shadow-md flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          Operations
        </div>

        {/* Marketing Bottom Left Node */}
        <div className="absolute bottom-36 left-24 bg-[#1A1A1E] border border-neutral-700/60 px-3 py-1 rounded-md text-[11px] font-medium text-neutral-300 shadow-md flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          Marketing
        </div>

        {/* Finance Bottom Right Node */}
        <div className="absolute bottom-36 right-28 bg-[#1A1A1E] border border-neutral-700/60 px-3 py-1 rounded-md text-[11px] font-medium text-neutral-300 shadow-md">
          Finance
        </div>

        {/* Center Node (Cofounder) */}
        <div className="z-10 bg-[#1F1F24] border border-amber-500/40 p-4 rounded-2xl shadow-2xl flex flex-col items-center gap-1 cursor-pointer hover:border-amber-400 transition-all">
          <span className="text-2xl animate-bounce">🌻</span>
          <span className="text-xs font-semibold text-white">Cofounder</span>
        </div>
      </div>

      {/* Bottom Floating Control Bar */}
      <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between pointer-events-none z-20">
        {/* Bottom Left Review Widget */}
        <div className="pointer-events-auto bg-[#18181C]/90 backdrop-blur-md border border-[#27272C] rounded-xl p-2 flex items-center gap-2 text-xs shadow-xl">
          <button className="text-neutral-400 hover:text-white p-1 rounded-md hover:bg-neutral-800">
            <Bell className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-1 text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md font-medium">
            <AlertCircle className="w-3 h-3" />
            <span>1...</span>
          </div>
          <button className="bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs px-2.5 py-1 rounded-md border border-white/10 transition-colors">
            Review
          </button>
        </div>

        {/* Bottom Center Node Plus Button */}
        <div className="pointer-events-auto bg-white text-black hover:bg-neutral-200 p-3 rounded-xl shadow-xl cursor-pointer transition-all hover:scale-105">
          <Plus className="w-5 h-5" />
        </div>

        {/* Bottom Right Audio Status Control */}
        <div className="pointer-events-auto bg-[#18181C]/90 backdrop-blur-md border border-[#27272C] rounded-xl p-2 flex items-center gap-3 shadow-xl">
          <button className="text-neutral-400 hover:text-white p-1 rounded-md hover:bg-neutral-800">
            <X className="w-3.5 h-3.5" />
          </button>

          {/* Audio Wave Visualizer */}
          <div className="flex items-center gap-0.5">
            <span className="w-0.5 h-3 bg-neutral-400 rounded-full animate-pulse" />
            <span className="w-0.5 h-5 bg-neutral-200 rounded-full animate-pulse" />
            <span className="w-0.5 h-2 bg-neutral-400 rounded-full animate-pulse" />
            <span className="w-0.5 h-4 bg-white rounded-full animate-pulse" />
            <span className="w-0.5 h-2.5 bg-neutral-400 rounded-full animate-pulse" />
          </div>

          <button className="text-emerald-400 hover:text-emerald-300 p-1 rounded-md hover:bg-neutral-800">
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
