/** Coach and friends (docs/coach.md): shared types and labels. */

export type LinkKind = 'coach' | 'friend';

/** One row of my_links(): seen from the caller. */
export interface PersonLink {
  id: string;
  kind: LinkKind;
  /** 'viewer' = I coach or follow this person; 'owner' = this person coaches or follows me. */
  role: 'viewer' | 'owner';
  person_id: string;
  person_name: string;
  share_body: boolean;
  share_nutrition: boolean;
  share_health: boolean;
  created_at: string;
  /** Only when I am the viewer. */
  last_session_at: string | null;
  sessions_7d: number | null;
}

/** How a link reads in a list, from the caller's side. */
export function linkLabel(l: Pick<PersonLink, 'kind' | 'role'>): string {
  if (l.kind === 'friend') return 'Amigo';
  return l.role === 'viewer' ? 'Tu alumno' : 'Tu coach';
}
