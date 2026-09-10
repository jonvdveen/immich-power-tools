import React, { useMemo } from 'react'
import { IDuplicateAssetRecord, IDuplicateAsset, IPartnerMatch } from '@/types/asset'
import { ASSET_THUMBNAIL_PATH } from '@/config/routes'
import LazyImage from '@/components/ui/lazy-image'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { humanizeBytes, humanizeNumber } from '@/helpers/string.helper'
import { formatDate } from '@/helpers/date.helper'
import { Camera, Calendar, EyeOff, FolderOpen, HardDrive, HelpCircle, Layers, Lock, MapPin, Trash2, Tag, Check, X, Shield, Users } from 'lucide-react'
import { IAssetAlbumInfo } from '@/handlers/api/asset.handler'
import { cn } from '@/lib/utils'
import { DISPOSITIONS, Disposition } from '@/lib/duplicates/disposition'

interface DuplicateAssetRecordProps {
  record: IDuplicateAssetRecord
  selectedAssets: Set<string>
  onAssetSelect: (assetId: string, isShiftClick?: boolean) => void
  onKeepSelected: (record: IDuplicateAssetRecord, selectedIds: string[], unselectedIds: string[]) => void
  onKeepAllInRecord: (record: IDuplicateAssetRecord) => void
  selectionMode: 'keep' | 'discard'
  assetAlbums: Record<string, IAssetAlbumInfo[]>
  partnerMatches: Record<string, IPartnerMatch[]>
  /** What happens to the copies that aren't kept. Drives the per-group action
   *  wording, so the buttons say trash/tag/stack rather than a generic verb. */
  disposition: Disposition
  /** Hide this group from the current pass without telling Immich anything.
   *  Distinct from "not duplicates", which is a permanent write. */
  onSkipRecord?: (record: IDuplicateAssetRecord) => void
}

interface DuplicateAssetItemProps {
  asset: IDuplicateAsset
  isSelected: boolean
  onSelect: (assetId: string, isShiftClick?: boolean) => void
  selectionMode: 'keep' | 'discard'
  albums: IAssetAlbumInfo[]
  /** Whether anything in this asset's group has been picked yet. Until
   *  something is, no card gets a KEEP/DISCARD verdict — see the badge below. */
  groupHasSelection: boolean
}


/** A copy living in a partner's library. Deliberately has no checkbox: it is
 *  not the current user's asset, they have no permission to delete it, and it
 *  must never become the "keeper" (that would discard every copy they DO own).
 *  Shown so they can see the photo is already held elsewhere. */
function PartnerMatchCard({
  match,
  isKeeper,
  canBeKeeper,
  onSelect,
}: {
  match: IPartnerMatch
  isKeeper: boolean
  canBeKeeper: boolean
  onSelect: (assetId: string) => void
}) {
  return (
    <div className={cn(
      'border border-dashed rounded-lg overflow-hidden relative',
      isKeeper ? 'border-green-600 border-solid ring-2 ring-green-600/40' : 'opacity-90'
    )}>
      <div className="relative">
        <LazyImage
          src={ASSET_THUMBNAIL_PATH(match.id)}
          alt={match.originalFileName}
          title={match.originalFileName}
          style={{ width: '100%', height: '200px', objectFit: 'cover' }}
        />
        <div className={cn(
          'absolute top-2 right-2 text-white text-xs px-2 py-1 rounded font-bold flex items-center gap-1',
          isKeeper ? 'bg-green-600' : 'bg-sky-700'
        )}>
          {isKeeper ? <><Shield size={12} /> KEEP (PARTNER&apos;S)</> : <><Users size={12} /> PARTNER</>}
        </div>
        {canBeKeeper ? (
          // Selectable as the keeper only. It can never be the discarded copy —
          // this tool has no permission to delete another user's asset — so the
          // checkbox only ever means "keep theirs, drop mine".
          <Checkbox
            checked={isKeeper}
            onClick={(e) => { e.preventDefault(); onSelect(match.id) }}
            title="Keep this copy and discard your own"
            className="absolute top-2 left-2 w-6 h-6 rounded-full border-gray-300"
          />
        ) : (
          <div className="absolute top-2 left-2 bg-gray-900/80 text-white rounded-full p-1" title="Switch to Keep mode to choose a partner's copy. It can never be deleted from here.">
            <Lock size={12} />
          </div>
        )}
        <div className="absolute bottom-0 w-full bg-gray-800/70 text-white text-center text-xs font-bold py-1">
          {match.ownerName}
        </div>
      </div>
      <div className="p-3 space-y-1">
        <p className="text-xs font-medium truncate" title={match.originalFileName}>{match.originalFileName}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <HardDrive size={12} /> {humanizeBytes(match.fileSizeInByte)}
          {match.width > 0 && <> · {match.width} x {match.height}</>}
        </p>
        <p className="text-xs text-muted-foreground">
          {isKeeper
            ? `Keeping ${match.ownerName}'s copy — yours will be discarded`
            : `In ${match.ownerName}'s library — can't be deleted here`}
        </p>
      </div>
    </div>
  )
}

function DuplicateAssetItem({ asset, isSelected, onSelect, selectionMode, albums, groupHasSelection }: DuplicateAssetItemProps) {
  const handleCheckboxChange = (event: React.MouseEvent) => {
    const isShiftClick = event.shiftKey
    onSelect(asset.id, isShiftClick)
  }

  return (
    <div className="border rounded-lg overflow-hidden shadow-lg relative group">
      <label className="block relative cursor-pointer">
        <LazyImage
          src={ASSET_THUMBNAIL_PATH(asset.id)}
          alt={asset.originalFileName}
          title={asset.originalFileName}
          style={{
            width: '100%',
            height: '200px',
            objectFit: 'cover',
          }}
        />
        
        {/* Overlay info */}
        <div className="absolute bottom-0 w-full bg-gray-800/70 text-white text-center text-xs font-bold py-1 group-hover:hidden">
          {formatDate(asset.exifInfo.dateTimeOriginal?.toString(), 'MMM d, yyyy')}
        </div>
        
        {/* Keep/Trash label. Nothing picked in this group yet means there is no
            decision to report: the page opens with an empty selection, and
            labelling every card DISCARD (or, in discard mode, KEEP) read as a
            verdict the tool had not actually made — on a screen whose whole
            job is deleting things. Stay neutral until the user picks. */}
        <div className="absolute top-2 right-2">
          {!groupHasSelection ? (
            <div
              className="bg-gray-600/90 text-white text-xs px-2 py-1 rounded font-bold flex items-center gap-1"
              title={selectionMode === 'keep'
                ? 'Nothing picked yet — tick the copy you want to keep'
                : 'Nothing picked yet — tick the copies you want to discard'}
            >
              <HelpCircle size={12} />
              UNDECIDED
            </div>
          ) : selectionMode === 'keep' ? (
            isSelected ? (
              <div className="bg-green-600 text-white text-xs px-2 py-1 rounded font-bold flex items-center gap-1">
                <Shield size={12} />
                KEEP
              </div>
            ) : (
              <div className="bg-red-600 text-white text-xs px-2 py-1 rounded font-bold flex items-center gap-1">
                <Trash2 size={12} />
                DISCARD
              </div>
            )
          ) : (
            isSelected ? (
              <div className="bg-red-600 text-white text-xs px-2 py-1 rounded font-bold flex items-center gap-1">
                <Trash2 size={12} />
                DISCARD
              </div>
            ) : (
              <div className="bg-green-600 text-white text-xs px-2 py-1 rounded font-bold flex items-center gap-1">
                <Shield size={12} />
                KEEP
              </div>
            )
          )}
        </div>
        
        {/* Checkbox */}
        <Checkbox
          checked={isSelected}
          onClick={handleCheckboxChange}
          className="absolute top-2 left-2 w-6 h-6 rounded-full border-gray-300 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        />
        
        {/* Asset type indicator */}
        {asset.type === 'VIDEO' && (
          <div className="absolute top-12 right-2 bg-gray-800 text-white text-xs py-1 px-2 rounded">
            VIDEO
          </div>
        )}
      </label>
      
      {/* Asset details */}
      <div className={`p-3 ${isSelected ? 'bg-blue-500' : ''}`}>
        <h3 className={`text-sm font-semibold truncate ${isSelected ? 'text-white' : ''}`}>
          {asset.originalFileName}
        </h3>
        <p className={`text-xs truncate ${isSelected ? 'text-white/70' : 'text-gray-500 dark:text-gray-500'}`} title={asset.originalPath}>
          {asset.originalPath.substring(0, asset.originalPath.lastIndexOf('/'))}
        </p>

        <div className="mt-2 space-y-1">
          <div className={`flex items-center gap-1 text-xs ${isSelected ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`}>
            <HardDrive size={12} />
            {humanizeBytes(asset.exifInfo.fileSizeInByte)}
          </div>
          
          <div className={`flex items-center gap-1 text-xs ${isSelected ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`}>
            <Camera size={12} />
            {asset.exifInfo.exifImageWidth} × {asset.exifInfo.exifImageHeight}
          </div>
          
          {asset.exifInfo.city && (
            <div className={`flex items-center gap-1 text-xs ${isSelected ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`}>
              <MapPin size={12} />
              {asset.exifInfo.city}, {asset.exifInfo.country}
            </div>
          )}
          
          {asset.exifInfo.make && asset.exifInfo.model && (
            <div className={`text-xs ${isSelected ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`}>
              {asset.exifInfo.make} {asset.exifInfo.model}
            </div>
          )}

          {albums.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {albums.map((album) => (
                <Badge
                  key={album.albumId}
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 gap-0.5"
                >
                  <FolderOpen size={10} />
                  {album.albumName}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DuplicateAssetRecord({ 
  record, 
  selectedAssets, 
  onAssetSelect, 
  onKeepSelected,
  partnerMatches,
  onKeepAllInRecord,
  selectionMode,
  assetAlbums,
  disposition,
  onSkipRecord
}: DuplicateAssetRecordProps) {
  const recordAssetIds = record.assets.map(asset => asset.id)
  const partnerIdsInRecord = useMemo(() => Array.from(new Set(
    record.assets.flatMap(a => (partnerMatches[a.id] || []).map(m => m.id))
  )), [record.assets, partnerMatches])
  const selectedPartnerIds = partnerIdsInRecord.filter(id => selectedAssets.has(id))
  const selectedInRecord = recordAssetIds.filter(id => selectedAssets.has(id)).length
  const unselectedInRecord = record.assets.length - selectedInRecord
  
  // Calculate total size and selected/unselected sizes
  const totalSize = useMemo(() => {
    return record.assets.reduce((sum, asset) => sum + asset.exifInfo.fileSizeInByte, 0)
  }, [record.assets])
  
  const selectedSize = useMemo(() => {
    return record.assets
      .filter(asset => selectedAssets.has(asset.id))
      .reduce((sum, asset) => sum + asset.exifInfo.fileSizeInByte, 0)
  }, [record.assets, selectedAssets])
  
  const unselectedSize = useMemo(() => {
    return record.assets
      .filter(asset => !selectedAssets.has(asset.id))
      .reduce((sum, asset) => sum + asset.exifInfo.fileSizeInByte, 0)
  }, [record.assets, selectedAssets])

  /** Wording for the apply button and its confirm dialog. Every disposition
   *  affects a different set and carries a different promise, so this is
   *  derived rather than templated over a single verb — "cannot be undone" is
   *  only true of the old permanent delete, and none of these do that. */
  /** How to describe the copies that are NOT being kept. The old page could
   *  only delete, so this line was hardcoded to "to delete" -- which read as a
   *  deletion warning even in Tag mode, where nothing is removed at all. Only
   *  trash frees space, so only trash claims a saving. */
  const discardWord = useMemo(() => {
    if (disposition === 'tag') return { verb: 'to tag', savings: false, Icon: Tag }
    if (disposition === 'stack') return { verb: 'to stack', savings: false, Icon: Layers }
    return { verb: 'to trash', savings: true, Icon: Trash2 }
  }, [disposition])

  const applyBlocked = disposition === 'stack' && selectedPartnerIds.length > 0

  const applyCopy = useMemo(() => {
    const keeping = selectionMode === 'keep'
      ? selectedInRecord + selectedPartnerIds.length
      : unselectedInRecord
    const affected = selectionMode === 'keep' ? unselectedInRecord : selectedInRecord
    const affectedSize = selectionMode === 'keep' ? unselectedSize : selectedSize

    if (disposition === 'tag') {
      return {
        button: `Tag ${affected} other${affected === 1 ? '' : 's'}`,
        title: 'Tag the copies you are not keeping',
        description: `Keeps ${keeping} cop${keeping === 1 ? 'y' : 'ies'} and tags the other ${affected}. Nothing is moved or deleted — the tagged copies stay in your library so you can review them in Immich.`,
      }
    }
    if (disposition === 'stack') {
      const blocked = selectedPartnerIds.length > 0
      return {
        button: blocked ? 'Cannot stack' : `Stack ${record.assets.length} copies`,
        title: blocked ? 'Cannot stack this group' : 'Stack this group?',
        description: blocked
          ? "The keeper is a partner's copy, and Immich can only stack assets you own. Pick one of your own copies as the keeper, or switch the disposition to Trash or Tag."
          : `Collapses all ${record.assets.length} copies into one timeline entry behind the one you kept. Nothing is deleted, nothing is tagged, and you can unstack in Immich at any time.`,
      }
    }
    return {
      button: `Trash ${affected} other${affected === 1 ? '' : 's'}`,
      title: 'Move the other copies to trash?',
      description: `Keeps ${keeping} cop${keeping === 1 ? 'y' : 'ies'} and moves the other ${affected} to Immich's trash${affectedSize > 0 ? ` (${humanizeBytes(affectedSize)})` : ''}. They stay recoverable until you empty the trash in Immich.`,
    }
  }, [disposition, selectionMode, selectedInRecord, unselectedInRecord, selectedSize, unselectedSize, selectedPartnerIds.length, record.assets.length])

  const handleKeepAll = () => {
    onKeepAllInRecord(record)
  }

  const handleKeepSelected = () => {
    const selectedAssetIds = record.assets
      .filter(asset => selectedAssets.has(asset.id))
      .map(asset => asset.id)
    
    const unselectedAssetIds = record.assets
      .filter(asset => !selectedAssets.has(asset.id))
      .map(asset => asset.id)
    
    // A partner's copy counts as a keeper on its own: choosing it means "they
    // have this, drop mine", so every copy the user owns here is discarded.
    // It can only ever be a keeper -- the tool cannot delete another user's
    // asset -- so this applies in keep mode only.
    if (selectionMode === 'keep' && selectedPartnerIds.length > 0) {
      onKeepSelected(record, [...selectedAssetIds, ...selectedPartnerIds], unselectedAssetIds)
      return
    }

    if (selectedAssetIds.length === 0) return

    if (selectionMode === 'keep') {
      // Keep selected, delete unselected
      onKeepSelected(record, selectedAssetIds, unselectedAssetIds)
    } else {
      // Delete selected, keep unselected
      onKeepSelected(record, unselectedAssetIds, selectedAssetIds)
    }
  }

  return (
    <div className="mb-8">
      <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <Camera size={16} />
              {humanizeNumber(record.assets.length)} duplicate{record.assets.length !== 1 ? 's' : ''}
            </div>
            <div className="flex items-center gap-1">
              <HardDrive size={16} />
              {humanizeBytes(totalSize)} total
            </div>
                      {selectedInRecord > 0 && (
            <div className="flex items-center gap-2 text-sm">
              {selectionMode === 'keep' ? (
                <>
                  <div className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
                    <Shield size={16} />
                    {selectedInRecord} to keep ({humanizeBytes(selectedSize)})
                  </div>
                  <div className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                    <discardWord.Icon size={16} />
                    {unselectedInRecord} {discardWord.verb} ({humanizeBytes(unselectedSize)}{discardWord.savings ? ' savings' : ''})
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                    <discardWord.Icon size={16} />
                    {selectedInRecord} {discardWord.verb} ({humanizeBytes(selectedSize)}{discardWord.savings ? ' savings' : ''})
                  </div>
                  <div className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
                    <Shield size={16} />
                    {unselectedInRecord} to keep ({humanizeBytes(unselectedSize)})
                  </div>
                </>
              )}
            </div>
          )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
              {onSkipRecord && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1"
                  title="Hide this group for now. Nothing is written to Immich, and you can restore it from Options."
                  onClick={() => onSkipRecord(record)}
                >
                  <EyeOff size={16} />
                  Skip
                </Button>
              )}

              <AlertDialog
                title="Mark as not duplicates?"
                description={`All ${record.assets.length} copies stay exactly as they are, and Immich stops grouping them. This clears the group in Immich itself, so it will not come back — use Skip instead if you only want it out of the way for now.`}
                onConfirm={handleKeepAll}
                asChild
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1"
                  title="Tell Immich these are not duplicates"
                >
                  <Shield size={16} />
                  Not duplicates
                </Button>
              </AlertDialog>

              {selectedInRecord + selectedPartnerIds.length > 0 && (applyBlocked ? (
                <Button variant="outline" size="sm" disabled className="flex items-center gap-1" title={applyCopy.description}>
                  <Layers size={16} />
                  {applyCopy.button}
                </Button>
              ) : (
                <AlertDialog
                  title={applyCopy.title}
                  description={applyCopy.description}
                  onConfirm={handleKeepSelected}
                  variant={DISPOSITIONS[disposition].destructive ? 'destructive' : 'default'}
                  asChild
                >
                  <Button
                    variant="default"
                    size="sm"
                    className="flex items-center gap-1"
                    title={applyCopy.title}
                  >
                    {disposition === 'trash' && <Trash2 size={16} />}
                    {disposition === 'tag' && <Tag size={16} />}
                    {disposition === 'stack' && <Layers size={16} />}
                    {applyCopy.button}
                  </Button>
                </AlertDialog>
              ))}
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {record.assets.map((asset) => (
          <DuplicateAssetItem
            key={asset.id}
            asset={asset}
            isSelected={selectedAssets.has(asset.id)}
            onSelect={onAssetSelect}
            selectionMode={selectionMode}
            albums={assetAlbums[asset.id] || []}
            groupHasSelection={selectedInRecord + selectedPartnerIds.length > 0}
          />
        ))}
        {/* Partner copies last, after the user's own — reference only. Deduped
            by id because two of your copies can match the same partner photo. */}
        {Array.from(
          new Map(
            record.assets
              .flatMap((asset) => partnerMatches[asset.id] || [])
              .map((m) => [m.id, m])
          ).values()
        ).map((match) => (
          <PartnerMatchCard
            key={match.id}
            match={match}
            isKeeper={selectedAssets.has(match.id)}
            canBeKeeper={selectionMode === 'keep'}
            onSelect={onAssetSelect}
          />
        ))}
      </div>
    </div>
  )
}
