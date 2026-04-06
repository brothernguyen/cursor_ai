export type MeetingStatus = 'scheduled' | 'cancelled' | 'completed';

export type MeetingGuestRsvpStatus = 'pending' | 'accepted' | 'declined';

/** Row shape aligned with legacy Swagger `Meeting` (camelCase) for UI/services. */
export interface Meeting {
  id: string;
  companyId: string;
  createdByUserId: string;
  roomId: string;
  title: string;
  startTime: string;
  endTime: string;
  meetingNote?: string | null;
  details?: string | null;
  status: MeetingStatus;
  createdAt?: string;
  updatedAt?: string;
  /** Present when using `getMeetingWithRelations`. */
  room?: Record<string, unknown> | null;
  creator?: Record<string, unknown> | null;
  guests?: MeetingGuestWithProfile[];
}

export interface MeetingGuestWithProfile {
  id: string;
  meetingId: string;
  userId: string;
  status: MeetingGuestRsvpStatus;
  createdAt?: string;
  profile?: Record<string, unknown> | null;
}

export interface CreateMeetingInput {
  roomId: string;
  title: string;
  startTime: string;
  endTime: string;
  meetingNote?: string | null;
  details?: string | null;
  guestIds?: string[];
}

export interface UpdateMeetingInput {
  roomId?: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  meetingNote?: string | null;
  details?: string | null;
  status?: MeetingStatus;
}
