import { formatDistanceToNow } from 'date-fns'
import { Info, Loader2, RotateCcw, Search, Square } from 'lucide-react'
import React from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { IScanStatus } from '@/handlers/api/dedupe.handler'
import { BANDS, BAND_ORDER } from '@/lib/duplicates/bands'
import { humanizeDuration } from '@/helpers/string.helper'

export interface IScanProgress {
  scanned: number
  total: number
  /** Rolling estimate from this run's own chunks, null until there is one. */
  etaMs: number | null
  partnerName?: string
}

interface CrossLibraryScanPanelProps {
  status: IScanStatus | null
  loadingStatus: boolean
  scanning: boolean
  progress: IScanProgress | null
  onScan: () => void
  onStop: () => void
  onClear: () => void
  clearing: boolean
  /** The master partner-comparison switch. Off means this whole section is
   *  inert — the index is only ever read alongside partner copies. */
  enabled: boolean
}

/**
 * The cross-library scan, in the Options sheet.
 *
 * Presented as an index you build rather than a search you run, because that
 * is what it is: twenty-odd minutes of nearest-neighbour probes on a large
 * library, done once, then topped up in seconds whenever photos are added.
 * The controls therefore say what state the index is in, not just "go".
 */
export default function CrossLibraryScanPanel({
  status, loadingStatus, scanning, progress,
  onScan, onStop, onClear, clearing, enabled,
}: CrossLibraryScanPanelProps) {
  const partners = status?.partners ?? []
  const total = status?.total ?? 0
  const remaining = status?.remaining ?? 0
  const scanned = Math.max(0, total - remaining)
  const started = !!status?.lastRunAt
  const complete = started && remaining === 0
  const percent = total > 0 ? Math.min(100, Math.round((scanned / total) * 100)) : 0

  const liveScanned = progress ? progress.scanned : scanned
  const liveTotal = progress ? progress.total : total
  const livePercent = liveTotal > 0 ? Math.min(100, Math.round((liveScanned / liveTotal) * 100)) : percent

  if (loadingStatus && !status) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 size={12} className="animate-spin" /> Checking the index…
      </p>
    )
  }

  if (partners.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nobody is sharing a library with you, so there is nothing to compare against.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 text-sm font-medium">
        <Search size={14} />
        Find copies Immich can&apos;t see
      </Label>
      <p className="text-xs text-muted-foreground">
        Immich only ever groups duplicates within one person&apos;s library, so a photo you
        and {partners.length === 1 ? partners[0].name : 'a partner'} both hold is invisible
        to it. This searches for them directly — around twenty minutes for a
        100,000-photo library the first time, and seconds after that, because it only
        looks at what you have added since.
      </p>

      {/* Where the index stands. Stated before the button, because "Scan now"
          means something different on a fresh library than on a topped-up one. */}
      <div className="rounded-md border p-2 text-xs">
        {scanning ? (
          <>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-medium">
                <Loader2 size={12} className="animate-spin" />
                Scanning{progress?.partnerName ? ` ${progress.partnerName}'s library` : ''}…
              </span>
              <span className="text-muted-foreground">
                {liveScanned.toLocaleString()} / {liveTotal.toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-blue-600 transition-all dark:bg-blue-500"
                style={{ width: `${livePercent}%` }}
              />
            </div>
            <p className="mt-1.5 text-muted-foreground">
              {progress?.etaMs != null
                ? `About ${humanizeDuration(progress.etaMs)} to go. You can close this and keep working — it carries on, and stops where it is if you leave the page.`
                : 'You can close this and keep working.'}
            </p>
          </>
        ) : (
          <>
            <p className="font-medium">
              {!started
                ? 'Not searched yet.'
                : complete
                  ? `Up to date — all ${total.toLocaleString()} photos checked.`
                  : `Part-way through — ${scanned.toLocaleString()} of ${total.toLocaleString()} checked (${percent}%).`}
            </p>
            {status?.lastRunAt && (
              <p className="text-muted-foreground">
                Last run {formatDistanceToNow(new Date(status.lastRunAt), { addSuffix: true })}.
              </p>
            )}
            {(status?.counts?.total ?? 0) > 0 && (
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                {BAND_ORDER.map((b) => (
                  <span key={b}>
                    {BANDS[b].label} <strong>{(status?.counts?.[b] ?? 0).toLocaleString()}</strong>
                  </span>
                ))}
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex gap-2">
        {scanning ? (
          <Button size="sm" variant="outline" className="flex-1" onClick={onStop}>
            <Square size={14} className="mr-2" /> Stop
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={onScan}
            disabled={!enabled || clearing}
          >
            <Search size={14} className="mr-2" />
            {!started ? 'Scan now' : complete ? 'Check for new photos' : 'Continue scan'}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onClear}
          disabled={scanning || clearing || !started}
          title="Throw the index away and search everything again from scratch"
        >
          {clearing ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
        </Button>
      </div>

      {/* Two honest limits of the index, both a consequence of scanning your
          library against theirs rather than the other way round. */}
      <div className="flex gap-2 rounded-md border border-blue-500/40 bg-blue-500/10 p-2">
        <Info size={14} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
        <p className="text-xs text-muted-foreground">
          Topping up looks at <strong>your</strong> new photos. If a partner adds a copy of
          a photo you have had for years, it turns up on a full re-scan (the circular arrow)
          rather than a top-up. Photos Immich has already grouped as duplicates of each other
          stay in the same-library list, so nothing appears in two places.
        </p>
      </div>
    </div>
  )
}
