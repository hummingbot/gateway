/**
 * External Link Utility
 *
 * Handles opening external URLs in both web and Tauri desktop/mobile environments
 */

import { open } from '@tauri-apps/plugin-shell';

/**
 * Open a URL in the default browser
 * Works in both web and Tauri environments
 */
export async function openExternalUrl(url: string): Promise<void> {
  // Check if running in Tauri
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    // Use Tauri's shell plugin to open in external browser
    await open(url);
  } else {
    // Fallback for web: open in new tab
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
