import { ArrowDown, ArrowUp, GripVertical, Loader2, RotateCcw } from 'lucide-react'
import React, { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  IRankingRow, RANKING_CRITERIA, isDefaultRanking,
} from '@/lib/duplicates/ranking'
import { cn } from '@/lib/utils'

interface RankingEditorProps {
  ranking: IRankingRow[]
  onChange: (ranking: IRankingRow[]) => void
  onReset: () => void
  saving?: boolean
}

/** Which badge a criterion gets, so the weight of a decision is visible in the
 *  list rather than buried in the auto-pick summary. */
const KIND_BADGE: Record<string, { label: string; className: string }> = {
  substantive: {
    label: 'quality',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  },
  preference: {
    label: 'preference',
    className: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  },
  cosmetic: {
    label: 'tiebreak',
    className: 'bg-amber-500/15 text-amber-700 dark:text-amber-500',
  },
}

/**
 * Drag-to-reorder list of the criteria auto-pick uses to choose a keeper.
 *
 * Native HTML5 drag rather than a drag-and-drop dependency, with Up/Down
 * buttons alongside — the buttons are not a fallback for a broken drag, they
 * are the keyboard-reachable path, and on a ten-row list they are often
 * quicker anyway.
 */
export default function RankingEditor({ ranking, onChange, onReset, saving }: RankingEditorProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const move = (from: number, to: number) => {
    if (to < 0 || to >= ranking.length || from === to) return
    const next = [...ranking]
    const [row] = next.splice(from, 1)
    next.splice(to, 0, row)
    onChange(next)
  }

  const update = (index: number, patch: Partial<IRankingRow>) => {
    onChange(ranking.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const enabledCount = ranking.filter((r) => r.enabled).length

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Evaluated top to bottom. The first criterion that separates two copies decides,
          so order is what matters most.
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={onReset}
          disabled={saving || isDefaultRanking(ranking)}
          title="Restore the default order"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
          <span className="ml-1">Reset</span>
        </Button>
      </div>

      {enabledCount === 0 && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-muted-foreground">
          Every criterion is switched off, so auto-pick has nothing to rank on. It will
          still resolve each group to one copy, but the choice will be arbitrary.
        </p>
      )}

      <TooltipProvider delayDuration={300}>
        <ul className="space-y-1">
          {ranking.map((row, index) => {
            const criterion = RANKING_CRITERIA[row.key]
            const badge = KIND_BADGE[criterion.kind]
            return (
              <li
                key={row.key}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragEnd={() => { setDragIndex(null); setOverIndex(null) }}
                onDragOver={(e) => { e.preventDefault(); setOverIndex(index) }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragIndex !== null) move(dragIndex, index)
                  setDragIndex(null)
                  setOverIndex(null)
                }}
                className={cn(
                  'flex items-center gap-2 rounded-md border bg-background px-2 py-1.5',
                  dragIndex === index && 'opacity-40',
                  overIndex === index && dragIndex !== null && dragIndex !== index && 'border-blue-500',
                  !row.enabled && 'opacity-60'
                )}
              >
                <GripVertical size={14} className="shrink-0 cursor-grab text-muted-foreground" />
                <span className="w-4 shrink-0 text-center text-[10px] tabular-nums text-muted-foreground">
                  {index + 1}
                </span>

                <TooltipRoot>
                  <TooltipTrigger asChild>
                    <div className="min-w-0 flex-1 cursor-help">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium">{criterion.label}</span>
                        <span className={cn('rounded px-1 py-px text-[9px] font-medium', badge.className)}>
                          {badge.label}
                        </span>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">
                    <p className="text-xs">{criterion.hint}</p>
                  </TooltipContent>
                </TooltipRoot>

                {/* Direction. Disabled rows keep their setting visible rather
                    than hiding it, so switching one back on is not a surprise. */}
                <select
                  value={row.direction}
                  onChange={(e) => update(index, { direction: e.target.value as 'desc' | 'asc' })}
                  disabled={!row.enabled}
                  className="h-6 shrink-0 rounded border bg-background px-1 text-[11px] disabled:opacity-50"
                >
                  <option value="desc">{criterion.directions[0]}</option>
                  <option value="asc">{criterion.directions[1]}</option>
                </select>

                <div className="flex shrink-0 items-center">
                  <Button
                    size="sm" variant="ghost" className="h-6 w-6 p-0"
                    onClick={() => move(index, index - 1)}
                    disabled={index === 0}
                    title="Move up"
                  >
                    <ArrowUp size={12} />
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="h-6 w-6 p-0"
                    onClick={() => move(index, index + 1)}
                    disabled={index === ranking.length - 1}
                    title="Move down"
                  >
                    <ArrowDown size={12} />
                  </Button>
                </div>

                <Switch
                  checked={row.enabled}
                  onCheckedChange={(enabled) => update(index, { enabled })}
                  className="shrink-0 scale-90 data-[state=unchecked]:bg-gray-300 dark:data-[state=unchecked]:bg-gray-600 data-[state=checked]:bg-blue-600 dark:data-[state=checked]:bg-blue-500"
                />
              </li>
            )
          })}
        </ul>
      </TooltipProvider>
    </div>
  )
}
