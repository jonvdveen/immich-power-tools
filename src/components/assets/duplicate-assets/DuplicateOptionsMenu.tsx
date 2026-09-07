import { Info, Loader2, Settings2, Sparkles, Users } from 'lucide-react'
import React from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'

export interface IAutoPickSummary {
  picked: number
  undecided: number
  skipped: number
}

interface DuplicateOptionsMenuProps {
  includePartners: boolean
  onIncludePartnersChange: (value: boolean) => void
  partnerScanning: boolean
  partnerProgress: { done: number; total: number } | null
  onAutoPick: () => void
  autoPicking: boolean
  autoPickSummary: IAutoPickSummary | null
  disabled?: boolean
}

/** Options pop-out for the duplicate finder — the settings that change what the
 *  tool compares or how it pre-fills a decision, kept out of the main toolbar
 *  so the destructive controls stay uncluttered. */
export default function DuplicateOptionsMenu({
  includePartners,
  onIncludePartnersChange,
  partnerScanning,
  partnerProgress,
  onAutoPick,
  autoPicking,
  autoPickSummary,
  disabled,
}: DuplicateOptionsMenuProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2" disabled={disabled}>
          <Settings2 size={16} />
          Options
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 z-[10000]" align="end">
        <div className="space-y-5">

          {/* --- Partner-shared photos --- */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Users size={14} />
                  Compare against partner photos
                </Label>
                <p className="text-xs text-muted-foreground">
                  Also show copies that exist in a partner&apos;s library, so you can see
                  when a photo is already held elsewhere.
                </p>
              </div>
              <Switch
                checked={includePartners}
                onCheckedChange={onIncludePartnersChange}
                disabled={partnerScanning}
              />
            </div>
            {/* Stated up front rather than discovered on a disabled button. */}
            <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
              <Info size={14} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-500" />
              <p className="text-xs text-muted-foreground">
                Partner photos belong to someone else&apos;s library, so this tool
                <strong> can never delete them</strong> — they are never the copy that gets
                discarded. You <em>can</em> choose a partner&apos;s copy as the keeper, which
                discards your own copies and leaves you relying on their library for that
                photo. Auto-pick never does this on your behalf.
              </p>
            </div>
            {partnerScanning && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 size={12} className="animate-spin" />
                Scanning partner libraries{partnerProgress ? ` — ${partnerProgress.done.toLocaleString()} of ${partnerProgress.total.toLocaleString()} groups` : ''}…
              </p>
            )}
          </div>

          <div className="border-t" />

          {/* --- Auto-pick --- */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Sparkles size={14} />
              Auto-pick which copy to keep
            </Label>
            <p className="text-xs text-muted-foreground">
              Picks a keeper per group: highest resolution, then largest file, then
              richest metadata (GPS, faces, rating, tags), then favourited. Groups whose
              copies match on all of those are left for you to decide.
            </p>
            <p className="text-xs text-muted-foreground">
              This only fills in the selection — <strong>nothing is deleted</strong>, and
              groups you have already decided are left alone.
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={onAutoPick}
              disabled={autoPicking || disabled}
            >
              {autoPicking
                ? <><Loader2 size={14} className="mr-2 animate-spin" /> Picking…</>
                : <><Sparkles size={14} className="mr-2" /> Auto-pick keepers</>}
            </Button>
            {autoPickSummary && (
              <p className="text-xs text-muted-foreground">
                Picked <strong>{autoPickSummary.picked.toLocaleString()}</strong> keeper
                {autoPickSummary.picked === 1 ? '' : 's'}
                {autoPickSummary.undecided > 0 && (
                  <> · <strong>{autoPickSummary.undecided.toLocaleString()}</strong> too
                  alike to call</>
                )}
                {autoPickSummary.skipped > 0 && (
                  <> · <strong>{autoPickSummary.skipped.toLocaleString()}</strong> already
                  decided, left alone</>
                )}
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
