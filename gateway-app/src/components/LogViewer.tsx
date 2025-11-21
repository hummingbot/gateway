import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ScrollArea } from './ui/scroll-area';
import { cn } from '@/lib/utils';

interface LogViewerProps {
  gatewayPath: string;
  className?: string;
  onClear?: () => void;
}

function getLogLevelColor(line: string): string {
  if (line.includes('| error |')) return 'text-red-500';
  if (line.includes('| warn |')) return 'text-yellow-500';
  if (line.includes('| info |')) return 'text-blue-400';
  if (line.includes('| debug |')) return 'text-gray-400';
  return 'text-foreground';
}

export function LogViewer({ gatewayPath, className, onClear }: LogViewerProps) {
  const [logs, setLogs] = useState<string>('Loading logs...');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [isTauri, setIsTauri] = useState(false);

  // Check if running in Tauri
  useEffect(() => {
    setIsTauri(typeof window !== 'undefined' && '__TAURI__' in window);
  }, []);

  // Fetch logs from Tauri
  const fetchLogs = async () => {
    if (!isTauri) {
      setLogs('Log viewer is only available in Tauri desktop/mobile mode.\n\nPlease run: pnpm tauri dev');
      return;
    }

    try {
      const result = await invoke<string>('read_gateway_logs', {
        gatewayPath,
        lines: 500,
      });
      setLogs(result);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      setLogs(`Error fetching logs: ${error}`);
    }
  };

  // Poll logs every 2 seconds
  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, [gatewayPath, isTauri]);

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [logs]);

  // Listen for refresh logs event
  useEffect(() => {
    const handleRefreshEvent = () => {
      handleClear();
    };

    window.addEventListener('refreshLogs', handleRefreshEvent);
    return () => window.removeEventListener('refreshLogs', handleRefreshEvent);
  }, []);

  const handleClear = () => {
    setLogs('');
    if (onClear) onClear();
  };

  const logLines = logs.split('\n');

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Line count */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{logLines.length} lines</span>
      </div>

      {/* Log Display with ScrollArea */}
      <ScrollArea ref={scrollAreaRef} className="h-[calc(100vh-16rem)] w-full rounded-md border bg-background">
        <div className="p-4">
          <pre className="text-xs font-mono">
            {logLines.map((line, i) => (
              <div key={i} className={getLogLevelColor(line)}>
                {line}
              </div>
            ))}
          </pre>
        </div>
      </ScrollArea>
    </div>
  );
}

// Export handle clear for external use
export { LogViewer as default };
