/** Admin panel (docs/admin.md). Every call fails with FORBIDDEN for non-admins. */
import type { AdminOverview, AdminUser } from '@kova/domain';

export function createAdmin({ rpc }: { rpc: <T = unknown>(fn: string, args: Record<string, unknown>) => Promise<T> }) {
  return {
    users: () => rpc<AdminUser[]>('admin_users', {}),
    overview: () => rpc<AdminOverview>('admin_overview', {}),
    setAdmin: (userId: string, admin: boolean) => rpc<null>('admin_set_admin', { p_user: userId, p_admin: admin }),
    setSuspended: (userId: string, suspended: boolean) => rpc<null>('admin_set_suspended', { p_user: userId, p_suspended: suspended }),
  };
}
