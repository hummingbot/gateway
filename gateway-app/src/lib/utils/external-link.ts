/**
 * External Link Utility
 *
 * Handles opening external URLs in both web and Tauri desktop/mobile environments
 */

import { openUrl } from '@tauri-apps/plugin-opener';

/**
 * Open a URL in the default browser
 * Works in both web and Tauri environments
 */
export async function openExternalUrl(url: string): Promise<void> {
  console.log('[external-link] Opening URL:', url);

  // Check if running in Tauri
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    console.log('[external-link] Running in Tauri, using opener plugin');
    try {
      await openUrl(url);
      console.log('[external-link] Successfully opened URL with opener plugin');
    } catch (error) {
      console.error('[external-link] Failed to open URL with opener plugin:', error);
      // Fallback to window.open
      console.log('[external-link] Attempting fallback to window.open');
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } else {
    console.log('[external-link] Running in browser, using window.open');
    // Fallback for web: open in new tab
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
