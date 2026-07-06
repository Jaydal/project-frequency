'use client';

import { useState } from 'react';
import { saveProducts } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';

interface Props {
  matchTypes: string[];
  durations: number[];
  rates: Record<string, number>;
  prepTimeSec: number;
}

const ALL_MATCH_TYPES = ['1v1', '2v2'];

export function ProductsEditor({ matchTypes, durations, rates, prepTimeSec }: Props) {
  const [enabledTypes, setEnabledTypes] = useState<string[]>(matchTypes);
  const [rows, setRows] = useState(() =>
    durations.map(d => ({ duration: d, rate: rates[String(d)] ?? 0 }))
  );
  const [prep, setPrep] = useState(String(prepTimeSec));
  const [saving, setSaving] = useState(false);

  const toggleType = (t: string) => {
    setEnabledTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const addRow = () => {
    const last = rows[rows.length - 1];
    const newDur = last ? Math.min(last.duration + 15, 120) : 30;
    const ratePerMin = last && last.rate ? last.rate / last.duration : 5;
    setRows(prev => [...prev, { duration: newDur, rate: Math.round(ratePerMin * newDur) }]);
  };

  const removeRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const updateDuration = (idx: number, val: number) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, duration: val } : r));
  };

  const updateRate = (idx: number, val: number) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, rate: val } : r));
  };

  function buildRateMap(): Record<string, number> {
    const map: Record<string, number> = {};
    for (const r of rows) {
      map[String(r.duration)] = r.rate;
    }
    return map;
  }

  async function handleSave() {
    setSaving(true);
    const fd = new FormData();
    fd.set('matchTypes', enabledTypes.join(','));
    fd.set('durations', rows.map(r => r.duration).join(','));
    fd.set('rates', JSON.stringify(buildRateMap()));
    fd.set('prepTime', prep);
    await saveProducts(fd);
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {/* Match Types */}
      <div>
        <label className="text-sm font-medium text-zinc-300 block mb-2">Match Types</label>
        <div className="flex gap-4">
          {ALL_MATCH_TYPES.map(t => (
            <label key={t} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={enabledTypes.includes(t)} onChange={() => toggleType(t)}
                className="w-4 h-4 accent-emerald-500 cursor-pointer" />
              <span className="text-zinc-100 text-sm">{t}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Duration & Pricing Table */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-zinc-300">Duration & Pricing</label>
          <Button type="button" size="sm" variant="outline" onClick={addRow}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Duration
          </Button>
        </div>
        <div className="overflow-hidden border border-zinc-800 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-2 w-1/3">Duration (min)</th>
                <th className="text-left px-4 py-2 w-1/3">Price (₱)</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-zinc-800">
                  <td className="px-4 py-2">
                    <Input type="number" min={5} max={999} value={r.duration}
                      onChange={e => updateDuration(i, parseInt(e.target.value) || 0)}
                      className="h-8 w-24 text-sm" />
                  </td>
                  <td className="px-4 py-2">
                    <Input type="number" min={0} step={1} value={r.rate}
                      onChange={e => updateRate(i, parseInt(e.target.value) || 0)}
                      className="h-8 w-24 text-sm" />
                  </td>
                  <td className="px-2 py-2">
                    <button onClick={() => removeRow(i)}
                      className="text-red-400 hover:text-red-300 cursor-pointer disabled:opacity-30"
                      disabled={rows.length <= 1}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preparation Time */}
      <div>
        <label className="text-sm font-medium text-zinc-300 block mb-1">Preparation Time (seconds)</label>
        <Input type="number" min={0} max={3600} value={prep}
          onChange={e => setPrep(e.target.value)}
          className="w-32" />
        <p className="text-xs text-zinc-500 mt-1">Time between booking and game start when a court is immediately available.</p>
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save'}
      </Button>
    </div>
  );
}
