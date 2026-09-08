import { listDuplicates, deleteAssets, updateAssets, getAlbumsByAssetIds, IAssetAlbumInfo } from "@/handlers/api/asset.handler";
import { addAssetToAlbum } from "@/handlers/api/album.handler";
import { IDuplicateAssetRecord, IPartnerMatch } from "@/types/asset";
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import PageLayout from '@/components/layouts/PageLayout'
import Header from '@/components/shared/Header'
import VirtualizedDuplicateList from '@/components/assets/duplicate-assets/VirtualizedDuplicateList'
import AlbumTransferDialog from '@/components/assets/duplicate-assets/AlbumTransferDialog'
import AlbumFilterDropdown from '@/components/assets/duplicate-assets/AlbumFilterDropdown'
import DuplicateOptionsMenu, { IAutoPickSummary } from '@/components/assets/duplicate-assets/DuplicateOptionsMenu'
import Loader from '@/components/ui/loader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FolderSync, RefreshCw, Search, Shield, Trash2, X, Zap } from 'lucide-react'
import FloatingBar from '@/components/shared/FloatingBar'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import API from '@/lib/api'
import { toast } from '@/components/ui/use-toast'
import { humanizeBytes } from '@/helpers/string.helper'

type AlbumTransferMode = 'always' | 'never' | 'ask';

/** Remembered per browser, same as this app's other view preferences. */
const INCLUDE_PARTNERS_KEY = 'duplicates_include_partners';
const PARTNERS_CAN_WIN_KEY = 'duplicates_partners_can_win';

interface PendingDedup {
  keptIds: string[];
  discardedIds: string[];
  albumsToTransfer: IAssetAlbumInfo[];
}

export default function BulkDuplicatePage() {
  const [duplicates, setDuplicates] = useState<IDuplicateAssetRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number>(-1);
  const [containerHeight, setContainerHeight] = useState<number>(600);
  const [selectionMode, setSelectionMode] = useState<'keep' | 'discard'>('keep');
  const [assetAlbums, setAssetAlbums] = useState<Record<string, IAssetAlbumInfo[]>>({});
  const [albumTransferMode, setAlbumTransferMode] = useState<AlbumTransferMode>('always');
  const [pendingDedup, setPendingDedup] = useState<PendingDedup | null>(null);
  const [searchInputText, setSearchInputText] = useState('');
  const [searchText, setSearchText] = useState('');
  const [selectedAlbumIds, setSelectedAlbumIds] = useState<Set<string>>(new Set());
  const [includePartners, setIncludePartnersState] = useState(false);
  const [partnerScanning, setPartnerScanning] = useState(false);
  const [autoPicking, setAutoPicking] = useState(false);
  const [partnersCanWin, setPartnersCanWinState] = useState(false);
  // Hydrated after mount rather than in the initial state: localStorage does
  // not exist during SSR, and reading it inline would mismatch the server HTML.
  useEffect(() => {
    if (localStorage.getItem(INCLUDE_PARTNERS_KEY) === 'true') setIncludePartnersState(true);
    if (localStorage.getItem(PARTNERS_CAN_WIN_KEY) === 'true') setPartnersCanWinState(true);
  }, []);
  const setPartnersCanWin = useCallback((value: boolean) => {
    setPartnersCanWinState(value);
    try { localStorage.setItem(PARTNERS_CAN_WIN_KEY, String(value)); } catch { /* storage disabled */ }
  }, []);
  const setIncludePartners = useCallback((value: boolean) => {
    setIncludePartnersState(value);
    try {
      localStorage.setItem(INCLUDE_PARTNERS_KEY, String(value));
    } catch {
      // Private browsing / storage disabled — the toggle still works, it just
      // won't be remembered.
    }
  }, []);
  const [autoPickSummary, setAutoPickSummary] = useState<IAutoPickSummary | null>(null);
  const [partnerMatches, setPartnerMatches] = useState<Record<string, IPartnerMatch[]>>({});
  const [partnerProgress, setPartnerProgress] = useState<{ done: number; total: number } | null>(null);
  /** Ids of every partner copy on screen. They can be chosen as a keeper but
   *  belong to another user, so they must be kept out of every write. */
  const partnerAssetIds = useMemo(
    () => new Set(Object.values(partnerMatches).flat().map((m) => m.id)),
    [partnerMatches]
  );
  /** Bumped to abandon an in-flight partner scan (toggle off, or refetch). */
  const partnerScanToken = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load album move mode from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('duplicateFinderAlbumTransfer');
    if (saved === 'always' || saved === 'never' || saved === 'ask') {
      setAlbumTransferMode(saved);
    }
  }, []);

  // Debounce search text
  useEffect(() => {
    const timer = setTimeout(() => setSearchText(searchInputText), 200);
    return () => clearTimeout(timer);
  }, [searchInputText]);

  const handleAlbumTransferModeChange = (mode: AlbumTransferMode) => {
    setAlbumTransferMode(mode);
    localStorage.setItem('duplicateFinderAlbumTransfer', mode);
  };

  const fetchDuplicates = async () => {
    setLoading(true);
    setError(null);
    try {
      const duplicates = await listDuplicates();
      setDuplicates(duplicates);
      setSelectedAssets(new Set()); // Clear selection when refetching
      setSearchInputText('');
      setSearchText('');
      setSelectedAlbumIds(new Set());

      // Fetch album data for all assets
      const allIds = duplicates.flatMap((r: IDuplicateAssetRecord) => r.assets.map(a => a.id));
      if (allIds.length > 0) {
        const albums = await getAlbumsByAssetIds(allIds);
        setAssetAlbums(albums);
      } else {
        setAssetAlbums({});
      }
    } catch (error: any) {
      setError(error.message || 'Failed to load duplicate assets');
      toast({
        title: "Error",
        description: "Failed to load duplicate assets. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDuplicates();
  }, []);

  // Handle container height calculation and resize
  useEffect(() => {
    const updateHeight = () => {
      // Calculate available height: full viewport minus header (48px) and filter bar (48px)
      const viewportHeight = window.innerHeight;
      const headerHeight = 48; // h-12 = 48px
      const filterBarHeight = duplicates.length > 0 ? 48 : 0;
      const availableHeight = viewportHeight - headerHeight - filterBarHeight;
      setContainerHeight(availableHeight);
    };

    // Initial calculation
    updateHeight();

    // Update on window resize
    window.addEventListener('resize', updateHeight);

    // Cleanup
    return () => {
      window.removeEventListener('resize', updateHeight);
    };
  }, [duplicates]); // Re-calculate when duplicates change

  // Handle Escape key to unselect all
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedAssets.size > 0) {
        setSelectedAssets(new Set());
        setLastSelectedIndex(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedAssets.size]);

  // Derive unique album options from assetAlbums
  const allAlbumOptions = useMemo(() => {
    const seen = new Map<string, string>();
    Object.values(assetAlbums).forEach(albums => {
      albums.forEach(a => {
        if (!seen.has(a.albumId)) {
          seen.set(a.albumId, a.albumName);
        }
      });
    });
    return Array.from(seen, ([value, label]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [assetAlbums]);

  const hasActiveFilters = searchText.length > 0 || selectedAlbumIds.size > 0;

  // Filter duplicates based on search text and album selection
  const filteredDuplicates = useMemo(() => {
    if (!hasActiveFilters) return duplicates;

    const lowerSearch = searchText.toLowerCase();

    return duplicates.filter(record =>
      record.assets.some(asset => {
        // Text filter
        if (searchText.length > 0) {
          const fields = [
            asset.originalFileName,
            asset.originalPath,
            asset.exifInfo?.city,
            asset.exifInfo?.state,
            asset.exifInfo?.country,
            asset.exifInfo?.description,
          ];
          const textMatch = fields.some(
            f => f && f.toLowerCase().includes(lowerSearch)
          );
          if (!textMatch) return false;
        }

        // Album filter
        if (selectedAlbumIds.size > 0) {
          const assetAlbumList = assetAlbums[asset.id] || [];
          const albumMatch = assetAlbumList.some(a => selectedAlbumIds.has(a.albumId));
          if (!albumMatch) return false;
        }

        return true;
      })
    );
  }, [duplicates, searchText, selectedAlbumIds, assetAlbums]);

  // Reset lastSelectedIndex when filter inputs change
  useEffect(() => {
    setLastSelectedIndex(-1);
  }, [searchText, selectedAlbumIds]);

  // Flatten all asset IDs for selection operations (from filtered view)
  const allAssetIds = useMemo(() => {
    return filteredDuplicates.flatMap(record => record.assets.map(asset => asset.id));
  }, [filteredDuplicates]);

  // Calculate selected assets info for discard mode
  const selectedAssetsInfo = useMemo(() => {
    if (selectionMode !== 'discard' || selectedAssets.size === 0) {
      return { count: 0, totalSize: 0 };
    }

    let count = 0;
    let totalSize = 0;

    duplicates.forEach(record => {
      record.assets.forEach(asset => {
        if (selectedAssets.has(asset.id)) {
          count++;
          totalSize += asset.exifInfo.fileSizeInByte;
        }
      });
    });

    return { count, totalSize };
  }, [duplicates, selectedAssets, selectionMode]);

  // In discard mode a ticked card means "delete this", which can never be true
  // of a partner's photo — so a keeper picked in keep mode is dropped on the
  // way out rather than silently changing meaning.
  useEffect(() => {
    if (selectionMode === 'keep' || partnerAssetIds.size === 0) return;
    setSelectedAssets((prev) => {
      const next = new Set([...prev].filter((id) => !partnerAssetIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectionMode, partnerAssetIds]);

  const handleAssetSelect = useCallback((assetId: string, isShiftClick?: boolean) => {
    setSelectedAssets(prev => {
      const newSelection = new Set(prev);

      if (isShiftClick && lastSelectedIndex >= 0) {
        // Find the indices of the current and last selected assets
        const currentIndex = allAssetIds.indexOf(assetId);
        const start = Math.min(lastSelectedIndex, currentIndex);
        const end = Math.max(lastSelectedIndex, currentIndex);

        // Select all assets between the two indices
        for (let i = start; i <= end; i++) {
          newSelection.add(allAssetIds[i]);
        }
        setLastSelectedIndex(currentIndex);
      } else {
        // Regular selection toggle
        if (newSelection.has(assetId)) {
          newSelection.delete(assetId);
        } else {
          newSelection.add(assetId);
        }
        setLastSelectedIndex(allAssetIds.indexOf(assetId));
      }

      return newSelection;
    });
  }, [allAssetIds, lastSelectedIndex]);



  const handleDeleteRecord = async (record: IDuplicateAssetRecord) => {
    setIsDeleting(true);
    try {
      const assetIds = record.assets.map(asset => asset.id);
      const totalSize = record.assets.reduce((sum, asset) => sum + asset.exifInfo.fileSizeInByte, 0);
      await deleteAssets(assetIds);

      // Remove the entire record from duplicates
      setDuplicates(prev => prev.filter(r => r.duplicateId !== record.duplicateId));

      // Remove any selected assets from this record
      setSelectedAssets(prev => {
        const newSelection = new Set(prev);
        assetIds.forEach(id => newSelection.delete(id));
        return newSelection;
      });

      setLastSelectedIndex(-1);

      toast({
        title: "Success",
        description: `Successfully deleted ${record.assets.length} duplicate assets and saved ${humanizeBytes(totalSize)} of storage.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete assets. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleKeepAllInRecord = useCallback(async (record: IDuplicateAssetRecord) => {
    setIsDeleting(true);
    try {
      const assetIds = record.assets.map(asset => asset.id);

      // Update assets to remove duplicateId (set to null)
      await updateAssets({
        ids: assetIds,
        duplicateId: null
      });

      // Remove the entire record from duplicates
      setDuplicates(prev => prev.filter(r => r.duplicateId !== record.duplicateId));

      // Remove any selected assets from this record
      setSelectedAssets(prev => {
        const newSelection = new Set(prev);
        assetIds.forEach(id => newSelection.delete(id));
        return newSelection;
      });

      setLastSelectedIndex(-1);

      toast({
        title: "Success",
        description: `Successfully kept ${record.assets.length} assets. They will no longer appear as duplicates.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to keep assets. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }, [duplicates]);

  const handleAutoSelect = (criteria: 'lowest-quality' | 'smallest-size') => {
    const newSelection = new Set<string>();

    filteredDuplicates.forEach(record => {
      if (record.assets.length <= 1) return; // Skip if only one asset
      
      let selectedAsset = record.assets[0];
      
      for (let i = 1; i < record.assets.length; i++) {
        const currentAsset = record.assets[i];
        
        if (criteria === 'lowest-quality') {
          // Compare by resolution (width * height) - select lowest
          const currentResolution = currentAsset.exifInfo.exifImageWidth * currentAsset.exifInfo.exifImageHeight;
          const selectedResolution = selectedAsset.exifInfo.exifImageWidth * selectedAsset.exifInfo.exifImageHeight;
          
          if (currentResolution < selectedResolution) {
            selectedAsset = currentAsset;
          }
        } else if (criteria === 'smallest-size') {
          // Compare by file size - select smallest
          if (currentAsset.exifInfo.fileSizeInByte < selectedAsset.exifInfo.fileSizeInByte) {
            selectedAsset = currentAsset;
          }
        }
      }
      
      newSelection.add(selectedAsset.id);
    });
    
    setSelectedAssets(newSelection);
    setLastSelectedIndex(-1);
    
    const criteriaText = {
      'lowest-quality': 'lowest quality',
      'smallest-size': 'smallest size'
    }[criteria];
    
    toast({
      title: "Auto-selection complete",
      description: `Selected ${newSelection.size} assets based on ${criteriaText} criteria.`,
    });
  };

  // Compute albums that are only on discarded assets (not already on kept assets)
  const getAlbumsToTransfer = useCallback((keptIds: string[], discardedIds: string[]): IAssetAlbumInfo[] => {
    const keptAlbumIds = new Set<string>();
    keptIds.forEach(id => {
      (assetAlbums[id] || []).forEach(a => keptAlbumIds.add(a.albumId));
    });

    const seen = new Set<string>();
    const result: IAssetAlbumInfo[] = [];
    discardedIds.forEach(id => {
      (assetAlbums[id] || []).forEach(a => {
        if (!keptAlbumIds.has(a.albumId) && !seen.has(a.albumId)) {
          seen.add(a.albumId);
          result.push(a);
        }
      });
    });
    return result;
  }, [assetAlbums]);

  // Core dedup execution: move albums then delete
  const executeDedup = async (
    keptIds: string[],
    discardedIds: string[],
    albumIdsToTransfer: string[]
  ) => {
    setIsDeleting(true);
    try {
      // Move albums to kept assets (only add each asset to albums it's not already in)
      const transferCalls: Promise<unknown>[] = [];
      const albumIdsToTransferSet = new Set(albumIdsToTransfer);
      for (const albumId of albumIdsToTransferSet) {
        const assetsToAdd = keptIds.filter(id => {
          const existing = assetAlbums[id] || [];
          return !existing.some(a => a.albumId === albumId);
        });
        if (assetsToAdd.length > 0) {
          transferCalls.push(addAssetToAlbum(albumId, assetsToAdd));
        }
      }
      await Promise.all(transferCalls);

      // Mark kept assets as non-duplicate. A partner's copy can be the keeper,
      // but it is not ours to write to: Immich's bulk update requires
      // AssetUpdate on every id and THROWS on the first one it is refused,
      // which would abort the whole dedup. (Album add above is safe by
      // contrast -- it reports per-asset failures instead of throwing.)
      const ownKeptIds = keptIds.filter((id) => !partnerAssetIds.has(id));
      if (ownKeptIds.length > 0) {
        await updateAssets({ ids: ownKeptIds, duplicateId: null });
      }

      // Belt and braces: nothing that isn't ours ever reaches a delete. The
      // selection paths already exclude partner copies from discard, so this
      // should be a no-op -- it is here so that stays true if they change.
      const deletableIds = discardedIds.filter((id) => !partnerAssetIds.has(id));
      if (deletableIds.length > 0) {
        await deleteAssets(deletableIds);
      }

      const removedIds = new Set([...keptIds, ...discardedIds]);
      let discardedSize = 0;
      const discardedSet = new Set(discardedIds);
      duplicates.forEach(r => r.assets.forEach(a => {
        if (discardedSet.has(a.id)) discardedSize += a.exifInfo.fileSizeInByte;
      }));

      setDuplicates(prev =>
        prev.map(r => ({
          ...r,
          assets: r.assets.filter(a => !removedIds.has(a.id))
        })).filter(r => r.assets.length > 0)
      );

      setSelectedAssets(prev => {
        const next = new Set(prev);
        removedIds.forEach(id => next.delete(id));
        return next;
      });
      setLastSelectedIndex(-1);

      const transferMsg = albumIdsToTransfer.length > 0
        ? ` Moved ${albumIdsToTransfer.length} album(s).`
        : '';

      toast({
        title: "Success",
        description: `Kept ${keptIds.length} asset(s), deleted ${discardedIds.length}.${transferMsg}${discardedSize > 0 ? ` Saved ${humanizeBytes(discardedSize)}.` : ''}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to process assets. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Core dedup execution wrapped in useCallback to avoid stale closures
  const executeDedupCb = useCallback(executeDedup, []);

  // Initiate dedup with album move logic
  const initiateDedup = useCallback((
    keptIds: string[],
    discardedIds: string[]
  ) => {
    const albumsToTransfer = getAlbumsToTransfer(keptIds, discardedIds);

    if (albumsToTransfer.length === 0 || albumTransferMode === 'never') {
      executeDedupCb(keptIds, discardedIds, []);
    } else if (albumTransferMode === 'always') {
      executeDedupCb(keptIds, discardedIds, albumsToTransfer.map(a => a.albumId));
    } else {
      // 'ask' mode
      setPendingDedup({ keptIds, discardedIds, albumsToTransfer });
    }
  }, [albumTransferMode, getAlbumsToTransfer, executeDedupCb]);

  // Partner scan. Each match is a vector probe (~17ms), so a whole library
  // would take minutes — walk the groups in batches instead, showing results as
  // they land, and abandon the walk if the toggle goes off or the data reloads.
  useEffect(() => {
    partnerScanToken.current += 1;
    const token = partnerScanToken.current;

    if (!includePartners) {
      setPartnerScanning(false);
      setPartnerProgress(null);
      setPartnerMatches({});
      return;
    }

    // One representative per group is enough: copies within a group are
    // near-identical, so a partner match for one is a match for the group.
    const reps = duplicates
      .map((record) => record.assets[0]?.id)
      .filter((id): id is string => !!id);
    if (reps.length === 0) return;

    const BATCH = 100;
    let cancelled = false;

    (async () => {
      setPartnerScanning(true);
      setPartnerProgress({ done: 0, total: reps.length });
      try {
        for (let i = 0; i < reps.length; i += BATCH) {
          if (cancelled || partnerScanToken.current !== token) return;
          const batch = reps.slice(i, i + BATCH);
          const res = await API.post('/api/assets/duplicates/partner-matches', { assetIds: batch });
          if (cancelled || partnerScanToken.current !== token) return;
          if (res?.matches && Object.keys(res.matches).length) {
            setPartnerMatches((prev) => ({ ...prev, ...res.matches }));
          }
          setPartnerProgress({ done: Math.min(i + BATCH, reps.length), total: reps.length });
        }
      } catch (e: any) {
        if (!cancelled && partnerScanToken.current === token) {
          toast({ title: 'Partner scan failed', description: e?.message || 'Unknown error', variant: 'destructive' });
        }
      } finally {
        if (partnerScanToken.current === token) {
          setPartnerScanning(false);
          setPartnerProgress(null);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [includePartners, duplicates]);

  /** Fill in a proposed keeper per group. Never deletes, and never touches a
   *  group the user has already decided — re-running is safe and idempotent. */
  const handleAutoPick = useCallback(async () => {
    setAutoPicking(true);
    try {
      // A group counts as decided if either one of your copies OR a partner's
      // copy has been picked — otherwise auto-pick would add a second keeper
      // to a group you had already settled on the partner's copy.
      const groupsToPick = filteredDuplicates.filter((record) => {
        const ownPicked = record.assets.some((a) => selectedAssets.has(a.id));
        const partnerPicked = record.assets.some((a) =>
          (partnerMatches[a.id] || []).some((m) => selectedAssets.has(m.id))
        );
        return !ownPicked && !partnerPicked;
      });
      const skipped = filteredDuplicates.length - groupsToPick.length;

      // Partner copies only enter the ranking when the user has asked for it —
      // a partner winning discards every copy they own in that group.
      const letPartnersWin = includePartners && partnersCanWin;
      const payloadGroups = groupsToPick.map((record) => ({
        duplicateId: record.duplicateId,
        assetIds: record.assets.map((a) => a.id),
        partnerAssetIds: letPartnersWin
          ? Array.from(new Set(record.assets.flatMap((a) => (partnerMatches[a.id] || []).map((m) => m.id))))
          : [],
      }));
      const assetIds = payloadGroups.flatMap((g) => [...g.assetIds, ...g.partnerAssetIds]);

      if (assetIds.length === 0) {
        setAutoPickSummary({ picked: 0, undecided: 0, weakTiebreak: 0, skipped, partnerWins: 0 });
        toast({ title: 'Nothing to pick', description: 'Every visible group has already been decided.' });
        return;
      }

      // Batched: a full library here is ~27k ids, which is about 1.01MB of
      // JSON and lands just over Next's 1MB request-body limit — the whole
      // call was being rejected before it reached the handler.
      const BATCH = 500; // groups per request
      const keeperIds: string[] = [];
      let undecidedCount = 0;
      let weakCount = 0;
      let partnerWins = 0;
      for (let i = 0; i < payloadGroups.length; i += BATCH) {
        const res = await API.post('/api/assets/duplicates/auto-pick', {
          groups: payloadGroups.slice(i, i + BATCH),
        });
        keeperIds.push(...Object.values<string>(res.keepers || {}));
        undecidedCount += (res.undecided || []).length;
        weakCount += (res.weakTiebreak || []).length;
        partnerWins += (res.partnerKeepers || []).length;
      }

      // Auto-pick chooses keepers, so the page has to be reading the selection
      // as "keep these" for the result to mean what it says.
      setSelectionMode('keep');
      setSelectedAssets((prev) => {
        const next = new Set(prev);
        keeperIds.forEach((id) => next.add(id));
        return next;
      });

      const undecided = undecidedCount;
      setAutoPickSummary({ picked: keeperIds.length, undecided, weakTiebreak: weakCount, skipped, partnerWins });
      toast({
        title: 'Keepers picked',
        description: `${keeperIds.length.toLocaleString()} picked${partnerWins ? `, ${partnerWins.toLocaleString()} keeping a partner's copy` : ''}${weakCount ? `, ${weakCount.toLocaleString()} on a tiebreak` : ''}. Nothing deleted — review, then act.`,
      });
    } catch (e: any) {
      toast({ title: 'Auto-pick failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setAutoPicking(false);
    }
  }, [filteredDuplicates, selectedAssets, partnerMatches, includePartners, partnersCanWin]);

  /** In keep mode, every group that has a keeper picked: what would be
   *  discarded if the user applied it. Groups with no pick are untouched. */
  const keepModeInfo = useMemo(() => {
    if (selectionMode !== 'keep') return { groups: 0, discardCount: 0, discardSize: 0, partnerGroups: 0 };
    let groups = 0, discardCount = 0, discardSize = 0, partnerGroups = 0;
    for (const record of filteredDuplicates) {
      const ownKept = record.assets.filter((a) => selectedAssets.has(a.id));
      const partnerKept = record.assets.flatMap((a) =>
        (partnerMatches[a.id] || []).filter((m) => selectedAssets.has(m.id))
      );
      if (ownKept.length === 0 && partnerKept.length === 0) continue;
      groups++;
      if (ownKept.length === 0) partnerGroups++;
      for (const a of record.assets) {
        if (selectedAssets.has(a.id)) continue;
        discardCount++;
        discardSize += a.exifInfo?.fileSizeInByte || 0;
      }
    }
    return { groups, discardCount, discardSize, partnerGroups };
  }, [selectionMode, filteredDuplicates, selectedAssets, partnerMatches]);

  /** Apply every picked keeper at once. Without this, auto-picking thousands of
   *  groups would leave the user clicking each one. */
  const handleDiscardNonKeepers = async () => {
    const keptIds: string[] = [];
    const discardedIds: string[] = [];
    for (const record of filteredDuplicates) {
      const ownKept = record.assets.filter((a) => selectedAssets.has(a.id)).map((a) => a.id);
      const partnerKept = Array.from(new Set(record.assets.flatMap((a) =>
        (partnerMatches[a.id] || []).filter((m) => selectedAssets.has(m.id)).map((m) => m.id)
      )));
      if (ownKept.length === 0 && partnerKept.length === 0) continue;
      keptIds.push(...ownKept, ...partnerKept);
      discardedIds.push(...record.assets.filter((a) => !selectedAssets.has(a.id)).map((a) => a.id));
    }
    if (discardedIds.length === 0) return;
    initiateDedup(keptIds, discardedIds);
  };

  const handleDeleteAllSelected = async () => {
    if (selectedAssets.size === 0 || selectionMode !== 'discard') return;

    const selectedAssetIds = Array.from(selectedAssets).filter((id) => !partnerAssetIds.has(id));

    // In discard mode, the selected assets are discarded, the rest are kept
    const keptIds: string[] = [];
    filteredDuplicates.forEach(record => {
      record.assets.forEach(asset => {
        if (!selectedAssets.has(asset.id)) {
          keptIds.push(asset.id);
        }
      });
    });

    initiateDedup(keptIds, selectedAssetIds);
  };

  const handleKeepSelected = async (_record: IDuplicateAssetRecord, keptIds: string[], discardedIds: string[]) => {
    initiateDedup(keptIds, discardedIds);
  };



  return (
    <PageLayout>
      <Header
        leftComponent="Bulk Duplicate Finder"
        rightComponent={
          <div className="flex items-center gap-4">

            {/* Selection Mode Button Group */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Select to:
              </span>
              <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                <Button
                  variant={selectionMode === 'keep' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setSelectionMode('keep')}
                  className={`rounded-none border-0 ${
                    selectionMode === 'keep' 
                      ? 'bg-green-600 hover:bg-green-700 text-white' 
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Shield size={14} className="mr-1" />
                  Keep
                </Button>
                <Button
                  variant={selectionMode === 'discard' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setSelectionMode('discard')}
                  className={`rounded-none border-0 ${
                    selectionMode === 'discard' 
                      ? 'bg-red-600 hover:bg-red-700 text-white' 
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Trash2 size={14} className="mr-1" />
                  Discard
                </Button>
              </div>
            </div>

            {/* Album Move Mode Button Group */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                <FolderSync size={14} className="inline mr-1" />
                Move Albums:
              </span>
              <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                <Button
                  variant={albumTransferMode === 'always' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handleAlbumTransferModeChange('always')}
                  className="rounded-none border-0"
                >
                  Always
                </Button>
                <Button
                  variant={albumTransferMode === 'ask' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handleAlbumTransferModeChange('ask')}
                  className="rounded-none border-0"
                >
                  Ask
                </Button>
                <Button
                  variant={albumTransferMode === 'never' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handleAlbumTransferModeChange('never')}
                  className="rounded-none border-0"
                >
                  Never
                </Button>
              </div>
            </div>

            <DuplicateOptionsMenu
              includePartners={includePartners}
              onIncludePartnersChange={setIncludePartners}
              partnersCanWin={partnersCanWin}
              onPartnersCanWinChange={setPartnersCanWin}
              partnerScanning={partnerScanning}
              partnerProgress={partnerProgress}
              onAutoPick={handleAutoPick}
              autoPicking={autoPicking}
              autoPickSummary={autoPickSummary}
              disabled={loading || duplicates.length === 0}
            />

            {/* Refresh Button */}
            <Button
              onClick={fetchDuplicates}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="h-full overflow-hidden">
        {/* Description - only show when loading or no duplicates */}
        {(loading || error || duplicates.length === 0) && (
          <div className="p-6 pb-0">
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Manage and remove duplicate assets from your library
            </p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12 px-6">
            <Loader />
            <span className="ml-2 text-gray-600 dark:text-gray-400">
              Scanning for duplicate assets...
            </span>
          </div>
        )}

        {error && (
          <div className="px-6">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2">
                <span className="text-red-600 dark:text-red-400">Error:</span>
                <span className="text-red-800 dark:text-red-200">{error}</span>
              </div>
              <Button
                onClick={fetchDuplicates}
                variant="outline"
                size="sm"
                className="mt-2"
              >
                Try Again
              </Button>
            </div>
          </div>
        )}

        {!loading && !error && duplicates.length === 0 && (
          <div className="text-center py-12 px-6">
            <Search size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No duplicates found
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Great! No duplicate assets were detected in your library.
            </p>
          </div>
        )}

        {!loading && !error && duplicates.length > 0 && (
          <>
            {/* Filter bar */}
            <div className="flex items-center gap-3 px-6 py-2 border-b">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search filename, path, location..."
                  value={searchInputText}
                  onChange={e => setSearchInputText(e.target.value)}
                  className="w-64 pl-8 h-8 text-sm"
                />
              </div>
              <AlbumFilterDropdown
                options={allAlbumOptions}
                selectedIds={selectedAlbumIds}
                onSelectionChange={setSelectedAlbumIds}
              />
              <div className="flex-1" />
              <span className="text-sm text-muted-foreground">
                {hasActiveFilters
                  ? `Showing ${filteredDuplicates.length} of ${duplicates.length} groups`
                  : `${duplicates.length} groups`}
              </span>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => {
                    setSearchInputText('');
                    setSearchText('');
                    setSelectedAlbumIds(new Set());
                  }}
                >
                  <X size={14} className="mr-1" />
                  Clear filters
                </Button>
              )}
            </div>
            <div ref={containerRef} style={{ height: containerHeight }} className="overflow-hidden">
              <VirtualizedDuplicateList
                duplicates={filteredDuplicates}
                selectedAssets={selectedAssets}
                onAssetSelect={handleAssetSelect}
                onDeleteRecord={handleDeleteRecord}
                onKeepSelected={handleKeepSelected}
                onKeepAllInRecord={handleKeepAllInRecord}
                height={containerHeight}
                selectionMode={selectionMode}
                assetAlbums={assetAlbums}
                partnerMatches={partnerMatches}
              />
            </div>
          </>
        )}
      </div>



      {isDeleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3">
              <Loader />
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">
                  Deleting Assets
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Removing duplicate assets...
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectionMode === 'keep' && keepModeInfo.groups > 0 && (
        <FloatingBar>
          <div className="flex items-center gap-4 justify-between w-full">
            <p className="text-sm text-muted-foreground">
              {keepModeInfo.groups.toLocaleString()} group{keepModeInfo.groups === 1 ? '' : 's'} decided
              {' · '}{keepModeInfo.discardCount.toLocaleString()} to discard
              {keepModeInfo.discardSize > 0 && <> ({humanizeBytes(keepModeInfo.discardSize)})</>}
              {keepModeInfo.partnerGroups > 0 && (
                <span className="ml-2 text-amber-600 dark:text-amber-500">
                  · {keepModeInfo.partnerGroups.toLocaleString()} keeping a partner&apos;s copy
                </span>
              )}
            </p>
            <AlertDialog
              title="Discard the copies you didn't keep?"
              description={
                `This deletes ${keepModeInfo.discardCount.toLocaleString()} asset${keepModeInfo.discardCount === 1 ? '' : 's'} across ` +
                `${keepModeInfo.groups.toLocaleString()} group${keepModeInfo.groups === 1 ? '' : 's'}` +
                (keepModeInfo.discardSize > 0 ? `, saving ${humanizeBytes(keepModeInfo.discardSize)}` : '') +
                (keepModeInfo.partnerGroups > 0
                  ? `. In ${keepModeInfo.partnerGroups.toLocaleString()} of them the keeper is a PARTNER's copy, so every copy you own in those groups is deleted and you will be relying on their library for that photo.`
                  : '.') +
                ' Groups with nothing picked are left alone. This cannot be undone.'
              }
              onConfirm={handleDiscardNonKeepers}
              variant="destructive"
            >
              <Button variant="destructive" size="sm">
                <Trash2 className="w-4 h-4 mr-2" />
                Discard non-keepers
              </Button>
            </AlertDialog>
          </div>
        </FloatingBar>
      )}

      {selectionMode === 'discard' && (
        <FloatingBar>
          <div className="flex items-center gap-4 justify-between w-full">
            <div className="flex items-center gap-4">
              <p className="text-sm text-muted-foreground">
                {selectedAssets.size > 0 ? (
                  <>
                    {selectedAssetsInfo.count} Selected
                    {selectedAssetsInfo.totalSize > 0 && (
                      <span className="ml-2">
                        ({humanizeBytes(selectedAssetsInfo.totalSize)})
                        Savings
                      </span>
                    )}
                  </>
                ) : (
                  "No assets selected"
                )}
              </p>
              
              {/* Auto-select Dropdown */}
              
            </div>
            
            <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
                <Select onValueChange={handleAutoSelect}>
                  <SelectTrigger className="w-40 h-8">
                    <SelectValue placeholder="Auto-select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lowest-quality">
                      Select lowest quality
                    </SelectItem>
                    <SelectItem value="smallest-size">
                      Select smallest size
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <AlertDialog
                title="Delete the selected assets?"
                description={`This action will delete ${selectedAssetsInfo.count} selected asset${selectedAssetsInfo.count !== 1 ? 's' : ''}${selectedAssetsInfo.totalSize > 0 ? ` and save ${humanizeBytes(selectedAssetsInfo.totalSize)} of storage` : ''}. This action cannot be undone.`}
                onConfirm={handleDeleteAllSelected}
                disabled={selectedAssets.size === 0}
              >
                <Button 
                  variant={"destructive"} 
                  size={"sm"} 
                  disabled={selectedAssets.size === 0}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </AlertDialog>
            </div>
          </div>
        </FloatingBar>
      )}

      {pendingDedup && (
        <AlbumTransferDialog
          open={true}
          onClose={() => setPendingDedup(null)}
          albums={pendingDedup.albumsToTransfer}
          onSkip={() => {
            const { keptIds, discardedIds } = pendingDedup;
            setPendingDedup(null);
            executeDedup(keptIds, discardedIds, []);
          }}
          onTransfer={(albumIds) => {
            const { keptIds, discardedIds } = pendingDedup;
            setPendingDedup(null);
            executeDedup(keptIds, discardedIds, albumIds);
          }}
        />
      )}
    </PageLayout>
  )
}
