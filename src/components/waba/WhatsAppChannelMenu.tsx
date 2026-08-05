import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, BadgeCheck, Loader2, AlertCircle } from 'lucide-react';
import { wabaApi } from '../../lib/wabaApi';

const MENU_WIDTH = 264;
/** Altura aproximada do menu, usada só para decidir se abre para cima. */
const MENU_HEIGHT_ESTIMATE = 140;

type WhatsAppChannelMenuProps = {
  clienteId: string;
  telefone: string;
  /** Módulo QR — comportamento de hoje, inalterado. */
  onOpenQr: (phone: string) => void;
  /** Recebe o id da conversa já resolvido pela RPC. */
  onOpenWaba: (chatId: string) => void;
  className?: string;
  title?: string;
  children: React.ReactNode;
};

/**
 * Gatilho que abre um menu para escolher o canal ao clicar no telefone.
 *
 * O menu é `fixed` e posicionado a partir do rect do gatilho: nos vários locais
 * onde ele aparece existe container com scroll/overflow, e um dropdown
 * `absolute` seria cortado.
 */
export const WhatsAppChannelMenu: React.FC<WhatsAppChannelMenuProps> = ({
  clienteId,
  telefone,
  onOpenQr,
  onOpenWaba,
  className,
  title,
  children,
}) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  // onClick cobre toque e mouse — nada aqui depende de hover, porque os
  // assessores usam iPhone.
  const handleTriggerClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (open) {
      close();
      return;
    }

    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Abre para cima quando não há espaço abaixo — sem isto o menu de um
    // gatilho perto do rodapé (último card da lista, botão do preview) nasce
    // fora da tela.
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8));
    const openUpward = rect.bottom + MENU_HEIGHT_ESTIMATE > window.innerHeight;

    setPosition(
      openUpward
        ? { bottom: window.innerHeight - rect.top + 4, left }
        : { top: rect.bottom + 4, left }
    );
    setError(null);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    // Um menu fixo ancorado no gatilho descola se a página rolar por baixo.
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

  const handleOpenQr = (e: React.MouseEvent) => {
    e.stopPropagation();
    close();
    onOpenQr(telefone);
  };

  const handleOpenWaba = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loading) return;

    setLoading(true);
    setError(null);
    const result = await wabaApi.openChat(clienteId);
    setLoading(false);

    if (!result.success) {
      // Falha fica visível no próprio menu, que continua aberto.
      setError(result.message);
      return;
    }

    close();
    onOpenWaba(result.chat_id);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        className={className}
      >
        {children}
      </button>

      {open && position && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            onClick={e => { e.stopPropagation(); close(); }}
            aria-hidden="true"
          />
          <div
            role="menu"
            onClick={e => e.stopPropagation()}
            style={{ top: position.top, bottom: position.bottom, left: position.left, width: MENU_WIDTH }}
            className="fixed z-[61] bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden text-left"
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleOpenQr}
              className="w-full min-h-[44px] px-3 py-2 flex items-center gap-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <MessageCircle size={16} className="text-green-600 flex-shrink-0" />
              <span className="flex-1 text-left">Abrir no WhatsApp</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={handleOpenWaba}
              disabled={loading}
              className="w-full min-h-[44px] px-3 py-2 flex items-center gap-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors border-t border-slate-100 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 size={16} className="text-emerald-600 flex-shrink-0 animate-spin" />
              ) : (
                <BadgeCheck size={16} className="text-emerald-600 flex-shrink-0" />
              )}
              <span className="flex-1 text-left">
                {loading ? 'Abrindo conversa...' : 'Abrir no WhatsApp Oficial'}
              </span>
            </button>

            {error && (
              <p className="px-3 py-2 flex items-start gap-2 text-xs text-red-700 bg-red-50 border-t border-red-200">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
};
