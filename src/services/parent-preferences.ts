import * as SecureStore from 'expo-secure-store';
const KEY = 'slickk.parent.preferences.v1';
export type ParentPreferences = { classAlerts: boolean; testResults: boolean; weeklyReports: boolean };
const defaults: ParentPreferences = { classAlerts: true, testResults: true, weeklyReports: true };
export async function loadParentPreferences(): Promise<ParentPreferences> {
  const stored = await SecureStore.getItemAsync(KEY);
  if (!stored) return defaults;
  try { return { ...defaults, ...JSON.parse(stored) }; } catch { return defaults; }
}
export async function saveParentPreferences(value: ParentPreferences) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(value));
}
