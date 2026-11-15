/**
 * Open a cited source document in the system browser sheet.
 */
import * as WebBrowser from 'expo-web-browser';

export async function openSource(url?: string | null): Promise<void> {
  if (!url || !/^https?:\/\//i.test(url)) return;
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    // The browser sheet can fail on some emulators; nothing else to do.
  }
}
