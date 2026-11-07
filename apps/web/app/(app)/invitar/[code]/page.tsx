'use client';
/** Invite link: /invitar/CODE (after signing in, if needed) opens Coach y amigos with the code filled in. */
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function InvitarPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace('/personas?code=' + encodeURIComponent(String(code ?? '').slice(0, 20)));
  }, [code, router]);
  return <span style={{ fontSize: 13, color: 'var(--color-neutral-400)' }}>Abriendo la invitación…</span>;
}
