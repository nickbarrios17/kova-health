/**
 * Coach y amigos (docs/coach.md): invite a student or a friend with a 6-character code, accept one,
 * see who you coach or follow and who sees you, choose what else each one sees, and end a link.
 */
import { inviteCode } from '@kova/api-client';
import { linkLabel, KovaError, type LinkKind, type PersonLink } from '@kova/domain';
import { ArrowLeft, Copy, ShareNetwork, UserPlus, UsersThree } from 'phosphor-react-native';
import { useState } from 'react';
import { Keyboard, Pressable, ScrollView, Share, Switch, View } from 'react-native';
import { useBack } from '../back';
import { kova } from '../client';
import { c, r } from '../theme';
import { useAsync } from '../useAsync';
import { Button, Card, Confirm, Empty, ErrorNote, Field, Loading, Notice, Row, T } from '../ui';

const WEB = 'https://kova-health.vercel.app';
const inviteText = (code: string, kind: LinkKind) =>
  (kind === 'coach' ? 'Te invito a entrenar conmigo como tu coach en Kova Health.' : 'Sumate como amigo en Kova Health y vemos nuestros entrenamientos.')
  + ' Código: ' + code + '\n' + WEB + '/invitar/' + code;

function ShareRow({ link, onChanged }: { link: PersonLink; onChanged: () => void }) {
  const [s, setS] = useState({ body: link.share_body, nutrition: link.share_nutrition, health: link.share_health });
  const set = async (k: keyof typeof s, v: boolean) => {
    const next = { ...s, [k]: v };
    setS(next);
    try { await kova.people.setShares(link.id, next); onChanged(); } catch { setS(s); }
  };
  const items: Array<[keyof typeof s, string]> = [['body', 'Peso y medidas'], ['nutrition', 'Comida'], ['health', 'Sueño, pasos y corazón']];
  return (
    <View style={{ gap: 4 }}>
      <T size={12} color={c.n400}>Siempre ve tus entrenamientos{link.kind === 'coach' ? ' y tus rutinas' : ''}. Además:</T>
      {items.map(([k, label]) => (
        <Row key={k} style={{ justifyContent: 'space-between', minHeight: 40 }}>
          <T size={14} color={c.n300}>{label}</T>
          <Switch value={s[k]} onValueChange={(v) => set(k, v)} trackColor={{ true: c.accent, false: c.n700 }} thumbColor={c.text} accessibilityLabel={'Compartir ' + label} />
        </Row>
      ))}
    </View>
  );
}

export function Personas({ initialCode, onClose }: { initialCode?: string | null; onClose: () => void }) {
  useBack(true, onClose);
  const q = useAsync(() => kova.people.links(), []);
  const [code, setCode] = useState(initialCode ?? '');
  const [preview, setPreview] = useState<{ code: string; kind: LinkKind; inviter_name: string } | null>(null);
  const [created, setCreated] = useState<{ code: string; kind: LinkKind } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState<PersonLink | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try { await fn(); } catch (e) { setError(e instanceof KovaError ? e.message : 'Algo salió mal.'); } finally { setBusy(false); }
  };
  const invite = (kind: LinkKind) => run(async () => {
    const inv = await kova.people.createInvite(kind);
    setCreated({ code: inv.code, kind });
  });
  const look = () => run(async () => {
    Keyboard.dismiss();
    const c0 = inviteCode(code);
    if (!c0) throw new KovaError('INVITE_INVALID', 'Escribe el código de 6 caracteres que te pasaron.');
    const info = await kova.people.inviteInfo(c0);
    if (!info || !info.valid) throw new KovaError('INVITE_INVALID', 'El código no es válido o ya venció. Pide uno nuevo.');
    setPreview({ code: c0, kind: info.kind, inviter_name: info.inviter_name });
  });
  const accept = () => run(async () => {
    if (!preview) return;
    await kova.people.acceptInvite(preview.code);
    setNotice(preview.kind === 'coach' ? preview.inviter_name + ' ahora es tu coach.' : 'Ahora tú y ' + preview.inviter_name + ' son amigos.');
    setPreview(null);
    setCode('');
    q.reload();
  });
  const end = () => run(async () => {
    if (!ending) return;
    const l = ending;
    setEnding(null);
    await kova.people.endLink(l.id);
    q.reload();
  });

  const links = q.data ?? [];
  const coach = links.find((l) => l.kind === 'coach' && l.role === 'owner');
  const students = links.filter((l) => l.kind === 'coach' && l.role === 'viewer');
  // A friendship is two links; show each friend once, from the side where they see you (shares live there).
  const friends = links.filter((l) => l.kind === 'friend' && l.role === 'owner');

  const header = (
    <Row style={{ gap: 4 }}>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Volver" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 }}>
        <ArrowLeft size={22} color={c.text} />
      </Pressable>
      <T size={22} w="medium" style={{ flex: 1 }}>Coach y amigos</T>
    </Row>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }} keyboardShouldPersistTaps="handled">
      {header}
      {error ? <Notice tone="warn" text={error} /> : null}
      {notice ? <Notice text={notice} /> : null}

      <Card>
        <T size={16} w="medium">Tengo un código</T>
        {preview ? (
          <View style={{ gap: 10 }}>
            <T size={14}>
              {preview.kind === 'coach'
                ? preview.inviter_name + ' te invita a ser su alumno. Va a ver tus entrenamientos y va a poder armar y ajustar tus rutinas.'
                : preview.inviter_name + ' te invita como amigo. Van a ver los entrenamientos del otro; nadie edita nada.'}
            </T>
            <T size={12} color={c.n400}>Peso, comida y sueño no se comparten salvo que los actives. Puedes cortar el vínculo cuando quieras.</T>
            <Row style={{ gap: 8 }}>
              <Button label="Aceptar" busy={busy} onPress={accept} />
              <Button variant="ghost" label="Cancelar" onPress={() => setPreview(null)} />
            </Row>
          </View>
        ) : (
          <Row style={{ alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}><Field label="Código de invitación" value={code} onChangeText={setCode} placeholder="Ej.: K7MQ2X" autoCapitalize="characters" autoCorrect={false} maxLength={80} /></View>
            <Button label="Ver" busy={busy} onPress={look} disabled={!code.trim()} />
          </Row>
        )}
      </Card>

      <Card>
        <T size={16} w="medium">Invitar</T>
        {created ? (
          <View style={{ gap: 10 }}>
            <T size={13} color={c.n400}>{created.kind === 'coach' ? 'Código para tu alumno' : 'Código para tu amigo'} · vale 7 días y para una sola persona</T>
            <T size={32} w="medium" style={{ letterSpacing: 6, textAlign: 'center', paddingVertical: 6 }} selectable>{created.code}</T>
            <Row style={{ gap: 8 }}>
              <Button label="Compartir" icon={ShareNetwork} onPress={() => Share.share({ message: inviteText(created.code, created.kind) })} />
              <Button variant="ghost" label="Listo" icon={Copy} onPress={() => setCreated(null)} />
            </Row>
          </View>
        ) : (
          <Row style={{ gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" label="Invitar a un alumno" icon={UserPlus} busy={busy} onPress={() => invite('coach')} />
            <Button variant="secondary" label="Invitar a un amigo" icon={UsersThree} busy={busy} onPress={() => invite('friend')} />
          </Row>
        )}
      </Card>

      {q.loading && !q.data ? <Loading /> : q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : (
        <>
          {coach ? (
            <Card>
              <T size={16} w="medium">Tu coach</T>
              <T size={15}>{coach.person_name}</T>
              <ShareRow link={coach} onChanged={q.reload} />
              <Button variant="ghost" label="Dejar de entrenar con este coach" onPress={() => setEnding(coach)} />
            </Card>
          ) : null}

          {students.length ? (
            <Card style={{ gap: 0 }}>
              <T size={16} w="medium" style={{ paddingBottom: 6 }}>Tus alumnos</T>
              {students.map((l, i) => (
                <Row key={l.id} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: 'rgba(233,233,237,0.06)' }}>
                  <View style={{ flex: 1 }}>
                    <T size={14}>{l.person_name}</T>
                    <T size={12} color={c.n400}>{l.sessions_7d ? l.sessions_7d + (l.sessions_7d === 1 ? ' entrenamiento' : ' entrenamientos') + ' esta semana' : 'Sin entrenar esta semana'}</T>
                  </View>
                  <Button variant="ghost" label="Cortar" onPress={() => setEnding(l)} />
                </Row>
              ))}
            </Card>
          ) : null}

          {friends.length ? (
            <Card>
              <T size={16} w="medium">Amigos</T>
              {friends.map((l) => (
                <View key={l.id} style={{ gap: 6, paddingVertical: 6, borderTopWidth: 1, borderTopColor: 'rgba(233,233,237,0.06)' }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <T size={15}>{l.person_name}</T>
                    <T size={12} color={c.n400}>{linkLabel(l)}</T>
                  </Row>
                  <ShareRow link={l} onChanged={q.reload} />
                  <Button variant="ghost" label="Dejar de ser amigos" onPress={() => setEnding(l)} />
                </View>
              ))}
            </Card>
          ) : null}

          {!coach && !students.length && !friends.length ? (
            <Empty icon={UsersThree} title="Todavía no tienes coach ni amigos">
              Invita a un alumno para armarle las rutinas y ver cómo entrena, o a un amigo para ver los entrenamientos del otro.
            </Empty>
          ) : null}
        </>
      )}

      <View style={{ padding: 12, borderRadius: r.md, borderWidth: 1, borderColor: c.divider }}>
        <T size={12} color={c.n400}>Tus datos son tuyos: un coach o un amigo solo ve lo que este vínculo permite, y deja de verlo apenas lo cortas.</T>
      </View>

      <Confirm visible={ending != null} title="Cortar vínculo"
        message={ending ? (ending.kind === 'friend' ? 'Tú y ' + ending.person_name + ' dejarán de ver los entrenamientos del otro.' : ending.role === 'owner' ? ending.person_name + ' dejará de ver tus datos. Tus rutinas quedan en tu cuenta.' : 'Dejarás de ver los datos de ' + ending.person_name + '.') : ''}
        confirmLabel="Cortar" destructive onConfirm={end} onCancel={() => setEnding(null)} />
    </ScrollView>
  );
}
