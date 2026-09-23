import { ZodError } from "zod";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}
export function postgresCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const cause = error as { code?: string; cause?: { code?: string } };
  return cause.code ?? cause.cause?.code;
}
export function translateDatabaseError(error: unknown): AppError | undefined {
  const code = postgresCode(error);
  if (code === "23P01")
    return new AppError(
      409,
      "This bench already has an adoption during that period. Refresh its details and choose another bench or period.",
    );
  if (code === "23505")
    return new AppError(409, "A record with that identifier already exists.");
  if (code === "23514" || code === "23503")
    return new AppError(
      422,
      "The record does not satisfy the database's integrity rules.",
    );
  return undefined;
}
export function databaseError(error: unknown): never {
  throw translateDatabaseError(error) ?? error;
}
export function bumpVersion(existing: { version: number }) {
  return { version: existing.version + 1, updatedAt: new Date() };
}
export function errorResponse(error: unknown): Response {
  if (error instanceof AppError)
    return Response.json(
      { error: error.message, fields: error.fields },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return Response.json(
      {
        error: "Check the highlighted fields.",
        fields: error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  if (error instanceof SyntaxError)
    return Response.json(
      { error: "The request is not valid JSON." },
      { status: 400 },
    );
  const reference = crypto.randomUUID();
  console.error("Request failed", {
    reference,
    type: error instanceof Error ? error.name : "UnknownError",
  });
  return Response.json(
    { error: "Something went wrong. Please try again.", reference },
    { status: 500 },
  );
}
export function assertVersion(current: number, expected: number) {
  if (current !== expected)
    throw new AppError(
      409,
      "This record changed in another session. Refresh before saving.",
    );
}
