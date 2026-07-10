import { AlertDialog, IAlertDialogActions } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import {
  createLocationFavorite,
  deleteLocationFavorite,
  ILocationFavorite,
  listLocationFavorites,
  updateLocationFavorite,
} from "@/handlers/api/locationFavorite.handler";
import { formatCoordinates, ILatLng } from "@/lib/location-manager/coordinates";
import {
  Check,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

interface FavoritesPaneProps {
  /** Coordinates of the currently selected pin — the source for "Add". */
  pinCoords: ILatLng | null;
  /** How many photos are selected — gates "Apply". */
  selectedCount: number;
  /** True while the parent is writing coordinates to photos. */
  applying: boolean;
  onApply: (favorite: ILocationFavorite) => void;
  /** Row click: preview the favourite on the map (drops the candidate pin there). */
  onShowOnMap: (favorite: ILocationFavorite) => void;
}

function FavoriteRow({
  favorite,
  selectedCount,
  applying,
  onApply,
  onShowOnMap,
  onRename,
  onDelete,
}: {
  favorite: ILocationFavorite;
  selectedCount: number;
  applying: boolean;
  onApply: (favorite: ILocationFavorite) => void;
  onShowOnMap: (favorite: ILocationFavorite) => void;
  onRename: (favorite: ILocationFavorite) => void;
  onDelete: (favorite: ILocationFavorite) => void;
}) {
  const deleteDialogRef = useRef<IAlertDialogActions>(null);

  return (
    <div className="flex items-center gap-1 py-0.5">
      <button
        type="button"
        className="flex-1 min-w-0 text-left text-sm truncate hover:underline"
        title={`Show on map (${formatCoordinates({ lat: favorite.latitude, lng: favorite.longitude })})`}
        onClick={() => onShowOnMap(favorite)}
      >
        {favorite.name}
      </button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 shrink-0"
        disabled={selectedCount === 0 || applying}
        title={
          selectedCount === 0
            ? "Select photos first"
            : `Set "${favorite.name}" as the location of ${selectedCount} selected photo${selectedCount === 1 ? "" : "s"}`
        }
        onClick={() => onApply(favorite)}
      >
        Apply
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 shrink-0"
            title="More actions"
          >
            <MoreVertical size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onRename(favorite)}>
            <Pencil size={14} className="mr-2" /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            // Deferred: opening the dialog synchronously from onSelect races
            // the DropdownMenu's own close/focus-return (TagRow precedent).
            onSelect={() => setTimeout(() => deleteDialogRef.current?.open(), 0)}
          >
            <Trash2 size={14} className="mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog
        ref={deleteDialogRef}
        title={`Delete favourite "${favorite.name}"?`}
        description="This only removes the saved favourite — photos keep whatever location they already have."
        onConfirm={() => onDelete(favorite)}
      />
    </div>
  );
}

export default function FavoritesPane({
  pinCoords,
  selectedCount,
  applying,
  onApply,
  onShowOnMap,
}: FavoritesPaneProps) {
  const [favorites, setFavorites] = useState<ILocationFavorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // null = not adding; otherwise the name being typed for the new favourite
  const [addDraft, setAddDraft] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  // The add form saves the selected pin — if that pin goes away mid-add
  // (e.g. its photo got deselected), cancel the draft instead of stranding it.
  useEffect(() => {
    if (!pinCoords) setAddDraft(null);
  }, [pinCoords]);

  useEffect(() => {
    listLocationFavorites()
      .then(setFavorites)
      .catch(() =>
        toast({
          title: "Error",
          description: "Failed to load favourites",
          variant: "destructive",
        })
      )
      .finally(() => setLoading(false));
  }, []);

  const sortByName = (rows: ILocationFavorite[]) =>
    [...rows].sort((a, b) => a.name.localeCompare(b.name));

  const handleAdd = async () => {
    const name = addDraft?.trim();
    if (!name || !pinCoords) return;
    setBusy(true);
    try {
      const created = await createLocationFavorite({
        name,
        latitude: pinCoords.lat,
        longitude: pinCoords.lng,
      });
      setFavorites((prev) => sortByName([...prev, created]));
      setAddDraft(null);
      toast({ title: `Favourite "${created.name}" added` });
    } catch {
      toast({
        title: "Error",
        description: "Failed to add favourite",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async () => {
    const name = renameDraft.trim();
    if (!renamingId || !name) return;
    setBusy(true);
    try {
      const updated = await updateLocationFavorite(renamingId, { name });
      setFavorites((prev) =>
        sortByName(prev.map((f) => (f.id === updated.id ? updated : f)))
      );
      setRenamingId(null);
    } catch {
      toast({
        title: "Error",
        description: "Failed to rename favourite",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (favorite: ILocationFavorite) => {
    try {
      await deleteLocationFavorite(favorite.id);
      setFavorites((prev) => prev.filter((f) => f.id !== favorite.id));
      toast({ title: `Favourite "${favorite.name}" deleted` });
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete favourite",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="border-b">
      <div className="flex items-center justify-between px-3 pt-2">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <Star size={12} /> Favourites
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          disabled={!pinCoords || addDraft !== null}
          title={
            pinCoords
              ? "Save the selected pin as a favourite"
              : "Drop or select a pin on the map first"
          }
          onClick={() => setAddDraft("")}
        >
          <Plus size={14} className="mr-1" /> Add
        </Button>
      </div>
      <div className="px-3 pb-2 max-h-44 overflow-y-auto">
        {addDraft !== null && pinCoords && (
          <div className="flex items-center gap-1.5 py-1">
            <Input
              autoFocus
              value={addDraft}
              placeholder={`Name this location (${formatCoordinates(pinCoords)})`}
              className="h-8 text-sm"
              onChange={(e) => setAddDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") setAddDraft(null);
              }}
            />
            <Button
              size="sm"
              className="h-8 px-2 shrink-0"
              disabled={!addDraft.trim() || busy}
              onClick={handleAdd}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 shrink-0"
              onClick={() => setAddDraft(null)}
            >
              <X size={14} />
            </Button>
          </div>
        )}
        {loading ? (
          <p className="text-xs text-muted-foreground py-2">Loading…</p>
        ) : favorites.length === 0 && addDraft === null ? (
          <p className="text-xs text-muted-foreground py-2">
            No favourites yet — find a spot on the map, then hit Add to save it.
          </p>
        ) : (
          favorites.map((favorite) =>
            renamingId === favorite.id ? (
              <div key={favorite.id} className="flex items-center gap-1.5 py-1">
                <Input
                  autoFocus
                  value={renameDraft}
                  className="h-8 text-sm"
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                />
                <Button
                  size="sm"
                  className="h-8 px-2 shrink-0"
                  disabled={!renameDraft.trim() || busy}
                  onClick={handleRename}
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 shrink-0"
                  onClick={() => setRenamingId(null)}
                >
                  <X size={14} />
                </Button>
              </div>
            ) : (
              <FavoriteRow
                key={favorite.id}
                favorite={favorite}
                selectedCount={selectedCount}
                applying={applying}
                onApply={onApply}
                onShowOnMap={onShowOnMap}
                onRename={(f) => {
                  setRenamingId(f.id);
                  setRenameDraft(f.name);
                }}
                onDelete={handleDelete}
              />
            )
          )
        )}
      </div>
    </div>
  );
}
