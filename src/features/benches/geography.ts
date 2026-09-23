import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import boundaryData from "./data/park-boundary.json";
import areasData from "./data/park-areas.json";
export const boundary = boundaryData as FeatureCollection<
  MultiPolygon | Polygon
>;
export const areas = areasData as FeatureCollection<
  MultiPolygon | Polygon,
  { id: string; name: string }
>;
export function inPark(longitude: number, latitude: number): boolean {
  return boundary.features.some((feature) =>
    booleanPointInPolygon([longitude, latitude], feature),
  );
}
const areaByPoint = new Map<string, string>();
export function resolveArea(longitude: number, latitude: number): string {
  const key = `${longitude},${latitude}`;
  const cached = areaByPoint.get(key);
  if (cached !== undefined) return cached;
  const area = areas.features.find((feature) =>
    booleanPointInPolygon([longitude, latitude], feature),
  );
  const name =
    area?.properties.name.replace(/^Van Cortlandt Park-/, "") ??
    "Area not assigned";
  areaByPoint.set(key, name);
  return name;
}
