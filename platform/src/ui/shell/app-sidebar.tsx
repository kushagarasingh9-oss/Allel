"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/foundation/database/client";
import {
  Plus,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  BookOpen,
  FileText,
  Zap,
  ShieldCheck,
  GitPullRequest,
  Plug,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  Bell,
  Monitor,
  Settings,
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
        if (user) {
          const meta = user.user_metadata ?? {};
          const pic = meta.avatar_url || meta.picture || meta.avatar_path || null;
          if (pic) setAvatarUrl(pic);
          
          const name = meta.full_name || meta.name || meta.display_name || user.email?.split('@')[0] || "kushagra singh";
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

  // Nav list matching exact user spec: Artifacts, Automations, Security, Review, Customize
  const navLinks = [
    {
      label: "Artifacts",
      href: "/dashboard/artifacts",
      icon: BookOpen,
      exact: false,
    },
    {
      label: "Automations",
      href: "/dashboard/flows",
      icon: Zap,
      exact: false,
    },
    {
      label: "Security",
      href: "/dashboard/security",
      icon: ShieldCheck,
      exact: false,
    },
    {
      label: "Review",
      href: "/dashboard/review",
      icon: GitPullRequest,
      exact: false,
    },
    {
      label: "Customize",
      href: "/dashboard/customize",
      icon: SlidersHorizontal,
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
        <div className="flex flex-col gap-4 min-h-0 flex-1">
          {/* Header Row: Logo & Icons */}
          <div className="flex items-center justify-between px-1">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 transition-opacity hover:opacity-80 group"
            >
              <img
                src="/1.png"
                alt="Allel"
                className="w-5.5 h-5.5 object-contain shrink-0"
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
                onClick={() => setCollapsed(!collapsed)}
                className="p-1 hover:text-white rounded-md hover:bg-white/[0.06] transition-colors cursor-pointer"
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? (
                  <PanelLeftOpen className="w-4 h-4" />
                ) : (
                  <PanelLeftClose className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* + New task / session Action Button (Runable Pill Style) */}
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
              "flex items-center gap-2.5 px-3 py-2 rounded-2xl text-xs font-medium transition-all duration-150 cursor-pointer border",
              "bg-[#1c1c1c] hover:bg-[#242424] text-white border-[#262626] shadow-xs"
            )}
            title="New session"
          >
            <div className="w-4 h-4 rounded-full border border-white/40 flex items-center justify-center shrink-0">
              <Plus className="w-3 h-3 text-white" />
            </div>
            {!collapsed && <span>New task</span>}
          </button>

          {/* Nav List */}
          <nav className="flex flex-col gap-0.5">
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
                    "flex items-center gap-3 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150 font-medium",
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

          {/* Projects Accordion Section */}
          {!collapsed && (
            <div className="flex flex-col gap-1 pt-2">
              <button
                type="button"
                onClick={() => setIsProjectsOpen(!isProjectsOpen)}
                className="flex items-center gap-1 px-1 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                <span>Projects</span>
                {isProjectsOpen ? (
                  <ChevronDown className="w-3 h-3 text-zinc-500" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-zinc-500" />
                )}
              </button>
              {isProjectsOpen && (
                <div className="px-2 py-0.5 text-xs text-zinc-500 font-normal">
                  No projects yet
                </div>
              )}
            </div>
          )}

          {/* History Accordion Section */}
          {!collapsed && (
            <div className="flex flex-col gap-1 pt-2 flex-1 overflow-hidden">
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

        {/* Bottom Profile Toolbar (Runable Pill Bar) */}
        {!collapsed && (
          <div className="pt-2 relative flex items-center justify-between gap-1 border-t border-[#1a1a1a]" ref={menuRef}>
            {/* Left User Profile Pill */}
            <button
              type="button"
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-[#1c1c1c] hover:bg-[#242424] border border-[#262626] text-xs font-medium text-white transition-all min-w-0 max-w-[145px] cursor-pointer"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={userName}
                  className="w-5 h-5 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-amber-600 to-red-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                  {userName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <span className="truncate text-xs">{userName}</span>
            </button>

            {/* Right Action Icons */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="w-8 h-8 rounded-full bg-[#1c1c1c] hover:bg-[#242424] border border-[#262626] flex items-center justify-center text-zinc-400 hover:text-white transition-colors relative cursor-pointer"
                title="Notifications"
              >
                <Bell className="w-3.5 h-3.5" />
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-emerald-400 rounded-full" />
              </button>

              <button
                type="button"
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                className="w-8 h-8 rounded-full bg-[#1c1c1c] hover:bg-[#242424] border border-[#262626] flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Settings & Profile"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Profile Popover Popup */}
            {isProfileMenuOpen && (
              <div className="absolute bottom-12 left-0 z-50 w-60 bg-[#161616] border border-[#262626] rounded-xl p-3 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center gap-2.5 p-2 mb-2 bg-[#202020] rounded-lg border border-[#282828]">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={userName}
                      className="w-8 h-8 rounded-full object-cover shrink-0 border border-white/10"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 to-red-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {userName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium text-white truncate">
                      {userName}
                    </span>
                    <span className="text-[11px] text-zinc-400 truncate">
                      {userEmail}
                    </span>
                  </div>
                </div>

                <div className="h-px bg-[#262626] my-1" />

                <button
                  type="button"
                  onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
                  className="flex items-center justify-between w-full px-2.5 py-2 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-[#202020] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    {currentTheme === "light" ? (
                      <Sun className="w-4 h-4 text-amber-500" />
                    ) : (
                      <Moon className="w-4 h-4 text-neutral-400" />
                    )}
                    <span>Theme</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-[#202020] border border-[#282828] px-2 py-0.5 rounded-md text-[11px] font-medium text-zinc-200">
                    <span className="capitalize">{currentTheme === "light" ? "Light" : "Dark"}</span>
                  </div>
                </button>

                <Link
                  href="/dashboard/settings"
                  onClick={() => setIsProfileMenuOpen(false)}
                  className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-[#202020] transition-colors"
                >
                  <Settings className="w-4 h-4 text-zinc-400" />
                  <span>Account Settings</span>
                </Link>

                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors mt-0.5 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
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
