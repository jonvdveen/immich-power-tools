import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { listAlbums } from "@/handlers/api/album.handler";
import { listTags, ITag } from "@/handlers/api/tag.handler";
import { IAlbum } from "@/types/album";
import { useEffect, useState } from "react";

interface ActionConfigProps {
  subType: string;
  config: any;
  onChange: (config: any) => void;
}

const templateVars = ["{city}", "{date}", "{person}", "{camera}", "{state}", "{country}"];

/** Single-tag chooser for the tag actions. Lists tags by their full path, so
 *  sub-tags are both reachable and distinguishable from a same-named sibling
 *  under a different parent. Tag ids change when a tag is moved or renamed
 *  (see lib/tag-manager/move.ts), so the path is stored alongside the id to
 *  give the executor something to fall back on and the node something to show. */
function TagPicker({
  value,
  fallbackLabel,
  onChange,
}: {
  value: string | undefined;
  fallbackLabel?: string;
  onChange: (tagId: string, tagValue: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<ITag[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    listTags()
      .then((res) => setTags(res.tags || []))
      .catch(() => setTags([]))
      .finally(() => setLoading(false));
  }, []);

  const selected = tags.find((t) => t.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex items-center gap-2 h-9 px-3 w-full border rounded text-sm bg-background hover:bg-muted transition-colors text-left">
          {selected ? (
            <span className="truncate">{selected.value}</span>
          ) : fallbackLabel ? (
            // An older action that stored a typed-in name. Show it, flagged, so
            // it's obvious the tag needs re-picking rather than silently blank.
            <span className="truncate text-amber-600 dark:text-amber-500">
              {fallbackLabel} — re-select
            </span>
          ) : (
            <span className="text-muted-foreground">{loading ? "Loading tags…" : "Select tag..."}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 z-[10000]" align="start">
        <Command>
          <CommandInput placeholder="Search tags..." className="text-xs" />
          <CommandList>
            <CommandEmpty>{loading ? "Loading..." : "No tags found."}</CommandEmpty>
            <CommandGroup>
              {tags.map((tag) => (
                <CommandItem
                  key={tag.id}
                  value={tag.value}
                  onSelect={() => {
                    onChange(tag.id, tag.value);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <span className="text-xs truncate flex-1">{tag.value}</span>
                  <Check className={cn("h-3 w-3", value === tag.id ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AlbumPicker({ value, onChange }: { value: string | undefined; onChange: (albumId: string, albumName: string) => void }) {
  const [open, setOpen] = useState(false);
  const [albums, setAlbums] = useState<IAlbum[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<IAlbum | null>(null);

  useEffect(() => {
    setLoading(true);
    // Shared albums are included so this action can add assets to albums the
    // user has editor (upload) access to, not just ones they own. Sorted by
    // name so the picker is a lookup rather than a scan.
    listAlbums({ sortBy: "albumName", sortOrder: "asc", includeShared: true })
      .then((data) => {
        setAlbums(data);
        if (value) {
          const found = data.find((a: IAlbum) => a.id === value);
          if (found) setSelectedAlbum(found);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const ownedAlbums = albums.filter((a) => a.myRole !== "editor");
  const sharedAlbums = albums.filter((a) => a.myRole === "editor");

  const renderItem = (album: IAlbum) => (
    <CommandItem
      key={album.id}
      value={album.albumName}
      onSelect={() => {
        setSelectedAlbum(album);
        onChange(album.id, album.albumName);
        setOpen(false);
      }}
      className="flex items-center gap-2"
    >
      <span className="text-xs truncate flex-1">{album.albumName}</span>
      <Check className={cn("h-3 w-3", value === album.id ? "opacity-100" : "opacity-0")} />
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex items-center gap-2 h-9 px-3 w-full border rounded text-sm bg-background hover:bg-muted transition-colors text-left">
          {selectedAlbum ? (
            <span className="truncate">{selectedAlbum.albumName}</span>
          ) : (
            <span className="text-muted-foreground">Select album...</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0 z-[10000]" align="start">
        <Command>
          <CommandInput placeholder="Search albums..." className="text-xs" />
          <CommandList>
            <CommandEmpty>{loading ? "Loading..." : "No albums found."}</CommandEmpty>
            {ownedAlbums.length > 0 && (
              <CommandGroup heading="My Albums">
                {ownedAlbums.map(renderItem)}
              </CommandGroup>
            )}
            {sharedAlbums.length > 0 && (
              <CommandGroup heading="Shared Albums">
                {sharedAlbums.map(renderItem)}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function ActionConfig({ subType, config, onChange }: ActionConfigProps) {
  if (subType === "create_album") {
    return (
      <div className="space-y-2">
        <Label className="text-xs">Album Name Template</Label>
        <Input
          className="h-9 text-sm"
          placeholder="Trip to {city} - {date}"
          value={config.nameTemplate || ""}
          onChange={(e) => onChange({ ...config, nameTemplate: e.target.value })}
        />
        <div className="flex flex-wrap gap-1">
          {templateVars.map((v) => (
            <Badge
              key={v}
              variant="outline"
              className="text-[10px] cursor-pointer hover:bg-muted"
              onClick={() => onChange({ ...config, nameTemplate: (config.nameTemplate || "") + v })}
            >
              {v}
            </Badge>
          ))}
        </div>
      </div>
    );
  }

  if (subType === "add_to_album" || subType === "remove_from_album" || subType === "update_album") {
    return (
      <div className="space-y-2">
        <Label className="text-xs">Album</Label>
        <AlbumPicker
          value={config.albumId}
          onChange={(albumId, albumName) => onChange({ ...config, albumId, albumName })}
        />
      </div>
    );
  }

  if (subType === "tag" || subType === "remove_tag" || subType === "update_tag") {
    return (
      <div className="space-y-2">
        <Label className="text-xs">Tag</Label>
        <TagPicker
          value={config.tagId}
          fallbackLabel={config.tagName}
          onChange={(tagId, tagValue) => onChange({ ...config, tagId, tagValue, tagName: undefined })}
        />
        <p className="text-[10px] text-muted-foreground">
          {subType === "tag"
            ? "Applies this tag to the matched photos."
            : subType === "remove_tag"
              ? "Takes this tag off the matched photos."
              : "Applies this tag to the matched photos and takes it off any other photo that has it."}
          {" "}Only ever changes which photos carry the tag — it never creates,
          renames or deletes the tag itself. Create tags in Tag Manager.
        </p>
      </div>
    );
  }

  // favorite, unfavorite, archive — no config needed
  return <p className="text-xs text-muted-foreground">No configuration needed.</p>;
}
