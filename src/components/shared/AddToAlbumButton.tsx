import { FolderPlus, Loader2, Plus } from "lucide-react";
import React, { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/use-toast";
import { addAssetToAlbum, createAlbumWithAssets, listAlbums } from "@/handlers/api/album.handler";
import { IAlbum } from "@/types/album";

interface AddToAlbumButtonProps {
  assetIds: string[];
  /** Sizing passed in so the button matches whichever bar it sits in. */
  buttonClassName?: string;
  iconSize?: number;
  disabled?: boolean;
  onAdded?: () => void;
}

/** "Add to album" for a selection: pick an existing album, or type a name that
 *  doesn't exist yet and create it with these photos already in it. */
export default function AddToAlbumButton({
  assetIds,
  buttonClassName,
  iconSize = 16,
  disabled,
  onAdded,
}: AddToAlbumButtonProps) {
  const [open, setOpen] = useState(false);
  const [albums, setAlbums] = useState<IAlbum[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  // Refetch each time it's opened — an album created elsewhere (or by this
  // button a moment ago) should show up without a page reload.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listAlbums({ sortBy: "albumName", sortOrder: "asc", includeShared: true })
      .then((data) => setAlbums(data || []))
      .catch(() => toast({ title: "Error", description: "Couldn't load albums.", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [open]);

  const trimmed = query.trim();
  const exactExists = albums.some((a) => a.albumName.toLowerCase() === trimmed.toLowerCase());

  const finish = (message: string) => {
    toast({ title: "Added", description: message });
    setOpen(false);
    setQuery("");
    onAdded?.();
  };

  const addToExisting = async (album: IAlbum) => {
    setSaving(true);
    try {
      await addAssetToAlbum(album.id, assetIds);
      finish(`${assetIds.length} photo${assetIds.length === 1 ? "" : "s"} → "${album.albumName}"`);
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Couldn't add to that album.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const createWith = async () => {
    setSaving(true);
    try {
      await createAlbumWithAssets(trimmed, assetIds);
      finish(`Created "${trimmed}" with ${assetIds.length} photo${assetIds.length === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Couldn't create that album.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className={buttonClassName}
          title="Add selection to an album"
          disabled={disabled || !assetIds.length}
        >
          {saving ? <Loader2 size={iconSize} className="animate-spin" /> : <FolderPlus size={iconSize} />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 z-[10000]" align="center" side="top">
        <Command>
          <CommandInput
            placeholder="Find or name an album..."
            className="text-xs"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {!loading && <CommandEmpty>No matching album.</CommandEmpty>}
            <CommandGroup heading={loading ? "Loading albums…" : "Albums"}>
              {albums.map((album) => (
                <CommandItem
                  key={album.id}
                  value={album.albumName}
                  onSelect={() => addToExisting(album)}
                  disabled={saving}
                  className="flex items-center gap-2"
                >
                  <span className="text-xs truncate flex-1">{album.albumName}</span>
                  {typeof album.assetCount === "number" && (
                    <span className="text-[10px] text-muted-foreground">{album.assetCount}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>

          {/* Deliberately outside <CommandList>: cmdk hides a group when none
              of its items match the search, which takes any item inside it with
              them — including the create row, exactly when a name matches no
              album and you most need it. Sitting outside the list, it isn't
              filtered at all. A plain button rather than a CommandItem for the
              same reason. */}
          {trimmed && !exactExists && (
            <div className="border-t p-1">
              <button
                type="button"
                onClick={createWith}
                disabled={saving}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                <Plus className="h-3 w-3 shrink-0" />
                <span className="text-xs truncate">
                  Create album &ldquo;{trimmed}&rdquo;
                </span>
              </button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
