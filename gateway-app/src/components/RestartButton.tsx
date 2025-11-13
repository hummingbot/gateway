import { useState } from 'react';
import { gatewayPost } from '../lib/api';
import { showSuccessNotification } from '../lib/notifications';

interface RestartButtonProps {
  className?: string;
  iconSize?: number;
}

export function RestartButton({ className = '', iconSize = 18 }: RestartButtonProps) {
  const [isRestarting, setIsRestarting] = useState(false);

  async function handleRestart() {
    try {
      setIsRestarting(true);
      await gatewayPost('/restart', {});
      await showSuccessNotification('Gateway is restarting...');

      // Wait a bit for the server to restart, then reload the page
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (err) {
      console.error('Failed to restart Gateway:', err);
      setIsRestarting(false);
    }
  }

  return (
    <button
      onClick={handleRestart}
      disabled={isRestarting}
      className={`p-1.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      aria-label="Restart Gateway"
      title="Restart Gateway"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={isRestarting ? 'animate-spin' : ''}
      >
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
        <path d="M21 3v5h-5"></path>
      </svg>
    </button>
  );
}
