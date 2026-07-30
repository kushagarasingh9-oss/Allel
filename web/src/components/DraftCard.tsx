'use client'

import { useState, useTransition } from 'react'
import { type DraftItem } from '@/lib/dashboard/mock-data'
import StatusBadge from './StatusBadge'
import { approveDraft, rejectDraft, editDraft, markDraftSent } from '@/app/dashboard/drafts/actions'

export default function DraftCard({ draft }: { draft: DraftItem & { id: string } }) {
  const [isEditing, setIsEditing] = useState(false)
  const [subject, setSubject] = useState(draft.subject)
  const [preview, setPreview] = useState(draft.preview)
  const [isPending, startTransition] = useTransition()

  const handleApprove = () => startTransition(() => approveDraft(draft.id))
  const handleReject = () => {
    if (confirm('Are you sure you want to reject this draft?')) {
      startTransition(() => rejectDraft(draft.id))
    }
  }
  const handleSend = () =>
    startTransition(async () => {
      const result = await markDraftSent(draft.id)
      if (!result.ok) {
        alert(result.error)
      }
    })
  
  const handleSaveEdit = () => {
    startTransition(async () => {
      await editDraft(draft.id, { subject, body: preview })
      setIsEditing(false)
    })
  }

  return (
    <div className="liquid-glass mb-4 flex flex-col gap-4 rounded-[18px] border border-[#ffffff12] bg-[#0f0f10]/50 p-6 shadow-xl transition-all duration-300">
      <div className="flex items-center justify-between border-b border-[#ffffff0a] pb-4">
        <div className="flex items-center gap-3">
          <span className="text-[15px] font-semibold text-white">{draft.account}</span>
          <span className="rounded bg-[#ffffff0a] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#9a9aa4]">
            {draft.type}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-medium text-[#6d6d76]">{draft.due}</span>
          <StatusBadge variant="draft" status={draft.status} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {isEditing ? (
          <input
            className="w-full rounded bg-[#111113] p-2 text-[15px] font-medium text-white outline-none ring-1 ring-[#ffffff12] focus:ring-[#8b5cf6]"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        ) : (
          <h3 className="text-[16px] font-medium text-white">{draft.subject}</h3>
        )}

        {isEditing ? (
          <textarea
            className="h-24 w-full resize-none rounded bg-[#111113] p-2 text-[14px] leading-relaxed text-[#9a9aa4] outline-none ring-1 ring-[#ffffff12] focus:ring-[#8b5cf6]"
            value={preview}
            onChange={(e) => setPreview(e.target.value)}
          />
        ) : (
          <p className="line-clamp-3 text-[14px] leading-relaxed text-[#9a9aa4]">
            {draft.preview}
          </p>
        )}
      </div>

      <div className="mt-2 flex items-center justify-end gap-3 pt-4 border-t border-[#ffffff0a]">
        {isEditing ? (
          <>
            <button
              onClick={() => setIsEditing(false)}
              disabled={isPending}
              className="text-[13px] font-medium text-[#9a9aa4] hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={isPending}
              className="rounded-lg bg-[#ffffff12] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#ffffff20] min-w-[70px]"
            >
              Save
            </button>
          </>
        ) : (
          <>
            {draft.status === 'Needs review' && (
              <>
                <button onClick={() => setIsEditing(true)} disabled={isPending} className="text-[13px] font-medium text-[#9a9aa4] hover:text-white mr-auto">
                  Edit
                </button>
                <button onClick={handleReject} disabled={isPending} className="text-[13px] font-medium text-[#ffb0b9] hover:text-[#ff6b7a]">
                  Reject
                </button>
                <button onClick={handleApprove} disabled={isPending} className="rounded-lg bg-[#ffffff12] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#ffffff20]">
                  Approve
                </button>
              </>
            )}
            {draft.status === 'Ready to send' && (
              <>
                <button onClick={() => setIsEditing(true)} disabled={isPending} className="text-[13px] font-medium text-[#9a9aa4] hover:text-white mr-auto">
                  Edit
                </button>
                <button onClick={handleReject} disabled={isPending} className="text-[13px] font-medium text-[#ffb0b9] hover:text-[#ff6b7a]">
                  Reject
                </button>
                <button onClick={handleSend} disabled={isPending} className="rounded-lg bg-[#1f4633] px-4 py-2 text-[13px] font-medium text-[#8dd6a7] hover:bg-[#285c43]">
                  Send
                </button>
              </>
            )}
            {draft.status === 'Waiting on founder' && (
              <>
                <button onClick={handleReject} disabled={isPending} className="text-[13px] font-medium text-[#ffb0b9] hover:text-[#ff6b7a]">
                  Reject
                </button>
                <button onClick={handleApprove} disabled={isPending} className="rounded-lg bg-[#ffffff12] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#ffffff20]">
                  Approve
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
