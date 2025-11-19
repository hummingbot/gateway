import { toast } from 'sonner';

// Check if we're running in Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

let tauriNotification: any = null;

// Dynamically import Tauri notification plugin only if in Tauri environment
if (isTauri) {
  import('@tauri-apps/plugin-notification').then((module) => {
    tauriNotification = module;
  });
}

export async function showNotification(title: string, body: string) {
  // Use Tauri notifications if available
  if (isTauri && tauriNotification) {
    try {
      let permission = await tauriNotification.isPermissionGranted();

      if (!permission) {
        const result = await tauriNotification.requestPermission();
        permission = result === 'granted';
      }

      if (permission) {
        tauriNotification.sendNotification({ title, body });
        return;
      }
    } catch (err) {
      console.error('Failed to show Tauri notification:', err);
    }
  }

  // Fallback to react-hot-toast for browser
  toast(body, { duration: 3000 });
}

export async function showSuccessNotification(message: string) {
  if (isTauri && tauriNotification) {
    try {
      let permission = await tauriNotification.isPermissionGranted();

      if (!permission) {
        const result = await tauriNotification.requestPermission();
        permission = result === 'granted';
      }

      if (permission) {
        tauriNotification.sendNotification({ title: 'Success', body: message });
        return;
      }
    } catch (err) {
      console.error('Failed to show Tauri notification:', err);
    }
  }

  // Fallback to react-hot-toast for browser
  toast.success(message, { duration: 3000 });
}

export async function showErrorNotification(message: string) {
  if (isTauri && tauriNotification) {
    try {
      let permission = await tauriNotification.isPermissionGranted();

      if (!permission) {
        const result = await tauriNotification.requestPermission();
        permission = result === 'granted';
      }

      if (permission) {
        tauriNotification.sendNotification({ title: 'Error', body: message });
        return;
      }
    } catch (err) {
      console.error('Failed to show Tauri notification:', err);
    }
  }

  // Fallback to react-hot-toast for browser
  toast.error(message, { duration: 4000 });
}
