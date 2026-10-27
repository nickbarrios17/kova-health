import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { createVidaClient, type OutboxEntry, type OutboxStorage, type VidaClient } from '@vida/api-client';
import { AppState } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const configured = Boolean(url && anonKey);

const supabase = createClient(url ?? 'http://invalid.local', anonKey ?? 'missing', {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// Refresh tokens only while the app is in the foreground (supabase-js recommendation for RN).
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/** One client for the whole app. Authorization is RLS on the server; nothing here is trusted. */
export const vida: VidaClient = createVidaClient({ url: url ?? '', anonKey: anonKey ?? '', supabase });

/** Outbox persisted on the device so queued sets/logs survive app restarts (docs/sync.md). */
const OUTBOX_KEY = 'vida:outbox';
export const outboxStorage: OutboxStorage = {
  async load() {
    try {
      return JSON.parse((await AsyncStorage.getItem(OUTBOX_KEY)) ?? '[]') as OutboxEntry[];
    } catch {
      return [];
    }
  },
  async save(entries) {
    await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(entries));
  },
};
export const outbox = vida.createOutbox(outboxStorage);
