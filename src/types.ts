export type UserRole = "admin" | "employee";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  has_drivers_license: boolean;
  is_active: boolean;
}

export interface MonthlyPlan {
  id: string;
  year: number;
  month: number;
  status: "draft" | "open" | "closed" | "generated" | "published";
  submission_deadline: string | null;
  min_staff_per_shift: number;
}

export interface ShiftType {
  id: string;
  name: string;
  default_start_time: string;
  default_end_time: string;
  color: string;
  sort_order: number;
}

export interface ShiftWish {
  id: string;
  monthly_plan_id: string;
  employee_id: string;
  date: string;
  shift_type_id: string | null;
  wish_type: "available" | "custom_time" | "unavailable";
  custom_start_time: string | null;
  custom_end_time: string | null;
  remarks: string | null;
}
