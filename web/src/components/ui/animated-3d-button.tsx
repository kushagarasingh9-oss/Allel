"use client";

import React, { useState } from "react";
import { motion, HTMLMotionProps } from "motion/react";
import { cn } from "@/lib/utils";

export interface Animated3DButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  children?: React.ReactNode;
  label?: string;
  variant?: "cyan" | "orange" | "dark";
  size?: "sm" | "md" | "lg";
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

// 7x7 Pixel Grid Matrix
const EXACT_7X7_MATRIX = [
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 0],
  [0, 0, 0, 0, 1, 1, 1],
  [0, 0, 0, 0, 1, 1, 1],
  [0, 0, 0, 1, 1, 1, 0],
  [0, 0, 0, 1, 1, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
];

// Helper to render the 7x7 pixel grid chevron badge
function PixelChevron7x7({ isDark = false, isSmall = false }: { isDark?: boolean; isSmall?: boolean }) {
  return (
    <div className="grid grid-cols-7 grid-rows-7 gap-[1px] items-center justify-center shrink-0">
      {EXACT_7X7_MATRIX.flatMap((row, rowIndex) =>
        row.map((active, colIndex) => {
          const key = `${rowIndex}-${colIndex}`;
          const isFilled = active === 1;
          return (
            <span
              key={key}
              className={cn(
                isSmall ? "w-[2px] h-[2px] rounded-[0.4px]" : "w-[2.5px] h-[2.5px] rounded-[0.5px]",
                "transition-all duration-200",
                isFilled
                  ? "bg-white shadow-[0_0_3px_rgba(255,255,255,1)] opacity-100"
                  : isDark
                  ? "bg-white/15"
                  : "bg-white/35"
              )}
            />
          );
        })
      )}
    </div>
  );
}

export function Animated3DButton({
  children,
  label = "Go to Dashboard",
  variant = "cyan",
  size = "sm",
  className,
  onClick,
  style,
  ...props
}: Animated3DButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  const isCyan = variant === "cyan";
  const isDark = variant === "dark";
  const isSmall = size === "sm";

  // Exact styles from user provided HeroCta component
  const customStyles: React.CSSProperties = isCyan
    ? {
        backgroundImage: "linear-gradient(to right, #59c8ff, #4e7ff3, #3390ff)",
        backgroundSize: "280%",
        boxShadow:
          "rgba(71,184,255,0.5) 0px 0px 16px, rgba(58,125,233,0.25) 0px 4px 4px -1px, rgba(175,230,255,0.5) 3px 3px 6px inset, rgba(19,95,216,0.35) -3px -3px 6px inset",
        ...style,
      }
    : { ...style };

  return (
    <motion.button
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 450, damping: 25 }}
      onClick={onClick}
      style={customStyles}
      className={cn(
        "relative overflow-hidden inline-flex items-center justify-between select-none cursor-pointer transition-all duration-300 ease-out text-white font-medium",
        isSmall
          ? "px-4 py-2 rounded-lg text-xs min-h-[36px] h-[36px] gap-2"
          : "px-7 py-3.5 rounded-xl text-base min-w-[120px] min-h-[44px] gap-3",
        variant === "orange" && [
          "bg-gradient-to-b from-[#ff8c3a] via-[#ff771e] to-[#f05a00]",
          "border border-white/50 shadow-[0_4px_16px_rgba(249,115,22,0.5),inset_0_1.5px_2px_rgba(255,255,255,0.85),inset_0_-2px_4px_rgba(0,0,0,0.3)]",
          "hover:border-white/70 hover:shadow-[0_8px_22px_rgba(249,115,22,0.7),0_0_16px_rgba(255,255,255,0.45)]",
        ],
        variant === "dark" && [
          "bg-gradient-to-b from-[#2c2d33] via-[#1c1d22] to-[#121316]",
          "border border-white/20 shadow-[0_4px_16px_rgba(0,0,0,0.5),inset_0_1px_1.5px_rgba(255,255,255,0.35)]",
          "hover:border-white/40 hover:shadow-[0_6px_20px_rgba(0,0,0,0.7)]",
        ],
        className
      )}
      {...props}
    >
      {/* Glossy Top Edge Highlight */}
      <span className="absolute inset-x-3 top-[1px] h-[1px] bg-gradient-to-r from-transparent via-white/80 to-transparent pointer-events-none z-20" />

      {/* Shimmer Light Layer */}
      <motion.div
        animate={
          isHovered
            ? { x: ["-100%", "200%"] }
            : { x: "-100%" }
        }
        transition={{ duration: 1, ease: "easeInOut", repeat: Infinity }}
        className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none skew-x-12 z-10"
      />

      {/* Default State: Pixel Badge on Left + Text Label */}
      <motion.div
        animate={{
          opacity: isHovered ? 0 : 1,
          scale: isHovered ? 0.95 : 1,
        }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="flex items-center gap-2.5 w-full justify-between z-10"
      >
        {/* Left Badge Box */}
        <div
          className={cn(
            "flex items-center justify-center shrink-0 transition-all duration-300 z-10",
            isSmall ? "w-5.5 h-5.5 rounded-md" : "w-7.5 h-7.5 rounded-lg",
            isDark
              ? "bg-gradient-to-b from-[#2a2c33] to-[#141518] border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.25)]"
              : "bg-white/25 border border-white/60 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.7),0_2px_6px_rgba(0,0,0,0.15)] backdrop-blur-md"
          )}
        >
          <PixelChevron7x7 isDark={isDark} isSmall={isSmall} />
        </div>

        {/* Text Label */}
        <span className={cn("tracking-tight text-center flex-1 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]", isSmall ? "text-xs font-semibold" : "text-base font-medium")}>
          {children || label}
        </span>
      </motion.div>

      {/* Hover State: Expanding Flowing Pixel Chevron Animation Stream */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{
          opacity: isHovered ? 1 : 0,
        }}
        transition={{ duration: 0.2, ease: "easeIn" }}
        className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none px-2 z-10"
      >
        <motion.div
          animate={
            isHovered
              ? { x: ["-25%", "0%"] }
              : { x: "0%" }
          }
          transition={{
            duration: 0.75,
            ease: "linear",
            repeat: Infinity,
          }}
          className="flex items-center gap-3 shrink-0"
        >
          <PixelChevron7x7 isDark={isDark} isSmall={isSmall} />
          <PixelChevron7x7 isDark={isDark} isSmall={isSmall} />
          <PixelChevron7x7 isDark={isDark} isSmall={isSmall} />
          <PixelChevron7x7 isDark={isDark} isSmall={isSmall} />
          <PixelChevron7x7 isDark={isDark} isSmall={isSmall} />
          <PixelChevron7x7 isDark={isDark} isSmall={isSmall} />
        </motion.div>
      </motion.div>
    </motion.button>
  );
}

export default Animated3DButton;
