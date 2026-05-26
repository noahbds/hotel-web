import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../services/supabase/client";
import type { ProfileRow } from "../types/hotel";

export type { ProfileRow };

export interface AuthState {
	profile: ProfileRow | null;
	loading: boolean;
	updateProfile: (name: string, avatarUrl?: string | null) => Promise<void>;
	signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
	const [profile, setProfile] = useState<ProfileRow | null>(null);
	const [loading, setLoading] = useState(true);
	const userIdRef = useRef<string | null>(null);

	const loadProfile = useCallback(async (userId: string) => {
		const { data } = await supabase
			.from("profiles")
			.select("*")
			.eq("id", userId)
			.maybeSingle();
		setProfile((data as ProfileRow | null) ?? null);
		setLoading(false);
	}, []);

	useEffect(() => {
		supabase.auth.getSession().then(({ data: { session } }) => {
			if (session?.user) {
				userIdRef.current = session.user.id;
				void loadProfile(session.user.id);
			} else {
				setLoading(false);
			}
		});

		const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
			if (session?.user) {
				userIdRef.current = session.user.id;
				void loadProfile(session.user.id);
			} else {
				userIdRef.current = null;
				setProfile(null);
				setLoading(false);
			}
		});

		return () => subscription.unsubscribe();
	}, [loadProfile]);

	// Primary: realtime subscription for profile updates (admin assigns hotel/role)
	useEffect(() => {
		if (!profile?.id) return;
		const channel = supabase
			.channel(`profile-watch:${profile.id}`)
			.on(
				"postgres_changes",
				{ event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${profile.id}` },
				(payload) => { setProfile(payload.new as ProfileRow); },
			)
			.subscribe();
		return () => { void supabase.removeChannel(channel); };
	}, [profile?.id]);

	// Fallback: poll every 4 seconds while waiting for hotel assignment
	// Handles cases where realtime isn't configured on the profiles table
	useEffect(() => {
		if (!profile?.id || profile.hotel_id || profile.is_admin) return;
		const interval = setInterval(() => {
			if (userIdRef.current) void loadProfile(userIdRef.current);
		}, 4000);
		return () => clearInterval(interval);
	}, [profile?.id, profile?.hotel_id, profile?.is_admin, loadProfile]);

	const updateProfile = useCallback(async (name: string, avatarUrl?: string | null) => {
		const { data, error } = await supabase.rpc("update_my_profile", {
			p_name: name,
			...(avatarUrl !== undefined ? { p_avatar_url: avatarUrl } : {}),
		});
		if (error) throw error;
		const updated = Array.isArray(data) ? (data[0] as ProfileRow | undefined) : (data as ProfileRow | null);
		if (updated) setProfile(updated);
	}, []);

	const signOut = useCallback(async () => {
		await supabase.auth.signOut();
	}, []);

	return { profile, loading, updateProfile, signOut };
}
