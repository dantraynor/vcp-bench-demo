import { listPublicBenches } from "@/features/benches/queries";
import { json, route } from "@/features/shared/http";
export const dynamic = "force-dynamic";
export function GET() {
  return route(async () => json({ benches: await listPublicBenches() }));
}
