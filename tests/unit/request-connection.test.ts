import { describe, expect, it, vi } from "vitest";
import { createDatabase, LOCAL_DATABASE_URL } from "@/db";
import {
  requestConnection,
  withDatabaseRequest,
} from "@/db/request-connection";

function fixture() {
  const create = vi.fn(() => createDatabase(LOCAL_DATABASE_URL));
  const pending: Promise<unknown>[] = [];
  const waitUntil = (promise: Promise<unknown>) => pending.push(promise);
  return { create, pending, waitUntil };
}

describe("Worker database lifetime", () => {
  it("isolates overlapping requests and reuses the connection within each", async () => {
    const { create, waitUntil } = fixture();
    const release = Promise.withResolvers<void>();
    const first = withDatabaseRequest(async () => {
      const db = requestConnection(create);
      await release.promise;
      expect(requestConnection(create)).toBe(db);
      return new Response(null, { status: 204 });
    }, waitUntil);
    await withDatabaseRequest(async () => {
      const db = requestConnection(create);
      expect(db).not.toBe(create.mock.results[0].value);
      return new Response(null, { status: 204 });
    }, waitUntil);
    release.resolve();
    await first;
    expect(create).toHaveBeenCalledTimes(2);
    for (const result of create.mock.results)
      expect(result.value.pool.ended).toBe(true);
    expect(() => requestConnection(create)).toThrow("active request");
  });

  it("keeps connections alive for delayed streamed content, then closes them", async () => {
    const { create, pending, waitUntil } = fixture();
    const release = Promise.withResolvers<void>();
    const response = await withDatabaseRequest(async () => {
      requestConnection(create);
      return new Response(
        new ReadableStream({
          async start(controller) {
            await release.promise;
            expect(requestConnection(create).pool.ended).toBe(false);
            controller.enqueue(new TextEncoder().encode("rendered"));
            controller.close();
          },
        }),
      );
    }, waitUntil);
    expect(create.mock.results[0].value.pool.ended).toBe(false);
    release.resolve();
    expect(await response.text()).toBe("rendered");
    await Promise.all(pending);
    expect(create.mock.results[0].value.pool.ended).toBe(true);
  });

  it("closes a connection when the handler fails", async () => {
    const { create, waitUntil } = fixture();
    await expect(
      withDatabaseRequest(async () => {
        requestConnection(create);
        throw new Error("handler failed");
      }, waitUntil),
    ).rejects.toThrow("handler failed");
    expect(create.mock.results[0].value.pool.ended).toBe(true);
  });

  it("closes a connection when a streamed body fails", async () => {
    const { create, pending, waitUntil } = fixture();
    const response = await withDatabaseRequest(async () => {
      requestConnection(create);
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("stream failed"));
          },
        }),
      );
    }, waitUntil);
    await expect(response.text()).rejects.toThrow("stream failed");
    await Promise.all(pending);
    expect(create.mock.results[0].value.pool.ended).toBe(true);
  });

  it("cancels upstream and releases the connection on a client disconnect", async () => {
    const { create, pending, waitUntil } = fixture();
    const cancel = vi.fn();
    const response = await withDatabaseRequest(async () => {
      requestConnection(create);
      return new Response(new ReadableStream({ cancel }));
    }, waitUntil);
    await response.body!.cancel();
    await Promise.all(pending);
    expect(cancel).toHaveBeenCalledOnce();
    expect(create.mock.results[0].value.pool.ended).toBe(true);
  });
});
