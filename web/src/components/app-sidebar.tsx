"use client";
import React, { useState } from "react";
import { Sidebar, SidebarBody, SidebarLink } from "@/components/ui/sidebar";
import {
  IconInbox,
  IconChecklist,
  IconHierarchy,
  IconUserBolt,
  IconPlugConnected
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export function AppSidebarContainer({ children }: { children: React.ReactNode }) {
  const links = [
    {
      label: "Inbox",
      href: "/dashboard",
      icon: (
        <IconInbox className="h-5 w-5 shrink-0 text-neutral-400" />
      ),
    },
    {
      label: "Todo",
      href: "/dashboard/todo",
      icon: (
        <IconChecklist className="h-5 w-5 shrink-0 text-neutral-400" />
      ),
    },
    {
      label: "Flows",
      href: "/dashboard/flows",
      icon: (
        <IconHierarchy className="h-5 w-5 shrink-0 text-neutral-400" />
      ),
    },
    {
      label: "Integrations",
      href: "/dashboard/settings",
      icon: (
        <IconPlugConnected className="h-5 w-5 shrink-0 text-neutral-400" />
      ),
    },
  ];
  const [open, setOpen] = useState(false);
  
  return (
    <div
      className={cn(
        "flex w-full flex-1 flex-col overflow-hidden bg-[#141416] md:flex-row",
        "h-screen"
      )}
    >
      <Sidebar open={open} setOpen={setOpen}>
        <SidebarBody className="justify-between gap-10 flex flex-col h-full">
          <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
            
            {/* The links container flex-1 handles vertical centering */}
            <div className="flex-1 flex flex-col justify-center gap-3">
              {links.map((link, idx) => (
                <SidebarLink key={idx} link={link} />
              ))}
            </div>
          </div>
          <div>
            <SidebarLink
              link={{
                label: "Cofounder ops",
                href: "/dashboard/profile",
                icon: (
                  <div className="h-7 w-7 shrink-0 rounded-full bg-[#222] flex items-center justify-center">
                      <IconUserBolt className="h-4 w-4 text-white" />
                  </div>
                ),
              }}
            />
          </div>
        </SidebarBody>
      </Sidebar>
      
      {/* Right Pane Container */}
      <div className="flex flex-1 flex-col overflow-auto bg-[#141416] relative">
        {children}
      </div>
    </div>
  );
}

export const Logo = () => {
  return (
    <a
      href="#"
      className="relative z-20 flex items-center space-x-2 py-1 text-sm font-normal text-black"
    >
      <div className="h-5 w-6 shrink-0 rounded-tl-lg rounded-tr-sm rounded-br-lg rounded-bl-sm bg-black dark:bg-white" />
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="font-medium whitespace-pre text-black dark:text-white"
      >
        Cofounder
      </motion.span>
    </a>
  );
};
export const LogoIcon = () => {
  return (
    <a
      href="#"
      className="relative z-20 flex items-center space-x-2 py-1 text-sm font-normal text-black"
    >
      <div className="h-5 w-6 shrink-0 rounded-tl-lg rounded-tr-sm rounded-br-lg rounded-bl-sm bg-black dark:bg-white" />
    </a>
  );
};
