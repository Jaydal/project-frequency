import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  sidebar?: ReactNode;
}

export function TerminalLayout({ children, sidebar }: Props) {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-2"
      style={{ minHeight: '100dvh' }}>
      <div className="w-full max-w-[820px] aspect-[5/3] bg-white rounded-3xl shadow-lg overflow-hidden relative"
        style={{ maxHeight: '492px' }}>
        {sidebar ? (
          <div className="h-full w-full flex">
            <div className="flex-1 min-w-0 flex flex-col">
              {children}
            </div>
            <div className="w-[210px] shrink-0 border-l border-gray-200">
              {sidebar}
            </div>
          </div>
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
