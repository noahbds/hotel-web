import { useState } from "react";
import MenageHotel from "./components/MenageHotel.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import AdminScreen from "./components/AdminScreen.jsx";
import { supabase, supabaseConfigMissing } from "./services/supabase/client";
import { useAuth } from "./hooks/useAuth";
import { Analytics } from "@vercel/analytics/react";

export default function App() {
  const [showAdmin, setShowAdmin] = useState(false);
  const { profile, loading, signOut } = useAuth();

  if (supabaseConfigMissing) {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f4", padding: "2rem" }}>
        <div style={{ maxWidth: 400, textAlign: "center" }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>⚙️</p>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1c1917", marginBottom: 8 }}>Configuration manquante</h1>
          <p style={{ color: "#78716c", fontSize: 14, lineHeight: 1.6 }}>
            Les variables d'environnement Supabase ne sont pas configurées.<br />
            Ajoutez <code style={{ background: "#e7e5e4", padding: "1px 5px", borderRadius: 4 }}>VITE_SUPABASE_URL</code> et{" "}
            <code style={{ background: "#e7e5e4", padding: "1px 5px", borderRadius: 4 }}>VITE_SUPABASE_ANON_KEY</code> dans les réglages Vercel, puis redéployez.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f4" }}>
        <span style={{ color: "#a8a29e", fontSize: 14 }}>Chargement…</span>
      </div>
    );
  }

  if (!profile) {
    return <AuthScreen />;
  }

  // Not assigned to a hotel (and not admin)
  if (!profile.hotel_id && !profile.is_admin) {
    // active=false means they were explicitly removed; active=true means new/waiting
    if (!profile.active) {
      return <RemovedScreen profile={profile} onSignOut={signOut} />;
    }
    return <PendingScreen profile={profile} onSignOut={signOut} />;
  }

  if (showAdmin && profile.is_admin) {
    return (
      <AdminScreen
        currentProfile={profile}
        onClose={() => setShowAdmin(false)}
        onSignOut={signOut}
      />
    );
  }

  return (
    <>
      <MenageHotel
        profile={profile}
        onSignOut={signOut}
        onOpenAdmin={profile.is_admin ? () => setShowAdmin(true) : undefined}
      />
      <Analytics />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Waiting for first assignment                                        */
/* ------------------------------------------------------------------ */
function PendingScreen({ profile, onSignOut }: { profile: { name: string; email: string; avatar_url: string | null }; onSignOut: () => void }) {
  return (
    <div
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}
      className="min-h-screen bg-stone-100 flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center">
        <div className="w-20 h-20 rounded-full bg-stone-200 flex items-center justify-center mx-auto mb-5 overflow-hidden">
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            : <span className="text-3xl text-stone-400">👤</span>}
        </div>
        <h2 className="text-xl font-bold text-stone-800 mb-1">
          Bonjour, {profile.name || profile.email} !
        </h2>
        <p className="text-stone-500 text-sm leading-relaxed mb-8">
          Votre compte est en attente d'attribution à un hôtel.<br />
          Un administrateur vous donnera accès sous peu.
        </p>
        <div className="w-10 h-10 border-4 border-stone-300 border-t-stone-600 rounded-full animate-spin mx-auto mb-8" />
        <button
          onClick={onSignOut}
          className="text-sm text-stone-400 hover:text-stone-600 transition">
          Se déconnecter
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Removed from hotel                                                  */
/* ------------------------------------------------------------------ */
function RemovedScreen({ profile, onSignOut }: { profile: { id: string; name: string; email: string; avatar_url: string | null }; onSignOut: () => void }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const requestReassignment = async () => {
    setStatus("sending");
    const { error } = await supabase
      .from("profiles")
      .update({ active: true })
      .eq("id", profile.id);
    setStatus(error ? "error" : "sent");
  };

  return (
    <div
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}
      className="min-h-screen bg-stone-100 flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center">

        <div className="w-20 h-20 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-5">
          <span className="text-4xl">🚫</span>
        </div>

        <h2 className="text-xl font-bold text-stone-800 mb-2">
          Accès retiré
        </h2>
        <p className="text-stone-500 text-sm leading-relaxed mb-8">
          Votre accès à l'hôtel a été retiré par un administrateur.<br />
          Vous ne pouvez plus effectuer d'actions.
        </p>

        {status === "sent" ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 mb-6">
            <p className="text-emerald-700 text-sm font-semibold mb-0.5">Demande envoyée</p>
            <p className="text-emerald-600 text-xs">Un administrateur va examiner votre demande de réintégration.</p>
          </div>
        ) : (
          <button
            onClick={requestReassignment}
            disabled={status === "sending"}
            className="w-full bg-stone-800 text-white font-semibold py-3.5 rounded-2xl mb-4 active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-2">
            {status === "sending"
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Envoi…</>
              : "Demander à être réassigné"}
          </button>
        )}

        {status === "error" && (
          <p className="text-rose-500 text-xs mb-4">Une erreur s'est produite. Réessayez.</p>
        )}

        <button
          onClick={onSignOut}
          className="text-sm text-stone-400 hover:text-stone-600 transition">
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
