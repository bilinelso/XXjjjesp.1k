import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ShieldCheck } from 'lucide-react';
import { LeadMatchingAudit } from './LeadMatchingAudit';
import { MonetaAudit } from './MonetaAudit';

type AuditTab = 'leads' | 'moneta';

const TABS: { key: AuditTab; label: string }[] = [
  { key: 'leads', label: 'Leads' },
  { key: 'moneta', label: 'Moneta' },
];

export function AuditoriaView() {
  const [tab, setTab] = useState<AuditTab>('leads');
  const [counts, setCounts] = useState<Record<AuditTab, number>>({ leads: 0, moneta: 0 });

  // Contagem das duas abas no mount, para os badges aparecerem sem clicar.
  // Os dados completos de cada aba carregam sob demanda, no próprio componente.
  useEffect(() => {
    async function loadCounts() {
      const [leads, moneta] = await Promise.all([
        supabase.from('potential_lead_matches').select('*', { count: 'exact', head: true }),
        supabase.from('moneta_revisao_pendente').select('*', { count: 'exact', head: true }),
      ]);

      setCounts({
        leads: leads.count ?? 0,
        moneta: moneta.count ?? 0,
      });
    }

    loadCounts();
  }, []);

  const setCount = (key: AuditTab) => (count: number) =>
    setCounts(prev => (prev[key] === count ? prev : { ...prev, [key]: count }));

  return (
    <div className="max-w-3xl mx-auto px-6 py-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
          <ShieldCheck size={24} className="text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Auditoria</h1>
          <p className="text-sm text-slate-500 mt-0.5">Revisão manual de vínculos pendentes</p>
        </div>
      </div>

      <div className="flex border-b border-slate-200 mb-5">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 ${
              tab === t.key
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span
                className={`inline-flex items-center justify-center min-w-[20px] px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                  tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'leads' && <LeadMatchingAudit onCountChange={setCount('leads')} />}
      {tab === 'moneta' && <MonetaAudit onCountChange={setCount('moneta')} />}
    </div>
  );
}
