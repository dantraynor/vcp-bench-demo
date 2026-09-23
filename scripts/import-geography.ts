import { writeFile } from "node:fs/promises";
import type { MultiPolygon } from "geojson";
const sources = [
  ["park-boundary.json", "enfh-gkve"],
  ["park-areas.json", "4j29-i5ry"],
] as const;
const fixtures: { filename: string; content: string; count: number }[] = [];
for (const [filename, dataset] of sources) {
  const url = new URL(`https://data.cityofnewyork.us/resource/${dataset}.json`);
  url.searchParams.set("$where", "gispropnum='X092' AND retired=false");
  url.searchParams.set("$limit", "100");
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok)
    throw new Error(`Dataset ${dataset} returned ${response.status}.`);
  const rows = (await response.json()) as {
    omppropid: string;
    gispropnum: string;
    retired: boolean;
    description?: string;
    signname?: string;
    multipolygon: MultiPolygon;
  }[];
  if (
    !rows.length ||
    new Set(rows.map((r) => r.omppropid)).size !== rows.length
  )
    throw new Error("Missing or duplicate geography records.");
  const features = rows.map((row) => {
    const name = row.description ?? row.signname;
    if (
      !name ||
      row.gispropnum !== "X092" ||
      row.retired ||
      row.multipolygon?.type !== "MultiPolygon"
    )
      throw new Error("Unexpected geography record.");
    for (const polygon of row.multipolygon.coordinates)
      for (const ring of polygon) {
        if (
          ring.length < 4 ||
          JSON.stringify(ring[0]) !== JSON.stringify(ring.at(-1))
        )
          throw new Error("Unclosed polygon ring.");
        if (
          ring.some(
            ([lng, lat]) =>
              !Number.isFinite(lng) ||
              !Number.isFinite(lat) ||
              Math.abs(lng) > 180 ||
              Math.abs(lat) > 90,
          )
        )
          throw new Error("Invalid WGS84 coordinates.");
      }
    return {
      type: "Feature",
      properties: { id: row.omppropid, name },
      geometry: row.multipolygon,
    };
  });
  fixtures.push({
    filename,
    content: JSON.stringify({ type: "FeatureCollection", features }) + "\n",
    count: features.length,
  });
}
for (const fixture of fixtures) {
  await writeFile(
    `src/features/benches/data/${fixture.filename}`,
    fixture.content,
  );
  console.info(
    `${fixture.filename}: ${fixture.count} official features. Inventory and adoptions were not modified.`,
  );
}
