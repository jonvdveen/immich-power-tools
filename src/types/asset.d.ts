export interface IAsset {
  id: string;
  ownerId: string;
  type: string;
  originalPath: string;
  isFavorite: boolean;
  duration: number | null;
  originalFileName: string;
  thumbhash?: IAssetThumbhash;
  localDateTime: string | Date;
  exifImageWidth: number;
  exifImageHeight: number;
  url: string;
  previewUrl: string;
  videoURL?: string;
  dateTimeOriginal: string;
  orientation?: number | null | string;
  downloadUrl?: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface IAssetThumbhash {
  type: string;
  data: number[];
}


export interface IDuplicateAssetRecord {
  duplicateId: string;
  assets:      IDuplicateAsset[];
  /** Where this group came from. Absent means Immich's own grouping, which is
   *  every group the same-library view shows. A "cross" record is one this app
   *  found itself by searching a partner's library: it holds exactly one asset
   *  of yours, and the partner's copies arrive as matches keyed on its id. */
  source?:     "immich" | "cross";
  /** Cross-library only — how confident the match is. See lib/duplicates/bands.ts. */
  band?:       "exact" | "near" | "review";
  /** Cross-library only — CLIP cosine distance to the closest partner copy. */
  distance?:   number;
  /** Cross-library only — whether the normalised filenames agree, which is the
   *  independent corroboration that separates a match from a coincidence. */
  stemMatch?:  boolean;
}

export interface IDuplicateAsset {
  id:               string;
  ownerId:          string;
  libraryId:        null;
  type:             string;
  originalPath:     string;
  originalFileName: string;
  originalMimeType: string;
  thumbhash:        string;
  fileCreatedAt:    Date;
  fileModifiedAt:   Date;
  localDateTime:    Date;
  updatedAt:        Date;
  isFavorite:       boolean;
  visibility:       string;
  duration:         number | null;
  exifInfo:         IDuplicateAssetExifInfo;
  livePhotoVideoId: null;
  people:           any[];
  checksum:         string;
  isOffline:        boolean;
  hasMetadata:      boolean;
  duplicateId:      string;
  resized:          boolean;
}

export interface IDuplicateAssetExifInfo {
  make:             string;
  model:            string;
  exifImageWidth:   number;
  exifImageHeight:  number;
  fileSizeInByte:   number;
  orientation:      string;
  dateTimeOriginal: Date;
  modifyDate:       Date;
  timeZone:         string;
  lensModel:        string;
  fNumber:          number;
  focalLength:      number;
  iso:              number;
  exposureTime:     string;
  latitude:         number;
  longitude:        number;
  city:             string;
  state:            string;
  country:          string;
  description:      string;
  projectionType:   null;
  rating:           null;
}

/** A copy of one of your photos that lives in a partner's library. Read-only:
 *  it belongs to someone else, so it can never be selected or deleted here. */
export interface IPartnerMatch {
  id:               string;
  ownerId:          string;
  ownerName:        string;
  originalFileName: string;
  fileSizeInByte:   number;
  width:            number;
  height:           number;
  /** CLIP cosine distance from your copy. Smaller is a closer match. */
  distance:         number;
}
