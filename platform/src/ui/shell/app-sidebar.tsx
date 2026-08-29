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
    <div className="flex h-screen w-full overflow-hidden bg-[#141414] text-[#F4F4F5] transition-colors">
      {/* Sidebar Pane — Flush edge-to-edge Devin exact #191919 surface */}
      <aside
        className={cn(
          "flex flex-col justify-between h-full bg-[#191919] border-r border-[#222222] transition-all duration-300 ease-in-out shrink-0 py-2.5 px-2.5 relative",
          collapsed ? "w-[60px]" : "w-[240px]"
        )}
      >
        {/* Top Section: Header, + New Session & Links */}
        <div className="flex flex-col gap-3 min-h-0 flex-1">
          {/* Top Devin-Style Header: Agent/Editor Toggle + Collapse Icon */}
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-center bg-[#252525] p-0.5 rounded-md border border-[#2e2e2e]">
              <button
                type="button"
                className="px-2.5 py-0.5 rounded text-[11px] font-semibold bg-[#383838] text-white shadow-xs cursor-pointer"
              >
                Agent
              </button>
              <button
                type="button"
                className="px-2.5 py-0.5 rounded text-[11px] font-medium text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                Editor
              </button>
            </div>

            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1 text-zinc-400 hover:text-white rounded-md hover:bg-white/[0.06] cursor-pointer transition-colors"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* + New Session Action Button (Devin Style) */}
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
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer border",
              "bg-[#252525] hover:bg-[#2c2c2c] text-[#F4F4F5] border-[#2e2e2e] hover:border-[#383838] shadow-xs"
            )}
            title="New session"
          >
            <span className="text-sm leading-none font-semibold text-blue-400">+</span>
            {!collapsed && <span>New session</span>}
          </button>

          {/* Primary Navigation Links */}
          <nav className="flex flex-col gap-0.5">
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

          {/* Devin-Style Spaces / Recent Sessions Section */}
          {!collapsed && (
            <div className="flex flex-col gap-1 pt-2 border-t border-[#222222] flex-1 overflow-hidden">
              <div className="flex items-center justify-between px-2 pb-1 text-[11px] font-semibold text-zinc-400">
                <span>Spaces</span>
                <div className="flex items-center gap-1 text-zinc-500">
                  <span className="hover:text-white cursor-pointer">+</span>
                </div>
              </div>
              <div className="flex flex-col gap-1 overflow-y-auto pr-1">
                <Link
                  href="/dashboard"
                  className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-[#222222] transition-colors group"
                >
                  <div className="flex items-center justify-between truncate">
                    <span className="truncate font-medium">Check my inbox & calendar</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                    <span>2h ago</span>
                  </div>
                </Link>
                <Link
                  href="/dashboard"
                  className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-[#222222] transition-colors group"
                >
                  <div className="flex items-center justify-between truncate">
                    <span className="truncate">Stripe MRR & Churn Scan</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                    <span>Yesterday</span>
                  </div>
                </Link>
                <Link
                  href="/dashboard"
                  className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-[#222222] transition-colors group"
                >
                  <div className="flex items-center justify-between truncate">
                    <span className="truncate">Devin Meetup Calendar Fix</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                    <span>4d ago</span>
                  </div>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Section: Settings Icon Button with Profile Popover Menu */}
        <div className="pt-2 relative" ref={menuRef}>
          {/* Profile Popover Popup */}
          {isProfileMenuOpen && (
            <div className="absolute bottom-12 left-0 z-50 w-64 bg-[#191919] border border-[#222222] rounded-xl p-3 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 p-2 mb-2 bg-[#252525] rounded-lg border border-[#2e2e2e]">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={userName}
                    className="w-9 h-9 rounded-full object-cover shrink-0 border border-white/10"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0 border border-white/10">
                    {userName ? userName.slice(0, 2).toUpperCase() : "KS"}
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

              <div className="h-px bg-[#222222] my-1" />

              <button
                type="button"
                onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
                className="flex items-center justify-between w-full px-2.5 py-2 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-[#252525] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  {currentTheme === "light" ? (
                    <Sun className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Moon className="w-4 h-4 text-neutral-400" />
                  )}
                  <span>Theme</span>
                </div>
                <div className="flex items-center gap-1.5 bg-[#252525] border border-[#2e2e2e] px-2 py-0.5 rounded-md text-[11px] font-medium text-zinc-200">
                  <span className="capitalize">{currentTheme === "light" ? "Light" : "Dark"}</span>
                </div>
              </button>

              <Link
                href="/dashboard/settings"
                onClick={() => setIsProfileMenuOpen(false)}
                className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-[#252525] transition-colors"
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

          {/* Minimal Pure Settings Icon Trigger Button */}
          <button
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className={cn(
              "p-2 text-zinc-400 hover:text-white transition-colors rounded-lg cursor-pointer flex items-center justify-center",
              isProfileMenuOpen ? "text-white bg-[#252525]" : "hover:bg-[#252525]"
            )}
            title="Settings & Profile"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Workspace Panel Container — Flush Full Canvas */}
      <main className="flex-1 h-full min-w-0 bg-[#141414] relative overflow-auto flex flex-col">
        {children}
      </main>
    </div>
  );
}
