import { getDb } from "@/db";
import { users } from "@/db/schema";

export const demoStaffName = "Demo staff";
const demoStaffActor = {
  id: "demo-staff",
  name: demoStaffName,
  origin: "staff" as const,
};

export async function demoStaff() {
  await getDb()
    .insert(users)
    .values({
      id: demoStaffActor.id,
      name: demoStaffActor.name,
      email: "demo-staff@example.com",
    })
    .onConflictDoNothing();
  return demoStaffActor;
}
