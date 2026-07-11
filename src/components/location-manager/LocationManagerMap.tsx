"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { ILatLng } from "@/lib/location-manager/coordinates";
import { useImmichMapStyle } from "@/hooks/useImmichMapStyle";

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

function imagePinHtml(selected: boolean, highlighted: boolean): string {
  return `<div style="width:16px;height:16px;border-radius:9999px;background:${UNSELECTED_FILL};border:${
    selected ? `3px solid ${SELECTED_OUTLINE}` : "2px solid #fff"
  };box-shadow:0 1px 4px rgba(0,0,0,.55)${
    highlighted ? ";outline:3px solid #06b6d4;outline-offset:1px" : ""
  }"></div>`;
}

function droppedPinHtml(selected: boolean): string {
  return `<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,.5));overflow:visible">
    <path d="M15 1C7.3 1 1 7.3 1 15c0 10.5 14 26 14 26s14-15.5 14-26C29 7.3 22.7 1 15 1z" fill="${UNSELECTED_FILL}"${
      selected ? ` stroke="${SELECTED_OUTLINE}" stroke-width="3"` : ' stroke="#fff" stroke-width="1.5"'
    }/>
    <circle cx="15" cy="15" r="5.5" fill="#fff"/>
  </svg>`;
}

function allPinHtml(highlighted: boolean): string {
  const size = highlighted ? 16 : 8;
  return `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${UNSELECTED_FILL};border:${
    highlighted ? "3px solid #06b6d4" : "1px solid #374151"
  };opacity:0.85"></div>`;
}

function boundsOf(pins: IImagePin[]): maplibregl.LngLatBounds {
  const bounds = new maplibregl.LngLatBounds();
  pins.forEach((p) => bounds.extend([p.lng, p.lat]));
  return bounds;
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
  const styleUrl = useImmichMapStyle(isDarkMode);
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  // Recreated whenever the style URL changes (e.g. theme toggle) — simpler
  // and safer than trying to preserve custom layers across setStyle().
  useEffect(() => {
    if (!containerRef.current) return;
    const instance = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: [0, 20],
      zoom: 1,
      minZoom: 1,
      maxZoom: 18,
      attributionControl: false,
    });
    instance.addControl(new maplibregl.AttributionControl({
      customAttribution: "Basemap © Protomaps, © OpenStreetMap contributors",
    }));
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    instance.on("load", () => setMap(instance));
    return () => {
      instance.remove();
      setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl]);

  // Map click → drop/select a candidate pin. Clicking a marker's own DOM
  // element never reaches this (markers are separate overlay nodes, not
  // part of the canvas the map's own click listener is bound to).
  useEffect(() => {
    if (!map) return;
    const handler = (e: maplibregl.MapMouseEvent) =>
      onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [map, onMapClick]);

  // Image pins (one per selected photo with coordinates).
  useEffect(() => {
    if (!map) return;
    const markers = imagePins.map((pin) => {
      const el = document.createElement("div");
      el.style.cursor = "pointer";
      el.innerHTML = imagePinHtml(
        selectedPin?.type === "image" && selectedPin.id === pin.id,
        pin.id === highlightedAssetId
      );
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onImagePinClick(pin.id);
      });
      return new maplibregl.Marker({ element: el })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map);
    });
    return () => markers.forEach((m) => m.remove());
  }, [map, imagePins, selectedPin, highlightedAssetId, onImagePinClick]);

  // "Show all on map" dots.
  useEffect(() => {
    if (!map) return;
    const selectedIds = new Set(imagePins.map((p) => p.id));
    const markers = allPins
      .filter((pin) => !selectedIds.has(pin.id))
      .map((pin) => {
        const el = document.createElement("div");
        el.style.cursor = "pointer";
        el.innerHTML = allPinHtml(pin.id === highlightedAssetId);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onAllPinClick(pin.id);
        });
        return new maplibregl.Marker({ element: el })
          .setLngLat([pin.lng, pin.lat])
          .addTo(map);
      });
    return () => markers.forEach((m) => m.remove());
  }, [map, allPins, imagePins, highlightedAssetId, onAllPinClick]);

  // Dropped/candidate pin.
  useEffect(() => {
    if (!map || !droppedPin) return;
    const el = document.createElement("div");
    el.style.cursor = "pointer";
    el.innerHTML = droppedPinHtml(selectedPin?.type === "dropped");
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      onDroppedPinClick();
    });
    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([droppedPin.lng, droppedPin.lat])
      .addTo(map);
    return () => {
      marker.remove();
    };
  }, [map, droppedPin, selectedPin, onDroppedPinClick]);

  // Fit to the selected photos' pins whenever that set changes.
  const imagePinsSignature = imagePins
    .map((p) => `${p.id}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
    .join("|");
  useEffect(() => {
    if (!map || imagePins.length === 0) return;
    if (imagePins.length === 1) {
      // Street-ish level for a lone photo — city level (10) was too far out.
      map.easeTo({
        center: [imagePins[0].lng, imagePins[0].lat],
        zoom: Math.max(map.getZoom(), 13),
      });
    } else {
      map.fitBounds(boundsOf(imagePins), { padding: 40, maxZoom: 15 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, imagePinsSignature]);

  // When "show all" turns on, fit the view to everything once.
  useEffect(() => {
    if (!map || allPins.length === 0) return;
    map.fitBounds(boundsOf(allPins), { padding: 40, maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, allPins.length > 0]);

  useEffect(() => {
    if (!map || !flyTo) return;
    map.easeTo({
      center: [flyTo.coords.lng, flyTo.coords.lat],
      zoom: flyTo.zoom ?? Math.max(map.getZoom(), 10),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, flyTo?.ts]);

  return (
    <div ref={containerRef} className="h-full w-full z-0" style={{ minHeight: 300 }} />
  );
}
