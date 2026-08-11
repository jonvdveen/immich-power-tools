import "react-photo-album/rows.css";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, CheckCircle2, ChevronLeft, ChevronRight, Circle, ExternalLink, Filter, Glasses, Heart,
  Image as ImageIcon, Info, Layers, LayoutGrid, Loader2, SortAsc, SortDesc, Star, Trash2, Video, X,
  XCircle,
} from "lucide-react";
import { RowsPhotoAlbum } from "react-photo-album";
import type { RenderImageContext, RenderImageProps } from "react-photo-album";

import ExifPanel from "@/components/cull/ExifPanel";
import HelpGuide from "@/components/cull/HelpGuide";
import ShortcutSettings from "@/components/cull/ShortcutSettings";
import PageLayout from "@/components/layouts/PageLayout";
import AddToAlbumButton from "@/components/shared/AddToAlbumButton";
import type { AssetPhoto } from "@/components/shared/AssetGrid";
import FloatingBar from "@/components/shared/FloatingBar";
import Header from "@/components/shared/Header";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LazyGridImage from "@/components/ui/lazy-grid-image";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { useConfig } from "@/contexts/ConfigContext";
import { listAlbums } from "@/handlers/api/album.handler";
import { deleteAssets, updateAssets } from "@/handlers/api/asset.handler";
import {
  addTagToAssets, ensureCullTags, ICullAsset, ICullPickStatus, ICullRatingComparator,
  ICullReviewStatus, listCullAssets, removeTagFromAssets,
} from "@/handlers/api/cull.handler";
import { cn } from "@/lib/utils";
import { ASSET_PREVIEW_PATH, ASSET_THUMBNAIL_PATH, ASSET_VIDEO_PATH } from "@/config/routes";
import {
  displayKey, ICullShortcutAction, keyMatches, loadCullShortcuts, saveCullShortcuts,
} from "@/lib/cull/shortcuts";
import { IAlbum } from "@/types/album";

const PAGE_SIZE = 200;

// --- display-size preferences (per-browser, like the People Manager grid
// slider and this app's other UI prefs). The grid slider drives the justified
// row height; the control-size tier scales the action bars (bulk + viewer) and
// the per-thumbnail badges so older eyes / big or high-DPI displays aren't
// stuck with tiny fixed-pixel chrome. ---
const CULL_ROW_HEIGHT_KEY = "cull_grid_row_height";
const CULL_CONTROL_SIZE_KEY = "cull_control_size";
const ROW_HEIGHT_MIN = 90;
const ROW_HEIGHT_MAX = 340;
const ROW_HEIGHT_DEFAULT = 150;

// "md" is the baseline and must match the app's shared primitives, which all
// stand 36px tall (Button `h-9 px-4`, SelectTrigger `h-9`, Input `h-9`) with
// 16px lucide icons — that's what the original modules render, and this tool
// looked a step small next to them because it started at h-7/15px.
type CullControlSize = "md" | "lg" | "xl";
const CONTROL_SIZES: Record<CullControlSize, {
  icon: number; star: number; vstar: number; hint: number; btn: string; pad: string; label: string;
}> = {
  md: { icon: 16, star: 18, vstar: 24, hint: 11, btn: "h-9 px-3",  pad: "p-2",   label: "Normal controls" },
  lg: { icon: 20, star: 22, vstar: 31, hint: 12, btn: "h-11 px-4", pad: "p-2.5", label: "Large controls" },
  xl: { icon: 26, star: 28, vstar: 39, hint: 14, btn: "h-14 px-5", pad: "p-3",   label: "Extra-large controls" },
};

/** Asset-type filter — `assets.type` is "IMAGE" | "VIDEO" in Immich. */
type ICullAssetType = "all" | "IMAGE" | "VIDEO";

type ISourceMode = "library" | "album" | "range";
type IFlag = "pick" | "reject" | null;

const isTypingTarget = (el: EventTarget | null) => {
  const tag = (el as HTMLElement)?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement)?.isContentEditable;
};

const fmtLocalDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

const DATE_PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: "Today", range: () => [fmtLocalDate(new Date()), fmtLocalDate(new Date())] },
  { label: "Last 7 days", range: () => [fmtLocalDate(daysAgo(6)), fmtLocalDate(new Date())] },
  { label: "Last 30 days", range: () => [fmtLocalDate(daysAgo(29)), fmtLocalDate(new Date())] },
  {
    label: "This month",
    range: () => {
      const now = new Date();
      return [fmtLocalDate(new Date(now.getFullYear(), now.getMonth(), 1)), fmtLocalDate(now)];
    },
  },
];

// lucide-react has no "GlassesOff" icon — built the same way lucide draws its
// own Off icons (base shape + a diagonal slash, here reusing EyeOff's "m2 2 20 20").
const GlassesOff = ({ size = 15, className = "" }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="6" cy="15" r="4" />
    <circle cx="18" cy="15" r="4" />
    <path d="M14 15a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
    <path d="M2.5 13 5 7c.7-1.3 1.4-2 3-2" />
    <path d="M21.5 13 19 7c-.7-1.3-1.5-2-3-2" />
    <path d="m2 2 20 20" />
  </svg>
);

/**
 * Lightroom-style culling: pick a source (whole library / album / date
 * range), filter by rating/flag, rip through photos full-screen with
 * keyboard shortcuts, or multi-select in the grid for bulk actions.
 *
 * Ratings (1-5) write Immich's native exif rating; Pick/Reject are Immich
 * tags (see config/constants/cull.ts for why). Delete goes to Immich's
 * TRASH (reversible for 30 days by default), never a hard delete. Archive
 * sets visibility=archive (also reversible in Immich).
 *
 * Server-side pagination + neighbor prefetching are what make big albums
 * and whole-library culling fast — nothing loads more than a page at once.
 */
export default function CullPhotosPage() {
  // --- source & filters ---
  const [mode, setMode] = useState<ISourceMode>("library");
  const [albums, setAlbums] = useState<IAlbum[]>([]);
  const [albumId, setAlbumId] = useState("");
  const [startDate, setStartDate] = useState(fmtLocalDate(daysAgo(6)));
  const [endDate, setEndDate] = useState(fmtLocalDate(new Date()));
  const [ratingValue, setRatingValue] = useState<number | null>(null);
  const [ratingComparator, setRatingComparator] = useState<ICullRatingComparator>("gt");
  const [pickStatusFilter, setPickStatusFilter] = useState<Set<ICullPickStatus>>(new Set());
  // Defaults to "unreviewed" (unlike the other filters) so the queue always
  // opens on wherever you left off reviewing.
  const [reviewStatusFilter, setReviewStatusFilter] = useState<Set<ICullReviewStatus>>(new Set(["unreviewed"]));
  const [assetTypeFilter, setAssetTypeFilter] = useState<ICullAssetType>("all");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const { exImmichUrl } = useConfig();
  // The viewer's action bar is a solid panel, styled to match the grid's
  // bulk-action bar, so its controls use the ordinary theme tokens. They used
  // to be translucent-on-photo, which each group needed back when it sat
  // directly on the image and had to hold contrast against any photo behind it.
  const viewerChipBg = "";
  const viewerChipBorder = "";
  const viewerMutedText = "text-muted-foreground";
  const viewerMutedHint = "text-muted-foreground";
  const viewerHoverBg = "hover:bg-muted";
  const viewerStarMuted = "text-muted-foreground/40";
  const viewerOnBg = "bg-muted text-foreground";

  // --- data ---
  const [assets, setAssets] = useState<ICullAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRef = useRef(1);

  // --- selection & viewer ---
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState(-1);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [showExif, setShowExif] = useState(false);
  const [shortcuts, setShortcutsState] = useState(loadCullShortcuts);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // --- display size (hydrated from localStorage after mount, SSR-safe) ---
  const [gridRowHeight, setGridRowHeight] = useState(ROW_HEIGHT_DEFAULT);
  const [controlSize, setControlSizeState] = useState<CullControlSize>("md");
  useEffect(() => {
    const rh = parseInt(localStorage.getItem(CULL_ROW_HEIGHT_KEY) || "", 10);
    if (!Number.isNaN(rh)) setGridRowHeight(Math.min(ROW_HEIGHT_MAX, Math.max(ROW_HEIGHT_MIN, rh)));
    const cs = localStorage.getItem(CULL_CONTROL_SIZE_KEY);
    if (cs === "md" || cs === "lg" || cs === "xl") setControlSizeState(cs);
  }, []);
  const changeGridRowHeight = (v: number) => {
    setGridRowHeight(v);
    localStorage.setItem(CULL_ROW_HEIGHT_KEY, String(v));
  };
  const changeControlSize = (v: CullControlSize) => {
    setControlSizeState(v);
    localStorage.setItem(CULL_CONTROL_SIZE_KEY, v);
  };
  const CTRL = CONTROL_SIZES[controlSize];
  // Per-thumbnail badges scale with the grid, clamped so they stay legible at
  // the small end and don't dominate at the large end.
  const badgeScale = Math.max(0.85, Math.min(2, gridRowHeight / ROW_HEIGHT_DEFAULT));
  const badgeText = Math.round(10 * badgeScale);
  const badgeIcon = Math.round(10 * badgeScale);
  const setShortcuts = useCallback((next: Record<ICullShortcutAction, string>) => {
    setShortcutsState(next);
    saveCullShortcuts(next);
  }, []);

  const tagIdsRef = useRef<{ pick?: string; reject?: string; reviewed?: string }>({});
  const prefetchedRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Resolve (create-or-get) all three flag tags once so keypresses never wait.
  useEffect(() => {
    ensureCullTags()
      .then((ids) => { tagIdsRef.current = ids; })
      .catch(() => toast({ title: "Error", description: "Couldn't set up Pick/Reject/Reviewed tags.", variant: "destructive" }));
  }, []);

  // Closing the viewer clears the EXIF panel so reopening it starts fresh.
  useEffect(() => {
    if (viewerIndex === null) setShowExif(false);
  }, [viewerIndex]);

  useEffect(() => {
    listAlbums({ sortBy: "albumName", sortOrder: "asc" }).then(setAlbums).catch(() => {
      toast({ title: "Error", description: "Failed to load albums.", variant: "destructive" });
    });
  }, []);

  const sourceParams = useMemo(() => {
    if (mode === "album") return albumId ? { albumId } : null; // null = not ready to fetch
    if (mode === "range") return startDate && endDate ? { startDate, endDate } : null;
    return {};
  }, [mode, albumId, startDate, endDate]);

  const fetchPage = useCallback(
    async (page: number, reset: boolean) => {
      if (!sourceParams) return;
      reset ? setLoading(true) : setLoadingMore(true);
      try {
        const res = await listCullAssets({
          ...sourceParams,
          ratingValue,
          ratingComparator,
          flag: Array.from(pickStatusFilter),
          reviewed: Array.from(reviewStatusFilter),
          assetType: assetTypeFilter === "all" ? undefined : assetTypeFilter,
          sortOrder,
          page,
          limit: PAGE_SIZE,
        });
        pageRef.current = page;
        setAssets((prev) => (reset ? res.assets : [...prev, ...res.assets]));
        setTotal(res.total);
        setHasNext(res.hasNext);
      } catch (e: any) {
        toast({ title: "Error", description: `Failed to load photos: ${e?.error || e?.message || "unknown"}`, variant: "destructive" });
      } finally {
        reset ? setLoading(false) : setLoadingMore(false);
      }
    },
    [sourceParams, ratingValue, ratingComparator, pickStatusFilter, reviewStatusFilter, assetTypeFilter, sortOrder]
  );

  // Any source/filter change restarts from page 1 (server does the filtering).
  useEffect(() => {
    setAssets([]);
    setSelectedIds([]);
    setViewerIndex(null);
    setTotal(0);
    setHasNext(false);
    fetchPage(1, true);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (loadingMore || loading || !hasNext) return;
    fetchPage(pageRef.current + 1, false);
  }, [fetchPage, hasNext, loading, loadingMore]);

  // Keep culling past the loaded window: viewer nearing the end pulls the
  // next page before the user hits the wall.
  useEffect(() => {
    if (viewerIndex !== null && viewerIndex >= assets.length - 25 && hasNext && !loadingMore) loadMore();
  }, [viewerIndex, assets.length, hasNext, loadingMore, loadMore]);

  // Prefetch neighbors of the current photo so arrows feel instant. Bounded
  // map so a long session doesn't hold hundreds of decoded previews.
  useEffect(() => {
    if (viewerIndex === null) return;
    for (const off of [1, 2, 3, 4, -1, -2]) {
      const a = assets[viewerIndex + off];
      if (!a || a.type === "VIDEO" || prefetchedRef.current.has(a.id)) continue;
      const img = new window.Image();
      img.src = ASSET_PREVIEW_PATH(a.id);
      prefetchedRef.current.set(a.id, img);
      if (prefetchedRef.current.size > 40) {
        const oldest = prefetchedRef.current.keys().next().value;
        if (oldest) prefetchedRef.current.delete(oldest);
      }
    }
  }, [viewerIndex, assets]);

  // --- mutations (all optimistic, with snapshot revert on failure) ---

  const patchLocal = (ids: string[], patch: Partial<ICullAsset>) => {
    const idSet = new Set(ids);
    setAssets((prev) => prev.map((a) => (idSet.has(a.id) ? { ...a, ...patch } : a)));
  };

  const snapshot = (ids: string[]) => {
    const idSet = new Set(ids);
    return assets.filter((a) => idSet.has(a.id)).map((a) => ({ ...a }));
  };

  const restore = (snap: ICullAsset[]) => {
    const byId = new Map(snap.map((a) => [a.id, a]));
    setAssets((prev) => prev.map((a) => byId.get(a.id) ?? a));
  };

  const rateAssets = useCallback(async (ids: string[], rating: number | null) => {
    const snap = snapshot(ids);
    patchLocal(ids, { rating });
    try {
      await updateAssets({ ids, rating });
    } catch {
      restore(snap);
      toast({ title: "Error", description: "Failed to set rating.", variant: "destructive" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);

  const flagAssets = useCallback(async (ids: string[], flag: IFlag) => {
    const { pick, reject } = tagIdsRef.current;
    if (!pick || !reject) {
      toast({ title: "Hang on", description: "Still preparing Pick/Reject tags…" });
      return;
    }
    const snap = snapshot(ids);
    patchLocal(ids, { picked: flag === "pick", rejected: flag === "reject" });
    try {
      // Unconditional add/remove pair — idempotent, race-free, and exactly
      // what enforces "never both picked and rejected".
      if (flag === "pick") {
        await Promise.all([removeTagFromAssets(reject, ids), addTagToAssets(pick, ids)]);
      } else if (flag === "reject") {
        await Promise.all([removeTagFromAssets(pick, ids), addTagToAssets(reject, ids)]);
      } else {
        await Promise.all([removeTagFromAssets(pick, ids), removeTagFromAssets(reject, ids)]);
      }
    } catch {
      restore(snap);
      toast({ title: "Error", description: "Failed to update flag.", variant: "destructive" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);

  const reviewAssets = useCallback(async (ids: string[], reviewed: boolean) => {
    const { reviewed: reviewedTagId } = tagIdsRef.current;
    if (!reviewedTagId) {
      toast({ title: "Hang on", description: "Still preparing the Reviewed tag…" });
      return;
    }
    const snap = snapshot(ids);
    patchLocal(ids, { reviewed });
    try {
      if (reviewed) await addTagToAssets(reviewedTagId, ids);
      else await removeTagFromAssets(reviewedTagId, ids);
    } catch {
      restore(snap);
      toast({ title: "Error", description: "Failed to update reviewed status.", variant: "destructive" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);

  const favoriteAssets = useCallback(async (ids: string[], isFavorite: boolean) => {
    const snap = snapshot(ids);
    patchLocal(ids, { isFavorite });
    try {
      await updateAssets({ ids, isFavorite });
    } catch {
      restore(snap);
      toast({ title: "Error", description: "Failed to update favorite.", variant: "destructive" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);

  /** Drop ids from the loaded list (after archive/trash), fixing selection + viewer. */
  const removeFromList = (ids: string[]) => {
    const idSet = new Set(ids);
    setAssets((prev) => {
      const next = prev.filter((a) => !idSet.has(a.id));
      setViewerIndex((vi) => {
        if (vi === null) return null;
        if (!next.length) return null;
        // Removing the current photo keeps the index: the next photo slides
        // into place, which is the Lightroom cull rhythm.
        const removedBefore = prev.slice(0, vi).filter((a) => idSet.has(a.id)).length;
        return Math.min(vi - removedBefore, next.length - 1);
      });
      return next;
    });
    setSelectedIds((prev) => prev.filter((id) => !idSet.has(id)));
    setTotal((t) => Math.max(0, t - ids.length));
  };

  const archiveAssets = useCallback(async (ids: string[]) => {
    if (busy) return;
    setBusy(true);
    try {
      await updateAssets({ ids, visibility: "archive" });
      removeFromList(ids);
      toast({ title: `Archived ${ids.length} photo${ids.length === 1 ? "" : "s"}` });
    } catch {
      toast({ title: "Error", description: "Failed to archive.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  const trashAssets = useCallback(async (ids: string[]) => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteAssets(ids, { force: false }); // Immich trash, NOT permanent
      removeFromList(ids);
      toast({ title: `Moved ${ids.length} photo${ids.length === 1 ? "" : "s"} to Immich's trash` });
    } catch {
      toast({ title: "Error", description: "Failed to delete.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  // --- keyboard ---
  const viewerAsset = viewerIndex !== null ? assets[viewerIndex] ?? null : null;

  // O(1) lookup for the grid's per-thumbnail badge overlay (`assets.find`
  // inside the extras renderer was O(n) per photo, O(n²) per grid render) —
  // also read by the bulk R/F keyboard toggles below.
  const assetsById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || shortcutsOpen) return;

      // Cmd/Ctrl+A selects every loaded photo (grid only — the viewer has
      // nothing to multi-select). Checked before the modifier early-return.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && viewerIndex === null) {
        e.preventDefault();
        if (assets.length) setSelectedIds(assets.map((a) => a.id));
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Keys act on the viewer photo when it's open, else on the grid selection.
      const targetIds = viewerAsset ? [viewerAsset.id] : selectedIds;

      if (e.key === "Escape") {
        if (viewerIndex !== null) setViewerIndex(null);
        else if (selectedIds.length) setSelectedIds([]);
        return;
      }
      if (viewerIndex !== null) {
        if (e.key === "ArrowRight") { e.preventDefault(); setViewerIndex((i) => Math.min((i ?? 0) + 1, assets.length - 1)); return; }
        if (e.key === "ArrowLeft") { e.preventDefault(); setViewerIndex((i) => Math.max((i ?? 0) - 1, 0)); return; }
        if (keyMatches(e, shortcuts.info)) { e.preventDefault(); setShowExif((v) => !v); return; }
      }
      if (!targetIds.length) return;

      if (e.key === "0") {
        // Lightroom convention: 0 clears the rating. (Immich's rating field
        // has no 0 — only 1-5, -1, or null — so this maps straight to null.)
        e.preventDefault();
        rateAssets(targetIds, null);
      } else if (e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        const n = Number(e.key);
        // Re-pressing the current rating clears it (single-photo only, where
        // "current" is unambiguous).
        const clear = viewerAsset && viewerAsset.rating === n;
        rateAssets(targetIds, clear ? null : n);
      } else if (keyMatches(e, shortcuts.pick)) {
        e.preventDefault();
        // Toggle is only unambiguous for the single open photo; a bulk grid
        // selection just gets marked picked (same convention as Reviewed/
        // Favorite below) — Unflag is still there for bulk clearing.
        flagAssets(targetIds, viewerAsset && viewerAsset.picked ? null : "pick");
      } else if (keyMatches(e, shortcuts.reject)) {
        e.preventDefault();
        flagAssets(targetIds, viewerAsset && viewerAsset.rejected ? null : "reject");
      } else if (keyMatches(e, shortcuts.unflag)) {
        e.preventDefault();
        flagAssets(targetIds, null);
      } else if (keyMatches(e, shortcuts.reviewed)) {
        e.preventDefault();
        // Toggle: in the viewer, flip the open photo; for a grid selection,
        // un-review only if every selected photo is already reviewed, else
        // mark them all reviewed. (Unlike Pick/Reject, Reviewed has no
        // separate "un-" key, so the shortcut must toggle both ways.)
        const nextReviewed = viewerAsset
          ? !viewerAsset.reviewed
          : !selectedIds.every((id) => assetsById.get(id)?.reviewed);
        reviewAssets(targetIds, nextReviewed);
      } else if (keyMatches(e, shortcuts.favorite)) {
        e.preventDefault();
        const nextFavorite = viewerAsset
          ? !viewerAsset.isFavorite
          : !selectedIds.every((id) => assetsById.get(id)?.isFavorite);
        favoriteAssets(targetIds, nextFavorite);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [viewerAsset, viewerIndex, selectedIds, assets.length, assetsById, shortcuts, shortcutsOpen, rateAssets, flagAssets, reviewAssets, favoriteAssets]);

  // --- grid photos ---
  const images: AssetPhoto[] = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    return assets.map((a) => ({
      id: a.id,
      src: ASSET_THUMBNAIL_PATH(a.id),
      width: a.exifImageWidth || 1500,
      height: a.exifImageHeight || 1000,
      isSelected: selectedSet.has(a.id),
      isVideo: a.type === "VIDEO",
      duration: a.duration != null ? String(a.duration) : undefined,
    }));
  }, [assets, selectedIds]);

  // The one rating every selected photo shares (null when mixed or unrated) —
  // lets the bulk bar's stars show the current state, so clicking the lit
  // star clears it (replacing the old dedicated clear-rating button).
  const sharedSelectedRating = useMemo(() => {
    if (!selectedIds.length) return null;
    let shared: number | null | undefined;
    for (const id of selectedIds) {
      const rating = assetsById.get(id)?.rating ?? null;
      if (shared === undefined) shared = rating;
      else if (rating !== shared) return null;
    }
    return shared ?? null;
  }, [selectedIds, assetsById]);

  const handleSelect = (photo: AssetPhoto, event: React.MouseEvent) => {
    const clickedIndex = images.findIndex((i) => i.id === photo.id);
    if (event.shiftKey && lastSelectedIndex >= 0) {
      const [lo, hi] = [Math.min(clickedIndex, lastSelectedIndex), Math.max(clickedIndex, lastSelectedIndex)];
      const range = images.slice(lo, hi + 1).map((i) => i.id);
      setSelectedIds((prev) => [...new Set([...prev, ...range])]);
    } else {
      setSelectedIds((prev) =>
        prev.includes(photo.id) ? prev.filter((id) => id !== photo.id) : [...prev, photo.id]
      );
    }
    setLastSelectedIndex(clickedIndex);
  };

  const renderImage = (props: RenderImageProps, context: RenderImageContext<AssetPhoto>) => (
    <LazyGridImage
      imageProps={props}
      photo={context.photo}
      width={context.width}
      height={context.height}
      selectable
      onSelect={(event) => handleSelect(context.photo, event)}
      selectionMode={selectedIds.length > 0}
    />
  );

  const selectionActive = selectedIds.length > 0;

  // --- shared overlay pieces ---
  const StarRow = ({
    value, size, onRate, mutedClassName = "text-white/40",
  }: { value: number | null; size: number; onRate: (n: number | null) => void; mutedClassName?: string }) => (
    <span className="flex items-center">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          title={`${n} star${n === 1 ? "" : "s"} (key ${n})`}
          className="p-1 hover:scale-125 transition-transform"
          onClick={(e) => { e.stopPropagation(); onRate(value === n ? null : n); }}
        >
          <Star size={size} className={value !== null && n <= value ? "fill-amber-400 text-amber-400" : mutedClassName} />
        </button>
      ))}
    </span>
  );

  // --- top filter bar: pick/review status are multi-select toggle sets;
  // rating is a single star count plus a comparator that decides how it's
  // applied (0 stars + "=" reads as Unrated, since there's no "0" star to click).
  const togglePickStatus = (v: ICullPickStatus) =>
    setPickStatusFilter((prev) => {
      const next = new Set(prev);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });

  const toggleReviewStatus = (v: ICullReviewStatus) =>
    setReviewStatusFilter((prev) => {
      const next = new Set(prev);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });

  const cycleRatingComparator = () =>
    setRatingComparator((prev) => (prev === "gt" ? "eq" : prev === "eq" ? "lt" : "gt"));

  return (
    <PageLayout title="Rate & Cull">
      <Header
        leftComponent="Rate & Cull"
        rightComponent={
          <div className="flex items-center gap-2">
            {/* Control size — scales the bulk bar + full-screen viewer controls
                (and their key hints) for big/high-DPI displays and older eyes. */}
            <div className="flex items-center rounded-md border p-0.5" title="Control size">
              {(["md", "lg", "xl"] as CullControlSize[]).map((s, i) => (
                <button
                  key={s}
                  type="button"
                  title={CONTROL_SIZES[s].label}
                  className={`flex h-6 w-6 items-center justify-center rounded font-semibold leading-none ${
                    controlSize === s ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-accent"
                  }`}
                  style={{ fontSize: 10 + i * 3 }}
                  onClick={() => changeControlSize(s)}
                >
                  A
                </button>
              ))}
            </div>
            <ShortcutSettings
              open={shortcutsOpen}
              onOpenChange={setShortcutsOpen}
              shortcuts={shortcuts}
              onChange={setShortcuts}
            />
            <HelpGuide shortcuts={shortcuts} />
          </div>
        }
      />
      <div className="flex flex-col gap-3 p-4">
        {/* Source + filter row. Sticky so it stays put while the grid scrolls;
            the negative margins bleed the opaque background over the wrapper's
            p-4 padding, and `top-0` pins it to the top of PageLayout's scroll
            area. Sizing here follows the app defaults (h-9, 16px icons) to
            match the original modules. */}
        <div className="sticky top-0 z-20 -mx-4 -mt-4 flex flex-wrap items-center gap-2 border-b bg-background/95 px-4 pb-3 pt-4 backdrop-blur-sm">
          <label className="text-sm text-muted-foreground">Review</label>
          <Select value={mode} onValueChange={(v) => setMode(v as ISourceMode)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="library">Whole library</SelectItem>
              <SelectItem value="album">Album</SelectItem>
              <SelectItem value="range">Date range</SelectItem>
            </SelectContent>
          </Select>
          {mode === "album" && (
            <Select value={albumId} onValueChange={setAlbumId}>
              <SelectTrigger className="w-72"><SelectValue placeholder="Choose an album…" /></SelectTrigger>
              <SelectContent>
                {albums.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.albumName} ({a.assetCount})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {mode === "range" && (
            <>
              <Input type="date" className="w-40" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <span className="text-sm text-muted-foreground">to</span>
              <Input type="date" className="w-40" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              {DATE_PRESETS.map((p) => (
                <Button
                  key={p.label} variant="ghost" className="px-2 text-xs"
                  onClick={() => { const [s, en] = p.range(); setStartDate(s); setEndDate(en); }}
                >
                  {p.label}
                </Button>
              ))}
            </>
          )}
          <Button
            variant="outline"
            title="Select every loaded photo (Cmd/Ctrl+A)"
            disabled={!assets.length || selectedIds.length === assets.length}
            onClick={() => setSelectedIds(assets.map((a) => a.id))}
          >
            Select all
          </Button>
          <Button
            variant="outline"
            title="Deselect all (Esc)"
            disabled={!selectedIds.length}
            onClick={() => setSelectedIds([])}
          >
            Deselect all
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Filter size={16} /> Filters
            </span>
            {/* Asset type — single-select: All / Photos / Videos */}
            <div className="flex items-center gap-0.5 rounded-md border p-0.5">
              {([
                { v: "all", title: "All", Icon: Layers },
                { v: "IMAGE", title: "Photos only", Icon: ImageIcon },
                { v: "VIDEO", title: "Videos only", Icon: Video },
              ] as { v: ICullAssetType; title: string; Icon: typeof Layers }[]).map(({ v, title, Icon }) => (
                <button
                  key={v}
                  type="button"
                  title={title}
                  className={cn(
                    "rounded p-2",
                    assetTypeFilter === v ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"
                  )}
                  onClick={() => setAssetTypeFilter(v)}
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>
            {/* Pick status — multi-select */}
            <div className="flex items-center gap-0.5 rounded-md border p-0.5">
              <button
                type="button"
                title="Picked"
                className={`rounded p-2 ${pickStatusFilter.has("picked") ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-accent"}`}
                onClick={() => togglePickStatus("picked")}
              >
                <CheckCircle2 size={16} />
              </button>
              <button
                type="button"
                title="Rejected"
                className={`rounded p-2 ${pickStatusFilter.has("rejected") ? "bg-red-600 text-white" : "text-muted-foreground hover:bg-accent"}`}
                onClick={() => togglePickStatus("rejected")}
              >
                <XCircle size={16} />
              </button>
              <button
                type="button"
                title="Unflagged"
                className={`rounded p-2 ${pickStatusFilter.has("unflagged") ? "bg-slate-600 text-white" : "text-muted-foreground hover:bg-accent"}`}
                onClick={() => togglePickStatus("unflagged")}
              >
                <Circle size={16} />
              </button>
            </div>

            {/* Star rating — comparator cycles </>/=; 0 stars + "=" means Unrated */}
            <div className="flex items-center gap-1 rounded-md border p-0.5 pl-2">
              <button
                type="button"
                title={`Rating is ${ratingComparator === "eq" ? "exactly" : ratingComparator === "gt" ? "more than" : "less than"} the stars below (click to cycle)`}
                className="w-4 text-sm font-semibold text-muted-foreground hover:text-foreground"
                onClick={cycleRatingComparator}
              >
                {ratingComparator === "eq" ? "=" : ratingComparator === "gt" ? ">" : "<"}
              </button>
              <StarRow value={ratingValue} size={18} onRate={setRatingValue} mutedClassName="text-muted-foreground/40" />
            </div>

            {/* Review status — multi-select */}
            <div className="flex items-center gap-0.5 rounded-md border p-0.5">
              <button
                type="button"
                title="Reviewed"
                className={`rounded p-2 ${reviewStatusFilter.has("reviewed") ? "bg-sky-600 text-white" : "text-muted-foreground hover:bg-accent"}`}
                onClick={() => toggleReviewStatus("reviewed")}
              >
                <Glasses size={16} />
              </button>
              <button
                type="button"
                title="Unreviewed"
                className={`rounded p-2 ${reviewStatusFilter.has("unreviewed") ? "bg-slate-600 text-white" : "text-muted-foreground hover:bg-accent"}`}
                onClick={() => toggleReviewStatus("unreviewed")}
              >
                <GlassesOff size={16} />
              </button>
            </div>

            {/* Sort direction */}
            <Button
              variant="default"
              title={sortOrder === "asc" ? "Oldest first" : "Newest first"}
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            >
              {sortOrder === "asc" ? <SortAsc size={16} /> : <SortDesc size={16} />}
            </Button>
          </div>
        </div>

        {/* grid */}
        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="animate-spin" /></div>
        ) : !sourceParams ? (
          <div className="py-24 text-center text-muted-foreground">
            {mode === "album" ? "Choose an album above to start culling." : "Pick a date range above."}
          </div>
        ) : !assets.length ? (
          <div className="py-24 text-center text-muted-foreground">No photos match this view.</div>
        ) : (
          <>
            <RowsPhotoAlbum
              photos={images}
              targetRowHeight={gridRowHeight}
              rowConstraints={{ singleRowMaxHeight: gridRowHeight * 2 }}
              spacing={2}
              padding={0}
              onClick={({ index, event, photo }) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || selectionActive) handleSelect(photo, event);
                else setViewerIndex(index);
              }}
              render={{
                image: renderImage,
                extras: (_, { photo }) => {
                  const a = assetsById.get(photo.id);
                  if (!a || (!a.rating && !a.picked && !a.rejected && !a.reviewed && !a.isFavorite)) return null;
                  // Badges scale with the grid slider so they stay proportional
                  // to the thumbnail (and legible when it's blown up big).
                  const badgeStyle = { fontSize: badgeText } as const;
                  return (
                    <div className="pointer-events-none absolute bottom-1 left-1 flex items-center gap-1">
                      {!!a.rating && (
                        <span style={badgeStyle} className="rounded bg-black/60 px-1 py-0.5 font-semibold text-amber-400">
                          ★{a.rating}
                        </span>
                      )}
                      {a.picked && (
                        <span style={badgeStyle} className="rounded bg-emerald-600/90 px-1 py-0.5 font-semibold text-white">P</span>
                      )}
                      {a.rejected && (
                        <span style={badgeStyle} className="rounded bg-red-600/90 px-1 py-0.5 font-semibold text-white">✕</span>
                      )}
                      {a.reviewed && (
                        <span style={badgeStyle} className="rounded bg-sky-600/90 px-1 py-0.5 font-semibold text-white">✓</span>
                      )}
                      {a.isFavorite && (
                        <span className="rounded bg-black/60 p-0.5">
                          <Heart size={badgeIcon} className="fill-pink-500 text-pink-500" />
                        </span>
                      )}
                    </div>
                  );
                },
              }}
            />
            <div className="flex justify-center py-2">
              {loadingMore ? (
                <Loader2 className="animate-spin text-muted-foreground" />
              ) : hasNext ? (
                <Button variant="ghost" onClick={loadMore}>Load more ({(total - assets.length).toLocaleString()} left)</Button>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* grid-size slider — fixed bottom-left pill, mirrors the People Manager
          control. Hidden in the full-screen viewer. */}
      {!!assets.length && viewerIndex === null && (
        <div className="fixed bottom-4 left-[210px] lg:left-[250px] z-20 flex items-center gap-3 rounded-full border bg-background/90 px-4 py-2 shadow-md backdrop-blur-sm">
          <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            type="range"
            min={ROW_HEIGHT_MIN}
            max={ROW_HEIGHT_MAX}
            step={10}
            value={gridRowHeight}
            onChange={(e) => changeGridRowHeight(Number(e.target.value))}
            className="h-1.5 w-28 cursor-pointer appearance-none rounded-full bg-muted accent-foreground"
            title={`Thumbnail size (${gridRowHeight}px)`}
          />
        </div>
      )}

      {/* bulk action bar */}
      {selectionActive && viewerIndex === null && (
        <FloatingBar className="!max-w-[95vw] w-fit flex-wrap justify-center gap-2">
          <div className="flex flex-col px-2 whitespace-nowrap">
            <span className="text-sm font-semibold">{selectedIds.length} selected</span>
            <span className="text-[10px] leading-tight text-muted-foreground">Rating controls</span>
          </div>
          {/* Rating — shows the selection's shared rating; clicking the lit
              star clears it (no separate clear-rating button). */}
          <div className="flex items-center rounded-md border p-0.5">
            <span style={{ fontSize: CTRL.hint }} className="pl-1.5 font-medium text-muted-foreground select-none">1–5</span>
            <StarRow
              value={sharedSelectedRating}
              size={CTRL.star}
              onRate={(n) => rateAssets(selectedIds, n)}
              mutedClassName="text-muted-foreground/40"
            />
          </div>
          {/* Pick status */}
          <div className="flex items-center gap-0.5 rounded-md border p-0.5">
            <span style={{ fontSize: CTRL.hint }} className="px-1 font-medium text-muted-foreground select-none">
              {displayKey(shortcuts.pick)}/{displayKey(shortcuts.reject)}/{displayKey(shortcuts.unflag)}
            </span>
            <Button size="sm" variant="ghost" className={CTRL.btn} title={`Pick (${displayKey(shortcuts.pick)})`} onClick={() => flagAssets(selectedIds, "pick")}>
              <CheckCircle2 size={CTRL.icon} className="text-emerald-500" />
            </Button>
            <Button size="sm" variant="ghost" className={CTRL.btn} title={`Reject (${displayKey(shortcuts.reject)})`} onClick={() => flagAssets(selectedIds, "reject")}>
              <XCircle size={CTRL.icon} className="text-red-500" />
            </Button>
            <Button size="sm" variant="ghost" className={CTRL.btn} title={`Unflag (${displayKey(shortcuts.unflag)})`} onClick={() => flagAssets(selectedIds, null)}>
              <Circle size={CTRL.icon} className="text-muted-foreground" />
            </Button>
          </div>
          {/* Review status */}
          <div className="flex items-center gap-0.5 rounded-md border p-0.5">
            <span style={{ fontSize: CTRL.hint }} className="px-1 font-medium text-muted-foreground select-none">{displayKey(shortcuts.reviewed)}</span>
            <Button size="sm" variant="ghost" className={CTRL.btn} title={`Mark Reviewed (${displayKey(shortcuts.reviewed)})`} onClick={() => reviewAssets(selectedIds, true)}>
              <Glasses size={CTRL.icon} className="text-sky-500" />
            </Button>
            <Button size="sm" variant="ghost" className={CTRL.btn} title="Mark Unreviewed" onClick={() => reviewAssets(selectedIds, false)}>
              <GlassesOff size={CTRL.icon} className="text-muted-foreground" />
            </Button>
          </div>
          {/* Favorite */}
          <div className="flex items-center gap-0.5 rounded-md border p-0.5">
            <span style={{ fontSize: CTRL.hint }} className="px-1 font-medium text-muted-foreground select-none">{displayKey(shortcuts.favorite)}</span>
            <Button size="sm" variant="ghost" className={CTRL.btn} title={`Favorite (${displayKey(shortcuts.favorite)})`} onClick={() => favoriteAssets(selectedIds, true)}>
              <Heart size={CTRL.icon} className="fill-pink-500 text-pink-500" />
            </Button>
            <Button size="sm" variant="ghost" className={CTRL.btn} title="Unfavorite" onClick={() => favoriteAssets(selectedIds, false)}>
              <Heart size={CTRL.icon} className="text-muted-foreground" />
            </Button>
          </div>
          {/* Archive / trash */}
          <div className="flex items-center gap-0.5 rounded-md border p-0.5">
            <Button size="sm" variant="ghost" className={CTRL.btn} title="Archive (hide from timeline, reversible)" disabled={busy} onClick={() => archiveAssets(selectedIds)}>
              <Archive size={CTRL.icon} />
            </Button>
            <AlertDialog
              asChild
              disabled={busy}
              title={`Move ${selectedIds.length} photo${selectedIds.length === 1 ? "" : "s"} to trash?`}
              description="They go to Immich's trash (recoverable there until it's emptied), not permanent deletion."
              onConfirm={() => trashAssets(selectedIds)}
            >
              <Button size="sm" variant="ghost" className={CTRL.btn} title="Move to trash" disabled={busy}>
                <Trash2 size={CTRL.icon} className="text-red-500" />
              </Button>
            </AlertDialog>
          </div>
          {/* Add to album — its own group, since it's the one control here that
              sends photos somewhere rather than changing a flag on them. */}
          <div className="flex items-center gap-0.5 rounded-md border p-0.5">
            <AddToAlbumButton
              assetIds={selectedIds}
              buttonClassName={CTRL.btn}
              iconSize={CTRL.icon}
              disabled={busy}
            />
          </div>
          <Button size="sm" variant="ghost" className={CTRL.btn} title="Clear selection (Esc)" onClick={() => setSelectedIds([])}>
            <X size={CTRL.icon} />
          </Button>
        </FloatingBar>
      )}

      {/* full-screen viewer */}
      {viewerAsset && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black">
          {/* top bar */}
          <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 py-2 text-white">
            <span className="text-sm tabular-nums">{(viewerIndex ?? 0) + 1} / {total.toLocaleString()}</span>
            <span className="truncate text-sm text-white/70">{viewerAsset.originalFileName}</span>
            <span className="text-xs text-white/50">
              {viewerAsset.localDateTime ? String(viewerAsset.localDateTime).slice(0, 10) : ""}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <a
                href={`${exImmichUrl}/photos/${viewerAsset.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded p-1 hover:bg-white/10"
                title="Open in Immich"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={18} />
              </a>
              <button
                className={`rounded p-1 hover:bg-white/10 ${showExif ? "bg-white/10" : ""}`}
                title={`Info (${displayKey(shortcuts.info)})`}
                onClick={(e) => { e.stopPropagation(); setShowExif((v) => !v); }}
              >
                <Info size={18} />
              </button>
              <button className="rounded p-1 hover:bg-white/10" title="Close (Esc)" onClick={() => setViewerIndex(null)}>
                <X size={20} />
              </button>
            </div>
          </div>
          {showExif && <ExifPanel assetId={viewerAsset.id} />}

          {/* image — as much screen as possible */}
          <div className="flex min-h-0 flex-1 items-center justify-center" onClick={() => setViewerIndex(null)}>
            {viewerAsset.type === "VIDEO" ? (
              <video
                key={viewerAsset.id}
                src={ASSET_VIDEO_PATH(viewerAsset.id)}
                controls
                className="max-h-full max-w-full"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={viewerAsset.id}
                src={ASSET_PREVIEW_PATH(viewerAsset.id)}
                alt={viewerAsset.originalFileName}
                className="h-full w-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>

          {/* nav chevrons */}
          <button
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/70 disabled:opacity-20"
            disabled={viewerIndex === 0}
            title="Previous (←)"
            onClick={() => setViewerIndex((i) => Math.max((i ?? 0) - 1, 0))}
          >
            <ChevronLeft size={24} />
          </button>
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/70 disabled:opacity-20"
            disabled={viewerIndex === assets.length - 1 && !hasNext}
            title="Next (→)"
            onClick={() => setViewerIndex((i) => Math.min((i ?? 0) + 1, assets.length - 1))}
          >
            <ChevronRight size={24} />
          </button>

          {/* bottom bar: same bordered-cluster + key-hint layout as the grid's
              bulk-action bar, just targeting this one photo — and now the same
              solid panel too, rather than translucent chips laid over the
              photo. Its own element rather than <FloatingBar> because that
              component offsets itself past the sidebar, which isn't there in
              full screen. flex-wrap so nothing clips off-screen on phones. */}
          <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center px-4 py-3">
            <div className="flex max-w-[95vw] w-fit flex-wrap items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-2 py-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
            {/* Rating */}
            <div className={`flex items-center rounded-md border ${viewerChipBorder} ${viewerChipBg} p-0.5`}>
              <span style={{ fontSize: CTRL.hint }} className={`pl-1.5 font-medium ${viewerMutedHint} select-none`}>1–5</span>
              <StarRow value={viewerAsset.rating} size={CTRL.vstar} onRate={(n) => rateAssets([viewerAsset.id], n)} mutedClassName={viewerStarMuted} />
            </div>
            {/* Pick status */}
            <div className={`flex items-center gap-0.5 rounded-md border ${viewerChipBorder} ${viewerChipBg} p-0.5`}>
              <span style={{ fontSize: CTRL.hint }} className={`px-1 font-medium ${viewerMutedHint} select-none`}>
                {displayKey(shortcuts.pick)}/{displayKey(shortcuts.reject)}/{displayKey(shortcuts.unflag)}
              </span>
              <button
                title={`Pick (${displayKey(shortcuts.pick)})`}
                className={`rounded ${CTRL.pad} ${viewerAsset.picked ? "bg-emerald-600 text-white" : `${viewerMutedText} ${viewerHoverBg}`}`}
                onClick={() => flagAssets([viewerAsset.id], "pick")}
              >
                <CheckCircle2 size={CTRL.icon} />
              </button>
              <button
                title={`Reject (${displayKey(shortcuts.reject)})`}
                className={`rounded ${CTRL.pad} ${viewerAsset.rejected ? "bg-red-600 text-white" : `${viewerMutedText} ${viewerHoverBg}`}`}
                onClick={() => flagAssets([viewerAsset.id], "reject")}
              >
                <XCircle size={CTRL.icon} />
              </button>
              <button
                title={`Unflag (${displayKey(shortcuts.unflag)})`}
                className={`rounded ${CTRL.pad} ${!viewerAsset.picked && !viewerAsset.rejected ? viewerOnBg : `${viewerMutedText} ${viewerHoverBg}`}`}
                onClick={() => flagAssets([viewerAsset.id], null)}
              >
                <Circle size={CTRL.icon} />
              </button>
            </div>
            {/* Review status */}
            <div className={`flex items-center gap-0.5 rounded-md border ${viewerChipBorder} ${viewerChipBg} p-0.5`}>
              <span style={{ fontSize: CTRL.hint }} className={`px-1 font-medium ${viewerMutedHint} select-none`}>{displayKey(shortcuts.reviewed)}</span>
              <button
                title={`Mark Reviewed (${displayKey(shortcuts.reviewed)})`}
                className={`rounded ${CTRL.pad} ${viewerAsset.reviewed ? "bg-sky-600 text-white" : `${viewerMutedText} ${viewerHoverBg}`}`}
                onClick={() => reviewAssets([viewerAsset.id], true)}
              >
                <Glasses size={CTRL.icon} />
              </button>
              <button
                title="Mark Unreviewed"
                className={`rounded ${CTRL.pad} ${!viewerAsset.reviewed ? viewerOnBg : `${viewerMutedText} ${viewerHoverBg}`}`}
                onClick={() => reviewAssets([viewerAsset.id], false)}
              >
                <GlassesOff size={CTRL.icon} />
              </button>
            </div>
            {/* Favorite */}
            <div className={`flex items-center gap-0.5 rounded-md border ${viewerChipBorder} ${viewerChipBg} p-0.5`}>
              <span style={{ fontSize: CTRL.hint }} className={`px-1 font-medium ${viewerMutedHint} select-none`}>{displayKey(shortcuts.favorite)}</span>
              <button
                title={`Favorite (${displayKey(shortcuts.favorite)})`}
                className={`rounded ${CTRL.pad} ${viewerAsset.isFavorite ? "text-pink-500" : `${viewerMutedText} ${viewerHoverBg}`}`}
                onClick={() => favoriteAssets([viewerAsset.id], true)}
              >
                <Heart size={CTRL.icon} className={viewerAsset.isFavorite ? "fill-pink-500" : ""} />
              </button>
              <button
                title="Unfavorite"
                className={`rounded ${CTRL.pad} ${!viewerAsset.isFavorite ? viewerOnBg : `${viewerMutedText} ${viewerHoverBg}`}`}
                onClick={() => favoriteAssets([viewerAsset.id], false)}
              >
                <Heart size={CTRL.icon} />
              </button>
            </div>
            {/* Archive / trash */}
            <div className={`flex items-center gap-0.5 rounded-md border ${viewerChipBorder} ${viewerChipBg} p-0.5`}>
              <button
                title="Archive (hide from timeline, reversible)"
                className={`rounded ${CTRL.pad} ${viewerMutedText} ${viewerHoverBg} disabled:opacity-40`}
                disabled={busy}
                onClick={() => archiveAssets([viewerAsset.id])}
              >
                <Archive size={CTRL.icon} />
              </button>
              <AlertDialog
                asChild
                disabled={busy}
                title="Move this photo to trash?"
                description="It goes to Immich's trash (recoverable there until it's emptied), not permanent deletion."
                onConfirm={() => trashAssets([viewerAsset.id])}
              >
                <button className={`rounded ${CTRL.pad} text-red-500 ${viewerHoverBg} disabled:opacity-40`} disabled={busy}>
                  <Trash2 size={CTRL.icon} />
                </button>
              </AlertDialog>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
