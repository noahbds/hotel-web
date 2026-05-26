import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "../services/supabase/client";
import type {
	ActivityLogRow,
	HotelDataState,
	HotelRow,
	IssueRow,
	ReportIssueInput,
	RoomRow,
	StaffRow,
	UpdateRoomStatusInput,
	StaffRole,
	RoomStatus,
} from "../types/hotel";

type PendingMutation =
	| { id: string; kind: "updateRoomStatus"; payload: UpdateRoomStatusInput; rollbackRoom: RoomRow }
	| { id: string; kind: "reportIssue"; payload: ReportIssueInput; tempIssueId: string };

const STATE_CACHE_PREFIX = "hotel-app:web-state";
const QUEUE_CACHE_PREFIX = "hotel-app:web-queue";
const ACTIVE_HOTEL_KEY = "hotel-app:active-hotel-id";
const NOTIFY_KEY = "hotel-app:notify-on";


const EMPTY_STATE: HotelDataState = {
	hotel: null,
	hotelId: null,
	rooms: [],
	issues: [],
	staff: [],
	activityLogs: [],
	notifyOn: false,
	isHydrated: false,
	isLoading: false,
	isSyncing: false,
	lastError: null,
	lastSyncedAt: null,
};

let state: HotelDataState = { ...EMPTY_STATE };
let activeHotelId: string | null = null;
let activeChannel: ReturnType<typeof supabase.channel> | null = null;
let bootstrappingPromise: Promise<void> | null = null;
let flushingPromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let queue: PendingMutation[] = [];

const listeners = new Set<() => void>();

function emit() {
	listeners.forEach((listener) => listener());
}

function uid() {
	return crypto.randomUUID();
}

function canUseWebStorage() {
	return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStorage<T>(key: string): T | null {
	if (!canUseWebStorage()) return null;
	try {
		const raw = window.localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

function writeStorage(key: string, value: unknown) {
	if (!canUseWebStorage()) return;
	try {
		window.localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// cache is best-effort
	}
}

function removeStorage(key: string) {
	if (!canUseWebStorage()) return;
	try {
		window.localStorage.removeItem(key);
	} catch {
		// cache is best-effort
	}
}

function key(prefix: string, hotelId: string) {
	return `${prefix}:${hotelId}`;
}

function snapshotKey(hotelId: string) {
	return key(STATE_CACHE_PREFIX, hotelId);
}

function queueKey(hotelId: string) {
	return key(QUEUE_CACHE_PREFIX, hotelId);
}

function sortRooms(rooms: RoomRow[]) {
	return [...rooms].sort((left, right) => left.floor - right.floor || left.name.localeCompare(right.name, "fr", { numeric: true, sensitivity: "base" }));
}

function sortIssues(issues: IssueRow[]) {
	return [...issues].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
}

function sortStaff(staff: StaffRow[]) {
	const order: Record<StaffRow["role"], number> = { chambre: 0, gouvernante: 1, maintenance: 2, reception: 3 };
	return [...staff].sort((left, right) => order[left.role] - order[right.role] || left.name.localeCompare(right.name, "fr", { sensitivity: "base" }));
}

function sortActivityLogs(activityLogs: ActivityLogRow[]) {
	return [...activityLogs].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
}

function replaceRoom(nextRoom: RoomRow) {
	state = { ...state, rooms: sortRooms(state.rooms.some((room) => room.id === nextRoom.id) ? state.rooms.map((room) => (room.id === nextRoom.id ? nextRoom : room)) : [nextRoom, ...state.rooms]), lastSyncedAt: new Date().toISOString() };
	emit();
	schedulePersist();
}

function replaceIssue(nextIssue: IssueRow) {
	state = { ...state, issues: sortIssues(state.issues.some((issue) => issue.id === nextIssue.id) ? state.issues.map((issue) => (issue.id === nextIssue.id ? nextIssue : issue)) : [nextIssue, ...state.issues]), lastSyncedAt: new Date().toISOString() };
	emit();
	schedulePersist();
}

function replaceStaff(nextStaff: StaffRow) {
	state = { ...state, staff: sortStaff(state.staff.some((person) => person.id === nextStaff.id) ? state.staff.map((person) => (person.id === nextStaff.id ? nextStaff : person)) : [nextStaff, ...state.staff]), lastSyncedAt: new Date().toISOString() };
	emit();
	schedulePersist();
}

function replaceActivityLog(nextActivity: ActivityLogRow) {
	state = { ...state, activityLogs: sortActivityLogs(state.activityLogs.some((activity) => activity.id === nextActivity.id) ? state.activityLogs.map((activity) => (activity.id === nextActivity.id ? nextActivity : activity)) : [nextActivity, ...state.activityLogs]), lastSyncedAt: new Date().toISOString() };
	emit();
	schedulePersist();
}

function replaceHotel(nextHotel: HotelRow) {
	state = { ...state, hotel: nextHotel, hotelId: nextHotel.id, lastSyncedAt: new Date().toISOString() };
	emit();
	schedulePersist();
}

function mergeState(patch: Partial<HotelDataState>) {
	state = { ...state, ...patch };
	emit();
	schedulePersist();
}

function isNetworkFailure(error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	return /network|fetch|socket|timeout|timed out|failed to fetch|offline|ECONN|ENOTFOUND/i.test(message);
}

function schedulePersist() {
	if (!activeHotelId) return;
	if (persistTimer) clearTimeout(persistTimer);

	persistTimer = setTimeout(() => {
		persistTimer = null;
		if (!activeHotelId) return;
		writeStorage(snapshotKey(activeHotelId), state);
		writeStorage(queueKey(activeHotelId), queue);
		writeStorage(ACTIVE_HOTEL_KEY, activeHotelId);
		writeStorage(NOTIFY_KEY, state.notifyOn);
	}, 150);
}

function loadCachedState(hotelId: string) {
	const cachedState = readStorage<HotelDataState>(snapshotKey(hotelId));
	const cachedQueue = readStorage<PendingMutation[]>(queueKey(hotelId));
	if (cachedQueue) queue = cachedQueue;

	if (cachedState) {
		return { ...EMPTY_STATE, ...cachedState, hotelId, isHydrated: true, isLoading: true, isSyncing: true, rooms: sortRooms(cachedState.rooms ?? []), issues: sortIssues(cachedState.issues ?? []), staff: sortStaff(cachedState.staff ?? []), activityLogs: sortActivityLogs(cachedState.activityLogs ?? []) } satisfies HotelDataState;
	}

	return { ...EMPTY_STATE, hotelId, isHydrated: false, isLoading: true, isSyncing: true, notifyOn: readStorage<boolean>(NOTIFY_KEY) ?? false } satisfies HotelDataState;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fetchActiveHotel(requestedHotelId?: string | null) {
	if (requestedHotelId) {
		if (!UUID_RE.test(requestedHotelId)) throw new Error(`Invalid hotel ID: ${requestedHotelId}`);
		const { data, error } = await supabase.from("hotels").select("*").eq("id", requestedHotelId).maybeSingle();
		if (error) throw error;
		return (data as HotelRow | null) ?? null;
	}

	const cachedHotelId = canUseWebStorage() ? window.localStorage.getItem(ACTIVE_HOTEL_KEY) : null;
	if (cachedHotelId && UUID_RE.test(cachedHotelId)) {
		const { data, error } = await supabase.from("hotels").select("*").eq("id", cachedHotelId).maybeSingle();
		if (error) throw error;
		if (data) return data as HotelRow;
	} else if (cachedHotelId) {
		// Stale non-UUID value from old seed data — remove it
		window.localStorage.removeItem(ACTIVE_HOTEL_KEY);
	}

	const { data, error } = await supabase.from("hotels").select("*").order("created_at", { ascending: true }).limit(1);
	if (error) throw error;
	return (data?.[0] as HotelRow | undefined) ?? null;
}

async function fetchInitialData(hotelId: string) {
	const [roomsResult, issuesResult, staffResult, activityResult] = await Promise.all([
		supabase.from("rooms").select("*").eq("hotel_id", hotelId).order("floor", { ascending: true }).order("name", { ascending: true }),
		supabase.from("issues").select("*").eq("hotel_id", hotelId).order("created_at", { ascending: false }),
		supabase.from("staff").select("*").eq("hotel_id", hotelId).order("role", { ascending: true }).order("name", { ascending: true }),
		supabase.from("activity_logs").select("*").eq("hotel_id", hotelId).order("created_at", { ascending: false }).limit(100),
	]);

	const error = roomsResult.error || issuesResult.error || staffResult.error || activityResult.error;
	if (error) throw error;

	mergeState({ hotelId, rooms: sortRooms((roomsResult.data as RoomRow[] | null) ?? []), issues: sortIssues((issuesResult.data as IssueRow[] | null) ?? []), staff: sortStaff((staffResult.data as StaffRow[] | null) ?? []), activityLogs: sortActivityLogs((activityResult.data as ActivityLogRow[] | null) ?? []), isHydrated: true, isLoading: false, isSyncing: true, lastError: null, lastSyncedAt: new Date().toISOString() });
}

function cleanupRealtime() {
	if (activeChannel) {
		void supabase.removeChannel(activeChannel);
		activeChannel = null;
	}
}

function setupRealtime(hotelId: string) {
	cleanupRealtime();

	const channel = supabase
		.channel(`hotel-data:${hotelId}`)
		.on("postgres_changes", { event: "*", schema: "public", table: "hotels", filter: `id=eq.${hotelId}` }, (payload) => {
			if (payload.eventType !== "DELETE") replaceHotel(payload.new as HotelRow);
		})
		.on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `hotel_id=eq.${hotelId}` }, (payload) => {
			if (payload.eventType === "DELETE") {
				mergeState({ rooms: state.rooms.filter((room) => room.id !== (payload.old as { id: string }).id), lastSyncedAt: new Date().toISOString() });
				return;
			}
			replaceRoom(payload.new as RoomRow);
		})
		.on("postgres_changes", { event: "*", schema: "public", table: "issues", filter: `hotel_id=eq.${hotelId}` }, (payload) => {
			if (payload.eventType === "DELETE") {
				mergeState({ issues: state.issues.filter((issue) => issue.id !== (payload.old as { id: string }).id), lastSyncedAt: new Date().toISOString() });
				return;
			}
			replaceIssue(payload.new as IssueRow);
		})
		.on("postgres_changes", { event: "*", schema: "public", table: "staff", filter: `hotel_id=eq.${hotelId}` }, (payload) => {
			if (payload.eventType === "DELETE") {
				mergeState({ staff: state.staff.filter((person) => person.id !== (payload.old as { id: string }).id), lastSyncedAt: new Date().toISOString() });
				return;
			}
			replaceStaff(payload.new as StaffRow);
		})
		.on("postgres_changes", { event: "*", schema: "public", table: "activity_logs", filter: `hotel_id=eq.${hotelId}` }, (payload) => {
			if (payload.eventType === "DELETE") {
				mergeState({ activityLogs: state.activityLogs.filter((activity) => activity.id !== (payload.old as { id: string }).id), lastSyncedAt: new Date().toISOString() });
				return;
			}
			replaceActivityLog(payload.new as ActivityLogRow);
		});

	activeChannel = channel;
	void channel.subscribe((status) => {
		if (status === "SUBSCRIBED") {
			mergeState({ isSyncing: true });
			void flushPendingMutations(hotelId);
		}
		if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") mergeState({ isSyncing: false });
	});
}

async function bootstrapHotelData(requestedHotelId?: string | null) {
	if (bootstrappingPromise && activeHotelId === requestedHotelId) return bootstrappingPromise;

	bootstrappingPromise = (async () => {
		try {
			const hotel = await fetchActiveHotel(requestedHotelId ?? activeHotelId);
			if (!hotel) {
				mergeState({ ...EMPTY_STATE, isHydrated: true, isLoading: false, isSyncing: false, lastError: "Aucun hôtel trouvé dans la base de données. Vérifiez que le schéma SQL a été exécuté." });
				return;
			}

			activeHotelId = hotel.id;
			if (canUseWebStorage()) window.localStorage.setItem(ACTIVE_HOTEL_KEY, hotel.id);

			const cached = loadCachedState(hotel.id);
			state = { ...cached, hotel, hotelId: hotel.id, notifyOn: readStorage<boolean>(NOTIFY_KEY) ?? cached.notifyOn };
			emit();

			await fetchInitialData(hotel.id);
			writeStorage(snapshotKey(hotel.id), state);
			setupRealtime(hotel.id);
			await flushPendingMutations(hotel.id);
		} catch (error) {
			mergeState({ ...EMPTY_STATE, isHydrated: true, isLoading: false, isSyncing: false, lastError: error instanceof Error ? error.message : "Impossible de charger les données de l'hôtel." });
		}
	})().finally(() => {
		bootstrappingPromise = null;
	});

	return bootstrappingPromise;
}

async function flushPendingMutations(hotelId: string) {
	if (flushingPromise) return flushingPromise;

	flushingPromise = (async () => {
		queue = readStorage<PendingMutation[]>(queueKey(hotelId)) ?? queue;
		if (!queue.length) {
			mergeState({ isSyncing: false });
			return;
		}

		mergeState({ isSyncing: true });

		for (const mutation of [...queue]) {
			try {
				if (mutation.kind === "updateRoomStatus") {
					const { data, error } = await supabase.rpc("update_room_status", { p_hotel_id: mutation.payload.hotelId, p_room_id: mutation.payload.roomId, p_new_status: mutation.payload.newStatus, p_verifier_staff_id: mutation.payload.verifierId, p_actor_staff_id: mutation.payload.actorId });
					if (error) throw error;
					const returnedRoom = Array.isArray(data) ? (data[0] as RoomRow | undefined) : (data as RoomRow | null);
					if (returnedRoom) replaceRoom(returnedRoom);
				} else {
					const { data, error } = await supabase.rpc("report_issue", { p_hotel_id: mutation.payload.hotelId, p_room_id: mutation.payload.roomId, p_description: mutation.payload.description, p_photo_url: mutation.payload.photoUrl, p_assignee_staff_id: mutation.payload.assigneeId, p_actor_staff_id: mutation.payload.actorId });
					if (error) throw error;
					const returnedIssue = Array.isArray(data) ? (data[0] as IssueRow | undefined) : (data as IssueRow | null);
					if (returnedIssue) replaceIssue(returnedIssue);
				}
				queue = queue.filter((item) => item.id !== mutation.id);
			} catch (error) {
				if (!isNetworkFailure(error)) {
					mergeState({ lastError: error instanceof Error ? error.message : "Mutation failed." });
					queue = queue.filter((item) => item.id !== mutation.id);
				}
				break;
			}
		}

		writeStorage(queueKey(hotelId), queue);
		writeStorage(snapshotKey(hotelId), state);
		mergeState({ isSyncing: false });
	})().finally(() => {
		flushingPromise = null;
	});

	return flushingPromise;
}

async function updateRoomRow(roomId: string, patch: Partial<RoomRow>) {
	if (!state.hotelId) throw new Error("Hotel data has not finished loading yet.");
	const previous = state.rooms.find((room) => room.id === roomId);
	if (!previous) throw new Error("Room not found.");
	const optimistic = { ...previous, ...patch, updated_at: new Date().toISOString() } as RoomRow;
	replaceRoom(optimistic);
	const { error } = await supabase.from("rooms").update(patch).eq("id", roomId).eq("hotel_id", state.hotelId);
	if (error) {
		replaceRoom(previous);
		if (!isNetworkFailure(error)) throw error;
		mergeState({ lastError: "Synchronisation impossible, veuillez réessayer." });
	}
}

async function updateIssueRow(issueId: string, patch: Partial<IssueRow>) {
	if (!state.hotelId) throw new Error("Hotel data has not finished loading yet.");
	const previous = state.issues.find((issue) => issue.id === issueId);
	if (!previous) throw new Error("Issue not found.");
	const optimistic = { ...previous, ...patch, updated_at: new Date().toISOString() } as IssueRow;
	replaceIssue(optimistic);
	const { error } = await supabase.from("issues").update(patch).eq("id", issueId).eq("hotel_id", state.hotelId);
	if (error) {
		replaceIssue(previous);
		if (!isNetworkFailure(error)) throw error;
		mergeState({ lastError: "Synchronisation impossible, veuillez réessayer." });
	}
}

async function updateHotelName(nextName: string) {
	if (!state.hotelId || !state.hotel) return;
	const trimmed = nextName.trim();
	if (!trimmed || trimmed === state.hotel.name) return;
	const previous = state.hotel;
	replaceHotel({ ...previous, name: trimmed, updated_at: new Date().toISOString() });
	const { error } = await supabase.from("hotels").update({ name: trimmed }).eq("id", state.hotelId);
	if (error && !isNetworkFailure(error)) {
		replaceHotel(previous);
		throw error;
	}
}

async function createRoom(room: { id: string; name: string; floor: number; status: RoomStatus; note?: string; priority?: boolean }) {
	if (!state.hotelId) throw new Error("Hotel data has not finished loading yet.");
	const nextRoom: RoomRow = { id: room.id, hotel_id: state.hotelId, name: room.name, floor: room.floor, status: room.status, assignee_staff_id: null, verifier_staff_id: null, priority: room.priority ?? false, note: room.note ?? "", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
	replaceRoom(nextRoom);
	const { error } = await supabase.from("rooms").insert(nextRoom);
	if (error && !isNetworkFailure(error)) throw error;
}

async function saveRoom(room: { id: string; name: string; floor: number; status: RoomStatus; assignee?: string | null; verifier?: string | null; priority?: boolean; note?: string }) {
	const existing = state.rooms.find((item) => item.id === room.id);
	if (!existing) return createRoom({ id: room.id, name: room.name, floor: room.floor, status: room.status, note: room.note, priority: room.priority });
	if (!state.hotelId) throw new Error("Hotel data has not finished loading yet.");
	const patch: Partial<RoomRow> = { name: room.name, floor: room.floor, status: room.status, assignee_staff_id: room.assignee ?? null, verifier_staff_id: room.verifier ?? null, priority: room.priority ?? false, note: room.note ?? "", updated_at: new Date().toISOString() };
	replaceRoom({ ...existing, ...patch } as RoomRow);
	const { error } = await supabase.from("rooms").update(patch).eq("id", room.id).eq("hotel_id", state.hotelId);
	if (error) {
		replaceRoom(existing);
		if (!isNetworkFailure(error)) throw error;
		mergeState({ lastError: "Synchronisation impossible, veuillez réessayer." });
	}
}

async function deleteRoom(roomId: string) {
	if (!state.hotelId) throw new Error("Hotel data has not finished loading yet.");
	const previousRooms = state.rooms;
	const previousIssues = state.issues;
	mergeState({ rooms: previousRooms.filter((item) => item.id !== roomId), issues: previousIssues.filter((item) => item.room_id !== roomId) });
	const { error } = await supabase.from("rooms").delete().eq("id", roomId).eq("hotel_id", state.hotelId);
	if (error && !isNetworkFailure(error)) {
		state = { ...state, rooms: previousRooms, issues: previousIssues };
		emit();
		throw error;
	}
}

async function addStaff(name: string, role: StaffRole) {
	if (!state.hotelId) throw new Error("Hotel data has not finished loading yet.");
	const next: StaffRow = { id: uid(), hotel_id: state.hotelId, name: name.trim(), role, active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
	replaceStaff(next);
	const { error } = await supabase.from("staff").insert(next);
	if (error) {
		state = { ...state, staff: sortStaff(state.staff.filter((person) => person.id !== next.id)) };
		emit();
		if (!isNetworkFailure(error)) throw error;
		mergeState({ lastError: "Synchronisation impossible, veuillez réessayer." });
	}
}

async function deleteStaff(staffId: string) {
	if (!state.hotelId) throw new Error("Hotel data has not finished loading yet.");
	const previousRooms = state.rooms;
	const previousIssues = state.issues;
	const previousStaff = state.staff;
	const nextRooms = state.rooms.map((room) => ({ ...room, assignee_staff_id: room.assignee_staff_id === staffId ? null : room.assignee_staff_id, verifier_staff_id: room.verifier_staff_id === staffId ? null : room.verifier_staff_id }));
	const nextIssues = state.issues.map((issue) => ({ ...issue, assignee_staff_id: issue.assignee_staff_id === staffId ? null : issue.assignee_staff_id }));
	const nextStaff = state.staff.filter((person) => person.id !== staffId);
	state = { ...state, rooms: sortRooms(nextRooms), issues: sortIssues(nextIssues), staff: sortStaff(nextStaff), lastSyncedAt: new Date().toISOString() };
	emit();
	const { error } = await supabase.from("staff").delete().eq("id", staffId).eq("hotel_id", state.hotelId);
	if (error) {
		state = { ...state, rooms: previousRooms, issues: previousIssues, staff: previousStaff };
		emit();
		if (!isNetworkFailure(error)) throw error;
		mergeState({ lastError: "Synchronisation impossible, veuillez réessayer." });
	}
}

async function assignRoom(roomId: string, staffId: string | null) {
	await updateRoomRow(roomId, { assignee_staff_id: staffId });
}

async function assignVerifier(roomId: string, staffId: string | null) {
	await updateRoomRow(roomId, { verifier_staff_id: staffId });
}

async function togglePriority(roomId: string) {
	const previous = state.rooms.find((room) => room.id === roomId);
	if (!previous) return;
	await updateRoomRow(roomId, { priority: !previous.priority });
}

async function updateNote(roomId: string, note: string) {
	await updateRoomRow(roomId, { note });
}

async function assignIssue(issueId: string, staffId: string | null) {
	await updateIssueRow(issueId, { assignee_staff_id: staffId });
}

async function resolveIssue(issueId: string) {
	await updateIssueRow(issueId, { resolved: true, resolved_at: new Date().toISOString() });
}

async function updateRoomStatus(hotelId: string, roomId: string, newStatus: UpdateRoomStatusInput["newStatus"], verifierId: string | null, actorId: string | null) {
	await bootstrapHotelData(hotelId);
	const previous = state.rooms.find((room) => room.id === roomId);
	if (!previous) throw new Error("Room not found in local state.");
	const optimistic = { ...previous, status: newStatus, verifier_staff_id: newStatus === "controlee" ? verifierId : previous.verifier_staff_id, updated_at: new Date().toISOString() } as RoomRow;
	replaceRoom(optimistic);
	const mutation: PendingMutation = { id: uid(), kind: "updateRoomStatus", payload: { hotelId, roomId, newStatus, verifierId, actorId }, rollbackRoom: previous };
	queue = [...queue.filter((item) => item.id !== mutation.id), mutation];
	schedulePersist();
	try {
		const { data, error } = await supabase.rpc("update_room_status", { p_hotel_id: hotelId, p_room_id: roomId, p_new_status: newStatus, p_verifier_staff_id: verifierId, p_actor_staff_id: actorId });
		if (error) throw error;
		const returnedRoom = Array.isArray(data) ? (data[0] as RoomRow | undefined) : (data as RoomRow | null);
		if (returnedRoom) replaceRoom(returnedRoom);
		queue = queue.filter((item) => item.id !== mutation.id);
	} catch (error) {
		if (!isNetworkFailure(error)) {
			replaceRoom(previous);
			queue = queue.filter((item) => item.id !== mutation.id);
			writeStorage(queueKey(hotelId), queue);
			throw error;
		}
	}
	writeStorage(queueKey(hotelId), queue);
}

async function reportIssue(hotelId: string, roomId: string, description: string, photoUrl: string | null, assigneeId: string | null, actorId: string | null) {
	await bootstrapHotelData(hotelId);
	const tempIssueId = uid();
	const tempIssue: IssueRow = { id: tempIssueId, hotel_id: hotelId, room_id: roomId, description, photo_url: photoUrl, assignee_staff_id: assigneeId, resolved: false, resolved_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
	replaceIssue(tempIssue);
	const mutation: PendingMutation = { id: uid(), kind: "reportIssue", payload: { hotelId, roomId, description, photoUrl, assigneeId, actorId }, tempIssueId };
	queue = [...queue.filter((item) => item.id !== mutation.id), mutation];
	schedulePersist();
	try {
		const { data, error } = await supabase.rpc("report_issue", { p_hotel_id: hotelId, p_room_id: roomId, p_description: description, p_photo_url: photoUrl, p_assignee_staff_id: assigneeId, p_actor_staff_id: actorId });
		if (error) throw error;
		const returnedIssue = Array.isArray(data) ? (data[0] as IssueRow | undefined) : (data as IssueRow | null);
		if (returnedIssue) replaceIssue(returnedIssue);
		queue = queue.filter((item) => item.id !== mutation.id);
	} catch (error) {
		if (!isNetworkFailure(error)) {
			mergeState({ issues: state.issues.filter((issue) => issue.id !== tempIssueId) });
			queue = queue.filter((item) => item.id !== mutation.id);
			writeStorage(queueKey(hotelId), queue);
			throw error;
		}
	}
	writeStorage(queueKey(hotelId), queue);
}

async function renameHotel(nextName: string) {
	await updateHotelName(nextName);
}

async function resetLocalCache() {
	if (!state.hotelId) return;
	removeStorage(snapshotKey(state.hotelId));
	removeStorage(queueKey(state.hotelId));
	queue = [];
	await bootstrapHotelData(state.hotelId);
}

async function toggleNotify() {
	mergeState({ notifyOn: !state.notifyOn });
}

async function refreshHotelData(hotelId?: string | null) {
	await bootstrapHotelData(hotelId ?? activeHotelId);
}

function getSnapshot() {
	return state;
}

export function useHotelData(hotelId?: string | null) {
	const snapshot = useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, getSnapshot, getSnapshot);

	useEffect(() => {
		void bootstrapHotelData(hotelId ?? undefined);
	}, [hotelId]);

	return { ...snapshot, updateRoomStatus, reportIssue, saveRoom, createRoom, deleteRoom, addStaff, deleteStaff, assignRoom, assignVerifier, togglePriority, updateNote, assignIssue, resolveIssue, renameHotel, resetLocalCache, toggleNotify, refreshHotelData };
}

