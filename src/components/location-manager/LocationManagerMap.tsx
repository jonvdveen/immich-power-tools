"use client";

// IMPORTANT: the order matters!
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
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
  droppedPin: ILatLng | null;
  selectedPin: ISelectedPin;
  isDarkMode: boolean;
  onMapClick: (coords: ILatLng) => void;
  onImagePinClick: (id: string) => void;
  onDroppedPinClick: () => void;
  flyTo: IFlyTo | null;
}

// Image pins are dots (one per selected photo); the dropped/candidate pin is
// a classic teardrop so the two never read as the same thing. The selected
// pin gets an amber ring.
const imagePinIcon = (selected: boolean) =>
  L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:9999px;background:#2563eb;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.55)${
      selected ? ";outline:3px solid #f59e0b;outline-offset:1px" : ""
    }"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

const droppedPinIcon = (selected: boolean) =>
  L.divIcon({
    className: "",
    html: `<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,.5));overflow:visible">
      <path d="M15 1C7.3 1 1 7.3 1 15c0 10.5 14 26 14 26s14-15.5 14-26C29 7.3 22.7 1 15 1z" fill="#ea580c"${
        selected ? ' stroke="#f59e0b" stroke-width="2.5"' : ' stroke="#fff" stroke-width="1.5"'
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
  droppedPin,
  selectedPin,
  isDarkMode,
  onMapClick,
  onImagePinClick,
  onDroppedPinClick,
  flyTo,
}: LocationManagerMapProps) {
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
        <TileLayer
          key="dark"
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={20}
        />
      ) : (
        <TileLayer
          key="light"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={20}
        />
      )}
      <MapClickHandler onMapClick={onMapClick} />
      <FitToPins imagePins={imagePins} />
      <FlyToHandler flyTo={flyTo} />
      {imagePins.map((pin) => (
        <Marker
          key={pin.id}
          position={[pin.lat, pin.lng]}
          icon={imagePinIcon(selectedPin?.type === "image" && selectedPin.id === pin.id)}
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
