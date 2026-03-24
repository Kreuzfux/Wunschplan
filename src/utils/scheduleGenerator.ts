import type { ShiftWish } from "@/types";

export interface GeneratedAssignment {
  employee_id: string;
  date: string;
  shift_type_id: string | null;
  start_time: string;
  end_time: string;
}

export function generateAssignments(wishes: ShiftWish[], minStaffPerShift: number): GeneratedAssignment[] {
  const byDateAndShift = new Map<string, ShiftWish[]>();
  const assignmentCount = new Map<string, number>();

  wishes.forEach((wish) => {
    const key = `${wish.date}::${wish.shift_type_id ?? "custom"}`;
    const arr = byDateAndShift.get(key) ?? [];
    arr.push(wish);
    byDateAndShift.set(key, arr);
  });

  const result: GeneratedAssignment[] = [];

  for (const [key, wishList] of byDateAndShift) {
    wishList.sort((a, b) => (assignmentCount.get(a.employee_id) ?? 0) - (assignmentCount.get(b.employee_id) ?? 0));
    const selected = wishList.slice(0, minStaffPerShift);
    const [date, shiftTypeId] = key.split("::");

    selected.forEach((wish) => {
      assignmentCount.set(wish.employee_id, (assignmentCount.get(wish.employee_id) ?? 0) + 1);
      result.push({
        employee_id: wish.employee_id,
        date,
        shift_type_id: shiftTypeId === "custom" ? null : shiftTypeId,
        start_time: wish.custom_start_time ?? "10:00",
        end_time: wish.custom_end_time ?? "15:00",
      });
    });
  }

  return result;
}
