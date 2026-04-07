import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseFunctionsFetchProxy } from '../helpers/supabase-functions-fetch-proxy';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private _client: SupabaseClient | null = null;

  /** Use before accessing `client` to avoid throwing when env is not set (e.g. fresh clone). */
  isConfigured(): boolean {
    const url = environment.supabaseUrl?.trim() ?? '';
    const key = environment.supabaseAnonKey?.trim() ?? '';
    return url.length > 0 && key.length > 0;
  }

  /** URL for an Edge Function (e.g. ensure-room-images). */
  getEdgeFunctionUrl(name: string): string {
    const base = environment.supabaseUrl ?? '';
    return `${base.replace(/\/$/, '')}/functions/v1/${name}`;
  }

  get client(): SupabaseClient {
    if (!this._client) {
      if (!this.isConfigured()) {
        throw new Error(
          'Supabase URL and anon key must be set in src/environments/environment.ts (see dashboard Project Settings → API).'
        );
      }
      const functionsProxy = environment.supabaseFunctionsFetchProxyPrefix?.trim();
      this._client = createClient(
        environment.supabaseUrl,
        environment.supabaseAnonKey,
        {
          auth: {
            // Avoid browser LockManager timeout noise:
            // `NavigatorLockAcquireTimeoutError ... auth-token`.
            // This app can safely run auth ops without cross-tab lock coordination.
            lock: async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>) => fn(),
          },
          ...(functionsProxy
            ? {
                global: {
                  fetch: createSupabaseFunctionsFetchProxy(
                    environment.supabaseUrl,
                    functionsProxy
                  ),
                },
              }
            : {}),
        }
      );
    }
    return this._client;
  }
}
