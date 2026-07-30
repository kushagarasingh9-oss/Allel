"use client";

import Link from "next/link";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export default function Home() {
  return (
    <div
      className={`${inter.variable} min-h-screen bg-[#FAFAFA] text-[#18181B] font-sans antialiased selection:bg-[#0284C7] selection:text-white flex flex-col`}
    >
      {/* Clean Minimal Header: Plain text Log in link only */}
      <header className="w-full max-w-[1240px] mx-auto px-6 md:px-10 h-20 flex items-center justify-end">
        <Link
          href="/dashboard"
          className="text-[#18181B] hover:opacity-70 font-medium text-sm transition-opacity cursor-pointer"
        >
          Log in
        </Link>
      </header>

      {/* Hero Content + Video Mockup Canvas */}
      <main className="w-full flex flex-col items-center px-4 md:px-8 pt-60 md:pt-88 pb-32">

        {/* Large Outer Mockup — Identical Glass Border Wrapper */}
        <div className="w-full max-w-[1240px] bg-white/25 backdrop-blur-xl border border-white/40 rounded-[12px] p-1 md:p-1.5 shadow-2xl">
          
          {/* Outer Backdrop Container (Image Background: image1.png) */}
          <div 
            className="w-full rounded-[10px] overflow-hidden relative shadow-md p-6 md:p-12 transition-all duration-300 flex items-center justify-center bg-black"
            style={{ 
              minHeight: '880px'
            }}
          >
            {/* Background Image */}
            <img
              src="/image1.png"
              alt="Mockup Background"
              className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
            />

            {/* Ultra-Thin Edgy Glassy Border Covering */}
            <div className="relative z-10 w-full bg-white/25 backdrop-blur-xl border border-white/40 rounded-[10px] p-1 md:p-1.5 shadow-2xl">
              
              {/* Inner App Window (Empty Dotted Grid Canvas) */}
              <div 
                className="w-full bg-[#F8F9FA] overflow-hidden border border-gray-200/60 rounded-[12px] relative p-6 md:p-8"
                style={{
                  minHeight: '680px',
                  boxShadow: '0 20px 50px -10px rgba(0, 0, 0, 0.15)',
                  backgroundImage: 'radial-gradient(#D1D5DB 1px, transparent 1px)',
                  backgroundSize: '16px 16px'
                }}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}