const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  'comprou':       { bg: 'bg-slate-100',   text: 'text-slate-700',   label: 'Aguardando Conta' },
  'conta-criada':  { bg: 'bg-blue-100',    text: 'text-blue-700',    label: 'Conta Criada' },
  'depositou':     { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Depositou' },
  'acompanhamento':{ bg: 'bg-cyan-100',    text: 'text-cyan-700',    label: 'Primeiro Saque' },
  'problema':      { bg: 'bg-red-100',     text: 'text-red-700',     label: 'Realizando Saque' },
  'finalizado':    { bg: 'bg-slate-800',   text: 'text-white',       label: 'Finalizado' },
  'inativo':       { bg: 'bg-orange-100',  text: 'text-orange-700',  label: 'Inativo' },
};

interface KanbanStatusBadgeProps {
  status: string;
  label?: string;
}

export function KanbanStatusBadge({ status, label }: KanbanStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;

  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${config.bg} ${config.text}`}>
      {label ?? config.label}
    </span>
  );
}
