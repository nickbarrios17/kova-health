// Deletes the caller's account. Privileged: uses the service role, which exists only in the
// function environment (injected by Supabase) and never in clients.
// All user data is removed by `on delete cascade` from auth.users.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' });

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json(401, { code: 'UNAUTHENTICATED', message: 'Missing credentials' });

  let body: { confirm?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // handled below
  }
  if (body.confirm !== 'DELETE') {
    return json(400, { code: 'INVALID_INPUT', message: 'Body must be {"confirm":"DELETE"}' });
  }

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json(500, { code: 'INTERNAL', message: 'Server misconfigured' });

  // Identify the caller from their own JWT; never from the request body.
  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await asUser.auth.getUser();
  if (error || !data.user) return json(401, { code: 'UNAUTHENTICATED', message: 'Invalid session' });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) {
    console.error('delete-account failed', deleteError.message);
    return json(500, { code: 'INTERNAL', message: 'Could not delete account' });
  }
  return json(200, { deleted: true });
});
