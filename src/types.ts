export type UserRole = "superuser" | "admin" | "employee";

export interface Team {
  id: string;
  name: string;
  is_active: boolean;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  team_id: string | null;
  /** Aktives Team für Ansichten (Pläne, Chat, …). Fallback: `team_id`. */
  active_team_id?: string | null;
  has_drivers_license: boolean;
  is_active: boolean;
  avatar_url?: string | null;
}

export interface MonthlyPlan {
  id: string;
  team_id: string;
  year: number;
  month: number;
  status: "draft" | "open" | "closed" | "generated" | "published";
  submission_deadline: string | null;
  min_staff_per_shift: number;
}

export interface ShiftType {
  id: string;
  name: string;
  team_id: string;
  default_start_time: string;
  default_end_time: string;
  color: string;
  sort_order: number;
  is_active: boolean;
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

/** Maximale Schichten pro Kalendermonat (von Admin/Superuser pro Mitarbeiter). */
export interface EmployeeShiftLimit {
  employee_id: string;
  max_shifts_per_month: number;
  updated_at?: string;
}

/** Antwort der Edge Function „generate-schedule“. */
export interface GenerateScheduleResponse {
  success: boolean;
  created: number;
  unfilled_slots: number;
  skipped_by_limit: number;
  error?: string;
}

export interface AuditLogEntry {
  id: string;
  created_at: string;
  actor_id: string | null;
  team_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  payload: Record<string, unknown>;
}

export type ChatThreadType = "team" | "dm";

export interface ChatThread {
  id: string;
  team_id: string | null;
  thread_type: ChatThreadType;
  created_at: string;
}

export interface ChatThreadMember {
  thread_id: string;
  user_id: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface ChatAttachment {
  id: string;
  message_id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}
