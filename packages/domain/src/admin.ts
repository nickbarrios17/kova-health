/** Admin panel (docs/admin.md): accounts with counts and dates, never the content of their data. */
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  created_at: string;
  last_seen_at: string | null;
  workouts: number;
  workouts_7d: number;
  meals_7d: number;
  reports: number;
  is_admin: boolean;
  suspended: boolean;
  has_coach: boolean;
  students: number;
}

export interface AdminOverview {
  users: number;
  new_7d: number;
  active_7d: number;
  workouts_7d: number;
  meals_7d: number;
  reports_new: number;
  coach_links: number;
}

/** Filters an account list by a free-text search over name and email. */
export function searchUsers(users: AdminUser[], query: string): AdminUser[] {
  const q = query.trim().toLowerCase();
  if (!q) return users;
  return users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
}
