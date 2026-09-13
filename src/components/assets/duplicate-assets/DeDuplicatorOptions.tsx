import {
  ChevronRight, Layers, Loader2, RotateCcw, Tag, Trash2, TriangleAlert, Users,
} from 'lucide-react'
import React, { useState } from 'react'

import RankingEditor from '@/components/assets/duplicate-assets/RankingEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { formatDistanceToNow } from 'date-fns'
import { IScanStatus } from '@/handlers/api/dedupe.handler'
import { BANDS, BAND_ORDER } from '@/lib/duplicates/bands'
import { DISPOSITIONS, Disposition } from '@/lib/duplicates/disposition'
import { IRankingRow, RANKING_CRITERIA, ownerOutranksQuality } from '@/lib/duplicates/ranking'
import { cn } from '@/lib/utils'

export type AlbumTransferMode = 'always' | 'never' | 'ask'

interface DeDuplicatorOptionsProps {
  /** Controlled so the toolbar's Options button can open it too. */
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

  /** Null until the first status read lands. */
  scanStatus: IScanStatus | null
  onClearIndex: () => void
  clearingIndex: boolean
  scanning: boolean

  dismissedCount: number
  onClearDismissals: () => void
  pairVerdictCount: number
  onClearPairVerdicts: () => void
}

const DISPOSITION_ICONS: Record<Disposition, React.ReactNode> = {
  trash: <Trash2 size={14} />,
  tag: <Tag size={14} />,
  stack: <Layers size={14} />,
}

type SectionKey = 'discards' | 'rules' | 'partners' | 'aside'

/**
 * One collapsible row. The summary is the point of the whole redesign: most
 * visits to this panel are to CHECK a setting, not change it, and a summary
 * answers that with no clicks at all.
 */
function Section({
  id, open, onToggle, title, summary, flag, children,
}: {
  id: SectionKey
  open: boolean
  onToggle: (id: SectionKey) => void
  title: string
  summary: React.ReactNode
  flag?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="border-t first:border-t-0">
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 py-3 text-left"
      >
        <ChevronRight
          size={14}
          className={cn('shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{summary}</span>
        </span>
        {flag}
      </button>
      {open && <div className="space-y-3 pb-4 pl-[26px] pr-0.5">{children}</div>}
    </div>
  )
}

/**
 * Everything that changes what the De-Duplicator compares, how it decides, and
 * what it does with the copies you didn't keep.
 *
 * Deliberately holds no verbs. Auto-pick and Scan used to live in here, which
 * made a settings drawer the place you went to do the work; both now sit on the
 * toolbar beside the thing they act on. What is left is settings, one
 * collapsible row each.
 */
export default function DeDuplicatorOptions({
  open, onOpenChange,
  disposition, onDispositionChange, tagName, onTagNameChange,
  albumTransferMode, onAlbumTransferModeChange,
  ranking, onRankingChange, onRankingReset, rankingSaving,
  includePartners, onIncludePartnersChange,
  partnersCanWin, onPartnersCanWinChange,
  scanStatus, onClearIndex, clearingIndex, scanning,
  dismissedCount, onClearDismissals,
  pairVerdictCount, onClearPairVerdicts,
}: DeDuplicatorOptionsProps) {
  const [openSection, setOpenSection] = useState<SectionKey | null>(null)
  const toggle = (id: SectionKey) => setOpenSection((cur) => (cur === id ? null : id))

  const partners = scanStatus?.partners ?? []
  /** No incoming share means nothing here is actionable: you cannot start one
   *  from this app, the other person does it in Immich. So the whole section
   *  is absent rather than present-but-dead. */
  const hasPartner = partners.length > 0
  const partnerName = partners.length === 1 ? partners[0].name : 'a partner'
  const indexed = scanStatus?.counts?.total ?? 0
  const loaded = scanStatus !== null

  const armed = ownerOutranksQuality(ranking) && hasPartner

  // ---- collapsed summaries -------------------------------------------------

  const discardSummary = [
    DISPOSITIONS[disposition].label,
    disposition === 'tag' ? `as "${tagName.trim() || 'Duplicate'}"` : null,
    disposition === 'trash'
      ? albumTransferMode === 'always' ? 'keeper added to their albums'
        : albumTransferMode === 'ask' ? 'asks about albums'
          : 'albums left alone'
      : null,
  ].filter(Boolean).join(' · ')

  const enabledRules = ranking.filter((r) => r.enabled && !(r.key === 'owner' && !hasPartner))
  const rulesSummary = enabledRules.length === 0
    ? 'Nothing enabled — the choice will be arbitrary'
    : enabledRules.slice(0, 4).map((r) => RANKING_CRITERIA[r.key].label).join(' → ')
      + (enabledRules.length > 4 ? ` → +${enabledRules.length - 4} more` : '')

  const partnerSummary = !includePartners
    ? 'Off'
    : [
      'On',
      scanning ? 'scanning now'
        : scanStatus?.lastRunAt
          ? (scanStatus.remaining > 0 ? 'index part-way through' : 'index up to date')
          : 'not searched yet',
      indexed > 0 ? `${indexed.toLocaleString()} matches` : null,
    ].filter(Boolean).join(' · ')

  const asideSummary = dismissedCount === 0 && pairVerdictCount === 0
    ? 'Nothing set aside'
    : [
      dismissedCount > 0 ? `${dismissedCount.toLocaleString()} skipped group${dismissedCount === 1 ? '' : 's'}` : null,
      pairVerdictCount > 0 ? `${pairVerdictCount.toLocaleString()} marked not the same photo` : null,
    ].filter(Boolean).join(' · ')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>De-Duplicator options</SheetTitle>
          <SheetDescription>
            Saved to your account, so they follow you between browsers.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5">

          {/* ----------------------------------------------- partner shares */}
          {loaded && hasPartner && (
            <Section
              id="partners" open={openSection === 'partners'} onToggle={toggle}
              title="Partner Shares"
              summary={partnerSummary}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <Users size={14} />
                    Compare against partner photos
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Show copies that exist in a partner&apos;s library.
                  </p>
                </div>
                <Switch
                  checked={includePartners}
                  onCheckedChange={onIncludePartnersChange}
                  className="mt-0.5 data-[state=unchecked]:bg-gray-300 dark:data-[state=unchecked]:bg-gray-600 data-[state=checked]:bg-blue-600 dark:data-[state=checked]:bg-blue-500"
                />
              </div>

              <div className={cn(
                'space-y-3 border-l pl-3',
                !includePartners && 'pointer-events-none opacity-50'
              )}>
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">
                      Let a partner&apos;s copy win auto-pick
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Auto-select can choose their copy, which discards yours. This tool can
                      never remove theirs — they belong to someone else.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Yours is kept anyway if it has a location, tags, a description or a
                      favourite that theirs doesn&apos;t: those can&apos;t be moved onto a
                      photo you don&apos;t own, so they would be lost.
                    </p>
                  </div>
                  <Switch
                    checked={includePartners && partnersCanWin}
                    onCheckedChange={onPartnersCanWinChange}
                    disabled={!includePartners}
                    className="mt-0.5 data-[state=unchecked]:bg-gray-300 dark:data-[state=unchecked]:bg-gray-600 data-[state=checked]:bg-blue-600 dark:data-[state=checked]:bg-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Cross-library index</Label>
                  {indexed > 0 ? (
                    <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {BAND_ORDER.map((b) => (
                        <span key={b} title={BANDS[b].summary}>
                          {BANDS[b].label} <strong>{(scanStatus?.counts?.[b] ?? 0).toLocaleString()}</strong>
                        </span>
                      ))}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Nothing indexed yet — use <strong>Scan</strong> on the toolbar.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {scanStatus?.lastRunAt
                      ? `Last run ${formatDistanceToNow(new Date(scanStatus.lastRunAt), { addSuffix: true })}. `
                      : ''}
                    Topping up looks at <strong>your</strong> new photos, so a copy {partnerName} adds
                    to an old photo of yours needs a full re-scan. Photos Immich already groups as
                    duplicates stay in My library.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1 w-full"
                    onClick={onClearIndex}
                    disabled={scanning || clearingIndex || indexed === 0}
                    title="Throw the index away and search everything again from scratch"
                  >
                    {clearingIndex
                      ? <><Loader2 size={14} className="mr-2 animate-spin" /> Clearing…</>
                      : <><RotateCcw size={14} className="mr-2" /> Clear index and start over</>}
                  </Button>
                </div>
              </div>
            </Section>
          )}

          {/* --------------------------------------------- auto-select rules */}
          <Section
            id="rules" open={openSection === 'rules'} onToggle={toggle}
            title="Auto-select Rules"
            summary={rulesSummary}
            flag={armed ? (
              <span className="shrink-0 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-600 dark:text-red-400">
                check
              </span>
            ) : undefined}
          >
            <RankingEditor
              ranking={ranking}
              onChange={onRankingChange}
              onReset={onRankingReset}
              saving={rankingSaving}
              ownerInert={!hasPartner}
            />

            {/* Two callouts survive, down from five. Both change what happens
                to your photos; the other three were limitations, and are now
                one-line hints under the controls they describe. */}
            {armed && (
              <div className="flex gap-2 rounded-md border border-red-500/50 bg-red-500/10 p-2">
                <TriangleAlert size={14} className="mt-0.5 shrink-0 text-red-600 dark:text-red-500" />
                <p className="text-xs text-muted-foreground">
                  <strong className="text-red-700 dark:text-red-400">
                    Owner is set to prefer {partnerName}&apos;s copy, above your quality criteria.
                  </strong>{' '}
                  In a cross-library match your copy is the only one you own, so auto-pick will
                  mark <em>every</em> one of them for {DISPOSITIONS[disposition].label.toLowerCase()}
                  {' '}— even where yours is the sharper or larger file. Move Owner below
                  Resolution and File size if that isn&apos;t what you meant. Nothing happens
                  until you apply.
                </p>
              </div>
            )}
          </Section>

          {/* ------------------------------------------- disposition rules */}
          <Section
            id="discards" open={openSection === 'discards'} onToggle={toggle}
            title="Disposition Rules"
            summary={discardSummary}
          >
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
            <p className="text-xs text-muted-foreground">
              {DISPOSITIONS[disposition].summary}
              {/* Demoted from its own amber callout: it is a limitation, not a
                  risk to your photos. */}
              {disposition === 'stack' && ' Immich only stacks assets you own, so any group with a partner’s copy is skipped.'}
            </p>

            {disposition === 'tag' && (
              <div className="space-y-1">
                <Label className="text-xs">Tag to apply</Label>
                <Input
                  value={tagName}
                  onChange={(e) => onTagNameChange(e.target.value)}
                  placeholder="Duplicate"
                  className="h-8 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Created if it doesn&apos;t exist. Written through Immich, so sidecars stay
                  in step.
                </p>
              </div>
            )}

            {disposition === 'trash' && (
              <div className="space-y-1">
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
                  Trashing a copy removes it from its albums. &ldquo;Add keeper&rdquo; puts the
                  one you kept in first, so the album keeps the photo.
                  {hasPartner && ' On a cross-library match that means adding your partner’s copy to your album.'}
                </p>
              </div>
            )}
          </Section>

          {/* ---------------------------------------------------- set aside */}
          <Section
            id="aside" open={openSection === 'aside'} onToggle={toggle}
            title="Set Aside"
            summary={asideSummary}
          >
            <div className="space-y-1">
              <Label className="text-xs">
                {dismissedCount.toLocaleString()} skipped group{dismissedCount === 1 ? '' : 's'}
              </Label>
              <p className="text-xs text-muted-foreground">
                Hidden from this screen. Nothing in Immich was changed.
              </p>
              <Button
                size="sm" variant="outline" className="w-full"
                onClick={onClearDismissals}
                disabled={dismissedCount === 0}
              >
                Restore all skipped groups
              </Button>
            </div>

            {hasPartner && (
              <div className="space-y-1">
                <Label className="text-xs">
                  {pairVerdictCount.toLocaleString()} cross-library verdict{pairVerdictCount === 1 ? '' : 's'}
                </Label>
                <p className="text-xs text-muted-foreground">
                  Pairs you said are different photographs. They won&apos;t be offered again,
                  even after a rescan.
                </p>
                <Button
                  size="sm" variant="outline" className="w-full"
                  onClick={onClearPairVerdicts}
                  disabled={pairVerdictCount === 0}
                >
                  Forget those verdicts
                </Button>
              </div>
            )}
          </Section>

        </div>
      </SheetContent>
    </Sheet>
  )
}
