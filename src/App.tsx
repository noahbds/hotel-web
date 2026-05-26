import MenageHotel from './components/MenageHotel.jsx'
import { supabaseConfigMissing } from './services/supabase/client'

export default function App() {
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
    )
  }
  return <MenageHotel />
}
