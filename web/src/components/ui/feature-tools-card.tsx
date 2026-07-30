"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface FeatureToolsCardProps {
  title?: string;
  description?: string;
  cardBg?: string;
  icon1?: React.ReactNode;
  icon2?: React.ReactNode;
  icon3?: React.ReactNode;
  icon4?: React.ReactNode;
  icon5?: React.ReactNode;
  enableTilt?: boolean;
  tiltStrength?: number;
  enableMagnetic?: boolean;
  magneticStrength?: number;
  magneticRadius?: number;
  enableOrbit?: boolean;
  orbitSpeed?: number;
  orbitColor?: string;
  className?: string;
}

// Default SVGs matching Framer component icons (GitHub, Notion, Gmail, Slack, Drive)
const DefaultGitHubIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FFFFFF" className="w-full h-full pointer-events-none">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
  </svg>
);

const DefaultNotionIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FFFFFF" className="w-full h-full pointer-events-none">
    <path fillRule="evenodd" clipRule="evenodd" d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466l1.823 1.447zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933l3.222-.187z"/>
  </svg>
);

const DefaultGmailIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-full h-full pointer-events-none">
    <path d="M3.5 5.5h17A1.5 1.5 0 0 1 22 7v10a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 17V7a1.5 1.5 0 0 1 1.5-1.5z" fill="#FFFFFF"/>
    <path d="M22 7v10a1.5 1.5 0 0 1-1.5 1.5h-2V10.66L22 7z" fill="#4285F4"/>
    <path d="M2 7v10a1.5 1.5 0 0 0 1.5 1.5h2V10.66L2 7z" fill="#34A853"/>
    <path d="M5.5 18.5V10.66L12 14.5l6.5-3.84v7.84h-13z" fill="#EA4335"/>
    <path d="M22 7L12 13.5 2 7l1-1.5h18L22 7z" fill="#FBBC04"/>
  </svg>
);

const DefaultSlackIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-full h-full pointer-events-none">
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
    <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
    <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
    <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#ECB22E"/>
  </svg>
);

const DefaultDriveIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-full h-full pointer-events-none">
    <path d="M7.71 3.5L1.15 15l3.42 6 6.55-11.5z" fill="#0066DA"/>
    <path d="M16.29 3.5H7.71l6.55 11.5h8.59z" fill="#FFC107"/>
    <path d="M22.85 15h-8.59l-3.16 5.5h8.31z" fill="#1B872B"/>
    <path d="M14.26 15l-3.14-5.5L7.71 3.5l3.42 6h.01l3.12 5.5z" fill="#EA4335"/>
    <path d="M22.85 15l-3.14-5.5h-5.45l3.14 5.5z" fill="#188038"/>
  </svg>
);

export function FeatureToolsCard({
  title = "Feature Block Animated Card",
  description = "A card that showcases a set of tools your platform connects with.",
  cardBg = "rgba(40, 40, 40, 0.70)",
  icon1,
  icon2,
  icon3,
  icon4,
  icon5,
  enableTilt = true,
  tiltStrength = 8,
  enableMagnetic = true,
  magneticStrength = 0.4,
  magneticRadius = 120,
  enableOrbit = true,
  orbitSpeed = 18,
  orbitColor = "rgba(255, 255, 255, 0.18)",
  className,
}: FeatureToolsCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const magnetRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const onMove = (e: MouseEvent) => {
      const rect = card.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (enableTilt) {
        const rx = ((my - rect.height / 2) / (rect.height / 2)) * -tiltStrength;
        const ry = ((mx - rect.width / 2) / (rect.width / 2)) * tiltStrength;
        card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      }

      if (enableMagnetic) {
        magnetRefs.current.forEach((m) => {
          if (!m) return;
          const r = m.getBoundingClientRect();
          const cx = r.left + r.width / 2 - rect.left;
          const cy = r.top + r.height / 2 - rect.top;
          const dx = mx - cx;
          const dy = my - cy;
          const dist = Math.hypot(dx, dy);

          if (dist < magneticRadius) {
            const pull = (1 - dist / magneticRadius) * magneticStrength;
            m.style.transform = `translate(${dx * pull}px, ${dy * pull}px)`;
          } else {
            m.style.transform = `translate(0px, 0px)`;
          }
        });
      }
    };

    const onLeave = () => {
      if (enableTilt) {
        card.style.transform = `perspective(900px) rotateX(0deg) rotateY(0deg)`;
      }
      if (enableMagnetic) {
        magnetRefs.current.forEach((m) => {
          if (m) m.style.transform = `translate(0px, 0px)`;
        });
      }
    };

    card.addEventListener("mousemove", onMove);
    card.addEventListener("mouseleave", onLeave);

    return () => {
      card.removeEventListener("mousemove", onMove);
      card.removeEventListener("mouseleave", onLeave);
    };
  }, [enableTilt, tiltStrength, enableMagnetic, magneticStrength, magneticRadius]);

  const setMagnet = (i: number) => (el: HTMLDivElement | null) => {
    magnetRefs.current[i] = el;
  };

  return (
    <div
      ref={cardRef}
      className={cn(
        "relative w-full max-w-[384px] p-8 rounded-[12px] border border-white/10 select-none overflow-hidden box-border shadow-[inset_2px_4px_16px_0px_rgba(248,248,248,0.06)] transition-transform duration-200 ease-out",
        className
      )}
      style={{
        background: cardBg,
        transformStyle: "preserve-3d",
        willChange: "transform",
      }}
    >
      <style jsx global>{`
        @keyframes ftc-orbit-spin {
          to {
            transform: rotate(360deg);
          }
        }
        .ftc-circle {
          transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.35s ease;
          cursor: pointer;
        }
        .ftc-circle:hover {
          transform: scale(1.2) !important;
          z-index: 20;
          box-shadow: inset 0px 0px 12px 0px rgba(248, 248, 248, 0.4), 0px 32px 32px -16px rgba(0, 0, 0, 0.5) !important;
        }
      `}</style>

      {/* Stage Container */}
      <div
        className="relative h-[320px] w-full rounded-[12px] overflow-hidden z-40"
        style={{
          background: cardBg,
          WebkitMaskImage: "radial-gradient(50% 50% at 50% 50%, white 0%, transparent 100%)",
          maskImage: "radial-gradient(50% 50% at 50% 50%, white 0%, transparent 100%)",
        }}
      >
        {/* Animated Orbit Ring */}
        {enableOrbit && (
          <div
            className="absolute top-1/2 left-1/2 w-[280px] h-[280px] -mt-[140px] -ml-[140px] rounded-full pointer-events-none z-1"
            style={{
              background: `conic-gradient(from 0deg, transparent 0%, ${orbitColor} 25%, transparent 50%, ${orbitColor} 75%, transparent 100%)`,
              WebkitMask: "radial-gradient(circle, transparent 56%, black 58%, black 80%, transparent 82%)",
              mask: "radial-gradient(circle, transparent 56%, black 58%, black 80%, transparent 82%)",
              animation: `ftc-orbit-spin ${orbitSpeed}s linear infinite`,
            }}
          />
        )}

        {/* Stage Inner - Icons Row */}
        <div className="h-full relative z-2 flex items-center justify-center p-8 box-border">
          <div className="flex flex-row flex-shrink-0 items-center justify-center gap-2">
            {/* Icon 1 - Small (32x32) */}
            <div
              ref={setMagnet(0)}
              className="inline-flex transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] will-change-transform"
            >
              <div
                className="ftc-circle w-8 h-8 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                style={{
                  background: "rgba(248,248,248,0.01)",
                  boxShadow: "inset 0px 0px 8px 0px rgba(248,248,248,0.25), 0px 32px 24px -16px rgba(0,0,0,0.40)",
                }}
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  {icon1 || <DefaultGitHubIcon />}
                </div>
              </div>
            </div>

            {/* Icon 2 - Medium (48x48) */}
            <div
              ref={setMagnet(1)}
              className="inline-flex transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] will-change-transform"
            >
              <div
                className="ftc-circle w-12 h-12 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                style={{
                  background: "rgba(248,248,248,0.01)",
                  boxShadow: "inset 0px 0px 8px 0px rgba(248,248,248,0.25), 0px 32px 24px -16px rgba(0,0,0,0.40)",
                }}
              >
                <div className="w-6 h-6 flex items-center justify-center">
                  {icon2 || <DefaultNotionIcon />}
                </div>
              </div>
            </div>

            {/* Icon 3 - Large Main (64x64) */}
            <div
              ref={setMagnet(2)}
              className="inline-flex transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] will-change-transform"
            >
              <div
                className="ftc-circle w-16 h-16 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                style={{
                  background: "rgba(248,248,248,0.01)",
                  boxShadow: "inset 0px 0px 8px 0px rgba(248,248,248,0.25), 0px 32px 24px -16px rgba(0,0,0,0.40)",
                }}
              >
                <div className="w-8 h-8 flex items-center justify-center">
                  {icon3 || <DefaultGmailIcon />}
                </div>
              </div>
            </div>

            {/* Icon 4 - Medium (48x48) */}
            <div
              ref={setMagnet(3)}
              className="inline-flex transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] will-change-transform"
            >
              <div
                className="ftc-circle w-12 h-12 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                style={{
                  background: "rgba(248,248,248,0.01)",
                  boxShadow: "inset 0px 0px 8px 0px rgba(248,248,248,0.25), 0px 32px 24px -16px rgba(0,0,0,0.40)",
                }}
              >
                <div className="w-6 h-6 flex items-center justify-center">
                  {icon4 || <DefaultSlackIcon />}
                </div>
              </div>
            </div>

            {/* Icon 5 - Small (32x32) */}
            <div
              ref={setMagnet(4)}
              className="inline-flex transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] will-change-transform"
            >
              <div
                className="ftc-circle w-8 h-8 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                style={{
                  background: "rgba(248,248,248,0.01)",
                  boxShadow: "inset 0px 0px 8px 0px rgba(248,248,248,0.25), 0px 32px 24px -16px rgba(0,0,0,0.40)",
                }}
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  {icon5 || <DefaultDriveIcon />}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Title & Description */}
      <h3 className="text-[18px] font-semibold text-white pt-2 pb-1 m-0 tracking-tight leading-snug">
        {title}
      </h3>
      <p className="text-[14px] font-normal text-white/50 m-0 leading-normal">
        {description}
      </p>
    </div>
  );
}

export default FeatureToolsCard;
