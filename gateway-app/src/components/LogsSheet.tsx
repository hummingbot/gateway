import { useState, useEffect } from 'react';
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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
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
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
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
          <RestartButton iconSize={16} showLabel={true} />

          {/* Log Viewer */}
          <LogViewer gatewayPath={gatewayPath} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
