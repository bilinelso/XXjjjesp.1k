import { useState, useEffect, useMemo } from 'react';
import { BarChart2, Search, ChevronUp, ChevronDown, ChevronsUpDown, Eye, EyeOff } from 'lucide-react';
import { Pagination } from './Pagination';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { DatePicker } from './DatePicker';
import type { Cliente } from '../lib/api';

interface CampanhasViewProps {
  clientes: Cliente[];
  onSelectCliente: (c: Cliente) => void;
  onRefreshClientes?: () => Promise<void> | void;
}

interface CampaignMapping {
  id: string;
  google_ads_nome: string;
  campanha_id: string | null;
  campanha_nome_custom: string | null;
}

interface CampaignCost {
  campanha_id: string;
  data: string;
  custo: number;
}

interface SummaryRow {
  campanhaId: string | null;
  campanhaLabel: string;
  googleNome: string | null;
  conversoes: number;
  depositoTotal: number;
  custoTotal: number;
  faturamentoBruto: number;
  faturamentoLiquido: number;
}

type SortState = { col: string; dir: 'asc' | 'desc' };

const todayISO = () => new Date().toISOString().split('T')[0];
const daysAgoISO = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0];
};

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  if (!iso) return '-';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function SortIcon({ col, sort }: { col: string; sort: SortState }) {
  if (sort.col !== col) return <ChevronsUpDown size={12} className="ml-1 text-slate-300 inline-block" />;
  return sort.dir === 'asc'
    ? <ChevronUp size={12} className="ml-1 text-blue-600 inline-block" />
    : <ChevronDown size={12} className="ml-1 text-blue-600 inline-block" />;
}

function toggleSort(current: SortState, col: string, setter: (s: SortState) => void) {
  setter(current.col === col
    ? { col, dir: current.dir === 'asc' ? 'desc' : 'asc' }
    : { col, dir: 'desc' });
}

function SortTh({ col, label, sort, onSort, className = '' }: {
  col: string; label: string; sort: SortState; onSort: (col: string) => void; className?: string;
}) {
  return (
    <th
      className={`text-left px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none ${className}`}
      onClick={() => onSort(col)}
    >
      {label}<SortIcon col={col} sort={sort} />
    </th>
  );
}

function StaticTh({ label, className = '' }: { label: string; className?: string }) {
  return (
    <th className={`text-left px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap ${className}`}>
      {label}
    </th>
  );
}

function resolveCampanha(
  campanha: string | undefined | null,
  mappings: CampaignMapping[]
): { id: string | null; label: string; googleNome: string | null } {
  if (!campanha) return { id: null, label: '', googleNome: null };
  const normalized = campanha.trim().toLowerCase();
  const m = mappings.find(m =>
    (m.campanha_id && m.campanha_id.trim().toLowerCase() === normalized) ||
    m.google_ads_nome.trim().toLowerCase() === normalized ||
    (m.campanha_nome_custom && m.campanha_nome_custom.trim().toLowerCase() === normalized)
  );
  if (!m) return { id: campanha, label: campanha, googleNome: null };
  const label = m.campanha_nome_custom?.trim() || m.google_ads_nome;
  return { id: m.campanha_id || campanha, label, googleNome: m.google_ads_nome };
}

const STATUS_LABELS: Record<string, string> = {
  depositou: 'Depositou', acompanhamento: 'Acompanhamento',
  comprou: 'Comprou', problema: 'Problema', 'conta-criada': 'Conta criada',
  finalizado: 'Finalizado', inativo: 'Inativo',
};

const STATUS_COLORS: Record<string, string> = {
  depositou:      'bg-green-100 text-green-800',
  comprou:        'bg-blue-100 text-blue-800',
  'conta-criada': 'bg-purple-100 text-purple-800',
  acompanhamento: 'bg-yellow-100 text-yellow-800',
  problema:       'bg-red-100 text-red-800',
  finalizado:     'bg-slate-100 text-slate-600',
  inativo:        'bg-gray-100 text-gray-500',
};

export function CampanhasView({ clientes, onSelectCliente, onRefreshClientes }: CampanhasViewProps) {
  const { profile } = useAuth();
  if (!profile?.is_master && !profile?.can_access_campanhas) return null;

  const [filterDateFrom, setFilterDateFrom] = useState(() => daysAgoISO(30));
  const [filterDateTo, setFilterDateTo] = useState(() => todayISO());
  const [activePreset, setActivePreset] = useState<'1S' | '1M' | 'todos'>('1M');
  const [dateField, setDateField] = useState<'data_compra' | 'inscricao'>('data_compra');
  const [search, setSearch] = useState('');
  const [mostrarOcultosCampanhas, setMostrarOcultosCampanhas] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const [clienteSort, setClienteSort] = useState<SortState>({ col: 'data_compra', dir: 'desc' });
  const [summarySort, setSummarySort] = useState<SortState>({ col: 'conversoes', dir: 'desc' });

  const [mappings, setMappings] = useState<CampaignMapping[]>([]);
  const [costs, setCosts] = useState<CampaignCost[]>([]);
  const [loading, setLoading] = useState(false);

  const handleToggleOcultoCampanhas = async (cliente: Cliente) => {
    await supabase
      .from('clientes')
      .update({ oculto_campanhas: !cliente.oculto_campanhas })
      .eq('id', cliente.id);

    if (onRefreshClientes) {
      await onRefreshClientes();
    }
  };

  const applyPreset = (preset: '1S' | '1M' | 'todos') => {
    setActivePreset(preset);
    if (preset === 'todos') { setFilterDateFrom(''); setFilterDateTo(''); return; }
    const hoje = todayISO();
    setFilterDateTo(hoje);
    setFilterDateFrom(preset === '1S' ? daysAgoISO(7) : daysAgoISO(30));
  };

  const periodClientesBase = useMemo(() => clientes.filter(c => {
    const dc = dateField === 'data_compra'
      ? c.data_compra?.slice(0, 10) ?? ''
      : (c.lead?.created_at?.slice(0, 10) ?? '');
    if (filterDateFrom && dc < filterDateFrom) return false;
    if (filterDateTo && dc > filterDateTo) return false;
    return true;
  }), [clientes, filterDateFrom, filterDateTo, dateField]);

  const periodClientes = useMemo(
    () => periodClientesBase.filter(c => !c.oculto_campanhas),
    [periodClientesBase]
  );

  const periodClientesTabela = useMemo(
    () => (mostrarOcultosCampanhas ? periodClientesBase : periodClientes),
    [mostrarOcultosCampanhas, periodClientesBase, periodClientes]
  );

  const displayClientes = useMemo(() => {
    const base = search.trim()
      ? periodClientesTabela.filter(c => {
          const q = search.toLowerCase();
          return c.nome.toLowerCase().includes(q) || (c.telefone || '').includes(search);
        })
      : periodClientesTabela;
    const dir = clienteSort.dir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      switch (clienteSort.col) {
        case 'nome':         return dir * a.nome.localeCompare(b.nome);
        case 'data_compra':  return dir * (a.data_compra || '').localeCompare(b.data_compra || '');
        case 'status':       return dir * a.status.localeCompare(b.status);
        case 'assessor':     return dir * (a.assessor || '').localeCompare(b.assessor || '');
        case 'deposito':     return dir * ((a.valor_deposito ?? 0) - (b.valor_deposito ?? 0));
        case 'valor_produto':return dir * ((a.valor_produto ?? 0) - (b.valor_produto ?? 0));
        default: return 0;
      }
    });
  }, [periodClientesTabela, search, clienteSort]);

  const totalPages = Math.ceil(displayClientes.length / PAGE_SIZE);
  const pagedClientes = displayClientes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [filterDateFrom, filterDateTo, dateField, search, clienteSort, mostrarOcultosCampanhas]);

  const [summaryPage, setSummaryPage] = useState(1);
  const SUMMARY_PAGE_SIZE = 20;
  useEffect(() => setSummaryPage(1), [filterDateFrom, filterDateTo, dateField, summarySort]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase
        .from('campaign_mappings')
        .select('id, google_ads_nome, campanha_id, campanha_nome_custom'),
      supabase
        .from('campaign_costs')
        .select('campanha_id, data, custo')
        .gte('data', filterDateFrom || '0000-01-01')
        .lte('data', filterDateTo || '9999-12-31'),
    ]).then(([mappingsRes, costsRes]) => {
      setMappings((mappingsRes.data || []) as CampaignMapping[]);
      setCosts((costsRes.data || []) as unknown as CampaignCost[]);
      setLoading(false);
    });
  }, [filterDateFrom, filterDateTo]);

  const summaryRows = useMemo((): SummaryRow[] => {
    const map = new Map<string | null, SummaryRow>();

    const mappingByCampaignId = new Map(
      mappings
        .filter(m => !!m.campanha_id)
        .map(m => [m.campanha_id as string, m] as const)
    );

    const costByCampaignId = new Map<string, number>();
    for (const c of costs) {
      if (!c.campanha_id) continue;
      costByCampaignId.set(c.campanha_id, (costByCampaignId.get(c.campanha_id) || 0) + c.custo);
    }

    for (const c of periodClientes) {
      const campanha = c.lead?.campanha;
      const { id: campanhaId, label, googleNome } = resolveCampanha(campanha, mappings);
      const key = campanhaId ?? null;

      if (!map.has(key)) {
        map.set(key, {
          campanhaId: key,
          campanhaLabel: label || '(sem rastreamento)',
          googleNome,
          conversoes: 0,
          depositoTotal: 0,
          custoTotal: 0,
          faturamentoBruto: 0,
          faturamentoLiquido: 0,
        });
      }
      const row = map.get(key)!;
      row.conversoes += 1;
      row.faturamentoBruto += c.valor_produto ?? 0;
      row.depositoTotal += c.valor_deposito ?? 0;
    }

    // Include campaigns that had cost in the selected period even if they had zero conversions.
    for (const [campanhaId] of costByCampaignId) {
      if (map.has(campanhaId)) continue;
      const mapping = mappingByCampaignId.get(campanhaId);
      map.set(campanhaId, {
        campanhaId,
        campanhaLabel: mapping?.campanha_nome_custom?.trim() || mapping?.google_ads_nome || campanhaId,
        googleNome: mapping?.google_ads_nome || null,
        conversoes: 0,
        depositoTotal: 0,
        custoTotal: 0,
        faturamentoBruto: 0,
        faturamentoLiquido: 0,
      });
    }

    for (const [, row] of map) {
      row.custoTotal = row.campanhaId ? (costByCampaignId.get(row.campanhaId) || 0) : 0;
      row.faturamentoLiquido = row.faturamentoBruto * 0.9;
    }

    return [...map.values()];
  }, [periodClientes, mappings, costs]);

  const sortedSummary = useMemo(() => {
    const dir = summarySort.dir === 'asc' ? 1 : -1;
    return [...summaryRows].sort((a, b) => {
      switch (summarySort.col) {
        case 'campanhaLabel':      return dir * a.campanhaLabel.localeCompare(b.campanhaLabel);
        case 'conversoes':         return dir * (a.conversoes - b.conversoes);
        case 'depositoTotal':      return dir * (a.depositoTotal - b.depositoTotal);
        case 'custoTotal':         return dir * (a.custoTotal - b.custoTotal);
        case 'cpa': {
          const ca = a.conversoes > 0 && a.custoTotal > 0 ? a.custoTotal / a.conversoes : 0;
          const cb = b.conversoes > 0 && b.custoTotal > 0 ? b.custoTotal / b.conversoes : 0;
          return dir * (ca - cb);
        }
        case 'faturamentoBruto':   return dir * (a.faturamentoBruto - b.faturamentoBruto);
        case 'faturamentoLiquido': return dir * (a.faturamentoLiquido - b.faturamentoLiquido);
        case 'roi': {
          const ra = a.custoTotal > 0 ? a.faturamentoLiquido / a.custoTotal : 0;
          const rb = b.custoTotal > 0 ? b.faturamentoLiquido / b.custoTotal : 0;
          return dir * (ra - rb);
        }
        default: return 0;
      }
    });
  }, [summaryRows, summarySort]);

  const summaryTotalPages = Math.ceil(sortedSummary.length / SUMMARY_PAGE_SIZE);
  const pagedSummary = sortedSummary.slice((summaryPage - 1) * SUMMARY_PAGE_SIZE, summaryPage * SUMMARY_PAGE_SIZE);

  const metrics = useMemo(() => {
    const totalClientes = periodClientes.length;
    const totalRastreados = periodClientes.filter(c => c.lead?.campanha).length;
    const fatBruto = periodClientes.reduce((s, c) => s + (c.valor_produto ?? 0), 0);
    const fatLiquido = fatBruto * 0.9;
    const custoTotal = costs.reduce((s, c) => s + c.custo, 0);
    const cpaGeral = totalRastreados > 0 && custoTotal > 0 ? custoTotal / totalRastreados : null;
    return { totalClientes, totalRastreados, fatBruto, fatLiquido, custoTotal, cpaGeral };
  }, [periodClientes, costs]);

  const totals = useMemo(() => summaryRows.reduce(
    (acc, r) => ({
      conversoes: acc.conversoes + r.conversoes,
      depositoTotal: acc.depositoTotal + r.depositoTotal,
      custoTotal: acc.custoTotal + r.custoTotal,
      faturamentoBruto: acc.faturamentoBruto + r.faturamentoBruto,
      faturamentoLiquido: acc.faturamentoLiquido + r.faturamentoLiquido,
    }),
    { conversoes: 0, depositoTotal: 0, custoTotal: 0, faturamentoBruto: 0, faturamentoLiquido: 0 }
  ), [summaryRows]);

  const roiLabel = (liquido: number, custo: number) =>
    custo > 0 ? `${(liquido / custo).toFixed(1)}x` : null;

  const onClienteSort = (col: string) => toggleSort(clienteSort, col, setClienteSort);
  const onSummarySort = (col: string) => toggleSort(summarySort, col, setSummarySort);

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <BarChart2 size={20} className="text-blue-600" />
          Campanhas
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-full border border-slate-300 overflow-hidden text-xs font-medium">
            {(['data_compra', 'inscricao'] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setDateField(f)}
                className={`px-2.5 py-1 transition-colors ${
                  dateField === f ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f === 'data_compra' ? 'Data compra' : 'Data inscrição'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {(['1S', '1M', 'todos'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  activePreset === p
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {p === 'todos' ? 'Todos' : p}
              </button>
            ))}
          </div>
          <div className="w-[150px]">
            <DatePicker value={filterDateFrom} onChange={v => { setFilterDateFrom(v); setActivePreset('todos'); }} maxDate={filterDateTo || undefined} />
          </div>
          <span className="text-xs text-slate-400">-</span>
          <div className="w-[150px]">
            <DatePicker value={filterDateTo} onChange={v => { setFilterDateTo(v); setActivePreset('todos'); }} minDate={filterDateFrom || undefined} />
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total no período', value: String(metrics.totalClientes), color: 'text-slate-800' },
          { label: 'Rastreados', value: String(metrics.totalRastreados), color: 'text-blue-700' },
          { label: 'Fat. Bruto', value: `R$ ${fmtBRL(metrics.fatBruto)}`, color: 'text-green-700' },
          { label: 'Fat. Líquido (90%)', value: `R$ ${fmtBRL(metrics.fatLiquido)}`, color: 'text-emerald-700' },
          { label: 'Custo Total', value: metrics.custoTotal > 0 ? `R$ ${fmtBRL(metrics.custoTotal)}` : '-', color: 'text-amber-700' },
          { label: 'CPA Médio', value: metrics.cpaGeral ? `R$ ${fmtBRL(metrics.cpaGeral)}` : '-', color: 'text-purple-700' },
        ].map(card => (
          <div key={card.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-500 mb-1">{card.label}</p>
            <p className={`text-base font-semibold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Section 1: Client list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold text-slate-800 whitespace-nowrap">
            Clientes no período ({displayClientes.length})
          </h3>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-slate-600 whitespace-nowrap">
              <input
                type="checkbox"
                checked={mostrarOcultosCampanhas}
                onChange={e => setMostrarOcultosCampanhas(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Mostrar ocultos
            </label>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Buscar..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-20 bg-slate-50 [&>tr>th]:bg-slate-50 [&>tr>th]:border-b [&>tr>th]:border-slate-200">
                <tr>
                  <SortTh col="nome"          label="Nome"          sort={clienteSort} onSort={onClienteSort} />
                  <StaticTh label="Email" />
                  <StaticTh label="Telefone" />
                  <SortTh col="data_compra"   label="Data Compra"   sort={clienteSort} onSort={onClienteSort} />
                  <SortTh col="status"        label="Status"        sort={clienteSort} onSort={onClienteSort} />
                  <SortTh col="assessor"      label="Assessor"      sort={clienteSort} onSort={onClienteSort} />
                  <SortTh col="deposito"      label="Fundos"        sort={clienteSort} onSort={onClienteSort} />
                  <SortTh col="valor_produto" label="Valor Produto" sort={clienteSort} onSort={onClienteSort} />
                  <StaticTh label="ID Campanha" />
                  <StaticTh label="Nome da Campanha" />
                  <StaticTh label="Ações" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayClientes.length === 0 ? (
                  <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-400 text-sm">Nenhum cliente no período</td></tr>
                ) : pagedClientes.map(c => {
                  const campanha = c.lead?.campanha;
                  const { id: campId, label: campLabel } = resolveCampanha(campanha, mappings);
                  return (
                    <tr key={c.id} className={`hover:bg-slate-50 ${(c.valor_deposito ?? 0) >= 1 ? 'bg-green-50' : ''} ${c.oculto_campanhas ? 'opacity-40' : ''}`}>
                      <td
                        className="px-4 py-2.5 font-medium text-blue-600 cursor-pointer hover:underline whitespace-nowrap"
                        onClick={() => onSelectCliente(c)}
                      >
                        {c.nome}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 max-w-[180px] truncate">{c.email || '-'}</td>
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{c.telefone || '-'}</td>
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(c.data_compra)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] ?? 'bg-slate-100 text-slate-700'}`}>
                          {STATUS_LABELS[c.status] || c.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{c.assessor || '-'}</td>
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                        {(c.valor_deposito ?? 0) >= 1
                          ? profile?.is_master ? `$ ${c.valor_deposito!.toLocaleString('pt-BR')}` : '***'
                          : '-'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap font-medium">
                        {c.valor_produto ? `R$ ${fmtBRL(c.valor_produto)}` : '-'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 text-xs font-mono whitespace-nowrap">{campId || '-'}</td>
                      <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{campLabel || '-'}</td>
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleOcultoCampanhas(c)}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                          title={c.oculto_campanhas ? 'Exibir em Campanhas' : 'Ocultar em Campanhas'}
                          aria-label={c.oculto_campanhas ? 'Exibir em Campanhas' : 'Ocultar em Campanhas'}
                        >
                          {c.oculto_campanhas ? <Eye size={16} /> : <EyeOff size={16} />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={displayClientes.length}
          itemsPerPage={PAGE_SIZE}
        />
      </div>

      {/* Section 2: Campaign summary */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Resumo por Campanha</h3>
        </div>
        <div>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-20 bg-slate-50 [&>tr>th]:bg-slate-50 [&>tr>th]:border-b [&>tr>th]:border-slate-200">
              <tr>
                <StaticTh label="ID Campanha" />
                <SortTh col="campanhaLabel"      label="Nome da Campanha"  sort={summarySort} onSort={onSummarySort} />
                <SortTh col="conversoes"         label="Conversões"        sort={summarySort} onSort={onSummarySort} />
                <SortTh col="depositoTotal"      label="Fundos"            sort={summarySort} onSort={onSummarySort} />
                <SortTh col="custoTotal"         label="Custo Total (R$)"  sort={summarySort} onSort={onSummarySort} />
                <SortTh col="cpa"                label="CPA"               sort={summarySort} onSort={onSummarySort} />
                <SortTh col="faturamentoBruto"   label="Fat. Bruto"        sort={summarySort} onSort={onSummarySort} />
                <SortTh col="faturamentoLiquido" label="Fat. Líquido (90%)"sort={summarySort} onSort={onSummarySort} />
                <SortTh col="roi"                label="ROI"               sort={summarySort} onSort={onSummarySort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedSummary.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400 text-sm">Nenhum dado no período</td></tr>
              ) : pagedSummary.map(row => {
                const cpa = row.conversoes > 0 && row.custoTotal > 0 ? row.custoTotal / row.conversoes : null;
                const roi = roiLabel(row.faturamentoLiquido, row.custoTotal);
                const roiVal = roi ? parseFloat(roi) : null;
                return (
                  <tr key={row.campanhaId ?? '__none__'} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-400 text-xs font-mono">{row.campanhaId || '-'}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">{row.campanhaLabel}</td>
                    <td className="px-4 py-2.5 text-slate-700">{row.conversoes}</td>
                    <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                      {row.depositoTotal > 0
                        ? profile?.is_master ? `$ ${fmtBRL(row.depositoTotal)}` : '***'
                        : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{row.custoTotal > 0 ? fmtBRL(row.custoTotal) : '-'}</td>
                    <td className="px-4 py-2.5 text-slate-700">{cpa ? `R$ ${fmtBRL(cpa)}` : '-'}</td>
                    <td className="px-4 py-2.5 text-slate-700">{row.faturamentoBruto > 0 ? `R$ ${fmtBRL(row.faturamentoBruto)}` : '-'}</td>
                    <td className="px-4 py-2.5 text-emerald-700 font-medium">{row.faturamentoLiquido > 0 ? `R$ ${fmtBRL(row.faturamentoLiquido)}` : '-'}</td>
                    <td className="px-4 py-2.5">
                      {roi && roiVal !== null ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${roiVal >= 1 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {roi}
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                );
              })}

              {/* TOTAL row - sempre visível, usa totals de todas as linhas */}
              {sortedSummary.length > 0 && (() => {
                const totalCPA = totals.conversoes > 0 && totals.custoTotal > 0 ? totals.custoTotal / totals.conversoes : null;
                const totalROI = roiLabel(totals.faturamentoLiquido, totals.custoTotal);
                const totalROIVal = totalROI ? parseFloat(totalROI) : null;
                return (
                  <tr className="bg-slate-50 font-semibold border-t-2 border-slate-300">
                    <td className="px-4 py-3 text-slate-600" colSpan={2}>TOTAL</td>
                    <td className="px-4 py-3 text-slate-800">{totals.conversoes}</td>
                    <td className="px-4 py-3 text-slate-800 whitespace-nowrap">
                      {totals.depositoTotal > 0
                        ? profile?.is_master ? `$ ${fmtBRL(totals.depositoTotal)}` : '***'
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-800">{totals.custoTotal > 0 ? fmtBRL(totals.custoTotal) : '-'}</td>
                    <td className="px-4 py-3 text-slate-800">{totalCPA ? `R$ ${fmtBRL(totalCPA)}` : '-'}</td>
                    <td className="px-4 py-3 text-slate-800">{totals.faturamentoBruto > 0 ? `R$ ${fmtBRL(totals.faturamentoBruto)}` : '-'}</td>
                    <td className="px-4 py-3 text-emerald-700">{totals.faturamentoLiquido > 0 ? `R$ ${fmtBRL(totals.faturamentoLiquido)}` : '-'}</td>
                    <td className="px-4 py-3">
                      {totalROI && totalROIVal !== null ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${totalROIVal >= 1 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {totalROI}
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={summaryPage}
          totalPages={summaryTotalPages}
          onPageChange={setSummaryPage}
          totalItems={sortedSummary.length}
          itemsPerPage={SUMMARY_PAGE_SIZE}
        />
      </div>
    </div>
  );
}




