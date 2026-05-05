import { useState, useRef, useEffect, useCallback } from "react";

// ============================================================
// ⚠️  PEGÁ TUS KEYS AQUÍ
// ============================================================
const OPENAI_KEY = "PEGA_TU_OPENAI_KEY_AQUI";

// Firebase config — pegá el tuyo cuando lo tengas
const FIREBASE_CONFIG = {
  apiKey: "PEGA_TU_FIREBASE_API_KEY",
  authDomain: "PEGA_TU_AUTH_DOMAIN",
  projectId: "PEGA_TU_PROJECT_ID",
  storageBucket: "PEGA_TU_STORAGE_BUCKET",
  messagingSenderId: "PEGA_TU_SENDER_ID",
  appId: "PEGA_TU_APP_ID",
};

// MercadoPago Public Key
const MP_PUBLIC_KEY = "PEGA_TU_MP_PUBLIC_KEY";
const MP_PLAN_URL   = "https://www.mercadopago.com.ar/subscriptions"; // reemplazá con tu link de suscripción real

// ============================================================
const FREE_LIMIT  = 5;
const STORAGE_KEY = "animuspet_uses_v4";
const PETS_KEY    = "animuspet_pets_v4";

// ─── MOOD DATA ───────────────────────────────────────────────
const MOOD = {
  perro: {
    alegre:  { emoji:"😊", label:"Alegre",             color:"#FFD700", grad:"linear-gradient(135deg,#FFD700,#FFA500)", tip:"Aprovechá para jugar. Es el momento ideal para reforzar el vínculo." },
    triste:  { emoji:"😢", label:"Triste / Ansioso",   color:"#6B9FD4", grad:"linear-gradient(135deg,#6B9FD4,#4A7AB5)", tip:"Pasá tiempo de calidad. Si persiste más de 3 días, consultá un vet." },
    enojado: { emoji:"😠", label:"Enojado / Alerta",   color:"#E74C3C", grad:"linear-gradient(135deg,#E74C3C,#C0392B)", tip:"Identificá qué lo estresó. Retirá estímulos amenazantes." },
    enfermo: { emoji:"🤒", label:"Posible Enfermedad", color:"#E67E22", grad:"linear-gradient(135deg,#E67E22,#D35400)", tip:"Consultá con un veterinario cuanto antes." },
    celo:    { emoji:"💕", label:"En Celo",            color:"#E91E8C", grad:"linear-gradient(135deg,#E91E8C,#AD1457)", tip:"Supervisión especial para evitar escapadas." },
  },
  gato: {
    alegre:   { emoji:"😸", label:"Contento",          color:"#FFD700", grad:"linear-gradient(135deg,#FFD700,#FFA500)", tip:"Momento perfecto para jugar y reforzar el vínculo." },
    relajado: { emoji:"😌", label:"Relajado",          color:"#4CAF50", grad:"linear-gradient(135deg,#4CAF50,#388E3C)", tip:"Tu gato se siente seguro. ¡Excelente señal!" },
    triste:   { emoji:"😿", label:"Triste / Estresado",color:"#6B9FD4", grad:"linear-gradient(135deg,#6B9FD4,#4A7AB5)", tip:"Verificá cambios en su entorno. Ofrecele un espacio seguro." },
    enojado:  { emoji:"😾", label:"Enojado / Asustado",color:"#E74C3C", grad:"linear-gradient(135deg,#E74C3C,#C0392B)", tip:"No lo fuerces. Dále espacio y esperá que se calme." },
    enfermo:  { emoji:"🤒", label:"Posible Enfermedad",color:"#E67E22", grad:"linear-gradient(135deg,#E67E22,#D35400)", tip:"Los gatos esconden el dolor. Cualquier cambio: consultá al vet." },
    celo:     { emoji:"💕", label:"En Celo",           color:"#E91E8C", grad:"linear-gradient(135deg,#E91E8C,#AD1457)", tip:"Celo frecuente en gatas. Considerá la esterilización." },
  },
};

const DISEASES = {
  perro: {
    alegre:[], triste:["Ansiedad por separación","Depresión canina","Hipotiroidismo"],
    enojado:["Dolor crónico","Fobia situacional"], enfermo:["Distemper","Parvovirus","Artritis"],
    celo:["Piometra","Pseudopreñez"],
  },
  gato: {
    alegre:[], relajado:[],
    triste:["Ansiedad felina","Enfermedad renal","Dolor dental"],
    enojado:["Hipertiroidismo","Cistitis idiopática felina"],
    enfermo:["FeLV","Calicivirus","Diabetes felina"],
    celo:["Piometra","Quistes ováricos"],
  },
};

// ─── FIREBASE AUTH (lazy load) ────────────────────────────────
let firebaseApp = null;
let firebaseAuth = null;

async function initFirebase() {
  if (firebaseApp) return { app: firebaseApp, auth: firebaseAuth };
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js");
    const { getAuth, GoogleAuthProvider, signInWithPopup, signOut } = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js");
    firebaseApp  = initializeApp(FIREBASE_CONFIG);
    firebaseAuth = getAuth(firebaseApp);
    return { app: firebaseApp, auth: firebaseAuth, GoogleAuthProvider, signInWithPopup, signOut };
  } catch (e) {
    console.error("Firebase init error:", e);
    return null;
  }
}

// ─── WHISPER API ─────────────────────────────────────────────
async function transcribeAudio(audioBlob) {
  const formData = new FormData();
  formData.append("file", new File([audioBlob], "audio.webm", { type: audioBlob.type || "audio/webm" }));
  formData.append("model", "whisper-1");
  formData.append("language", "es");
  formData.append("prompt", "Sonidos de animales: ladridos, maullidos, gemidos, gruñidos, aullidos, ronroneos.");
  const res  = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${OPENAI_KEY}` }, body: formData,
  });
  const data = await res.json();
  return data.text || "";
}

// ─── CLAUDE API ───────────────────────────────────────────────
async function analyzeEmotion({ frame, audioText, captureMode, especie }) {
  const estados = especie === "perro" ? "alegre|triste|enojado|enfermo|celo" : "alegre|relajado|triste|enojado|enfermo|celo";
  const audioSection = audioText ? `\nSONIDO REAL (Whisper): "${audioText}"\n` : "";
  const prompt = `Sos experto en comportamiento ${especie === "perro" ? "canino" : "felino"}.${audioSection}
${captureMode === "video" ? `Analizá la imagen del ${especie}: cola, orejas, cuerpo, expresión.` : ""}
Determiná el estado emocional. Respondé SOLO en JSON sin markdown:
{"estado":"${estados}","confianza":85,"explicacion":"2-3 oraciones","senales_audio":["s1","s2"],"senales_visuales":["v1","v2"],"posible_enfermedad":false,"enfermedad_nota":""}`;

  const content = frame && captureMode === "video"
    ? [{ type:"image", source:{ type:"base64", media_type:"image/jpeg", data:frame }},{ type:"text", text:prompt }]
    : prompt;

  const res  = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000, messages:[{ role:"user", content }] }),
  });
  const data = await res.json();
  const text = data.content?.map((b) => b.text||"").join("")||"";
  return JSON.parse(text.replace(/```json|```/g,"").trim());
}

async function chatVet(messages, especie) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      model:"claude-sonnet-4-20250514", max_tokens:1000,
      system:`Sos el Dr. Paws, veterinario virtual de AnimusPet. Español rioplatense, cálido y profesional. Especialista en ${especie==="gato"?"felinos":"caninos"}. Máximo 3 párrafos. Nunca reemplazás consulta presencial. Terminás con consejo accionable.`,
      messages: messages.map((m)=>({ role:m.role, content:m.content })),
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || "No pude responder. Intentá de nuevo.";
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function App() {
  // Auth
  const [user,        setUser]        = useState(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Mascotas
  const [pets,        setPets]        = useState([]);
  const [activePet,   setActivePet]   = useState(null);
  const [showAddPet,  setShowAddPet]  = useState(false);
  const [newPetName,  setNewPetName]  = useState("");
  const [newPetType,  setNewPetType]  = useState("perro");

  // Captura
  const [screen,      setScreen]      = useState("home");
  const [captureMode, setCaptureMode] = useState("video");
  const [recording,   setRecording]   = useState(false);
  const [countdown,   setCountdown]   = useState(0);
  const [result,      setResult]      = useState(null);
  const [analyzeStep, setAnalyzeStep] = useState("");
  const [stream,      setStream]      = useState(null);
  const [usesLeft,    setUsesLeft]    = useState(FREE_LIMIT);

  // Vet
  const [vetMsgs,    setVetMsgs]    = useState([]);
  const [vetInput,   setVetInput]   = useState("");
  const [vetLoading, setVetLoading] = useState(false);

  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const mrRef     = useRef(null);
  const chunksRef = useRef([]);

  // ── Cargar datos ─────────────────────────────────────────
  useEffect(() => {
    const uses = parseInt(localStorage.getItem(STORAGE_KEY)||"0");
    setUsesLeft(Math.max(0, FREE_LIMIT - uses));
    const savedPets = JSON.parse(localStorage.getItem(PETS_KEY)||"[]");
    setPets(savedPets);
    if (savedPets.length > 0) setActivePet(savedPets[0]);
  }, []);

  const savePets = (newPets) => {
    localStorage.setItem(PETS_KEY, JSON.stringify(newPets));
    setPets(newPets);
  };

  // ── Agregar mascota ──────────────────────────────────────
  const handleAddPet = () => {
    if (!newPetName.trim()) return;
    const pet = { id: Date.now(), name: newPetName.trim(), type: newPetType, history: [] };
    const updated = [...pets, pet];
    savePets(updated);
    setActivePet(pet);
    setNewPetName("");
    setShowAddPet(false);
  };

  // ── Google Login ─────────────────────────────────────────
  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    try {
      const fb = await initFirebase();
      if (!fb) throw new Error("Firebase no inicializado");
      const provider = new fb.GoogleAuthProvider();
      const result   = await fb.signInWithPopup(fb.auth, provider);
      setUser({ name: result.user.displayName, email: result.user.email, photo: result.user.photoURL });
    } catch (e) {
      console.error(e);
      alert("Error al iniciar sesión con Google. Verificá la configuración de Firebase.");
    }
    setAuthLoading(false);
  };

  const handleLogout = async () => {
    try {
      const fb = await initFirebase();
      if (fb) await fb.signOut(fb.auth);
    } catch {}
    setUser(null);
  };

  // ── Cámara ───────────────────────────────────────────────
  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
      setStream(s);
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch { alert("Necesitamos acceso a tu cámara y micrófono."); }
  };

  const stopCamera = () => {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    setStream(null);
  };

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return null;
    const ctx = canvasRef.current.getContext("2d");
    canvasRef.current.width  = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    return canvasRef.current.toDataURL("image/jpeg", 0.8).split(",")[1];
  };

  const handleStartCapture = async () => {
    if (usesLeft <= 0) { setScreen("paywall"); return; }
    if (!activePet)    { setShowAddPet(true); return; }
    await startCamera();
    setScreen("capture");
  };

  const handleRecord = () => {
    if (recording) { mrRef.current?.stop(); setRecording(false); setCountdown(0); return; }
    const frame = captureFrame();
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    const mr = new MediaRecorder(stream, { mimeType });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = async () => {
      stopCamera();
      setScreen("analyzing");
      try {
        setAnalyzeStep("🎙️ Whisper está escuchando el audio...");
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        let audioText = "";
        try { audioText = await transcribeAudio(audioBlob); } catch {}

        setAnalyzeStep("🧠 Claude analiza postura y sonido...");
        const res = await analyzeEmotion({ frame: captureMode === "video" ? frame : null, audioText, captureMode, especie: activePet.type });
        res.audioTranscription = audioText;
        res.petName = activePet.name;
        res.petType = activePet.type;
        res.fecha   = new Date().toLocaleDateString("es-AR");
        res.timestamp = Date.now();

        // Guardar en historial de la mascota
        const uses = parseInt(localStorage.getItem(STORAGE_KEY)||"0") + 1;
        localStorage.setItem(STORAGE_KEY, uses.toString());
        setUsesLeft(Math.max(0, FREE_LIMIT - uses));

        const updatedPets = pets.map((p) =>
          p.id === activePet.id ? { ...p, history: [...(p.history||[]), res] } : p
        );
        savePets(updatedPets);
        setActivePet(updatedPets.find((p) => p.id === activePet.id));
        setResult(res);
        setScreen("result");
      } catch (err) {
        console.error(err);
        alert("Error al analizar. Verificá tus API keys.");
        setScreen("home");
      }
    };
    mrRef.current = mr;
    mr.start(100);
    setRecording(true);
    let c = 10;
    setCountdown(c);
    const iv = setInterval(() => { c--; setCountdown(c); if (c <= 0) { clearInterval(iv); mr.stop(); setRecording(false); } }, 1000);
  };

  // ── Vet ──────────────────────────────────────────────────
  const handleVetSend = async () => {
    if (!vetInput.trim() || vetLoading) return;
    const newMsgs = [...vetMsgs, { role:"user", content:vetInput }];
    setVetMsgs(newMsgs); setVetInput(""); setVetLoading(true);
    try {
      const reply = await chatVet(newMsgs, activePet?.type || "perro");
      setVetMsgs([...newMsgs, { role:"assistant", content:reply }]);
    } catch { setVetMsgs([...newMsgs, { role:"assistant", content:"Error. Intentá de nuevo." }]); }
    setVetLoading(false);
  };

  const openVet = () => {
    if (vetMsgs.length === 0) {
      setVetMsgs([{ role:"assistant", content:`¡Hola! Soy el Dr. Paws 🐾 Veterinario virtual de AnimusPet. ${activePet ? `Veo que analizaste a ${activePet.name}.` : ""} ¿En qué puedo ayudarte?` }]);
    }
    setScreen("vet");
  };

  // ── Compartir ────────────────────────────────────────────
  const shareResult = (platform) => {
    if (!result) return;
    const moodInfo = MOOD[result.petType]?.[result.estado];
    const text = `${moodInfo?.emoji} ${result.petName} está ${moodInfo?.label} hoy!\nAnalizado con AnimusPet 🐾\nanimuspet.com`;
    const encoded = encodeURIComponent(text);
    const urls = {
      whatsapp: `https://wa.me/?text=${encoded}`,
      twitter:  `https://twitter.com/intent/tweet?text=${encoded}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=https://animuspet.com&quote=${encoded}`,
    };
    window.open(urls[platform], "_blank");
  };

  // ── Computed ─────────────────────────────────────────────
  const moodMap  = result ? (MOOD[result.petType] || MOOD.perro) : MOOD.perro;
  const moodInfo = result ? (moodMap[result.estado] || moodMap.alegre) : null;
  const diseases = result ? (DISEASES[result.petType]?.[result.estado] || []) : [];
  const accent   = activePet?.type === "gato" ? "#9B7FD4" : "#D4AF37";

  // ── ESTILOS ───────────────────────────────────────────────
  const S = {
    app:   { minHeight:"100vh", background:"#080808", color:"#F0EBE0", fontFamily:"'Georgia',serif", overflowX:"hidden" },
    nav:   { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 20px", borderBottom:"1px solid #1C1C1C", background:"#0A0A0A", position:"sticky", top:0, zIndex:100 },
    logo:  { fontSize:"16px", fontWeight:"700", color:"#D4AF37", letterSpacing:"2px" },
    pBtn:  { background:"linear-gradient(135deg,#D4AF37,#B8963E)", color:"#080808", border:"none", borderRadius:"50px", padding:"15px 36px", fontSize:"15px", fontWeight:"700", cursor:"pointer", width:"100%", maxWidth:"300px" },
    sBtn:  { background:"transparent", color:"#D4AF37", border:"2px solid #D4AF37", borderRadius:"50px", padding:"13px 36px", fontSize:"14px", fontWeight:"600", cursor:"pointer", width:"100%", maxWidth:"300px" },
    gBtn:  { background:"transparent", color:"#555", border:"1px solid #222", borderRadius:"50px", padding:"9px 22px", fontSize:"12px", cursor:"pointer" },
    card:  { background:"#0F0F0F", border:"1px solid #1E1E1E", borderRadius:"20px", padding:"20px", margin:"12px" },
    cGold: { background:"linear-gradient(135deg,#150F00,#0A0800)", border:"1px solid #D4AF37", borderRadius:"20px", padding:"20px", margin:"12px" },
    modeBtn:(a) => ({ flex:1, maxWidth:"140px", background:a?"linear-gradient(135deg,#D4AF37,#B8963E)":"#0F0F0F", color:a?"#080808":"#555", border:a?"none":"1px solid #222", borderRadius:"14px", padding:"13px 8px", cursor:"pointer", fontSize:"12px", fontWeight:a?"700":"400", textAlign:"center" }),
    bubble:(u) => ({ background:u?"linear-gradient(135deg,#D4AF37,#B8963E)":"#161616", color:u?"#080808":"#F0EBE0", borderRadius:u?"20px 20px 4px 20px":"20px 20px 20px 4px", padding:"12px 16px", maxWidth:"83%", marginLeft:u?"auto":"0", fontSize:"13px", lineHeight:1.6 }),
    petChip:(active) => ({ background:active?"linear-gradient(135deg,#D4AF37,#B8963E)":"#111", color:active?"#080808":"#888", border:active?"none":"1px solid #222", borderRadius:"50px", padding:"8px 16px", fontSize:"12px", fontWeight:active?"700":"400", cursor:"pointer", whiteSpace:"nowrap" }),
    shareBtn:(color) => ({ background:color, color:"#fff", border:"none", borderRadius:"50px", padding:"10px 20px", fontSize:"12px", fontWeight:"700", cursor:"pointer", flex:1 }),
  };

  // ════════════════════════════════════════════════════════════
  // HOME
  // ════════════════════════════════════════════════════════════
  if (screen === "home") return (
    <div style={S.app}>
      <nav style={S.nav}>
        <span style={S.logo}>🐾 ANIMUSPET</span>
        <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
          <button style={{ ...S.gBtn, fontSize:"18px", padding:"6px 10px" }} onClick={() => setScreen("history")}>📁</button>
          <button style={{ ...S.gBtn, background:"linear-gradient(135deg,#D4AF37,#B8963E)", color:"#080808", border:"none", fontWeight:"700", fontSize:"12px" }} onClick={openVet}>🩺 Dr. Paws</button>
          {user
            ? <img src={user.photo} style={{ width:"30px", height:"30px", borderRadius:"50%", border:"2px solid #D4AF37", cursor:"pointer" }} onClick={handleLogout} title="Cerrar sesión" />
            : <button style={{ ...S.gBtn, color:"#D4AF37", border:"1px solid #D4AF37" }} onClick={handleGoogleLogin}>{authLoading ? "..." : "Ingresar"}</button>
          }
        </div>
      </nav>

      {/* Hero */}
      <div style={{ textAlign:"center", padding:"36px 20px 20px" }}>
        {user && <p style={{ color:"#666", fontSize:"12px", marginBottom:"16px" }}>Hola, {user.name.split(" ")[0]} 👋</p>}
        <div style={{ display:"inline-block", background:"#0F0A00", border:"1px solid #D4AF37", color:"#D4AF37", borderRadius:"20px", padding:"5px 14px", fontSize:"10px", marginBottom:"18px", letterSpacing:"1px" }}>
          ✦ IA MULTIMODAL · WHISPER + CLAUDE VISION ✦
        </div>
        <h1 style={{ fontSize:"clamp(26px,7vw,44px)", fontWeight:"700", color:"#D4AF37", lineHeight:1.05, marginBottom:"8px" }}>
          El alma de tu mascota,<br/>en tus manos
        </h1>
        <p style={{ color:"#555", fontSize:"13px", maxWidth:"260px", margin:"0 auto 24px", lineHeight:1.7 }}>
          Grabá un video o audio y la IA detecta su estado emocional al instante
        </p>

        {/* Selector de mascota activa */}
        {pets.length > 0 && (
          <div style={{ marginBottom:"20px" }}>
            <p style={{ color:"#555", fontSize:"11px", marginBottom:"10px" }}>¿Qué mascota analizamos hoy?</p>
            <div style={{ display:"flex", gap:"8px", justifyContent:"center", flexWrap:"wrap", padding:"0 16px" }}>
              {pets.map((p) => (
                <button key={p.id} style={S.petChip(activePet?.id === p.id)} onClick={() => setActivePet(p)}>
                  {p.type === "gato" ? "🐱" : "🐶"} {p.name}
                </button>
              ))}
              <button style={{ ...S.petChip(false), color:"#D4AF37", border:"1px solid #D4AF37" }} onClick={() => setShowAddPet(true)}>
                + Agregar
              </button>
            </div>
          </div>
        )}

        {/* Botón principal */}
        {activePet ? (
          <div>
            <button style={S.pBtn} onClick={handleStartCapture}>
              {activePet.type === "gato" ? "🐱" : "🐶"} Analizar a {activePet.name}
            </button>
            <div style={{ color:"#444", fontSize:"11px", marginTop:"8px" }}>
              {usesLeft > 0 ? `${usesLeft} análisis gratis restantes` : "📦 Activá Pro para continuar"}
            </div>
          </div>
        ) : (
          <button style={S.pBtn} onClick={() => setShowAddPet(true)}>
            + Agregar mi primera mascota
          </button>
        )}
      </div>

      {/* Modal agregar mascota */}
      {showAddPet && (
        <div style={{ position:"fixed", inset:0, background:"#000c", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#0F0F0F", border:"1px solid #D4AF37", borderRadius:"24px", padding:"28px", margin:"20px", width:"100%", maxWidth:"340px" }}>
            <h3 style={{ color:"#D4AF37", marginBottom:"20px", fontSize:"18px", textAlign:"center" }}>🐾 Nueva Mascota</h3>

            <p style={{ color:"#666", fontSize:"12px", marginBottom:"8px" }}>Tipo</p>
            <div style={{ display:"flex", gap:"10px", marginBottom:"16px" }}>
              {[{ key:"perro", icon:"🐶", label:"Perro" },{ key:"gato", icon:"🐱", label:"Gato" }].map((t) => (
                <button key={t.key} onClick={() => setNewPetType(t.key)}
                  style={{ flex:1, background:newPetType===t.key?"linear-gradient(135deg,#D4AF37,#B8963E)":"#161616", color:newPetType===t.key?"#080808":"#888", border:newPetType===t.key?"none":"1px solid #222", borderRadius:"14px", padding:"12px", cursor:"pointer", fontWeight:newPetType===t.key?"700":"400" }}>
                  <div style={{ fontSize:"28px", marginBottom:"4px" }}>{t.icon}</div>
                  {t.label}
                </button>
              ))}
            </div>

            <p style={{ color:"#666", fontSize:"12px", marginBottom:"8px" }}>Nombre</p>
            <input
              style={{ background:"#161616", border:"1px solid #333", borderRadius:"12px", color:"#F0EBE0", padding:"12px 16px", width:"100%", fontSize:"15px", outline:"none", boxSizing:"border-box", marginBottom:"20px" }}
              placeholder={newPetType === "gato" ? "Ej: Luna, Michi..." : "Ej: Max, Pelusa..."}
              value={newPetName}
              onChange={(e) => setNewPetName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddPet()}
            />

            <div style={{ display:"flex", gap:"10px" }}>
              <button style={{ ...S.gBtn, flex:1 }} onClick={() => { setShowAddPet(false); setNewPetName(""); }}>Cancelar</button>
              <button style={{ ...S.pBtn, flex:2, padding:"12px" }} onClick={handleAddPet}>Guardar 🐾</button>
            </div>
          </div>
        </div>
      )}

      {/* Estados por especie */}
      <div style={{ padding:"8px 12px 16px" }}>
        {[{ esp:"perro", color:"#D4AF37", label:"🐶 Estados detectados en Perros" },{ esp:"gato", color:"#9B7FD4", label:"🐱 Estados detectados en Gatos" }].map(({ esp, color, label }) => (
          <div key={esp} style={{ background:"#0A0A0A", border:"1px solid #161616", borderRadius:"18px", padding:"16px", marginBottom:"10px" }}>
            <div style={{ color, fontWeight:"700", fontSize:"11px", marginBottom:"10px", letterSpacing:"1px" }}>{label}</div>
            <div style={{ display:"flex", gap:"16px", flexWrap:"wrap" }}>
              {Object.values(MOOD[esp]).map((m) => (
                <div key={m.label} style={{ textAlign:"center" }}>
                  <div style={{ fontSize:"28px" }}>{m.emoji}</div>
                  <div style={{ color:"#444", fontSize:"9px", marginTop:"2px" }}>{m.label.split("/")[0].trim()}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Login CTA si no hay usuario */}
      {!user && (
        <div style={{ ...S.cGold, textAlign:"center" }}>
          <div style={{ fontSize:"28px", marginBottom:"8px" }}>🔐</div>
          <div style={{ color:"#D4AF37", fontWeight:"700", marginBottom:"6px" }}>Guardá tu historial</div>
          <div style={{ color:"#666", fontSize:"12px", marginBottom:"16px" }}>Iniciá sesión con Google para no perder el historial de tus mascotas</div>
          <button style={{ ...S.pBtn, maxWidth:"220px" }} onClick={handleGoogleLogin}>
            {authLoading ? "Conectando..." : "🔑 Ingresar con Google"}
          </button>
        </div>
      )}

      <div style={{ height:"32px" }} />
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // CAPTURA
  // ════════════════════════════════════════════════════════════
  if (screen === "capture") return (
    <div style={{ ...S.app, display:"flex", flexDirection:"column" }}>
      <nav style={S.nav}>
        <button style={{ ...S.gBtn, color:"#D4AF37", border:"none", fontSize:"14px" }} onClick={() => { stopCamera(); setScreen("home"); }}>← Volver</button>
        <span style={S.logo}>{activePet?.type === "gato" ? "🐱" : "🐶"} {activePet?.name}</span>
        <span style={{ width:"60px" }} />
      </nav>

      <div style={{ padding:"8px 14px 0", textAlign:"center" }}>
        <p style={{ color:"#555", fontSize:"11px" }}>Grabá ~10 segundos · Whisper analizará el sonido real</p>
      </div>

      <div style={{ display:"flex", gap:"8px", margin:"8px 14px", justifyContent:"center" }}>
        <button style={S.modeBtn(captureMode==="video")} onClick={() => setCaptureMode("video")}>
          <div style={{ fontSize:"20px", marginBottom:"3px" }}>📹</div>Video + Audio
        </button>
        <button style={S.modeBtn(captureMode==="audio")} onClick={() => setCaptureMode("audio")}>
          <div style={{ fontSize:"20px", marginBottom:"3px" }}>🎙️</div>Solo Audio
        </button>
      </div>

      <div style={{ margin:"0 14px", borderRadius:"18px", overflow:"hidden", border:`2px solid ${accent}`, background:"#000", aspectRatio:"4/3", position:"relative" }}>
        <video ref={videoRef} autoPlay muted playsInline style={{ width:"100%", height:"100%", objectFit:"cover" }} />
        {recording && (
          <div style={{ position:"absolute", top:"12px", right:"12px", display:"flex", alignItems:"center", gap:"5px", background:"#000a", borderRadius:"20px", padding:"4px 10px" }}>
            <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:"#E74C3C", animation:"blink 1s infinite" }} />
            <span style={{ color:"#fff", fontSize:"10px" }}>REC</span>
          </div>
        )}
        {recording && countdown > 0 && (
          <div style={{ position:"absolute", bottom:"14px", left:"50%", transform:"translateX(-50%)", background:accent, color:"#080808", borderRadius:"50%", width:"44px", height:"44px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"20px", fontWeight:"900" }}>{countdown}</div>
        )}
        {captureMode === "audio" && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", background:"#000b" }}>
            <div style={{ fontSize:"52px" }}>{recording ? "🔴" : "🎙️"}</div>
            <div style={{ color:accent, fontSize:"12px", marginTop:"8px" }}>{recording ? `Grabando... ${countdown}s` : "Modo Solo Audio"}</div>
          </div>
        )}
        {!recording && captureMode === "video" && (
          <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"linear-gradient(transparent,#000b)", padding:"14px 12px 10px", fontSize:"10px", color:"#888" }}>
            💡 {activePet?.type === "gato" ? "Mostrá orejas, cola y movimientos" : "Mostrá cola, orejas y comportamiento"}
          </div>
        )}
      </div>
      <canvas ref={canvasRef} style={{ display:"none" }} />

      <div style={{ padding:"16px 14px", textAlign:"center" }}>
        <button
          style={{ ...S.pBtn, background: recording ? "linear-gradient(135deg,#E74C3C,#C0392B)" : activePet?.type === "gato" ? "linear-gradient(135deg,#9B7FD4,#6B4FBB)" : "linear-gradient(135deg,#D4AF37,#B8963E)" }}
          onClick={handleRecord}
        >
          {recording ? `⏹ Detener (${countdown}s)` : `⏺ Grabar a ${activePet?.name}`}
        </button>
        <div style={{ color:"#333", fontSize:"10px", marginTop:"8px" }}>✦ Whisper analiza el audio real</div>
      </div>
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}`}</style>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // ANALIZANDO
  // ════════════════════════════════════════════════════════════
  if (screen === "analyzing") return (
    <div style={{ ...S.app, display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh" }}>
      <div style={{ textAlign:"center", padding:"40px 20px" }}>
        <div style={{ fontSize:"64px", marginBottom:"20px", display:"inline-block", animation:"spin 1.8s linear infinite" }}>
          {activePet?.type === "gato" ? "🐱" : "🐾"}
        </div>
        <h2 style={{ color:"#D4AF37", marginBottom:"6px", fontSize:"18px" }}>Analizando a {activePet?.name}...</h2>
        <p style={{ color:"#555", fontSize:"11px", maxWidth:"220px", margin:"0 auto 20px" }}>{analyzeStep}</p>
        <div style={{ display:"flex", flexDirection:"column", gap:"8px", maxWidth:"240px", margin:"0 auto" }}>
          {[
            { icon:"🎙️", label:"Whisper", desc:"Transcribe audio real", done: analyzeStep.includes("Claude") },
            { icon:"🧠", label:"Claude",  desc:"Analiza postura + sonido", done: false },
          ].map((step, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:"10px", background:"#0F0F0F", border:`1px solid ${step.done?"#4CAF50":"#222"}`, borderRadius:"12px", padding:"10px 14px" }}>
              <span style={{ fontSize:"18px" }}>{step.icon}</span>
              <div style={{ flex:1, textAlign:"left" }}>
                <div style={{ color:step.done?"#4CAF50":"#D4AF37", fontSize:"12px", fontWeight:"700" }}>{step.label}</div>
                <div style={{ color:"#555", fontSize:"10px" }}>{step.desc}</div>
              </div>
              <span>{step.done ? "✅" : "⏳"}</span>
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // RESULTADO
  // ════════════════════════════════════════════════════════════
  if (screen === "result" && result && moodInfo) return (
    <div style={S.app}>
      <nav style={S.nav}>
        <button style={{ ...S.gBtn, color:"#D4AF37", border:"none", fontSize:"14px" }} onClick={() => setScreen("home")}>← Inicio</button>
        <span style={S.logo}>🐾 RESULTADO</span>
        <button style={{ ...S.gBtn, background:"linear-gradient(135deg,#D4AF37,#B8963E)", color:"#080808", border:"none", fontWeight:"700", padding:"8px 14px" }} onClick={openVet}>🩺 Dr. Paws</button>
      </nav>

      {/* Card principal */}
      <div style={{ background:moodInfo.grad, borderRadius:"22px", padding:"28px", margin:"12px", textAlign:"center" }}>
        <span style={{ fontSize:"72px", display:"block", marginBottom:"10px" }}>{moodInfo.emoji}</span>
        <h2 style={{ color:"#080808", fontSize:"22px", fontWeight:"900", marginBottom:"6px" }}>{result.petName} está {moodInfo.label}</h2>
        <div style={{ background:"#00000018", borderRadius:"12px", padding:"4px 14px", display:"inline-block", marginBottom:"12px" }}>
          <span style={{ color:"#080808", fontSize:"11px", fontWeight:"700" }}>
            {result.petType === "gato" ? "🐱" : "🐶"} {result.petType === "gato" ? "Gato" : "Perro"} · {result.confianza}% confianza
          </span>
        </div>
        <p style={{ color:"#080808", fontSize:"13px", lineHeight:1.6 }}>{result.explicacion}</p>
      </div>

      {/* Compartir en redes */}
      <div style={S.card}>
        <h3 style={{ color:"#D4AF37", fontSize:"11px", marginBottom:"12px", textTransform:"uppercase", letterSpacing:"1px" }}>📤 Compartir el estado de {result.petName}</h3>
        <div style={{ display:"flex", gap:"8px" }}>
          <button style={S.shareBtn("#25D366")} onClick={() => shareResult("whatsapp")}>💬 WhatsApp</button>
          <button style={S.shareBtn("#1DA1F2")} onClick={() => shareResult("twitter")}>🐦 Twitter</button>
          <button style={S.shareBtn("#1877F2")} onClick={() => shareResult("facebook")}>👥 Facebook</button>
        </div>
      </div>

      {/* Audio transcripto */}
      {result.audioTranscription && (
        <div style={{ ...S.card, border:"1px solid #1E3A1E" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"8px" }}>
            <span style={{ fontSize:"14px" }}>🎙️</span>
            <span style={{ color:"#4CAF50", fontSize:"10px", fontWeight:"700", textTransform:"uppercase", letterSpacing:"1px" }}>Whisper escuchó</span>
          </div>
          <p style={{ color:"#777", fontSize:"12px", fontStyle:"italic", margin:0, lineHeight:1.6 }}>"{result.audioTranscription}"</p>
        </div>
      )}

      {/* Señales */}
      {(result.senales_audio?.length > 0 || result.senales_visuales?.length > 0) && (
        <div style={S.card}>
          {result.senales_audio?.length > 0 && (
            <>
              <h3 style={{ color:"#4CAF50", fontSize:"11px", marginBottom:"8px", textTransform:"uppercase", letterSpacing:"1px" }}>🎙️ Señales de Audio</h3>
              {result.senales_audio.map((s,i) => <div key={i} style={{ color:"#bbb", fontSize:"13px", marginBottom:"6px" }}>· {s}</div>)}
            </>
          )}
          {result.senales_visuales?.length > 0 && (
            <>
              <h3 style={{ color:"#D4AF37", fontSize:"11px", margin:"12px 0 8px", textTransform:"uppercase", letterSpacing:"1px" }}>📸 Señales Visuales</h3>
              {result.senales_visuales.map((s,i) => <div key={i} style={{ color:"#bbb", fontSize:"13px", marginBottom:"6px" }}>· {s}</div>)}
            </>
          )}
        </div>
      )}

      {/* Consejo */}
      <div style={S.cGold}>
        <h3 style={{ color:"#D4AF37", fontSize:"11px", marginBottom:"8px", textTransform:"uppercase", letterSpacing:"1px" }}>💡 Consejo para {result.petName}</h3>
        <p style={{ color:"#bbb", fontSize:"13px", lineHeight:1.6, margin:0 }}>{moodInfo.tip}</p>
      </div>

      {/* Enfermedades */}
      {diseases.length > 0 && (
        <div style={{ ...S.card, border:"1px solid #3A1E1E" }}>
          <h3 style={{ color:"#E74C3C", fontSize:"11px", marginBottom:"10px", textTransform:"uppercase", letterSpacing:"1px" }}>🏥 Condiciones a descartar</h3>
          {diseases.map((d,i) => <div key={i} style={{ color:"#bbb", fontSize:"13px", marginBottom:"6px" }}>⚠️ {d}</div>)}
          <div style={{ marginTop:"10px", padding:"9px", background:"#1A0000", borderRadius:"9px" }}>
            <p style={{ color:"#E74C3C", fontSize:"11px", margin:0 }}>Esto no reemplaza una consulta veterinaria profesional.</p>
          </div>
        </div>
      )}

      <div style={{ padding:"12px", display:"flex", flexDirection:"column", gap:"10px", paddingBottom:"36px" }}>
        <button style={{ ...S.pBtn, background:"linear-gradient(135deg,#D4AF37,#B8963E)", fontSize:"16px", padding:"16px" }} onClick={openVet}>🩺 Consultar con Dr. Paws</button>
        <button style={S.sBtn} onClick={() => { setResult(null); setScreen("home"); }}>📹 Nuevo Análisis</button>
        <button style={S.gBtn} onClick={() => setScreen("history")}>📁 Ver Mis Estados</button>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // HISTORIAL — MIS ESTADOS
  // ════════════════════════════════════════════════════════════
  if (screen === "history") return (
    <div style={S.app}>
      <nav style={S.nav}>
        <button style={{ ...S.gBtn, color:"#D4AF37", border:"none", fontSize:"14px" }} onClick={() => setScreen("home")}>← Inicio</button>
        <span style={S.logo}>📁 MIS ESTADOS</span>
        <span style={{ width:"60px" }} />
      </nav>

      {pets.length === 0 ? (
        <div style={{ textAlign:"center", padding:"80px 24px" }}>
          <div style={{ fontSize:"52px", marginBottom:"14px" }}>📁</div>
          <p style={{ color:"#555" }}>Aún no tenés mascotas registradas</p>
          <button style={{ ...S.pBtn, marginTop:"20px" }} onClick={() => { setScreen("home"); setShowAddPet(true); }}>+ Agregar mascota</button>
        </div>
      ) : (
        <div style={{ padding:"14px" }}>
          {pets.map((pet) => {
            const petMoodMap = MOOD[pet.type] || MOOD.perro;
            const hist = pet.history || [];
            return (
              <div key={pet.id} style={{ marginBottom:"24px" }}>
                {/* Header mascota */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"12px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                    <div style={{ fontSize:"32px" }}>{pet.type === "gato" ? "🐱" : "🐶"}</div>
                    <div>
                      <div style={{ color:"#D4AF37", fontWeight:"700", fontSize:"16px" }}>{pet.name}</div>
                      <div style={{ color:"#555", fontSize:"11px" }}>{hist.length} análisis guardados</div>
                    </div>
                  </div>
                  <button style={{ ...S.pBtn, width:"auto", padding:"8px 16px", fontSize:"12px" }}
                    onClick={() => { setActivePet(pet); handleStartCapture(); }}>
                    + Analizar
                  </button>
                </div>

                {/* Resumen emocional */}
                {hist.length > 0 && (
                  <div style={{ display:"flex", gap:"8px", overflowX:"auto", paddingBottom:"8px", marginBottom:"10px" }}>
                    {Object.entries(petMoodMap).map(([key, m]) => {
                      const count = hist.filter((h) => h.estado === key).length;
                      return count > 0 ? (
                        <div key={key} style={{ background:"#0F0F0F", border:"1px solid #1E1E1E", borderRadius:"14px", padding:"10px 12px", textAlign:"center", minWidth:"64px" }}>
                          <div style={{ fontSize:"22px" }}>{m.emoji}</div>
                          <div style={{ color:"#D4AF37", fontWeight:"700", fontSize:"14px" }}>{count}</div>
                          <div style={{ color:"#444", fontSize:"9px" }}>{m.label.split("/")[0].trim()}</div>
                        </div>
                      ) : null;
                    })}
                  </div>
                )}

                {/* Lista de análisis */}
                {hist.length === 0 ? (
                  <div style={{ background:"#0A0A0A", borderRadius:"14px", padding:"16px", textAlign:"center", color:"#444", fontSize:"12px" }}>
                    Aún no hay análisis para {pet.name}
                  </div>
                ) : (
                  [...hist].reverse().map((h, i) => {
                    const m = petMoodMap[h.estado] || petMoodMap.alegre;
                    return (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:"12px", padding:"12px 0", borderBottom:"1px solid #111" }}>
                        <div style={{ fontSize:"32px" }}>{m.emoji}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:"700", color:"#F0EBE0", fontSize:"13px" }}>{m.label}</div>
                          <div style={{ color:"#555", fontSize:"10px" }}>{h.fecha} · {h.confianza}% confianza</div>
                          {h.audioTranscription && (
                            <div style={{ color:"#444", fontSize:"10px", fontStyle:"italic", marginTop:"2px" }}>🎙️ "{h.audioTranscription.substring(0,40)}..."</div>
                          )}
                        </div>
                        <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:m.color }} />
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // VET CHAT
  // ════════════════════════════════════════════════════════════
  if (screen === "vet") return (
    <div style={{ ...S.app, display:"flex", flexDirection:"column", height:"100vh" }}>
      <nav style={S.nav}>
        <button style={{ ...S.gBtn, color:"#D4AF37", border:"none", fontSize:"14px" }} onClick={() => setScreen(result ? "result" : "home")}>← Volver</button>
        <span style={S.logo}>🩺 DR. PAWS</span>
        <span style={{ width:"60px" }} />
      </nav>
      <div style={{ background:"#0A0A0A", borderBottom:"1px solid #1A1A1A", padding:"10px 16px", display:"flex", alignItems:"center", gap:"12px" }}>
        <div style={{ width:"40px", height:"40px", background:"linear-gradient(135deg,#D4AF37,#B8963E)", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"20px" }}>🐾</div>
        <div>
          <div style={{ fontWeight:"700", color:"#D4AF37", fontSize:"14px" }}>Dr. Paws</div>
          <div style={{ color:"#4CAF50", fontSize:"10px" }}>● En línea · Especialista canino & felino</div>
        </div>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"14px", display:"flex", flexDirection:"column", gap:"10px" }}>
        {vetMsgs.map((m,i) => (
          <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
            <div style={S.bubble(m.role==="user")}>{m.content}</div>
          </div>
        ))}
        {vetLoading && <div style={{ display:"flex" }}><div style={S.bubble(false)}>Dr. Paws está escribiendo...</div></div>}
      </div>
      <div style={{ padding:"10px 14px", borderTop:"1px solid #1A1A1A", background:"#0A0A0A", display:"flex", gap:"8px" }}>
        <input
          style={{ background:"#0F0F0F", border:"1px solid #222", borderRadius:"50px", color:"#F0EBE0", padding:"12px 18px", flex:1, fontSize:"13px", outline:"none" }}
          placeholder={`Preguntale al Dr. Paws sobre ${activePet?.name || "tu mascota"}...`}
          value={vetInput}
          onChange={(e) => setVetInput(e.target.value)}
          onKeyDown={(e) => e.key==="Enter" && handleVetSend()}
        />
        <button onClick={handleVetSend} style={{ background:"linear-gradient(135deg,#D4AF37,#B8963E)", border:"none", borderRadius:"50%", width:"44px", height:"44px", cursor:"pointer", fontSize:"16px" }}>→</button>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // PAYWALL
  // ════════════════════════════════════════════════════════════
  if (screen === "paywall") return (
    <div style={S.app}>
      <nav style={S.nav}>
        <button style={{ ...S.gBtn, color:"#D4AF37", border:"none", fontSize:"14px" }} onClick={() => setScreen("home")}>← Volver</button>
        <span style={S.logo}>🐾 ANIMUSPET</span>
        <span style={{ width:"60px" }} />
      </nav>
      <div style={{ textAlign:"center", padding:"40px 20px 14px" }}>
        <div style={{ fontSize:"52px", marginBottom:"14px" }}>🔒</div>
        <h2 style={{ color:"#D4AF37", fontSize:"24px", marginBottom:"8px" }}>Análisis agotados</h2>
        <p style={{ color:"#555", fontSize:"13px" }}>Usaste tus {FREE_LIMIT} análisis gratuitos. Activá Pro para continuar.</p>
      </div>
      <div style={{ background:"linear-gradient(135deg,#150F00,#0A0800)", border:"2px solid #D4AF37", borderRadius:"22px", padding:"28px", margin:"14px", textAlign:"center" }}>
        <div style={{ background:"#D4AF37", color:"#080808", borderRadius:"20px", padding:"4px 14px", display:"inline-block", fontSize:"10px", fontWeight:"700", marginBottom:"14px", letterSpacing:"1px" }}>⭐ MÁS POPULAR</div>
        <h3 style={{ color:"#D4AF37", fontSize:"30px", fontWeight:"900", margin:"0 0 4px" }}>$4.99<span style={{ fontSize:"15px", color:"#666" }}>/mes</span></h3>
        <p style={{ color:"#666", fontSize:"12px", marginBottom:"20px" }}>Plan Pro · AnimusPet</p>
        {[
          "✅ Análisis ilimitados",
          "✅ Múltiples mascotas",
          "✅ Historial completo",
          "✅ Dr. Paws sin límites",
          "✅ Audio real via Whisper",
          "✅ Compartir en redes",
        ].map((f) => <div key={f} style={{ color:"#bbb", fontSize:"13px", marginBottom:"7px", textAlign:"left" }}>{f}</div>)}
        <button style={{ ...S.pBtn, marginTop:"20px" }} onClick={() => window.open(MP_PLAN_URL, "_blank")}>
          💳 Activar con MercadoPago
        </button>
        <p style={{ color:"#444", fontSize:"10px", marginTop:"10px" }}>Pago seguro · Cancelá cuando quieras</p>
      </div>
      <div style={{ textAlign:"center", padding:"14px 14px 32px" }}>
        <button style={S.gBtn} onClick={() => setScreen("home")}>Volver al inicio</button>
      </div>
    </div>
  );

  return null;
}
