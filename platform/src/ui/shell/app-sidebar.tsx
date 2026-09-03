"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/foundation/database/client";
import {
  SquarePen,
  Plus,
  ArrowUp,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Bot,
  Newspaper,
  Workflow,
  Cable,
  MessagesSquare,
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
  const router = useRouter();
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
    setOpenMenuSessionId(null);
    setHistorySessions((prev) => prev.filter((s) => s.sessionId !== sessionId));

    if (chatContext?.deleteChatSession) {
      chatContext.deleteChatSession(sessionId);
    } else {
      try {
        await fetch(`/api/agent/sessions?sessionId=${encodeURIComponent(sessionId)}`, {
          method: "DELETE",
        });
        const activeSessionId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("sessionId") : null;
        if (activeSessionId === sessionId) {
          const url = new URL(window.location.href);
          url.pathname = "/dashboard";
          url.searchParams.delete("sessionId");
          window.history.pushState({}, "", url.toString());
        }
      } catch (err) {
        console.error("Failed to delete session:", err);
      }
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = mounted ? (theme ?? resolvedTheme ?? "dark") : "dark";

  // Load history sessions from backend API as the authoritative source
  const loadHistory = async () => {
    try {
      setIsFetchingHistory(true);

      // 1. Fetch authoritative remote DB sessions from backend API
      let remoteSessions: Array<{ sessionId: string; title: string; updatedAt: string }> = [];
      const res = await fetch("/api/agent/sessions");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.sessions)) {
          remoteSessions = data.sessions;
        }
      }

      // 2. Authoritative map of sessions from the database
      const map = new Map<string, { sessionId: string; title: string; updatedAt: string }>();
      remoteSessions.forEach((s) => map.set(s.sessionId, s));

      // 3. Purge stale/deleted sessions from browser localStorage
      if (typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem("allel.chat-history.v1");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              const validLocal = parsed.filter((s: any) => s && s.id && map.has(s.id));
              window.localStorage.setItem("allel.chat-history.v1", JSON.stringify(validLocal));
            }
          }
        } catch {
          // Ignore
        }
      }

      // Keep all distinct sessions (deduplicated strictly by sessionId, never title!)
      const finalSessions = Array.from(map.values()).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      setHistorySessions(finalSessions);
    } catch (err) {
      console.error("Failed to load history sessions:", err);
    } finally {
      setIsFetchingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
    const handleRefresh = () => {
      setTimeout(() => {
        loadHistory();
        setPendingSessionId(null);
      }, 0);
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

  // Automatically clear pending state as soon as title has resolved and text begins
  useEffect(() => {
    if (pendingSessionId && chatContext?.activeSessionTitle && !chatContext?.isResolvingTitle) {
      setPendingSessionId(null);
    }
  }, [pendingSessionId, chatContext?.activeSessionTitle, chatContext?.isResolvingTitle]);

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
      label: "Brief",
      href: "/dashboard/brief",
      icon: Newspaper,
      exact: false,
    },
    {
      label: "Agents",
      href: "/dashboard/agents",
      icon: Bot,
      exact: false,
    },
    {
      label: "Automations",
      href: "/dashboard/flows",
      icon: Workflow,
      exact: false,
    },
    {
      label: "Connections",
      href: "/dashboard/connections",
      icon: Cable,
      exact: false,
    },
    {
      label: "Sessions",
      href: "/dashboard/history",
      icon: MessagesSquare,
      exact: false,
    },
  ];

  const handleNewTask = () => {
    chatContext?.startNewChat();
    if (pathname !== "/dashboard") {
      router.push("/dashboard");
    }
  };

  const handleSelectSession = (sessionId: string) => {
    const session = chatContext?.savedSessions.find(
      (item) => item.id === sessionId
    );

    if (session && chatContext?.loadChatSession) {
      chatContext.loadChatSession(session);
    } else {
      window.dispatchEvent(
        new CustomEvent("allel:load-session", {
          detail: { sessionId },
        })
      );
    }

    if (pathname !== "/dashboard") {
      router.push(`/dashboard?sessionId=${encodeURIComponent(sessionId)}`);
    } else {
      const url = new URL(window.location.href);
      url.pathname = "/dashboard";
      url.searchParams.set("sessionId", sessionId);
      window.history.pushState({}, "", url.toString());
    }
  };

  const activeSessionId = chatContext?.currentSessionId ?? null;
  const activeSessionTitle = chatContext?.activeSessionTitle ?? null;

  const isResolving = Boolean(
    chatContext?.isResolvingTitle ||
    (pendingSessionId && (!activeSessionTitle || chatContext?.isResolvingTitle)) ||
    (chatContext?.isLoading &&
     chatContext?.messages &&
     chatContext.messages.length > 0 &&
     !chatContext.messages.some((m) => m.role === "assistant" && (m.parts?.some((p) => p.type === "text" && typeof (p as { text?: string }).text === "string" && (p as { text?: string }).text!.trim().length > 0))))
  );

  const effectiveHistorySessions = React.useMemo(() => {
    const list = [...historySessions];
    if (
      activeSessionId &&
      activeSessionTitle &&
      chatContext?.messages &&
      chatContext.messages.length > 0
    ) {
      const existingIdx = list.findIndex((s) => s.sessionId === activeSessionId);
      if (existingIdx >= 0) {
        if (list[existingIdx].title !== activeSessionTitle) {
          list[existingIdx] = { ...list[existingIdx], title: activeSessionTitle };
        }
      } else if (!isResolving) {
        list.unshift({
          sessionId: activeSessionId,
          title: activeSessionTitle,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    return list;
  }, [historySessions, activeSessionId, activeSessionTitle, chatContext?.messages, isResolving]);

  const hasPersistedActiveSession = effectiveHistorySessions.some(
    (s) => s.sessionId === activeSessionId
  );

  const isNewTaskSelected = Boolean(
    pathname === "/dashboard" &&
    !hasPersistedActiveSession &&
    (chatContext?.messages?.length ?? 0) === 0 &&
    !isResolving
  );

  const visibleHistorySessions = effectiveHistorySessions.filter((s) => {
    if (isResolving && (s.sessionId === activeSessionId || s.sessionId === pendingSessionId)) {
      return false;
    }
    return true;
  });

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#09090b] text-[#F4F4F5] transition-colors relative p-1.5 gap-1.5">
      {/* Sidebar Pane — External background environment */}
      <aside
        className={cn(
          "flex flex-col justify-between h-full bg-transparent transition-all duration-300 ease-in-out shrink-0 py-1 px-1 relative z-30 select-none",
          collapsed ? "w-[52px]" : "w-[236px]"
        )}
      >
        {/* Top Header & Navigation */}
        <div className="flex flex-col min-h-0 flex-1">
          {/* Header Row: New Logo & Icons */}
          {collapsed ? (
            /* Minimized Top Header: Logo converts to PanelLeftOpen Expand icon on hover */
            <div className="flex justify-center items-center py-1">
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="group relative w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/[0.08] transition-colors cursor-pointer"
                title="Expand sidebar"
              >
                <img
                  src="/logo-icon.png"
                  alt="Allel"
                  className="w-[22px] h-[22px] object-contain shrink-0 mix-blend-screen bg-transparent transition-all duration-150 group-hover:opacity-0 group-hover:scale-95"
                />
                <PanelLeftOpen className="w-4 h-4 text-white absolute opacity-0 group-hover:opacity-100 transition-all duration-150 group-hover:scale-100 scale-90" />
              </button>
            </div>
          ) : (
            /* Expanded Top Header: New Logo + Search + PanelLeftClose icon */
            <div className="flex items-center justify-between px-1.5 py-0.5">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 transition-opacity hover:opacity-80 group p-0.5"
              >
                <img
                  src="/logo-icon.png"
                  alt="Allel"
                  className="w-[24px] h-[24px] object-contain shrink-0 mix-blend-screen bg-transparent"
                />
              </Link>

              <div className="flex items-center gap-0.5 text-zinc-400">
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

          {/* + New task Action Button (with clean distance mb-3) */}
          <button
            type="button"
            onClick={handleNewTask}
            className={cn(
              "group flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer border border-transparent mt-6 mb-1.5",
              isNewTaskSelected
                ? "bg-[#18181a] text-white border-[#242428] shadow-xs font-semibold"
                : "text-zinc-400 hover:text-white hover:bg-[#141416]",
              collapsed && "justify-center px-0 mt-6 mb-1.5"
            )}
            title="New task"
          >
            <SquarePen className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors shrink-0" />
            {!collapsed && <span>New task</span>}
          </button>

          {/* Nav List with Matching Consistent Spacing */}
          <nav className="flex flex-col gap-1.5">
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
                <div className="flex flex-col gap-0.5 overflow-y-auto pr-1 flex-1 max-h-none custom-scrollbar">
                  {/* Active / Pending Session Skeleton Item with white round loader & left-to-right shimmer animation */}
                  {isResolving && (
                    <div className="relative group w-full my-0.5 animate-in fade-in duration-200">
                      <div className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 border border-transparent bg-transparent text-white select-none">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-white shrink-0" />
                        <div className="relative overflow-hidden w-28 h-3 rounded bg-zinc-800/80 shrink-0">
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-skeleton-shimmer" />
                        </div>
                      </div>
                    </div>
                  )}

                  {isFetchingHistory && visibleHistorySessions.length === 0 ? (
                    <div className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-500 font-normal truncate">
                      Loading history...
                    </div>
                  ) : visibleHistorySessions.length === 0 && !isResolving ? (
                    <div className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-500 font-normal truncate">
                      No previous sessions
                    </div>
                  ) : (
                    visibleHistorySessions.map((session) => {
                      const isSelected = Boolean(
                        pathname === "/dashboard" &&
                        !isResolving &&
                        activeSessionId === session.sessionId
                      );
                      return (
                        <div key={session.sessionId} className="relative group w-full">
                          <button
                            type="button"
                            onClick={() => handleSelectSession(session.sessionId)}
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
                  src={avatarUrl || (userEmail ? `https://unavatar.io/${encodeURIComponent(userEmail)}` : '/logos/gmail.svg')}
                  alt="Account"
                  onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement
                    target.onerror = null
                    target.style.display = 'none'
                  }}
                  className="w-5 h-5 rounded-full object-cover shrink-0 border border-white/10"
                />
                <span className="text-xs">Account</span>
              </button>

              {/* Connected Account Info Card Popover */}
              {isProfileMenuOpen && (
                <div
                  onMouseLeave={() => setIsProfileMenuOpen(false)}
                  className="absolute bottom-10 left-0 z-50 w-64 bg-[#121214] border border-white/[0.08] rounded-xl p-2.5 shadow-2xl animate-in fade-in zoom-in-95 duration-150 select-none backdrop-blur-md"
                >
                  {/* User Profile Header */}
                  <div className="flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.03] border border-white/[0.04] mb-2">
                    <img
                      src={avatarUrl || (userEmail ? `https://unavatar.io/${encodeURIComponent(userEmail)}` : '/logos/gmail.svg')}
                      alt={userName}
                      onError={(e) => {
                        const target = e.currentTarget as HTMLImageElement
                        target.onerror = null
                        target.style.display = 'none'
                      }}
                      className="w-8 h-8 rounded-full object-cover shrink-0 border border-white/10"
                    />
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-white truncate">
                          {userName}
                        </span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                          Free
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-400 truncate">
                        {userEmail}
                      </span>
                    </div>
                  </div>

                  {/* Actions Section */}
                  <div className="flex flex-col gap-0.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
                      className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        {currentTheme === "light" ? (
                          <Sun className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <Moon className="w-3.5 h-3.5 text-zinc-400" />
                        )}
                        <span>Theme</span>
                      </div>
                      <span className="capitalize text-[11px] text-zinc-400">{currentTheme === "light" ? "Light" : "Dark"}</span>
                    </button>

                    <Link
                      href="/dashboard/settings"
                      onClick={() => setIsProfileMenuOpen(false)}
                      className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-colors"
                    >
                      <Settings className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Account Settings</span>
                    </Link>

                    <div className="h-[1px] bg-white/[0.06] my-1" />

                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5 text-red-400" />
                      <span>Sign Out</span>
                    </button>
                  </div>
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

      {/* Main Workspace Panel Container — Sharper refined floating canvas */}
      <main className="flex-1 h-full min-w-0 bg-[#121214] border border-white/[0.08] rounded-[6px] relative overflow-hidden flex flex-col shadow-2xl">
        {children}
      </main>
    </div>
  );
}
