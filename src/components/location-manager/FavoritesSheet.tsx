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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ILocationFavorite } from "@/handlers/api/locationFavorite.handler";
import { formatCoordinates, ILatLng } from "@/lib/location-manager/coordinates";
import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  Loader2,
  MapPin,
  MoreVertical,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import React, { useRef, useState } from "react";

interface FavoritesSheetProps {
  favorites: ILocationFavorite[];
  loading: boolean;
  busy: boolean;
  /** Coordinates of the currently selected pin — the source for "Add". */
  pinCoords: ILatLng | null;
  selectedCount: number;
  applying: boolean;
  onAdd: (name: string, coords: ILatLng) => Promise<boolean>;
  onRename: (id: string, name: string) => Promise<boolean>;
  onDelete: (favorite: ILocationFavorite) => void;
  onReorder: (orderedIds: string[]) => void;
  onApply: (favorite: ILocationFavorite) => void;
  onShowOnMap: (favorite: ILocationFavorite) => void;
}

function FavoriteRow({
  favorite,
  index,
  count,
  selectedCount,
  applying,
  dragOver,
  onApply,
  onShowOnMap,
  onRename,
  onDelete,
  onMove,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
}: {
  favorite: ILocationFavorite;
  index: number;
  count: number;
  selectedCount: number;
  applying: boolean;
  dragOver: boolean;
  onApply: (favorite: ILocationFavorite) => void;
  onShowOnMap: (favorite: ILocationFavorite) => void;
  onRename: (favorite: ILocationFavorite) => void;
  onDelete: (favorite: ILocationFavorite) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDragStart: (index: number) => void;
  onDragEnter: (index: number) => void;
  onDragEnd: () => void;
  onDrop: (index: number) => void;
}) {
  const deleteDialogRef = useRef<IAlertDialogActions>(null);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart(index);
      }}
      onDragEnter={() => onDragEnter(index)}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
      onDrop={() => onDrop(index)}
      className={`flex items-center gap-1 py-1 rounded ${
        dragOver ? "border-t-2 border-primary" : "border-t-2 border-transparent"
      }`}
    >
      <GripVertical
        size={14}
        className="shrink-0 text-muted-foreground/60 cursor-grab"
      />
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
          <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(index, -1)}>
            <ArrowUp size={14} className="mr-2" /> Move up
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index === count - 1}
            onSelect={() => onMove(index, 1)}
          >
            <ArrowDown size={14} className="mr-2" /> Move down
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

export default function FavoritesSheet({
  favorites,
  loading,
  busy,
  pinCoords,
  selectedCount,
  applying,
  onAdd,
  onRename,
  onDelete,
  onReorder,
  onApply,
  onShowOnMap,
}: FavoritesSheetProps) {
  const [open, setOpen] = useState(false);
  // null = not adding; otherwise the name being typed for the new favourite
  const [addDraft, setAddDraft] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleAdd = async () => {
    const name = addDraft?.trim();
    if (!name || !pinCoords) return;
    if (await onAdd(name, pinCoords)) setAddDraft(null);
  };

  const handleRename = async () => {
    const name = renameDraft.trim();
    if (!renamingId || !name) return;
    if (await onRename(renamingId, name)) setRenamingId(null);
  };

  // `to` is an insert-before index in the ORIGINAL array (favorites.length
  // means "move to the end") — matches the border-top drop indicator.
  const moveTo = (from: number, to: number) => {
    if (from < 0 || to < 0 || to > favorites.length) return;
    const ids = favorites.map((f) => f.id);
    const [moved] = ids.splice(from, 1);
    const insertAt = to > from ? to - 1 : to;
    if (insertAt === from) return;
    ids.splice(insertAt, 0, moved);
    onReorder(ids);
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex !== null) moveTo(dragIndex, targetIndex);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setAddDraft(null);
          setRenamingId(null);
        }
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-start">
          <Star size={14} className="mr-2" />
          Favourites
          {favorites.length > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              {favorites.length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col w-[380px] sm:max-w-[380px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Star size={16} /> Favourite locations
          </SheetTitle>
          <SheetDescription>
            Saved spots you tag photos with often. Drag to reorder — the same
            order shows in the Favourites menu at the bottom of the page.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-1 pt-2">
          {addDraft === null ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!pinCoords}
              title={
                pinCoords
                  ? "Save the selected pin as a favourite"
                  : "Drop or select a pin on the map first"
              }
              onClick={() => setAddDraft("")}
            >
              <Plus size={14} className="mr-1" /> Add favourite
              {pinCoords && (
                <span className="ml-2 text-xs text-muted-foreground truncate">
                  {formatCoordinates(pinCoords)}
                </span>
              )}
            </Button>
          ) : (
            pinCoords && (
              <div className="flex items-center gap-1.5">
                <Input
                  autoFocus
                  value={addDraft}
                  placeholder="Name this location (e.g. Home)"
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
            )
          )}
          {!pinCoords && addDraft === null && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin size={12} className="shrink-0" />
              To add one: close this panel, put a pin where you want it, reopen.
            </p>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto mt-2">
          {loading ? (
            <p className="text-xs text-muted-foreground py-2">Loading…</p>
          ) : favorites.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No favourites yet — find a spot on the map, then add it here.
            </p>
          ) : (
            favorites.map((favorite, index) =>
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
                  index={index}
                  count={favorites.length}
                  selectedCount={selectedCount}
                  applying={applying}
                  dragOver={dragOverIndex === index && dragIndex !== index}
                  onApply={onApply}
                  onShowOnMap={(f) => {
                    onShowOnMap(f);
                    setOpen(false);
                  }}
                  onRename={(f) => {
                    setRenamingId(f.id);
                    setRenameDraft(f.name);
                  }}
                  onDelete={onDelete}
                  onMove={(i, direction) =>
                    moveTo(i, direction === -1 ? i - 1 : i + 2)
                  }
                  onDragStart={setDragIndex}
                  onDragEnter={setDragOverIndex}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDrop={handleDrop}
                />
              )
            )
          )}
          {/* Drop zone for dragging a favourite to the very end of the list. */}
          {dragIndex !== null && (
            <div
              className={`h-6 rounded ${
                dragOverIndex === favorites.length
                  ? "border-t-2 border-primary"
                  : "border-t-2 border-transparent"
              }`}
              onDragEnter={() => setDragOverIndex(favorites.length)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(favorites.length)}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
