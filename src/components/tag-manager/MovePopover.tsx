import React, { useState } from "react";
import { Check, FolderTree } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ITag } from "@/handlers/api/tag.handler";
import { getSubtreeIds } from "@/lib/tag-manager/tree";

/**
 * "Move to…" — nest a tag under a different parent, or un-nest it to top
 * level. Excludes the tag itself and its own descendants (would cycle).
 */
export default function MovePopover({
  tag,
  allTags,
  onMove,
  disabled,
}: {
  tag: ITag;
  allTags: ITag[];
  onMove: (newParentId: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const forbidden = getSubtreeIds(allTags, tag.id);
  const candidates = allTags.filter((t) => !forbidden.has(t.id));

  const choose = (id: string | null) => {
    setOpen(false);
    if (id !== tag.parentId) onMove(id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Move to…" disabled={disabled}>
          <FolderTree size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search tags…" />
          <CommandList>
            <CommandEmpty>No matching tags.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__top-level__" onSelect={() => choose(null)}>
                {tag.parentId === null && <Check size={14} className="mr-2" />}
                <span className={tag.parentId === null ? "" : "ml-6"}>— Top level —</span>
              </CommandItem>
              {candidates.map((c) => (
                <CommandItem key={c.id} value={c.value} onSelect={() => choose(c.id)}>
                  {tag.parentId === c.id && <Check size={14} className="mr-2" />}
                  <span className={tag.parentId === c.id ? "" : "ml-6"}>{c.value}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
