import { publicBench } from "@/features/benches/queries";
import { json, route } from "@/features/shared/http";
import { AppError } from "@/features/shared/errors";
export const dynamic = "force-dynamic";
export function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  return route(async () => {
    const { code } = await context.params;
    const bench = await publicBench(code);
    if (!bench) throw new AppError(404, "Bench not found.");
    return json(bench);
  });
}
