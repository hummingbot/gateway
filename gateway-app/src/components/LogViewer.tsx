import { useEffect, useRef, useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ReactWindow from 'react-window';
import { cn } from '@/lib/utils';

const { FixedSizeList } = ReactWindow;

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
  const listRef = useRef<any>(null);
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
    if (listRef.current && logLines.length > 0) {
      listRef.current.scrollToItem(logLines.length - 1, 'end');
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

  const logLines = useMemo(() => logs.split('\n'), [logs]);

  // Virtualized row renderer
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => (
    <div style={style} className={cn('text-xs font-mono px-4', getLogLevelColor(logLines[index]))}>
      {logLines[index]}
    </div>
  );

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Line count */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{logLines.length} lines</span>
      </div>

      {/* Virtualized Log Display - Only renders visible lines */}
      <div className="rounded-md border bg-background">
        <FixedSizeList
          ref={listRef}
          height={window.innerHeight - 256} // Equivalent to h-[calc(100vh-16rem)]
          itemCount={logLines.length}
          itemSize={20} // Line height in pixels
          width="100%"
          className="font-mono"
        >
          {Row}
        </FixedSizeList>
      </div>
    </div>
  );
}

// Export handle clear for external use
export { LogViewer as default };
