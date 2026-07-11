"use client";

// IMPORTANT: the order matters!
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import {
  CircleMarker,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { useEffect } from "react";
import { ILatLng } from "@/lib/location-manager/coordinates";

export interface IImagePin {
  id: string;
  lat: number;
  lng: number;
}

export type ISelectedPin = { type: "dropped" } | { type: "image"; id: string } | null;

export interface IFlyTo {
  coords: ILatLng;
  zoom?: number;
  /** Bump to re-trigger the same coordinates. */
  ts: number;
}

interface LocationManagerMapProps {
  imagePins: IImagePin[];
  /** Every loaded photo with coordinates — shown as small dots when "show all" is on. */
  allPins: IImagePin[];
  droppedPin: ILatLng | null;
  selectedPin: ISelectedPin;
  /** Photo currently hovered in the grid — its pin gets a highlight ring. */
  highlightedAssetId: string | null;
  isDarkMode: boolean;
  onMapClick: (coords: ILatLng) => void;
  onImagePinClick: (id: string) => void;
  /** Click on a small "all photos" dot — flashes the photo in the grid. */
  onAllPinClick: (id: string) => void;
  onDroppedPinClick: () => void;
  flyTo: IFlyTo | null;
}

// Image pins are dots (one per selected photo); the dropped/candidate pin is
// a classic teardrop so the two never read as the same thing. Both stay dark
// grey regardless of selection — the actively selected one is distinguished
// only by an orange border. The grid-hovered photo's pin additionally gets a
// cyan ring so hover-linkage still reads even though it isn't "selection."
const SELECTED_OUTLINE = "#f97316";
const UNSELECTED_FILL = "#4b5563";

const imagePinIcon = (selected: boolean, highlighted: boolean) =>
  L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:9999px;background:${UNSELECTED_FILL};border:${
      selected ? `3px solid ${SELECTED_OUTLINE}` : "2px solid #fff"
    };box-shadow:0 1px 4px rgba(0,0,0,.55)${
      highlighted ? ";outline:3px solid #06b6d4;outline-offset:1px" : ""
    }"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

const droppedPinIcon = (selected: boolean) =>
  L.divIcon({
    className: "",
    html: `<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,.5));overflow:visible">
      <path d="M15 1C7.3 1 1 7.3 1 15c0 10.5 14 26 14 26s14-15.5 14-26C29 7.3 22.7 1 15 1z" fill="${UNSELECTED_FILL}"${
        selected ? ` stroke="${SELECTED_OUTLINE}" stroke-width="3"` : ' stroke="#fff" stroke-width="1.5"'
      }/>
      <circle cx="15" cy="15" r="5.5" fill="#fff"/>
    </svg>`,
    iconSize: [30, 42],
    iconAnchor: [15, 40],
  });

function MapClickHandler({ onMapClick }: { onMapClick: (coords: ILatLng) => void }) {
  useMapEvents({
    click: (e) => onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng }),
  });
  return null;
}

function FitToPins({ imagePins }: { imagePins: IImagePin[] }) {
  const map = useMap();
  const signature = imagePins
    .map((p) => `${p.id}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
    .join("|");
  useEffect(() => {
    if (imagePins.length === 0) return;
    if (imagePins.length === 1) {
      // Street-ish level for a lone photo — city level (10) was too far out.
      map.setView([imagePins[0].lat, imagePins[0].lng], Math.max(map.getZoom(), 13));
    } else {
      map.fitBounds(
        L.latLngBounds(imagePins.map((p) => [p.lat, p.lng] as [number, number])),
        { padding: [40, 40], maxZoom: 15 }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return null;
}

// When "show all" turns on, fit the view to everything once.
function FitToAllOnce({ pins, active }: { pins: IImagePin[]; active: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!active || pins.length === 0) return;
    map.fitBounds(
      L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])),
      { padding: [40, 40], maxZoom: 15 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return null;
}

function FlyToHandler({ flyTo }: { flyTo: IFlyTo | null }) {
  const map = useMap();
  useEffect(() => {
    if (!flyTo) return;
    map.setView(
      [flyTo.coords.lat, flyTo.coords.lng],
      flyTo.zoom ?? Math.max(map.getZoom(), 10)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo?.ts]);
  return null;
}

export default function LocationManagerMap({
  imagePins,
  allPins,
  droppedPin,
  selectedPin,
  highlightedAssetId,
  isDarkMode,
  onMapClick,
  onImagePinClick,
  onAllPinClick,
  onDroppedPinClick,
  flyTo,
}: LocationManagerMapProps) {
  // Don't draw a dot underneath a photo's own selected pin.
  const selectedIds = new Set(imagePins.map((p) => p.id));

  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      minZoom={2}
      maxZoom={18}
      scrollWheelZoom
      worldCopyJump
      maxBounds={[[-85, -Infinity], [85, Infinity]]}
      maxBoundsViscosity={1.0}
      className="h-full w-full z-0"
      style={{ minHeight: 300 }}
    >
      {isDarkMode ? (
        <>
          {/* Esri's Dark Gray Canvas base + its separate labels ("reference")
              layer — unlike plain OSM/CARTO tiles, Esri's label data carries
              an English name alongside the local script (verified: Tokyo
              street tiles read "Dogenzaka" next to the kanji, not kanji-only),
              so foreign-script regions stay legible. */}
          <TileLayer
            key="dark-base"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri — Esri, DeLorme, NAVTEQ"
            maxNativeZoom={16}
          />
          <TileLayer
            key="dark-labels"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
            maxNativeZoom={16}
          />
        </>
      ) : (
        <TileLayer
          key="light"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles &copy; Esri — Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom"
        />
      )}
      <MapClickHandler onMapClick={onMapClick} />
      <FitToPins imagePins={imagePins} />
      <FitToAllOnce pins={allPins} active={allPins.length > 0} />
      <FlyToHandler flyTo={flyTo} />
      {allPins
        .filter((pin) => !selectedIds.has(pin.id))
        .map((pin) => (
          <CircleMarker
            key={`all-${pin.id}`}
            center={[pin.lat, pin.lng]}
            radius={pin.id === highlightedAssetId ? 8 : 4}
            pathOptions={{
              color: pin.id === highlightedAssetId ? "#06b6d4" : "#374151",
              fillColor: UNSELECTED_FILL,
              fillOpacity: 0.8,
              weight: pin.id === highlightedAssetId ? 3 : 1,
            }}
            eventHandlers={{ click: () => onAllPinClick(pin.id) }}
          />
        ))}
      {imagePins.map((pin) => (
        <Marker
          key={pin.id}
          position={[pin.lat, pin.lng]}
          icon={imagePinIcon(
            selectedPin?.type === "image" && selectedPin.id === pin.id,
            pin.id === highlightedAssetId
          )}
          eventHandlers={{ click: () => onImagePinClick(pin.id) }}
        />
      ))}
      {droppedPin && (
        <Marker
          position={[droppedPin.lat, droppedPin.lng]}
          icon={droppedPinIcon(selectedPin?.type === "dropped")}
          eventHandlers={{ click: onDroppedPinClick }}
          zIndexOffset={1000}
        />
      )}
    </MapContainer>
  );
}
