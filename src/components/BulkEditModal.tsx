import React, { useState } from 'react';
import { X, Save, Send, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { Cliente } from '../lib/api';
import { LoadingSpinner } from './LoadingSpinner';
import { useKanbanColumns } from '../hooks/useKanbanColumns';

type BulkSendResult = { successCount: number; total: number };

type BulkEditModalProps = {
  selectedClientes: Cliente[];
  onClose: () => void;
  onBulkUpdate: (updates: Partial<Cliente>) => Promise<void>;
  onBulkSendPostback: () => Promise<BulkSendResult>;
  onBulkSendGclid: () => Promise<BulkSendResult>;
};

type ConfirmDialog = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
};

type Feedback = {
  type: 'success' | 'error';
  title: string;
  message: string;
};

export const BulkEditModal: React.FC<BulkEditModalProps> = ({
  selectedClientes,
  onClose,
  onBulkUpdate,
  onBulkSendPostback,
  onBulkSendGclid
}) => {
  const { columns } = useKanbanColumns();
  const [updates, setUpdates] = useState<Partial<Cliente>>({});
  const [saving, setSaving] = useState(false);
  const [sendingPostback, setSendingPostback] = useState(false);
  const [sendingGclid, setSendingGclid] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const hasPostbackClientes = selectedClientes.some(
    c => c.lead?.click_id && !c.postback_enviado
  );
  // Enhanced Conversions for Leads: elegível = cliente com compra registrada e ainda não enviado
  const hasGclidClientes = selectedClientes.some(
    c => (c.valor_produto ?? 0) > 0 && !c.gclid_enviado
  );

  const postbackCount = selectedClientes.filter(
    c => c.lead?.click_id && !c.postback_enviado
  ).length;
  const gclidCount = selectedClientes.filter(
    c => (c.valor_produto ?? 0) > 0 && !c.gclid_enviado
  ).length;

  const handleSave = async () => {
    if (Object.keys(updates).length === 0) {
      setFeedback({
        type: 'error',
        title: 'Nenhuma alteração',
        message: 'Preencha pelo menos um campo para salvar as alterações.'
      });
      return;
    }

    setSaving(true);
    try {
      await onBulkUpdate(updates);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleSendPostback = () => {
    if (!hasPostbackClientes) return;

    setConfirmDialog({
      title: 'Enviar Postback (Tracker)',
      message: `Deseja enviar o postback de conversão ao tracker para ${postbackCount} cliente(s) selecionado(s)?`,
      confirmLabel: 'Enviar Postback',
      onConfirm: async () => {
        setConfirmDialog(null);
        setSendingPostback(true);
        try {
          const { successCount, total } = await onBulkSendPostback();
          setFeedback({
            type: successCount > 0 ? 'success' : 'error',
            title: 'Envio de Postback',
            message: `Postback enviado para ${successCount} de ${total} cliente(s).`
          });
        } catch {
          setFeedback({
            type: 'error',
            title: 'Falha no envio',
            message: 'Não foi possível enviar o postback. Tente novamente.'
          });
        } finally {
          setSendingPostback(false);
        }
      }
    });
  };

  const handleSendGclid = () => {
    if (!hasGclidClientes) return;

    setConfirmDialog({
      title: 'Enviar Conversão (Google Ads)',
      message: `Deseja enviar a conversão GCLID à planilha/Google Ads para ${gclidCount} cliente(s) selecionado(s)?`,
      confirmLabel: 'Enviar Conversão',
      onConfirm: async () => {
        setConfirmDialog(null);
        setSendingGclid(true);
        try {
          const { successCount, total } = await onBulkSendGclid();
          setFeedback({
            type: successCount > 0 ? 'success' : 'error',
            title: 'Envio de Conversão',
            message: `Conversão GCLID enviada para ${successCount} de ${total} cliente(s).`
          });
        } catch {
          setFeedback({
            type: 'error',
            title: 'Falha no envio',
            message: 'Não foi possível enviar a conversão. Tente novamente.'
          });
        } finally {
          setSendingGclid(false);
        }
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold">Edição em Massa</h2>
              <p className="text-sm text-gray-600 mt-1">
                {selectedClientes.length} cliente(s) selecionado(s)
              </p>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <X size={24} />
            </button>
          </div>

          <div className="space-y-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
              <div className="text-sm text-yellow-800">
                <p className="font-semibold mb-1">Atenção:</p>
                <p>
                  As alterações serão aplicadas a todos os {selectedClientes.length} clientes
                  selecionados. Deixe os campos em branco para não alterar.
                </p>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold mb-4 text-lg">Editar Informações</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Mover para Status
                  </label>
                  <select
                    value={updates.status || ''}
                    onChange={(e) => setUpdates({ ...updates, status: e.target.value as any || undefined })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="">Não alterar</option>
                    {columns.map(col => (
                      <option key={col.status_key} value={col.status_key}>
                        {col.display_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Assessor
                  </label>
                  <input
                    type="text"
                    value={updates.assessor || ''}
                    onChange={(e) => setUpdates({ ...updates, assessor: e.target.value || undefined })}
                    placeholder="Nome do assessor"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Valor Fundos
                  </label>
                  <input
                    type="number"
                    value={updates.valor_deposito !== undefined ? updates.valor_deposito : ''}
                    onChange={(e) => setUpdates({
                      ...updates,
                      valor_deposito: e.target.value ? parseFloat(e.target.value) : undefined
                    })}
                    placeholder="0"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSave}
                    disabled={saving || Object.keys(updates).length === 0}
                    className="flex-1 bg-blue-600 text-white px-4 py-3 rounded flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
                  >
                    {saving ? (
                      <>
                        <LoadingSpinner size="sm" color="white" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Save size={18} />
                        Salvar Alterações
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold mb-4 text-lg">Envio de Rastreamento</h3>

              <div className="space-y-3">
                <div className={`p-4 rounded-lg border-2 ${
                  hasPostbackClientes
                    ? 'bg-green-50 border-green-200'
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-800">Enviar Postback (Tracker)</p>
                      <p className="text-sm text-gray-600">
                        {postbackCount} cliente(s) elegível(is) para envio
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleSendPostback}
                    disabled={!hasPostbackClientes || sendingPostback}
                    className={`w-full px-4 py-2 rounded flex items-center justify-center gap-2 transition-colors ${
                      hasPostbackClientes
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    } disabled:opacity-50`}
                  >
                    {sendingPostback ? (
                      <>
                        <LoadingSpinner size="sm" color="white" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send size={16} />
                        Enviar Postback
                      </>
                    )}
                  </button>
                  {!hasPostbackClientes && (
                    <p className="text-xs text-gray-500 mt-2">
                      Nenhum cliente com click_id disponível ou todos já foram enviados
                    </p>
                  )}
                </div>

                <div className={`p-4 rounded-lg border-2 ${
                  hasGclidClientes
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-800">Enviar Conversão (Google Ads)</p>
                      <p className="text-sm text-gray-600">
                        {gclidCount} cliente(s) elegível(is) para envio
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleSendGclid}
                    disabled={!hasGclidClientes || sendingGclid}
                    className={`w-full px-4 py-2 rounded flex items-center justify-center gap-2 transition-colors ${
                      hasGclidClientes
                        ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    } disabled:opacity-50`}
                  >
                    {sendingGclid ? (
                      <>
                        <LoadingSpinner size="sm" color="white" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send size={16} />
                        Enviar Conversão
                      </>
                    )}
                  </button>
                  {!hasGclidClientes && (
                    <p className="text-xs text-gray-500 mt-2">
                      Nenhum cliente com compra registrada disponível ou todos já foram enviados
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <button
                onClick={onClose}
                className="w-full px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      </div>

      {confirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 rounded-full p-2 flex-shrink-0">
                <Send className="text-blue-600" size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">{confirmDialog.title}</h3>
                <p className="text-sm text-gray-600 mt-1">{confirmDialog.message}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setConfirmDialog(null)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {feedback && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-3">
              <div className={`rounded-full p-2 flex-shrink-0 ${
                feedback.type === 'success' ? 'bg-green-100' : 'bg-red-100'
              }`}>
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="text-green-600" size={20} />
                ) : (
                  <AlertTriangle className="text-red-600" size={20} />
                )}
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">{feedback.title}</h3>
                <p className="text-sm text-gray-600 mt-1">{feedback.message}</p>
              </div>
            </div>
            <div className="mt-6">
              <button
                onClick={() => setFeedback(null)}
                className={`w-full px-4 py-2 text-white rounded transition-colors ${
                  feedback.type === 'success'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
