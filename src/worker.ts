import worker from "vinext/server/fetch-handler";
import { withDatabaseRequest } from "./db/request-connection";

export * from "vinext/server/fetch-handler";

export default {
  ...worker,
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return withDatabaseRequest(
      () => worker.fetch(request, env, ctx),
      (promise) => ctx.waitUntil(promise),
    );
  },
} satisfies ExportedHandler<Env>;
