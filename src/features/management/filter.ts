export function filterRecords<T extends object>(
  rows: T[],
  query: string,
  status: string,
) {
  const q = query.trim().toLowerCase();
  return rows.filter((record) => {
    const row = record as Record<string, unknown>;
    const matchesStatus =
      status === "all" || row.state === status || row.status === status;
    const searchable = [
      "code",
      "description",
      "area",
      "benchCode",
      "name",
      "email",
      "donorName",
      "donorEmail",
      "publicName",
    ];
    return (
      matchesStatus &&
      (!q ||
        searchable.some(
          (key) =>
            typeof row[key] === "string" && row[key].toLowerCase().includes(q),
        ))
    );
  });
}
