/**
 * Coach and friends (docs/coach.md). Every read of another person's data goes through RPCs that check
 * the link in the database; nothing here widens what the normal queries return.
 */
import type { LinkKind, PersonLink } from '@kova/domain';

interface PeopleDeps {
  rpc: <T = unknown>(fn: string, args: Record<string, unknown>) => Promise<T>;
}

const CODE = /^[A-HJ-NP-Z2-9]{6}$/;
/** Normalizes what someone types or pastes ("abc 123", a whole invite link) to the 6-character code. */
export function inviteCode(raw: string): string | null {
  const m = raw.toUpperCase().match(/[A-HJ-NP-Z2-9]{6}(?![A-Z0-9])/g);
  const c = m?.at(-1) ?? raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return CODE.test(c) ? c : null;
}

export function createPeople({ rpc }: PeopleDeps) {
  return {
    /** A one-use code, valid 7 days. 'coach': whoever accepts becomes your student. 'friend': you see each other. */
    createInvite: (kind: LinkKind) => rpc<{ code: string; kind: LinkKind; expires_at: string }>('create_invite', { p_kind: kind }),
    /** Who invites and as what, before accepting; null when the code does not exist. */
    inviteInfo: async (code: string) => {
      const rows = await rpc<Array<{ kind: LinkKind; inviter_name: string; valid: boolean }>>('invite_info', { p_code: code });
      return rows[0] ?? null;
    },
    acceptInvite: (code: string) => rpc<{ id: string; kind: LinkKind }>('accept_invite', { p_code: code }),
    /** Your links both ways: people you coach or follow (role 'viewer') and people who see you ('owner'). */
    links: () => rpc<PersonLink[]>('my_links', {}),
    endLink: (linkId: string) => rpc<null>('end_link', { p_link_id: linkId }),
    /** What else a viewer of yours sees, besides your training. */
    setShares: (linkId: string, s: { body: boolean; nutrition: boolean; health: boolean }) =>
      rpc<unknown>('set_link_shares', { p_link_id: linkId, p_body: s.body, p_nutrition: s.nutrition, p_health: s.health }),
  };
}
