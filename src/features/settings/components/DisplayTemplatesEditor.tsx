'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  templates: string;
}

export function DisplayTemplatesEditor({ templates: initial }: Props) {
  const [raw, setRaw] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    try {
      JSON.parse(raw);
    } catch {
      setError('Invalid JSON');
      return;
    }
    setSaving(true);
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'displayTemplates', value: raw }),
    });
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground space-y-1 mb-2">
        <p>Available variables: <code className="text-emerald-400">{'{court_name}'}</code> <code className="text-emerald-400">{'{timer}'}</code> <code className="text-emerald-400">{'{match_info}'}</code> <code className="text-emerald-400">{'{queue_count}'}</code></p>
        <p>Sections: <code className="text-zinc-300">idle</code> <code className="text-zinc-300">prep</code> <code className="text-zinc-300">game</code> <code className="text-zinc-300">loop</code></p>
      </div>
      <textarea
        value={raw}
        onChange={e => { setRaw(e.target.value); setError(null); }}
        rows={18}
        className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm font-mono text-foreground"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Templates'}
      </Button>
    </div>
  );
}
