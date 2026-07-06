'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AddCourtForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);
    const supabase = createClient();
    
    const { error } = await supabase.from('courts').insert([{ name }]);
    
    if (error) {
      setError(error.message);
    } else {
      setName('');
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Register New Court</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleAdd} className="flex gap-4">
          <Input 
            placeholder="Court Name (e.g., Court 3)" 
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !name.trim()}>
            {loading ? 'Adding...' : 'Add Court'}
          </Button>
        </form>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      </CardContent>
    </Card>
  );
}
