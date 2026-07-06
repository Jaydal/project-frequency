interface Props {
  title: string;
  message: string;
  onRetry: () => void;
}

export function ErrorScreen({ title, message, onRetry }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="text-6xl mb-4">⚠️</div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">{title}</h1>
      <p className="text-gray-500 text-center mb-8 max-w-xs">{message}</p>
      <button onClick={onRetry}
        className="w-full max-w-xs py-5 bg-blue-600 text-white rounded-2xl text-xl font-bold active:bg-blue-700 cursor-pointer"
      >
        Try Again
      </button>
    </div>
  );
}
