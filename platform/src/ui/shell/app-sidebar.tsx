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
  MoreHorizontal,
  Trash2,
  Loader2,
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
  const [openMenuSessionId, setOpenMenuSessionId] = useState<string | null>(null);
  const [historySessions, setHistorySessions] = useState<
    Array<{ sessionId: string; title: string; updatedAt: string }>
  >([]);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setHistorySessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
      setOpenMenuSessionId(null);
      await fetch(`/api/agent/sessions?sessionId=${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
      const activeSessionId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("sessionId") : null;
      if (activeSessionId === sessionId) {
        window.location.href = "/dashboard";
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = mounted ? (theme ?? resolvedTheme ?? "dark") : "dark";

  // Load history sessions from backend API + localStorage fallback
  const loadHistory = async () => {
    try {
      setIsFetchingHistory(true);
      
      // 1. Read local saved sessions from localStorage for instant hydration
      let localSessions: Array<{ sessionId: string; title: string; updatedAt: string }> = [];
      if (typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem("allel.chat-history.v1");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              localSessions = parsed.map((s: any) => ({
                sessionId: s.id,
                title: s.title,
                updatedAt: s.createdAt || new Date().toISOString(),
              }));
            }
          }
        } catch {
          // Ignore storage read error
        }
      }

      // 2. Fetch remote DB sessions from backend API
      let remoteSessions: Array<{ sessionId: string; title: string; updatedAt: string }> = [];
      const res = await fetch("/api/agent/sessions");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.sessions)) {
          remoteSessions = data.sessions;
        }
      }

      // 3. Merge local + remote sessions (local title precedence for active runs)
      const map = new Map<string, { sessionId: string; title: string; updatedAt: string }>();
      remoteSessions.forEach((s) => map.set(s.sessionId, s));
      localSessions.forEach((s) => {
        const existing = map.get(s.sessionId);
        if (existing) {
          map.set(s.sessionId, { ...existing, title: s.title });
        } else {
          map.set(s.sessionId, s);
        }
      });

      // Strict title deduplication: keep only 1 entry per distinct title
      const titleSeen = new Set<string>();
      const finalUniqueSessions: Array<{ sessionId: string; title: string; updatedAt: string }> = [];
      for (const s of map.values()) {
        if (s.title && !titleSeen.has(s.title)) {
          titleSeen.add(s.title);
          finalUniqueSessions.push(s);
        }
      }

      setHistorySessions(finalUniqueSessions);
    } catch (err) {
      console.error("Failed to load history sessions:", err);
    } finally {
      setIsFetchingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
    const handleRefresh = () => {
      loadHistory();
      setPendingSessionId(null);
    };
    const handleSessionStarting = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.sessionId) {
        setPendingSessionId(detail.sessionId);
      }
    };

    window.addEventListener("allel:refresh-history", handleRefresh);
    window.addEventListener("allel:session-starting", handleSessionStarting);
    return () => {
      window.removeEventListener("allel:refresh-history", handleRefresh);
      window.removeEventListener("allel:session-starting", handleSessionStarting);
    };
  }, []);

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
    <div className="flex h-screen w-full overflow-hidden bg-[#0f0f10] text-[#F4F4F5] transition-colors relative">
      {/* Sidebar Pane — Clean Dark #0b0b0c Surface */}
      <aside
        className={cn(
          "flex flex-col justify-between h-full bg-[#0b0b0c] border-r border-[#1a1a1c] transition-all duration-300 ease-in-out shrink-0 py-3 px-3 relative z-30 select-none",
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
                className="group relative w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/[0.1] transition-colors cursor-pointer"
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
                  className="p-1 hover:text-white rounded-md hover:bg-white/[0.08] transition-colors cursor-pointer"
                  title="Search"
                >
                  <Search className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  className="p-1 hover:text-white rounded-md hover:bg-white/[0.08] transition-colors cursor-pointer"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* + New task Action Button */}
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
              "text-zinc-300 hover:text-white hover:bg-white/[0.08] hover:border-white/[0.12]",
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
                    "flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs transition-all duration-150 font-medium border border-transparent",
                    isActive
                      ? "bg-[#18181a] text-white border-[#242428] shadow-xs font-semibold"
                      : "text-zinc-400 hover:text-white hover:bg-[#141416]"
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
                <div className="flex flex-col gap-0.5 overflow-y-auto pr-1 max-h-[220px] custom-scrollbar">
                  {/* Active / Pending Session Skeleton Item with white round loader & left-to-right shimmer animation */}
                  {(pendingSessionId || (chatContext?.isResolvingTitle && chatContext?.currentSessionId)) && !historySessions.some((s) => s.sessionId === (pendingSessionId || chatContext?.currentSessionId)) && (
                    <div className="relative group w-full my-0.5 animate-in fade-in duration-200">
                      <div className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 border border-transparent bg-transparent text-white select-none">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-white shrink-0" />
                        <div className="relative overflow-hidden w-28 h-3 rounded bg-zinc-800/80 shrink-0">
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-skeleton-shimmer" />
                        </div>
                      </div>
                    </div>
                  )}

                  {isFetchingHistory && historySessions.length === 0 && !pendingSessionId ? (
                    <div className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-500 font-normal truncate">
                      Loading history...
                    </div>
                  ) : historySessions.length === 0 && !pendingSessionId ? (
                    <div className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-500 font-normal truncate">
                      No previous sessions
                    </div>
                  ) : (
                    historySessions.map((session) => {
                      const activeSessionId = chatContext?.currentSessionId || (typeof window !== "undefined"
                        ? new URLSearchParams(window.location.search).get("sessionId")
                        : null);
                      const isSelected = activeSessionId === session.sessionId;

                      return (
                        <div key={session.sessionId} className="relative group w-full">
                          <button
                            type="button"
                            onClick={() => {
                              if (typeof window !== "undefined") {
                                const url = new URL(window.location.href);
                                url.pathname = "/dashboard";
                                url.searchParams.set("sessionId", session.sessionId);
                                window.history.pushState({}, "", url.toString());
                                window.dispatchEvent(new CustomEvent("allel:load-session", { detail: { sessionId: session.sessionId } }));
                              }
                            }}
                            className={cn(
                              "w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150 truncate cursor-pointer flex items-center justify-between gap-1 border border-transparent",
                              isSelected
                                ? "text-white font-medium bg-white/[0.06]"
                                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                            )}
                            title={session.title}
                          >
                            <span className="truncate pr-1">{session.title}</span>

                            {/* Three-dot menu button on hover */}
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuSessionId(openMenuSessionId === session.sessionId ? null : session.sessionId);
                              }}
                              className="p-0.5 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-pointer"
                              title="Session options"
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </div>
                          </button>

                          {/* Session Actions Popover Menu (Minimal Clean) */}
                          {openMenuSessionId === session.sessionId && (
                            <div
                              className="absolute top-7 right-1 z-50 bg-[#181818] border border-[#282828] rounded-lg p-1 shadow-2xl animate-in fade-in zoom-in-95 duration-100 select-none text-xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={(e) => handleDeleteSession(session.sessionId, e)}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
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
