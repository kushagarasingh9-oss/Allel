import * as React from "react"
import { cn } from "@/lib/utils"
import { Check, XCircle, AlertTriangle, FileText } from "lucide-react"
import { SiGmail, SiGooglecalendar, SiNotion, SiStripe, SiPosthog, SiLinear, SiIntercom, SiGithub, SiGooglesheets } from "@icons-pack/react-simple-icons"

const SlackLogo = ({ size = 18 }: { size?: number }) => (
   <img src="/logos/slack.svg" width={size} height={size} alt="Slack" className="opacity-95" />
)

export const GenuineGmailIcon = ({ size = 18 }: { size?: number }) => (
   <img src="/logos/gmail.svg" width={size} height={size} alt="Gmail" className="opacity-95" />
)

export const GenuinePostHogIcon = ({ size = 18 }: { size?: number }) => (
   <img src="/logos/posthog.svg" width={size} height={size} alt="PostHog" />
)

// --- Generic Primitives for Output Cards ---

export function CardTitle({ children, icon, color = "text-white" }: { children: React.ReactNode, icon?: React.ReactNode, color?: string }) {
  return (
    <h3 className={cn("text-base font-medium flex items-center gap-2 mb-4", color)}>
      {children}
      {icon && <span className="flex items-center text-current">{icon}</span>}
    </h3>
  )
}

export function MetaDataGrid({ data }: { data: Record<string, string | React.ReactNode> }) {
  return (
    <div className="flex flex-col gap-1.5 mb-6">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="text-[13px] flex">
          <span className="text-neutral-200 font-medium w-[90px] shrink-0">{key}:</span>
          <span className="text-neutral-400">{value}</span>
        </div>
      ))}
    </div>
  )
}

export function ContentBlock({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h4 className="text-sm font-medium text-white mb-2">{title}</h4>
      <div className="text-[13px] text-neutral-400 leading-relaxed bg-[#111111] border border-[#262626] rounded-sm p-3">
        {children}
      </div>
    </div>
  )
}

export function JustificationList({ title, items, isError = false }: { title: string, items: { highlight: string, description: string }[], isError?: boolean }) {
  return (
    <div className="mb-4">
      <h4 className="text-sm font-medium text-white mb-3">{title}</h4>
      <ul className="flex flex-col gap-2.5">
        {items.map((item, idx) => (
          <li key={idx} className="flex gap-2">
            <div className={cn("mt-0.5 w-[14px] h-[14px] rounded-sm flex items-center justify-center shrink-0", isError ? "bg-red-500/20" : "bg-[#10b981]")}>
              {isError ? (
                <XCircle className="w-[10px] h-[10px] text-red-500" strokeWidth={3} />
              ) : (
                <Check className="w-[10px] h-[10px] text-white" strokeWidth={3} />
              )}
            </div>
            <div className="text-[13px] leading-[1.3] text-neutral-400">
              <span className="font-medium text-neutral-200">{item.highlight}</span> — {item.description}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SimpleList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-4 flex flex-col gap-1.5 marker:text-neutral-600 text-[13px] text-neutral-400 mb-6">
      {items.map((string, idx) => (
        <li key={idx}>{string}</li>
      ))}
    </ul>
  )
}

export function ActionButton({ children, href, primary = false, icon }: { children: React.ReactNode, href: string, primary?: boolean, icon?: React.ReactNode }) {
  return (
      <a
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 text-[13px] font-medium transition-colors rounded-sm px-4 py-2 mt-2",
        primary ? "bg-white text-black hover:bg-neutral-200" : "bg-[#262626] text-white hover:bg-[#333333]"
      )}
    >
      {children}
      {icon && <span className="flex items-center shrink-0 ml-1 opacity-90">{icon}</span>}
    </a>
  )
}


// --- Specific Payload Views ---

export function GenerativeEmailCard() {
  return (
    <div className="mt-6 mb-2 border-t border-[#262626] pt-6 flex flex-col">
      <CardTitle icon={<GenuineGmailIcon size={18} />} color="text-white">Your Most Important Email</CardTitle>

      <p className="text-[13px] text-neutral-300 mb-4">
        The most important email in your inbox right now is:
      </p>

      <MetaDataGrid
        data={{
          "From": "Anthropic Education",
          "Subject": "Your registration for Building with the Claude API",
          "Date": "Sunday, April 19, 2026 at 12:58 PM (Today!)",
          "Status": <span className="text-[#10b981]">Unread & Important</span>
        }}
      />

      <ContentBlock title="What it says:">
        This email confirms your registration for the &ldquo;Building with the Claude API&rdquo; course. You now have access to the learning content at: <br />
        <a href="#" className="underline decoration-neutral-600 underline-offset-4 hover:text-white transition-colors mt-2 inline-block">https://anthropic.skilljar.com/claude-api</a>
      </ContentBlock>

      <JustificationList
        title="Why this is your most important email:"
        items={[
          { highlight: "Most Recent", description: "It came in today, literally a few hours ago" },
          { highlight: "Actionable", description: "You need to access and begin the Claude API course" },
        ]}
      />
    </div>
  )
}

export function GenerativeSlackCard() {
  return (
    <div className="mt-6 mb-2 border-t border-[#262626] pt-6 flex flex-col">
      <CardTitle icon={<SlackLogo />} color="text-white">Critical Slack Mentions</CardTitle>

      <p className="text-[13px] text-neutral-300 mb-4">
        You have an urgent threaded mention from your engineering pod:
      </p>

      <MetaDataGrid
        data={{
          "Workspace": "IdeaSaas HQ",
          "Channel": "#eng-frontend",
          "Mentioned By": "@sarah_dev",
          "Time": "10:15 AM (15 mins ago)"
        }}
      />

      <ContentBlock title="Message Context:">
        &ldquo;Hey @kushagra, the Vercel deployment for the new generative feed is failing compilation on the edge runtime. Can you take a look when you get a sec? Sent a PR with a potential fix.&rdquo;
      </ContentBlock>

      <div>
        <ActionButton href="#" primary icon={<SlackLogo />}>View Thread in Slack</ActionButton>
      </div>
    </div>
  )
}

export function GenerativeVercelDevOpsCard() {
  return (
    <div className="mt-6 mb-2 border-t border-[#262626] pt-6 flex flex-col">
      <CardTitle icon={<AlertTriangle className="w-5 h-5 text-neutral-400" />} color="text-white">Vercel Deployment Failed</CardTitle>

      <p className="text-[13px] text-neutral-300 mb-4">
        I intercepted a failed production deployment triggered by your recent push.
      </p>

      <MetaDataGrid
        data={{
          "Project": "agentic-workflow-web",
          "Environment": "Production",
          "Commit": "7a3b4f1 (fix: layout overflow)",
          "Duration": "42 seconds (Failed)"
        }}
      />

      <ContentBlock title="Build Error Log:">
        <span className="font-mono text-neutral-300">Error: Expected a string (for built-in components) but got: undefined. at MockAgentMessage (src/components/agent-feed/mock-message.tsx:55)</span>
      </ContentBlock>

      <JustificationList
        title="Root Cause Analysis:"
        isError={true}
        items={[
          { highlight: "Missing Export", description: "The component `<Slack />` was dropped from lucide-react." },
          { highlight: "Resolution", description: "Swap it out for an available icon or create a local SVG." }
        ]}
      />

      <div className="flex gap-2">
        <ActionButton href="#" primary>Rollback Deployment</ActionButton>
        <ActionButton href="#">View Vercel Logs</ActionButton>
      </div>
    </div>
  )
}

export function GenerativeCalendarCard() {
  return (
    <div className="mt-6 mb-2 border-t border-[#262626] pt-6 flex flex-col">
      <CardTitle icon={<SiGooglecalendar color="#4285F4" size={18} />} color="text-white">Schedule Conflict Resolved</CardTitle>

      <p className="text-[13px] text-neutral-300 mb-4">
        You had overlapping blocks at 2:00 PM. I drafted an email to push your sync back.
      </p>

      <MetaDataGrid
        data={{
          "Original Block": "Deep Work Segment (2:00 PM - 4:00 PM)",
          "Conflict": "Y-Combinator Batch Interview Prep (2:30 PM)",
          "Action Taken": <span className="text-[#10b981]">Meeting shifted to 4:00 PM</span>
        }}
      />

      <ContentBlock title="Drafted Outreach (Pending your approval):">
        Hey team, <br /><br />
        I have a hard deep work block running through 4 PM today to wrap up the generative architecture. Can we automatically push our YC prep sync to 4:00 PM? <br /><br />
        Let me know if that works!
      </ContentBlock>

      <div className="flex gap-2 mt-2">
        <ActionButton href="#" primary>Send Email & Update Invites</ActionButton>
      </div>
    </div>
  )
}

export function GenerativeNotionCard() {
  return (
    <div className="mt-6 mb-2 border-t border-[#262626] pt-6 flex flex-col">
      <CardTitle icon={<SiNotion color="#ffffff" size={18} />} color="text-white">Brief Drafted Successfully</CardTitle>

      <p className="text-[13px] text-neutral-300 mb-4">
        I&rsquo;ve analyzed the Slack thread, your recorded meeting transcripts, and compiled the Notion spec.
      </p>

      <MetaDataGrid
        data={{
          "Workspace": "IdeaSaas Team",
          "Page Title": "Agentic Feed Architecture PRD",
          "Status": <span className="text-[#10b981]">Published to Drafts</span>
        }}
      />

      <SimpleList
        items={[
          "Included component mapping (Phase 1, 2, 3)",
          "Attached Vercel AI SDK framework requirements",
          "Linked original Co-Founder reference screenshots"
        ]}
      />

      <div className="flex gap-2 mt-2">
        <ActionButton href="#" primary icon={<SiNotion size={14} color="#000000" />}>Open in Notion</ActionButton>
      </div>
    </div>
  )
}

// -------------------------------------------------------------
// MASSIVE SCALABILITY UPDATE: Tier 1 & 2 Platform Native Components
// -------------------------------------------------------------

export function GenerativeStripeCard() {
  return (
    <div className="mt-6 mb-2 border-t border-[#262626] pt-6 flex flex-col">
      <CardTitle icon={<SiStripe color="#635BFF" size={18} />} color="text-white">Stripe Billing Anomaly</CardTitle>
      <p className="text-[13px] text-neutral-300 mb-4">
        Detected a recurring invoice failure for a high-value account.
      </p>
      <div className="bg-[#111111] border border-[#262626] p-4 rounded-sm text-[13px] text-neutral-300">
        <div className="flex justify-between items-start mb-3 pb-3 border-b border-[#262626]/50">
          <div className="font-medium text-white">Acme Corp</div>
          <div className="font-mono text-[#0055FF]">$499/mo</div>
        </div>
        <div className="flex items-center gap-2 mt-2 text-neutral-400">
          <AlertTriangle className="w-3.5 h-3.5 text-neutral-500" />
          <span>Payment failed (Insufficient Funds)</span>
        </div>
        <div className="flex items-center gap-2 mt-2 text-neutral-400">
          <Check className="w-3.5 h-3.5 text-[#0055FF]" />
          <span>Prepared rescue discount coupon <strong>SAVE20</strong></span>
        </div>
      </div>
    </div>
  )
}

export function GenerativePostHogCard() {
  return (
    <div className="mt-6 mb-2 border-t border-[#262626] pt-6 flex flex-col">
      <CardTitle icon={<GenuinePostHogIcon size={18} />} color="text-white">PostHog Usage Drop-off</CardTitle>
      <p className="text-[13px] text-neutral-300 mb-4">
        Acme Corp cohort activation breakdown for current billing period.
      </p>
      <div className="bg-[#111111] border border-[#262626] p-4 text-[13px] rounded-sm">
        <div className="flex items-center justify-between font-mono text-neutral-400 border-b border-[#262626]/50 pb-3 mb-3">
          <span>METRIC:</span>
          <span>ACTIVATIONS</span>
        </div>
        <div className="flex items-center justify-between text-neutral-400 mt-2">
          <span>Last 7 Days</span>
          <span className="text-white font-medium">1,240</span>
        </div>
        <div className="flex items-center justify-between text-neutral-400 mt-2">
          <span>This 7 Days</span>
          <span className="text-[#0055FF] font-medium">-41% (729)</span>
        </div>
      </div>
    </div>
  )
}

export function GenerativeLinearCard() {
  return (
    <div className="mt-6 mb-2 border-t border-[#262626] pt-6 flex flex-col">
      <CardTitle icon={<SiLinear color="#5E6AD2" size={18} />} color="text-white">Linear Issue Created</CardTitle>
      <div className="bg-[#111111] border border-[#262626] p-4 rounded-sm text-[13px] text-neutral-300 mt-2">
        <div className="font-medium text-white mb-2">ENG-419: Stripe Webhook Latency</div>
        <div className="text-neutral-500 mb-3">Priority: High • Assignee: @kushagra</div>
        <div className="flex items-center gap-2 text-neutral-400">
          <Check className="w-3.5 h-3.5 text-[#0055FF]" />
          <span>Attached error logs and user context</span>
        </div>
      </div>
    </div>
  )
}

export function GenerativeIntercomCard() {
  return (
    <div className="mt-6 mb-2 border-t border-[#262626] pt-6 flex flex-col">
      <CardTitle icon={<SiIntercom color="#286EFA" size={18} />} color="text-white">Intercom Draft Prepared</CardTitle>
      <div className="bg-[#111111] border border-[#262626] p-4 rounded-sm flex flex-col mt-2">
        <div className="flex items-center gap-2 mb-3 border-b border-[#262626]/50 pb-3">
          <div className="w-6 h-6 rounded-sm bg-[#262626] flex items-center justify-center text-[10px] text-[neutral-300] font-medium">SA</div>
          <span className="text-[13px] font-medium text-white">To: Sam Alt</span>
        </div>
        <div className="text-[13px] text-neutral-300 leading-relaxed pl-1">
          Hey Sam, I noticed you hit a snag with the Vercel integration. I&rsquo;ve successfully identified the root cause and assigned an urgent ticket straight to our systems engineer, who is working on a hotfix. We&rsquo;ll ping you as soon as the fix PR is merged!
        </div>
      </div>
    </div>
  )
}

export function GenerativeGitHubCard() {
  return (
    <div className="mt-6 mb-2 border-t border-[#262626] pt-6 flex flex-col">
      <CardTitle icon={<SiGithub color="#ffffff" size={18} />} color="text-white">GitHub Action Triggered</CardTitle>
      <p className="text-[13px] text-neutral-300 mb-4">
        I&rsquo;ve verified the fix and pushed a direct commit.
      </p>
      <div className="bg-[#111111] border border-[#262626] p-4 rounded-sm text-[13px] font-mono">
        <div className="text-neutral-300 mb-2">➔ Branch: fix/lucide-exports</div>
        <div className="text-[#0055FF] mb-2">+ 1 changed file, 4 insertions</div>
        <div className="text-neutral-500">Status: Running Checks (1/4)...</div>
      </div>
    </div>
  )
}

export function GenerativeGoogleSheetsCard() {
  return (
    <div className="mt-6 mb-2 border-t border-[#262626] pt-6 flex flex-col">
      <CardTitle icon={<SiGooglesheets color="#34A853" size={18} />} color="text-white">Data Exported to Sheets</CardTitle>
      <p className="text-[13px] text-neutral-300 mb-4">
        I compiled the churn list and synced it to your tracking sheet.
      </p>
      <div className="bg-[#111111] border border-[#262626] p-4 rounded-sm text-[13px]">
        <div className="flex items-center gap-2 text-neutral-300 mb-3 pb-3 border-b border-[#262626]/50">
          <FileText className="w-4 h-4 text-[#34A853]" />
          <span className="font-medium text-white">Q3 At-Risk Accounts.xlsx</span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-neutral-400">
          <Check className="w-3.5 h-3.5 text-[#0055FF]" />
          <span>42 rows securely synced</span>
        </div>
      </div>
    </div>
  )
}
