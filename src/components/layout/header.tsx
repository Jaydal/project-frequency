"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { User } from "@supabase/supabase-js";

export function Header() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <header className="bg-white shadow-sm border-b px-6 py-3 flex justify-between items-center">
      <div className="text-gray-600 font-medium">Management Portal</div>
      <div className="flex items-center gap-4">
        {user ? (
          <>
            <span className="text-sm font-medium">{user.email}</span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>Logout</Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => window.location.href = "/login"}>Login</Button>
        )}
      </div>
    </header>
  );
}
