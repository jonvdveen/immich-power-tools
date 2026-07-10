import AssetGrid, { AssetPhoto } from "@/components/shared/AssetGrid";
import AlbumDropdown from "@/components/shared/AlbumDropdown";
import FloatingBar from "@/components/shared/FloatingBar";
import Header from "@/components/shared/Header";
import PageLayout from "@/components/layouts/PageLayout";
import FavoritesSheet from "@/components/location-manager/FavoritesSheet";
import LocationSearchBox from "@/components/location-manager/LocationSearchBox";
import { useLocationFavorites } from "@/components/location-manager/useLocationFavorites";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/components/ui/use-toast";
import PhotoSelectionContext, {
  IPhotoSelectionContext,
} from "@/contexts/PhotoSelectionContext";
import {
  listLocationManagerAssets,
  updateAssets,
} from "@/handlers/api/asset.handler";
import { ILocationFavorite } from "@/handlers/api/locationFavorite.handler";
import {
  coordsEqual,
  formatCoordinates,
  ILatLng,
  parseCoordinates,
} from "@/lib/location-manager/coordinates";
import type {
  IFlyTo,
  IImagePin,
  ISelectedPin,
} from "@/components/location-manager/LocationManagerMap";
import {
  Calendar as CalendarIcon,
  Check,
  ClipboardCopy,
  ClipboardPaste,
  Expand,
  Hourglass,
  SortAsc,
  SortDesc,
  Star,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useTheme } from "next-themes";
import React, { useEffect, useMemo, useRef, useState } from "react";

const LocationManagerMap = dynamic(
  () => import("@/components/location-manager/LocationManagerMap"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
        Loading map…
      </div>
    ),
  }
);

type GpsStatus = "all" | "set" | "notSet";

interface IClipboard {
  coords: ILatLng;
  source: "image" | "map";
}

export default function LocationManager() {
  const router = useRouter();
  const { theme } = useTheme();
  const {
    albumId,
    gpsStatus = "all",
    sortOrder = "desc",
    dateFrom,
    dateTo,
  } = router.query as {
    albumId?: string;
    gpsStatus?: GpsStatus;
    sortOrder?: "asc" | "desc";
    dateFrom?: string;
    dateTo?: string;
  };

  const [contextState, setContextState] = useState<IPhotoSelectionContext>({
    selectedIds: [],
    assets: [],
    config: {},
    updateContext: (newState: Partial<IPhotoSelectionContext>) => {
      setContextState((prev) => ({ ...prev, ...newState }));
    },
  });
  const { assets, selectedIds, updateContext } = contextState;

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Shared clipboard + pin state (unified across grid and map controls).
  const [clipboard, setClipboard] = useState<IClipboard | null>(null);
  const [droppedPin, setDroppedPin] = useState<ILatLng | null>(null);
  const [selectedPin, setSelectedPin] = useState<ISelectedPin>(null);
  const [flyTo, setFlyTo] = useState<IFlyTo | null>(null);

  const [imageCoordsDraft, setImageCoordsDraft] = useState("");
  const [imageCoordsError, setImageCoordsError] = useState(false);
  const [mapCoordsDraft, setMapCoordsDraft] = useState("");
  const [mapCoordsError, setMapCoordsError] = useState(false);

  // Grid ↔ map linkage
  const [showAllOnMap, setShowAllOnMap] = useState(false);
  const [hoveredAssetId, setHoveredAssetId] = useState<string | null>(null);
  const [flashedAssetId, setFlashedAssetId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const favoritesState = useLocationFavorites();
  const { favorites } = favoritesState;

  const setFilters = (patch: Record<string, string | undefined>) => {
    const next: Record<string, any> = { ...router.query, ...patch };
    Object.keys(next).forEach((k) => {
      if (next[k] === undefined || next[k] === "") delete next[k];
    });
    router.push(
      { pathname: "/assets/location-manager", query: next },
      undefined,
      { shallow: true }
    );
  };

  useEffect(() => {
    if (!router.isReady) return;
    setLoading(true);
    setPage(1);
    updateContext({ selectedIds: [], assets: [] });
    listLocationManagerAssets({ albumId, gpsStatus, page: 1, sortOrder, dateFrom, dateTo })
      .then(({ assets: fetched, hasMore: more, total: count }) => {
        updateContext({ assets: fetched });
        setHasMore(more);
        setTotal(count ?? null);
      })
      .catch(() =>
        toast({
          title: "Error",
          description: "Failed to load photos",
          variant: "destructive",
        })
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, albumId, gpsStatus, sortOrder, dateFrom, dateTo]);

  const loadMore = () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    listLocationManagerAssets({ albumId, gpsStatus, page: nextPage, sortOrder, dateFrom, dateTo })
      .then(({ assets: fetched, hasMore: more }) => {
        // Dedupe by id — offset pagination can shift when writes remove
        // items from the "Location Not Set" filter between requests.
        setContextState((prev) => {
          const known = new Set(prev.assets.map((a) => a.id));
          return {
            ...prev,
            assets: [...prev.assets, ...fetched.filter((a) => !known.has(a.id))],
          };
        });
        setPage(nextPage);
        setHasMore(more);
      })
      .catch(() =>
        toast({
          title: "Error",
          description: "Failed to load more photos",
          variant: "destructive",
        })
      )
      .finally(() => setLoadingMore(false));
  };

  const selectedAssets = useMemo(
    () => assets.filter((a) => selectedIds.includes(a.id)),
    [assets, selectedIds]
  );

  const imagePins: IImagePin[] = useMemo(
    () =>
      selectedAssets
        .filter((a) => a.latitude != null && a.longitude != null)
        .map((a) => ({ id: a.id, lat: a.latitude!, lng: a.longitude! })),
    [selectedAssets]
  );

  const allPins: IImagePin[] = useMemo(
    () =>
      showAllOnMap
        ? assets
            .filter((a) => a.latitude != null && a.longitude != null)
            .map((a) => ({ id: a.id, lat: a.latitude!, lng: a.longitude! }))
        : [],
    [showAllOnMap, assets]
  );

  // The coordinates all selected images share — or null when mixed/absent.
  const sharedCoords: ILatLng | null = useMemo(() => {
    if (selectedAssets.length === 0) return null;
    const first = selectedAssets[0];
    if (first.latitude == null || first.longitude == null) return null;
    const coords = { lat: first.latitude, lng: first.longitude };
    const allSame = selectedAssets.every(
      (a) =>
        a.latitude != null &&
        a.longitude != null &&
        coordsEqual({ lat: a.latitude, lng: a.longitude }, coords)
    );
    return allSame ? coords : null;
  }, [selectedAssets]);

  // Coordinates of whichever pin is selected (dropped pin or a clicked image pin).
  const selectedPinCoords: ILatLng | null = useMemo(() => {
    if (!selectedPin) return null;
    if (selectedPin.type === "dropped") return droppedPin;
    const pin = imagePins.find((p) => p.id === selectedPin.id);
    return pin ? { lat: pin.lat, lng: pin.lng } : null;
  }, [selectedPin, droppedPin, imagePins]);

  // A clicked image pin whose photo gets deselected is no longer a valid target.
  useEffect(() => {
    if (
      selectedPin?.type === "image" &&
      !imagePins.some((p) => p.id === selectedPin.id)
    ) {
      setSelectedPin(null);
    }
  }, [imagePins, selectedPin]);

  // Keep the Image Coordinates box in sync with the selection (a "Copy Map
  // Location" fill survives until the selection itself changes).
  const selectionSignature = selectedIds.join(",");
  const sharedCoordsKey = sharedCoords ? formatCoordinates(sharedCoords) : "";
  useEffect(() => {
    setImageCoordsDraft(sharedCoordsKey);
    setImageCoordsError(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionSignature, sharedCoordsKey]);

  // Keep the Map Coordinates box in sync with the selected pin.
  const selectedPinKey = selectedPinCoords
    ? formatCoordinates(selectedPinCoords)
    : "";
  useEffect(() => {
    setMapCoordsDraft(selectedPinKey);
    setMapCoordsError(false);
  }, [selectedPinKey]);

  // Restore each photo's previous coordinates after a write. Photos that had
  // NO location before can't be reverted — Immich's API rejects null lat/lng
  // (verified against its compiled validation: latitudeSchema is a plain
  // number schema, not nullable), and clearing GPS is out of scope anyway.
  const undoApply = async (entries: Array<[string, ILatLng]>) => {
    setSaving(true);
    try {
      // One bulk call per distinct previous location.
      const groups = new Map<string, { coords: ILatLng; ids: string[] }>();
      for (const [id, coords] of entries) {
        const key = formatCoordinates(coords);
        const group = groups.get(key) ?? { coords, ids: [] };
        group.ids.push(id);
        groups.set(key, group);
      }
      for (const group of groups.values()) {
        for (let i = 0; i < group.ids.length; i += 1000) {
          await updateAssets({
            ids: group.ids.slice(i, i + 1000),
            latitude: group.coords.lat,
            longitude: group.coords.lng,
          });
        }
      }
      const restored = new Map(entries);
      setContextState((prev) => ({
        ...prev,
        assets: prev.assets.map((a) => {
          const coords = restored.get(a.id);
          return coords
            ? { ...a, latitude: coords.lat, longitude: coords.lng }
            : a;
        }),
      }));
      toast({
        title: `Restored the previous location of ${entries.length} ${entries.length === 1 ? "photo" : "photos"}`,
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to undo",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const applyCoordinates = async (ids: string[], coords: ILatLng) => {
    if (ids.length === 0) return;
    setSaving(true);
    // Snapshot previous coordinates for Undo before overwriting.
    const previous: Array<[string, ILatLng]> = assets
      .filter(
        (a) => ids.includes(a.id) && a.latitude != null && a.longitude != null
      )
      .map((a) => [a.id, { lat: a.latitude!, lng: a.longitude! }]);
    try {
      // One bulk call per 1000 ids — same chunking convention the workflow
      // engine uses against Immich's bulk endpoints.
      for (let i = 0; i < ids.length; i += 1000) {
        await updateAssets({
          ids: ids.slice(i, i + 1000),
          latitude: coords.lat,
          longitude: coords.lng,
        });
      }
      if (gpsStatus === "notSet") {
        // They no longer match this filter — remove them, the same way
        // Missing Locations clears tagged photos from its list.
        setContextState((prev) => ({
          ...prev,
          assets: prev.assets.filter((a) => !ids.includes(a.id)),
          selectedIds: [],
        }));
        setTotal((t) => (t == null ? t : Math.max(0, t - ids.length)));
      } else {
        setContextState((prev) => ({
          ...prev,
          assets: prev.assets.map((a) =>
            ids.includes(a.id)
              ? { ...a, latitude: coords.lat, longitude: coords.lng }
              : a
          ),
        }));
      }
      const overwritten = previous.length;
      toast({
        title: `Location saved to ${ids.length} ${ids.length === 1 ? "photo" : "photos"}`,
        description:
          overwritten > 0 && overwritten < ids.length
            ? `${formatCoordinates(coords)} — Undo restores the ${overwritten} that already had a location; the rest had none before.`
            : formatCoordinates(coords),
        action:
          overwritten > 0 ? (
            <ToastAction altText="Undo" onClick={() => undoApply(previous)}>
              Undo
            </ToastAction>
          ) : undefined,
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to update location",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const canCopyImageLocation =
    selectedAssets.length === 1 &&
    selectedAssets[0].latitude != null &&
    selectedAssets[0].longitude != null;

  const copyImageLocation = () => {
    if (!canCopyImageLocation) return;
    const a = selectedAssets[0];
    const coords = { lat: a.latitude!, lng: a.longitude! };
    setClipboard({ coords, source: "image" });
    // Unified state: the copied location also becomes the candidate pin, so
    // the map (and its coordinates box) always shows what's on the clipboard.
    setDroppedPin(coords);
    setSelectedPin({ type: "dropped" });
    setFlyTo({ coords, ts: Date.now() });
    toast({ title: "Image location copied", description: formatCoordinates(coords) });
  };

  const copyMapLocation = () => {
    if (!selectedPinCoords) return;
    setClipboard({ coords: selectedPinCoords, source: "map" });
    // Unified state: stage it in the Image Coordinates box too, so "Save"
    // becomes an alternative to the Paste button.
    if (selectedIds.length > 0) {
      setImageCoordsDraft(formatCoordinates(selectedPinCoords));
      setImageCoordsError(false);
    }
    toast({
      title: "Map location copied",
      description: formatCoordinates(selectedPinCoords),
    });
  };

  const pasteLocation = () => {
    if (!clipboard || selectedIds.length === 0) return;
    applyCoordinates(selectedIds, clipboard.coords);
  };

  const saveImageCoordinates = () => {
    const parsed = parseCoordinates(imageCoordsDraft);
    if (!parsed) {
      setImageCoordsError(true);
      return;
    }
    setImageCoordsError(false);
    applyCoordinates(selectedIds, parsed);
  };

  const commitMapCoordinates = () => {
    if (!mapCoordsDraft.trim()) return;
    const parsed = parseCoordinates(mapCoordsDraft);
    if (!parsed) {
      setMapCoordsError(true);
      return;
    }
    setMapCoordsError(false);
    // Editing the box always moves the candidate (dropped) pin. If an image
    // pin was selected, the edit detaches into the dropped pin instead of
    // desyncing the image pin from what's actually stored on the photo.
    setDroppedPin(parsed);
    setSelectedPin({ type: "dropped" });
    setFlyTo({ coords: parsed, ts: Date.now() });
  };

  const handleMapClick = (coords: ILatLng) => {
    // Only one candidate pin at a time — a new drop replaces the old one.
    setDroppedPin(coords);
    setSelectedPin({ type: "dropped" });
  };

  const handleSearchSelect = (result: { name: string } & ILatLng) => {
    const coords = { lat: result.lat, lng: result.lng };
    setDroppedPin(coords);
    setSelectedPin({ type: "dropped" });
    setFlyTo({ coords, zoom: 14, ts: Date.now() });
  };

  const handleApplyFavorite = (favorite: ILocationFavorite) => {
    applyCoordinates(selectedIds, {
      lat: favorite.latitude,
      lng: favorite.longitude,
    });
  };

  const handleShowFavoriteOnMap = (favorite: ILocationFavorite) => {
    const coords = { lat: favorite.latitude, lng: favorite.longitude };
    setDroppedPin(coords);
    setSelectedPin({ type: "dropped" });
    setFlyTo({ coords, zoom: 14, ts: Date.now() });
  };

  // Map pin clicked → scroll the photo into view and flash it briefly.
  const flashPhoto = (id: string) => {
    setFlashedAssetId(id);
    document
      .querySelector(`[data-asset-id="${id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashedAssetId(null), 1800);
  };

  // Per-thumbnail overlays: green/red GPS chip (bottom-left) and an expand
  // button (bottom-right) that opens the large preview — clicking the photo
  // itself selects it and shows its pin on the map.
  const renderThumbnailExtras = (
    photo: AssetPhoto,
    actions: { openPreview: () => void }
  ) => {
    const hasGps = photo.latitude != null && photo.longitude != null;
    return (
      <>
        <div
          className={`absolute bottom-1 left-1 flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium text-white pointer-events-none ${
            hasGps ? "bg-green-600/85" : "bg-red-600/85"
          }`}
        >
          {hasGps ? <Check size={10} /> : <X size={10} />} GPS
        </div>
        <button
          type="button"
          title="Preview"
          className={`absolute right-1 bg-black/60 hover:bg-black/80 p-1 rounded ${
            photo.isVideo ? "bottom-8" : "bottom-1"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            actions.openPreview();
          }}
        >
          <Expand className="h-3.5 w-3.5 text-white" />
        </button>
      </>
    );
  };

  const pasteLabel = clipboard
    ? clipboard.source === "image"
      ? "Paste Image Location"
      : "Paste Map Location"
    : "Paste Location";

  const hasDateFilter = !!(dateFrom || dateTo);

  return (
    <PageLayout className="!p-0 !mb-0 relative">
      <Header
        leftComponent={
          <div className="flex items-baseline gap-2">
            <span>Location Manager</span>
            {total != null && (
              <span className="text-xs font-normal text-muted-foreground whitespace-nowrap">
                {total.toLocaleString()}{" "}
                {gpsStatus === "notSet"
                  ? "without location"
                  : gpsStatus === "set"
                    ? "with location"
                    : "photos"}
              </span>
            )}
          </div>
        }
        rightComponent={
          <div className="flex items-center gap-2">
            <AlbumDropdown
              albumIds={albumId ? [albumId] : []}
              onChange={(albumIds) => setFilters({ albumId: albumIds?.[0] })}
            />
            <Tabs
              value={gpsStatus}
              onValueChange={(value) =>
                setFilters({ gpsStatus: value === "all" ? undefined : value })
              }
            >
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="set">
                  <Check size={14} className="mr-1 text-green-600" /> GPS
                </TabsTrigger>
                <TabsTrigger value="notSet">
                  <X size={14} className="mr-1 text-red-600" /> GPS
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={hasDateFilter ? "default" : "outline"}
                  size="sm"
                  title="Filter by date taken"
                >
                  <CalendarIcon size={16} />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">
                  Taken between
                </Label>
                <Input
                  type="date"
                  value={dateFrom ?? ""}
                  onChange={(e) =>
                    setFilters({ dateFrom: e.target.value || undefined })
                  }
                />
                <Input
                  type="date"
                  value={dateTo ?? ""}
                  onChange={(e) =>
                    setFilters({ dateTo: e.target.value || undefined })
                  }
                />
                {hasDateFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setFilters({ dateFrom: undefined, dateTo: undefined })
                    }
                  >
                    Clear dates
                  </Button>
                )}
              </PopoverContent>
            </Popover>
            <Button
              variant="default"
              size="sm"
              title={sortOrder === "asc" ? "Oldest first" : "Newest first"}
              onClick={() =>
                setFilters({ sortOrder: sortOrder === "asc" ? "desc" : "asc" })
              }
            >
              {sortOrder === "asc" ? <SortAsc size={16} /> : <SortDesc size={16} />}
            </Button>
            {(albumId || gpsStatus !== "all" || hasDateFilter) && (
              <Button
                variant="outline"
                size="sm"
                title="Clear filters"
                onClick={() =>
                  setFilters({
                    albumId: undefined,
                    gpsStatus: undefined,
                    dateFrom: undefined,
                    dateTo: undefined,
                  })
                }
              >
                <X size={16} />
              </Button>
            )}
          </div>
        }
      />
      <PhotoSelectionContext.Provider value={contextState}>
        <div
          className="flex flex-col lg:flex-row"
          style={{ height: "calc(100vh - 60px)" }}
        >
          <div className="flex-1 min-w-0 overflow-y-auto pb-28">
            {loading ? (
              <div className="flex flex-col gap-2 h-full justify-center items-center w-full">
                <Hourglass />
                <p className="text-lg">Loading...</p>
              </div>
            ) : assets.length === 0 ? (
              <div className="flex flex-col gap-2 h-full justify-center items-center w-full">
                <p className="text-lg">No photos match these filters</p>
                <p className="text-sm text-muted-foreground">
                  Try a different album, GPS status, or date range.
                </p>
              </div>
            ) : (
              <>
                <AssetGrid
                  assets={assets}
                  selectable
                  clickToSelect
                  renderExtras={renderThumbnailExtras}
                  onPhotoHover={setHoveredAssetId}
                  highlightedAssetId={flashedAssetId}
                />
                <div className="flex flex-col items-center gap-2 py-4">
                  <p className="text-xs text-muted-foreground">
                    Showing {assets.length}
                    {total != null ? ` of ${total.toLocaleString()}` : ""} item
                    {(total ?? assets.length) === 1 ? "" : "s"}
                  </p>
                  {hasMore && (
                    <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                      {loadingMore ? "Loading..." : "Load more"}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="w-full lg:w-[440px] xl:w-[500px] shrink-0 border-t lg:border-t-0 lg:border-l flex flex-col h-[50vh] lg:h-auto">
            <div className="p-3 flex flex-col gap-3 border-b">
              <LocationSearchBox onSelect={handleSearchSelect} />
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">
                  Image Coordinates
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={imageCoordsDraft}
                    disabled={selectedIds.length === 0}
                    placeholder={
                      selectedIds.length === 0
                        ? "Select images first"
                        : "Mixed or no coordinates — paste or type lat, long"
                    }
                    className={imageCoordsError ? "border-destructive" : ""}
                    onChange={(e) => {
                      setImageCoordsDraft(e.target.value);
                      setImageCoordsError(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveImageCoordinates();
                    }}
                  />
                  <Button
                    size="sm"
                    className="shrink-0"
                    title="Save Image Coordinates"
                    disabled={
                      !imageCoordsDraft.trim() ||
                      selectedIds.length === 0 ||
                      saving
                    }
                    onClick={saveImageCoordinates}
                  >
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </div>
                {imageCoordsError && (
                  <p className="text-xs text-destructive">
                    Couldn&apos;t read those coordinates — try &quot;latitude, longitude&quot;.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">
                  Map Coordinates
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={mapCoordsDraft}
                    placeholder="Click the map, search, or type lat, long"
                    className={mapCoordsError ? "border-destructive" : ""}
                    onChange={(e) => {
                      setMapCoordsDraft(e.target.value);
                      setMapCoordsError(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitMapCoordinates();
                    }}
                    onBlur={() => {
                      if (mapCoordsDraft !== selectedPinKey) commitMapCoordinates();
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    title="Copy Map Location"
                    disabled={!selectedPinCoords}
                    onClick={copyMapLocation}
                  >
                    <ClipboardCopy size={14} className="mr-1" /> Copy
                  </Button>
                </div>
                {mapCoordsError && (
                  <p className="text-xs text-destructive">
                    Couldn&apos;t read those coordinates — try &quot;latitude, longitude&quot;.
                  </p>
                )}
              </div>
            </div>
            <div className="px-3 py-2 border-b flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <FavoritesSheet
                  favorites={favoritesState.favorites}
                  loading={favoritesState.loading}
                  busy={favoritesState.busy}
                  pinCoords={selectedPinCoords}
                  selectedCount={selectedIds.length}
                  applying={saving}
                  onAdd={favoritesState.add}
                  onRename={favoritesState.rename}
                  onDelete={favoritesState.remove}
                  onReorder={favoritesState.reorder}
                  onApply={handleApplyFavorite}
                  onShowOnMap={handleShowFavoriteOnMap}
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  id="show-all-on-map"
                  checked={showAllOnMap}
                  onCheckedChange={setShowAllOnMap}
                />
                <Label
                  htmlFor="show-all-on-map"
                  className="text-xs text-muted-foreground cursor-pointer"
                >
                  Show all on map
                </Label>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <LocationManagerMap
                imagePins={imagePins}
                allPins={allPins}
                droppedPin={droppedPin}
                selectedPin={selectedPin}
                highlightedAssetId={hoveredAssetId}
                isDarkMode={theme === "dark"}
                onMapClick={handleMapClick}
                onImagePinClick={(id) => {
                  setSelectedPin({ type: "image", id });
                  flashPhoto(id);
                }}
                onAllPinClick={flashPhoto}
                onDroppedPinClick={() => setSelectedPin({ type: "dropped" })}
                flyTo={flyTo}
              />
            </div>
          </div>
        </div>

        {selectedIds.length > 0 && (
          <FloatingBar className="lg:right-[440px] xl:right-[500px] lg:max-w-xl">
            <div className="flex items-center gap-2 justify-between w-full">
              <p className="text-sm text-muted-foreground whitespace-nowrap">
                {selectedIds.length} Selected
              </p>
              <div className="flex items-center gap-2">
                {selectedIds.length < assets.length && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateContext({ selectedIds: assets.map((a) => a.id) })
                    }
                  >
                    Select all
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateContext({ selectedIds: [] })}
                >
                  Deselect all
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canCopyImageLocation}
                  title="Copy this image's coordinates"
                  onClick={copyImageLocation}
                >
                  <ClipboardCopy size={14} className="mr-1" /> Copy Image Location
                </Button>
                {favorites.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={saving}
                        title="Apply a favourite location to the selected photos"
                      >
                        <Star size={14} className="mr-1" /> Favourites
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="top">
                      {favorites.map((favorite) => (
                        <DropdownMenuItem
                          key={favorite.id}
                          onSelect={() => handleApplyFavorite(favorite)}
                        >
                          {favorite.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button
                  size="sm"
                  disabled={!clipboard || saving}
                  title="Apply the copied coordinates to all selected images"
                  onClick={pasteLocation}
                >
                  <ClipboardPaste size={14} className="mr-1" /> {pasteLabel}
                </Button>
              </div>
            </div>
          </FloatingBar>
        )}
      </PhotoSelectionContext.Provider>
    </PageLayout>
  );
}
