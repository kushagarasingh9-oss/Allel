"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/foundation/database/client";
import {
  Home,
  Zap,
  Plug,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  LogOut,
  User,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/foundation/utils";
import { useOptionalChatContext } from "@/ui/chat/chat-provider";

export function AppSidebarContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const chatContext = useOptionalChatContext();
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("kushagara singh");
  const [userEmail, setUserEmail] = useState<string>("kushagrasingh175@g...");
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = mounted ? (theme ?? resolvedTheme ?? "dark") : "dark";

  useEffect(() => {
    async function loadUser() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const meta = user.user_metadata ?? {};
          const pic = meta.avatar_url || meta.picture || meta.avatar_path || null;
          if (pic) setAvatarUrl(pic);
          
          const name = meta.full_name || meta.name || meta.display_name || user.email?.split('@')[0] || "kushagara singh";
          setUserName(name);

          if (user.email) {
            setUserEmail(user.email);
          }
        }
      } catch (err) {
        console.error("Failed to load user info:", err);
      }
    }
    loadUser();
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.href = "/auth/login";
    } catch (e) {
      console.error("Sign out error:", e);
    }
  };

  const links = [
    {
      label: "Sessions",
      href: "/dashboard",
      icon: Home,
      exact: true,
    },
    {
      label: "Automations",
      href: "/dashboard/flows",
      icon: Zap,
    },
    {
      label: "Connections",
      href: "/dashboard/settings",
      icon: Plug,
      exact: true,
    },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#141414] text-[#F4F4F5] p-2 gap-2 transition-colors">
      {/* Sidebar Pane — Devin-style exact #191919 surface */}
      <aside
        className={cn(
          "flex flex-col justify-between h-full bg-[#191919] border border-[#222222] rounded-xl transition-all duration-300 ease-in-out shrink-0 py-3 px-2.5 relative",
          collapsed ? "w-[60px]" : "w-[240px]"
        )}
      >
        {/* Top Section: Logo, + New Session & Links */}
        <div className="flex flex-col gap-4 min-h-0 flex-1">
          {/* Logo / Brand Header */}
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 px-2 py-1 transition-opacity hover:opacity-80 group select-none"
          >
            <img
              src="/1.png"
              alt="Allel"
              width={22}
              height={22}
              className="w-5.5 h-5.5 object-contain shrink-0"
            />
            {!collapsed && (
              <span
                className="text-[17px] text-[#F4F4F5] leading-none tracking-tight font-medium"
                style={{
                  fontFamily: '"Cabinet Grotesk", "Cabinet Grotesk Placeholder", sans-serif',
                }}
              >
                Allel
              </span>
            )}
          </Link>

          {/* + New Session Action Button (Devin Style) */}
          <button
            type="button"
            onClick={() => {
              // Start a clean new session or reload
              if (window.location.pathname !== "/dashboard") {
                window.location.href = "/dashboard";
              } else {
                window.dispatchEvent(new CustomEvent("allel:new-session"));
              }
            }}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer border",
              "bg-[#252525] hover:bg-[#2c2c2c] text-[#F4F4F5] border-[#2e2e2e] hover:border-[#383838] shadow-xs"
            )}
            title="New session"
          >
            <span className="text-sm leading-none font-semibold text-blue-400">+</span>
            {!collapsed && <span>New session</span>}
          </button>

          {/* Primary Navigation Links */}
          <nav className="flex flex-col gap-1">
            {links.map((link) => {
              const IconComponent = link.icon;
              const isActive = link.exact
                ? pathname === link.href
                : pathname?.startsWith(link.href);

              return (
                <Link
                  key={link.label}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150 font-medium",
                    isActive
                      ? "bg-[#282828] text-white border border-[#333333] shadow-xs"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-[#222222]"
                  )}
                >
                  <IconComponent className="w-3.5 h-3.5 shrink-0" />
                  {!collapsed && <span>{link.label}</span>}
                </Link>
              );
            })}
          </nav>

          {/* Devin-Style Recent Sessions Section */}
          {!collapsed && (
            <div className="flex flex-col gap-1 pt-2 border-t border-[#222222] flex-1 overflow-hidden">
              <div className="flex items-center justify-between px-2 pb-1 text-[11px] font-medium text-zinc-500 tracking-wider uppercase">
                <span>Recent</span>
              </div>
              <div className="flex flex-col gap-1 overflow-y-auto pr-1">
                <Link
                  href="/dashboard"
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-[#222222] transition-colors group"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    <span className="truncate">Check my inbox & calendar</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 group-hover:text-zinc-400 shrink-0">
                    Active
                  </span>
                </Link>
                <Link
                  href="/dashboard"
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-[#222222] transition-colors group"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
                    <span className="truncate">Stripe MRR & Churn Scan</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 group-hover:text-zinc-400 shrink-0">
                    2h ago
                  </span>
                </Link>
                <Link
                  href="/dashboard"
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-[#222222] transition-colors group"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
                    <span className="truncate">Devin Meetup Calendar Fix</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 group-hover:text-zinc-400 shrink-0">
                    Yesterday
                  </span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Section: Settings Icon Button with Profile Popover Menu */}
        <div className="pt-2 relative" ref={menuRef}>
          {/* Profile Popover Popup */}
          {isProfileMenuOpen && (
            <div className="absolute bottom-12 left-0 z-50 w-64 bg-white dark:bg-[#141418]/95 border border-neutral-200 dark:border-white/20 rounded-xl p-3 shadow-xl dark:shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 p-2 mb-2 bg-neutral-50 dark:bg-white/[0.04] rounded-lg border border-neutral-200/60 dark:border-transparent">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={userName}
                    className="w-9 h-9 rounded-full object-cover shrink-0 border border-neutral-200 dark:border-white/20"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-red-600 via-orange-500 to-amber-400 flex items-center justify-center text-white text-xs font-bold shrink-0 border border-neutral-200 dark:border-white/20">
                    {userName ? userName.slice(0, 2).toUpperCase() : "KS"}
                  </div>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium text-neutral-900 dark:text-white truncate">
                    {userName}
                  </span>
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                    {userEmail}
                  </span>
                </div>
              </div>

              <div className="h-px bg-neutral-200 dark:bg-white/10 my-1" />

              <button
                type="button"
                onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
                className="flex items-center justify-between w-full px-2.5 py-2 rounded-lg text-xs text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  {currentTheme === "light" ? (
                    <Sun className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Moon className="w-4 h-4 text-neutral-400" />
                  )}
                  <span>Theme</span>
                </div>
                <div className="flex items-center gap-1.5 bg-neutral-100 dark:bg-white/[0.08] hover:bg-neutral-200 dark:hover:bg-white/[0.12] border border-neutral-200 dark:border-white/10 px-2 py-0.5 rounded-md text-[11px] font-medium text-neutral-800 dark:text-neutral-200">
                  <span className="capitalize">{currentTheme === "light" ? "Light" : "Dark"}</span>
                </div>
              </button>

              <Link
                href="/dashboard/settings"
                onClick={() => setIsProfileMenuOpen(false)}
                className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-xs text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                <Settings className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                <span>Account Settings</span>
              </Link>

              <button
                onClick={handleSignOut}
                className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors mt-0.5 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          )}

          {/* Minimal Pure Settings Icon Trigger Button */}
          <button
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className={cn(
              "p-2 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors rounded-lg cursor-pointer flex items-center justify-center",
              isProfileMenuOpen ? "text-neutral-900 dark:text-white bg-neutral-200 dark:bg-white/[0.08]" : "hover:bg-neutral-200/60 dark:hover:bg-white/[0.04]"
            )}
            title="Settings & Profile"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Floating Main Workspace Panel Container */}
      <main className="flex-1 h-full min-w-0 bg-neutral-50 dark:bg-[#0E0E12] border border-neutral-200 dark:border-white/20 rounded-lg relative overflow-auto shadow-sm dark:shadow-[0_8px_32px_rgba(0,0,0,0.8),_0_0_20px_rgba(255,255,255,0.02)] backdrop-blur-xl transition-colors">
        {/* Pinned Sidebar Toggle inside Main Panel */}
        <div className="absolute top-3 left-3 z-30">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-md bg-white/80 dark:bg-[#141418]/80 hover:bg-neutral-100 dark:hover:bg-[#1f1f26] text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white border border-neutral-200 dark:border-white/15 shadow-xs backdrop-blur-md transition-all cursor-pointer"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        {children}
      </main>
    </div>
  );
}
