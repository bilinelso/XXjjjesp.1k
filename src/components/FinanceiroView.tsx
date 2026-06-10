import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Plus, Trash2, Edit2, Check, X, TrendingUp, TrendingDown, DollarSign,
  Activity, Loader2, Eye, EyeOff,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Cliente } from '../lib/api';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Recorrente {
  id: string;
  tipo: 'receita' | 'despesa';
  categoria: string;
  descricao: string;
  valor: number;
  periodicidade: 'mensal' | 'quinzenal' | 'semestral' | 'anual' | 'unico';
  dia_vencimento: number;
  ativo: boolean;
}

interface Lancamento {
  id: string;
  tipo: 'receita' | 'despesa';
  categoria: string;
  descricao: string;
  valor: number;
  data: string;
  mes_ref: string;
  automatico: boolean;
  recorrente_id?: string | null;
  ignorado: boolean;
}

type Tab = 'dashboard' | 'lancamentos' | 'recorrentes';
type RecTab = 'recorrentes' | 'categorias';

interface FinanceiroCategoria {
  id: string;
  nome: string;
  tipo: 'receita' | 'despesa' | 'ambos';
  ativo: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function mesRef(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Badge({ tipo }: { tipo: 'receita' | 'despesa' }) {
  return tipo === 'receita'
    ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Receita</span>
    : <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Despesa</span>;
}

function AutoBadge() {
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">auto</span>;
}

function BadgeTipo({ tipo }: { tipo: 'receita' | 'despesa' | 'ambos' }) {
  if (tipo === 'receita') return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Receita</span>;
  if (tipo === 'despesa') return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Despesa</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">Ambos</span>;
}

type SortState = { col: string; dir: 'asc' | 'desc' };

function makeSorter<T>(sort: SortState) {
  return (a: T, b: T) => {
    const av = (a as Record<string, unknown>)[sort.col];
    const bv = (b as Record<string, unknown>)[sort.col];
    if (av === bv) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av < bv ? -1 : 1) * (sort.dir === 'asc' ? 1 : -1);
  };
}

function SortIcon({ col, sort }: { col: string; sort: SortState }) {
  if (sort.col !== col) return <span className="ml-1 opacity-30">↕</span>;
  return <span className="ml-1 text-blue-500">{sort.dir === 'asc' ? '↑' : '↓'}</span>;
}

function useSortToggle(initial: SortState) {
  const [sort, setSort] = useState<SortState>(initial);
  const toggle = (col: string) => setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  return [sort, toggle] as const;
}

// ─── Modal de Lançamento ─────────────────────────────────────────────────────

interface LancamentoModalProps {
  mesRef: string;
  categorias: FinanceiroCategoria[];
  onClose: () => void;
  onSaved: () => void;
}

function LancamentoModal({ mesRef: mr, categorias: todasCategorias, onClose, onSaved }: LancamentoModalProps) {
  const categoriasPorTipo = todasCategorias.filter(c => c.tipo === 'despesa' || c.tipo === 'ambos');
  const [form, setForm] = useState({
    tipo: 'despesa' as 'receita' | 'despesa',
    categoria: categoriasPorTipo[0]?.nome ?? '',
    descricao: '',
    valor: '',
    data: mr + '-01',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const categorias = todasCategorias.filter(c => c.tipo === form.tipo || c.tipo === 'ambos');

  // Reset category when tipo changes to first available option
  const handleTipoChange = (t: 'receita' | 'despesa') => {
    const opts = todasCategorias.filter(c => c.tipo === t || c.tipo === 'ambos');
    setForm(f => ({ ...f, tipo: t, categoria: opts[0]?.nome ?? '' }));
  };

  const handleSave = async () => {
    if (!form.descricao.trim() || !form.valor || !form.data) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }
    const valor = parseFloat(form.valor.replace(',', '.'));
    if (isNaN(valor) || valor <= 0) { setError('Valor inválido.'); return; }
    setSaving(true);
    const { error: err } = await supabase.from('financeiro_lancamentos').insert({
      tipo: form.tipo.toLowerCase(),
      categoria: form.categoria,
      descricao: form.descricao.trim(),
      valor,
      data: form.data,
      mes_ref: mr,
      automatico: false,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">Novo Lançamento</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            {(['receita', 'despesa'] as const).map(t => (
              <button key={t} onClick={() => handleTipoChange(t)}
                className={`py-2 rounded-lg text-sm font-medium border transition-colors ${form.tipo === t ? (t === 'receita' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-red-600 text-white border-red-600') : 'bg-white border-slate-300 text-slate-600'}`}>
                {t === 'receita' ? 'Receita' : 'Despesa'}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Categoria</label>
            <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              {categorias.length === 0
                ? <option value="">Nenhuma categoria disponível</option>
                : categorias.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)
              }
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Descrição *</label>
            <input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: Pagamento fornecedor" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Valor (R$) *</label>
              <input value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="0,00" type="number" min="0" step="0.01" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Data *</label>
              <input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-600 border border-slate-300 hover:bg-slate-50">Cancelar</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400 flex items-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de Recorrente ─────────────────────────────────────────────────────

interface RecorrenteModalProps {
  initial?: Partial<Recorrente>;
  categorias: FinanceiroCategoria[];
  onClose: () => void;
  onSaved: () => void;
}

function RecorrenteModal({ initial, categorias: todasCategorias, onClose, onSaved }: RecorrenteModalProps) {
  const tipoInicial = (initial?.tipo ?? 'despesa') as 'receita' | 'despesa';
  const categoriasPorTipoInicial = todasCategorias.filter(c => c.tipo === tipoInicial || c.tipo === 'ambos');
  const [form, setForm] = useState({
    tipo: tipoInicial,
    categoria: initial?.id ? (initial?.categoria ?? '') : (initial?.categoria ?? categoriasPorTipoInicial[0]?.nome ?? ''),
    descricao: initial?.descricao ?? '',
    valor: initial?.valor?.toString() ?? '',
    periodicidade: (initial?.periodicidade ?? 'mensal') as Recorrente['periodicidade'],
    dia_vencimento: initial?.dia_vencimento?.toString() ?? '1',
    ativo: initial?.ativo ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isEdit = !!initial?.id;

  const categorias = todasCategorias.filter(c => c.tipo === form.tipo || c.tipo === 'ambos');

  const handleTipoChange = (t: 'receita' | 'despesa') => {
    const opts = todasCategorias.filter(c => c.tipo === t || c.tipo === 'ambos');
    setForm(f => ({ ...f, tipo: t, categoria: opts[0]?.nome ?? '' }));
  };

  const handleSave = async () => {
    if (!form.descricao.trim() || !form.valor) { setError('Preencha todos os campos.'); return; }
    const valor = parseFloat(form.valor.replace(',', '.'));
    const dia = parseInt(form.dia_vencimento);
    if (isNaN(valor) || valor <= 0) { setError('Valor inválido.'); return; }
    if (isNaN(dia) || dia < 1 || dia > 31) { setError('Dia de vencimento inválido (1–31).'); return; }
    setSaving(true);
    const payload = {
      tipo: form.tipo.toLowerCase(),
      categoria: form.categoria,
      descricao: form.descricao.trim(),
      valor,
      periodicidade: form.periodicidade,
      dia_vencimento: dia,
      ativo: form.ativo,
    };
    const { error: err } = isEdit
      ? await supabase.from('financeiro_recorrentes').update(payload).eq('id', initial!.id!)
      : await supabase.from('financeiro_recorrentes').insert(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">{isEdit ? 'Editar Recorrente' : 'Novo Recorrente'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            {(['receita', 'despesa'] as const).map(t => (
              <button key={t} onClick={() => handleTipoChange(t)}
                className={`py-2 rounded-lg text-sm font-medium border transition-colors ${form.tipo === t ? (t === 'receita' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-red-600 text-white border-red-600') : 'bg-white border-slate-300 text-slate-600'}`}>
                {t === 'receita' ? 'Receita' : 'Despesa'}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Categoria</label>
            <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              {categorias.length === 0
                ? <option value="">Nenhuma categoria disponível</option>
                : categorias.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)
              }
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Descrição *</label>
            <input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: Aluguel do escritório" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Valor (R$) *</label>
              <input value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="0,00" type="number" min="0" step="0.01" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Dia vencimento</label>
              <input value={form.dia_vencimento} onChange={e => setForm(f => ({ ...f, dia_vencimento: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                type="number" min="1" max="31" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Periodicidade</label>
            <select value={form.periodicidade} onChange={e => setForm(f => ({ ...f, periodicidade: e.target.value as Recorrente['periodicidade'] }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              <option value="mensal">Mensal</option>
              <option value="quinzenal">Quinzenal</option>
              <option value="semestral">Semestral</option>
              <option value="anual">Anual</option>
              <option value="unico">Único</option>
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))}
              className="w-4 h-4 text-blue-600 rounded border-slate-300" />
            <span className="text-sm text-slate-700">Ativo (gerar automaticamente)</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-600 border border-slate-300 hover:bg-slate-50">Cancelar</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400 flex items-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de Categoria ──────────────────────────────────────────────────────

interface CategoriaModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function CategoriaModal({ onClose, onSaved }: CategoriaModalProps) {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<'receita' | 'despesa' | 'ambos'>('despesa');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!nome.trim()) { setError('Informe o nome da categoria.'); return; }
    setSaving(true);
    const { error: err } = await supabase.from('financeiro_categorias').insert({
      nome: nome.trim(),
      tipo,
      ativo: true,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">Nova Categoria</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</p>}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nome *</label>
            <input value={nome} onChange={e => setNome(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: Salários" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Tipo</label>
            <div className="grid grid-cols-3 gap-2">
              {(['receita', 'despesa', 'ambos'] as const).map(t => (
                <button key={t} onClick={() => setTipo(t)}
                  className={`py-2 rounded-lg text-xs font-medium border transition-colors capitalize ${
                    tipo === t
                      ? t === 'receita' ? 'bg-emerald-600 text-white border-emerald-600'
                        : t === 'despesa' ? 'bg-red-600 text-white border-red-600'
                        : 'bg-slate-600 text-white border-slate-600'
                      : 'bg-white border-slate-300 text-slate-600'
                  }`}>
                  {t === 'ambos' ? 'Ambos' : t === 'receita' ? 'Receita' : 'Despesa'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-600 border border-slate-300 hover:bg-slate-50">Cancelar</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400 flex items-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de Confirmação — Excluir Recorrente ───────────────────────────────

interface DeleteRecorrenteModalProps {
  descricao: string;
  deleting: boolean;
  onClose: () => void;
  onDeleteOnly: () => void;
  onDeleteWithLancamentos: () => void;
}

function DeleteRecorrenteModal({ descricao, deleting, onClose, onDeleteOnly, onDeleteWithLancamentos }: DeleteRecorrenteModalProps) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">Excluir recorrente</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-3">
          <p className="text-sm text-slate-700">
            Deseja excluir o recorrente <span className="font-semibold">"{descricao}"</span>?
          </p>
          <p className="text-xs text-slate-500">
            Os lançamentos de meses passados são sempre preservados. Você pode optar por remover também os lançamentos futuros gerados por este recorrente.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} disabled={deleting}
            className="px-4 py-2 rounded-lg text-sm text-slate-600 border border-slate-300 hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={onDeleteOnly} disabled={deleting}
            className="px-4 py-2 rounded-lg text-sm border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 flex items-center justify-center gap-2">
            {deleting && <Loader2 size={13} className="animate-spin" />}
            Excluir só o recorrente
          </button>
          <button onClick={onDeleteWithLancamentos} disabled={deleting}
            className="px-4 py-2 rounded-lg text-sm bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400 flex items-center justify-center gap-2">
            {deleting && <Loader2 size={13} className="animate-spin" />}
            Excluir + lançamentos futuros
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface FinanceiroViewProps {
  clientes: Cliente[];
}

export function FinanceiroView({ clientes }: FinanceiroViewProps) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const now = new Date();
  const [selectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth()); // 0-indexed

  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [recorrentes, setRecorrentes] = useState<Recorrente[]>([]);
  const [categorias, setCategorias] = useState<FinanceiroCategoria[]>([]);
  const [costsByMesRef, setCostsByMesRef] = useState<Record<string, number>>({});
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [editingSaldo, setEditingSaldo] = useState(false);
  const [saldoInput, setSaldoInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [recTab, setRecTab] = useState<RecTab>('recorrentes');
  const [showLancamentoModal, setShowLancamentoModal] = useState(false);
  const [showRecorrenteModal, setShowRecorrenteModal] = useState(false);
  const [showCategoriaModal, setShowCategoriaModal] = useState(false);
  const [editingRecorrente, setEditingRecorrente] = useState<Recorrente | undefined>(undefined);
  const [deleteRecorrenteTarget, setDeleteRecorrenteTarget] = useState<Recorrente | undefined>(undefined);
  const [deletingRecorrente, setDeletingRecorrente] = useState(false);
  const [showIgnorados, setShowIgnorados] = useState(false);

  const [lancSort, toggleLancSort] = useSortToggle({ col: 'data', dir: 'asc' });
  const [recSort, toggleRecSort] = useSortToggle({ col: 'descricao', dir: 'asc' });
  const [catSort, toggleCatSort] = useSortToggle({ col: 'nome', dir: 'asc' });

  const currentMesRef = mesRef(selectedYear, selectedMonth);

  // ── Load data ───────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [lancRes, recRes, cfgRes, ccRes, catRes] = await Promise.all([
      supabase.from('financeiro_lancamentos').select('*').order('data', { ascending: true }),
      supabase.from('financeiro_recorrentes').select('*').order('descricao'),
      supabase.from('financeiro_config').select('chave, valor').eq('chave', 'saldo_inicial').maybeSingle(),
      supabase.from('campaign_costs_monthly')
        .select('mes_ref, total_custo')
        .gte('mes_ref', `${selectedYear}-01`)
        .lte('mes_ref', `${selectedYear}-12`),
      supabase.from('financeiro_categorias').select('*').eq('ativo', true).order('nome'),
    ]);
    setLancamentos((lancRes.data ?? []) as Lancamento[]);
    setRecorrentes((recRes.data ?? []) as Recorrente[]);
    setCategorias((catRes.data ?? []) as FinanceiroCategoria[]);
    const v = parseFloat(cfgRes.data?.valor ?? '0');
    setSaldoInicial(isNaN(v) ? 0 : v);
    setSaldoInput(cfgRes.data?.valor ?? '0');
    const byMonth: Record<string, number> = {};
    for (const row of (ccRes.data ?? [])) {
      byMonth[row.mes_ref] = row.total_custo ?? 0;
    }
    setCostsByMesRef(byMonth);
    setLoading(false);
  }, [selectedYear]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Auto-generate CRM revenue for selected month ─────────────────────────

  const clientesDoMes = useMemo(() => {
    return clientes.filter(c => {
      if (!c.data_compra) return false;
      return c.data_compra.startsWith(`${selectedYear}-`) && c.data_compra.slice(0, 7) === currentMesRef;
    });
  }, [clientes, currentMesRef, selectedYear]);

  const receitaCRM = useMemo(() =>
    clientesDoMes.reduce((sum, c) => sum + (c.valor_produto ?? 0) * 0.9, 0),
    [clientesDoMes]
  );

  const custoTrafego = costsByMesRef[currentMesRef] ?? 0;

  // ── Generate recorrentes for selected month ───────────────────────────────

  const generateRecorrentes = useCallback(async (mr: string) => {
    const ativos = recorrentes.filter(r => r.ativo);
    if (!ativos.length) return;

    const [year, month] = mr.split('-').map(Number);
    const monthIdx = month - 1;

    const toInsert = ativos.filter(r => {
      // Check if already exists for this mes_ref
      const already = lancamentos.some(l => l.recorrente_id === r.id && l.mes_ref === mr);
      if (already) return false;
      // Check periodicidade
      if (r.periodicidade === 'mensal') return true;
      if (r.periodicidade === 'quinzenal') return true;
      if (r.periodicidade === 'semestral') return monthIdx % 6 === 0;
      if (r.periodicidade === 'anual') return monthIdx === 0;
      if (r.periodicidade === 'unico') {
        return !lancamentos.some(l => l.recorrente_id === r.id);
      }
      return false;
    });

    if (!toInsert.length) return;

    setGenerating(true);
    const rows = toInsert.flatMap(r => {
      const base = {
        tipo: r.tipo,
        categoria: r.categoria,
        descricao: r.descricao,
        valor: r.valor,
        mes_ref: mr,
        automatico: true,
        recorrente_id: r.id,
      };
      if (r.periodicidade === 'quinzenal') {
        const dia1 = String(Math.min(r.dia_vencimento, 28)).padStart(2, '0');
        const dia2 = String(Math.min(r.dia_vencimento + 15, 28)).padStart(2, '0');
        return [
          { ...base, data: `${year}-${String(month).padStart(2, '0')}-${dia1}` },
          { ...base, data: `${year}-${String(month).padStart(2, '0')}-${dia2}` },
        ];
      }
      return [{ ...base, data: `${year}-${String(month).padStart(2, '0')}-${String(Math.min(r.dia_vencimento, 28)).padStart(2, '0')}` }];
    });

    await supabase.from('financeiro_lancamentos').insert(rows);
    await loadAll();
    setGenerating(false);
  }, [recorrentes, lancamentos, loadAll]);

  // Trigger when tab changes to 'lancamentos' or month changes
  useEffect(() => {
    if (tab === 'lancamentos' && !loading && recorrentes.length > 0) {
      generateRecorrentes(currentMesRef);
    }
  }, [tab, currentMesRef, loading]);

  // ── Saldo acumulado ──────────────────────────────────────────────────────

  const saldoAcumulado = useMemo(() => {
    const yearPrefix = `${selectedYear}-`;
    const manualAndAuto = lancamentos.filter(l =>
      l.mes_ref.startsWith(yearPrefix) && l.mes_ref <= currentMesRef && !l.ignorado
    );
    const soma = manualAndAuto.reduce((acc, l) =>
      acc + (l.tipo === 'receita' ? l.valor : -l.valor), 0
    );
    // Add CRM revenue for this year up to selected month
    const crmAllMonths = clientes
      .filter(c =>
        c.data_compra?.startsWith(yearPrefix) &&
        c.data_compra.slice(0, 7) <= currentMesRef
      )
      .reduce((acc, c) => acc + (c.valor_produto ?? 0) * 0.9, 0);
    // Subtract campaign costs for this year up to selected month
    const trafegoAllMonths = Object.entries(costsByMesRef)
      .filter(([mr]) => mr.startsWith(yearPrefix) && mr <= currentMesRef)
      .reduce((acc, [, v]) => acc + v, 0);
    return saldoInicial + soma + crmAllMonths - trafegoAllMonths;
  }, [lancamentos, saldoInicial, currentMesRef, clientes, selectedYear, costsByMesRef]);

  // ── Monthly chart data ───────────────────────────────────────────────────

  const chartData = useMemo(() => {
    return MESES.map((nome, idx) => {
      const mr = mesRef(selectedYear, idx);
      const crmRec = clientes
        .filter(c => c.data_compra?.startsWith(`${selectedYear}-`) && c.data_compra?.slice(0, 7) === mr)
        .reduce((acc, c) => acc + (c.valor_produto ?? 0) * 0.9, 0);
      const lancMes = lancamentos.filter(l => l.mes_ref === mr && !l.ignorado);
      const receita = lancMes.filter(l => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0) + crmRec;
      const despesa = lancMes.filter(l => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0) + (costsByMesRef[mr] ?? 0);
      return { nome, receita, despesa, resultado: receita - despesa };
    });
  }, [lancamentos, clientes, selectedYear, costsByMesRef]);

  // ── Current month metrics ────────────────────────────────────────────────

  const metricas = useMemo(() => {
    const lancMes = lancamentos.filter(l => l.mes_ref === currentMesRef && !l.ignorado);
    const receita = lancMes.filter(l => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0) + receitaCRM;
    const despesa = lancMes.filter(l => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0) + custoTrafego;
    return { receita, despesa, resultado: receita - despesa };
  }, [lancamentos, currentMesRef, receitaCRM, custoTrafego]);

  // ── Current month lancamentos (for list) ────────────────────────────────

  const lancamentosMes = useMemo(() => {
    return lancamentos.filter(l => l.mes_ref === currentMesRef);
  }, [lancamentos, currentMesRef]);

  const sortedLancamentos = useMemo(() => {
    const filtered = showIgnorados ? lancamentosMes : lancamentosMes.filter(l => !l.ignorado);
    return [...filtered].sort(makeSorter(lancSort));
  }, [lancamentosMes, lancSort, showIgnorados]);
  const sortedRecorrentes = useMemo(() => [...recorrentes].sort(makeSorter(recSort)), [recorrentes, recSort]);
  const sortedCategorias = useMemo(() => [...categorias].sort(makeSorter(catSort)), [categorias, catSort]);

  // ── Saldo inicial save ───────────────────────────────────────────────────

  const saveSaldoInicial = async () => {
    const v = parseFloat(saldoInput.replace(',', '.'));
    if (isNaN(v)) return;
    await supabase.from('financeiro_config').upsert({ chave: 'saldo_inicial', valor: String(v) }, { onConflict: 'chave' });
    setSaldoInicial(v);
    setEditingSaldo(false);
  };

  // ── Delete / ignorar lancamento ──────────────────────────────────────────

  const deleteLancamento = async (id: string) => {
    if (!confirm('Excluir este lançamento?')) return;
    await supabase.from('financeiro_lancamentos').delete().eq('id', id);
    setLancamentos(prev => prev.filter(l => l.id !== id));
  };

  const handleIgnorarLancamento = async (id: string) => {
    await supabase.from('financeiro_lancamentos').update({ ignorado: true }).eq('id', id);
    await loadAll();
  };

  const handleRestaurarLancamento = async (id: string) => {
    await supabase.from('financeiro_lancamentos').update({ ignorado: false }).eq('id', id);
    await loadAll();
  };

  // ── Delete recorrente ────────────────────────────────────────────────────

  const confirmDeleteRecorrente = async (deleteLancamentos: boolean) => {
    if (!deleteRecorrenteTarget) return;
    setDeletingRecorrente(true);
    if (deleteLancamentos) {
      await supabase
        .from('financeiro_lancamentos')
        .delete()
        .eq('recorrente_id', deleteRecorrenteTarget.id)
        .gte('mes_ref', mesRef(selectedYear, selectedMonth));
    }
    await supabase.from('financeiro_recorrentes').delete().eq('id', deleteRecorrenteTarget.id);
    setDeletingRecorrente(false);
    setDeleteRecorrenteTarget(undefined);
    await loadAll();
  };

  // ── Delete categoria ─────────────────────────────────────────────────────

  const deleteCategoria = async (cat: FinanceiroCategoria) => {
    const usadaEmLanc = lancamentos.some(l => l.categoria === cat.nome);
    const usadaEmRec  = recorrentes.some(r => r.categoria === cat.nome);
    if (usadaEmLanc || usadaEmRec) {
      alert(`A categoria "${cat.nome}" está em uso em ${usadaEmLanc ? 'lançamentos' : ''}${usadaEmLanc && usadaEmRec ? ' e ' : ''}${usadaEmRec ? 'recorrentes' : ''} e não pode ser excluída.`);
      return;
    }
    if (!confirm(`Excluir a categoria "${cat.nome}"?`)) return;
    await supabase.from('financeiro_categorias').delete().eq('id', cat.id);
    setCategorias(prev => prev.filter(c => c.id !== cat.id));
  };

  // ── Month selector ───────────────────────────────────────────────────────

  const MonthSelector = () => (
    <div className="flex gap-1 flex-wrap">
      {MESES.map((m, i) => (
        <button key={i} onClick={() => setSelectedMonth(i)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedMonth === i ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          {m}
        </button>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      {/* Tab navigation */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {([
          { key: 'dashboard', label: 'Dashboard' },
          { key: 'lancamentos', label: 'Lançamentos' },
          { key: 'recorrentes', label: 'Recorrentes' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD ──────────────────────────────────────────────────────── */}
      {tab === 'dashboard' && (
        <div className="space-y-5">
          {/* Saldo inicial config */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">Saldo inicial do ano:</span>
            {editingSaldo ? (
              <div className="flex items-center gap-2">
                <input type="number" value={saldoInput} onChange={e => setSaldoInput(e.target.value)}
                  className="w-36 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
                  step="0.01" />
                <button onClick={saveSaldoInicial} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"><Check size={16} /></button>
                <button onClick={() => setEditingSaldo(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded"><X size={16} /></button>
              </div>
            ) : (
              <button onClick={() => setEditingSaldo(true)}
                className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 hover:text-blue-600 transition-colors">
                R$ {fmtBRL(saldoInicial)}
                <Edit2 size={13} className="text-slate-400" />
              </button>
            )}
          </div>

          {/* Month selector */}
          <MonthSelector />

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2 text-slate-500 text-xs font-medium">
                <DollarSign size={14} /> Saldo Atual
              </div>
              <p className={`text-2xl font-bold ${saldoAcumulado >= 0 ? 'text-slate-800' : 'text-red-600'}`}>
                R$ {fmtBRL(saldoAcumulado)}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2 text-emerald-600 text-xs font-medium">
                <TrendingUp size={14} /> Receita do Mês
              </div>
              <p className="text-2xl font-bold text-emerald-700">R$ {fmtBRL(metricas.receita)}</p>
              {receitaCRM > 0 && (
                <p className="text-xs text-slate-400 mt-1">CRM: R$ {fmtBRL(receitaCRM)}</p>
              )}
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2 text-red-500 text-xs font-medium">
                <TrendingDown size={14} /> Despesas do Mês
              </div>
              <p className="text-2xl font-bold text-red-600">R$ {fmtBRL(metricas.despesa)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2 text-blue-500 text-xs font-medium">
                <Activity size={14} /> Resultado
              </div>
              <p className={`text-2xl font-bold ${metricas.resultado >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                R$ {fmtBRL(metricas.resultado)}
              </p>
            </div>
          </div>

          {/* Bar chart */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Receitas × Despesas × Resultado — {selectedYear}</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number | string | undefined) => `R$ ${fmtBRL(Number(v ?? 0))}`} />
                <Legend />
                <Bar dataKey="receita" name="Receita" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesa" name="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="resultado" name="Resultado" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Progress bar — saldo acumulado por mês */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Saldo acumulado por mês</h3>
            <div className="space-y-2">
              {(() => {
                let acc = saldoInicial;
                const max = Math.max(...chartData.map(d => {
                  acc += d.resultado;
                  return Math.abs(acc);
                }), 1);
                acc = saldoInicial;
                return chartData.map((d, i) => {
                  acc += d.resultado;
                  const pct = Math.min(Math.abs(acc) / max * 100, 100);
                  const isSelected = i === selectedMonth;
                  return (
                    <div key={i} className={`flex items-center gap-3 ${isSelected ? 'opacity-100' : 'opacity-70'}`}>
                      <span className="w-8 text-xs text-slate-500 text-right">{MESES[i]}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                        <div
                          className={`h-3 rounded-full transition-all ${acc >= 0 ? 'bg-emerald-500' : 'bg-red-400'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`text-xs font-medium w-28 text-right ${acc >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        R$ {fmtBRL(acc)}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── LANÇAMENTOS ────────────────────────────────────────────────────── */}
      {tab === 'lancamentos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <MonthSelector />
            <button onClick={() => setShowLancamentoModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
              <Plus size={16} /> Novo lançamento
            </button>
          </div>

          {generating && (
            <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 rounded-lg p-3">
              <Loader2 size={14} className="animate-spin" /> Gerando recorrentes do mês...
            </div>
          )}

          {/* Auto rows: CRM revenue + tráfego cost */}
          {(receitaCRM > 0 || custoTrafego > 0) && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {receitaCRM > 0 && (
                    <tr className="border-b border-slate-100 bg-blue-50/50">
                      <td className="px-4 py-3"><Badge tipo="receita" /> <AutoBadge /></td>
                      <td className="px-4 py-3 text-slate-500">Vendas CRM</td>
                      <td className="px-4 py-3 text-slate-700">{clientesDoMes.length} clientes × valor_produto × 0,9</td>
                      <td className="px-4 py-3 text-slate-500">—</td>
                      <td className="px-4 py-3 font-semibold text-emerald-700">+R$ {fmtBRL(receitaCRM)}</td>
                      <td className="px-4 py-3" />
                    </tr>
                  )}
                  {custoTrafego > 0 && (
                    <tr className="bg-blue-50/50">
                      <td className="px-4 py-3"><Badge tipo="despesa" /> <AutoBadge /></td>
                      <td className="px-4 py-3 text-slate-500">Tráfego</td>
                      <td className="px-4 py-3 text-slate-700">Custos de campanhas (Skro)</td>
                      <td className="px-4 py-3 text-slate-500">—</td>
                      <td className="px-4 py-3 font-semibold text-red-600">-R$ {fmtBRL(custoTrafego)}</td>
                      <td className="px-4 py-3" />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={() => setShowIgnorados(s => !s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${showIgnorados ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'}`}>
              {showIgnorados ? <Eye size={13} /> : <EyeOff size={13} />}
              {showIgnorados ? 'Ocultar ignorados' : 'Mostrar ignorados'}
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {(['tipo', 'categoria'] as const).map(col => (
                    <th key={col} onClick={() => toggleLancSort(col)}
                      className="text-left px-4 py-3 text-xs font-semibold text-slate-600 cursor-pointer select-none hover:text-slate-900">
                      {col === 'tipo' ? 'Tipo' : 'Categoria'}<SortIcon col={col} sort={lancSort} />
                    </th>
                  ))}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Descrição</th>
                  <th onClick={() => toggleLancSort('data')} className="text-left px-4 py-3 text-xs font-semibold text-slate-600 cursor-pointer select-none hover:text-slate-900">
                    Data<SortIcon col="data" sort={lancSort} />
                  </th>
                  <th onClick={() => toggleLancSort('valor')} className="text-left px-4 py-3 text-xs font-semibold text-slate-600 cursor-pointer select-none hover:text-slate-900">
                    Valor<SortIcon col="valor" sort={lancSort} />
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedLancamentos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-slate-400">Nenhum lançamento neste mês.</td>
                  </tr>
                ) : sortedLancamentos.map(l => (
                  <tr key={l.id} className={`hover:bg-slate-50 ${l.ignorado ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge tipo={l.tipo} />
                        {l.automatico && <AutoBadge />}
                        {l.ignorado && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-500">Ignorado</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{l.categoria}</td>
                    <td className="px-4 py-3 text-slate-700">{l.descricao}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(l.data)}</td>
                    <td className={`px-4 py-3 font-semibold ${l.tipo === 'receita' ? 'text-emerald-700' : 'text-red-600'}`}>
                      {l.tipo === 'receita' ? '+' : '-'}R$ {fmtBRL(l.valor)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {l.automatico && l.recorrente_id ? (
                        l.ignorado ? (
                          <button onClick={() => handleRestaurarLancamento(l.id)} title="Restaurar"
                            className="p-1.5 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors">
                            <Eye size={14} />
                          </button>
                        ) : (
                          <button onClick={() => handleIgnorarLancamento(l.id)} title="Ignorar neste mês"
                            className="p-1.5 text-slate-300 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors">
                            <EyeOff size={14} />
                          </button>
                        )
                      ) : !l.automatico ? (
                        <button onClick={() => deleteLancamento(l.id)}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lancamentosMes.length > 0 && (
              <div className="border-t border-slate-200 px-4 py-3 bg-slate-50 flex justify-between text-sm font-semibold">
                <span className="text-slate-600">Total do mês</span>
                <div className="flex gap-6">
                  <span className="text-emerald-700">
                    +R$ {fmtBRL(lancamentosMes.filter(l => l.tipo === 'receita' && !l.ignorado).reduce((s, l) => s + l.valor, 0) + receitaCRM)}
                  </span>
                  <span className="text-red-600">
                    -R$ {fmtBRL(lancamentosMes.filter(l => l.tipo === 'despesa' && !l.ignorado).reduce((s, l) => s + l.valor, 0) + custoTrafego)}
                  </span>
                  <span className={metricas.resultado >= 0 ? 'text-blue-700' : 'text-red-700'}>
                    = R$ {fmtBRL(metricas.resultado)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── RECORRENTES ────────────────────────────────────────────────────── */}
      {tab === 'recorrentes' && (
        <div className="space-y-4">
          {/* Sub-tabs */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            {([
              { key: 'recorrentes', label: 'Recorrentes' },
              { key: 'categorias',  label: 'Categorias' },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setRecTab(t.key)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${recTab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Sub-tab: Recorrentes list ── */}
          {recTab === 'recorrentes' && (<>
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-500">{recorrentes.length} recorrente{recorrentes.length !== 1 ? 's' : ''} cadastrado{recorrentes.length !== 1 ? 's' : ''}</p>
            <button onClick={() => { setEditingRecorrente(undefined); setShowRecorrenteModal(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
              <Plus size={16} /> Novo recorrente
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {(['tipo', 'categoria', 'descricao', 'periodicidade', 'valor'] as const).map(col => (
                    <th key={col} onClick={() => toggleRecSort(col)}
                      className="text-left px-4 py-3 text-xs font-semibold text-slate-600 cursor-pointer select-none hover:text-slate-900">
                      {col === 'tipo' ? 'Tipo' : col === 'categoria' ? 'Categoria' : col === 'descricao' ? 'Descrição' : col === 'periodicidade' ? 'Periodicidade' : 'Valor'}
                      <SortIcon col={col} sort={recSort} />
                    </th>
                  ))}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Ativo</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRecorrentes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-slate-400">Nenhum recorrente cadastrado.</td>
                  </tr>
                ) : sortedRecorrentes.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3"><Badge tipo={r.tipo} /></td>
                    <td className="px-4 py-3 text-slate-500">{r.categoria}</td>
                    <td className="px-4 py-3 text-slate-700 font-medium">{r.descricao}</td>
                    <td className="px-4 py-3 text-slate-500 capitalize">
                      {r.periodicidade} (dia {r.dia_vencimento})
                    </td>
                    <td className={`px-4 py-3 font-semibold ${r.tipo === 'receita' ? 'text-emerald-700' : 'text-red-600'}`}>
                      {r.tipo === 'receita' ? '+' : '-'}R$ {fmtBRL(r.valor)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {r.ativo ? 'Sim' : 'Não'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right flex items-center justify-end gap-1">
                      <button onClick={() => { setEditingRecorrente(r); setShowRecorrenteModal(true); }}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => setDeleteRecorrenteTarget(r)}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>)}

          {/* ── Sub-tab: Categorias ── */}
          {recTab === 'categorias' && (<>
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-500">{categorias.length} categoria{categorias.length !== 1 ? 's' : ''}</p>
            <button onClick={() => setShowCategoriaModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
              <Plus size={16} /> Nova categoria
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th onClick={() => toggleCatSort('nome')} className="text-left px-4 py-3 text-xs font-semibold text-slate-600 cursor-pointer select-none hover:text-slate-900">
                    Nome<SortIcon col="nome" sort={catSort} />
                  </th>
                  <th onClick={() => toggleCatSort('tipo')} className="text-left px-4 py-3 text-xs font-semibold text-slate-600 cursor-pointer select-none hover:text-slate-900">
                    Tipo<SortIcon col="tipo" sort={catSort} />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Em uso</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedCategorias.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-10 text-slate-400">Nenhuma categoria cadastrada.</td>
                  </tr>
                ) : sortedCategorias.map(cat => {
                  const emUso = lancamentos.some(l => l.categoria === cat.nome) || recorrentes.some(r => r.categoria === cat.nome);
                  return (
                    <tr key={cat.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-800 font-medium">{cat.nome}</td>
                      <td className="px-4 py-3"><BadgeTipo tipo={cat.tipo} /></td>
                      <td className="px-4 py-3">
                        {emUso
                          ? <span className="text-xs text-amber-600 font-medium">Sim</span>
                          : <span className="text-xs text-slate-400">Não</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => deleteCategoria(cat)}
                          className={`p-1.5 rounded-lg transition-colors ${emUso ? 'text-slate-200 cursor-not-allowed' : 'text-slate-300 hover:text-red-500 hover:bg-red-50'}`}
                          title={emUso ? 'Categoria em uso — não pode ser excluída' : 'Excluir'}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>)}
        </div>
      )}

      {/* Modals */}
      {showLancamentoModal && (
        <LancamentoModal
          mesRef={currentMesRef}
          categorias={categorias}
          onClose={() => setShowLancamentoModal(false)}
          onSaved={loadAll}
        />
      )}
      {showRecorrenteModal && (
        <RecorrenteModal
          initial={editingRecorrente}
          categorias={categorias}
          onClose={() => setShowRecorrenteModal(false)}
          onSaved={() => { loadAll(); }}
        />
      )}
      {showCategoriaModal && (
        <CategoriaModal
          onClose={() => setShowCategoriaModal(false)}
          onSaved={loadAll}
        />
      )}
      {deleteRecorrenteTarget && (
        <DeleteRecorrenteModal
          descricao={deleteRecorrenteTarget.descricao}
          deleting={deletingRecorrente}
          onClose={() => setDeleteRecorrenteTarget(undefined)}
          onDeleteOnly={() => confirmDeleteRecorrente(false)}
          onDeleteWithLancamentos={() => confirmDeleteRecorrente(true)}
        />
      )}
    </div>
  );
}
