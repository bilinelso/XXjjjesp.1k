import { supabase } from './supabase';

interface CachedProfilePic {
  url: string;
  cachedAt: number;
}

class ProfilePicCache {
  private memoryCache: Map<string, CachedProfilePic> = new Map();
  private pendingFetches: Map<string, Promise<string | null>> = new Map();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000;

  getCached(jid: string): string | null {
    const cached = this.memoryCache.get(jid);
    if (!cached) return null;

    const age = Date.now() - cached.cachedAt;
    if (age > this.CACHE_TTL) {
      this.memoryCache.delete(jid);
      return null;
    }

    return cached.url;
  }

  set(jid: string, url: string): void {
    this.memoryCache.set(jid, {
      url,
      cachedAt: Date.now(),
    });
    this.saveToDatabase(jid, url);
  }

  async loadFromDatabase(jids: string[]): Promise<void> {
    if (jids.length === 0) return;

    try {
      const { data } = await supabase
        .from('whatsapp_contact_cache')
        .select('jid, profile_pic_url, profile_pic_updated_at')
        .in('jid', jids)
        .not('profile_pic_url', 'is', null);

      if (data) {
        for (const row of data) {
          if (row.profile_pic_url && !this.memoryCache.has(row.jid)) {
            const cachedAt = row.profile_pic_updated_at
              ? new Date(row.profile_pic_updated_at).getTime()
              : Date.now();

            this.memoryCache.set(row.jid, {
              url: row.profile_pic_url,
              cachedAt,
            });
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load profile pics from database:', error);
    }
  }

  private async saveToDatabase(jid: string, url: string): Promise<void> {
    try {
      await supabase
        .from('whatsapp_contact_cache')
        .update({
          profile_pic_url: url,
          profile_pic_updated_at: new Date().toISOString(),
        })
        .eq('jid', jid);
    } catch (error) {
      console.warn('Failed to save profile pic to database:', error);
    }
  }

  async get(jid: string, fetchFn: () => Promise<string | null>): Promise<string | null> {
    const cached = this.getCached(jid);
    if (cached) return cached;

    const pending = this.pendingFetches.get(jid);
    if (pending) return pending;

    const fetchPromise = (async () => {
      try {
        const url = await fetchFn();
        if (url) {
          this.set(jid, url);
          return url;
        }
        return null;
      } finally {
        this.pendingFetches.delete(jid);
      }
    })();

    this.pendingFetches.set(jid, fetchPromise);
    return fetchPromise;
  }

  preload(pics: Record<string, string | undefined>): void {
    for (const [jid, url] of Object.entries(pics)) {
      if (url && !this.memoryCache.has(jid)) {
        this.memoryCache.set(jid, {
          url,
          cachedAt: Date.now(),
        });
      }
    }
  }

  clear(): void {
    this.memoryCache.clear();
    this.pendingFetches.clear();
  }
}

export const profilePicCache = new ProfilePicCache();
