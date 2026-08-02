"use client";

import Link from "next/link";

export function WelcomeCanvas() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-[#111113] text-white">
      <div className="max-w-[620px] text-center flex flex-col items-center">
        {/* Main Title */}
        <h1 className="text-3xl md:text-[34px] font-semibold tracking-tight text-white mb-4">
          Welcome to Agentwork
        </h1>

        {/* Subtitle / Description */}
        <p className="text-neutral-400 text-sm md:text-[15px] leading-relaxed mb-10 max-w-[560px]">
          Agentwork connects to the tools your team already uses and answers
          questions across all of them in plain language with sources you can check.
          When the answer isn&apos;t written down, it asks the person who knows.
        </p>

        {/* Setup Connections Callout Card */}
        <div className="w-full bg-[#18181B] border border-[#27272A] rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-left shadow-xl">
          <p className="text-sm text-neutral-300 font-normal leading-snug">
            Visit the <span className="font-semibold text-white">Connections page</span> to set up
            <br className="hidden sm:inline" /> your first integration and get started
          </p>

          <Link
            href="/dashboard/settings"
            className="shrink-0 bg-transparent hover:bg-white/10 text-white font-medium text-sm px-4 py-2 rounded-xl border border-neutral-700 hover:border-neutral-500 transition-all duration-150 cursor-pointer shadow-sm"
          >
            Set up connections
          </Link>
        </div>
      </div>
    </div>
  );
}
