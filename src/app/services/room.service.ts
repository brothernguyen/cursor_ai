import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Room } from '../interfaces/auth';
import { BASE_URL } from '../config/constants';

@Injectable({
  providedIn: 'root',
})
export class RoomService {
  private baseUrl = `${BASE_URL}/company-admin/rooms`;

  constructor(private http: HttpClient) { }

  // Get the token from localStorage
  private getToken(): string | null {
    return localStorage.getItem('user_token');
  }

  // Create a new meeting room
  createRoom(room: Room) {
    const token = this.getToken();
    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.post(this.baseUrl, room, { headers });
  }

  // Get all rooms
  getAllRooms() {
    const token = this.getToken();
    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.get(this.baseUrl, { headers });
  }

  // Edit a meeting room
  editRoom(roomId: string, room: {
    name: string;
    capacity: number;
    availableFrom: string;
    availableTo: string;
    location: string;
  }) {
    const token = this.getToken();
    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    const url = `${this.baseUrl}/${roomId}`;
    return this.http.put(url, room, { headers });
  }

  // Delete a meeting room
  deleteRoom(roomId: string) {
    const token = this.getToken();
    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    const url = `${this.baseUrl}/${roomId}`;
    return this.http.delete(url, { headers });
  }
}

