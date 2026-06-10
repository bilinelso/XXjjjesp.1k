import { supabase } from './supabase';
import { formatPhoneFromJid, isLidJid, normalizePhoneForMatching } from './phoneUtils';

class ContactNameResolver {
  private memoryCache: Map<string, string> = new Map();
  private pendingLookups: Set<string> = new Set();
  private crmPhoneMap: Map<string, string> = new Map();
  private sourceCache: Map<string, string> = new Map();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const [cacheResult, clientsResult, leadsResult] = await Promise.all([
      supabase.from('whatsapp_contact_cache').select('jid, name, source'),
      supabase.from('clientes').select('nome, telefone').not('telefone', 'is', null),
      supabase.from('leads').select('nome, telefone').not('telefone', 'is', null),
    ]);

    if (cacheResult.data) {
      for (const row of cacheResult.data) {
        this.memoryCache.set(row.jid, row.name);
        if (row.source) {
          this.sourceCache.set(row.jid, row.source);
        }
      }
    }

    if (clientsResult.data) {
      for (const client of clientsResult.data) {
        if (client.telefone && client.nome) {
          const normalized = normalizePhoneForMatching(client.telefone);
          if (normalized.length >= 8) {
            this.crmPhoneMap.set(normalized, client.nome);
          }
        }
      }
    }

    if (leadsResult.data) {
      for (const lead of leadsResult.data) {
        if (lead.telefone && lead.nome) {
          const normalized = normalizePhoneForMatching(lead.telefone);
          if (normalized.length >= 8 && !this.crmPhoneMap.has(normalized)) {
            this.crmPhoneMap.set(normalized, lead.nome);
          }
        }
      }
    }

    this.initialized = true;
  }

  getNameFromJid(jid: string): string | null {
    if (this.memoryCache.has(jid)) {
      return this.memoryCache.get(jid) || null;
    }

    if (!isLidJid(jid)) {
      const phone = formatPhoneFromJid(jid);
      const normalized = normalizePhoneForMatching(phone);

      for (const [crmPhone, name] of this.crmPhoneMap.entries()) {
        if (normalized.endsWith(crmPhone) || crmPhone.endsWith(normalized)) {
          this.memoryCache.set(jid, name);
          this.saveToCache(jid, name, normalized, 'crm');
          return name;
        }
      }
    }

    return null;
  }

  async resolveNames(jids: string[]): Promise<Map<string, string>> {
    await this.initialize();

    const result = new Map<string, string>();

    for (const jid of jids) {
      const name = this.getNameFromJid(jid);
      if (name) {
        result.set(jid, name);
      }
    }

    return result;
  }

  setName(jid: string, name: string, source: 'pushname' | 'profile' | 'crm' | 'manual' = 'pushname'): void {
    if (!name || !jid) return;

    const existingSource = this.sourceCache.get(jid);
    const sourcePriority: Record<string, number> = { manual: 4, crm: 3, profile: 2, pushname: 1 };
    const existingPriority = existingSource ? (sourcePriority[existingSource] || 0) : 0;
    const newPriority = sourcePriority[source] || 0;

    if (existingPriority > newPriority) return;

    this.memoryCache.set(jid, name);
    this.sourceCache.set(jid, source);

    const phone = !isLidJid(jid) ? normalizePhoneForMatching(formatPhoneFromJid(jid)) : null;
    this.saveToCache(jid, name, phone, source);
  }

  async setManualName(jid: string, name: string): Promise<void> {
    if (!name || !jid) return;
    this.memoryCache.set(jid, name);
    const phone = !isLidJid(jid) ? normalizePhoneForMatching(formatPhoneFromJid(jid)) : null;
    await this.saveToCache(jid, name, phone, 'manual');
  }

  private async saveToCache(jid: string, name: string, phone: string | null, source: string): Promise<void> {
    if (this.pendingLookups.has(jid)) return;
    this.pendingLookups.add(jid);

    try {
      await supabase.from('whatsapp_contact_cache').upsert(
        {
          jid,
          name,
          phone_normalized: phone,
          source,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'jid' }
      );
    } catch {
    } finally {
      this.pendingLookups.delete(jid);
    }
  }

  extractPushNamesFromMessages(messages: Array<{ key: { remoteJid: string; fromMe: boolean }; pushName?: string }>): void {
    for (const msg of messages) {
      if (!msg.key.fromMe && msg.pushName) {
        const jid = msg.key.remoteJid;
        this.setName(jid, msg.pushName, 'pushname');
      }
    }
  }
}

export const contactNameResolver = new ContactNameResolver();
