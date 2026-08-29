"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/foundation/database/client";
import {
  Plus,
  ArrowUp,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Bot,
  Zap,
  Plug,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Bell,
  Monitor,
  Settings,
  Download,
  HelpCircle,
  LogOut,
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
  const [userName, setUserName] = useState<string>("kushagra singh");
  const [userEmail, setUserEmail] = useState<string>("kushagrasingh175@gmail.com");
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(true);
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
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
        
        const activeEmail = user?.email || "kushagrasingh175@gmail.com";
        setUserEmail(activeEmail);

        const meta = user?.user_metadata ?? {};
        const name = meta.full_name || meta.name || meta.display_name || activeEmail.split('@')[0] || "kushagra singh";
        setUserName(name);

        // Fetch exact profile picture from Google OAuth metadata or unavatar service for the logged-in Gmail address
        const pic = meta.avatar_url || meta.picture || meta.avatar_path || `https://unavatar.io/${encodeURIComponent(activeEmail)}`;
        setAvatarUrl(pic);
      } catch (err) {
        console.error("Failed to load user info:", err);
        setAvatarUrl(`https://unavatar.io/kushagrasingh175@gmail.com`);
      }
    }
    loadUser();
  }, []);

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

  // Nav list matching user spec: Agents, Automations, Connections, Sessions
  const navLinks = [
    {
      label: "Agents",
      href: "/dashboard/agents",
      icon: Bot,
      exact: false,
    },
    {
      label: "Automations",
      href: "/dashboard/flows",
      icon: Zap,
      exact: false,
    },
    {
      label: "Connections",
      href: "/dashboard/connections",
      icon: Plug,
      exact: false,
    },
    {
      label: "Sessions",
      href: "/dashboard/history",
      icon: MessageSquare,
      exact: false,
    },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#141414] text-[#F4F4F5] transition-colors">
      {/* Sidebar Pane — Runable exact #101010 surface */}
      <aside
        className={cn(
          "flex flex-col justify-between h-full bg-[#101010] border-r border-[#1f1f1f] transition-all duration-300 ease-in-out shrink-0 py-3 px-3 relative select-none",
          collapsed ? "w-[60px]" : "w-[240px]"
        )}
      >
        {/* Top Header & Navigation */}
        <div className="flex flex-col min-h-0 flex-1">
          {/* Header Row: Logo & Icons */}
          {collapsed ? (
            /* Minimized Top Header: Logo converts to PanelLeftOpen Expand icon on hover */
            <div className="flex justify-center items-center py-1">
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="group relative w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/[0.08] transition-colors cursor-pointer"
                title="Expand sidebar"
              >
                <img
                  src="/1.png"
                  alt="Allel"
                  className="w-5 h-5 object-contain shrink-0 filter brightness-0 invert transition-all duration-150 group-hover:opacity-0 group-hover:scale-95"
                />
                <PanelLeftOpen className="w-4 h-4 text-white absolute opacity-0 group-hover:opacity-100 transition-all duration-150 group-hover:scale-100 scale-90" />
              </button>
            </div>
          ) : (
            /* Expanded Top Header: Logo + Search + PanelLeftClose icon */
            <div className="flex items-center justify-between px-1">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 transition-opacity hover:opacity-80 group"
              >
                <img
                  src="/1.png"
                  alt="Allel"
                  className="w-5.5 h-5.5 object-contain shrink-0 filter brightness-0 invert"
                />
              </Link>

              <div className="flex items-center gap-1 text-zinc-400">
                <button
                  type="button"
                  className="p-1 hover:text-white rounded-md hover:bg-white/[0.06] transition-colors cursor-pointer"
                  title="Search"
                >
                  <Search className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  className="p-1 hover:text-white rounded-md hover:bg-white/[0.06] transition-colors cursor-pointer"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* + New task Action Button (Shifted down a bit with mt-3.5 mb-1) */}
          <button
            type="button"
            onClick={() => {
              if (window.location.pathname !== "/dashboard") {
                window.location.href = "/dashboard";
              } else {
                window.dispatchEvent(new CustomEvent("allel:new-session"));
              }
            }}
            className={cn(
              "group flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer border border-transparent mt-3.5 mb-1",
              "text-zinc-300 hover:text-white hover:bg-[#1c1c1c] hover:border-[#262626]",
              collapsed && "justify-center px-0 mt-3 mb-1"
            )}
            title="New task"
          >
            <div className="w-4 h-4 rounded-full border border-zinc-400 group-hover:border-white flex items-center justify-center shrink-0 transition-colors">
              <Plus className="w-3 h-3 text-zinc-300 group-hover:text-white transition-colors" />
            </div>
            {!collapsed && <span>New task</span>}
          </button>

          {/* Nav List with Increased Breathing Room */}
          <nav className="flex flex-col gap-1.5 py-1">
            {navLinks.map((link) => {
              const IconComp = link.icon;
              const isActive = link.exact
                ? pathname === link.href
                : pathname?.startsWith(link.href);

              return (
                <Link
                  key={link.label}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs transition-all duration-150 font-medium",
                    isActive
                      ? "bg-[#1c1c1c] text-white border border-[#262626]"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-[#181818]"
                  )}
                >
                  <IconComp className="w-4 h-4 shrink-0 text-zinc-400" />
                  {!collapsed && <span>{link.label}</span>}
                </Link>
              );
            })}
          </nav>

          {/* History Accordion Section */}
          {!collapsed && (
            <div className="flex flex-col gap-1 pt-3 flex-1 overflow-hidden">
              <button
                type="button"
                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                className="flex items-center gap-1 px-1 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                <span>History</span>
                {isHistoryOpen ? (
                  <ChevronDown className="w-3 h-3 text-zinc-500" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-zinc-500" />
                )}
              </button>
              {isHistoryOpen && (
                <div className="flex flex-col gap-0.5 overflow-y-auto pr-1">
                  <div className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 font-normal truncate">
                    Generating title...
                  </div>
                  <Link
                    href="/dashboard"
                    className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-[#181818] transition-colors truncate"
                  >
                    Close integration, draft-send...
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Footer Toolbar (Devin Style: Account Link + Settings / Download / Help Icons) */}
        {!collapsed && (
          <div className="pt-2 px-1 relative flex items-center justify-between gap-1" ref={menuRef}>
            {/* Left User Account Action Link */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                onMouseEnter={() => setIsProfileMenuOpen(true)}
                className="flex items-center gap-2 text-xs font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer group"
              >
                <img
                  src={avatarUrl || `https://unavatar.io/${encodeURIComponent(userEmail)}`}
                  alt="Account"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://unavatar.io/${encodeURIComponent(userEmail)}`;
                  }}
                  className="w-5 h-5 rounded-full object-cover shrink-0 border border-white/10"
                />
                <span className="text-xs">Account</span>
              </button>

              {/* Connected Account Info Card Popover (Shown on hover/click) */}
              {isProfileMenuOpen && (
                <div
                  onMouseLeave={() => setIsProfileMenuOpen(false)}
                  className="absolute bottom-9 left-0 z-50 w-64 bg-[#161616] border border-[#262626] rounded-xl p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150 select-none"
                >
                  <div className="flex items-center gap-2.5 p-2 mb-2 bg-[#202020] rounded-lg border border-[#282828]">
                    <img
                      src={avatarUrl || `https://unavatar.io/${encodeURIComponent(userEmail)}`}
                      alt={userName}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://unavatar.io/${encodeURIComponent(userEmail)}`;
                      }}
                      className="w-8 h-8 rounded-full object-cover shrink-0 border border-white/10"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium text-white truncate">
                        {userName}
                      </span>
                      <span className="text-[11px] text-zinc-400 truncate">
                        {userEmail}
                      </span>
                    </div>
                  </div>

                  <div className="px-2 py-1 mb-2 text-[11px] text-zinc-400 flex items-center justify-between border-t border-b border-[#242424]">
                    <span>Connected Account:</span>
                    <span className="text-emerald-400 font-medium">Active (Free Tier)</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
                    className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-[#202020] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      {currentTheme === "light" ? (
                        <Sun className="w-3.5 h-3.5 text-amber-500" />
                      ) : (
                        <Moon className="w-3.5 h-3.5 text-neutral-400" />
                      )}
                      <span>Theme</span>
                    </div>
                    <span className="capitalize text-[11px] text-zinc-400">{currentTheme === "light" ? "Light" : "Dark"}</span>
                  </button>

                  <Link
                    href="/dashboard/settings"
                    onClick={() => setIsProfileMenuOpen(false)}
                    className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-[#202020] transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Account Settings</span>
                  </Link>

                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors mt-0.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5 text-red-400" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>

            {/* Right Action Icons (Settings, Download App, Help) */}
            <div className="flex items-center gap-2.5 text-zinc-400">
              <Link
                href="/dashboard/settings"
                className="hover:text-white transition-colors cursor-pointer p-1"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </Link>

              <button
                type="button"
                className="hover:text-white transition-colors cursor-pointer p-1"
                title="Download desktop app"
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                type="button"
                className="hover:text-white transition-colors cursor-pointer p-1"
                title="Help & Documentation"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Main Workspace Panel Container — Flush Full Canvas */}
      <main className="flex-1 h-full min-w-0 bg-[#141414] relative overflow-auto flex flex-col">
        {children}
      </main>
    </div>
  );
}
