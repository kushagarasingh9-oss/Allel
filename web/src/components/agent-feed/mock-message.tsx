import * as React from "react"
import { TimelineNode, MonologueBlock, InlineQueryBlock, MiniResultCard, AgentSpeechBlock, AgentApprovalBlock, ExecutionPlanList, AgentReasoningBatch } from "./timeline-nodes"
import {
   GenerativeEmailCard,
   GenerativeSlackCard,
   GenerativeCalendarCard,
   GenerativeNotionCard,
   GenerativeStripeCard,
   GenerativePostHogCard,
   GenerativeLinearCard,
   GenerativeIntercomCard,
   GenerativeGitHubCard,
   GenerativeGoogleSheetsCard,
   GenuineGmailIcon,
   GenuinePostHogIcon
} from "./generative-cards"
import { Search, Mail, Calendar, ListTodo, MessageSquare, AlertTriangle, FileText, CheckCircle2, ListChecks, PlayCircle, ShieldAlert } from "lucide-react"

import { SiStripe, SiPosthog, SiLinear, SiIntercom, SiGithub, SiGooglesheets } from '@icons-pack/react-simple-icons'

// Precise Platform Logos
const GmailIcon = () => <GenuineGmailIcon size={16} />
const PostHogIcon = () => <GenuinePostHogIcon size={16} />
const StripeIcon = () => <SiStripe color="#635BFF" size={16} className="opacity-90" />
const LinearIcon = () => <SiLinear color="#5E6AD2" size={16} className="opacity-90" />
const IntercomIcon = () => <SiIntercom color="#286EFA" size={16} className="opacity-90" />
const GitHubIcon = () => <SiGithub color="#ffffff" size={16} className="opacity-90" />
const SheetsIcon = () => <SiGooglesheets color="#34A853" size={16} className="opacity-90" />
const SlackIcon = () => (
   <svg viewBox="0 0 127 127" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-90">
     <path d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z" fill="#E01E5A"/>
     <path d="M47 27c-7.3 0-13.2-5.9-13.2-13.2C33.8 6.5 39.7.6 47 .6c7.3 0 13.2 5.9 13.2 13.2V27H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H13.9C6.6 60.1.7 54.2.7 46.9c0-7.3 5.9-13.2 13.2-13.2H47z" fill="#36C5F0"/>
     <path d="M99.9 46.9c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.9V46.9zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.8C66.9 6.5 72.8.6 80.1.6c7.3 0 13.2 5.9 13.2 13.2v33.1z" fill="#2EB67D"/>
     <path d="M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80.1z" fill="#ECB22E"/>
   </svg>
)


function AgentMessageWrapper({ prompt, children }: { prompt: string, children: React.ReactNode }) {
   return (
      <div className="w-full max-w-[900px] mx-auto flex flex-col gap-6 py-10 relative">
         <div className="w-full flex justify-end relative z-10">
            <div className="bg-[#151515] border border-[#262626] rounded-2xl rounded-tr-sm px-4 py-3 text-[13.5px] text-neutral-200 shadow-sm max-w-[85%] leading-relaxed">
               {prompt}
            </div>
         </div>
         <div className="w-full relative z-10 pt-2">
            <div className="w-full flex flex-col gap-4">
               {children}
            </div>
         </div>
      </div>
   )
}

export function MockAgentMessage() {
   return (
      <div className="flex flex-col gap-2 pb-20 mt-4">

         {/* ------------------------------------------------------------- */}
         {/* SCENARIO 1: Churn Defense Platform (PostHog + Stripe)         */}
         {/* ------------------------------------------------------------- */}
         <AgentMessageWrapper prompt="Check if any of our high-value accounts are showing churn signals today.">
            
            <AgentSpeechBlock text="Absolutely. I'll execute the churn analysis pipeline by combining PostHog product analytics with Stripe billing data immediately to see if any MRR is at risk. 🛡️" />

            <AgentReasoningBatch stepsCount={3}>
               <TimelineNode title="Creating execution plan" icon={<ListTodo className="w-3.5 h-3.5" />} isCollapsible isCompleted>
                  <ExecutionPlanList tasks={[
                     { id: '1', text: 'Query PostHog for negative anomalies in DAU cohorts.', status: 'completed' },
                     { id: '2', text: 'Cross-reference anomalous accounts with Stripe MRR.', status: 'completed' },
                     { id: '3', text: 'Draft rescue campaign and issue coupons.', status: 'pending' },
                  ]} />
               </TimelineNode>

               <TimelineNode title="Executing PostHog metrics query" icon={<Search className="w-3.5 h-3.5 text-neutral-500" />} isCollapsible isCompleted>
                  <MonologueBlock text="Fetching the retention matrix for accounts over $100/mo." />
                  <InlineQueryBlock query="posthog: cohorts(DAU_drop > 30%)" />
                  <MiniResultCard icon={<PostHogIcon />} title={<span className="text-white">Acme Corp</span>} subtitle="41% drop in user activation this week" />
               </TimelineNode>

               <TimelineNode title="Validating Stripe status" icon={<ShieldAlert className="w-3.5 h-3.5 text-neutral-500" />} isCollapsible isCompleted>
                  <MonologueBlock text="Checking Acme Corp's billing health and recent invoices." />
                  <InlineQueryBlock query="stripe: accounts(Acme Corp) --include-invoices" />
                  <MiniResultCard icon={<StripeIcon />} title={<span className="text-white">$499/mo Plan</span>} subtitle="Payment failed (Insufficient Funds) 2 hours ago" />
               </TimelineNode>
            </AgentReasoningBatch>

            <GenerativePostHogCard />
            <GenerativeStripeCard />

            <AgentApprovalBlock title="Action Required: Rescue Operation" />
            
            <AgentSpeechBlock text="I identified an urgent billing and usage drop for Acme Corp ($499/mo). If you approve, I will instantly release a SAVE20 Stripe coupon and send the mapped follow-up email. Let's save this account! 💸" />
         </AgentMessageWrapper>


         {/* ------------------------------------------------------------- */}
         {/* SCENARIO 2: Support Escalation (Intercom + Linear)            */}
         {/* ------------------------------------------------------------- */}
         <AgentMessageWrapper prompt="Are there any angry customers complaining about the webhook bug in support?">
            
            <AgentSpeechBlock text="Let me scan Intercom for negative sentiment spikes related to webhooks, and then route the issues to engineering if necessary. 🔍" />

            <AgentReasoningBatch stepsCount={3}>
               <TimelineNode title="Creating execution plan" icon={<ListTodo className="w-3.5 h-3.5" />} isCollapsible isCompleted>
                  <ExecutionPlanList tasks={[
                     { id: '1', text: 'Read recent Intercom conversations for webhook keywords.', status: 'completed' },
                     { id: '2', text: 'Create a High-priority Linear ticket.', status: 'completed' },
                     { id: '3', text: 'Draft an empathetic response to the affected user.', status: 'pending' },
                  ]} />
               </TimelineNode>

               <TimelineNode title="Scanning customer feedback" icon={<Search className="w-3.5 h-3.5 text-neutral-500" />} isCollapsible isCompleted>
                  <MonologueBlock text="Filtering Intercom for inbound messages with high urgency." />
                  <InlineQueryBlock query='intercom: inbox --search "webhook" --sentiment "negative"' />
                  <MiniResultCard icon={<IntercomIcon />} title={<span className="text-white">Sam Alt</span>} subtitle='"Why are my webhooks failing consistently today?"' />
               </TimelineNode>

               <TimelineNode title="Dispatching engineering ticket" icon={<CheckCircle2 className="w-3.5 h-3.5 text-neutral-500" />} isCollapsible isCompleted>
                  <MonologueBlock text="Logging this as a verified incident in the backlog." />
                  <InlineQueryBlock query='linear: issue create --title "Stripe Webhook Latency" --priority "High"' />
                  <MiniResultCard icon={<LinearIcon />} title={<span className="text-white">ENG-419</span>} subtitle="Issue successfully assigned to @kushagra" />
               </TimelineNode>
            </AgentReasoningBatch>

            <GenerativeIntercomCard />
            <GenerativeLinearCard />

            <AgentApprovalBlock title="Approve Support Dispatch" />
            
            <AgentSpeechBlock text="I drafted the response to Sam and linked the Linear issue assigning @kushagra to hotfix it. Should I send the Intercom reply and notify the team? 🤝" />
         </AgentMessageWrapper>


         {/* ------------------------------------------------------------- */}
         {/* SCENARIO 3: Inbox & Calendar Triage (Gmail + Slack)           */}
         {/* ------------------------------------------------------------- */}
         <AgentMessageWrapper prompt="Find me the most important mail of me, and check my Slack for any urgent mentions.">

            <AgentSpeechBlock text="I've got you covered! Let me prioritize your inbox and synchronize your urgent Slack threads while managing your calendar conflicts. 🚀" />

            <AgentReasoningBatch stepsCount={3}>
               <TimelineNode title="Creating execution plan" icon={<ListTodo className="w-3.5 h-3.5" />} isCollapsible isCompleted>
                  <ExecutionPlanList tasks={[
                     { id: '1', text: 'Analyze Gmail for high-priority senders.', status: 'completed' },
                     { id: '2', text: 'Scan Slack API targeting your direct mentions.', status: 'completed' },
                     { id: '3', text: 'Resolve calendar conflicts based on urgency.', status: 'pending' },
                  ]} />
               </TimelineNode>

               <TimelineNode title="Searching emails" icon={<Search className="w-3.5 h-3.5 text-neutral-500" />} isCollapsible isCompleted>
                  <MonologueBlock text="Querying Google's algorithm for paramount messages." />
                  <InlineQueryBlock query="gmail: search is:important -is:read" />
                  <MiniResultCard icon={<GmailIcon />} title={<span className="text-white">Anthropic Education</span>} subtitle="Your registration for Building with the Claude API" />
               </TimelineNode>

               <TimelineNode title="Fetching workspace context" icon={<Search className="w-3.5 h-3.5 text-neutral-500" />} isCollapsible isCompleted>
                  <MonologueBlock text="Cross-referencing communications with Slack to catch rapid escalations." />
                  <InlineQueryBlock query="slack: search(mentions: @kushagra)" />
                  <MiniResultCard icon={<SlackIcon />} title={<span className="text-white">@sarah_dev</span>} subtitle="Hey, the Vercel deployment is failing compilation." />
               </TimelineNode>
            </AgentReasoningBatch>

            <GenerativeEmailCard />
            <GenerativeSlackCard />
            <GenerativeCalendarCard />
            <GenerativeGitHubCard />

            <AgentApprovalBlock title="Approve Calendar Reschedule" />
            
            <AgentSpeechBlock text="I found a critical email and an overlapping meeting due to a massive Slack escalation. Ready to auto-reschedule the YC Prep call to 4 PM so you can focus on the fix? 📅" />
         </AgentMessageWrapper>


         {/* ------------------------------------------------------------- */}
         {/* SCENARIO 4: The Daily Brief Sync (Sheets + Notion)            */}
         {/* ------------------------------------------------------------- */}
         <AgentMessageWrapper prompt="Export yesterday's metrics to my reporting sheet and prep the Notion knowledge base.">

            <AgentSpeechBlock text="Generating your Daily Brief payload now. I'll pull the entire system output and sync it flawlessly across your tracking apps. 📊" />

            <AgentReasoningBatch stepsCount={2}>
               <TimelineNode title="Creating execution plan" icon={<ListTodo className="w-3.5 h-3.5" />} isCollapsible isCompleted>
                  <ExecutionPlanList tasks={[
                     { id: '1', text: 'Aggregate 24h event timeline data.', status: 'completed' },
                     { id: '2', text: 'Export parsed CSV payload to Google Sheets.', status: 'completed' },
                     { id: '3', text: 'Publish detailed PRD document to Notion.', status: 'pending' },
                  ]} />
               </TimelineNode>

               <TimelineNode title="Compiling data schemas" icon={<ListChecks className="w-3.5 h-3.5 text-neutral-500" />} isCollapsible isCompleted>
                  <MonologueBlock text="Gathering data vectors over the last 24 elapsed hours." />
                  <InlineQueryBlock query="db: extract --range 24h --format csv" />
                  <MiniResultCard icon={<SheetsIcon />} title={<span className="text-white">Google Auth</span>} subtitle="Connected successfully to Google Sheets API" />
               </TimelineNode>
            </AgentReasoningBatch>

            <GenerativeGoogleSheetsCard />
            <GenerativeNotionCard />

            <AgentApprovalBlock title="Approve Data Sync" />
            
            <AgentSpeechBlock text="Data is packaged and ready for export! Your Notion PRD looks incredibly sharp today. Approve the sync and we're done here. ✅" />
         </AgentMessageWrapper>

      </div>
   )
}
