import { Injectable } from '@angular/core';
import { from, map, Observable } from 'rxjs';
import type {
  CreateMeetingInput,
  Meeting,
  MeetingGuestWithProfile,
  UpdateMeetingInput,
} from '../interfaces/meeting';
import { SupabaseService } from './supabase.service';

const MEETING_DETAIL_SELECT = `
  *,
  rooms (*),
  profiles!meetings_created_by_fkey (*),
  meeting_guests (
    *,
    profiles!meeting_guests_user_id_fkey (*)
  )
`;

@Injectable({
  providedIn: 'root',
})
export class MeetingService {
  constructor(private sb: SupabaseService) { }

  private meetingRowToApp(row: Record<string, unknown>): Meeting {
    return {
      id: row['id'] as string,
      companyId: row['company_id'] as string,
      createdByUserId: row['created_by'] as string,
      roomId: row['room_id'] as string,
      title: row['title'] as string,
      startTime: row['start_time'] as string,
      endTime: row['end_time'] as string,
      meetingNote: (row['meeting_note'] as string | null) ?? null,
      details: (row['details'] as string | null) ?? null,
      status: row['status'] as Meeting['status'],
      createdAt: row['created_at'] as string | undefined,
      updatedAt: row['updated_at'] as string | undefined,
    };
  }

  private patchRowFromInput(patch: UpdateMeetingInput): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    if (patch.roomId !== undefined) row['room_id'] = patch.roomId;
    if (patch.title !== undefined) row['title'] = patch.title;
    if (patch.startTime !== undefined) row['start_time'] = patch.startTime;
    if (patch.endTime !== undefined) row['end_time'] = patch.endTime;
    if (patch.meetingNote !== undefined) row['meeting_note'] = patch.meetingNote;
    if (patch.details !== undefined) row['details'] = patch.details;
    if (patch.status !== undefined) row['status'] = patch.status;
    return row;
  }

  private mapDetailRow(row: Record<string, unknown>): Meeting {
    const base = this.meetingRowToApp(row);
    const guestsRaw = row['meeting_guests'] as Record<string, unknown>[] | null;
    const guests: MeetingGuestWithProfile[] | undefined = Array.isArray(guestsRaw)
      ? guestsRaw.map((g) => ({
          id: g['id'] as string,
          meetingId: g['meeting_id'] as string,
          userId: g['user_id'] as string,
          status: g['status'] as MeetingGuestWithProfile['status'],
          createdAt: g['created_at'] as string | undefined,
          profile: (g['profiles'] as Record<string, unknown>) ?? null,
        }))
      : undefined;
    return {
      ...base,
      room: (row['rooms'] as Record<string, unknown>) ?? null,
      creator: (row['profiles'] as Record<string, unknown>) ?? null,
      guests,
    };
  }

  /** Atomic create + guests; validates company and overlap server-side. */
  createMeetingWithGuests(input: CreateMeetingInput): Observable<Meeting> {
    return from(
      this.sb.client.rpc('create_meeting_with_guests', {
        p_room_id: input.roomId,
        p_title: input.title,
        p_start_time: input.startTime,
        p_end_time: input.endTime,
        p_meeting_note: input.meetingNote ?? null,
        p_details: input.details ?? null,
        p_guest_ids: input.guestIds ?? [],
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('No meeting returned');
        return this.meetingRowToApp(data as Record<string, unknown>);
      })
    );
  }

  /**
   * List meetings visible under RLS (organizer or guest). Optional status filter and page/limit.
   */
  listMyMeetings(options: {
    status?: Meeting['status'];
    page?: number;
    limit?: number;
  } = {}): Observable<{ meetings: Meeting[]; total: number | null }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 10));
    const fromIdx = (page - 1) * limit;
    const toIdx = fromIdx + limit - 1;

    let q = this.sb.client
      .from('meetings')
      .select('*', { count: 'exact' })
      .order('start_time', { ascending: false });
    if (options.status !== undefined) {
      q = q.eq('status', options.status);
    }

    return from(q.range(fromIdx, toIdx)).pipe(
      map(({ data, error, count }) => {
        if (error) throw error;
        const meetings = (data ?? []).map((row) =>
          this.meetingRowToApp(row as Record<string, unknown>)
        );
        return { meetings, total: count };
      })
    );
  }

  getMeetingById(id: string): Observable<Meeting | null> {
    return from(
      this.sb.client.from('meetings').select('*').eq('id', id).maybeSingle()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data ? this.meetingRowToApp(data as Record<string, unknown>) : null;
      })
    );
  }

  /** Room, creator profile, and guests with nested profiles (legacy detail shape). */
  getMeetingWithRelations(id: string): Observable<Meeting | null> {
    return from(
      this.sb.client.from('meetings').select(MEETING_DETAIL_SELECT).eq('id', id).maybeSingle()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data ? this.mapDetailRow(data as Record<string, unknown>) : null;
      })
    );
  }

  updateMeeting(meetingId: string, patch: UpdateMeetingInput): Observable<Meeting | null> {
    const row = this.patchRowFromInput(patch);
    if (Object.keys(row).length === 0) {
      return this.getMeetingById(meetingId);
    }
    return from(
      this.sb.client.from('meetings').update(row).eq('id', meetingId).select().maybeSingle()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data ? this.meetingRowToApp(data as Record<string, unknown>) : null;
      })
    );
  }

  /** Soft cancel (maps legacy DELETE /meetings/:id). */
  cancelMeeting(meetingId: string): Observable<Meeting | null> {
    return this.updateMeeting(meetingId, { status: 'cancelled' });
  }

  /** Guest RSVP — updates `meeting_guests` for the current user. */
  rsvp(meetingId: string, status: 'accepted' | 'declined'): Observable<Meeting> {
    return from(
      this.sb.client.rpc('rsvp_meeting', {
        p_meeting_id: meetingId,
        p_status: status,
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('No meeting returned');
        return this.meetingRowToApp(data as Record<string, unknown>);
      })
    );
  }
}
