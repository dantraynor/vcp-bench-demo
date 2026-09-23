import { adoptionModule } from "@/features/adoptions/service";
import {
  route,
  json,
  checkOrigin,
  readJson,
  limitGuest,
} from "@/features/shared/http";
export async function POST(request: Request) {
  return route(async () => {
    checkOrigin(request);
    const data = await readJson(request);
    await limitGuest(request);
    return json(await adoptionModule().adopt(data), 201);
  });
}
