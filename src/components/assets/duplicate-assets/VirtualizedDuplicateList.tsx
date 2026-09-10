import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { VariableSizeList as List } from 'react-window'
import { IDuplicateAssetRecord, IPartnerMatch } from '@/types/asset'
import { IAssetAlbumInfo } from '@/handlers/api/asset.handler'
import DuplicateAssetRecord from './DuplicateAssetRecord'
import { Disposition } from '@/lib/duplicates/disposition'

interface VirtualizedDuplicateListProps {
  duplicates: IDuplicateAssetRecord[]
  selectedAssets: Set<string>
  onAssetSelect: (assetId: string, isShiftClick?: boolean) => void
  onKeepSelected: (record: IDuplicateAssetRecord, selectedIds: string[], unselectedIds: string[]) => void
  onKeepAllInRecord: (record: IDuplicateAssetRecord) => void
  height: number
  selectionMode: 'keep' | 'discard'
  assetAlbums: Record<string, IAssetAlbumInfo[]>
  partnerMatches: Record<string, IPartnerMatch[]>
  disposition: Disposition
  onSkipRecord?: (record: IDuplicateAssetRecord) => void
}

interface ListItemProps {
  index: number
  style: React.CSSProperties
  data: {
    duplicates: IDuplicateAssetRecord[]
    selectedAssets: Set<string>
    onAssetSelect: (assetId: string, isShiftClick?: boolean) => void
    onKeepSelected: (record: IDuplicateAssetRecord, selectedIds: string[], unselectedIds: string[]) => void
    onKeepAllInRecord: (record: IDuplicateAssetRecord) => void
    selectionMode: 'keep' | 'discard'
    assetAlbums: Record<string, IAssetAlbumInfo[]>
    partnerMatches: Record<string, IPartnerMatch[]>
    disposition: Disposition
    onSkipRecord?: (record: IDuplicateAssetRecord) => void
    reportHeight: (index: number, height: number) => void
  }
}

const ListItem: React.FC<ListItemProps> = ({ index, style, data }) => {
  const {
    duplicates, selectedAssets, onAssetSelect, onKeepSelected,
    onKeepAllInRecord, selectionMode, assetAlbums, partnerMatches, disposition,
    onSkipRecord, reportHeight,
  } = data
  const record = duplicates[index]
  const innerRef = useRef<HTMLDivElement>(null)

  // Measure what actually rendered rather than predicting it. The row height
  // depends on how many grid columns the viewport gives us, whether the group
  // header wrapped, how many partner cards were added, and whether a long
  // filename wrapped -- every one of which the old fixed formula got wrong at
  // some width, clipping the bottom of the cards.
  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      reportHeight(index, el.getBoundingClientRect().height)
    })
    observer.observe(el)
    reportHeight(index, el.getBoundingClientRect().height)
    return () => observer.disconnect()
  }, [index, reportHeight])

  return (
    <div style={style}>
      <div ref={innerRef} style={{ padding: '0 24px' }}>
        <DuplicateAssetRecord
          record={record}
          selectedAssets={selectedAssets}
          onAssetSelect={onAssetSelect}
          onKeepSelected={onKeepSelected}
          onKeepAllInRecord={onKeepAllInRecord}
          selectionMode={selectionMode}
          assetAlbums={assetAlbums}
          partnerMatches={partnerMatches}
          disposition={disposition}
          onSkipRecord={onSkipRecord}
        />
      </div>
    </div>
  )
}

/** Tailwind's own breakpoints, because the card grid is
 *  `grid-cols-1 sm:2 md:3 lg:4 xl:5` and those are viewport-relative. */
function columnsForViewport(width: number): number {
  if (width >= 1280) return 5
  if (width >= 1024) return 4
  if (width >= 768) return 3
  if (width >= 640) return 2
  return 1
}

/** First-paint guess only — replaced by the measured height as soon as the row
 *  renders. It still counts the partner cards, which share the same grid, so
 *  the initial scrollbar isn't wildly wrong when partner compare is on. */
function estimateItemSize(
  record: IDuplicateAssetRecord,
  partnerMatches: Record<string, IPartnerMatch[]>,
  columns: number
): number {
  const partnerCount = new Set(
    record.assets.flatMap((a) => (partnerMatches[a.id] || []).map((m) => m.id))
  ).size
  const cards = record.assets.length + partnerCount
  const rows = Math.max(1, Math.ceil(cards / columns))
  const headerHeight = columns >= 5 ? 120 : 168 // the header wraps once it narrows
  return headerHeight + rows * 320 + 32
}

export default function VirtualizedDuplicateList({
  duplicates,
  selectedAssets,
  onAssetSelect,
  onKeepSelected,
  onKeepAllInRecord,
  height,
  selectionMode,
  assetAlbums,
  partnerMatches,
  disposition,
  onSkipRecord
}: VirtualizedDuplicateListProps) {
  const listRef = useRef<List>(null)
  /** index -> measured height. Indices are positional, so this is cleared
   *  whenever the list itself changes (filtering renumbers everything). */
  const measured = useRef<Record<number, number>>({})
  const [columns, setColumns] = React.useState(5)

  useEffect(() => {
    const update = () => setColumns(columnsForViewport(window.innerWidth))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    measured.current = {}
    listRef.current?.resetAfterIndex(0)
  }, [duplicates, columns])

  const reportHeight = useCallback((index: number, value: number) => {
    // Sub-pixel churn from zoom or scrollbar changes would otherwise loop:
    // resetAfterIndex re-renders, which re-measures, which resets again.
    const rounded = Math.ceil(value)
    if (!rounded || Math.abs((measured.current[index] ?? 0) - rounded) < 2) return
    measured.current[index] = rounded
    listRef.current?.resetAfterIndex(index)
  }, [])

  const getItemHeight = useCallback((index: number) => {
    if (index >= duplicates.length) return 0
    return measured.current[index] ?? estimateItemSize(duplicates[index], partnerMatches, columns)
  }, [duplicates, partnerMatches, columns])

  const itemData = useMemo(() => ({
    duplicates,
    selectedAssets,
    onAssetSelect,
    onKeepSelected,
    onKeepAllInRecord,
    selectionMode,
    assetAlbums,
    partnerMatches,
    disposition,
    onSkipRecord,
    reportHeight,
  }), [
    duplicates, selectedAssets, onAssetSelect, onKeepSelected,
    onKeepAllInRecord, selectionMode, assetAlbums, partnerMatches, disposition,
    onSkipRecord, reportHeight,
  ])

  return (
    <div style={{ height }}>
      {duplicates.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No duplicate records to display</p>
        </div>
      ) : (
        <List
          ref={listRef}
          height={height}
          width="100%"
          itemCount={duplicates.length}
          itemSize={getItemHeight}
          itemData={itemData}
          overscanCount={2}
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#cbd5e1 transparent'
          }}
        >
          {ListItem}
        </List>
      )}
    </div>
  )
}
