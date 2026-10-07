import { useState } from 'react';
import { Download, Loader2, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Lead {
  id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  telefone_normalized: string | null;
  campanha: string | null;
  gclid: string | null;
  click_id: string | null;
  url_acesso: string | null;
  ip: string | null;
  created_at: string;
}

const PAGE = 1000;

// Nome suspeito -> lead de spam. Normaliza (trim, lowercase, sem acentos) antes de testar.
const nomeSpam = (n?: string | null) => {
  if (!n) return true;
  const s = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  if (s.length < 3) return true;
  if (/^\d+$/.test(s)) return true;                    // só números
  if (/^[^a-z]+$/.test(s)) return true;                // nenhuma letra
  if (/(.)\1{3,}/.test(s)) return true;                // aaaa, kkkk
  if (/^(teste|test|asd|asdf|qwer|abc|xxx|aaa|nome|sem nome|a|ab)\b/.test(s)) return true;
  if (/^[a-z]{1,2}$/.test(s)) return true;             // 1-2 letras
  return false;
};

const inicioISO = (d: string) => `${d}T00:00:00-03:00`;

// Fim exclusivo: dia seguinte às 00:00 (-03:00), usado com .lt()
const fimExclusivoISO = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, dd + 1));
  return `${next.toISOString().slice(0, 10)}T00:00:00-03:00`;
};

const fmtData = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

const csvCell = (v: string | null | undefined) => {
  const s = v == null ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
};

export function ExportLeadsConfig() {
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [brutos, setBrutos] = useState<Lead[] | null>(null);
  const [fonesClientes, setFonesClientes] = useState<Set<string>>(new Set());
  const [emailsClientes, setEmailsClientes] = useState<Set<string>>(new Set());

  const [filtrarSpam, setFiltrarSpam] = useState(true);
  const [filtrarClientes, setFiltrarClientes] = useState(true);
  const [filtrarDuplicatas, setFiltrarDuplicatas] = useState(true);

  const buscar = async () => {
    if (!inicio || !fim) return;
    setBuscando(true);
    setErro(null);
    setBrutos(null);
    try {
      // ---- leads (somente leitura, paginado) ----
      const leads: Lead[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('leads')
          .select('id,nome,email,telefone,telefone_normalized,campanha,gclid,click_id,url_acesso,ip,created_at')
          .gte('created_at', inicioISO(inicio))
          .lt('created_at', fimExclusivoISO(fim))
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const bloco = (data ?? []) as Lead[];
        leads.push(...bloco);
        if (bloco.length < PAGE) break;
      }

      // ---- chaves de clientes (somente leitura, paginado) ----
      const fones = new Set<string>();
      const emails = new Set<string>();
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('clientes')
          .select('telefone_normalized,email')
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const bloco = (data ?? []) as { telefone_normalized: string | null; email: string | null }[];
        for (const c of bloco) {
          if (c.telefone_normalized) fones.add(c.telefone_normalized);
          if (c.email) emails.add(c.email.toLowerCase());
        }
        if (bloco.length < PAGE) break;
      }

      setFonesClientes(fones);
      setEmailsClientes(emails);
      setBrutos(leads);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao buscar leads');
    } finally {
      setBuscando(false);
    }
  };

  // E-mail NULL nunca conta como match.
  const ehCliente = (l: Lead) =>
    (!!l.telefone_normalized && fonesClientes.has(l.telefone_normalized)) ||
    (!!l.email && emailsClientes.has(l.email.toLowerCase()));

  // Dedupe por telefone_normalized. Lista vem DESC -> 1o de cada telefone é o mais recente.
  const dedupe = (leads: Lead[]) => {
    const vistos = new Map<string, Lead>();
    const unicos: Lead[] = [];
    for (const l of leads) {
      const k = l.telefone_normalized;
      if (!k) { unicos.push(l); continue; }
      const existente = vistos.get(k);
      if (!existente) {
        const copia = { ...l };
        vistos.set(k, copia);
        unicos.push(copia);
        continue;
      }
      // herda gclid/click_id do duplicado mais antigo se o mantido não tiver
      if (!existente.gclid && l.gclid) existente.gclid = l.gclid;
      if (!existente.click_id && l.click_id) existente.click_id = l.click_id;
    }
    return unicos;
  };

  // Ordem: spam -> já clientes -> duplicatas
  const semSpam = brutos ? (filtrarSpam ? brutos.filter(l => !nomeSpam(l.nome)) : brutos) : [];
  const removidosSpam = brutos ? brutos.length - semSpam.length : 0;
  const semClientes = filtrarClientes ? semSpam.filter(l => !ehCliente(l)) : semSpam;
  const removidosClientes = semSpam.length - semClientes.length;
  const finais = filtrarDuplicatas ? dedupe(semClientes) : semClientes;
  const removidosDuplicatas = semClientes.length - finais.length;

  const baixar = () => {
    const header = 'Nome;Email;Telefone;Campanha;GCLID;Click ID;URL Acesso;IP;Data de Cadastro';
    const linhas = finais.map(l =>
      [l.nome, l.email, l.telefone, l.campanha, l.gclid, l.click_id, l.url_acesso, l.ip, fmtData(l.created_at)]
        .map(csvCell)
        .join(';')
    );
    const csv = '\uFEFF' + [header, ...linhas].join('\r\n');
    const algumFiltro = filtrarSpam || filtrarClientes || filtrarDuplicatas;
    const nomeArquivo = `leads_${inicio}_a_${fim}${algumFiltro ? '_filtrado' : ''}.csv`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    a.click();
    URL.revokeObjectURL(url);
  };

  const num = (n: number) => n.toLocaleString('pt-BR');

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-xl font-bold mb-1">Exportar Leads de Captação</h3>
      <p className="text-sm text-gray-500 mb-4">
        Somente leitura: os filtros afetam apenas o arquivo CSV gerado. Nenhum lead é alterado
        ou removido do banco de dados.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Início</label>
          <input type="date" value={inicio} onChange={e => setInicio(e.target.value)}
            className="border rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fim</label>
          <input type="date" value={fim} onChange={e => setFim(e.target.value)}
            className="border rounded px-3 py-2" />
        </div>
        <button onClick={buscar} disabled={!inicio || !fim || buscando}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
          {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Buscar
        </button>
      </div>

      <div className="space-y-2 mb-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={filtrarSpam} onChange={e => setFiltrarSpam(e.target.checked)} />
          Excluir spam
          {brutos && filtrarSpam && <span className="text-red-600">(−{num(removidosSpam)})</span>}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={filtrarClientes} onChange={e => setFiltrarClientes(e.target.checked)} />
          Excluir já clientes
          {brutos && filtrarClientes && <span className="text-red-600">(−{num(removidosClientes)})</span>}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={filtrarDuplicatas} onChange={e => setFiltrarDuplicatas(e.target.checked)} />
          Excluir duplicatas
          {brutos && filtrarDuplicatas && <span className="text-red-600">(−{num(removidosDuplicatas)})</span>}
        </label>
      </div>

      {erro && <div className="text-sm text-red-600 mb-3">{erro}</div>}

      {brutos && (
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-sm text-gray-700">
            <strong>{num(brutos.length)}</strong> encontrados → <strong>{num(finais.length)}</strong> após filtros
          </div>
          <button onClick={baixar} disabled={finais.length === 0}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50">
            <Download className="w-4 h-4" />
            Baixar CSV
          </button>
        </div>
      )}
    </div>
  );
}
