'use client';
/**
 * Coach y amigos (docs/coach.md): invite a student or a friend with a 6-character code, accept one
 * (also from an invite link, /invitar/CODE), see who you coach or follow and who sees you, choose what
 * else each one sees, and end a link. Same rules as the phone (apps/mobile/src/screens/Personas.tsx).
 */
import { inviteCode } from '@kova/api-client';
import { linkLabel, KovaError, type LinkKind, type PersonLink } from '@kova/domain';
import { useEffect, useState } from 'react';
import { EmptyState, ErrorNotice } from '@/components/EmptyState';
import { kova } from '@/lib/client';
import { useAsync } from '@/lib/useAsync';

const card = { padding: 18, borderRadius: 'var(--radius-lg)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: 12 } as const;
const muted = { fontSize: 13, color: 'var(--color-neutral-400)' } as const;
const SHARES: Array<['share_body' | 'share_nutrition' | 'share_health', 'body' | 'nutrition' | 'health', string]> = [
  ['share_body', 'body', 'Peso y medidas'], ['share_nutrition', 'nutrition', 'Comida'], ['share_health', 'health', 'Sueño, pasos y corazón'],
];

function Shares({ link, onChanged }: { link: PersonLink; onChanged: () => void }) {
  const [s, setS] = useState({ body: link.share_body, nutrition: link.share_nutrition, health: link.share_health });
  const set = async (k: keyof typeof s, v: boolean) => {
    const next = { ...s, [k]: v };
    setS(next);
    try { await kova().people.setShares(link.id, next); onChanged(); } catch { setS(s); }
  };
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span style={muted}>Siempre ve tus entrenamientos{link.kind === 'coach' ? ' y tus rutinas' : ''}. Además:</span>
      {SHARES.map(([, k, label]) => (
        <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={s[k]} onChange={(e) => set(k, e.target.checked)} /> {label}
        </label>
      ))}
    </div>
  );
}

export default function PersonasPage() {
  const q = useAsync(() => kova().people.links(), []);
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<{ code: string; kind: LinkKind; inviter_name: string } | null>(null);
  const [created, setCreated] = useState<{ code: string; kind: LinkKind } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // From an invite link: /invitar/CODE → /personas?code=CODE.
  useEffect(() => {
    const c0 = new URLSearchParams(window.location.search).get('code');
    if (c0) setCode(c0);
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try { await fn(); } catch (e) { setError(e instanceof KovaError ? e.message : 'Algo salió mal.'); } finally { setBusy(false); }
  };
  const invite = (kind: LinkKind) => run(async () => {
    const inv = await kova().people.createInvite(kind);
    setCreated({ code: inv.code, kind });
    setCopied(false);
  });
  const look = () => run(async () => {
    const c0 = inviteCode(code);
    if (!c0) throw new KovaError('INVITE_INVALID', 'Escribe el código de 6 caracteres que te pasaron.');
    const info = await kova().people.inviteInfo(c0);
    if (!info || !info.valid) throw new KovaError('INVITE_INVALID', 'El código no es válido o ya venció. Pide uno nuevo.');
    setPreview({ code: c0, kind: info.kind, inviter_name: info.inviter_name });
  });
  const accept = () => run(async () => {
    if (!preview) return;
    await kova().people.acceptInvite(preview.code);
    setNotice(preview.kind === 'coach' ? preview.inviter_name + ' ahora es tu coach.' : 'Ahora tú y ' + preview.inviter_name + ' son amigos.');
    setPreview(null);
    setCode('');
    q.reload();
  });
  const end = (l: PersonLink) => {
    const msg = l.kind === 'friend' ? 'Tú y ' + l.person_name + ' dejarán de ver los entrenamientos del otro.'
      : l.role === 'owner' ? l.person_name + ' dejará de ver tus datos. Tus rutinas quedan en tu cuenta.' : 'Dejarás de ver los datos de ' + l.person_name + '.';
    if (window.confirm(msg)) run(async () => { await kova().people.endLink(l.id); q.reload(); });
  };
  const link = created ? window.location.origin + '/invitar/' + created.code : '';

  const links = q.data ?? [];
  const coach = links.find((l) => l.kind === 'coach' && l.role === 'owner');
  const students = links.filter((l) => l.kind === 'coach' && l.role === 'viewer');
  const friends = links.filter((l) => l.kind === 'friend' && l.role === 'owner');

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
      {error && <div className="kova-error" role="alert"><i className="ph ph-x-circle" style={{ color: 'var(--kova-crit)' }} /><span>{error}</span></div>}
      {notice && <div role="status" style={{ ...muted, color: 'var(--color-accent-200)' }}>{notice}</div>}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <section style={card}>
          <span style={{ fontSize: 16, fontWeight: 500 }}>Tengo un código</span>
          {preview ? (
            <>
              <span style={{ fontSize: 14 }}>
                {preview.kind === 'coach'
                  ? preview.inviter_name + ' te invita a ser su alumno. Va a ver tus entrenamientos y va a poder armar y ajustar tus rutinas.'
                  : preview.inviter_name + ' te invita como amigo. Van a ver los entrenamientos del otro; nadie edita nada.'}
              </span>
              <span style={muted}>Peso, comida y sueño no se comparten salvo que los actives. Puedes cortar el vínculo cuando quieras.</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" disabled={busy} onClick={accept}>Aceptar</button>
                <button className="btn btn-ghost" onClick={() => setPreview(null)}>Cancelar</button>
              </div>
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); look(); }} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="invite-code">Código de invitación</label>
                <input id="invite-code" className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ej.: K7MQ2X" autoComplete="off" maxLength={80} />
              </div>
              <button className="btn btn-secondary" disabled={busy || !code.trim()}>Ver</button>
            </form>
          )}
        </section>

        <section style={card}>
          <span style={{ fontSize: 16, fontWeight: 500 }}>Invitar</span>
          {created ? (
            <>
              <span style={muted}>{created.kind === 'coach' ? 'Código para tu alumno' : 'Código para tu amigo'} · vale 7 días y para una sola persona</span>
              <span style={{ fontSize: 32, fontWeight: 600, letterSpacing: 6, textAlign: 'center' }}>{created.code}</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}>
                  <i className="ph ph-copy" />{copied ? 'Link copiado' : 'Copiar link'}
                </button>
                <button className="btn btn-ghost" onClick={() => setCreated(null)}>Listo</button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" disabled={busy} onClick={() => invite('coach')}><i className="ph ph-user-plus" />Invitar a un alumno</button>
              <button className="btn btn-secondary" disabled={busy} onClick={() => invite('friend')}><i className="ph ph-users-three" />Invitar a un amigo</button>
            </div>
          )}
        </section>
      </div>

      {q.error ? <ErrorNotice message={q.error} onRetry={q.reload} /> : q.loading && !q.data ? <span style={muted}>Cargando…</span> : (
        <>
          {coach && (
            <section style={card}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>Tu coach · {coach.person_name}</span>
              <Shares link={coach} onChanged={q.reload} />
              <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => end(coach)}>Dejar de entrenar con este coach</button>
            </section>
          )}
          {students.length > 0 && (
            <section style={card}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>Tus alumnos</span>
              <table className="table">
                <thead><tr><th>Alumno</th><th>Esta semana</th><th /></tr></thead>
                <tbody>
                  {students.map((l) => (
                    <tr key={l.id}>
                      <td>{l.person_name}</td>
                      <td>{l.sessions_7d ? l.sessions_7d + (l.sessions_7d === 1 ? ' entrenamiento' : ' entrenamientos') : 'Sin entrenar'}</td>
                      <td style={{ textAlign: 'right' }}><button className="btn btn-ghost" onClick={() => end(l)}>Cortar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {friends.length > 0 && (
            <section style={card}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>Amigos</span>
              {friends.map((l) => (
                <div key={l.id} style={{ display: 'grid', gap: 8, paddingTop: 10, borderTop: '1px solid var(--color-divider, rgba(233,233,237,.08))' }}>
                  <span style={{ fontSize: 15 }}>{l.person_name} <span style={muted}>· {linkLabel(l)}</span></span>
                  <Shares link={l} onChanged={q.reload} />
                  <button className="btn btn-ghost" style={{ justifySelf: 'start' }} onClick={() => end(l)}>Dejar de ser amigos</button>
                </div>
              ))}
            </section>
          )}
          {!coach && students.length === 0 && friends.length === 0 && (
            <EmptyState icon="ph ph-users-three" title="Todavía no tienes coach ni amigos">
              Invita a un alumno para armarle las rutinas y ver cómo entrena, o a un amigo para ver los entrenamientos del otro.
            </EmptyState>
          )}
        </>
      )}
      <span style={muted}>Tus datos son tuyos: un coach o un amigo solo ve lo que el vínculo permite, y deja de verlo apenas lo cortas.</span>
    </div>
  );
}
