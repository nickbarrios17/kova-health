'use client';
import { createVidaClient, type VidaClient } from '@vida/api-client';

let client: VidaClient | null = null;

/** Browser client with the public URL + anon key only. RLS protects every row. */
export function vida(): VidaClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY (ver apps/web/.env.example).');
    }
    client = createVidaClient({ url, anonKey });
  }
  return client;
}
