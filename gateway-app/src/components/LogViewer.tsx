import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

interface LogViewerProps {
  gatewayPath: string;
  className?: string;
}

function getLogLevelColor(line: string): string {
  if (line.includes('| error |')) return 'text-red-500';
  if (line.includes('| warn |')) return 'text-yellow-500';
  if (line.includes('| info |')) return 'text-blue-400';
  if (line.includes('| debug |')) return 'text-gray-400';
  return 'text-foreground';
}

export function LogViewer({ gatewayPath, className }: LogViewerProps) {
  const [logs, setLogs] = useState<string>('Loading logs...');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
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
    if (autoScroll && viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleClear = () => {
    setLogs('');
  };

  const logLines = logs.split('\n');

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {logLines.length} lines
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoScroll(!autoScroll)}
          >
            Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear}>
            Clear Logs
          </Button>
        </div>
      </div>

      {/* Log Display */}
      <ScrollArea className="h-[calc(100vh-16rem)] w-full rounded-md border bg-background">
        <div ref={scrollRef} className="p-4">
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
