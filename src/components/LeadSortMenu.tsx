import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Check } from 'lucide-react';

const MENU_WIDTH = 220;
const MENU_HEIGHT_ESTIMATE = 320;

export type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;

/**
 * As mesmas opções das colunas do desktop, com o sentido que faz sentido de
 * partida para cada uma (texto sobe, número e data descem).
 */
const SORT_OPTIONS: { key: string; label: string; defaultDirection: 'asc' | 'desc' }[] = [
  { key: 'nome', label: 'Nome', defaultDirection: 'asc' },
  { key: 'email', label: 'E-mail', defaultDirection: 'asc' },
  { key: 'status', label: 'Status', defaultDirection: 'asc' },
  { key: 'assessor', label: 'Assessor', defaultDirection: 'asc' },
  { key: 'valor_deposito', label: 'Depósito', defaultDirection: 'desc' },
  { key: 'profit_pct', label: 'Lucro %', defaultDirection: 'desc' },
  { key: 'data_compra', label: 'Data', defaultDirection: 'desc' },
];

type LeadSortMenuProps = {
  sortConfig: SortConfig;
  onChange: (next: SortConfig) => void;
};

/**
 * Controle de ordenação para telas pequenas.
 *
 * Opera sobre o MESMO `sortConfig` do desktop — o que for escolhido aqui vale
 * nas colunas da tabela e vice-versa. Posicionamento `fixed` porque a barra de
 * filtros vive dentro de um container com `overflow-hidden`.
 */
export const LeadSortMenu: React.FC<LeadSortMenuProps> = ({ sortConfig, onChange }) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onReflow = () => close();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, close]);

  const handleTriggerClick = () => {
    if (open) {
      close();
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8));
    const openUpward = rect.bottom + MENU_HEIGHT_ESTIMATE > window.innerHeight;

    setPosition(
      openUpward
        ? { bottom: window.innerHeight - rect.top + 4, left }
        : { top: rect.bottom + 4, left }
    );
    setOpen(true);
  };

  /** Tocar na opção já ativa inverte o sentido; nunca zera a ordenação. */
  const handlePick = (option: typeof SORT_OPTIONS[number]) => {
    if (sortConfig?.key === option.key) {
      onChange({ key: option.key, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      onChange({ key: option.key, direction: option.defaultDirection });
    }
    close();
  };

  const active = SORT_OPTIONS.find(o => o.key === sortConfig?.key) || null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`px-3 py-2 min-h-[44px] rounded-lg flex items-center gap-1.5 text-sm transition-all flex-shrink-0 ${
          active ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
        }`}
      >
        {active ? (
          sortConfig?.direction === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />
        ) : (
          <ArrowUpDown size={16} />
        )}
        <span className="whitespace-nowrap">{active ? active.label : 'Ordenar'}</span>
      </button>

      {open && position && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} aria-hidden="true" />
          <div
            role="menu"
            style={{ top: position.top, bottom: position.bottom, left: position.left, width: MENU_WIDTH }}
            className="fixed z-[41] bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden"
          >
            <p className="px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
              Ordenar por
            </p>
            {SORT_OPTIONS.map(option => {
              const isActive = sortConfig?.key === option.key;
              return (
                <button
                  key={option.key}
                  role="menuitem"
                  onClick={() => handlePick(option)}
                  className={`w-full min-h-[44px] px-3 py-2 flex items-center gap-2 text-sm text-left transition-colors ${
                    isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex-1">{option.label}</span>
                  {isActive && (
                    <>
                      {sortConfig?.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                      <Check size={14} />
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
};
