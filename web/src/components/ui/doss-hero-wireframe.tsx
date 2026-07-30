"use client";

import React, { useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface DossWireframeProps {
  children?: React.ReactNode;
  leftContent?: React.ReactNode;
  rightContent?: React.ReactNode;
  tabs?: Array<{ id: string; title: string; subtitle?: string }>;
  activeTabIndex?: number;
  onTabChange?: (index: number) => void;
}

const DEFAULT_TABS = [
  { id: "1", title: "Adapt", subtitle: "your operations" },
  { id: "2", title: "Connect", subtitle: "any tool" },
  { id: "3", title: "Unify", subtitle: "your master data" },
  { id: "4", title: "Automate", subtitle: "the value chain" },
  { id: "5", title: "Analyze", subtitle: "what matters most" },
  { id: "6", title: "Store", subtitle: "without limits" },
];

export function DossHeroWireframe({
  children,
  leftContent,
  rightContent,
  tabs = DEFAULT_TABS,
  activeTabIndex: externalActiveIndex,
  onTabChange,
}: DossWireframeProps) {
  const [internalActiveIndex, setInternalActiveIndex] = useState(0);
  const activeIndex = externalActiveIndex ?? internalActiveIndex;

  const handleTabClick = (index: number) => {
    setInternalActiveIndex(index);
    onTabChange?.(index);
  };

  return (
    <section className="relative w-full min-h-screen bg-[#07080a] text-white pt-28 pb-12 overflow-hidden flex flex-col justify-between selection:bg-[#38bdf8] selection:text-black">

      {/* Structural Wireframe Container */}
      <div className="relative z-10 max-w-[1300px] w-full mx-auto px-6 md:px-12 my-auto pt-8 pb-16">
        {children ? (
          children
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Wireframe Slot */}
            <div className="lg:col-span-6 flex flex-col items-start space-y-8">
              {leftContent}
            </div>

            {/* Right 3D Visual Wireframe Slot */}
            <div className="lg:col-span-6 relative flex items-center justify-center min-h-[420px]">
              {rightContent}
            </div>
          </div>
        )}
      </div>

    </section>
  );
}

export default DossHeroWireframe;
