import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable, from } from 'rxjs';
import { Room } from '../interfaces/auth';
// import { BASE_URL } from '../config/constants'; // kept for commented HTTP API
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root',
})
export class RoomService {
  // --- Legacy CRUD API (commented for safety) ---
  // private baseUrl = `${BASE_URL}/company-admin/rooms`;

  constructor(
    private http: HttpClient,
    private sb: SupabaseService,
    private auth: AuthService
  ) { }

  private getToken(): string | null {
    return localStorage.getItem('user_token');
  }

  private getCompanyId(): string | null {
    return this.auth.getCompanyId();
  }

  private roomAppToRow(room: Room | Record<string, unknown>): Record<string, unknown> {
    const r = room as Record<string, unknown>;
    return {
      name: r['name'],
      capacity: r['capacity'],
      available_from: r['availableFrom'] ?? r['available_from'],
      available_to: r['availableTo'] ?? r['available_to'],
      location: r['location'],
      timezone: r['timezone'] ?? 'UTC',
    };
  }

  private roomRowToApp(row: Record<string, unknown>): Record<string, unknown> {
    return {
      id: row['id'],
      name: row['name'],
      capacity: row['capacity'],
      availableFrom: row['available_from'],
      availableTo: row['available_to'],
      location: row['location'],
      timezone: row['timezone'],
    };
  }

  createRoom(room: Room): Observable<unknown> {
    const companyId = this.getCompanyId();
    if (!companyId) throw new Error('Company context required');
    const row = this.roomAppToRow(room);
    return from(
      this.sb.client.from('rooms').insert({ ...row, company_id: companyId }).select().single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data ? this.roomRowToApp(data) : null;
      })
    );
  }

  // --- Legacy CRUD API (commented) ---
  // createRoom(room: Room) {
  //   const token = this.getToken();
  //   let headers = new HttpHeaders();
  //   if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  //   return this.http.post(this.baseUrl, room, { headers });
  // }

  getAllRooms(): Observable<unknown> {
    const companyId = this.getCompanyId();
    if (!companyId) throw new Error('Company context required');
    return from(
      this.sb.client.from('rooms').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map(row => this.roomRowToApp(row));
      })
    );
  }

  // --- Legacy CRUD API (commented) ---
  // getAllRooms() {
  //   const token = this.getToken();
  //   let headers = new HttpHeaders();
  //   if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  //   return this.http.get(this.baseUrl, { headers });
  // }

  editRoom(roomId: string, room: {
    name: string;
    capacity: number;
    availableFrom: string;
    availableTo: string;
    location: string;
  }): Observable<unknown> {
    const companyId = this.getCompanyId();
    if (!companyId) throw new Error('Company context required');
    const row = this.roomAppToRow(room);
    return from(
      this.sb.client.from('rooms').update(row).eq('id', roomId).eq('company_id', companyId).select().single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data ? this.roomRowToApp(data) : null;
      })
    );
  }

  // --- Legacy CRUD API (commented) ---
  // editRoom(roomId: string, room: {...}) {
  //   const token = this.getToken();
  //   let headers = new HttpHeaders();
  //   if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  //   const url = `${this.baseUrl}/${roomId}`;
  //   return this.http.put(url, room, { headers });
  // }

  deleteRoom(roomId: string): Observable<void> {
    const companyId = this.getCompanyId();
    if (!companyId) throw new Error('Company context required');
    return from(
      this.sb.client.from('rooms').delete().eq('id', roomId).eq('company_id', companyId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  // --- Legacy CRUD API (commented) ---
  // deleteRoom(roomId: string) {
  //   const token = this.getToken();
  //   let headers = new HttpHeaders();
  //   if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  //   const url = `${this.baseUrl}/${roomId}`;
  //   return this.http.delete(url, { headers });
  // }
}
