import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Plus, Wrench, Bell, Check, X, Trash2, Pencil,
  Camera, BedDouble, ClipboardCheck, Sparkles, AlertTriangle,
  Building2, Image as ImageIcon, CheckCircle2, Clock,
  Users, UserPlus, User, Moon, Crown, LogOut, Settings, Lock,
  WifiOff, Star, ClipboardList,
} from "lucide-react";
import { useHotelData, setCurrentStaffId } from "../store/useHotelData";
import { supabase } from "../services/supabase/client";
import EntretienTab, { ENTRETIEN_TASKS } from "./EntretienTab";

/* ------------------------------------------------------------------ */
/*  Statuts                                                             */
/* ------------------------------------------------------------------ */
const STATUS = {
  sale: {
    label: "Sale", verb: "à nettoyer",
    dot: "bg-rose-500", solid: "bg-rose-500", text: "text-rose-700",
    bg: "bg-rose-50", border: "border-rose-200", Icon: AlertTriangle,
  },
  propre: {
    label: "Propre", verb: "nettoyée",
    dot: "bg-sky-500", solid: "bg-sky-500", text: "text-sky-700",
    bg: "bg-sky-50", border: "border-sky-200", Icon: Sparkles,
  },
  controlee: {
    label: "Contrôlée", verb: "prête",
    dot: "bg-emerald-500", solid: "bg-emerald-500", text: "text-emerald-700",
    bg: "bg-emerald-50", border: "border-emerald-200", Icon: ClipboardCheck,
  },
};
const ORDER = ["sale", "propre", "controlee"];
const nextStatus = (s) => ORDER[(ORDER.indexOf(s) + 1) % ORDER.length];

/* ------------------------------------------------------------------ */
/*  Rôles du personnel                                                  */
/* ------------------------------------------------------------------ */
const ROLES = {
  chambre:     { label: "Chambre",     full: "Femme / valet de chambre", bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  gouvernante: { label: "Gouvernante", full: "Gouvernante",              bg: "bg-amber-50",  text: "text-amber-700",  dot: "bg-amber-500" },
  maintenance: { label: "Maintenance", full: "Technicien maintenance",   bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
  reception:   { label: "Réception",   full: "Réception",                bg: "bg-teal-50",   text: "text-teal-700",   dot: "bg-teal-500" },
};
const ROLE_KEYS = ["chambre", "gouvernante", "maintenance", "reception"];
const CLEANING_ROLES = ["chambre", "gouvernante"];
const REPAIR_ROLES = ["maintenance"];
const VERIFY_ROLES = ["gouvernante", "reception"];

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */
const uid = () => crypto.randomUUID();

function sanitizeErrorMessage(msg) {
  if (!msg) return null;
  if (/violates|constraint|relation|syntax|42[A-Z0-9]{3}|ERROR:|SQLSTATE|socket|fetch|ECONN|ENOTFOUND/i.test(msg)) {
    return "Une erreur s'est produite. Veuillez réessayer.";
  }
  return msg;
}

const staffById = (data, id) => data.staff?.find((s) => s.id === id) || null;
const staffName = (data, id) => staffById(data, id)?.name || null;

function relTime(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

function compressImage(file, maxSize = 900, quality = 0.55) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Image invalide ou corrompue"));
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > height && width > maxSize) { height *= maxSize / width; width = maxSize; }
          else if (height > maxSize) { width *= maxSize / height; height = maxSize; }
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(width);
          canvas.height = Math.round(height);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (err) {
          reject(err);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function canSetStatus(profile, room, targetStatus) {
  if (!profile) return false;
  if (profile.is_admin || profile.role === "gouvernante") return true;
  const sid = profile.staff_id;
  if (!sid) return false;
  if (targetStatus === "controlee") return sid === room.verifier;
  if (targetStatus === "propre") return sid === room.assignee;
  // sale: reception or anyone assigned/verified can reset
  return profile.role === "reception" || sid === room.assignee || sid === room.verifier;
}

/* ================================================================== */
/*  APP                                                                 */
/* ================================================================== */
export default function App({ profile, onSignOut, onOpenAdmin }) {
  const hotel = useHotelData();

  // Keep the notification store in sync with the current user's staff_id
  useEffect(() => {
    setCurrentStaffId(profile?.staff_id ?? null);
    return () => setCurrentStaffId(null);
  }, [profile?.staff_id]);

  const canAssign = profile?.role === "gouvernante" || profile?.is_admin;
  const canVerify = profile?.role === "gouvernante" || profile?.is_admin;
  const [tab, setTab] = useState("rooms");
  const [openRoomId, setOpenRoomId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("all");
  const [toast, setToast] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => {
    if (hotel.lastError) showToast(sanitizeErrorMessage(hotel.lastError) ?? hotel.lastError);
  }, [hotel.lastError, showToast]);

  // In-app toasts for room assignment events (no push permission needed)
  useEffect(() => {
    const STATUS_LABELS = { sale: "Sale", propre: "Propre", controlee: "Contrôlée" };
    const handlers = {
      "hotel:assigned":         (e) => showToast(`Chambre ${e.detail.roomName} vous a été attribuée`),
      "hotel:verifier-assigned":(e) => showToast(`Chambre ${e.detail.roomName} — vérification assignée`),
      "hotel:verify-ready":     (e) => showToast(`Chambre ${e.detail.roomName} prête à vérifier`),
      "hotel:status-changed":   (e) => showToast(`Chambre ${e.detail.roomName} — ${STATUS_LABELS[e.detail.status] ?? e.detail.status}`),
    };
    Object.entries(handlers).forEach(([type, fn]) => window.addEventListener(type, fn));
    return () => Object.entries(handlers).forEach(([type, fn]) => window.removeEventListener(type, fn));
  }, [showToast]);

  // Online/offline tracking
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => { setOnline(false); showToast("Connexion perdue — mode hors ligne"); };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [showToast]);

  const data = useMemo(() => {
    const rooms = hotel.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      floor: room.floor,
      status: room.status,
      assignee: room.assignee_staff_id,
      verifier: room.verifier_staff_id,
      priority: room.priority,
      recouche: room.recouche ?? false,
      dnd: room.dnd ?? false,
      cleaningHour: room.cleaning_hour ?? "",
      note: room.note,
      updatedAt: new Date(room.updated_at).getTime(),
    }));
    const roomNameById = new Map(rooms.map((room) => [room.id, room.name]));

    return {
      hotelName: hotel.hotel?.name || "Hôtel Le Beffroi",
      staff: hotel.staff.map((person) => ({ id: person.id, name: person.name, role: person.role })),
      rooms,
      issues: hotel.issues.map((issue) => ({
        id: issue.id,
        roomId: issue.room_id,
        roomName: roomNameById.get(issue.room_id) || issue.room_id,
        desc: issue.description,
        photos: issue.photo_urls?.length ? issue.photo_urls : (issue.photo_url ? [issue.photo_url] : []),
        assignee: issue.assignee_staff_id,
        ts: new Date(issue.created_at).getTime(),
        resolved: issue.resolved,
      })),
      activity: hotel.activityLogs.map((activity) => ({
        id: activity.id,
        type: activity.type,
        status: activity.status,
        text: activity.text,
        ts: new Date(activity.created_at).getTime(),
      })),
      entretienLogs: hotel.entretienLogs,
      notifyOn: hotel.notifyOn,
      hotelId: hotel.hotelId,
    };
  }, [hotel.activityLogs, hotel.entretienLogs, hotel.hotel, hotel.hotelId, hotel.issues, hotel.notifyOn, hotel.rooms, hotel.staff]);

  const entretienOverdueCount = useMemo(() => {
    const allKeys = Object.values(ENTRETIEN_TASKS).flatMap((c) => c.tasks.map((t) => t.key));
    let count = 0;
    for (const room of data.rooms) {
      for (const key of allKeys) {
        const latest = (data.entretienLogs ?? []).find((l) => l.room_id === room.id && l.task_type === key);
        if (!latest) { count++; continue; }
        const days = Math.floor((Date.now() - new Date(latest.completed_at).getTime()) / 86400000);
        if (days > 30) count++;
      }
    }
    return count;
  }, [data.rooms, data.entretienLogs]);

  const openRoom = useMemo(
    () => data.rooms.find((room) => room.id === openRoomId) || null,
    [data.rooms, openRoomId],
  );

  const loading = !hotel.isHydrated || (hotel.isLoading && !hotel.hotelId && data.rooms.length === 0);

  const applyStatus = async (room, ns) => {
    if (ns === room.status) return;
    try {
      await hotel.updateRoomStatus(data.hotelId, room.id, ns, room.verifier, profile?.staff_id ?? null);
    } catch (e) { console.error(e);
      showToast("Mise à jour impossible");
    }
  };
  const cycleStatus = (room) => applyStatus(room, nextStatus(room.status));
  const setStatus = (room, ns) => applyStatus(room, ns);

  const saveRoom = async (room) => {
    const exists = data.rooms.some((r) => r.id === room.id);
    try {
      await hotel.saveRoom({
        id: room.id,
        name: room.name.trim(),
        floor: parseInt(room.floor, 10) || 1,
        status: room.status,
        assignee: room.assignee || null,
        verifier: room.verifier || null,
        priority: Boolean(room.priority),
        recouche: Boolean(room.recouche),
        dnd: Boolean(room.dnd),
        cleaningHour: room.cleaningHour ?? "",
        note: (room.note ?? "").trim(),
      });
      showToast(exists ? "Chambre modifiée" : "Chambre ajoutée");
    } catch (e) { console.error(e);
      showToast("Sauvegarde impossible");
    }
  };

  const deleteRoom = async (room) => {
    try {
      await hotel.deleteRoom(room.id);
      setOpenRoomId(null);
      showToast("Chambre supprimée");
    } catch (e) { console.error(e);
      showToast("Suppression impossible");
    }
  };

  const reportIssue = async (room, desc, photos, assignee) => {
    try {
      await hotel.reportIssue(data.hotelId, room.id, desc, photos, assignee || null, profile?.staff_id ?? null);
      showToast("Problème signalé");
    } catch (e) { console.error(e);
      showToast("Signalement impossible");
    }
  };

  const addStaff = async (name, role) => {
    try {
      await hotel.addStaff(name, role);
      showToast("Personne ajoutée");
    } catch (e) { console.error(e);
      showToast("Ajout impossible");
    }
  };

  const deleteStaff = async (id) => {
    try {
      await hotel.deleteStaff(id);
      showToast("Personne supprimée");
    } catch (e) { console.error(e);
      showToast("Suppression impossible");
    }
  };

  const assignRoom = async (room, staffId) => {
    try { await hotel.assignRoom(room.id, staffId); }
    catch (e) { console.error(e); showToast("Attribution impossible"); }
  };

  const assignVerifier = async (room, staffId) => {
    try { await hotel.assignVerifier(room.id, staffId); }
    catch (e) { console.error(e); showToast("Attribution impossible"); }
  };

  const togglePriority = async (room) => {
    try { await hotel.togglePriority(room.id); }
    catch (e) { console.error(e); showToast("Mise à jour impossible"); }
  };

  const toggleRecouche = async (room) => {
    try { await hotel.toggleRecouche(room.id); }
    catch (e) { console.error(e); showToast("Mise à jour impossible"); }
  };

  const toggleDnd = async (room) => {
    try { await hotel.toggleDnd(room.id); }
    catch (e) { console.error(e); showToast("Mise à jour impossible"); }
  };

  const setCleaningHour = async (room, hour) => {
    try { await hotel.setCleaningHour(room.id, hour); }
    catch (e) { console.error(e); showToast("Heure impossible à enregistrer"); }
  };

  const updateNote = async (room, note) => {
    try { await hotel.updateNote(room.id, note); }
    catch (e) { console.error(e); showToast("Note impossible à enregistrer"); }
  };

  const renameHotel = async (hotelName) => {
    try { await hotel.renameHotel(hotelName); }
    catch (e) { console.error(e); showToast("Nom impossible à enregistrer"); }
  };

  const resetData = async () => {
    try { await hotel.resetLocalCache(); showToast("Cache local réinitialisé"); }
    catch (e) { console.error(e); showToast("Réinitialisation impossible"); }
  };

  const clearActivity = async () => {
    try {
      await hotel.clearActivityLogs();
      showToast("Historique effacé");
    } catch (e) { console.error(e); showToast("Impossible de supprimer l'historique"); }
  };

  const logEntretien = async (input) => {
    try {
      await hotel.logEntretien({ ...input, hotelId: data.hotelId });
    } catch (e) { console.error(e); showToast("Enregistrement impossible"); }
  };

  const assignIssue = async (issue, staffId) => {
    try { await hotel.assignIssue(issue.id, staffId); }
    catch (e) { console.error(e); showToast("Attribution impossible"); }
  };

  const resolveIssue = async (issue) => {
    try { await hotel.resolveIssue(issue.id); showToast("Réparé"); }
    catch (e) { console.error(e); showToast("Mise à jour impossible"); }
  };

  const toggleNotify = async () => {
    if (!data.notifyOn && "Notification" in window) {
      const p = await Notification.requestPermission();
      if (p !== "granted") { showToast("Notifications refusées par le navigateur"); return; }
    }
    await hotel.toggleNotify();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100 text-stone-400"
        style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro', sans-serif" }}>
        Chargement…
      </div>
    );
  }

  const openIssues = data.issues.filter((i) => !i.resolved);
  const counts = ORDER.reduce((a, s) => ({ ...a, [s]: data.rooms.filter((r) => r.status === s).length }), {});
  const myAssignedCount = data.rooms.filter((r) => r.assignee === profile?.staff_id || r.verifier === profile?.staff_id).length;
  const toVerifyCount = data.rooms.filter((r) => r.status === "propre").length;

  return (
    <div className="min-h-screen bg-stone-100 flex justify-center"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif" }}>
      <div className="w-full max-w-md bg-stone-50 min-h-screen relative shadow-xl flex flex-col">

        {/* En-tête */}
        <header className="px-5 pt-6 pb-3 bg-white border-b border-stone-100 sticky top-0 z-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <button onClick={() => setShowProfile(true)} className="shrink-0">
                <UserAvatar src={profile?.avatar_url} name={profile?.name} size="w-9 h-9" />
              </button>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-widest text-stone-400 font-semibold">Ménage</p>
                <h1 className="text-[20px] font-bold text-stone-800 leading-tight truncate">{data.hotelName}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!online && (
                <span className="flex items-center gap-1 text-[11px] text-amber-600 bg-amber-50 px-2 py-1 rounded-full font-medium">
                  <WifiOff size={12} /> Hors ligne
                </span>
              )}
              {profile?.is_admin && (
                <button onClick={onOpenAdmin} aria-label="Administration"
                  className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center active:scale-95 transition">
                  <Crown size={17} className="text-amber-600" />
                </button>
              )}
              <button
                onClick={() => setTab("activity")}
                aria-label="Activité et notifications"
                className="relative w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center active:scale-95 transition">
                <Bell size={19} className="text-stone-600" />
                {openIssues.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-rose-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                    {openIssues.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="flex gap-2 mt-3">
            {ORDER.map((s) => {
              const C = STATUS[s];
              const showVerifyBadge = s === "propre" && toVerifyCount > 0 && (profile?.role === "gouvernante" || profile?.is_admin);
              return (
                <button key={s} onClick={() => { setTab("rooms"); setFilter(s); }}
                  className={`flex-1 rounded-2xl ${C.bg} ${C.border} border px-2.5 py-2 text-left active:scale-[0.97] transition relative`}>
                  {showVerifyBadge && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-sky-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                      {toVerifyCount}
                    </span>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${C.dot}`} />
                    <span className="text-[11px] text-stone-500 font-medium">{C.label}</span>
                  </div>
                  <p className={`text-2xl font-bold ${C.text} leading-none mt-0.5`}>{counts[s]}</p>
                </button>
              );
            })}
            {myAssignedCount > 0 && profile?.staff_id && (
              <button onClick={() => { setTab("rooms"); setFilter("mine"); }}
                className="flex-1 rounded-2xl bg-violet-50 border border-violet-200 px-2.5 py-2 text-left active:scale-[0.97] transition">
                <div className="flex items-center gap-1.5">
                  <Star size={10} className="text-violet-500 fill-violet-500" />
                  <span className="text-[11px] text-stone-500 font-medium">Mes ch.</span>
                </div>
                <p className="text-2xl font-bold text-violet-700 leading-none mt-0.5">{myAssignedCount}</p>
              </button>
            )}
          </div>
        </header>

        {/* Contenu */}
        <main className="flex-1 overflow-y-auto pb-28">
          {tab === "rooms" && (
            <RoomsTab
              data={data} filter={filter} setFilter={setFilter}
              onCycle={cycleStatus} onOpen={(room) => setOpenRoomId(room.id)}
              profile={profile}
            />
          )}
          {tab === "maintenance" && (
            <MaintenanceTab data={data} onResolve={resolveIssue} onAssign={assignIssue} />
          )}
          {tab === "team" && (
            <TeamTab data={data} onAdd={addStaff} onDelete={deleteStaff} />
          )}
          {tab === "activity" && (
            <ActivityTab data={data} onToggleNotify={toggleNotify} onRename={renameHotel} onReset={resetData} onClearActivity={clearActivity} profile={profile} />
          )}
          {tab === "entretien" && (
            <EntretienTab
              rooms={data.rooms}
              entretienLogs={data.entretienLogs ?? []}
              staff={data.staff}
              onLog={logEntretien}
              currentStaffId={profile?.staff_id ?? null}
            />
          )}
        </main>

        {tab === "rooms" && (
          <button
            onClick={() => setAdding(true)}
            aria-label="Ajouter une chambre"
            className="absolute bottom-24 right-5 w-14 h-14 rounded-full bg-stone-800 text-white flex items-center justify-center shadow-lg active:scale-90 transition z-20">
            <Plus size={26} />
          </button>
        )}

        <nav className="absolute bottom-0 inset-x-0 bg-white/90 backdrop-blur border-t border-stone-200 flex z-30"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <TabBtn active={tab === "rooms"} onClick={() => setTab("rooms")} Icon={BedDouble} label="Chambres" />
          <TabBtn active={tab === "maintenance"} onClick={() => setTab("maintenance")} Icon={Wrench} label="Maintenance" badge={openIssues.length} />
          <TabBtn active={tab === "entretien"} onClick={() => setTab("entretien")} Icon={ClipboardList} label="Entretien" badge={entretienOverdueCount > 0 ? entretienOverdueCount : 0} />
          <TabBtn active={tab === "team"} onClick={() => setTab("team")} Icon={Users} label="Équipe" />
          <TabBtn active={tab === "activity"} onClick={() => setTab("activity")} Icon={Bell} label="Activité" />
        </nav>

        {openRoom && (
          <RoomSheet
            room={openRoom} data={data} onClose={() => setOpenRoomId(null)}
            onSetStatus={setStatus} onSave={saveRoom} onDelete={deleteRoom}
            onReport={reportIssue} onAssign={assignRoom} onVerifier={assignVerifier}
            onTogglePriority={togglePriority} onToggleRecouche={toggleRecouche}
            onToggleDnd={toggleDnd} onCleaningHour={setCleaningHour} onNote={updateNote}
            issues={data.issues.filter((i) => i.roomId === openRoom.id && !i.resolved)}
            canAssign={canAssign} canVerify={canVerify} profile={profile}
            entretienLogs={(data.entretienLogs ?? []).filter((l) => l.room_id === openRoom.id)}
            onLogEntretien={logEntretien}
          />
        )}

        {showProfile && (
          <ProfileSheet
            profile={profile}
            onClose={() => setShowProfile(false)}
            onSignOut={onSignOut}
          />
        )}

        {adding && (
          <AddRoomSheet
            onClose={() => setAdding(false)}
            onSave={(r) => { saveRoom(r); setAdding(false); }}
          />
        )}

        {toast && (
          <button
            onClick={() => setToast(null)}
            className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-sm px-4 py-2.5 rounded-full shadow-lg z-50 whitespace-nowrap active:scale-95 transition"
            aria-live="polite"
            aria-label={`${toast} — toucher pour fermer`}>
            {toast}
          </button>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Onglet CHAMBRES                                                     */
/* ================================================================== */
function RoomsTab({ data, filter, setFilter, onCycle, onOpen, profile }) {
  const [q, setQ] = useState("");
  const myId = profile?.staff_id ?? null;
  const query = q.trim().toLowerCase();
  let rooms = data.rooms;
  if (filter === "mine") rooms = rooms.filter((r) => r.assignee === myId || r.verifier === myId);
  else if (filter === "depart") rooms = rooms.filter((r) => r.priority);
  else if (filter === "recouche") rooms = rooms.filter((r) => r.recouche);
  else if (filter === "dnd") rooms = rooms.filter((r) => r.dnd);
  else if (filter !== "all") rooms = rooms.filter((r) => r.status === filter);
  if (query) rooms = rooms.filter((r) => r.name.toLowerCase().includes(query));
  rooms = [...rooms].sort((a, b) => {
    // my rooms first, then priority, then floor/name
    const aMe = (a.assignee === myId || a.verifier === myId) ? 0 : 1;
    const bMe = (b.assignee === myId || b.verifier === myId) ? 0 : 1;
    if (aMe !== bMe) return aMe - bMe;
    return (b.priority ? 1 : 0) - (a.priority ? 1 : 0);
  });
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);
  const issueByRoom = (id) => data.issues.some((i) => i.roomId === id && !i.resolved);
  const departCount = data.rooms.filter((r) => r.priority).length;
  const recoucheCount = data.rooms.filter((r) => r.recouche).length;
  const dndCount = data.rooms.filter((r) => r.dnd).length;
  const myCount = myId ? data.rooms.filter((r) => r.assignee === myId || r.verifier === myId).length : 0;
  // progress per floor across ALL rooms (not just filtered)
  const floorProgress = (f) => {
    const all = data.rooms.filter((r) => r.floor === f);
    if (!all.length) return null;
    return { done: all.filter((r) => r.status === "controlee").length, total: all.length };
  };

  return (
    <div>
      <div className="px-5 pt-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une chambre…" maxLength={100}
          className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-stone-400" />
      </div>
      <div className="flex gap-2 px-5 py-3 overflow-x-auto">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>Toutes</Chip>
        {myCount > 0 && myId && (
          <Chip active={filter === "mine"} onClick={() => setFilter("mine")} dot="bg-violet-500">
            Mes chambres ({myCount})
          </Chip>
        )}
        {departCount > 0 && (
          <Chip active={filter === "depart"} onClick={() => setFilter("depart")} dot="bg-orange-500">
            Départs ({departCount})
          </Chip>
        )}
        {recoucheCount > 0 && (
          <Chip active={filter === "recouche"} onClick={() => setFilter("recouche")} dot="bg-indigo-500">
            Recouches ({recoucheCount})
          </Chip>
        )}
        {dndCount > 0 && (
          <Chip active={filter === "dnd"} onClick={() => setFilter("dnd")} dot="bg-rose-400">
            DND ({dndCount})
          </Chip>
        )}
        {ORDER.map((s) => (
          <Chip key={s} active={filter === s} onClick={() => setFilter(s)} dot={STATUS[s].dot}>
            {STATUS[s].label}
          </Chip>
        ))}
      </div>

      {rooms.length === 0 && (
        <p className="text-center text-stone-400 text-sm mt-16 px-8">
          {query ? "Aucune chambre ne correspond." : <>Aucune chambre ici. Touchez <span className="font-semibold">+</span> pour en ajouter une.</>}
        </p>
      )}

      {floors.map((f) => {
        const prog = floorProgress(f);
        const allDone = prog && prog.done === prog.total;
        return (
        <div key={f} className="mb-2">
          <div className="flex items-center gap-1.5 px-5 pt-3 pb-1">
            <Building2 size={13} className="text-stone-400" />
            <p className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold">Étage {f}</p>
            {prog && (
              <div className="flex items-center gap-1.5 ml-auto">
                <div className="w-16 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${allDone ? "bg-emerald-500" : "bg-sky-400"}`}
                    style={{ width: `${(prog.done / prog.total) * 100}%` }} />
                </div>
                <span className={`text-[10px] font-semibold ${allDone ? "text-emerald-600" : "text-stone-400"}`}>
                  {prog.done}/{prog.total}
                </span>
              </div>
            )}
          </div>
          <div className="px-3">
            {rooms.filter((r) => r.floor === f).map((room) => {
              const C = STATUS[room.status];
              const isAssignee = myId && room.assignee === myId;
              const isVerifier = myId && room.verifier === myId;
              const isMyRoom = isAssignee || isVerifier;
              return (
                <div key={room.id}
                  className={`flex items-center bg-white rounded-2xl mb-2 pl-4 pr-2 py-2.5 transition
                    ${isMyRoom ? "ring-2 ring-violet-300 bg-violet-50/30" : ""}
                    ${!isMyRoom && room.priority ? "ring-2 ring-orange-300" : ""}
                    ${!isMyRoom && !room.priority && room.recouche ? "ring-2 ring-indigo-200" : ""}
                    ${!isMyRoom && !room.priority && !room.recouche && room.dnd ? "ring-1 ring-rose-200" : ""}`}>
                  <button onClick={() => onOpen(room)} className="flex items-center flex-1 min-w-0 text-left">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center mr-3 shrink-0 relative ${isMyRoom ? "bg-violet-100" : "bg-stone-100"}`}>
                      <BedDouble size={20} className={isMyRoom ? "text-violet-600" : "text-stone-500"} />
                      {room.dnd && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full flex items-center justify-center">
                          <Moon size={9} className="text-white" />
                        </span>
                      )}
                      {isMyRoom && !room.dnd && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-violet-500 rounded-full flex items-center justify-center">
                          <Star size={8} className="text-white fill-white" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className={`font-semibold truncate ${isMyRoom ? "text-violet-900" : "text-stone-800"}`}>{room.name}</p>
                        {room.priority && (
                          <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-md shrink-0">DÉPART</span>
                        )}
                        {room.recouche && (
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded-md shrink-0">RECOUCHE</span>
                        )}
                        {room.dnd && (
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md shrink-0">DND</span>
                        )}
                        {isVerifier && !isAssignee && (
                          <span className="text-[10px] font-bold text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded-md shrink-0">VÉRIF.</span>
                        )}
                      </div>
                      <p className="text-xs text-stone-400 flex items-center gap-1 truncate">
                        {staffName(data, room.assignee)
                          ? <><User size={11} className="shrink-0" />{staffName(data, room.assignee)}</>
                          : C.verb}
                        {room.cleaningHour && !room.dnd && <span className="text-stone-400">· {room.cleaningHour}</span>}
                        {room.note ? <span className="text-stone-400">· 📝 {room.note}</span> : null}
                      </p>
                    </div>
                    {issueByRoom(room.id) && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md shrink-0">
                        <Wrench size={11} />
                      </span>
                    )}
                  </button>
                  {(() => {
                    const ns = nextStatus(room.status);
                    const canCycle = canSetStatus(profile, room, ns);
                    return (
                      <button onClick={() => canCycle && onCycle(room)}
                        disabled={!canCycle}
                        className={`shrink-0 flex items-center gap-1.5 ${C.bg} ${C.text} ${C.border} border rounded-full pl-2.5 pr-3 py-1.5 transition ${canCycle ? "active:scale-95" : "opacity-40 cursor-default"}`}>
                        {canCycle
                          ? <span className={`w-2 h-2 rounded-full ${C.dot}`} />
                          : <Lock size={11} />}
                        <span className="text-[13px] font-semibold">{C.label}</span>
                      </button>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      );
      })}
    </div>
  );
}

/* ================================================================== */
/*  Onglet MAINTENANCE                                                  */
/* ================================================================== */
function MaintenanceTab({ data, onResolve, onAssign }) {
  const issues = data.issues;
  const open = issues.filter((i) => !i.resolved);
  const done = issues.filter((i) => i.resolved);
  const [lightbox, setLightbox] = useState(null); // { photos, index }

  return (
    <div className="px-4 pt-4">
      {issues.length === 0 && (
        <div className="text-center mt-16 px-8">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 size={26} className="text-emerald-500" />
          </div>
          <p className="text-stone-500 text-sm">Aucun problème signalé.</p>
          <p className="text-stone-400 text-xs mt-1">Signalez un souci depuis la fiche d'une chambre.</p>
        </div>
      )}

      {open.length > 0 && (
        <>
          <SectionTitle>À traiter ({open.length})</SectionTitle>
          {open.map((i) => <IssueCard key={i.id} issue={i} data={data} onResolve={onResolve} onAssign={onAssign} onOpenLightbox={setLightbox} />)}
        </>
      )}
      {done.length > 0 && (
        <>
          <SectionTitle>Réparé ({done.length})</SectionTitle>
          {done.map((i) => <IssueCard key={i.id} issue={i} data={data} onOpenLightbox={setLightbox} />)}
        </>
      )}

      {lightbox && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <span className="text-white/60 text-sm">{lightbox.index + 1} / {lightbox.photos.length}</span>
            <button onClick={() => setLightbox(null)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
              <X size={18} className="text-white" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <button
              type="button"
              onClick={() => {
                if (lightbox.photos.length > 1) {
                  setLightbox({ ...lightbox, index: (lightbox.index + 1) % lightbox.photos.length });
                }
              }}
              className="max-h-full max-w-full rounded-xl"
              aria-label={lightbox.photos.length > 1 ? "Photo suivante" : "Photo"}
            >
              <img src={lightbox.photos[lightbox.index]} alt="" className="max-h-full max-w-full rounded-xl" />
            </button>
          </div>
          {lightbox.photos.length > 1 && (
            <div className="flex justify-center gap-2 pb-6">
              {lightbox.photos.map((_, idx) => (
                <button key={idx} onClick={() => setLightbox({ ...lightbox, index: idx })}
                  className={`w-2 h-2 rounded-full transition ${idx === lightbox.index ? "bg-white" : "bg-white/30"}`} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IssueCard({ issue, data, onResolve, onAssign, onOpenLightbox }) {
  const techs = data.staff.filter((s) => REPAIR_ROLES.includes(s.role));
  const assigned = staffName(data, issue.assignee);
  const firstPhoto = issue.photos?.[0] ?? null;
  const extraCount = (issue.photos?.length ?? 0) - 1;
  return (
    <div className={`bg-white rounded-2xl p-3 mb-2.5 flex gap-3 ${issue.resolved ? "opacity-60" : ""}`}>
      {firstPhoto ? (
        <button onClick={() => onOpenLightbox?.({ photos: issue.photos, index: 0 })} className="shrink-0 relative">
          <img src={firstPhoto} alt="" className="w-16 h-16 rounded-xl object-cover" />
          {extraCount > 0 && (
            <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
              +{extraCount}
            </span>
          )}
        </button>
      ) : (
        <div className="w-16 h-16 rounded-xl bg-stone-100 flex items-center justify-center shrink-0">
          <ImageIcon size={20} className="text-stone-300" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-stone-800">Chambre {issue.roomName}</span>
          <span className="text-[11px] text-stone-400 flex items-center gap-1"><Clock size={11} />{relTime(issue.ts)}</span>
        </div>
        <p className="text-sm text-stone-600 mt-0.5 break-words">{issue.desc}</p>

        {!issue.resolved && onAssign && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {techs.length === 0 && (
              <span className="text-[11px] text-stone-400">Aucun technicien dans l'équipe</span>
            )}
            {techs.map((t) => {
              const on = issue.assignee === t.id;
              return (
                <button key={t.id} onClick={() => onAssign(issue, on ? null : t.id)}
                  className={`text-[12px] font-medium px-2.5 py-1 rounded-full transition active:scale-95 ${
                    on ? "bg-orange-500 text-white" : "bg-orange-50 text-orange-700"}`}>
                  {t.name}
                </button>
              );
            })}
          </div>
        )}
        {issue.resolved && assigned && (
          <p className="text-[12px] text-stone-400 mt-1 flex items-center gap-1"><User size={11} />Réparé par {assigned}</p>
        )}

        {!issue.resolved && onResolve && (
          <button onClick={() => onResolve(issue)}
            className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full active:scale-95 transition">
            <Check size={14} /> Marquer réparé
          </button>
        )}
        {issue.resolved && (
          <span className="mt-2 ml-2 inline-flex items-center gap-1 text-[12px] text-emerald-600 font-medium">
            <CheckCircle2 size={13} /> Réparé
          </span>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Onglet ACTIVITÉ                                                     */
/* ================================================================== */
function ActivityTab({ data, onToggleNotify, onRename, onReset, onClearActivity, profile }) {
  const [hotelName, setHotelName] = useState(data.hotelName);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => { setHotelName(data.hotelName); }, [data.hotelName]);
  const iconFor = (e) => {
    if (e.type === "issue") return <Wrench size={16} className="text-amber-600" />;
    if (e.type === "resolved") return <CheckCircle2 size={16} className="text-emerald-600" />;
    if (e.type === "status") return <span className={`w-3 h-3 rounded-full ${STATUS[e.status]?.dot || "bg-stone-400"}`} />;
    if (e.type === "assign") return <User size={16} className="text-violet-500" />;
    if (e.type === "verify") return <ClipboardCheck size={16} className="text-emerald-500" />;
    return <Bell size={16} className="text-stone-400" />;
  };
  return (
    <div className="px-4 pt-4">
      <div className="bg-white rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 pr-3">
            <p className="font-semibold text-stone-800 text-[15px]">Notifications</p>
            <p className="text-xs text-stone-400 mt-0.5">Être alerté quand une chambre est prête ou qu'un problème est signalé.</p>
          </div>
          <button onClick={onToggleNotify}
            className={`w-12 h-7 rounded-full transition relative shrink-0 ${data.notifyOn ? "bg-emerald-500" : "bg-stone-200"}`}>
            <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${data.notifyOn ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
        {data.notifyOn && typeof Notification !== "undefined" && Notification.permission !== "granted" && (
          <p className="mt-2 text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
            Autorisez les notifications dans les réglages de votre navigateur pour les recevoir.
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl p-4 mb-4">
        <p className="font-semibold text-stone-800 text-[15px] mb-2">Réglages</p>
        <label className="text-xs text-stone-400 font-medium">Nom de l'hôtel</label>
        <input value={hotelName} onChange={(e) => setHotelName(e.target.value)} onBlur={() => onRename(hotelName)} maxLength={100}
          className="mt-1 mb-3 w-full bg-stone-100 rounded-xl px-3 py-2.5 outline-none" />
        {!confirmReset ? (
          <button onClick={() => setConfirmReset(true)}
            className="w-full text-rose-600 font-medium py-2 text-sm flex items-center justify-center gap-2">
            <Trash2 size={15} /> Réinitialiser le cache local
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setConfirmReset(false)}
              className="flex-1 bg-stone-100 text-stone-600 font-semibold py-2.5 rounded-xl text-sm">Annuler</button>
            <button onClick={() => { onReset(); setConfirmReset(false); }}
              className="flex-1 bg-rose-500 text-white font-semibold py-2.5 rounded-xl text-sm">Tout réinitialiser</button>
          </div>
        )}
        {profile?.is_admin && (
          <div className="mt-3">
            {!confirmClear ? (
              <button onClick={() => setConfirmClear(true)}
                className="w-full text-stone-700 font-medium py-2 text-sm flex items-center justify-center gap-2">
                <Trash2 size={15} /> Effacer l'historique
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setConfirmClear(false)}
                  className="flex-1 bg-stone-100 text-stone-600 font-semibold py-2.5 rounded-xl text-sm">Annuler</button>
                <button onClick={() => { onClearActivity?.(); setConfirmClear(false); }}
                  className="flex-1 bg-stone-800 text-white font-semibold py-2.5 rounded-xl text-sm">Confirmer</button>
              </div>
            )}
          </div>
        )}
      </div>

      <SectionTitle>Historique</SectionTitle>
      <div className="bg-white rounded-2xl overflow-hidden">
        {data.activity.map((e, idx) => (
          <div key={e.id} className={`flex items-center gap-3 px-4 py-3 ${idx > 0 ? "border-t border-stone-100" : ""}`}>
            <div className="w-7 flex justify-center shrink-0">{iconFor(e)}</div>
            <p className="flex-1 text-sm text-stone-700">{e.text}</p>
            <span className="text-[11px] text-stone-400 shrink-0">{relTime(e.ts)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Onglet ÉQUIPE                                                       */
/* ================================================================== */
function TeamTab({ data, onAdd, onDelete }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("chambre");
  const [confirmDel, setConfirmDel] = useState(null);

  const submit = () => {
    if (!name.trim()) return;
    onAdd(name, role);
    setName(""); setRole("chambre"); setAdding(false);
  };

  return (
    <div className="px-4 pt-4">
      <button onClick={() => setAdding(!adding)}
        className="w-full flex items-center justify-center gap-2 bg-stone-800 text-white font-semibold py-3 rounded-2xl active:scale-[0.98] transition mb-4">
        <UserPlus size={18} /> Ajouter une personne
      </button>

      {adding && (
        <div className="bg-white rounded-2xl p-4 mb-4">
          <label className="text-xs text-stone-400 font-medium">Nom</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={50}
            placeholder="Ex. : Sofia" onKeyDown={(e) => e.key === "Enter" && submit()}
            className="mt-1 mb-3 w-full bg-stone-100 rounded-xl px-3 py-2.5 outline-none" />
          <label className="text-xs text-stone-400 font-medium">Rôle</label>
          <div className="grid grid-cols-2 gap-2 mt-1 mb-4">
            {ROLE_KEYS.map((rk) => {
              const RC = ROLES[rk];
              const on = role === rk;
              return (
                <button key={rk} onClick={() => setRole(rk)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition text-left ${
                    on ? "border-stone-800 bg-stone-50" : "border-stone-100"}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${RC.dot}`} />
                  <span className="text-[13px] font-medium text-stone-700">{RC.full}</span>
                </button>
              );
            })}
          </div>
          <button onClick={submit} disabled={!name.trim()}
            className="w-full bg-stone-800 text-white font-semibold py-3 rounded-xl disabled:opacity-40 active:scale-[0.98] transition">
            Enregistrer
          </button>
        </div>
      )}

      {ROLE_KEYS.map((rk) => {
        const members = data.staff.filter((s) => s.role === rk);
        if (members.length === 0) return null;
        const RC = ROLES[rk];
        return (
          <div key={rk} className="mb-3">
            <p className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold px-1 mb-1.5 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${RC.dot}`} />{RC.full} ({members.length})
            </p>
            <div className="bg-white rounded-2xl overflow-hidden">
              {members.map((m, idx) => {
                const assignedRooms = data.rooms.filter((r) => r.assignee === m.id && r.status !== "controlee");
                const verifyRooms   = data.rooms.filter((r) => r.verifier === m.id && r.status === "propre");
                return (
                <div key={m.id} className={`flex items-center gap-3 px-4 py-3 ${idx > 0 ? "border-t border-stone-100" : ""}`}>
                  <div className={`w-9 h-9 rounded-full ${RC.bg} flex items-center justify-center shrink-0`}>
                    <User size={17} className={RC.text} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-stone-800 block">{m.name}</span>
                    {(assignedRooms.length > 0 || verifyRooms.length > 0) && (
                      <div className="flex gap-1.5 mt-0.5 flex-wrap">
                        {assignedRooms.length > 0 && (
                          <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-md">
                            {assignedRooms.length} chambre{assignedRooms.length > 1 ? "s" : ""}
                          </span>
                        )}
                        {verifyRooms.length > 0 && (
                          <span className="text-[10px] font-semibold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-md">
                            {verifyRooms.length} à vérifier
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {confirmDel === m.id ? (
                    <div className="flex gap-1.5">
                      <button onClick={() => setConfirmDel(null)}
                        className="text-[12px] font-medium text-stone-500 px-2 py-1">Annuler</button>
                      <button onClick={() => { onDelete(m.id); setConfirmDel(null); }}
                        className="text-[12px] font-semibold text-white bg-rose-500 px-2.5 py-1 rounded-full">Supprimer</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDel(m.id)} aria-label={`Supprimer ${m.name}`}
                      className="w-8 h-8 rounded-full hover:bg-stone-100 flex items-center justify-center">
                      <Trash2 size={15} className="text-stone-400" />
                    </button>
                  )}
                </div>
              );
              })}
            </div>
          </div>
        );
      })}

      {data.staff.length === 0 && (
        <p className="text-center text-stone-400 text-sm mt-12">Aucune personne. Ajoutez votre équipe ci-dessus.</p>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Fiche d'une chambre                                                 */
/* ================================================================== */
function RoomSheet({ room, data, onClose, onSetStatus, onSave, onDelete, onReport, onAssign, onVerifier, onTogglePriority, onToggleRecouche, onToggleDnd, onCleaningHour, onNote, issues, canAssign = true, canVerify = true, profile, entretienLogs = [], onLogEntretien }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(room.name);
  const [floor, setFloor] = useState(String(room.floor));
  const [note, setNote] = useState(room.note || "");
  const [showReport, setShowReport] = useState(false);
  const [desc, setDesc] = useState("");
  const [photos, setPhotos] = useState([]);
  const [tech, setTech] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const fileRef = useRef();

  const cleaners = data.staff.filter((s) => CLEANING_ROLES.includes(s.role));
  const verifiers = data.staff.filter((s) => VERIFY_ROLES.includes(s.role));
  const techs = data.staff.filter((s) => REPAIR_ROLES.includes(s.role));

  const handlePhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const canAdd = 4 - photos.length;
    if (canAdd <= 0) { e.target.value = ""; return; }
    try {
      const compressed = await Promise.all(files.slice(0, canAdd).map((f) => compressImage(f)));
      setPhotos((prev) => [...prev, ...compressed].slice(0, 4));
    } catch {
      // stays empty; user can retry
    }
    e.target.value = "";
  };

  const removePhoto = (idx) => setPhotos((prev) => prev.filter((_, i) => i !== idx));

  const submitEdit = () => {
    if (!name.trim()) return;
    onSave({ ...room, name: name.trim(), floor: parseInt(floor) || 1, note: note.trim() });
    setEditing(false);
  };

  const submitReport = () => {
    if (!desc.trim()) return;
    onReport(room, desc.trim(), photos, tech);
    setDesc(""); setPhotos([]); setTech(null); setShowReport(false);
  };

  const C = STATUS[room.status];

  return (
    <Sheet onClose={onClose}>
      {/* En-tête fiche */}
      <div className="flex items-center justify-between mb-4">
        {editing ? (
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={50}
            className="text-2xl font-bold text-stone-800 border-b-2 border-stone-300 outline-none w-32" />
        ) : (
          <h2 className="text-2xl font-bold text-stone-800">Chambre {room.name}</h2>
        )}
        <button onClick={() => (editing ? submitEdit() : setEditing(true))}
          aria-label={editing ? "Enregistrer les modifications" : "Modifier la chambre"}
          className="text-sm font-semibold text-sky-600 px-2 py-1">
          {editing ? "OK" : <Pencil size={18} />}
        </button>
      </div>

      {editing && (
        <div className="mb-4 space-y-3">
          <div>
            <label className="text-xs text-stone-400 font-medium">Étage</label>
            <input type="number" value={floor} onChange={(e) => setFloor(e.target.value)}
              className="mt-1 w-full bg-stone-100 rounded-xl px-3 py-2.5 outline-none" />
          </div>
          <div>
            <label className="text-xs text-stone-400 font-medium">Note / demande client</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500}
              placeholder="Ex. : lit bébé, allergie, arrivée tardive…"
              className="mt-1 w-full bg-stone-100 rounded-xl px-3 py-2.5 outline-none text-sm resize-none" />
          </div>
        </div>
      )}

      {/* --- Toggles opérationnels --- */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {/* Départ */}
        <button onClick={() => onTogglePriority(room)}
          className={`flex items-center justify-between rounded-2xl px-4 py-3 border-2 transition active:scale-[0.99] ${
            room.priority ? "bg-orange-50 border-orange-300" : "bg-white border-stone-200"}`}>
          <span className={`text-sm font-semibold ${room.priority ? "text-orange-700" : "text-stone-600"}`}>🚪 Départ</span>
          <ToggleDot on={room.priority} color="bg-orange-500" />
        </button>

        {/* Recouche */}
        <button onClick={() => onToggleRecouche(room)}
          className={`flex items-center justify-between rounded-2xl px-4 py-3 border-2 transition active:scale-[0.99] ${
            room.recouche ? "bg-indigo-50 border-indigo-300" : "bg-white border-stone-200"}`}>
          <span className={`text-sm font-semibold ${room.recouche ? "text-indigo-700" : "text-stone-600"}`}>🛏 Recouche</span>
          <ToggleDot on={room.recouche} color="bg-indigo-500" />
        </button>
      </div>

      {/* DND + heure de ménage */}
      <div className={`rounded-2xl border-2 mb-4 transition overflow-hidden ${room.dnd ? "bg-rose-50 border-rose-300" : "bg-white border-stone-200"}`}>
        <button onClick={() => onToggleDnd(room)} aria-label="Basculer ne pas déranger"
          className="w-full flex items-center justify-between px-4 py-3 active:scale-[0.99] transition">
          <span className={`text-sm font-semibold ${room.dnd ? "text-rose-700" : "text-stone-600"}`}>
            <Moon size={14} className="inline mr-1.5 -mt-0.5" />Ne pas déranger
          </span>
          <ToggleDot on={room.dnd} color="bg-rose-500" />
        </button>
        {!room.dnd && (
          <div className="px-4 pt-2.5 pb-3 flex items-center gap-2 border-t border-stone-100">
            <Clock size={13} className="text-stone-400 shrink-0" />
            <label className="text-xs text-stone-400 font-medium shrink-0">Heure souhaitée</label>
            <input
              type="time"
              value={room.cleaningHour || ""}
              onChange={(e) => onCleaningHour(room, e.target.value)}
              className="ml-auto bg-stone-100 rounded-lg px-2 py-1 text-sm outline-none w-28 text-right"
            />
          </div>
        )}
      </div>

      {/* Note (lecture rapide) */}
      {room.note && !editing && (
        <div className="mb-4 bg-stone-100 rounded-2xl px-4 py-3 text-sm text-stone-700">
          📝 {room.note}
        </div>
      )}

      {/* Sélecteur de statut */}
      <p className="text-xs uppercase tracking-wider text-stone-400 font-semibold mb-2">Statut</p>
      <div className="grid grid-cols-3 gap-2 mb-5">
        {ORDER.map((s) => {
          const SC = STATUS[s];
          const active = room.status === s;
          const canSet = canSetStatus(profile, room, s);
          return (
            <button key={s} onClick={() => canSet && !active && onSetStatus(room, s)}
              disabled={!canSet && !active}
              className={`rounded-2xl py-3 px-1 border-2 transition ${
                active
                  ? `${SC.solid} border-transparent text-white`
                  : canSet
                    ? `bg-white ${SC.border} ${SC.text} active:scale-95`
                    : "bg-stone-50 border-stone-100 text-stone-300 cursor-default"}`}>
              {!canSet && !active
                ? <Lock size={18} className="mx-auto mb-1 text-stone-300" />
                : <SC.Icon size={20} className="mx-auto mb-1" />}
              <span className="text-[13px] font-semibold block">{SC.label}</span>
            </button>
          );
        })}
      </div>

      {/* Assignée à */}
      <p className="text-xs uppercase tracking-wider text-stone-400 font-semibold mb-2">Assignée à</p>
      <div className="flex flex-wrap gap-1.5 mb-5">
        {!canAssign ? (
          <span className="text-[13px] text-stone-400">
            {room.assignee
              ? staffName(data, room.assignee)
              : <span className="italic">Non assignée</span>}
          </span>
        ) : cleaners.length === 0 ? (
          <span className="text-[13px] text-stone-400">Ajoutez du personnel dans l'onglet Équipe.</span>
        ) : (
          cleaners.map((p) => {
            const on = room.assignee === p.id;
            const RC = ROLES[p.role];
            return (
              <button key={p.id} onClick={() => onAssign(room, on ? null : p.id)}
                className={`flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-full transition active:scale-95 ${
                  on ? "bg-stone-800 text-white" : `${RC.bg} ${RC.text}`}`}>
                {on && <Check size={13} />}{p.name}
              </button>
            );
          })
        )}
      </div>

      {/* Vérifiée par */}
      <p className="text-xs uppercase tracking-wider text-stone-400 font-semibold mb-2">Vérifiée par</p>
      <div className="flex flex-wrap gap-1.5 mb-5">
        {!canVerify ? (
          <span className="text-[13px] text-stone-400">
            {room.verifier
              ? staffName(data, room.verifier)
              : <span className="italic">Non vérifiée</span>}
          </span>
        ) : verifiers.length === 0 ? (
          <span className="text-[13px] text-stone-400">Aucune gouvernante / réception dans l'équipe.</span>
        ) : (
          verifiers.map((p) => {
            const on = room.verifier === p.id;
            const RC = ROLES[p.role];
            return (
              <button key={p.id} onClick={() => onVerifier(room, on ? null : p.id)}
                className={`flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-full transition active:scale-95 ${
                  on ? "bg-emerald-600 text-white" : `${RC.bg} ${RC.text}`}`}>
                {on && <ClipboardCheck size={13} />}{p.name}
              </button>
            );
          })
        )}
      </div>

      {/* Problèmes ouverts */}
      {issues.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-3">
          <p className="text-[13px] font-semibold text-amber-800 flex items-center gap-1.5 mb-1">
            <Wrench size={14} /> Maintenance en attente
          </p>
          {issues.map((i) => (
            <p key={i.id} className="text-sm text-amber-700">• {i.desc}</p>
          ))}
        </div>
      )}

      {/* Signaler un problème */}
      {!showReport ? (
        <button onClick={() => setShowReport(true)}
          className="w-full flex items-center justify-center gap-2 bg-stone-100 text-stone-700 font-semibold py-3 rounded-2xl active:scale-[0.98] transition mb-3">
          <Wrench size={18} /> Signaler un problème
        </button>
      ) : (
        <div className="bg-stone-100 rounded-2xl p-3 mb-3">
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={1000}
            placeholder="Ex. : robinet qui fuit, ampoule grillée…" rows={2}
            className="w-full bg-white rounded-xl px-3 py-2.5 outline-none text-sm resize-none mb-2" />

          {techs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              <span className="text-[12px] text-stone-400 w-full">Confier à (optionnel) :</span>
              {techs.map((t) => {
                const on = tech === t.id;
                return (
                  <button key={t.id} onClick={() => setTech(on ? null : t.id)}
                    className={`text-[12px] font-medium px-2.5 py-1 rounded-full transition active:scale-95 ${
                      on ? "bg-orange-500 text-white" : "bg-orange-50 text-orange-700"}`}>
                    {t.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Vignettes des photos ajoutées */}
          {photos.length > 0 && (
            <div className="flex gap-2 mb-2 flex-wrap">
              {photos.map((p, idx) => (
                <div key={idx} className="relative">
                  <button onClick={() => setLightbox({ photos, index: idx })}>
                    <img src={p} alt="" className="w-14 h-14 rounded-lg object-cover" />
                  </button>
                  <button onClick={() => removePhoto(idx)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-stone-800 rounded-full flex items-center justify-center">
                    <X size={10} className="text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handlePhotos} className="hidden" />
          <div className="flex gap-2">
            <button onClick={() => fileRef.current?.click()} disabled={photos.length >= 4}
              className={`flex items-center gap-2 bg-white text-stone-600 text-sm font-medium px-3 py-2 rounded-xl ${photos.length >= 4 ? "opacity-40" : ""}`}>
              <Camera size={16} />
              {photos.length > 0 ? `${photos.length}/4` : "Photos"}
            </button>
            <button onClick={submitReport} disabled={!desc.trim()}
              className="flex-1 bg-stone-800 text-white text-sm font-semibold rounded-xl py-2 disabled:opacity-40 active:scale-[0.98] transition">
              Envoyer
            </button>
          </div>
        </div>
      )}

      {/* Entretien rapide */}
      <EntretienRapide
        roomId={room.id}
        entretienLogs={entretienLogs}
        onLog={onLogEntretien}
        currentStaffId={profile?.staff_id ?? null}
      />

      {/* Dernière mise à jour */}
      <p className="text-center text-[11px] text-stone-400 mb-2 flex items-center justify-center gap-1">
        <Clock size={11} /> Dernière mise à jour {relTime(room.updatedAt)}
      </p>

      {/* Supprimer */}
      {!confirmDel ? (
        <button onClick={() => setConfirmDel(true)}
          className="w-full flex items-center justify-center gap-2 text-rose-600 font-medium py-2.5 text-sm">
          <Trash2 size={16} /> Supprimer la chambre
        </button>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => setConfirmDel(false)}
            className="flex-1 bg-stone-100 text-stone-600 font-semibold py-2.5 rounded-2xl text-sm">Annuler</button>
          <button onClick={() => onDelete(room)}
            className="flex-1 bg-rose-500 text-white font-semibold py-2.5 rounded-2xl text-sm">Confirmer</button>
        </div>
      )}

      {/* Visionneuse photos inline */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col" onClick={() => setLightbox(null)}>
          <div className="flex items-center justify-end px-4 pt-4 pb-2">
            <button className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center" onClick={() => setLightbox(null)}>
              <X size={18} className="text-white" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => {
                if (lightbox.photos.length > 1) {
                  setLightbox({ ...lightbox, index: (lightbox.index + 1) % lightbox.photos.length });
                }
              }}
              className="max-h-full max-w-full rounded-xl"
              aria-label={lightbox.photos.length > 1 ? "Photo suivante" : "Photo"}
            >
              <img src={lightbox.photos[lightbox.index]} alt="" className="max-h-full max-w-full rounded-xl" />
            </button>
          </div>
          {lightbox.photos.length > 1 && (
            <div className="flex justify-center gap-2 pb-6">
              {lightbox.photos.map((_, idx) => (
                <button key={idx} onClick={(e) => { e.stopPropagation(); setLightbox({ ...lightbox, index: idx }); }}
                  className={`w-2 h-2 rounded-full transition ${idx === lightbox.index ? "bg-white" : "bg-white/30"}`} />
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ================================================================== */
/*  Entretien rapide (section dans la fiche chambre)                   */
/* ================================================================== */
const QUICK_TASKS = [
  { key: "couettes", label: "Couettes", emoji: "🛏" },
  { key: "draps", label: "Draps", emoji: "🛏" },
  { key: "siphons_douches", label: "Siphons", emoji: "🚿" },
  { key: "aspirateur", label: "Aspirateur", emoji: "🏠" },
];

function EntretienRapide({ roomId, entretienLogs, onLog, currentStaffId }) {
  const [loading, setLoading] = useState(null);

  function lastDone(taskKey) {
    return entretienLogs.find((l) => l.task_type === taskKey)?.completed_at ?? null;
  }

  function relativeDate(dateStr) {
    if (!dateStr) return "Jamais";
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
    if (days === 0) return "Auj.";
    if (days === 1) return "Hier";
    if (days < 7) return `${days} j`;
    if (days < 30) return `${Math.floor(days / 7)} sem`;
    return `${Math.floor(days / 30)} mois`;
  }

  function dotColor(dateStr) {
    if (!dateStr) return "bg-rose-400";
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
    if (days <= 7) return "bg-emerald-400";
    if (days <= 30) return "bg-amber-400";
    return "bg-rose-400";
  }

  async function handleLog(taskKey) {
    setLoading(taskKey);
    try {
      await onLog?.({ roomId, taskType: taskKey, zone: null, completedByStaffId: currentStaffId });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mb-4">
      <p className="text-xs uppercase tracking-wider text-stone-400 font-semibold mb-2">Entretien rapide</p>
      <div className="grid grid-cols-2 gap-2">
        {QUICK_TASKS.map(({ key, label, emoji }) => {
          const date = lastDone(key);
          const isLoading = loading === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleLog(key)}
              disabled={isLoading}
              className="flex items-center gap-2 bg-white border border-stone-200 rounded-2xl px-3 py-2.5 active:scale-[0.98] transition text-left disabled:opacity-60"
            >
              <span className="text-base shrink-0">{emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-stone-800 truncate">{label}</p>
                <div className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor(date)}`} />
                  <p className="text-[10px] text-stone-400">{relativeDate(date)}</p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-emerald-600 shrink-0">
                {isLoading ? "…" : "✓"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Ajout d'une chambre                                                 */
/* ================================================================== */
function AddRoomSheet({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [floor, setFloor] = useState("1");
  const inputRef = useRef(null);

  useEffect(() => {
    // Focus after slide-up animation completes to avoid browser auto-scroll/layout shift
    const t = setTimeout(() => {
      try { inputRef.current?.focus?.({ preventScroll: true }); } catch (e) { inputRef.current?.focus?.(); }
    }, 260);
    return () => clearTimeout(t);
  }, []);

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-2xl font-bold text-stone-800 mb-5">Nouvelle chambre</h2>
      <label className="text-xs text-stone-400 font-medium">Nom / numéro</label>
      <input ref={inputRef} value={name} onChange={(e) => setName(e.target.value)} maxLength={50}
        placeholder="Ex. : 305, Suite…"
        onKeyDown={(e) => e.key === "Enter" && name.trim() && onSave({ id: uid(), name: name.trim(), floor: parseInt(floor) || 1, status: "sale" })}
        className="mt-1 mb-4 w-full bg-stone-100 rounded-xl px-3 py-3 outline-none" />
      <label className="text-xs text-stone-400 font-medium">Étage</label>
      <input type="number" value={floor} onChange={(e) => setFloor(e.target.value)} min={0} max={99}
        className="mt-1 mb-6 w-full bg-stone-100 rounded-xl px-3 py-3 outline-none" />
      <button onClick={() => name.trim() && onSave({ id: uid(), name: name.trim(), floor: parseInt(floor) || 1, status: "sale" })}
        disabled={!name.trim()}
        className="w-full bg-stone-800 text-white font-semibold py-3.5 rounded-2xl disabled:opacity-40 active:scale-[0.98] transition">
        Ajouter
      </button>
    </Sheet>
  );
}

/* ================================================================== */
/*  Composants partagés                                                 */
/* ================================================================== */
function Sheet({ children, onClose }) {
  return (
    <div className="absolute inset-0 z-40 flex items-end">
      <div onClick={onClose} className="absolute inset-0 bg-black/30" />
      <div className="relative w-full bg-white rounded-t-3xl p-5 pb-8 max-h-[88%] overflow-y-auto"
        style={{ animation: "slideUp .25s ease" }}>
        <div className="w-10 h-1 bg-stone-300 rounded-full mx-auto mb-4" />
        <button onClick={onClose} aria-label="Fermer" className="absolute top-4 right-4 w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center">
          <X size={16} className="text-stone-500" />
        </button>
        {children}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, Icon, label, badge }) {
  return (
    <button onClick={onClick} className="flex-1 flex flex-col items-center gap-0.5 py-2.5 relative">
      <div className="relative">
        <Icon size={22} className={active ? "text-stone-800" : "text-stone-400"} />
        {badge > 0 && (
          <span className="absolute -top-1.5 -right-2 w-4 h-4 bg-rose-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
            {badge}
          </span>
        )}
      </div>
      <span className={`text-[10px] font-medium ${active ? "text-stone-800" : "text-stone-400"}`}>{label}</span>
    </button>
  );
}

function Chip({ active, onClick, children, dot }) {
  return (
    <button onClick={onClick}
      className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition ${
        active ? "bg-stone-800 text-white" : "bg-white text-stone-500 border border-stone-200"}`}>
      {dot && <span className={`w-2 h-2 rounded-full ${dot}`} />}
      {children}
    </button>
  );
}

function SectionTitle({ children }) {
  return <p className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold px-1 mb-2 mt-1">{children}</p>;
}

function UserAvatar({ src, name, size = "w-8 h-8" }) {
  const initials = (name || "?").trim().split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  if (src) return <img src={src} alt={name} className={`${size} rounded-full object-cover ring-2 ring-stone-100`} />;
  return (
    <div className={`${size} rounded-full bg-stone-200 flex items-center justify-center ring-2 ring-stone-100`}>
      <span className="text-stone-600 font-bold text-[11px]">{initials}</span>
    </div>
  );
}

function ProfileSheet({ profile, onClose, onSignOut }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.name || "");
  const [avatar, setAvatar] = useState(profile?.avatar_url || null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  const ROLE_LABELS = {
    chambre: "Femme / valet de chambre",
    gouvernante: "Gouvernante",
    maintenance: "Technicien maintenance",
    reception: "Réception",
  };

  const handleAvatar = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = 256; canvas.height = 256;
        canvas.getContext("2d").drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, 256, 256);
        setAvatar(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await supabase.rpc("update_my_profile", {
        p_name: name.trim(),
        ...(avatar !== profile?.avatar_url ? { p_avatar_url: avatar } : {}),
      });
      setEditing(false);
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  return (
    <Sheet onClose={onClose}>
      <div className="flex flex-col items-center mb-5">
        <div className="relative mb-3">
          <UserAvatar src={editing ? avatar : profile?.avatar_url} name={profile?.name} size="w-20 h-20" />
          {editing && (
            <>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatar} className="hidden" />
              <button onClick={() => fileRef.current?.click()}
                className="absolute bottom-0 right-0 w-7 h-7 bg-stone-800 rounded-full flex items-center justify-center shadow">
                <Camera size={13} className="text-white" />
              </button>
            </>
          )}
        </div>
        {editing ? (
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
            className="text-center text-xl font-bold text-stone-800 border-b-2 border-stone-300 outline-none w-48 pb-0.5" />
        ) : (
          <h2 className="text-xl font-bold text-stone-800">{profile?.name || profile?.email}</h2>
        )}
        <p className="text-sm text-stone-400 mt-0.5">{profile?.email}</p>
        {profile?.role && (
          <span className="mt-2 text-xs font-medium bg-stone-100 text-stone-600 px-2.5 py-1 rounded-full">
            {ROLE_LABELS[profile.role] ?? profile.role}
          </span>
        )}
        {profile?.is_admin && (
          <span className="mt-1.5 text-xs font-semibold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full flex items-center gap-1">
            <Crown size={11} /> Administrateur
          </span>
        )}
      </div>

      {!editing ? (
        <button onClick={() => setEditing(true)}
          className="w-full flex items-center justify-center gap-2 bg-stone-100 text-stone-700 font-semibold py-3 rounded-2xl active:scale-[0.98] transition mb-3">
          <Settings size={16} /> Modifier mon profil
        </button>
      ) : (
        <div className="flex gap-2 mb-3">
          <button onClick={() => { setEditing(false); setName(profile?.name || ""); setAvatar(profile?.avatar_url || null); }}
            className="flex-1 bg-stone-100 text-stone-600 font-semibold py-3 rounded-2xl text-sm">Annuler</button>
          <button onClick={save} disabled={!name.trim() || saving}
            className="flex-1 bg-stone-800 text-white font-semibold py-3 rounded-2xl text-sm disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Check size={14} /> Enregistrer</>}
          </button>
        </div>
      )}

      <button onClick={onSignOut}
        className="w-full flex items-center justify-center gap-2 text-rose-600 font-semibold py-3 rounded-2xl active:scale-[0.98] transition">
        <LogOut size={16} /> Se déconnecter
      </button>
    </Sheet>
  );
}

function ToggleDot({ on, color }) {
  return (
    <span className={`w-11 h-6 rounded-full relative transition shrink-0 ${on ? color : "bg-stone-200"}`}>
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </span>
  );
}
