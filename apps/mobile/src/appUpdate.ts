/**
 * App updates (docs/android.md → "Actualizaciones"):
 * - Code-only changes arrive on their own through expo-updates (EAS Update): downloaded when the
 *   app opens and applied on the next start. Nothing to do here except show the status.
 * - Native changes need a new APK. CI publishes it to Supabase Storage with `latest.json`; when its
 *   versionCode is higher than the installed one the app offers "Actualizar app", downloads it and
 *   opens Android's installer (one tap). Android itself rejects an APK not signed with VIDA's key.
 */
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

export interface ApkRelease {
  versionCode: number;
  versionName: string;
  url: string;
  notes?: string | null;
  /** Installs below this versionCode cannot skip the update (breaking server changes). */
  minVersionCode?: number | null;
  publishedAt?: string;
}

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
export const RELEASE_MANIFEST_URL = supabaseUrl + '/storage/v1/object/public/releases/android/latest.json';

export const installedVersionCode = () => Number(Application.nativeBuildVersion ?? 0);
export const installedVersionName = () => Application.nativeApplicationVersion ?? '0';

/** The newer APK, if any. Only APKs hosted on our own Supabase project are accepted. */
export async function checkApkUpdate(): Promise<ApkRelease | null> {
  if (Platform.OS !== 'android' || !supabaseUrl) return null;
  const res = await fetch(RELEASE_MANIFEST_URL + '?t=' + Date.now());
  if (!res.ok) return null;
  const rel = (await res.json()) as ApkRelease;
  if (!Number.isInteger(rel.versionCode) || typeof rel.url !== 'string') return null;
  let sameHost = false;
  try {
    sameHost = new URL(rel.url).host === new URL(supabaseUrl).host && rel.url.startsWith('https://');
  } catch {
    return null;
  }
  return sameHost && rel.versionCode > installedVersionCode() ? rel : null;
}

export const isMandatory = (rel: ApkRelease) => rel.minVersionCode != null && installedVersionCode() < rel.minVersionCode;

/** Downloads the APK to the cache and hands it to Android's package installer. */
export async function downloadAndInstall(rel: ApkRelease, onProgress: (fraction: number) => void): Promise<void> {
  const target = FileSystem.cacheDirectory + 'vida-' + rel.versionCode + '.apk';
  const task = FileSystem.createDownloadResumable(rel.url, target, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
  });
  const done = await task.downloadAsync();
  if (!done || done.status !== 200) throw new Error('No se pudo descargar la actualización. Revisa tu conexión.');
  const contentUri = await FileSystem.getContentUriAsync(done.uri);
  const FLAG_GRANT_READ_URI_PERMISSION = 0x1, FLAG_ACTIVITY_NEW_TASK = 0x10000000;
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
  });
}

/** Over-the-air status for the "Versión" card. */
export function otaStatus(): { enabled: boolean; label: string } {
  if (!Updates.isEnabled) return { enabled: false, label: 'Actualizaciones automáticas desactivadas en esta compilación' };
  if (Updates.isEmbeddedLaunch) return { enabled: true, label: 'Código de la instalación' };
  const when = Updates.createdAt ? Updates.createdAt.toLocaleDateString('es-AR') : '';
  return { enabled: true, label: 'Actualización del ' + when + ' (' + (Updates.updateId ?? '').slice(0, 8) + ')' };
}

/** Checks for a code update now; returns true when one was downloaded (applied by reloading). */
export async function fetchOtaNow(): Promise<boolean> {
  if (!Updates.isEnabled) return false;
  const check = await Updates.checkForUpdateAsync();
  if (!check.isAvailable) return false;
  await Updates.fetchUpdateAsync();
  return true;
}

export const reloadApp = () => Updates.reloadAsync();
