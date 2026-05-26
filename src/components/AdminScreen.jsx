import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../services/supabase/client";
import {
  ArrowLeft, Shield, ShieldOff, User, LogOut, Check,
  Clock, Building2, UserCheck, UserX, RefreshCw, Crown,
} from "lucide-react";

const ROLES = {
  chambre:     { label: "Femme / valet de chambre", color: "bg-violet-100 text-violet-700" },
  gouvernante: { label: "Gouvernante",              color: "bg-amber-100 text-amber-700" },
  maintenance: { label: "Technicien maintenance",   color: "bg-orange-100 text-orange-700" },
  reception:   { label: "Réception",                color: "bg-teal-100 text-teal-700" },
};
const ROLE_KEYS = ["chambre", "gouvernante", "maintenance", "reception"];

export default function AdminScreen({ currentProfile, onClose, onSignOut }) {
  const [profiles, setProfiles] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // profile being edited
  const [tab, setTab] = useState("pending"); // "pending" | "active" | "all"
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: profs }, { data: htls }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("hotels").select("id, name").order("name"),
    ]);
    setProfiles((profs ?? []).filter((p) => p.id !== currentProfile.id));
    setHotels(htls ?? []);
    setLoading(false);
  }, [currentProfile.id]);

  useEffect(() => { void load(); }, [load]);

  // Realtime: watch for profile changes
  useEffect(() => {
    const channel = supabase
      .channel("admin-profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const assign = async (profileId, hotelId, role, isAdmin) => {
    const { error } = await supabase.rpc("assign_profile_to_hotel", {
      p_profile_id: profileId,
      p_hotel_id: hotelId,
      p_role: role,
      p_is_admin: isAdmin,
    });
    if (error) { showToast("Erreur : " + error.message); return false; }
    showToast("Compte assigné");
    setSelected(null);
    await load();
    return true;
  };

  const remove = async (profileId) => {
    const { error } = await supabase.rpc("remove_profile_from_hotel", { p_profile_id: profileId });
    if (error) { showToast("Erreur : " + error.message); return; }
    showToast("Compte retiré de l'hôtel");
    setSelected(null);
    await load();
  };

  const toggleAdmin = async (profileId) => {
    const { error } = await supabase.rpc("toggle_admin", { p_profile_id: profileId });
    if (error) { showToast("Erreur : " + error.message); return; }
    showToast("Statut admin modifié");
    await load();
  };

  const pending = profiles.filter((p) => !p.hotel_id && p.active);
  const active = profiles.filter((p) => p.hotel_id && p.active);
  const inactive = profiles.filter((p) => !p.active);

  const displayed = tab === "pending" ? pending : tab === "active" ? active : profiles;

  return (
    <div
      className="min-h-screen bg-stone-100 flex justify-center"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>
      <div className="w-full max-w-md bg-white min-h-screen relative flex flex-col shadow-xl">

        {/* Header */}
        <header className="sticky top-0 z-10 bg-white border-b border-stone-100 px-5 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center">
              <ArrowLeft size={18} className="text-stone-600" />
            </button>
            <div className="flex-1">
              <p className="text-[11px] uppercase tracking-widest text-stone-400 font-semibold">Administration</p>
              <h1 className="text-[20px] font-bold text-stone-800 leading-tight">Gestion des comptes</h1>
            </div>
            <button onClick={load} className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center">
              <RefreshCw size={16} className={`text-stone-500 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Stats */}
          <div className="flex gap-2 mt-3">
            <StatChip color="rose" count={pending.length} label="En attente" />
            <StatChip color="emerald" count={active.length} label="Actifs" />
            <StatChip color="stone" count={inactive.length} label="Inactifs" />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            {[["pending", "En attente"], ["active", "Actifs"], ["all", "Tous"]].map(([key, lbl]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex-1 py-2 rounded-xl text-[13px] font-semibold transition ${tab === key ? "bg-stone-800 text-white" : "text-stone-500 bg-stone-100"}`}>
                {lbl}
              </button>
            ))}
          </div>
        </header>

        {/* List */}
        <main className="flex-1 overflow-y-auto px-4 py-3 pb-24">
          {loading && displayed.length === 0 && (
            <p className="text-center text-stone-400 text-sm mt-12">Chargement…</p>
          )}
          {!loading && displayed.length === 0 && (
            <div className="text-center mt-12 px-6">
              <p className="text-stone-400 text-sm">
                {tab === "pending" ? "Aucun compte en attente d'attribution." : "Aucun compte dans cette catégorie."}
              </p>
            </div>
          )}
          {displayed.map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              hotels={hotels}
              onAssign={() => setSelected(p)}
              onRemove={() => remove(p.id)}
              onToggleAdmin={() => toggleAdmin(p.id)}
            />
          ))}
        </main>

        {/* My account + logout */}
        <div className="absolute bottom-0 inset-x-0 bg-white border-t border-stone-100 px-4 py-3 flex items-center gap-3">
          <Avatar src={currentProfile.avatar_url} name={currentProfile.name} size={9} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-stone-800 truncate">{currentProfile.name || currentProfile.email}</p>
            <p className="text-xs text-amber-600 flex items-center gap-1"><Crown size={11} /> Super admin</p>
          </div>
          <button onClick={onSignOut}
            className="flex items-center gap-1.5 text-[13px] text-stone-500 font-medium px-3 py-2 rounded-xl hover:bg-stone-100 transition">
            <LogOut size={15} /> Déconnexion
          </button>
        </div>

        {/* Assignment modal */}
        {selected && (
          <AssignModal
            profile={selected}
            hotels={hotels}
            onClose={() => setSelected(null)}
            onSave={assign}
          />
        )}

        {toast && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-sm px-4 py-2.5 rounded-full shadow-lg z-50 whitespace-nowrap">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- ProfileCard ---- */
function ProfileCard({ profile, onAssign, onRemove, onToggleAdmin }) {
  const [confirm, setConfirm] = useState(false);
  const RC = profile.role ? ROLES[profile.role] : null;

  return (
    <div className="bg-stone-50 rounded-2xl p-3.5 mb-2.5 border border-stone-100">
      <div className="flex items-center gap-3">
        <Avatar src={profile.avatar_url} name={profile.name || profile.email} size={11} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-stone-800 truncate text-sm">{profile.name || <span className="text-stone-400 italic">Nom non défini</span>}</p>
            {profile.is_admin && <Crown size={12} className="text-amber-500 shrink-0" />}
          </div>
          <p className="text-xs text-stone-400 truncate">{profile.email}</p>
          {RC && (
            <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full mt-1 ${RC.color}`}>
              {RC.label}
            </span>
          )}
          {profile.hotel_id && (
            <p className="text-[11px] text-stone-400 flex items-center gap-1 mt-0.5">
              <Building2 size={10} /> Assigné à l'hôtel
            </p>
          )}
          {!profile.hotel_id && (
            <p className="text-[11px] text-amber-600 flex items-center gap-1 mt-0.5">
              <Clock size={10} /> En attente d'attribution
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <button onClick={onAssign}
          className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-semibold py-2 rounded-xl bg-stone-800 text-white active:scale-95 transition">
          <UserCheck size={13} /> {profile.hotel_id ? "Modifier" : "Assigner"}
        </button>
        <button onClick={() => onToggleAdmin()}
          className={`flex items-center justify-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-xl transition active:scale-95 ${profile.is_admin ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-600"}`}>
          {profile.is_admin ? <Shield size={13} /> : <ShieldOff size={13} />}
          Admin
        </button>
        {profile.hotel_id && !confirm && (
          <button onClick={() => setConfirm(true)}
            className="flex items-center justify-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-xl bg-rose-50 text-rose-600 active:scale-95 transition">
            <UserX size={13} />
          </button>
        )}
        {confirm && (
          <>
            <button onClick={() => setConfirm(false)}
              className="text-[12px] font-medium text-stone-500 px-2 py-2">Annuler</button>
            <button onClick={() => { setConfirm(false); onRemove(); }}
              className="text-[12px] font-semibold text-white bg-rose-500 px-3 py-2 rounded-xl">Retirer</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ---- AssignModal ---- */
function AssignModal({ profile, hotels, onClose, onSave }) {
  const [hotelId, setHotelId] = useState(profile.hotel_id ?? (hotels[0]?.id ?? ""));
  const [role, setRole] = useState(profile.role ?? "chambre");
  const [isAdmin, setIsAdmin] = useState(profile.is_admin ?? false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!hotelId || !role) return;
    setSaving(true);
    await onSave(profile.id, hotelId, role, isAdmin);
    setSaving(false);
  };

  return (
    <div className="absolute inset-0 z-40 flex items-end">
      <div onClick={onClose} className="absolute inset-0 bg-black/30" />
      <div className="relative w-full bg-white rounded-t-3xl p-5 pb-8" style={{ animation: "slideUp .2s ease" }}>
        <div className="w-10 h-1 bg-stone-300 rounded-full mx-auto mb-4" />
        <div className="flex items-center gap-3 mb-5">
          <Avatar src={profile.avatar_url} name={profile.name || profile.email} size={11} />
          <div>
            <p className="font-bold text-stone-800">{profile.name || profile.email}</p>
            <p className="text-xs text-stone-400">{profile.email}</p>
          </div>
        </div>

        {/* Hotel selection */}
        <label className="text-xs text-stone-400 font-medium">Hôtel</label>
        <div className="mt-1 mb-4 space-y-1.5">
          {hotels.map((h) => (
            <button key={h.id} onClick={() => setHotelId(h.id)}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl border-2 transition text-left ${hotelId === h.id ? "border-stone-800 bg-stone-50" : "border-stone-100"}`}>
              <span className="text-sm font-medium text-stone-700 flex items-center gap-2">
                <Building2 size={15} className="text-stone-400" /> {h.name}
              </span>
              {hotelId === h.id && <Check size={15} className="text-stone-800" />}
            </button>
          ))}
        </div>

        {/* Role selection */}
        <label className="text-xs text-stone-400 font-medium">Rôle</label>
        <div className="grid grid-cols-2 gap-2 mt-1 mb-4">
          {ROLE_KEYS.map((rk) => (
            <button key={rk} onClick={() => setRole(rk)}
              className={`px-3 py-2.5 rounded-xl border-2 text-left transition text-[13px] font-medium text-stone-700 ${role === rk ? "border-stone-800 bg-stone-50" : "border-stone-100"}`}>
              {ROLES[rk].label}
            </button>
          ))}
        </div>

        {/* Admin toggle */}
        <button onClick={() => setIsAdmin(!isAdmin)}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 mb-5 transition ${isAdmin ? "border-amber-400 bg-amber-50" : "border-stone-100"}`}>
          <span className={`text-sm font-semibold flex items-center gap-2 ${isAdmin ? "text-amber-700" : "text-stone-600"}`}>
            <Crown size={15} /> Droits administrateur
          </span>
          <span className={`w-11 h-6 rounded-full relative transition shrink-0 ${isAdmin ? "bg-amber-400" : "bg-stone-200"}`}>
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${isAdmin ? "left-[22px]" : "left-0.5"}`} />
          </span>
        </button>

        <button onClick={save} disabled={!hotelId || !role || saving}
          className="w-full bg-stone-800 text-white font-semibold py-3.5 rounded-2xl disabled:opacity-40 active:scale-[0.98] transition flex items-center justify-center gap-2">
          {saving
            ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <><Check size={17} /> Confirmer l'attribution</>}
        </button>
      </div>
    </div>
  );
}

/* ---- Shared ---- */
function Avatar({ src, name, size = 10 }) {
  const initials = (name || "?").trim().split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const sz = `w-${size} h-${size}`;
  if (src) return <img src={src} alt={name} className={`${sz} rounded-full object-cover shrink-0`} />;
  return (
    <div className={`${sz} rounded-full bg-stone-200 flex items-center justify-center shrink-0`}>
      <span className="text-stone-600 font-bold text-xs">{initials}</span>
    </div>
  );
}

function StatChip({ color, count, label }) {
  const colors = {
    rose: "bg-rose-50 text-rose-700",
    emerald: "bg-emerald-50 text-emerald-700",
    stone: "bg-stone-100 text-stone-500",
  };
  return (
    <div className={`flex-1 rounded-xl px-2.5 py-1.5 ${colors[color]}`}>
      <p className="text-xl font-bold leading-none">{count}</p>
      <p className="text-[10px] font-medium mt-0.5">{label}</p>
    </div>
  );
}
