"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Marker, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface MapSchoolPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  designated: boolean;
}

export interface SchoolMapProps {
  centerLat?: number;
  centerLon?: number;
  searchedPoint?: { lat: number; lon: number } | null;
  schools: MapSchoolPoint[];
  styleUrl?: string;
}

const FALLBACK_STYLE_URL = "https://demotiles.maplibre.org/style.json";

/**
 * The demo tile style above is MapLibre's own free public demo style --
 * fine for development, but it is low detail and has no uptime guarantee.
 * Set NEXT_PUBLIC_MAPTILE_STYLE_URL to a production tile provider's style
 * URL (e.g. MapTiler, Stadia Maps, or a self-hosted style) before shipping.
 * See docs/DEPLOYMENT.md.
 */
export function SchoolMap({
  centerLat = 51.0447,
  centerLon = -114.0719,
  searchedPoint,
  schools,
  styleUrl,
}: SchoolMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [tilesUnavailable, setTilesUnavailable] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: styleUrl || FALLBACK_STYLE_URL,
      center: [centerLon, centerLat],
      zoom: 11,
    });
    mapRef.current = map;

    map.on("error", (e) => {
      // A failed tile/style fetch surfaces here rather than throwing --
      // render an explicit "map unavailable" state instead of a blank box.
      console.error("MapLibre error", e?.error);
      setTilesUnavailable(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Re-created only if the style URL changes; center/markers are updated
    // imperatively below without tearing down the map instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const school of schools) {
      const el = document.createElement("div");
      el.className = school.designated
        ? "h-4 w-4 rounded-full bg-emerald-600 border-2 border-white shadow"
        : "h-3 w-3 rounded-full bg-slate-500 border-2 border-white shadow";
      el.setAttribute("role", "img");
      el.setAttribute(
        "aria-label",
        `${school.name}${school.designated ? " (designated school)" : ""}`
      );
      const marker = new Marker({ element: el })
        .setLngLat([school.longitude, school.latitude])
        .setPopup(new Popup({ offset: 12 }).setText(school.name))
        .addTo(map);
      markersRef.current.push(marker);
    }

    if (searchedPoint) {
      const el = document.createElement("div");
      el.className = "h-5 w-5 rounded-full bg-blue-600 border-2 border-white shadow-lg";
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", "Searched address");
      const marker = new Marker({ element: el })
        .setLngLat([searchedPoint.lon, searchedPoint.lat])
        .addTo(map);
      markersRef.current.push(marker);
      map.flyTo({ center: [searchedPoint.lon, searchedPoint.lat], zoom: 13 });
    }
  }, [schools, searchedPoint]);

  if (tilesUnavailable) {
    return (
      <div
        role="status"
        className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600"
      >
        <p className="font-medium">Map tiles are unavailable right now.</p>
        <p>Results below are still accurate -- only the map view failed to load.</p>
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full rounded-md" aria-label="Map" />;
}
