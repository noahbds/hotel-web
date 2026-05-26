import React, { useState, useRef } from "react";
import { supabase } from "../services/supabase/client";
import { Camera, Eye, EyeOff, User, Mail, Lock, LogIn, UserPlus } from "lucide-react";

function compressAvatar(file, maxSize = 256, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture impossible"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Image invalide"));
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(
          img,
          (img.width - size) / 2, (img.height - size) / 2,
          size, size,
          0, 0, maxSize, maxSize
        );
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function AuthScreen() {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const fileRef = useRef();

  const handleAvatar = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { setAvatar(await compressAvatar(f)); }
    catch { /* ignore bad file */ }
    e.target.value = "";
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) setError(translateError(err.message));
    setLoading(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError("Le nom est requis."); return; }
    if (password.length < 6) { setError("Le mot de passe doit contenir au moins 6 caractères."); return; }
    setError(null);
    setLoading(true);

    const { data, error: signUpErr } = await supabase.auth.signUp({ email: email.trim(), password });
    if (signUpErr) { setError(translateError(signUpErr.message)); setLoading(false); return; }

    if (data.user) {
      // Update the auto-created profile with name and avatar
      await supabase.from("profiles").update({
        name: name.trim(),
        avatar_url: avatar ?? null,
        updated_at: new Date().toISOString(),
      }).eq("id", data.user.id);
    }

    if (data.session) {
      // Immediately signed in (email confirmation disabled)
    } else {
      setSuccess("Compte créé ! Vérifiez votre email pour confirmer votre compte.");
    }
    setLoading(false);
  };

  return (
    <div
      className="min-h-screen bg-stone-100 flex items-center justify-center p-4"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif" }}>
      <div className="w-full max-w-sm">

        {/* Logo / title */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-stone-800 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-2xl">🏨</span>
          </div>
          <h1 className="text-2xl font-bold text-stone-800">Ménage Hôtel</h1>
          <p className="text-stone-400 text-sm mt-1">Espace privé — personnel autorisé uniquement</p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-stone-200 rounded-2xl p-1 mb-6">
          <button
            onClick={() => { setMode("login"); setError(null); setSuccess(null); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${mode === "login" ? "bg-white text-stone-800 shadow-sm" : "text-stone-500"}`}>
            Se connecter
          </button>
          <button
            onClick={() => { setMode("register"); setError(null); setSuccess(null); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${mode === "register" ? "bg-white text-stone-800 shadow-sm" : "text-stone-500"}`}>
            Créer un compte
          </button>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm">
          {success ? (
            <div className="text-center py-4">
              <p className="text-2xl mb-3">✉️</p>
              <p className="text-stone-700 font-medium">{success}</p>
              <button onClick={() => { setSuccess(null); setMode("login"); }} className="mt-4 text-sky-600 text-sm font-semibold">
                Retour à la connexion
              </button>
            </div>
          ) : (
            <form onSubmit={mode === "login" ? handleLogin : handleRegister} className="space-y-4">

              {/* Avatar picker (register only) */}
              {mode === "register" && (
                <div className="flex flex-col items-center mb-2">
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatar} className="hidden" />
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="relative group">
                    {avatar ? (
                      <img src={avatar} alt="" className="w-20 h-20 rounded-full object-cover ring-4 ring-stone-100" />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-stone-100 flex items-center justify-center ring-4 ring-stone-50">
                        <User size={28} className="text-stone-400" />
                      </div>
                    )}
                    <span className="absolute bottom-0 right-0 w-7 h-7 bg-stone-800 rounded-full flex items-center justify-center shadow">
                      <Camera size={13} className="text-white" />
                    </span>
                  </button>
                  <p className="text-[11px] text-stone-400 mt-1.5">Photo de profil (optionnel)</p>
                </div>
              )}

              {/* Name (register only) */}
              {mode === "register" && (
                <div>
                  <label className="text-xs font-medium text-stone-500 mb-1 block">Nom complet</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input
                      autoFocus
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={60}
                      placeholder="Ex. : Sofia Martin"
                      required
                      className="w-full bg-stone-100 rounded-xl pl-9 pr-3 py-3 outline-none text-sm focus:ring-2 focus:ring-stone-300" />
                  </div>
                </div>
              )}

              {/* Email */}
              <div>
                <label className="text-xs font-medium text-stone-500 mb-1 block">Adresse email</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    autoFocus={mode === "login"}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={200}
                    placeholder="nom@exemple.com"
                    required
                    className="w-full bg-stone-100 rounded-xl pl-9 pr-3 py-3 outline-none text-sm focus:ring-2 focus:ring-stone-300" />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="text-xs font-medium text-stone-500 mb-1 block">Mot de passe</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    maxLength={128}
                    placeholder={mode === "register" ? "6 caractères minimum" : "••••••••"}
                    required
                    className="w-full bg-stone-100 rounded-xl pl-9 pr-10 py-3 outline-none text-sm focus:ring-2 focus:ring-stone-300" />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400">
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-rose-600 text-sm bg-rose-50 rounded-xl px-3 py-2.5">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-stone-800 text-white font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition">
                {loading
                  ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : mode === "login"
                    ? <><LogIn size={17} /> Connexion</>
                    : <><UserPlus size={17} /> Créer mon compte</>
                }
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-stone-400 mt-6">
          Accès réservé au personnel de l'hôtel.
        </p>
      </div>
    </div>
  );
}

function translateError(msg) {
  if (!msg) return "Une erreur est survenue.";
  if (/invalid.*(login|credentials)/i.test(msg)) return "Email ou mot de passe incorrect.";
  if (/email.*not.*confirmed/i.test(msg)) return "Confirmez d'abord votre email.";
  if (/already.*registered/i.test(msg) || /already.*exists/i.test(msg)) return "Un compte existe déjà avec cet email.";
  if (/password.*6/i.test(msg)) return "Le mot de passe doit contenir au moins 6 caractères.";
  if (/rate.*limit/i.test(msg)) return "Trop de tentatives. Réessayez dans quelques minutes.";
  return "Une erreur est survenue. Veuillez réessayer.";
}
