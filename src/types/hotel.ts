export type RoomStatus = "sale" | "propre" | "controlee";
export type StaffRole = "chambre" | "gouvernante" | "maintenance" | "reception";
export type ActivityType = "info" | "status" | "issue" | "resolved" | "assign" | "verify";

export interface HotelRow { id: string; name: string; created_at: string; updated_at: string; }
export interface StaffRow {
	id: string; hotel_id: string; name: string; role: StaffRole; active: boolean;
	hidden: boolean; profile_id: string | null; avatar_url: string;
	created_at: string; updated_at: string;
}
export interface RoomRow {
	id: string; hotel_id: string; name: string; floor: number;
	status: RoomStatus; assignee_staff_id: string | null;
	verifier_staff_id: string | null; priority: boolean; note: string;
	recouche: boolean; dnd: boolean; cleaning_hour: string;
	created_at: string; updated_at: string;
}
export interface IssueRow {
	id: string; hotel_id: string; room_id: string; description: string;
	photo_url: string | null; photo_urls: string[];
	assignee_staff_id: string | null; resolved: boolean;
	resolved_at: string | null; created_at: string; updated_at: string;
}
export interface ActivityLogRow { id: string; hotel_id: string; room_id: string | null; issue_id: string | null; actor_staff_id: string | null; type: ActivityType; status: RoomStatus | null; text: string; metadata: Record<string, unknown>; created_at: string; }
export interface ProfileRow {
	id: string; email: string; name: string; avatar_url: string | null;
	is_admin: boolean; hotel_id: string | null; role: StaffRole | null;
	staff_id: string | null; active: boolean; created_at: string; updated_at: string;
}

export interface HotelDataState { hotel: HotelRow | null; hotelId: string | null; rooms: RoomRow[]; issues: IssueRow[]; staff: StaffRow[]; activityLogs: ActivityLogRow[]; notifyOn: boolean; isHydrated: boolean; isLoading: boolean; isSyncing: boolean; lastError: string | null; lastSyncedAt: string | null; }

export interface UpdateRoomStatusInput { hotelId: string; roomId: string; newStatus: RoomStatus; verifierId: string | null; actorId: string | null; }
export interface ReportIssueInput { hotelId: string; roomId: string; description: string; photoUrls: string[]; assigneeId: string | null; actorId: string | null; }
