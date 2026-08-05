import React, { useEffect, useRef, useState } from 'react';
import { Plus, Image as ImageIcon, FileText } from 'lucide-react';
import type { WabaMediaKind } from '../../lib/wabaApi';

const IMAGE_TYPES = ['image/jpeg', 'image/png'];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const DOC_MAX_BYTES = 10 * 1024 * 1024;

const DOC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';

type WabaAttachMenuProps = {
  /** Bottom sheet no mobile, popover ancorado no desktop. */
  isMobile: boolean;
  onPick: (kind: WabaMediaKind, file: File) => void;
  onError: (text: string) => void;
};

/**
 * O botão `+` do composer: abre o menu de anexo e valida o arquivo escolhido
 * antes de qualquer upload. Só existe no modo texto livre — quem decide isso é
 * o WabaView, que não o renderiza no modo template.
 */
export const WabaAttachMenu: React.FC<WabaAttachMenuProps> = ({ isMobile, onPick, onError }) => {
  const [open, setOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Permite escolher o mesmo arquivo de novo depois de um cancelamento.
    e.target.value = '';
    if (!file) return;

    // O accept filtra na maioria dos casos, mas fotos de iPhone podem vir como
    // HEIC mesmo assim — o tipo é revalidado aqui.
    if (!IMAGE_TYPES.includes(file.type) || file.size > IMAGE_MAX_BYTES) {
      onError('Imagem deve ser JPEG ou PNG de até 5MB.');
      return;
    }
    onPick('image', file);
  };

  const handleDocChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > DOC_MAX_BYTES) {
      onError('Documento deve ter até 10MB.');
      return;
    }
    onPick('document', file);
  };

  const options = (
    <>
      <button
        onClick={() => { setOpen(false); imageInputRef.current?.click(); }}
        className="w-full min-h-[48px] px-4 py-3 flex items-center gap-3 text-base md:text-sm text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <span className="w-9 h-9 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center flex-shrink-0">
          <ImageIcon size={18} />
        </span>
        Imagem
      </button>
      <button
        onClick={() => { setOpen(false); docInputRef.current?.click(); }}
        className="w-full min-h-[48px] px-4 py-3 flex items-center gap-3 text-base md:text-sm text-slate-700 hover:bg-slate-50 transition-colors border-t border-slate-100"
      >
        <span className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
          <FileText size={18} />
        </span>
        Documento
      </button>
    </>
  );

  return (
    <div className="relative flex-shrink-0">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png"
        onChange={handleImageChange}
        className="hidden"
      />
      <input
        ref={docInputRef}
        type="file"
        accept={DOC_ACCEPT}
        onChange={handleDocChange}
        className="hidden"
      />

      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Anexar arquivo"
        aria-expanded={open}
        className={`flex items-center justify-center w-11 h-11 rounded-full text-slate-500 hover:bg-slate-200/70 transition-all ${
          open ? 'rotate-45 bg-slate-200/70' : ''
        }`}
      >
        <Plus size={22} />
      </button>

      {open && (
        <>
          <div
            className={`fixed inset-0 z-40 ${isMobile ? 'bg-black/40' : ''}`}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {isMobile ? (
            <div
              className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl overflow-hidden"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mt-2 mb-1" />
              {options}
            </div>
          ) : (
            <div className="absolute bottom-full left-0 mb-2 z-50 w-52 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
              {options}
            </div>
          )}
        </>
      )}
    </div>
  );
};
