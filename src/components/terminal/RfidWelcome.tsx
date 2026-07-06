interface Props {
  member: { firstName: string; lastName: string; balance: number };
  onContinue: () => void;
}

export function RfidWelcome({ member, onContinue }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
      <div className="size-14 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
        <svg className="size-7 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
        </svg>
      </div>
      <div className="text-center">
        <h1 className="text-xl font-semibold text-zinc-100">Welcome, {member.firstName}</h1>
        <p className="text-sm text-zinc-500 mt-1">{member.firstName} {member.lastName}</p>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center w-full max-w-xs">
        <p className="text-xs text-zinc-500">Credits</p>
        <p className="text-2xl font-bold text-zinc-100">₱{Number(member.balance).toLocaleString()}</p>
      </div>
      <button onClick={onContinue}
        className="w-full max-w-xs py-4 bg-emerald-500 text-black rounded-lg text-base font-semibold hover:bg-emerald-400 cursor-pointer"
      >
        Book
      </button>
    </div>
  );
}
