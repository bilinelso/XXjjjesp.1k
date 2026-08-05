import { useCallback, useEffect, useState } from 'react';
import {
  readViewFromLocation,
  resolveView,
  urlForView,
  type ViewType,
} from '../lib/viewRouting';

interface UseViewRouteParams {
  /** Só resolve o padrão depois que o perfil (e portanto as permissões) carregou. */
  ready: boolean;
  isMobile: boolean;
  restrictToMobileViews: boolean;
  canView: (view: ViewType) => boolean;
}

/**
 * Mantém a tela atual sincronizada com `?view=` na URL.
 *
 * - troca de tela → `pushState`, então o botão voltar navega entre as telas
 * - `?view=` inválido, sem permissão ou não responsivo → `replaceState` para a
 *   tela que de fato foi renderizada, sem sujar o histórico
 * - `popstate` → volta a ler a URL
 */
export function useViewRoute({
  ready,
  isMobile,
  restrictToMobileViews,
  canView,
}: UseViewRouteParams): { view: ViewType; setView: (view: ViewType) => void } {
  const [requested, setRequested] = useState<ViewType | null>(() => readViewFromLocation());

  const view = resolveView({ requested, isMobile, restrictToMobileViews, canView });

  // Alinha URL e estado com a tela realmente renderizada. Não cria loop: o
  // próximo render já encontra `requested === view` e o efeito não faz nada.
  useEffect(() => {
    if (!ready || requested === view) return;
    setRequested(view);
    window.history.replaceState({ view }, '', urlForView(view));
  }, [ready, requested, view]);

  useEffect(() => {
    const onPopState = () => setRequested(readViewFromLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const setView = useCallback((next: ViewType) => {
    setRequested(next);
    if (readViewFromLocation() !== next) {
      window.history.pushState({ view: next }, '', urlForView(next));
    }
  }, []);

  return { view, setView };
}
