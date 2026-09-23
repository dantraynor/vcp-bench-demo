import { AsyncLocalStorage } from "node:async_hooks";
import type { Connection } from "./index";

type RequestScope = { connection?: Connection; closed: boolean };
const requests = new AsyncLocalStorage<RequestScope>();

export function requestConnection(create: () => Connection): Connection {
  const scope = requests.getStore();
  if (!scope || scope.closed)
    throw new Error("Worker database access requires an active request.");
  return (scope.connection ??= create());
}

export function withDatabaseRequest(
  handle: () => Promise<Response>,
  waitUntil: (promise: Promise<unknown>) => void,
): Promise<Response> {
  return requests.run({ closed: false }, async () => {
    const scope = requests.getStore()!;
    const close = async () => {
      if (scope.closed) return;
      scope.closed = true;
      await scope.connection?.pool.end();
    };

    try {
      const response = await handle();
      if (!response.body) {
        await close();
        return response;
      }

      // Rendering can still query the database after fetch returns. Keep its
      // request scope alive until the body finishes, errors, or is cancelled.
      const { readable, writable } = new TransformStream<Uint8Array>();
      waitUntil(
        response.body
          .pipeTo(writable)
          .catch(() => {
            // pipeTo propagates stream failures to the response reader. Client
            // disconnects also reject here; both paths must release the pool.
          })
          .finally(close),
      );
      return new Response(readable, response);
    } catch (error) {
      await close();
      throw error;
    }
  });
}
