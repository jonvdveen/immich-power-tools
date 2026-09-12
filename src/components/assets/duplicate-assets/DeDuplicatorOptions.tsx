import {
  Archive, Info, Layers, Loader2, Settings2, Sparkles, Tag, Trash2, TriangleAlert, Users,
} from 'lucide-react'
import React from 'react'

import CrossLibraryScanPanel, { IScanProgress } from '@/components/assets/duplicate-assets/CrossLibraryScanPanel'
import RankingEditor from '@/components/assets/duplicate-assets/RankingEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { IScanStatus } from '@/handlers/api/dedupe.handler'
import { DISPOSITIONS, Disposition } from '@/lib/duplicates/disposition'
import { IRankingRow, ownerOutranksQuality } from '@/lib/duplicates/ranking'
import { cn } from '@/lib/utils'

export type AlbumTransferMode = 'always' | 'never' | 'ask'

export interface IAutoPickSummary {
  picked: number
  weakTiebreak: number
  undecided: number
  skipped: number
  partnerWins: number
  guarded: number
}

interface DeDuplicatorOptionsProps {
  /** Controlled so the disposition button in the toolbar can open it too. */
  open: boolean
  onOpenChange: (open: boolean) => void
  disposition: Disposition
  onDispositionChange: (value: Disposition) => void
  tagName: string
  onTagNameChange: (value: string) => void
  albumTransferMode: AlbumTransferMode
  onAlbumTransferModeChange: (value: AlbumTransferMode) => void

  ranking: IRankingRow[]
  onRankingChange: (ranking: IRankingRow[]) => void
  onRankingReset: () => void
  rankingSaving: boolean

  includePartners: boolean
  onIncludePartnersChange: (value: boolean) => void
  partnersCanWin: boolean
  onPartnersCanWinChange: (value: boolean) => void
  partnerScanning: boolean
  partnerProgress: { done: number; total: number } | null

  scanStatus: IScanStatus | null
  scanStatusLoading: boolean
  scanning: boolean
  scanProgress: IScanProgress | null
  onScan: () => void
  onStopScan: () => void
  onClearIndex: () => void
  clearingIndex: boolean

  onAutoPick: () => void
  autoPicking: boolean
  autoPickSummary: IAutoPickSummary | null

  dismissedCount: number
  onClearDismissals: () => void
  /** Cross-library pairs marked "not the same photo". A different kind of
   *  decision from a skip, so it gets its own count and its own reset. */
  pairVerdictCount: number
  onClearPairVerdicts: () => void

  disabled?: boolean
}

const DISPOSITION_ICONS: Record<Disposition, React.ReactNode> = {
  trash: <Trash2 size={14} />,
  tag: <Tag size={14} />,
  stack: <Layers size={14} />,
}

/**
 * Everything that changes what the De-Duplicator compares, how it decides, and
 * what it does with the copies you didn't keep.
 *
 * A side sheet rather than a popover: the ranking editor is ten reorderable
 * rows and does not fit a dropdown without becoming unusable.
 */
export default function DeDuplicatorOptions({
  open, onOpenChange,
  disposition, onDispositionChange, tagName, onTagNameChange,
  albumTransferMode, onAlbumTransferModeChange,
  ranking, onRankingChange, onRankingReset, rankingSaving,
  includePartners, onIncludePartnersChange,
  partnersCanWin, onPartnersCanWinChange,
  partnerScanning, partnerProgress,
  scanStatus, scanStatusLoading, scanning, scanProgress,
  onScan, onStopScan, onClearIndex, clearingIndex,
  onAutoPick, autoPicking, autoPickSummary,
  dismissedCount, onClearDismissals,
  pairVerdictCount, onClearPairVerdicts,
  disabled,
}: DeDuplicatorOptionsProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          <Settings2 size={16} />
          Options
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>De-Duplicator options</SheetTitle>
          <SheetDescription>
            Settings are saved to your account, so they follow you between browsers.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">

          {/* --- What happens to the discards --- */}
          <section className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Archive size={14} />
              What to do with the copies you don&apos;t keep
            </Label>
            <div className="grid grid-cols-3 gap-1 rounded-lg border p-1">
              {(Object.keys(DISPOSITIONS) as Disposition[]).map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={disposition === value ? 'default' : 'ghost'}
                  className="h-8 justify-center gap-1.5 text-xs"
                  onClick={() => onDispositionChange(value)}
                >
                  {DISPOSITION_ICONS[value]}
                  {DISPOSITIONS[value].label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{DISPOSITIONS[disposition].summary}</p>

            {disposition === 'tag' && (
              <div className="space-y-1 pt-1">
                <Label className="text-xs">Tag to apply</Label>
                <Input
                  value={tagName}
                  onChange={(e) => onTagNameChange(e.target.value)}
                  placeholder="Duplicate"
                  className="h-8 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Created if it doesn&apos;t exist. Applied through Immich&apos;s tag API, so
                  the sidecar stays in step.
                </p>
              </div>
            )}

            {/* Only trash removes the discarded copy, so only trash can leave a
                hole in an album. Shown here rather than in the toolbar because
                it is a rule about what happens when you apply, not a filter. */}
            {disposition === 'trash' && (
              <div className="space-y-1 pt-1">
                <Label className="text-xs">
                  If a discarded copy is in an album the keeper isn&apos;t
                </Label>
                <div className="flex overflow-hidden rounded-md border">
                  {(['always', 'ask', 'never'] as AlbumTransferMode[]).map((mode) => (
                    <Button
                      key={mode}
                      variant={albumTransferMode === mode ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-8 flex-1 rounded-none border-0 text-xs"
                      onClick={() => onAlbumTransferModeChange(mode)}
                    >
                      {mode === 'always' ? 'Add keeper' : mode === 'ask' ? 'Ask each time' : 'Leave it'}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Trashing a duplicate that was in an album removes it from that album.
                  &ldquo;Add keeper&rdquo; puts the copy you kept in first, so the album
                  keeps the photo. On a cross-library match that means adding your
                  partner&apos;s copy to your album — the photo stays, but you no longer own
                  the file behind it.
                </p>
              </div>
            )}

            {disposition === 'stack' && (
              <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
                <Info size={14} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-500" />
                <p className="text-xs text-muted-foreground">
                  Immich can only stack assets you own, so any group involving a
                  partner&apos;s copy is <strong>skipped</strong> rather than half-applied.
                </p>
              </div>
            )}
          </section>

          <div className="border-t" />

          {/* --- Ranking --- */}
          <section className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Sparkles size={14} />
              How auto-pick chooses a keeper
            </Label>
            <RankingEditor
              ranking={ranking}
              onChange={onRankingChange}
              onReset={onRankingReset}
              saving={rankingSaving}
            />
            <div className="flex gap-2 rounded-md border border-blue-500/40 bg-blue-500/10 p-2">
              <Info size={14} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
              <p className="text-xs text-muted-foreground">
                Wherever you put <strong>Owner</strong>, a partner&apos;s copy is never
                auto-picked as the keeper when your copy carries GPS, a description, tags
                or a favourite that theirs lacks — that metadata cannot be written to an
                asset you don&apos;t own, so it would be lost for good.
              </p>
            </div>
            {ownerOutranksQuality(ranking) && (
              <div className="flex gap-2 rounded-md border border-red-500/50 bg-red-500/10 p-2">
                <TriangleAlert size={14} className="mt-0.5 shrink-0 text-red-600 dark:text-red-500" />
                <p className="text-xs text-muted-foreground">
                  <strong className="text-red-700 dark:text-red-400">
                    Owner is set to &ldquo;prefer partner&apos;s copy&rdquo; above your quality
                    criteria.
                  </strong>{' '}
                  In a cross-library match your copy is the only one you own, so auto-pick will
                  mark <em>every</em> one of them for {DISPOSITIONS[disposition].label.toLowerCase()}
                  {' '}— even where yours is the sharper or larger file. That is a reasonable
                  choice if you want one library to hold everything; move Owner below Resolution
                  and File size if it isn&apos;t what you meant. Nothing happens until you apply.
                </p>
              </div>
            )}
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
            <p className="text-xs text-muted-foreground">
              Fills in the selection only — <strong>nothing is removed</strong>, and groups
              you have already decided are left alone.
            </p>
            {autoPickSummary && (
              <p className="text-xs text-muted-foreground">
                Picked <strong>{autoPickSummary.picked.toLocaleString()}</strong> keeper
                {autoPickSummary.picked === 1 ? '' : 's'}
                {autoPickSummary.weakTiebreak > 0 && (
                  <> · <strong>{autoPickSummary.weakTiebreak.toLocaleString()}</strong> settled
                    on a tiebreak — worth a glance</>
                )}
                {autoPickSummary.partnerWins > 0 && (
                  <> · <strong>{autoPickSummary.partnerWins.toLocaleString()}</strong> keeping
                    a partner&apos;s copy</>
                )}
                {autoPickSummary.guarded > 0 && (
                  <> · <strong>{autoPickSummary.guarded.toLocaleString()}</strong> kept yours
                    to protect metadata</>
                )}
                {autoPickSummary.skipped > 0 && (
                  <> · <strong>{autoPickSummary.skipped.toLocaleString()}</strong> already
                    decided, left alone</>
                )}
              </p>
            )}
          </section>

          <div className="border-t" />

          {/* --- Partner-shared photos --- */}
          <section className="space-y-2">
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
              {/* Not disabled while scanning: the scan takes minutes on a large
                  library, and switching off is how you cancel it. */}
              <Switch
                checked={includePartners}
                onCheckedChange={onIncludePartnersChange}
                className="data-[state=unchecked]:bg-gray-300 dark:data-[state=unchecked]:bg-gray-600 data-[state=checked]:bg-blue-600 dark:data-[state=checked]:bg-blue-500"
              />
            </div>
            <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
              <Info size={14} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-500" />
              <p className="text-xs text-muted-foreground">
                Partner photos belong to someone else&apos;s library, so this tool
                <strong> can never remove them</strong>. You <em>can</em> choose a
                partner&apos;s copy as the keeper, which discards your own copies and leaves
                you relying on their library for that photo.
              </p>
            </div>
            <div className={cn(
              'ml-3 space-y-2 border-l pl-3',
              !includePartners && 'pointer-events-none opacity-50'
            )}>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">
                    Let a partner&apos;s copy win auto-pick
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Include partner copies as keep candidates. Subject to the metadata
                    guard above.
                  </p>
                </div>
                <Switch
                  checked={includePartners && partnersCanWin}
                  onCheckedChange={onPartnersCanWinChange}
                  disabled={!includePartners}
                  className="data-[state=unchecked]:bg-gray-300 dark:data-[state=unchecked]:bg-gray-600 data-[state=checked]:bg-blue-600 dark:data-[state=checked]:bg-blue-500"
                />
              </div>
            </div>
            {partnerScanning && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 size={12} className="animate-spin" />
                Looking for partner copies of the groups on screen
                {partnerProgress
                  ? ` — ${partnerProgress.done.toLocaleString()} of ${partnerProgress.total.toLocaleString()} groups`
                  : ''}…
              </p>
            )}
          </section>

          <div className="border-t" />

          {/* --- Cross-library index --- */}
          <section className={cn('space-y-2', !includePartners && 'pointer-events-none opacity-50')}>
            <CrossLibraryScanPanel
              status={scanStatus}
              loadingStatus={scanStatusLoading}
              scanning={scanning}
              progress={scanProgress}
              onScan={onScan}
              onStop={onStopScan}
              onClear={onClearIndex}
              clearing={clearingIndex}
              enabled={includePartners}
            />
            {!includePartners && (
              <p className="text-xs text-muted-foreground">
                Turn on <strong>Compare against partner photos</strong> above to use this.
              </p>
            )}
          </section>

          <div className="border-t" />

          {/* --- Things you have set aside --- */}
          <section className="space-y-2">
            <Label className="text-sm font-medium">Skipped groups</Label>
            <p className="text-xs text-muted-foreground">
              Skipping hides a group from this view and nothing else — it writes nothing to
              Immich and follows you between browsers. Use it for the ones you are not ready
              to decide; use <strong>Not duplicates</strong> when you want Immich to stop
              grouping them for good. {dismissedCount > 0
                ? `${dismissedCount.toLocaleString()} currently hidden.`
                : 'None hidden yet.'}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={onClearDismissals}
              disabled={dismissedCount === 0}
            >
              Restore all skipped groups
            </Button>

            <Label className="block pt-2 text-sm font-medium">Cross-library verdicts</Label>
            <p className="text-xs text-muted-foreground">
              Marking a cross-library match <strong>Not the same photo</strong> is remembered
              here rather than in Immich, which never made the match in the first place. It
              survives a rescan. {pairVerdictCount > 0
                ? `${pairVerdictCount.toLocaleString()} recorded.`
                : 'None recorded yet.'}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={onClearPairVerdicts}
              disabled={pairVerdictCount === 0}
            >
              Forget those verdicts
            </Button>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
