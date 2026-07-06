interface Props {
  title: string;
  message: string;
  onRetry: () => void;
}

export function ErrorScreen({ title, message, onRetry }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
      <div className="size-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
        <svg className="size-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
      </div>
      <div className="text-center">
        <h1 className="text-lg font-semibold text-zinc-100">{title}</h1>
        <p className="text-sm text-zinc-500 mt-1 max-w-xs">{message}</p>
      </div>
      <button onClick={onRetry}
        className="w-full max-w-xs py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-700 cursor-pointer"
      >
        Try Again
      </button>
    </div>
  );
}
