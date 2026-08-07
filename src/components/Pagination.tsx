import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
  /** Passe as duas para exibir o seletor de itens por página. */
  itemsPerPageOptions?: number[];
  onItemsPerPageChange?: (value: number) => void;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage,
  itemsPerPageOptions,
  onItemsPerPageChange,
}: PaginationProps) {
  const sizePicker = itemsPerPageOptions && onItemsPerPageChange ? (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <span className="whitespace-nowrap">Itens por página</span>
      <select
        value={itemsPerPage}
        onChange={e => onItemsPerPageChange(Number(e.target.value))}
        className="border border-slate-300 rounded-lg px-2 py-2 min-h-[44px] md:min-h-0 md:py-1 text-base md:text-sm bg-white"
      >
        {itemsPerPageOptions.map(option => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  ) : null;

  // Com uma página só não há navegação, mas o seletor precisa continuar
  // acessível — é ele que permite voltar a um valor maior.
  if (totalPages <= 1) {
    return sizePicker ? (
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-4 border-t border-slate-200 bg-slate-50">
        <span className="text-sm text-slate-600">{totalItems} resultado(s)</span>
        {sizePicker}
      </div>
    ) : null;
  }

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const showPages = 5;

    if (totalPages <= showPages + 2) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);

      if (currentPage <= 3) {
        end = showPages;
      } else if (currentPage >= totalPages - 2) {
        start = totalPages - showPages + 1;
      }

      if (start > 2) {
        pages.push('...');
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (end < totalPages - 1) {
        pages.push('...');
      }

      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-4 md:px-6 py-4 border-t border-slate-200 bg-slate-50">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="text-sm text-slate-600">
          Mostrando <span className="font-semibold text-slate-900">{startItem}</span> a{' '}
          <span className="font-semibold text-slate-900">{endItem}</span> de{' '}
          <span className="font-semibold text-slate-900">{totalItems}</span> resultados
        </div>
        {sizePicker}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Página anterior"
          className="px-3 py-2 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="flex items-center gap-1 flex-wrap">
          {getPageNumbers().map((page, index) => (
            typeof page === 'number' ? (
              <button
                key={index}
                onClick={() => onPageChange(page)}
                className={`px-4 py-2 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 rounded-lg transition-colors ${
                  currentPage === page
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-700 hover:bg-slate-100 border border-slate-300'
                }`}
              >
                {page}
              </button>
            ) : (
              <span key={index} className="px-2 text-slate-400">
                {page}
              </span>
            )
          ))}
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Próxima página"
          className="px-3 py-2 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
