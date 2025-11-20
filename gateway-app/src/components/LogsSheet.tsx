import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet';
import { Kbd } from './ui/kbd';
import { LogViewer } from './LogViewer';
import { RestartButton } from './RestartButton';

interface LogsSheetProps {
  gatewayPath: string;
  iconSize?: number;
}

export function LogsSheet({ gatewayPath, iconSize = 16 }: LogsSheetProps) {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(640); // Default width in pixels (40rem = 640px)
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcut: Cmd+L (Mac) or Ctrl+L (Windows/Linux)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const newWidth = window.innerWidth - e.clientX;
      // Min width: 320px (20rem), Max width: 95% of screen
      const minWidth = 320;
      const maxWidth = window.innerWidth * 0.95;
      const clampedWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
      setWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (isResizing) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          aria-label="View Gateway logs"
          title="View Gateway logs"
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
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" x2="8" y1="13" y2="13" />
            <line x1="16" x2="8" y1="17" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </Button>
      </SheetTrigger>
      <SheetContent
        ref={containerRef}
        side="right"
        className="w-full overflow-y-auto p-0 sm:!max-w-none"
        style={{ width: `${width}px`, maxWidth: 'none' }}
      >
        {/* Resize Handle */}
        <div
          className="absolute left-0 top-0 bottom-0 w-4 cursor-col-resize z-50 group flex items-center pointer-events-auto"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsResizing(true);
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize logs panel"
        >
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-border group-hover:bg-primary transition-colors pointer-events-none" />
        </div>

        <div className="px-6 py-6">
          <SheetHeader>
            <SheetTitle>Gateway Logs</SheetTitle>
            <SheetDescription className="flex items-center gap-2">
              <span>Press</span>
              <Kbd>⌘</Kbd>
              <Kbd>L</Kbd>
              <span>to toggle</span>
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <RestartButton iconSize={16} showLabel={true} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Trigger log refresh - LogViewer will handle it internally
                  const logViewerRefreshEvent = new CustomEvent('refreshLogs');
                  window.dispatchEvent(logViewerRefreshEvent);
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mr-2"
                >
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                </svg>
                Refresh Logs
              </Button>
            </div>

            {/* Log Viewer */}
            <LogViewer gatewayPath={gatewayPath} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
