import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, Clock, AlertCircle, MapPin, Activity, Settings, X, RotateCcw } from "lucide-react";

function resolveFreq(taskKey, defaultDays, freqOverrides) {
  return freqOverrides[taskKey] ?? defaultDays;
}

export const ENTRETIEN_TASKS = {
  literie: {
    label: "Literie",
    emoji: "🛏",
    tasks: [
      { key: "couettes", label: "Couettes", frequencyDays: 30 },
      { key: "draps", label: "Draps / housses", frequencyDays: 7 },
      { key: "oreillers", label: "Oreillers", frequencyDays: 30 },
      { key: "plaids", label: "Plaids", frequencyDays: 30 },
      { key: "coussins", label: "Coussins", frequencyDays: 30 },
    ],
  },
  sdb: {
    label: "Salle de bain",
    emoji: "🚿",
    tasks: [
      { key: "siphons_douches", label: "Siphons / évacuations douches", frequencyDays: 14 },
      { key: "frotter_carrelages", label: "Frotter carrelages SDB", frequencyDays: 7 },
      { key: "vmc_sdb", label: "VMC SDB", frequencyDays: 30 },
      { key: "seche_cheveux", label: "Poussières sèche-cheveux", frequencyDays: 30 },
      { key: "portes_sdb", label: "Lessiver portes SDB", frequencyDays: 30 },
    ],
  },
  chambre: {
    label: "Chambre",
    emoji: "🏠",
    tasks: [
      { key: "aspirateur", label: "Aspirateur", frequencyDays: 7 },
      { key: "poussieres", label: "Poussières", frequencyDays: 7 },
      { key: "lampes", label: "Lampes", frequencyDays: 30 },
      { key: "plinthes", label: "Plinthes CH et SDB", frequencyDays: 30 },
      { key: "vitres", label: "Vitres et toiles fenêtres", frequencyDays: 30 },
      { key: "stores", label: "Stores chambres", frequencyDays: 30 },
      { key: "placards", label: "Intérieur des placards", frequencyDays: 30 },
      { key: "teles", label: "Télés et télécommandes", frequencyDays: 14 },
      { key: "frigos", label: "Frigos intérieur", frequencyDays: 30 },
    ],
  },
  shampooing: {
    label: "Shampooing moquettes",
    emoji: "🧹",
    tasks: [{ key: "shampooing", label: "Shampooing moquette", frequencyDays: 90 }],
  },
};

export const ZONE_TASKS = {
  sols: {
    label: "Sols",
    emoji: "🧹",
    tasks: [
      { key: "z_balayage", label: "Balayage / aspiration", frequencyDays: 2 },
      { key: "z_lavage_sol", label: "Lavage sol", frequencyDays: 7 },
      { key: "z_shampooing_moquette", label: "Shampooing moquette", frequencyDays: 30 },
    ],
  },
  surfaces: {
    label: "Surfaces",
    emoji: "✨",
    tasks: [
      { key: "z_poussieres", label: "Poussières (meubles, cadres)", frequencyDays: 7 },
      { key: "z_plinthes", label: "Plinthes", frequencyDays: 30 },
      { key: "z_portes_poignees", label: "Portes et poignées", frequencyDays: 7 },
      { key: "z_interrupteurs", label: "Interrupteurs / plaques", frequencyDays: 30 },
    ],
  },
  vitrerie: {
    label: "Vitrerie",
    emoji: "🪟",
    tasks: [
      { key: "z_vitres", label: "Vitres et fenêtres", frequencyDays: 30 },
      { key: "z_miroirs", label: "Miroirs / parois vitrées", frequencyDays: 7 },
    ],
  },
  luminaires: {
    label: "Luminaires",
    emoji: "💡",
    tasks: [
      { key: "z_lampes", label: "Lampes et appliques", frequencyDays: 30 },
      { key: "z_plafond", label: "Plafond et coins", frequencyDays: 30 },
    ],
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

function statusColor(dateStr, frequencyDays = 30) {
  const days = daysSince(dateStr);
  if (days === null || days > frequencyDays) return "red";
  if (days > frequencyDays / 2) return "orange";
  return "green";
}

function StatusDot({ dateStr, frequencyDays = 30, size = "sm" }) {
  const color = statusColor(dateStr, frequencyDays);
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

function roomStats(room, entretienLogs, freqOverrides = {}) {
  const allTasks = Object.values(ENTRETIEN_TASKS).flatMap((c) => c.tasks);
  const total = allTasks.length;
  let green = 0, amber = 0, red = 0;
  let lastActivityDate = null;

  for (const task of allTasks) {
    const freq = resolveFreq(task.key, task.frequencyDays, freqOverrides);
    const log = entretienLogs.find((l) => l.room_id === room.id && l.task_type === task.key);
    if (log) {
      if (!lastActivityDate || new Date(log.completed_at) > new Date(lastActivityDate)) {
        lastActivityDate = log.completed_at;
      }
      const d = daysSince(log.completed_at);
      if (d <= freq / 2) green++;
      else if (d <= freq) amber++;
      else red++;
    } else {
      red++;
    }
  }

  return { total, green, amber, red, lastActivityDate };
}

function formatDateTime(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${h}:${m}`;
}

function RoomSummaryCard({ room, entretienLogs, freqOverrides, onClick }) {
  const stats = useMemo(() => roomStats(room, entretienLogs, freqOverrides), [room, entretienLogs, freqOverrides]);
  const { total, green, amber, red, lastActivityDate } = stats;

  const healthLabel = red === 0 && amber === 0
    ? { text: "À jour", cls: "bg-emerald-100 text-emerald-700" }
    : red > total * 0.4
    ? { text: "Urgent", cls: "bg-rose-100 text-rose-700" }
    : { text: "Attention", cls: "bg-amber-100 text-amber-700" };

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white rounded-2xl border border-stone-200 px-4 py-3 active:bg-stone-50 space-y-2.5"
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="font-semibold text-stone-900 text-sm">{room.name}</span>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${healthLabel.cls}`}>
            {healthLabel.text}
          </span>
          <ChevronDown size={14} className="text-stone-400" />
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex rounded-full overflow-hidden h-2 gap-px bg-stone-100">
        {green > 0 && (
          <div className="bg-emerald-400 rounded-full" style={{ flex: green }} />
        )}
        {amber > 0 && (
          <div className="bg-amber-400 rounded-full" style={{ flex: amber }} />
        )}
        {red > 0 && (
          <div className="bg-rose-400 rounded-full" style={{ flex: red }} />
        )}
      </div>

      {/* Score row */}
      <div className="flex items-center gap-3 text-[11px]">
        <span className="flex items-center gap-1 text-emerald-600 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />{green} récents
        </span>
        {amber > 0 && (
          <span className="flex items-center gap-1 text-amber-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{amber} anciens
          </span>
        )}
        {red > 0 && (
          <span className="flex items-center gap-1 text-rose-500 font-medium">
            <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />{red} en retard
          </span>
        )}
        <span className="ml-auto text-stone-400">{green + amber}/{total}</span>
      </div>

      {/* Category chips */}
      <CategoryChips entretienLogs={entretienLogs} roomId={room.id} zone={null} freqOverrides={freqOverrides} />

      {/* Last activity */}
      <div className="flex items-center gap-1.5 text-[11px] text-stone-400">
        <Activity size={11} className="flex-shrink-0" />
        {lastActivityDate
          ? <span>Dernière activité : <span className="text-stone-600 font-medium">{formatDateTime(lastActivityDate)}</span></span>
          : <span className="italic">Aucune activité enregistrée</span>
        }
      </div>
    </button>
  );
}

function CategoryChips({ entretienLogs, roomId, zone, taskDefs = ENTRETIEN_TASKS, freqOverrides = {} }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(taskDefs).map(([catKey, cat]) => {
        let worstColor = "green";
        for (const task of cat.tasks) {
          const log = entretienLogs.find(
            (l) =>
              l.task_type === task.key &&
              (roomId ? l.room_id === roomId : l.zone === zone)
          );
          const freq = resolveFreq(task.key, task.frequencyDays, freqOverrides);
          const c = statusColor(log?.completed_at ?? null, freq);
          if (c === "red") { worstColor = "red"; break; }
          if (c === "orange") worstColor = "orange";
        }
        const color = worstColor;
        return (
          <span
            key={catKey}
            title={cat.label}
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

function zoneStats(zoneKey, entretienLogs, freqOverrides = {}) {
  const allTasks = Object.values(ZONE_TASKS).flatMap((c) => c.tasks);
  const total = allTasks.length;
  let green = 0, amber = 0, red = 0;
  let lastActivityDate = null;

  for (const task of allTasks) {
    const freq = resolveFreq(task.key, task.frequencyDays, freqOverrides);
    const log = entretienLogs.find((l) => l.zone === zoneKey && l.task_type === task.key);
    if (log) {
      if (!lastActivityDate || new Date(log.completed_at) > new Date(lastActivityDate)) {
        lastActivityDate = log.completed_at;
      }
      const d = daysSince(log.completed_at);
      if (d <= freq / 2) green++;
      else if (d <= freq) amber++;
      else red++;
    } else {
      red++;
    }
  }

  return { total, green, amber, red, lastActivityDate };
}

function ZoneSummaryCard({ zone, entretienLogs, freqOverrides, onClick }) {
  const stats = useMemo(() => zoneStats(zone.key, entretienLogs, freqOverrides), [zone, entretienLogs, freqOverrides]);
  const { total, green, amber, red, lastActivityDate } = stats;

  const healthLabel = red === 0 && amber === 0
    ? { text: "À jour", cls: "bg-emerald-100 text-emerald-700" }
    : red > total * 0.4
    ? { text: "Urgent", cls: "bg-rose-100 text-rose-700" }
    : { text: "Attention", cls: "bg-amber-100 text-amber-700" };

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white rounded-2xl border border-stone-200 px-4 py-3 active:bg-stone-50 space-y-2.5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-stone-400 flex-shrink-0" />
          <span className="font-semibold text-stone-900 text-sm">{zone.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${healthLabel.cls}`}>
            {healthLabel.text}
          </span>
          <ChevronDown size={14} className="text-stone-400" />
        </div>
      </div>

      <div className="flex rounded-full overflow-hidden h-2 gap-px bg-stone-100">
        {green > 0 && <div className="bg-emerald-400 rounded-full" style={{ flex: green }} />}
        {amber > 0 && <div className="bg-amber-400 rounded-full" style={{ flex: amber }} />}
        {red > 0 && <div className="bg-rose-400 rounded-full" style={{ flex: red }} />}
      </div>

      <div className="flex items-center gap-3 text-[11px]">
        <span className="flex items-center gap-1 text-emerald-600 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />{green} récents
        </span>
        {amber > 0 && (
          <span className="flex items-center gap-1 text-amber-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{amber} anciens
          </span>
        )}
        {red > 0 && (
          <span className="flex items-center gap-1 text-rose-500 font-medium">
            <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />{red} en retard
          </span>
        )}
        <span className="ml-auto text-stone-400">{green + amber}/{total}</span>
      </div>

      <CategoryChips entretienLogs={entretienLogs} roomId={null} zone={zone.key} taskDefs={ZONE_TASKS} freqOverrides={freqOverrides} />

      <div className="flex items-center gap-1.5 text-[11px] text-stone-400">
        <Activity size={11} className="flex-shrink-0" />
        {lastActivityDate
          ? <span>Dernière activité : <span className="text-stone-600 font-medium">{formatDateTime(lastActivityDate)}</span></span>
          : <span className="italic">Aucune activité enregistrée</span>
        }
      </div>
    </button>
  );
}

function TaskRow({ taskKey, taskLabel, frequencyDays = 30, logs, onLog, staffName }) {
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const latest = logs[0]?.completed_at ?? null;
  const color = statusColor(latest, frequencyDays);
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
        <StatusDot dateStr={latest} frequencyDays={frequencyDays} size="md" />
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
              <span>{new Date(log.completed_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
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

function RoomDetailSheet({ room, entretienLogs, staff, onLog, onClose, currentStaffId, freqOverrides = {} }) {
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
                      frequencyDays={resolveFreq(task.key, task.frequencyDays, freqOverrides)}
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

function ZoneDetailSheet({ zone, entretienLogs, staff, onLog, onClose, currentStaffId, freqOverrides = {} }) {
  const [openCats, setOpenCats] = useState({ sols: true, surfaces: false, vitrerie: false, luminaires: false });

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
          {Object.entries(ZONE_TASKS).map(([catKey, cat]) => (
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
                      frequencyDays={resolveFreq(task.key, task.frequencyDays, freqOverrides)}
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

function FrequencyConfigSheet({ onClose, freqOverrides, onSave }) {
  const allTasks = useMemo(
    () => [
      ...Object.values(ENTRETIEN_TASKS).flatMap((c) => c.tasks),
      ...Object.values(ZONE_TASKS).flatMap((c) => c.tasks),
    ],
    []
  );

  const [inputVals, setInputVals] = useState(() => {
    const vals = {};
    for (const task of allTasks) {
      vals[task.key] = String(freqOverrides[task.key] ?? task.frequencyDays);
    }
    return vals;
  });

  function handleChange(taskKey, raw) {
    setInputVals((prev) => ({ ...prev, [taskKey]: raw }));
  }

  function handleSave() {
    const overrides = {};
    for (const task of allTasks) {
      const n = parseInt(inputVals[task.key], 10);
      if (!isNaN(n) && n > 0 && n !== task.frequencyDays) overrides[task.key] = n;
    }
    onSave(overrides);
    onClose();
  }

  function handleReset() {
    const vals = {};
    for (const task of allTasks) vals[task.key] = String(task.frequencyDays);
    setInputVals(vals);
  }

  const allTaskDefs = [
    { groupLabel: "Chambres", taskDefs: ENTRETIEN_TASKS },
    { groupLabel: "Zones communes", taskDefs: ZONE_TASKS },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="mt-auto bg-stone-50 rounded-t-3xl overflow-y-auto"
        style={{ maxHeight: "92vh", animation: "slideUp 0.25s ease" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-stone-50 z-10 px-5 pt-5 pb-3 border-b border-stone-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-stone-900">Fréquences d'entretien</h2>
              <p className="text-xs text-stone-400 mt-0.5">Nombre de jours avant qu'une tâche soit considérée en retard</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-stone-100 text-stone-500"
                title="Réinitialiser aux valeurs par défaut"
              >
                <RotateCcw size={14} />
              </button>
              <button
                onClick={onClose}
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded-full bg-stone-200 text-stone-600 text-sm font-bold"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-6">
          {allTaskDefs.map(({ groupLabel, taskDefs }) => (
            <div key={groupLabel}>
              <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-3">{groupLabel}</p>
              <div className="space-y-3">
                {Object.entries(taskDefs).map(([catKey, cat]) => (
                  <div key={catKey} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-stone-50 border-b border-stone-100">
                      <span>{cat.emoji}</span>
                      <span className="text-sm font-semibold text-stone-700">{cat.label}</span>
                    </div>
                    <div className="divide-y divide-stone-100">
                      {cat.tasks.map((task) => {
                        const rawVal = inputVals[task.key] ?? String(task.frequencyDays);
                        const parsed = parseInt(rawVal, 10);
                        const isOverridden = !isNaN(parsed) && parsed > 0 && parsed !== task.frequencyDays;
                        return (
                          <div key={task.key} className="flex items-center gap-3 px-4 py-2.5">
                            <span className={`flex-1 text-sm ${isOverridden ? "text-stone-900 font-medium" : "text-stone-600"}`}>
                              {task.label}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <input
                                type="number"
                                min="1"
                                max="365"
                                value={rawVal}
                                onChange={(e) => handleChange(task.key, e.target.value)}
                                className={`w-16 text-center text-sm rounded-lg px-2 py-1 outline-none border ${
                                  isOverridden
                                    ? "border-amber-300 bg-amber-50 text-amber-900 font-semibold"
                                    : "border-stone-200 bg-stone-100 text-stone-600"
                                }`}
                              />
                              <span className="text-xs text-stone-400">j</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 bg-stone-50 border-t border-stone-200 px-5 py-4">
          <button
            type="button"
            onClick={handleSave}
            className="w-full bg-stone-800 text-white font-semibold py-3 rounded-2xl active:scale-[0.98] transition"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EntretienTab({ rooms, entretienLogs, staff, onLog, currentStaffId, isAdmin, freqOverrides = {}, onSaveFrequencies }) {
  const [view, setView] = useState("rooms");
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [selectedZoneKey, setSelectedZoneKey] = useState(null);
  const [showFreqConfig, setShowFreqConfig] = useState(false);

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
    const allTasks = Object.values(ENTRETIEN_TASKS).flatMap((c) => c.tasks);
    for (const room of rooms) {
      for (const task of allTasks) {
        const freq = resolveFreq(task.key, task.frequencyDays, freqOverrides);
        const latest = entretienLogs.find((l) => l.room_id === room.id && l.task_type === task.key);
        if (!latest || daysSince(latest.completed_at) > freq) count++;
      }
    }
    return count;
  }, [rooms, entretienLogs, freqOverrides]);

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
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowFreqConfig(true)}
              className="ml-auto h-8 inline-flex items-center gap-1.5 rounded-full border border-stone-900 bg-white px-3 text-stone-900 shadow-sm active:bg-stone-100 transition"
              title="Configurer les fréquences"
            >
              <Settings size={15} />
              <span className="text-xs font-semibold whitespace-nowrap">Fréquences</span>
            </button>
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
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> À l'heure</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Bientôt dû</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400 inline-block" /> En retard</span>
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
                    <RoomSummaryCard
                      key={room.id}
                      room={room}
                      entretienLogs={entretienLogs}
                      freqOverrides={freqOverrides}
                      onClick={() => setSelectedRoomId(room.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          )
        ) : (
          <div className="space-y-2">
            {ZONES.map((zone) => (
              <ZoneSummaryCard
                key={zone.key}
                zone={zone}
                entretienLogs={entretienLogs}
                freqOverrides={freqOverrides}
                onClick={() => setSelectedZoneKey(zone.key)}
              />
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
          freqOverrides={freqOverrides}
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
          freqOverrides={freqOverrides}
        />
      )}

      {/* Frequency config sheet (admin only) */}
      {showFreqConfig && (
        <FrequencyConfigSheet
          freqOverrides={freqOverrides}
          onSave={onSaveFrequencies}
          onClose={() => setShowFreqConfig(false)}
        />
      )}
    </div>
  );
}
