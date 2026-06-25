"use client";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function Header() {
  const { data: session } = useSession();

  return (
    <header className="bg-white shadow-sm border-b px-6 py-3 flex justify-between items-center">
      <div className="text-gray-600 font-medium">Management Portal</div>
      <div className="flex items-center gap-4">
        {session?.user ? (
          <>
            <span className="text-sm font-medium">{session.user.name} ({(session.user as any).role})</span>
            <Button variant="outline" size="sm" onClick={() => signOut()}>Logout</Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => window.location.href = '/login'}>Login</Button>
        )}
      </div>
    </header>
  );
}
