"use client";

import React from "react";

interface DotmSquare12Props {
  size?: number;
  dotSize?: number;
  speed?: number;
  bloom?: boolean;
  className?: string;
}

export function DotmSquare12({
  size = 24,
  dotSize = 3,
  speed = 1.2,
  bloom = true,
  className = "",
}: DotmSquare12Props) {
  // 3x3 dot matrix animated grid
  const dots = [
    { delay: "0s" },
    { delay: `${0.15 / speed}s` },
    { delay: `${0.3 / speed}s` },
    { delay: `${0.75 / speed}s` },
    { delay: `${0.9 / speed}s` },
    { delay: `${0.45 / speed}s` },
    { delay: `${0.6 / speed}s` },
    { delay: `${0.45 / speed}s` },
    { delay: `${0.3 / speed}s` },
  ];

  return (
    <div
      className={`inline-grid grid-cols-3 gap-1 items-center justify-center ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      {dots.map((dot, index) => (
        <span
          key={index}
          className="rounded-full bg-white transition-all duration-300 animate-pulse"
          style={{
            width: `${dotSize}px`,
            height: `${dotSize}px`,
            animationDuration: `${0.8 / speed}s`,
            animationDelay: dot.delay,
            boxShadow: bloom ? "0 0 8px rgba(255, 255, 255, 0.8), 0 0 12px rgba(255, 255, 255, 0.4)" : "none",
          }}
        />
      ))}
    </div>
  );
}

export function BloomGlow() {
  return (
    <DotmSquare12
      size={32}
      dotSize={4}
      speed={1.2}
      bloom
    />
  );
}
