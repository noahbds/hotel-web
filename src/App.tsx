import { useState } from "react";
import MenageHotel from "./components/MenageHotel.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import AdminScreen from "./components/AdminScreen.jsx";
import { supabaseConfigMissing } from "./services/supabase/client";
import { useAuth } from "./hooks/useAuth";

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

  // Logged in but not yet assigned to a hotel (and not admin)
  if (!profile.hotel_id && !profile.is_admin) {
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
    <MenageHotel
      profile={profile}
      onSignOut={signOut}
      onOpenAdmin={profile.is_admin ? () => setShowAdmin(true) : undefined}
    />
  );
}

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
