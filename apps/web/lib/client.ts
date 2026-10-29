'use client';
import { createKovaClient, type KovaClient } from '@kova/api-client';

let client: KovaClient | null = null;

/** Browser client with the public URL + anon key only. RLS protects every row. */
export function kova(): KovaClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY (ver apps/web/.env.example).');
    }
    client = createKovaClient({ url, anonKey });
  }
  return client;
}
