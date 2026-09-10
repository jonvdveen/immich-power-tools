import { Layers, RefreshCw, Search, Shield, Tag, Trash2, Users, X } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import AlbumFilterDropdown from '@/components/assets/duplicate-assets/AlbumFilterDropdown'
import AlbumTransferDialog from '@/components/assets/duplicate-assets/AlbumTransferDialog'
import DeDuplicatorOptions, { IAutoPickSummary } from '@/components/assets/duplicate-assets/DeDuplicatorOptions'
import VirtualizedDuplicateList from '@/components/assets/duplicate-assets/VirtualizedDuplicateList'
import PageLayout from '@/components/layouts/PageLayout'
import FloatingBar from '@/components/shared/FloatingBar'
import Header from '@/components/shared/Header'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Loader from '@/components/ui/loader'
import { ToastAction } from '@/components/ui/toast'
import { toast } from '@/components/ui/use-toast'
import { addAssetToAlbum } from '@/handlers/api/album.handler'
import {
  createStack, deleteAssets, getAlbumsByAssetIds, IAssetAlbumInfo, listDuplicates, updateAssets,
} from '@/handlers/api/asset.handler'
import {
  addDismissals, clearDismissals, getRankingConfig, getSetting, listDismissals,
  putRankingConfig, putSetting, resetRankingConfig,
} from '@/handlers/api/dedupe.handler'
import { bulkTagAssets, upsertTags } from '@/handlers/api/tag.handler'
import { humanizeBytes } from '@/helpers/string.helper'
import API from '@/lib/api'
import {
  DEFAULT_TAG_NAME, DISPOSITIONS, DISPOSITION_SETTING_KEY, Disposition,
  TAG_NAME_SETTING_KEY, isDisposition,
} from '@/lib/duplicates/disposition'
import { DEFAULT_RANKING, IRankingRow } from '@/lib/duplicates/ranking'
import { cn } from '@/lib/utils'
import { IDuplicateAssetRecord, IPartnerMatch } from '@/types/asset'

type AlbumTransferMode = 'always' | 'never' | 'ask'
type SourceFilter = 'all' | 'same-library' | 'cross-library'

/** Remembered per browser — a view preference, unlike the ranking. */
const INCLUDE_PARTNERS_KEY = 'dedupe_include_partners'
const PARTNERS_CAN_WIN_KEY = 'dedupe_partners_can_win'
const ALBUM_TRANSFER_KEY = 'dedupe_album_transfer'

/** Ids per write. The Immich proxy is a Next API route on the default 1MB body
 *  parser, which a bulk id list blows past at roughly 26,000 ids — measured:
 *  12,000 goes through, 30,000 comes back "413 Body exceeded 1mb limit". */
const WRITE_BATCH = 5000

interface PendingDedup {
  keptIds: string[]
  discardedIds: string[]
  albumsToTransfer: IAssetAlbumInfo[]
}

/**
 * De-Duplicator.
 *
 * Supersedes the Bulk Duplicate Finder. Three things it does differently:
 *
 *  1. Discards go to Immich's TRASH. The old page called `deleteAssets` with
 *     no options, and that helper defaults to `force: true` — permanent,
 *     bypassing trash entirely. Nothing here can permanently delete.
 *  2. The keeper ranking is the user's, not a fixed chain baked into the code.
 *  3. Trash is one of three outcomes, alongside tagging and stacking.
 *
 * Phase 1 groups by Immich's own `duplicateId` only; the cross-library scan
 * that fills the source and band filters lands in Phase 2, which is why those
 * chips are present but currently describe a single source.
 */
export default function DeDuplicatorPage() {
  const [duplicates, setDuplicates] = useState<IDuplicateAssetRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set())
  const [isApplying, setIsApplying] = useState(false)
  const [applyLabel, setApplyLabel] = useState('Working')
  const [lastSelectedIndex, setLastSelectedIndex] = useState(-1)
  const [containerHeight, setContainerHeight] = useState(600)
  const [selectionMode, setSelectionMode] = useState<'keep' | 'discard'>('keep')
  const [assetAlbums, setAssetAlbums] = useState<Record<string, IAssetAlbumInfo[]>>({})
  const [albumTransferMode, setAlbumTransferMode] = useState<AlbumTransferMode>('always')
  const [pendingDedup, setPendingDedup] = useState<PendingDedup | null>(null)

  const [searchInputText, setSearchInputText] = useState('')
  const [searchText, setSearchText] = useState('')
  const [selectedAlbumIds, setSelectedAlbumIds] = useState<Set<string>>(new Set())
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')

  const [disposition, setDispositionState] = useState<Disposition>('trash')
  const [tagName, setTagNameState] = useState(DEFAULT_TAG_NAME)
  const [ranking, setRanking] = useState<IRankingRow[]>(DEFAULT_RANKING)
  const [rankingSaving, setRankingSaving] = useState(false)
  const [skipped, setSkipped] = useState<Set<string>>(new Set())

  const [includePartners, setIncludePartnersState] = useState(false)
  const [partnersCanWin, setPartnersCanWinState] = useState(false)
  const [partnerScanning, setPartnerScanning] = useState(false)
  const [partnerMatches, setPartnerMatches] = useState<Record<string, IPartnerMatch[]>>({})
  const [partnerProgress, setPartnerProgress] = useState<{ done: number; total: number } | null>(null)
  const [autoPicking, setAutoPicking] = useState(false)
  const [autoPickSummary, setAutoPickSummary] = useState<IAutoPickSummary | null>(null)

  /** Bumped to abandon an in-flight partner scan (toggle off, or refetch). */
  const partnerScanToken = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  /** Ids of every partner copy on screen. They can be chosen as a keeper but
   *  belong to another user, so they must be kept out of every write. */
  const partnerAssetIds = useMemo(
    () => new Set(Object.values(partnerMatches).flat().map((m) => m.id)),
    [partnerMatches]
  )

  // ---------------------------------------------------------------- settings

  // Hydrated after mount rather than in the initial state: localStorage does
  // not exist during SSR, and reading it inline would mismatch the server HTML.
  useEffect(() => {
    if (localStorage.getItem(INCLUDE_PARTNERS_KEY) === 'true') setIncludePartnersState(true)
    if (localStorage.getItem(PARTNERS_CAN_WIN_KEY) === 'true') setPartnersCanWinState(true)
    const saved = localStorage.getItem(ALBUM_TRANSFER_KEY)
    if (saved === 'always' || saved === 'never' || saved === 'ask') setAlbumTransferMode(saved)
  }, [])

  const rememberLocally = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      // Private browsing / storage disabled — the toggle still works, it just
      // won't be remembered.
    }
  }

  const setIncludePartners = useCallback((value: boolean) => {
    setIncludePartnersState(value)
    rememberLocally(INCLUDE_PARTNERS_KEY, String(value))
  }, [])

  const setPartnersCanWin = useCallback((value: boolean) => {
    setPartnersCanWinState(value)
    rememberLocally(PARTNERS_CAN_WIN_KEY, String(value))
  }, [])

  const handleAlbumTransferModeChange = (mode: AlbumTransferMode) => {
    setAlbumTransferMode(mode)
    rememberLocally(ALBUM_TRANSFER_KEY, mode)
  }

  // Account-level settings: ranking, disposition, tag name and skips all live
  // server-side so they follow the user between browsers.
  useEffect(() => {
    getRankingConfig()
      .then((res) => setRanking(res.ranking))
      .catch(() => { /* falls back to the measured default already in state */ })

    getSetting(DISPOSITION_SETTING_KEY).then((v) => { if (isDisposition(v)) setDispositionState(v) })
    getSetting(TAG_NAME_SETTING_KEY).then((v) => { if (v) setTagNameState(v) })

    listDismissals()
      .then((res) => setSkipped(new Set(res.dismissals.filter((d) => !d.pairedAssetId).map((d) => d.groupKey))))
      .catch(() => { /* nothing hidden is the safe default */ })
  }, [])

  const setDisposition = useCallback((value: Disposition) => {
    setDispositionState(value)
    putSetting(DISPOSITION_SETTING_KEY, value).catch(() => {
      toast({ title: 'Not saved', description: "That disposition applies now but couldn't be saved to your account.", variant: 'destructive' })
    })
  }, [])

  /** Debounced so a keystroke per character doesn't become a write per
   *  character; the local state updates immediately either way. */
  const tagSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setTagName = useCallback((value: string) => {
    setTagNameState(value)
    if (tagSaveTimer.current) clearTimeout(tagSaveTimer.current)
    tagSaveTimer.current = setTimeout(() => {
      putSetting(TAG_NAME_SETTING_KEY, value.trim() || DEFAULT_TAG_NAME).catch(() => { /* non-fatal */ })
    }, 600)
  }, [])

  const handleRankingChange = useCallback((next: IRankingRow[]) => {
    setRanking(next)
    setRankingSaving(true)
    putRankingConfig(next)
      .catch(() => toast({ title: 'Not saved', description: "The ranking applies now but couldn't be saved to your account.", variant: 'destructive' }))
      .finally(() => setRankingSaving(false))
  }, [])

  const handleRankingReset = useCallback(() => {
    setRankingSaving(true)
    resetRankingConfig()
      .then((res) => setRanking(res.ranking))
      .catch(() => setRanking([...DEFAULT_RANKING]))
      .finally(() => setRankingSaving(false))
  }, [])

  // ------------------------------------------------------------------- data

  const fetchDuplicates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const records = await listDuplicates()
      setDuplicates(records)
      setSelectedAssets(new Set())
      setSearchInputText('')
      setSearchText('')
      setSelectedAlbumIds(new Set())

      const allIds = records.flatMap((r: IDuplicateAssetRecord) => r.assets.map((a) => a.id))
      setAssetAlbums(allIds.length > 0 ? await getAlbumsByAssetIds(allIds) : {})
    } catch (e: any) {
      setError(e.message || 'Failed to load duplicates')
      toast({ title: 'Error', description: 'Failed to load duplicates. Please try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDuplicates() }, [fetchDuplicates])

  useEffect(() => {
    const updateHeight = () => {
      const headerHeight = 48
      const filterBarHeight = duplicates.length > 0 ? 48 : 0
      setContainerHeight(window.innerHeight - headerHeight - filterBarHeight)
    }
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [duplicates])

  useEffect(() => {
    const timer = setTimeout(() => setSearchText(searchInputText), 200)
    return () => clearTimeout(timer)
  }, [searchInputText])

  /**
   * Escape clears the selection -- but ONLY when it isn't already dismissing
   * something else.
   *
   * Escape is also how Radix closes the Options sheet, the confirm dialogs and
   * the album popover, so without this guard the natural way to dismiss Options
   * silently threw away every keeper: auto-pick 12,000 groups, glance at the
   * settings, press Escape, lose all of it. Radix portals every layer with a
   * dialog role (or the popper wrapper), so their presence is the signal that
   * this keypress belongs to them.
   *
   * Even when it is ours, discarding a large selection on one unconfirmed
   * keypress is harsh, so the toast hands it back.
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || selectedAssets.size === 0) return
      const overlayOpen = document.querySelector(
        '[role="dialog"], [role="alertdialog"], [data-radix-popper-content-wrapper]'
      )
      if (overlayOpen) return

      const previous = selectedAssets
      const previousIndex = lastSelectedIndex
      setSelectedAssets(new Set())
      setLastSelectedIndex(-1)
      toast({
        title: `Cleared ${previous.size.toLocaleString()} selected`,
        description: 'Nothing was changed in your library.',
        action: (
          <ToastAction
            altText="Undo"
            onClick={() => {
              setSelectedAssets(previous)
              setLastSelectedIndex(previousIndex)
            }}
          >
            Undo
          </ToastAction>
        ),
      })
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedAssets, lastSelectedIndex])

  // --------------------------------------------------------------- filtering

  const allAlbumOptions = useMemo(() => {
    const seen = new Map<string, string>()
    Object.values(assetAlbums).forEach((albums) => {
      albums.forEach((a) => { if (!seen.has(a.albumId)) seen.set(a.albumId, a.albumName) })
    })
    return Array.from(seen, ([value, label]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [assetAlbums])

  const hasActiveFilters = searchText.length > 0 || selectedAlbumIds.size > 0 || sourceFilter !== 'all'

  const visibleDuplicates = useMemo(() => {
    const lowerSearch = searchText.toLowerCase()

    return duplicates.filter((record) => {
      if (skipped.has(record.duplicateId)) return false

      if (sourceFilter !== 'all') {
        const hasPartner = record.assets.some((a) => (partnerMatches[a.id] || []).length > 0)
        if (sourceFilter === 'cross-library' && !hasPartner) return false
        if (sourceFilter === 'same-library' && hasPartner) return false
      }

      if (searchText.length === 0 && selectedAlbumIds.size === 0) return true

      return record.assets.some((asset) => {
        if (searchText.length > 0) {
          const fields = [
            asset.originalFileName, asset.originalPath, asset.exifInfo?.city,
            asset.exifInfo?.state, asset.exifInfo?.country, asset.exifInfo?.description,
          ]
          if (!fields.some((f) => f && f.toLowerCase().includes(lowerSearch))) return false
        }
        if (selectedAlbumIds.size > 0) {
          const list = assetAlbums[asset.id] || []
          if (!list.some((a) => selectedAlbumIds.has(a.albumId))) return false
        }
        return true
      })
    })
  }, [duplicates, skipped, sourceFilter, partnerMatches, searchText, selectedAlbumIds, assetAlbums])

  useEffect(() => { setLastSelectedIndex(-1) }, [searchText, selectedAlbumIds, sourceFilter])

  const allAssetIds = useMemo(
    () => visibleDuplicates.flatMap((r) => r.assets.map((a) => a.id)),
    [visibleDuplicates]
  )

  // In discard mode a ticked card means "act on this", which can never be true
  // of a partner's photo — so a keeper picked in keep mode is dropped on the
  // way out rather than silently changing meaning.
  useEffect(() => {
    if (selectionMode === 'keep' || partnerAssetIds.size === 0) return
    setSelectedAssets((prev) => {
      const next = new Set([...prev].filter((id) => !partnerAssetIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [selectionMode, partnerAssetIds])

  const handleAssetSelect = useCallback((assetId: string, isShiftClick?: boolean) => {
    setSelectedAssets((prev) => {
      const next = new Set(prev)
      if (isShiftClick && lastSelectedIndex >= 0) {
        const currentIndex = allAssetIds.indexOf(assetId)
        const start = Math.min(lastSelectedIndex, currentIndex)
        const end = Math.max(lastSelectedIndex, currentIndex)
        for (let i = start; i <= end; i++) next.add(allAssetIds[i])
        setLastSelectedIndex(currentIndex)
      } else {
        if (next.has(assetId)) next.delete(assetId)
        else next.add(assetId)
        setLastSelectedIndex(allAssetIds.indexOf(assetId))
      }
      return next
    })
  }, [allAssetIds, lastSelectedIndex])

  // ---------------------------------------------------------------- skipping

  const handleSkipRecord = useCallback(async (record: IDuplicateAssetRecord) => {
    setSkipped((prev) => new Set(prev).add(record.duplicateId))
    try {
      await addDismissals({ groupKeys: [record.duplicateId] })
    } catch {
      // Roll the hide back rather than leaving the user believing it stuck.
      setSkipped((prev) => {
        const next = new Set(prev)
        next.delete(record.duplicateId)
        return next
      })
      toast({ title: 'Not skipped', description: "Couldn't save that skip. The group is still shown.", variant: 'destructive' })
    }
  }, [])

  const handleClearSkips = useCallback(async () => {
    try {
      await clearDismissals()
      setSkipped(new Set())
      toast({ title: 'Restored', description: 'Skipped groups are visible again.' })
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || "Couldn't restore skipped groups.", variant: 'destructive' })
    }
  }, [])

  // ------------------------------------------------------------- partner scan

  useEffect(() => {
    partnerScanToken.current += 1
    const token = partnerScanToken.current

    if (!includePartners) {
      setPartnerScanning(false)
      setPartnerProgress(null)
      setPartnerMatches({})
      return
    }

    // One representative per group is enough: copies within a group are
    // near-identical, so a partner match for one is a match for the group.
    const reps = duplicates.map((r) => r.assets[0]?.id).filter((id): id is string => !!id)
    if (reps.length === 0) return

    const BATCH = 100
    let cancelled = false

    ;(async () => {
      setPartnerScanning(true)
      setPartnerProgress({ done: 0, total: reps.length })
      try {
        for (let i = 0; i < reps.length; i += BATCH) {
          if (cancelled || partnerScanToken.current !== token) return
          const res = await API.post('/api/assets/duplicates/partner-matches', { assetIds: reps.slice(i, i + BATCH) })
          if (cancelled || partnerScanToken.current !== token) return
          if (res?.matches && Object.keys(res.matches).length) {
            setPartnerMatches((prev) => ({ ...prev, ...res.matches }))
          }
          setPartnerProgress({ done: Math.min(i + BATCH, reps.length), total: reps.length })
        }
      } catch (e: any) {
        if (!cancelled && partnerScanToken.current === token) {
          toast({ title: 'Partner scan failed', description: e?.message || 'Unknown error', variant: 'destructive' })
        }
      } finally {
        if (partnerScanToken.current === token) {
          setPartnerScanning(false)
          setPartnerProgress(null)
        }
      }
    })()

    return () => { cancelled = true }
  }, [includePartners, duplicates])

  // ------------------------------------------------------------------ actions

  const getAlbumsToTransfer = useCallback((keptIds: string[], discardedIds: string[]): IAssetAlbumInfo[] => {
    const keptAlbumIds = new Set<string>()
    keptIds.forEach((id) => (assetAlbums[id] || []).forEach((a) => keptAlbumIds.add(a.albumId)))

    const seen = new Set<string>()
    const result: IAssetAlbumInfo[] = []
    discardedIds.forEach((id) => {
      (assetAlbums[id] || []).forEach((a) => {
        if (!keptAlbumIds.has(a.albumId) && !seen.has(a.albumId)) {
          seen.add(a.albumId)
          result.push(a)
        }
      })
    })
    return result
  }, [assetAlbums])

  /**
   * Apply the current disposition. Deliberately NOT wrapped in useCallback with
   * an empty dep array — that was a real bug on the old page, freezing
   * assetAlbums at {} and duplicates at [] from the first render.
   */
  const executeDedup = async (keptIds: string[], discardedIds: string[], albumIdsToTransfer: string[]) => {
    const keptSet = new Set(keptIds)
    setIsApplying(true)
    setApplyLabel(disposition === 'tag' ? 'Tagging' : disposition === 'stack' ? 'Stacking' : 'Moving to trash')

    try {
      // ---- Stacking is a different shape: it acts per group, not on a flat
      // ---- id list, and it needs the keeper first as the primary.
      if (disposition === 'stack') {
        // Set, not Array.includes: a whole-library apply is ~25k discarded ids
        // against ~12k groups, and the linear scan inside the loop makes that
        // quadratic.
        const discardedSet = new Set(discardedIds)
        let stacked = 0
        let skippedGroups = 0
        let failedGroups = 0
        const resolvedIds: string[] = []

        for (const record of visibleDuplicates) {
          const own = record.assets.map((a) => a.id)
          const keeper = own.find((id) => keptSet.has(id))
          const rest = own.filter((id) => id !== keeper && discardedSet.has(id))
          // No keeper of your own, or nothing to stack under it. A group whose
          // keeper is a partner's copy lands here, which is why it is counted
          // and reported rather than silently dropped. Groups this run didn't
          // touch at all are simply not ours to count.
          if (!keeper || rest.length === 0) {
            if (own.some((id) => keptSet.has(id) || discardedSet.has(id))) skippedGroups++
            continue
          }
          try {
            await createStack([keeper, ...rest])
            resolvedIds.push(keeper, ...rest)
            stacked++
          } catch {
            // One bad group (an asset already in a stack, say) must not abort
            // the rest of a long run.
            failedGroups++
          }
        }

        // Stacking does not clear duplicateId, so without this the group comes
        // straight back on the next load and there is no way to ever finish
        // the list. Clearing it is the same thing "Not duplicates" does, and
        // is the honest reading: this group has been dealt with.
        for (let i = 0; i < resolvedIds.length; i += WRITE_BATCH) {
          await updateAssets({ ids: resolvedIds.slice(i, i + WRITE_BATCH), duplicateId: null })
        }

        toast({
          title: stacked > 0 ? 'Stacked' : 'Nothing stacked',
          description: `${stacked.toLocaleString()} group${stacked === 1 ? '' : 's'} collapsed into a single timeline entry.`
            + (skippedGroups > 0 ? ` ${skippedGroups.toLocaleString()} skipped — Immich can only stack assets you own.` : '')
            + (failedGroups > 0 ? ` ${failedGroups.toLocaleString()} could not be stacked.` : ''),
          variant: failedGroups > 0 ? 'destructive' : undefined,
        })
        await fetchDuplicates()
        return
      }

      // Move albums to kept assets (only add each asset to albums it's not in).
      const transferCalls: Promise<unknown>[] = []
      for (const albumId of new Set(albumIdsToTransfer)) {
        const assetsToAdd = keptIds.filter((id) => !(assetAlbums[id] || []).some((a) => a.albumId === albumId))
        for (let i = 0; i < assetsToAdd.length; i += WRITE_BATCH) {
          transferCalls.push(addAssetToAlbum(albumId, assetsToAdd.slice(i, i + WRITE_BATCH)))
        }
      }
      await Promise.all(transferCalls)

      // Mark kept assets as non-duplicate. A partner's copy can be the keeper,
      // but it is not ours to write to: Immich's bulk update requires
      // AssetUpdate on every id and THROWS on the first one it is refused,
      // which would abort the whole run. (Album add above is safe by contrast
      // — it reports per-asset failures instead of throwing.)
      const ownKeptIds = keptIds.filter((id) => !partnerAssetIds.has(id))
      for (let i = 0; i < ownKeptIds.length; i += WRITE_BATCH) {
        await updateAssets({ ids: ownKeptIds.slice(i, i + WRITE_BATCH), duplicateId: null })
      }

      // Belt and braces: nothing that isn't ours ever reaches a write. The
      // selection paths already exclude partner copies from discard, so this
      // should be a no-op — it is here so that stays true if they change.
      const actionableIds = discardedIds.filter((id) => !partnerAssetIds.has(id))

      if (disposition === 'tag') {
        const name = tagName.trim() || DEFAULT_TAG_NAME
        // PUT /tags is Immich's upsert; POST /tags 400s when the name exists,
        // which is the common case on every run after the first.
        const tags = await upsertTags([name])
        const tagId = tags?.[0]?.id
        if (!tagId) throw new Error(`Couldn't create or find the tag "${name}".`)
        for (let i = 0; i < actionableIds.length; i += WRITE_BATCH) {
          await bulkTagAssets([tagId], actionableIds.slice(i, i + WRITE_BATCH))
        }
        // The tagged copies stay in the library, so unless their duplicateId is
        // cleared too the group comes straight back on the next load minus its
        // keeper — and the list can never be worked down. The tag is the marker
        // now; the grouping has done its job.
        for (let i = 0; i < actionableIds.length; i += WRITE_BATCH) {
          await updateAssets({ ids: actionableIds.slice(i, i + WRITE_BATCH), duplicateId: null })
        }
        toast({
          title: 'Tagged',
          description: `Kept ${keptIds.length.toLocaleString()}, tagged ${actionableIds.length.toLocaleString()} as "${name}". Nothing was removed.`,
        })
      } else {
        // force:false — Immich's trash, recoverable. The old page's helper
        // defaults to force:true, which deletes permanently.
        for (let i = 0; i < actionableIds.length; i += WRITE_BATCH) {
          await deleteAssets(actionableIds.slice(i, i + WRITE_BATCH), { force: false })
        }
        const discardedSet = new Set(actionableIds)
        let discardedSize = 0
        duplicates.forEach((r) => r.assets.forEach((a) => {
          if (discardedSet.has(a.id)) discardedSize += a.exifInfo?.fileSizeInByte || 0
        }))
        toast({
          title: 'Moved to trash',
          description: `Kept ${keptIds.length.toLocaleString()}, trashed ${actionableIds.length.toLocaleString()}`
            + (discardedSize > 0 ? ` (${humanizeBytes(discardedSize)})` : '')
            + (albumIdsToTransfer.length > 0 ? `. Moved ${albumIdsToTransfer.length} album(s)` : '')
            + '. Recoverable from Immich\'s trash until you empty it.',
        })
      }

      const removedIds = new Set([...keptIds, ...actionableIds])
      setDuplicates((prev) =>
        prev
          .map((r) => ({ ...r, assets: r.assets.filter((a) => !removedIds.has(a.id)) }))
          .filter((r) => r.assets.length > 0)
      )
      setSelectedAssets((prev) => {
        const next = new Set(prev)
        removedIds.forEach((id) => next.delete(id))
        return next
      })
      setLastSelectedIndex(-1)
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to process assets. Please try again.', variant: 'destructive' })
    } finally {
      setIsApplying(false)
    }
  }

  const initiateDedup = useCallback((keptIds: string[], discardedIds: string[]) => {
    // Album transfer only makes sense when the other copies are going away.
    if (disposition !== 'trash') {
      executeDedup(keptIds, discardedIds, [])
      return
    }
    const albumsToTransfer = getAlbumsToTransfer(keptIds, discardedIds)
    if (albumsToTransfer.length === 0 || albumTransferMode === 'never') {
      executeDedup(keptIds, discardedIds, [])
    } else if (albumTransferMode === 'always') {
      executeDedup(keptIds, discardedIds, albumsToTransfer.map((a) => a.albumId))
    } else {
      setPendingDedup({ keptIds, discardedIds, albumsToTransfer })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumTransferMode, getAlbumsToTransfer, disposition, duplicates, assetAlbums, tagName, visibleDuplicates])

  const handleKeepAllInRecord = useCallback(async (record: IDuplicateAssetRecord) => {
    setIsApplying(true)
    setApplyLabel('Updating')
    try {
      await updateAssets({ ids: record.assets.map((a) => a.id), duplicateId: null })
      setDuplicates((prev) => prev.filter((r) => r.duplicateId !== record.duplicateId))
      setSelectedAssets((prev) => {
        const next = new Set(prev)
        record.assets.forEach((a) => next.delete(a.id))
        return next
      })
      setLastSelectedIndex(-1)
      toast({ title: 'Not duplicates', description: `${record.assets.length} assets kept. Immich will stop grouping them.` })
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to update assets.', variant: 'destructive' })
    } finally {
      setIsApplying(false)
    }
  }, [])

  const handleAutoPick = useCallback(async () => {
    setAutoPicking(true)
    try {
      // A group counts as decided if either one of your copies OR a partner's
      // copy has been picked — otherwise auto-pick would add a second keeper
      // to a group you had already settled on the partner's copy.
      const groupsToPick = visibleDuplicates.filter((record) => {
        const ownPicked = record.assets.some((a) => selectedAssets.has(a.id))
        const partnerPicked = record.assets.some((a) =>
          (partnerMatches[a.id] || []).some((m) => selectedAssets.has(m.id)))
        return !ownPicked && !partnerPicked
      })
      const skippedCount = visibleDuplicates.length - groupsToPick.length

      const letPartnersWin = includePartners && partnersCanWin
      const payloadGroups = groupsToPick.map((record) => ({
        duplicateId: record.duplicateId,
        assetIds: record.assets.map((a) => a.id),
        partnerAssetIds: letPartnersWin
          ? Array.from(new Set(record.assets.flatMap((a) => (partnerMatches[a.id] || []).map((m) => m.id))))
          : [],
      }))

      if (payloadGroups.length === 0) {
        setAutoPickSummary({ picked: 0, undecided: 0, weakTiebreak: 0, skipped: skippedCount, partnerWins: 0, guarded: 0 })
        toast({ title: 'Nothing to pick', description: 'Every visible group has already been decided.' })
        return
      }

      // Batched: a full library here is ~27k ids, which is about 1.01MB of
      // JSON and lands just over Next's 1MB request-body limit — the whole
      // call was being rejected before it reached the handler.
      const BATCH = 500
      const keeperIds: string[] = []
      let weakCount = 0
      let partnerWins = 0
      let guardedCount = 0
      for (let i = 0; i < payloadGroups.length; i += BATCH) {
        const res = await API.post('/api/assets/duplicates/auto-pick', {
          groups: payloadGroups.slice(i, i + BATCH),
          ranking,
        })
        keeperIds.push(...Object.values<string>(res.keepers || {}))
        weakCount += (res.weakTiebreak || []).length
        partnerWins += (res.partnerKeepers || []).length
        guardedCount += Object.keys(res.guarded || {}).length
      }

      // Auto-pick chooses keepers, so the page has to be reading the selection
      // as "keep these" for the result to mean what it says.
      setSelectionMode('keep')
      setSelectedAssets((prev) => {
        const next = new Set(prev)
        keeperIds.forEach((id) => next.add(id))
        return next
      })

      setAutoPickSummary({
        picked: keeperIds.length, undecided: 0, weakTiebreak: weakCount,
        skipped: skippedCount, partnerWins, guarded: guardedCount,
      })
      toast({
        title: 'Keepers picked',
        description: `${keeperIds.length.toLocaleString()} picked`
          + (partnerWins ? `, ${partnerWins.toLocaleString()} keeping a partner's copy` : '')
          + (guardedCount ? `, ${guardedCount.toLocaleString()} kept yours to protect metadata` : '')
          + (weakCount ? `, ${weakCount.toLocaleString()} on a tiebreak` : '')
          + '. Nothing changed — review, then apply.',
      })
    } catch (e: any) {
      toast({ title: 'Auto-pick failed', description: e?.message || 'Unknown error', variant: 'destructive' })
    } finally {
      setAutoPicking(false)
    }
  }, [visibleDuplicates, selectedAssets, partnerMatches, includePartners, partnersCanWin, ranking])

  /** In keep mode, every group that has a keeper picked: what would happen to
   *  the rest if the user applied it. Groups with no pick are untouched. */
  const keepModeInfo = useMemo(() => {
    if (selectionMode !== 'keep') return { groups: 0, discardCount: 0, discardSize: 0, partnerGroups: 0 }
    let groups = 0, discardCount = 0, discardSize = 0, partnerGroups = 0
    for (const record of visibleDuplicates) {
      const ownKept = record.assets.filter((a) => selectedAssets.has(a.id))
      const partnerKept = record.assets.flatMap((a) =>
        (partnerMatches[a.id] || []).filter((m) => selectedAssets.has(m.id)))
      if (ownKept.length === 0 && partnerKept.length === 0) continue
      groups++
      if (ownKept.length === 0) partnerGroups++
      for (const a of record.assets) {
        if (selectedAssets.has(a.id)) continue
        discardCount++
        discardSize += a.exifInfo?.fileSizeInByte || 0
      }
    }
    return { groups, discardCount, discardSize, partnerGroups }
  }, [selectionMode, visibleDuplicates, selectedAssets, partnerMatches])

  const discardModeInfo = useMemo(() => {
    if (selectionMode !== 'discard') return { count: 0, totalSize: 0 }
    let count = 0, totalSize = 0
    duplicates.forEach((r) => r.assets.forEach((a) => {
      if (selectedAssets.has(a.id)) {
        count++
        totalSize += a.exifInfo?.fileSizeInByte || 0
      }
    }))
    return { count, totalSize }
  }, [duplicates, selectedAssets, selectionMode])

  const handleApplyKeepers = async () => {
    const keptIds: string[] = []
    const discardedIds: string[] = []
    for (const record of visibleDuplicates) {
      const ownKept = record.assets.filter((a) => selectedAssets.has(a.id)).map((a) => a.id)
      const partnerKept = Array.from(new Set(record.assets.flatMap((a) =>
        (partnerMatches[a.id] || []).filter((m) => selectedAssets.has(m.id)).map((m) => m.id))))
      if (ownKept.length === 0 && partnerKept.length === 0) continue
      keptIds.push(...ownKept, ...partnerKept)
      discardedIds.push(...record.assets.filter((a) => !selectedAssets.has(a.id)).map((a) => a.id))
    }
    if (discardedIds.length === 0) {
      // Never fail silently here: the user has just confirmed a dialog, and
      // returning without a word is indistinguishable from a bug.
      toast({
        title: 'Nothing to act on',
        description: keptIds.length === 0
          ? 'No keepers are picked, so there is nothing to act on.'
          : `Every copy in the ${keepModeInfo.groups.toLocaleString()} decided group${keepModeInfo.groups === 1 ? '' : 's'} is marked KEEP, so nothing would change. Untick the copies you want gone, or re-run auto-pick.`,
      })
      return
    }
    initiateDedup(keptIds, discardedIds)
  }

  const handleApplyDiscards = async () => {
    if (selectedAssets.size === 0 || selectionMode !== 'discard') return
    const discardedIds = Array.from(selectedAssets).filter((id) => !partnerAssetIds.has(id))
    const keptIds: string[] = []
    visibleDuplicates.forEach((r) => r.assets.forEach((a) => {
      if (!selectedAssets.has(a.id)) keptIds.push(a.id)
    }))
    initiateDedup(keptIds, discardedIds)
  }

  const handleKeepSelected = async (_record: IDuplicateAssetRecord, keptIds: string[], discardedIds: string[]) => {
    initiateDedup(keptIds, discardedIds)
  }

  // ---------------------------------------------------------------- rendering

  const info = DISPOSITIONS[disposition]
  const actionVerb = disposition === 'tag' ? 'Tag' : disposition === 'stack' ? 'Stack' : 'Trash'
  const ActionIcon = disposition === 'tag' ? Tag : disposition === 'stack' ? Layers : Trash2

  const sourceChips: { value: SourceFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'same-library', label: 'Same library' },
    { value: 'cross-library', label: 'Cross-library' },
  ]

  return (
    <PageLayout>
      <Header
        leftComponent="De-Duplicator"
        rightComponent={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Select to:</span>
              <div className="flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600">
                <Button
                  variant={selectionMode === 'keep' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setSelectionMode('keep')}
                  className={cn('rounded-none border-0', selectionMode === 'keep' && 'bg-green-600 text-white hover:bg-green-700')}
                >
                  <Shield size={14} className="mr-1" /> Keep
                </Button>
                <Button
                  variant={selectionMode === 'discard' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setSelectionMode('discard')}
                  className={cn('rounded-none border-0', selectionMode === 'discard' && 'bg-red-600 text-white hover:bg-red-700')}
                >
                  <ActionIcon size={14} className="mr-1" /> Discard
                </Button>
              </div>
            </div>

            {/* What the discards actually get: visible in the toolbar rather
                than only inside Options, because it changes what every button
                on this page does. */}
            <div className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground">
              <ActionIcon size={12} />
              {info.label}
            </div>

            <DeDuplicatorOptions
              disposition={disposition}
              onDispositionChange={setDisposition}
              tagName={tagName}
              onTagNameChange={setTagName}
              ranking={ranking}
              onRankingChange={handleRankingChange}
              onRankingReset={handleRankingReset}
              rankingSaving={rankingSaving}
              includePartners={includePartners}
              onIncludePartnersChange={setIncludePartners}
              partnersCanWin={partnersCanWin}
              onPartnersCanWinChange={setPartnersCanWin}
              partnerScanning={partnerScanning}
              partnerProgress={partnerProgress}
              onAutoPick={handleAutoPick}
              autoPicking={autoPicking}
              autoPickSummary={autoPickSummary}
              dismissedCount={skipped.size}
              onClearDismissals={handleClearSkips}
              disabled={loading || duplicates.length === 0}
            />

            <Button onClick={fetchDuplicates} disabled={loading} className="flex items-center gap-2">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="h-full overflow-hidden">
        {(loading || error || duplicates.length === 0) && (
          <div className="p-6 pb-0">
            <p className="mb-6 text-gray-600 dark:text-gray-400">
              Review duplicate copies and decide which one to keep. Discards go to Immich&apos;s
              trash, get tagged, or get stacked — never permanently deleted from here.
            </p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center px-6 py-12">
            <Loader />
            <span className="ml-2 text-gray-600 dark:text-gray-400">Loading duplicate groups…</span>
          </div>
        )}

        {error && (
          <div className="px-6">
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
              <div className="flex items-center gap-2">
                <span className="text-red-600 dark:text-red-400">Error:</span>
                <span className="text-red-800 dark:text-red-200">{error}</span>
              </div>
              <Button onClick={fetchDuplicates} variant="outline" size="sm" className="mt-2">Try Again</Button>
            </div>
          </div>
        )}

        {!loading && !error && duplicates.length === 0 && (
          <div className="px-6 py-12 text-center">
            <Search size={48} className="mx-auto mb-4 text-gray-400" />
            <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-white">No duplicates found</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Immich isn&apos;t grouping anything as duplicate right now.
            </p>
          </div>
        )}

        {!loading && !error && duplicates.length > 0 && (
          <>
            {/* Wraps: with the Move-albums control shown (trash only) this row
                is wider than a ~1000px viewport, and without wrapping it pushed
                the group count and Clear-filters off the right edge and gave the
                whole page a horizontal scrollbar. */}
            <div className="flex flex-wrap items-center gap-3 border-b px-6 py-2">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search filename, path, location..."
                  value={searchInputText}
                  onChange={(e) => setSearchInputText(e.target.value)}
                  className="h-8 w-64 pl-8 text-sm"
                />
              </div>

              {/* Source chips. Cross-library only has anything in it once
                  partner comparison is on, so the chip says why when it's not. */}
              <div className="flex overflow-hidden rounded-md border">
                {sourceChips.map((chip) => (
                  <Button
                    key={chip.value}
                    variant={sourceFilter === chip.value ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 rounded-none border-0 px-2 text-xs"
                    onClick={() => setSourceFilter(chip.value)}
                    disabled={chip.value === 'cross-library' && !includePartners}
                    title={chip.value === 'cross-library' && !includePartners
                      ? 'Turn on "Compare against partner photos" in Options'
                      : undefined}
                  >
                    {chip.value === 'cross-library' && <Users size={11} className="mr-1" />}
                    {chip.label}
                  </Button>
                ))}
              </div>

              <AlbumFilterDropdown
                options={allAlbumOptions}
                selectedIds={selectedAlbumIds}
                onSelectionChange={setSelectedAlbumIds}
              />

              {disposition === 'trash' && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Move albums:</span>
                  <div className="flex overflow-hidden rounded-md border">
                    {(['always', 'ask', 'never'] as AlbumTransferMode[]).map((mode) => (
                      <Button
                        key={mode}
                        variant={albumTransferMode === mode ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-8 rounded-none border-0 px-2 text-xs capitalize"
                        onClick={() => handleAlbumTransferModeChange(mode)}
                      >
                        {mode}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex-1" />

              <span className="text-sm text-muted-foreground">
                {hasActiveFilters || skipped.size > 0
                  ? `Showing ${visibleDuplicates.length.toLocaleString()} of ${duplicates.length.toLocaleString()} groups`
                  : `${duplicates.length.toLocaleString()} groups`}
                {skipped.size > 0 && ` · ${skipped.size.toLocaleString()} skipped`}
              </span>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => {
                    setSearchInputText('')
                    setSearchText('')
                    setSelectedAlbumIds(new Set())
                    setSourceFilter('all')
                  }}
                >
                  <X size={14} className="mr-1" /> Clear filters
                </Button>
              )}
            </div>

            <div ref={containerRef} style={{ height: containerHeight }} className="overflow-hidden">
              <VirtualizedDuplicateList
                duplicates={visibleDuplicates}
                selectedAssets={selectedAssets}
                onAssetSelect={handleAssetSelect}
                onDeleteRecord={() => { /* whole-group delete is not offered here */ }}
                onKeepSelected={handleKeepSelected}
                onKeepAllInRecord={handleKeepAllInRecord}
                height={containerHeight}
                selectionMode={selectionMode}
                assetAlbums={assetAlbums}
                partnerMatches={partnerMatches}
                disposition={disposition}
                onSkipRecord={handleSkipRecord}
              />
            </div>
          </>
        )}
      </div>

      {isApplying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 dark:bg-gray-800">
            <div className="flex items-center gap-3">
              <Loader />
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">{applyLabel}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">This can take a moment on a large selection.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectionMode === 'keep' && keepModeInfo.groups > 0 && (
        <FloatingBar>
          <div className="flex w-full items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {keepModeInfo.groups.toLocaleString()} group{keepModeInfo.groups === 1 ? '' : 's'} decided
              {' · '}
              <strong className={keepModeInfo.discardCount === 0 ? 'text-amber-600 dark:text-amber-500' : 'text-foreground'}>
                {keepModeInfo.discardCount.toLocaleString()} to {actionVerb.toLowerCase()}
              </strong>
              {keepModeInfo.discardSize > 0 && disposition === 'trash' && <> ({humanizeBytes(keepModeInfo.discardSize)})</>}
              {keepModeInfo.partnerGroups > 0 && (
                <span className="ml-2 text-amber-600 dark:text-amber-500">
                  · {keepModeInfo.partnerGroups.toLocaleString()} keeping a partner&apos;s copy
                </span>
              )}
            </p>
            <AlertDialog
              title={
                disposition === 'tag' ? 'Tag the copies you didn\'t keep?'
                  : disposition === 'stack' ? 'Stack the decided groups?'
                    : 'Move the copies you didn\'t keep to trash?'
              }
              description={
                (disposition === 'tag'
                  ? `Tags ${keepModeInfo.discardCount.toLocaleString()} asset${keepModeInfo.discardCount === 1 ? '' : 's'} as "${tagName.trim() || DEFAULT_TAG_NAME}" across ${keepModeInfo.groups.toLocaleString()} group${keepModeInfo.groups === 1 ? '' : 's'}. Nothing is moved or removed.`
                  : disposition === 'stack'
                    ? `Collapses ${keepModeInfo.groups.toLocaleString()} group${keepModeInfo.groups === 1 ? '' : 's'} into one timeline entry each, behind the copy you kept. Nothing is removed, and you can unstack in Immich.`
                    : `Moves ${keepModeInfo.discardCount.toLocaleString()} asset${keepModeInfo.discardCount === 1 ? '' : 's'} across ${keepModeInfo.groups.toLocaleString()} group${keepModeInfo.groups === 1 ? '' : 's'} to Immich's trash`
                      + (keepModeInfo.discardSize > 0 ? `, freeing ${humanizeBytes(keepModeInfo.discardSize)} once you empty it` : '')
                      + '. They stay recoverable until then.')
                + (keepModeInfo.partnerGroups > 0 && disposition !== 'stack'
                  ? ` In ${keepModeInfo.partnerGroups.toLocaleString()} of them the keeper is a PARTNER's copy, so every copy you own in those groups goes, and you will be relying on their library for that photo.`
                  : '')
                + ' Groups with nothing picked are left alone.'
              }
              onConfirm={handleApplyKeepers}
              variant={info.destructive ? 'destructive' : 'default'}
              disabled={keepModeInfo.discardCount === 0}
            >
              <Button
                variant={info.destructive ? 'destructive' : 'default'}
                size="sm"
                disabled={keepModeInfo.discardCount === 0}
              >
                <ActionIcon className="mr-2 h-4 w-4" />
                {keepModeInfo.discardCount === 0
                  ? 'Nothing to apply'
                  : disposition === 'stack'
                    ? `Stack ${keepModeInfo.groups.toLocaleString()} group${keepModeInfo.groups === 1 ? '' : 's'}`
                    : `${actionVerb} ${keepModeInfo.discardCount.toLocaleString()} non-keeper${keepModeInfo.discardCount === 1 ? '' : 's'}`}
              </Button>
            </AlertDialog>
          </div>
        </FloatingBar>
      )}

      {selectionMode === 'discard' && (
        <FloatingBar>
          <div className="flex w-full items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {selectedAssets.size > 0
                ? <>{discardModeInfo.count.toLocaleString()} selected
                  {discardModeInfo.totalSize > 0 && disposition === 'trash' && <> ({humanizeBytes(discardModeInfo.totalSize)})</>}</>
                : 'No assets selected'}
            </p>
            <AlertDialog
              title={disposition === 'tag' ? 'Tag the selected assets?' : 'Move the selected assets to trash?'}
              description={
                disposition === 'tag'
                  ? `Tags ${discardModeInfo.count.toLocaleString()} selected asset${discardModeInfo.count === 1 ? '' : 's'} as "${tagName.trim() || DEFAULT_TAG_NAME}". Nothing is moved or removed.`
                  : `Moves ${discardModeInfo.count.toLocaleString()} selected asset${discardModeInfo.count === 1 ? '' : 's'} to Immich's trash`
                    + (discardModeInfo.totalSize > 0 ? `, freeing ${humanizeBytes(discardModeInfo.totalSize)} once you empty it` : '')
                    + '. They stay recoverable until then.'
              }
              onConfirm={handleApplyDiscards}
              variant={info.destructive ? 'destructive' : 'default'}
              disabled={selectedAssets.size === 0 || disposition === 'stack'}
            >
              <Button
                variant={info.destructive ? 'destructive' : 'default'}
                size="sm"
                disabled={selectedAssets.size === 0 || disposition === 'stack'}
                title={disposition === 'stack' ? 'Stacking needs a keeper — switch to Keep mode' : undefined}
              >
                <ActionIcon className="mr-2 h-4 w-4" />
                {disposition === 'stack' ? 'Switch to Keep mode to stack' : `${actionVerb} selected`}
              </Button>
            </AlertDialog>
          </div>
        </FloatingBar>
      )}

      {pendingDedup && (
        <AlbumTransferDialog
          open
          onClose={() => setPendingDedup(null)}
          albums={pendingDedup.albumsToTransfer}
          onSkip={() => {
            const { keptIds, discardedIds } = pendingDedup
            setPendingDedup(null)
            executeDedup(keptIds, discardedIds, [])
          }}
          onTransfer={(albumIds) => {
            const { keptIds, discardedIds } = pendingDedup
            setPendingDedup(null)
            executeDedup(keptIds, discardedIds, albumIds)
          }}
        />
      )}
    </PageLayout>
  )
}
