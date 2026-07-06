interface Props {
  member: { firstName: string; lastName: string; balance: number };
  onContinue: () => void;
}

export function RfidWelcome({ member, onContinue }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="text-5xl mb-4">👋</div>
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Welcome, {member.firstName}</h1>
      <p className="text-gray-500 mb-6">{member.firstName} {member.lastName}</p>

      <div className="bg-blue-50 rounded-2xl p-5 mb-8 text-center w-full max-w-xs">
        <p className="text-sm text-blue-600 font-medium">Available Credits</p>
        <p className="text-4xl font-bold text-blue-700">₱{Number(member.balance).toLocaleString()}</p>
      </div>

      <button onClick={onContinue}
        className="w-full max-w-xs py-5 bg-blue-600 text-white rounded-2xl text-2xl font-bold active:bg-blue-700 cursor-pointer"
      >
        Continue
      </button>
    </div>
  );
}
