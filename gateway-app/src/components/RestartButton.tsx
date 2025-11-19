import { useState } from 'react';
import { Button } from './ui/button';
import { gatewayPost, gatewayGet } from '../lib/api';
import { showSuccessNotification, showErrorNotification } from '../lib/notifications';

interface RestartButtonProps {
  className?: string;
  iconSize?: number;
}

export function RestartButton({ className = '', iconSize = 18 }: RestartButtonProps) {
  const [isRestarting, setIsRestarting] = useState(false);

  async function waitForGateway() {
    const maxAttempts = 30; // 30 attempts = 15 seconds max
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        await gatewayGet('/');
        // Gateway is back online
        return true;
      } catch (err) {
        // Gateway still down, wait and retry
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }
    }
    return false; // Timeout
  }

  async function handleRestart() {
    setIsRestarting(true);

    try {
      // Send restart command - Gateway will shut down immediately
      await gatewayPost('/restart', {});
    } catch (err) {
      // Expected - Gateway shuts down before responding
      console.log('Gateway shutting down (expected):', err);
    }

    // Show restarting notification
    await showSuccessNotification('Gateway is restarting...');

    // Wait for Gateway to come back online
    const isOnline = await waitForGateway();

    if (isOnline) {
      // Refresh immediately (success is implied by the refresh)
      window.location.reload();
    } else {
      await showErrorNotification('Gateway restart timeout. Please refresh manually.');
      setIsRestarting(false);
    }
  }

  return (
    <Button
      onClick={handleRestart}
      disabled={isRestarting}
      variant="ghost"
      size="icon"
      className={`h-9 w-9 ${className}`}
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
    </Button>
  );
}
