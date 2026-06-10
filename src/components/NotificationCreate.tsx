import { useState, useEffect } from 'react';
import { Send, Loader2, Image, FileText, CheckSquare, Square, X } from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface UserOption {
  id: string;
  email: string;
}

export function NotificationCreate() {
  const { user, profile } = useAuth();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    supabase
      .from('user_profiles')
      .select('id, email')
      .then(({ data }) => {
        if (data) setUsers(data as UserOption[]);
      });
  }, []);

  if (!profile?.is_master) return null;

  const allSelected = users.length > 0 && selectedUserIds.size === users.length;

  const toggleUser = (id: string) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(users.map(u => u.id)));
    }
  };

  const uploadFile = async (file: File, prefix: string): Promise<string | null> => {
    const ext = file.name.split('.').pop();
    const path = `${prefix}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('notifications')
      .upload(path, file, { upsert: false });
    if (error) { console.error('Upload error:', error); return null; }
    const { data } = supabase.storage.from('notifications').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSend = async () => {
    if (!user || !title.trim() || messageIsEmpty || selectedUserIds.size === 0) return;
    setSending(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const imageUrl = imageFile ? await uploadFile(imageFile, 'img') : null;
      const pdfUrl = pdfFile ? await uploadFile(pdfFile, 'pdf') : null;

      const { data: notif, error: notifError } = await supabase
        .from('notifications')
        .insert({
          created_by: user.id,
          title: title.trim(),
          message: message.trim(),
          image_url: imageUrl,
          pdf_url: pdfUrl,
        })
        .select('id')
        .single();

      if (notifError || !notif) throw notifError || new Error('Erro ao criar notificação');

      const recipients = Array.from(selectedUserIds).map(userId => ({
        notification_id: notif.id,
        user_id: userId,
      }));

      const { error: recError } = await supabase
        .from('notification_recipients')
        .insert(recipients);

      if (recError) throw recError;

      setTitle('');
      setMessage('');
      setImageFile(null);
      setPdfFile(null);
      setSelectedUserIds(new Set());
      setSuccessMsg(`Notificação enviada para ${recipients.length} usuário(s).`);
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao enviar notificação. Verifique os campos e tente novamente.');
    } finally {
      setSending(false);
    }
  };

  const messageIsEmpty = !message || message.replace(/<(.|\n)*?>/g, '').trim() === '';
  const canSend = title.trim() && !messageIsEmpty && selectedUserIds.size > 0 && !sending;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-200 bg-slate-50">
        <h3 className="text-lg font-semibold text-slate-900">Enviar Notificação</h3>
        <p className="text-sm text-slate-500 mt-1">Envie avisos e comunicados para os usuários</p>
      </div>

      <div className="p-6 space-y-5">
        {/* Título */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Título</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ex: Atualização do sistema"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Mensagem */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Mensagem</label>
          <div className="quill-wrapper border border-slate-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
            <ReactQuill
              value={message}
              onChange={setMessage}
              placeholder="Escreva o conteúdo da notificação..."
              modules={{
                toolbar: [
                  ['bold', 'italic', 'underline'],
                  [{ list: 'ordered' }, { list: 'bullet' }],
                  ['link'],
                  ['clean'],
                ],
              }}
              formats={['bold', 'italic', 'underline', 'list', 'bullet', 'link']}
            />
          </div>
        </div>

        {/* Arquivos */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Imagem <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                onChange={e => setImageFile(e.target.files?.[0] || null)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <div className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg cursor-pointer transition-colors ${
                imageFile ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}>
                <Image size={15} />
                <span className="truncate">{imageFile ? imageFile.name : 'Selecionar imagem'}</span>
                {imageFile && (
                  <button
                    className="ml-auto flex-shrink-0"
                    onClick={e => { e.stopPropagation(); setImageFile(null); }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              PDF <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <div className="relative">
              <input
                type="file"
                accept="application/pdf"
                onChange={e => setPdfFile(e.target.files?.[0] || null)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <div className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg cursor-pointer transition-colors ${
                pdfFile ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}>
                <FileText size={15} />
                <span className="truncate">{pdfFile ? pdfFile.name : 'Selecionar PDF'}</span>
                {pdfFile && (
                  <button
                    className="ml-auto flex-shrink-0"
                    onClick={e => { e.stopPropagation(); setPdfFile(null); }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Destinatários */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-slate-700">
              Destinatários ({selectedUserIds.size} selecionado{selectedUserIds.size !== 1 ? 's' : ''})
            </label>
            <button
              onClick={toggleAll}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
          </div>
          <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-100">
            {users.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Carregando usuários...</p>
            ) : (
              users.map(u => {
                const checked = selectedUserIds.has(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => toggleUser(u.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left"
                  >
                    {checked
                      ? <CheckSquare size={16} className="text-blue-600 flex-shrink-0" />
                      : <Square size={16} className="text-slate-300 flex-shrink-0" />
                    }
                    <span className="text-sm text-slate-700 truncate">{u.email}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Feedback */}
        {successMsg && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {/* Botão enviar */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? (
            <><Loader2 size={16} className="animate-spin" /> Enviando...</>
          ) : (
            <><Send size={16} /> Enviar Notificação</>
          )}
        </button>
      </div>
    </div>
  );
}
