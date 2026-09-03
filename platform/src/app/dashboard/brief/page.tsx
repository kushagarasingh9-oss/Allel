'use client'

import React from 'react'

export default function BriefPage() {
  return (
    <div className="min-h-screen bg-[#0d0d0f] p-8 text-zinc-300">
      <div className="mx-auto max-w-7xl">
        {/* Top Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo-icon.png"
              alt="Allel"
              className="w-5 h-5 object-contain shrink-0 mix-blend-screen bg-transparent"
              style={{ width: 20, height: 20 }}
            />
            <h1 className="text-[17px] font-medium tracking-tight text-white">Brief</h1>
          </div>
        </div>

        {/* Content Container ready for brief layout */}
        <div className="w-full">
          {/* Brief content will be populated here */}
        </div>
      </div>
    </div>
  )
}
