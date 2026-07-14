import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  sidebar?: ReactNode;
}

export function TerminalLayout({ children, sidebar }: Props) {
  return (
    <div className="min-h-[100dvh] bg-black flex items-center justify-center sm:p-4">
      <div className="w-full h-[100dvh] sm:h-auto sm:max-h-[600px] sm:max-w-[900px] sm:aspect-[5/3] bg-zinc-950 sm:rounded-2xl sm:border sm:border-zinc-800 overflow-hidden relative flex flex-col">
        {sidebar ? (
          <div className="h-full w-full flex flex-col sm:flex-row overflow-y-auto sm:overflow-hidden">
            <div className="flex-1 min-w-0 flex flex-col min-h-[400px] sm:min-h-0 order-2 sm:order-1">
              {children}
            </div>
            <div className="w-full sm:w-[240px] shrink-0 border-b sm:border-b-0 sm:border-l border-zinc-800 order-1 sm:order-2 bg-zinc-950">
              {sidebar}
            </div>
          </div>
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center p-4">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
