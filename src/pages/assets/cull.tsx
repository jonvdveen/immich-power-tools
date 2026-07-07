import "react-photo-album/rows.css";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Flag, Glasses, Heart, Info,
  Loader2, Star, StarOff, Trash2, X, XCircle,
} from "lucide-react";
import { RowsPhotoAlbum } from "react-photo-album";
import type { RenderImageContext, RenderImageProps } from "react-photo-album";

import ExifPanel from "@/components/cull/ExifPanel";
import HelpGuide from "@/components/cull/HelpGuide";
import PageLayout from "@/components/layouts/PageLayout";
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
  addTagToAssets, ensureCullTags, ICullAsset, ICullFlagFilter, ICullRatingFilter,
  ICullReviewedFilter, listCullAssets, removeTagFromAssets,
} from "@/handlers/api/cull.handler";
import { ASSET_PREVIEW_PATH, ASSET_THUMBNAIL_PATH, ASSET_VIDEO_PATH } from "@/config/routes";
import { IAlbum } from "@/types/album";

const PAGE_SIZE = 200;

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
  const [ratingFilter, setRatingFilter] = useState<ICullRatingFilter>("any");
  const [flagFilter, setFlagFilter] = useState<ICullFlagFilter>("any");
  // Defaults to "unreviewed" (unlike the other filters) so the queue always
  // opens on wherever you left off reviewing.
  const [reviewedFilter, setReviewedFilter] = useState<ICullReviewedFilter>("unreviewed");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const { exImmichUrl } = useConfig();

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
    listAlbums().then(setAlbums).catch(() => {
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
          rating: ratingFilter,
          flag: flagFilter,
          reviewed: reviewedFilter,
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
    [sourceParams, ratingFilter, flagFilter, reviewedFilter, sortOrder]
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

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
        if (e.key === "i" || e.key === "I") { e.preventDefault(); setShowExif((v) => !v); return; }
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
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        flagAssets(targetIds, "pick");
      } else if (e.key === "x" || e.key === "X") {
        e.preventDefault();
        flagAssets(targetIds, "reject");
      } else if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        flagAssets(targetIds, null);
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        // Toggle is only unambiguous for the single open photo; a bulk grid
        // selection just gets marked reviewed (same convention as P/X below).
        reviewAssets(targetIds, !(viewerAsset && viewerAsset.reviewed));
      } else if (e.key === "f" || e.key === "F" || e.key === ".") {
        e.preventDefault();
        favoriteAssets(targetIds, !(viewerAsset && viewerAsset.isFavorite));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [viewerAsset, viewerIndex, selectedIds, assets.length, rateAssets, flagAssets, reviewAssets, favoriteAssets]);

  // --- grid photos ---
  const images: AssetPhoto[] = useMemo(
    () =>
      assets.map((a) => ({
        id: a.id,
        src: ASSET_THUMBNAIL_PATH(a.id),
        width: a.exifImageWidth || 1500,
        height: a.exifImageHeight || 1000,
        isSelected: selectedIds.includes(a.id),
        isVideo: a.type === "VIDEO",
        duration: a.duration != null ? String(a.duration) : undefined,
      })),
    [assets, selectedIds]
  );

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
  const StarRow = ({ value, size, onRate }: { value: number | null; size: number; onRate: (n: number | null) => void }) => (
    <span className="flex items-center">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          title={`${n} star${n === 1 ? "" : "s"} (key ${n})`}
          className="p-1 hover:scale-125 transition-transform"
          onClick={(e) => { e.stopPropagation(); onRate(value === n ? null : n); }}
        >
          <Star size={size} className={value !== null && n <= value ? "fill-amber-400 text-amber-400" : "text-white/40"} />
        </button>
      ))}
    </span>
  );

  return (
    <PageLayout title="Cull Photos">
      <Header
        leftComponent="Cull Photos"
        rightComponent={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              1–5 rate · P pick · X reject · U unflag · R reviewed · F favorite · I info · ←/→ navigate · Esc close/clear
            </span>
            <HelpGuide />
          </div>
        }
      />
      <div className="flex flex-col gap-3 p-4">
        {/* source + filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-muted-foreground">Review</label>
          <Select value={mode} onValueChange={(v) => setMode(v as ISourceMode)}>
            <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="library">Whole library</SelectItem>
              <SelectItem value="album">Album</SelectItem>
              <SelectItem value="range">Date range</SelectItem>
            </SelectContent>
          </Select>
          {mode === "album" && (
            <Select value={albumId} onValueChange={setAlbumId}>
              <SelectTrigger className="w-72 h-8"><SelectValue placeholder="Choose an album…" /></SelectTrigger>
              <SelectContent>
                {albums.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.albumName} ({a.assetCount})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {mode === "range" && (
            <>
              <Input type="date" className="h-8 w-40" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <span className="text-sm text-muted-foreground">to</span>
              <Input type="date" className="h-8 w-40" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              {DATE_PRESETS.map((p) => (
                <Button
                  key={p.label} size="sm" variant="ghost" className="h-8 px-2 text-xs"
                  onClick={() => { const [s, en] = p.range(); setStartDate(s); setEndDate(en); }}
                >
                  {p.label}
                </Button>
              ))}
            </>
          )}
          <label className="text-sm text-muted-foreground">Rating</label>
          <Select value={ratingFilter} onValueChange={(v) => setRatingFilter(v as ICullRatingFilter)}>
            <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="unrated">Unrated</SelectItem>
              {[1, 2, 3, 4].map((n) => (
                <SelectItem key={n} value={String(n)}>{"★".repeat(n)} & up</SelectItem>
              ))}
              <SelectItem value="5">★★★★★</SelectItem>
            </SelectContent>
          </Select>
          <label className="text-sm text-muted-foreground">Flag</label>
          <Select value={flagFilter} onValueChange={(v) => setFlagFilter(v as ICullFlagFilter)}>
            <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="picked">Picked</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="unflagged">Unflagged</SelectItem>
            </SelectContent>
          </Select>
          <label className="text-sm text-muted-foreground">Reviewed</label>
          <Select value={reviewedFilter} onValueChange={(v) => setReviewedFilter(v as ICullReviewedFilter)}>
            <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="unreviewed">Unreviewed</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
            </SelectContent>
          </Select>
          <label className="text-sm text-muted-foreground">Sort</label>
          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "asc" | "desc")}>
            <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Newest</SelectItem>
              <SelectItem value="asc">Oldest</SelectItem>
            </SelectContent>
          </Select>
          <span className="ml-auto text-sm text-muted-foreground">
            {loading ? "Loading…" : `${assets.length.toLocaleString()} of ${total.toLocaleString()} loaded`}
          </span>
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
              targetRowHeight={150}
              rowConstraints={{ singleRowMaxHeight: 300 }}
              spacing={2}
              padding={0}
              onClick={({ index, event, photo }) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || selectionActive) handleSelect(photo, event);
                else setViewerIndex(index);
              }}
              render={{
                image: renderImage,
                extras: (_, { photo }) => {
                  const a = assets.find((x) => x.id === photo.id);
                  if (!a || (!a.rating && !a.picked && !a.rejected && !a.reviewed && !a.isFavorite)) return null;
                  return (
                    <div className="pointer-events-none absolute bottom-1 left-1 flex items-center gap-1">
                      {!!a.rating && (
                        <span className="rounded bg-black/60 px-1 py-0.5 text-[10px] font-semibold text-amber-400">
                          ★{a.rating}
                        </span>
                      )}
                      {a.picked && (
                        <span className="rounded bg-emerald-600/90 px-1 py-0.5 text-[10px] font-semibold text-white">P</span>
                      )}
                      {a.rejected && (
                        <span className="rounded bg-red-600/90 px-1 py-0.5 text-[10px] font-semibold text-white">✕</span>
                      )}
                      {a.reviewed && (
                        <span className="rounded bg-sky-600/90 px-1 py-0.5 text-[10px] font-semibold text-white">✓</span>
                      )}
                      {a.isFavorite && (
                        <span className="rounded bg-black/60 p-0.5">
                          <Heart size={10} className="fill-pink-500 text-pink-500" />
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

      {/* bulk action bar */}
      {selectionActive && viewerIndex === null && (
        <FloatingBar className="!max-w-4xl flex-wrap gap-2">
          <span className="px-2 text-sm font-semibold whitespace-nowrap">{selectedIds.length} selected</span>
          <StarRow value={null} size={16} onRate={(n) => rateAssets(selectedIds, n)} />
          <Button size="sm" variant="ghost" title="Clear rating" onClick={() => rateAssets(selectedIds, null)}>
            <StarOff size={15} />
          </Button>
          <Button size="sm" variant="ghost" title="Pick (P)" onClick={() => flagAssets(selectedIds, "pick")}>
            <CheckCircle2 size={15} className="text-emerald-500" />
          </Button>
          <Button size="sm" variant="ghost" title="Reject (X)" onClick={() => flagAssets(selectedIds, "reject")}>
            <XCircle size={15} className="text-red-500" />
          </Button>
          <Button size="sm" variant="ghost" title="Unflag (U)" onClick={() => flagAssets(selectedIds, null)}>
            <Flag size={15} className="text-muted-foreground" />
          </Button>
          <Button size="sm" variant="ghost" title="Mark Reviewed (R)" onClick={() => reviewAssets(selectedIds, true)}>
            <Glasses size={15} className="text-sky-500" />
          </Button>
          <Button size="sm" variant="ghost" title="Mark Unreviewed" onClick={() => reviewAssets(selectedIds, false)}>
            <Glasses size={15} className="text-muted-foreground" />
          </Button>
          <Button size="sm" variant="ghost" title="Favorite (F)" onClick={() => favoriteAssets(selectedIds, true)}>
            <Heart size={15} className="fill-pink-500 text-pink-500" />
          </Button>
          <Button size="sm" variant="ghost" title="Unfavorite" onClick={() => favoriteAssets(selectedIds, false)}>
            <Heart size={15} className="text-muted-foreground" />
          </Button>
          <Button size="sm" variant="ghost" title="Archive (hide from timeline, reversible)" disabled={busy} onClick={() => archiveAssets(selectedIds)}>
            <Archive size={15} />
          </Button>
          <AlertDialog
            asChild
            disabled={busy}
            title={`Move ${selectedIds.length} photo${selectedIds.length === 1 ? "" : "s"} to trash?`}
            description="They go to Immich's trash (recoverable there until it's emptied), not permanent deletion."
            onConfirm={() => trashAssets(selectedIds)}
          >
            <Button size="sm" variant="ghost" title="Move to trash" disabled={busy}>
              <Trash2 size={15} className="text-red-500" />
            </Button>
          </AlertDialog>
          <Button size="sm" variant="ghost" title="Clear selection (Esc)" onClick={() => setSelectedIds([])}>
            <X size={15} />
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
                title="Info (I)"
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

          {/* bottom overlay: live, clickable rating + flags + actions */}
          <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-4 bg-gradient-to-t from-black/80 to-transparent px-4 py-3">
            <StarRow value={viewerAsset.rating} size={22} onRate={(n) => rateAssets([viewerAsset.id], n)} />
            <span className="h-6 w-px bg-white/20" />
            <button
              title="Pick (P) — click again to unflag"
              className={`flex items-center gap-1 rounded px-2 py-1 text-sm ${viewerAsset.picked ? "bg-emerald-600 text-white" : "text-white/60 hover:bg-white/10"}`}
              onClick={() => flagAssets([viewerAsset.id], viewerAsset.picked ? null : "pick")}
            >
              <CheckCircle2 size={15} /> Pick
            </button>
            <button
              title="Reject (X) — click again to unflag"
              className={`flex items-center gap-1 rounded px-2 py-1 text-sm ${viewerAsset.rejected ? "bg-red-600 text-white" : "text-white/60 hover:bg-white/10"}`}
              onClick={() => flagAssets([viewerAsset.id], viewerAsset.rejected ? null : "reject")}
            >
              <XCircle size={15} /> Reject
            </button>
            <button
              title="Reviewed (R) — click again to unmark"
              className={`flex items-center gap-1 rounded px-2 py-1 text-sm ${viewerAsset.reviewed ? "bg-sky-600 text-white" : "text-white/60 hover:bg-white/10"}`}
              onClick={() => reviewAssets([viewerAsset.id], !viewerAsset.reviewed)}
            >
              <Glasses size={15} /> Reviewed
            </button>
            <span className="h-6 w-px bg-white/20" />
            <button
              title="Favorite (F) — click again to unfavorite"
              className={`flex items-center gap-1 rounded px-2 py-1 text-sm ${viewerAsset.isFavorite ? "text-pink-500" : "text-white/60 hover:bg-white/10"}`}
              onClick={() => favoriteAssets([viewerAsset.id], !viewerAsset.isFavorite)}
            >
              <Heart size={15} className={viewerAsset.isFavorite ? "fill-pink-500" : ""} /> Favorite
            </button>
            <span className="h-6 w-px bg-white/20" />
            <button
              title="Archive — hide from timeline (reversible in Immich)"
              className="flex items-center gap-1 rounded px-2 py-1 text-sm text-white/60 hover:bg-white/10 disabled:opacity-40"
              disabled={busy}
              onClick={() => archiveAssets([viewerAsset.id])}
            >
              <Archive size={15} /> Archive
            </button>
            <AlertDialog
              asChild
              disabled={busy}
              title="Move this photo to trash?"
              description="It goes to Immich's trash (recoverable there until it's emptied), not permanent deletion."
              onConfirm={() => trashAssets([viewerAsset.id])}
            >
              <button
                className="flex items-center gap-1 rounded px-2 py-1 text-sm text-red-400 hover:bg-white/10 disabled:opacity-40"
                disabled={busy}
              >
                <Trash2 size={15} /> Trash
              </button>
            </AlertDialog>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
