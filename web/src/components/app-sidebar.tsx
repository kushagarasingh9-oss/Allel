"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
import { cn } from "@/lib/utils";

export function AppSidebarContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, setTheme, resolvedTheme } = useTheme();
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
      label: "Home",
      href: "/dashboard",
      icon: Home,
      exact: true,
    },
    {
      label: "Workflows",
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
    <div className="flex h-screen w-full overflow-hidden bg-[#EAEBED] dark:bg-[#0A0A0C] text-neutral-900 dark:text-white p-2 gap-2">
      {/* Sidebar Pane — Base background */}
      <aside
        className={cn(
          "flex flex-col justify-between h-full bg-[#EAEBED] dark:bg-[#0A0A0C] transition-all duration-300 ease-in-out shrink-0 py-2 px-3 relative",
          collapsed ? "w-[60px]" : "w-[220px]"
        )}
      >
        {/* Top Section: Logo & Links */}
        <div className="flex flex-col gap-6">
          {/* Logo Mark */}
          <div className="flex items-center px-2 pt-2 pb-1">
            <div className="flex items-center gap-2">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-neutral-900 dark:text-white shrink-0"
              >
                <path fillRule="evenodd" clipRule="evenodd" d="M12 3a6.5 6.5 0 0 0-6.5 6.5V12h13V9.5A6.5 6.5 0 0 0 12 3zm-6.5 11a3.5 3.5 0 0 0-3.5 3.5V19h7v-5H5.5zm9 0v5h7v-1.5a3.5 3.5 0 0 0-3.5-3.5h-3.5z" />
              </svg>
            </div>
          </div>

          {/* Navigation Links */}
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
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 font-medium",
                    isActive
                      ? "bg-white text-neutral-950 shadow-sm border border-black/[0.06] dark:border-transparent dark:bg-[#222226] dark:text-white"
                      : "text-neutral-600 hover:text-neutral-950 hover:bg-black/[0.04] dark:text-neutral-400 dark:hover:text-neutral-200 dark:hover:bg-[#18181C]"
                  )}
                >
                  <IconComponent className="w-4 h-4 shrink-0" />
                  {!collapsed && <span>{link.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section: Settings Icon Button with Profile Popover Menu */}
        <div className="pt-2 relative" ref={menuRef}>
          {/* Profile Popover Popup */}
          {isProfileMenuOpen && (
            <div className="absolute bottom-12 left-0 z-50 w-64 bg-[#141418]/95 border border-white/20 rounded-xl p-3 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 p-2 mb-2 bg-white/[0.04] rounded-lg">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={userName}
                    className="w-9 h-9 rounded-full object-cover shrink-0 border border-white/20"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-red-600 via-orange-500 to-amber-400 flex items-center justify-center text-white text-xs font-bold shrink-0 border border-white/20">
                    {userName ? userName.slice(0, 2).toUpperCase() : "KS"}
                  </div>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium text-white truncate">
                    {userName}
                  </span>
                  <span className="text-[11px] text-neutral-400 truncate">
                    {userEmail}
                  </span>
                </div>
              </div>

              <div className="h-px bg-white/10 my-1" />

              <button
                type="button"
                onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
                className="flex items-center justify-between w-full px-2.5 py-2 rounded-lg text-xs text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  {currentTheme === "light" ? (
                    <Sun className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Moon className="w-4 h-4 text-neutral-400" />
                  )}
                  <span>Theme</span>
                </div>
                <div className="flex items-center gap-1.5 bg-white/[0.08] hover:bg-white/[0.12] border border-white/10 px-2 py-0.5 rounded-md text-[11px] font-medium text-neutral-200">
                  <span className="capitalize">{currentTheme === "light" ? "Light" : "Dark"}</span>
                </div>
              </button>

              <Link
                href="/dashboard/settings"
                onClick={() => setIsProfileMenuOpen(false)}
                className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-xs text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <Settings className="w-4 h-4 text-neutral-400" />
                <span>Account Settings</span>
              </Link>

              <button
                onClick={handleSignOut}
                className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors mt-0.5"
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
              "p-2 text-neutral-400 hover:text-white transition-colors rounded-lg cursor-pointer flex items-center justify-center",
              isProfileMenuOpen ? "text-white bg-white/[0.08]" : "hover:bg-white/[0.04]"
            )}
            title="Settings & Profile"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Floating Main Workspace Panel Container with Sharper Glassy Edges */}
      <main className="flex-1 h-full min-w-0 bg-[#0E0E12] border border-white/20 rounded-lg relative overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.8),_0_0_20px_rgba(255,255,255,0.02)] backdrop-blur-xl">
        {/* Pinned Sidebar Toggle inside Main Panel */}
        <div className="absolute top-3 left-3 z-30">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-md bg-[#141418]/80 hover:bg-[#1f1f26] text-neutral-400 hover:text-white border border-white/15 shadow-sm backdrop-blur-md transition-all"
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
