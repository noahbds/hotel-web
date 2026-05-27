import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, Clock, AlertCircle, MapPin } from "lucide-react";

export const ENTRETIEN_TASKS = {
  literie: {
    label: "Literie",
    emoji: "🛏",
    tasks: [
      { key: "couettes", label: "Couettes" },
      { key: "draps", label: "Draps / housses" },
      { key: "oreillers", label: "Oreillers" },
      { key: "plaids", label: "Plaids" },
      { key: "coussins", label: "Coussins" },
    ],
  },
  sdb: {
    label: "Salle de bain",
    emoji: "🚿",
    tasks: [
      { key: "siphons_douches", label: "Siphons / évacuations douches" },
      { key: "frotter_carrelages", label: "Frotter carrelages SDB" },
      { key: "vmc_sdb", label: "VMC SDB" },
      { key: "seche_cheveux", label: "Poussières sèche-cheveux" },
      { key: "portes_sdb", label: "Lessiver portes SDB" },
    ],
  },
  chambre: {
    label: "Chambre",
    emoji: "🏠",
    tasks: [
      { key: "aspirateur", label: "Aspirateur" },
      { key: "poussieres", label: "Poussières" },
      { key: "lampes", label: "Lampes" },
      { key: "plinthes", label: "Plinthes CH et SDB" },
      { key: "vitres", label: "Vitres et toiles fenêtres" },
      { key: "stores", label: "Stores chambres" },
      { key: "placards", label: "Intérieur des placards" },
      { key: "teles", label: "Télés et télécommandes" },
      { key: "frigos", label: "Frigos intérieur" },
    ],
  },
  shampooing: {
    label: "Shampooing moquettes",
    emoji: "🧹",
    tasks: [{ key: "shampooing", label: "Shampooing moquette" }],
  },
};

const ZONES = [
  { key: "couloir_rdc", label: "Couloir RDC" },
  { key: "couloir_1er", label: "Couloir 1er étage" },
  { key: "couloir_2eme", label: "Couloir 2ème étage" },
  { key: "salle_pdjs", label: "Salle PDJS" },
  { key: "ascenseur", label: "Ascenseur" },
];

function daysSince(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function relativeDate(dateStr) {
  const days = daysSince(dateStr);
  if (days === null) return "Jamais";
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days} j`;
  if (days < 30) return `Il y a ${Math.floor(days / 7)} sem`;
  return `Il y a ${Math.floor(days / 30)} mois`;
}

function statusColor(dateStr) {
  const days = daysSince(dateStr);
  if (days === null || days > 30) return "red";
  if (days > 7) return "orange";
  return "green";
}

function StatusDot({ dateStr, size = "sm" }) {
  const color = statusColor(dateStr);
  const sizeClass = size === "sm" ? "w-2 h-2" : "w-3 h-3";
  return (
    <span
      className={`inline-block rounded-full flex-shrink-0 ${sizeClass} ${
        color === "green"
          ? "bg-emerald-400"
          : color === "orange"
          ? "bg-amber-400"
          : "bg-rose-400"
      }`}
    />
  );
}

function CategoryChips({ entretienLogs, roomId, zone }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(ENTRETIEN_TASKS).map(([catKey, cat]) => {
        const allKeys = cat.tasks.map((t) => t.key);
        const logs = entretienLogs.filter(
          (l) =>
            allKeys.includes(l.task_type) &&
            (roomId ? l.room_id === roomId : l.zone === zone)
        );
        const latest = logs[0]?.completed_at ?? null;
        const color = statusColor(latest);
        return (
          <span
            key={catKey}
            title={`${cat.label} — ${relativeDate(latest)}`}
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
              color === "green"
                ? "bg-emerald-100 text-emerald-700"
                : color === "orange"
                ? "bg-amber-100 text-amber-700"
                : "bg-rose-100 text-rose-700"
            }`}
          >
            <span>{cat.emoji}</span>
            <span>{cat.label}</span>
          </span>
        );
      })}
    </div>
  );
}

function TaskRow({ taskKey, taskLabel, logs, onLog, staffName }) {
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const latest = logs[0]?.completed_at ?? null;
  const color = statusColor(latest);
  const recent = logs.slice(0, 5);

  async function handleLog() {
    setLoading(true);
    try {
      await onLog(taskKey);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-white">
        <StatusDot dateStr={latest} size="md" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-stone-800 truncate">{taskLabel}</p>
          <p className={`text-xs ${color === "green" ? "text-emerald-600" : color === "orange" ? "text-amber-600" : "text-rose-500"}`}>
            {relativeDate(latest)}
          </p>
        </div>
        {logs.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-stone-400 hover:text-stone-600 p-1"
            type="button"
          >
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        )}
        <button
          onClick={handleLog}
          disabled={loading}
          type="button"
          className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 active:bg-emerald-100 disabled:opacity-50"
        >
          {loading ? "…" : "✓ Fait"}
        </button>
      </div>
      {expanded && recent.length > 0 && (
        <div className="bg-stone-50 border-t border-stone-100 px-4 py-2 space-y-1">
          {recent.map((log) => (
            <div key={log.id} className="flex items-center gap-2 text-xs text-stone-500">
              <CheckCircle2 size={11} className="text-emerald-400 flex-shrink-0" />
              <span>{new Date(log.completed_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</span>
              {log.completed_by_staff_id && staffName(log.completed_by_staff_id) && (
                <span className="text-stone-400">— {staffName(log.completed_by_staff_id)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RoomDetailSheet({ room, entretienLogs, staff, onLog, onClose, currentStaffId }) {
  const [openCats, setOpenCats] = useState({ literie: true, sdb: false, chambre: false, shampooing: false });

  function staffName(id) {
    return staff.find((s) => s.id === id)?.name ?? null;
  }

  function logsForTask(taskKey) {
    return entretienLogs.filter((l) => l.room_id === room.id && l.task_type === taskKey);
  }

  function handleLog(taskKey) {
    return onLog({ roomId: room.id, taskType: taskKey, zone: null, completedByStaffId: currentStaffId });
  }

  function toggleCat(catKey) {
    setOpenCats((prev) => ({ ...prev, [catKey]: !prev[catKey] }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onClick={onClose}
    >
      <div
        className="mt-auto bg-stone-50 rounded-t-3xl overflow-y-auto"
        style={{ maxHeight: "88vh", animation: "slideUp 0.25s ease" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-stone-50 z-10 px-5 pt-5 pb-3 border-b border-stone-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-stone-900">{room.name}</h2>
              <p className="text-sm text-stone-500">Étage {room.floor} · Entretien périodique</p>
            </div>
            <button
              onClick={onClose}
              type="button"
              className="w-8 h-8 flex items-center justify-center rounded-full bg-stone-200 text-stone-600 text-sm font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-5 space-y-3">
          {Object.entries(ENTRETIEN_TASKS).map(([catKey, cat]) => (
            <div key={catKey} className="rounded-2xl border border-stone-200 overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => toggleCat(catKey)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                <span className="text-base">{cat.emoji}</span>
                <span className="flex-1 font-semibold text-stone-800 text-sm">{cat.label}</span>
                {openCats[catKey] ? <ChevronUp size={16} className="text-stone-400" /> : <ChevronDown size={16} className="text-stone-400" />}
              </button>
              {openCats[catKey] && (
                <div className="px-3 pb-3 space-y-2 border-t border-stone-100">
                  {cat.tasks.map((task) => (
                    <TaskRow
                      key={task.key}
                      taskKey={task.key}
                      taskLabel={task.label}
                      logs={logsForTask(task.key)}
                      onLog={handleLog}
                      staffName={staffName}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ZoneDetailSheet({ zone, entretienLogs, staff, onLog, onClose, currentStaffId }) {
  const [openCats, setOpenCats] = useState({ literie: false, sdb: true, chambre: true, shampooing: true });

  function staffName(id) {
    return staff.find((s) => s.id === id)?.name ?? null;
  }

  function logsForTask(taskKey) {
    return entretienLogs.filter((l) => l.zone === zone.key && l.task_type === taskKey);
  }

  function handleLog(taskKey) {
    return onLog({ roomId: null, taskType: taskKey, zone: zone.key, completedByStaffId: currentStaffId });
  }

  function toggleCat(catKey) {
    setOpenCats((prev) => ({ ...prev, [catKey]: !prev[catKey] }));
  }

  const relevantCats = ["sdb", "chambre", "shampooing"];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onClick={onClose}
    >
      <div
        className="mt-auto bg-stone-50 rounded-t-3xl overflow-y-auto"
        style={{ maxHeight: "88vh", animation: "slideUp 0.25s ease" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-stone-50 z-10 px-5 pt-5 pb-3 border-b border-stone-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-stone-900">{zone.label}</h2>
              <p className="text-sm text-stone-500">Entretien périodique · Zone commune</p>
            </div>
            <button
              onClick={onClose}
              type="button"
              className="w-8 h-8 flex items-center justify-center rounded-full bg-stone-200 text-stone-600 text-sm font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-5 space-y-3">
          {relevantCats.map((catKey) => {
            const cat = ENTRETIEN_TASKS[catKey];
            return (
              <div key={catKey} className="rounded-2xl border border-stone-200 overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => toggleCat(catKey)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="text-base">{cat.emoji}</span>
                  <span className="flex-1 font-semibold text-stone-800 text-sm">{cat.label}</span>
                  {openCats[catKey] ? <ChevronUp size={16} className="text-stone-400" /> : <ChevronDown size={16} className="text-stone-400" />}
                </button>
                {openCats[catKey] && (
                  <div className="px-3 pb-3 space-y-2 border-t border-stone-100">
                    {cat.tasks.map((task) => (
                      <TaskRow
                        key={task.key}
                        taskKey={task.key}
                        taskLabel={task.label}
                        logs={logsForTask(task.key)}
                        onLog={handleLog}
                        staffName={staffName}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function EntretienTab({ rooms, entretienLogs, staff, onLog, currentStaffId }) {
  const [view, setView] = useState("rooms");
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [selectedZoneKey, setSelectedZoneKey] = useState(null);

  const floorGroups = useMemo(() => {
    const map = {};
    for (const room of rooms) {
      if (!map[room.floor]) map[room.floor] = [];
      map[room.floor].push(room);
    }
    return Object.entries(map)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([floor, floorRooms]) => ({ floor: Number(floor), rooms: floorRooms }));
  }, [rooms]);

  const overdueCount = useMemo(() => {
    let count = 0;
    const allKeys = Object.values(ENTRETIEN_TASKS).flatMap((c) => c.tasks.map((t) => t.key));
    for (const room of rooms) {
      for (const key of allKeys) {
        const latest = entretienLogs.find((l) => l.room_id === room.id && l.task_type === key);
        if (!latest || daysSince(latest.completed_at) > 30) count++;
      }
    }
    return count;
  }, [rooms, entretienLogs]);

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);
  const selectedZone = ZONES.find((z) => z.key === selectedZoneKey);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-stone-900">Entretien périodique</h2>
          {overdueCount > 0 && (
            <span className="text-xs font-bold bg-rose-500 text-white rounded-full px-2 py-0.5">
              {overdueCount}
            </span>
          )}
        </div>

        {/* View toggle */}
        <div className="flex gap-1 bg-stone-100 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setView("rooms")}
            className={`flex-1 text-sm font-medium py-1.5 rounded-lg transition-colors ${
              view === "rooms" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
            }`}
          >
            Par chambre
          </button>
          <button
            type="button"
            onClick={() => setView("zones")}
            className={`flex-1 text-sm font-medium py-1.5 rounded-lg transition-colors ${
              view === "zones" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
            }`}
          >
            Par zone
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-xs text-stone-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> &lt; 7 j</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> 7–30 j</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400 inline-block" /> &gt; 30 j ou jamais</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
        {view === "rooms" ? (
          floorGroups.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-8">Aucune chambre</p>
          ) : (
            floorGroups.map(({ floor, rooms: floorRooms }) => (
              <div key={floor}>
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">
                  Étage {floor}
                </p>
                <div className="space-y-2">
                  {floorRooms.map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => setSelectedRoomId(room.id)}
                      className="w-full text-left bg-white rounded-2xl border border-stone-200 px-4 py-3 active:bg-stone-50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-stone-900 text-sm">{room.name}</span>
                        <ChevronDown size={14} className="text-stone-400" />
                      </div>
                      <CategoryChips entretienLogs={entretienLogs} roomId={room.id} zone={null} />
                    </button>
                  ))}
                </div>
              </div>
            ))
          )
        ) : (
          <div className="space-y-2">
            {ZONES.map((zone) => (
              <button
                key={zone.key}
                type="button"
                onClick={() => setSelectedZoneKey(zone.key)}
                className="w-full text-left bg-white rounded-2xl border border-stone-200 px-4 py-3 active:bg-stone-50"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MapPin size={14} className="text-stone-400" />
                    <span className="font-semibold text-stone-900 text-sm">{zone.label}</span>
                  </div>
                  <ChevronDown size={14} className="text-stone-400" />
                </div>
                <CategoryChips entretienLogs={entretienLogs} roomId={null} zone={zone.key} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Room detail sheet */}
      {selectedRoom && (
        <RoomDetailSheet
          room={selectedRoom}
          entretienLogs={entretienLogs}
          staff={staff}
          onLog={onLog}
          onClose={() => setSelectedRoomId(null)}
          currentStaffId={currentStaffId}
        />
      )}

      {/* Zone detail sheet */}
      {selectedZone && (
        <ZoneDetailSheet
          zone={selectedZone}
          entretienLogs={entretienLogs}
          staff={staff}
          onLog={onLog}
          onClose={() => setSelectedZoneKey(null)}
          currentStaffId={currentStaffId}
        />
      )}
    </div>
  );
}
