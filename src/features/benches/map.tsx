"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { boundary } from "./geography";
import type { PublicBench } from "./queries";

const colors = {
  available: "#287452",
  adopted: "#8d7151",
  unavailable: "#88928f",
};
function paintPin(
  marker: L.CircleMarker,
  availability: PublicBench["availability"],
  chosen: boolean,
) {
  marker.setStyle({
    color: chosen ? "#152d23" : "#fff",
    weight: chosen ? 3 : 1.5,
    fillColor: colors[availability],
    fillOpacity: 1,
  });
  marker.setRadius(chosen ? 9 : 5);
}
export default function BenchMap({
  benches,
  selected,
  onSelect,
}: {
  benches: PublicBench[];
  selected?: string;
  onSelect?: (code: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const pins = useRef(
    new Map<
      string,
      { marker: L.CircleMarker; availability: PublicBench["availability"] }
    >(),
  );
  const select = useRef(onSelect);
  const selectedCode = useRef(selected);
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    selectedCode.current = selected;
  }, [selected]);
  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, {
      preferCanvas: true,
      zoomControl: false,
      scrollWheelZoom: true,
      minZoom: 12,
      maxZoom: 19,
    });
    const layer = L.geoJSON(boundary, {
      style: {
        color: "#428762",
        weight: 1.5,
        fillColor: "#c9ddbf",
        fillOpacity: 0.13,
      },
    }).addTo(instance);
    instance.fitBounds(layer.getBounds(), { padding: [20, 20] });
    L.tileLayer(
      process.env.NEXT_PUBLIC_TILE_URL ??
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      },
    )
      .on("tileerror", () => setTileError(true))
      .addTo(instance);
    L.control.zoom({ position: "bottomright" }).addTo(instance);
    markers.current = L.layerGroup().addTo(instance);
    map.current = instance;
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      instance.remove();
      map.current = null;
      markers.current = null;
    };
  }, []);
  useEffect(() => {
    const group = markers.current;
    if (!group) return;
    group.clearLayers();
    pins.current.clear();
    for (const bench of benches) {
      const tooltip = document.createElement("span");
      tooltip.textContent = `${bench.code} · ${bench.availability}`;
      const marker = L.circleMarker([bench.latitude, bench.longitude]);
      paintPin(marker, bench.availability, selectedCode.current === bench.code);
      marker.bindTooltip(tooltip);
      if (select.current)
        marker.on("click", () => select.current?.(bench.code));
      marker.addTo(group);
      pins.current.set(bench.code, {
        marker,
        availability: bench.availability,
      });
    }
  }, [benches]);
  useEffect(() => {
    for (const [code, pin] of pins.current)
      paintPin(pin.marker, pin.availability, code === selected);
  }, [selected]);
  useEffect(() => {
    const bench = benches.find((b) => b.code === selected);
    if (bench && map.current)
      map.current.panTo([bench.latitude, bench.longitude], { animate: false });
  }, [selected, benches]);
  return (
    <div className="map-wrap">
      <div
        ref={container}
        className="map-canvas"
        role="region"
        aria-label="Map of illustrative bench locations. All benches are also available in the list."
      />
      {tileError && (
        <div className="map-notice" role="status">
          Base map unavailable. Bench locations and the list still work.
        </div>
      )}
      <div className="map-label">
        VAN CORTLANDT PARK <span>Illustrative bench locations</span>
      </div>
      <div className="map-legend">
        <span>
          <i style={{ background: colors.available }} /> Available
        </span>
        <span>
          <i style={{ background: colors.adopted }} /> Adopted
        </span>
        <span>
          <i style={{ background: colors.unavailable }} /> Unavailable
        </span>
      </div>
    </div>
  );
}
