export async function requestJson<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = await response.json().catch(() => ({
    error: "The server did not return a valid response. Please try again.",
  }));
  if (!response.ok) {
    const errorBody = body as {
      fields?: Record<string, string[]>;
      error?: string;
      message?: string;
    };
    const fields = errorBody.fields;
    const details = fields
      ? Object.entries(fields)
          .map(([field, messages]) => `${field}: ${messages.join(" ")}`)
          .join(" ")
      : "";
    throw new Error(
      `${errorBody.error ?? errorBody.message ?? "The request failed."}${details ? ` ${details}` : ""}`,
    );
  }
  return body as T;
}
export const jsonRequest = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});
