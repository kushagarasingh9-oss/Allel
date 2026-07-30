'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

const navItems = [
  {
    href: '/dashboard',
    label: 'Daily Brief',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    href: '/dashboard/accounts',
    label: 'Accounts',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: '/dashboard/drafts',
    label: 'Draft Queue',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
  },
  {
    href: '/dashboard/settings',
    label: 'Integrations',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
      </svg>
    ),
  },
]

export default function DashboardSidebar({ user }: { user: User }) {
  const pathname = usePathname()
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <aside className="flex w-[250px] flex-shrink-0 flex-col border-r border-[#ffffff0a] bg-[#080808]">
      <div className="border-b border-[#ffffff0a] px-6 py-6">
        <Link
          href="/"
          className="text-[21px] tracking-tight text-white"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Cofounder
        </Link>
        <div className="mt-4 rounded-[18px] border border-[#ffffff12] bg-[#0f0f10] px-3 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#666]">Founder view</p>
          <p className="mt-1 text-[12px] leading-relaxed text-[#a8a8b3]">
            Daily churn brief, follow-up drafts, and account signals in one place.
          </p>
        </div>
      </div>

      <nav className="flex-1 px-4 py-5">
        <div className="mb-2 px-3 pb-2 text-[10px] font-medium uppercase tracking-[0.22em] text-[#444]">
          Product
        </div>
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mb-1 flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-[13px] font-medium transition-colors ${
                isActive
                  ? 'bg-[#121214] text-white ring-1 ring-[#ffffff12]'
                  : 'text-[#6d6d76] hover:bg-[#0f0f10] hover:text-[#d9d9df]'
              }`}
            >
              <span className={isActive ? 'opacity-100' : 'opacity-50'}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-[#ffffff0a] p-4">
        <div className="mb-4 rounded-[16px] border border-[#ffffff10] bg-[#0f0f10] px-3 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#53535d]">Signed in</p>
          <p className="mt-1 truncate text-[12px] text-[#cacad1]">{user.email}</p>
        </div>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-[12px] text-[#6d6d76] transition-colors hover:bg-[#0f0f10] hover:text-[#d9d9df]"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  )
}
