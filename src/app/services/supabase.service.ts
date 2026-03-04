import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private _client: SupabaseClient | null = null;

  /** URL for an Edge Function (e.g. ensure-room-images). */
  getEdgeFunctionUrl(name: string): string {
    const base = environment.supabaseUrl ?? '';
    return `${base.replace(/\/$/, '')}/functions/v1/${name}`;
  }

  get client(): SupabaseClient {
    if (!this._client) {
      if (!environment.supabaseUrl || !environment.supabaseAnonKey) {
        throw new Error('Supabase URL and anon key must be set in environment.');
      }
      this._client = createClient(
        environment.supabaseUrl,
        environment.supabaseAnonKey
      );
    }
    return this._client;
  }
}
