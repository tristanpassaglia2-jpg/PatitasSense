import { useState, useRef, useEffect } from "react";

// ============================================================
// ⚠️  PEGÁ SOLO ESTA KEY — el resto ya está configurado
// ============================================================
const OPENAI_KEY = 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; // sk-proj-...
// Claude API Key → ya está en Vercel como ANTHROPIC_API_KEY
// ============================================================

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBhfZ8S6QIq5CFRiqN-YptL1AicYmSubkY",
  authDomain: "animuspet.firebaseapp.com",
  projectId: "animuspet",
  storageBucket: "animuspet.firebasestorage.app",
  messagingSenderId: "348600064091",
  appId: "1:348600064091:web:718edd9365f8dcee6b877e",
};

const FREE_LIMIT  = 5;
const STORAGE_KEY = "ap_uses_v6";
const PETS_KEY    = "ap_pets_v6";
const MP_URL      = "https://www.mercadopago.com.ar/subscriptions";

// ── DATOS ────────────────────────────────────────────────────
const MOODS = {
  perro: {
    alegre:  { emoji:"😊", label:"Alegre",             color:"#F5C842", grad:"135deg,#F5C842,#E8A020", tip:"Aprovechá para jugar y reforzar el vínculo. ¡Es su mejor momento!" },
    triste:  { emoji:"😢", label:"Triste / Ansioso",   color:"#6BA3D4", grad:"135deg,#6BA3D4,#3A7AB5", tip:"Pasá tiempo de calidad con él. Si persiste más de 3 días, consultá un vet." },
    enojado: { emoji:"😠", label:"Enojado / Alerta",   color:"#E74C3C", grad:"135deg,#E74C3C,#C0392B", tip:"Identificá qué lo estresó. Retirá estímulos amenazantes y dále espacio." },
    enfermo: { emoji:"🤒", label:"Posible Enfermedad", color:"#E67E22", grad:"135deg,#E67E22,#D35400", tip:"Consultá con un veterinario cuanto antes. Los síntomas tempranos son clave." },
    celo:    { emoji:"💕", label:"En Celo",            color:"#E91E8C", grad:"135deg,#E91E8C,#AD1457", tip:"Período temporal. Supervisión especial para evitar escapadas." },
  },
  gato: {
    alegre:   { emoji:"😸", label:"Contento",           color:"#F5C842", grad:"135deg,#F5C842,#E8A020", tip:"Momento ideal para jugar. Los gatos contentos ronronean y amasan." },
    relajado: { emoji:"😌", label:"Relajado",           color:"#52C878", grad:"135deg,#52C878,#2E8B57", tip:"Tu gato se siente seguro en su entorno. ¡Señal de bienestar!" },
    triste:   { emoji:"😿", label:"Triste / Estresado", color:"#6BA3D4", grad:"135deg,#6BA3D4,#3A7AB5", tip:"Verificá cambios recientes en su entorno. Ofrecele un espacio tranquilo." },
    enojado:  { emoji:"😾", label:"Enojado / Asustado", color:"#E74C3C", grad:"135deg,#E74C3C,#C0392B", tip:"No lo fuerces al contacto. Dále espacio y esperá que se calme solo." },
    enfermo:  { emoji:"🤒", label:"Posible Enfermedad", color:"#E67E22", grad:"135deg,#E67E22,#D35400", tip:"Los gatos esconden el dolor. Cualquier cambio de comportamiento: consultá al vet." },
    celo:     { emoji:"💕", label:"En Celo",            color:"#E91E8C", grad:"135deg,#E91E8C,#AD1457", tip:"Celo frecuente en gatas no castradas. Considerá la esterilización." },
  },
};

const DISEASES = {
  perro: {
    alegre:[], triste:["Ansiedad por separación","Depresión canina","Hipotiroidismo"],
    enojado:["Dolor crónico","Fobia situacional","Problema neurológico"],
    enfermo:["Distemper","Parvovirus","Gastroenteritis","Artritis"],
    celo:["Piometra","Pseudopreñez","Infección reproductiva"],
  },
  gato: {
    alegre:[], relajado:[],
    triste:["Ansiedad felina","Enfermedad renal crónica","Dolor dental"],
    enojado:["Hipertiroidismo","Cistitis idiopática felina","Dolor oculto"],
    enfermo:["FeLV","Calicivirus","Panleukopenia","Diabetes felina"],
    celo:["Piometra","Infección uterina","Quistes ováricos"],
  },
};

// ── FIREBASE ──────────────────────────────────────────────────
let _fbApp = null, _fbAuth = null;
async function getFirebase() {
  if (_fbApp) return { auth: _fbAuth };
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js");
  const { getAuth, GoogleAuthProvider, signInWithPopup, signOut } = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js");
  _fbApp = initializeApp(FIREBASE_CONFIG);
  _fbAuth = getAuth(_fbApp);
  return { auth: _fbAuth, GoogleAuthProvider, signInWithPopup, signOut };
}

// ── WHISPER ───────────────────────────────────────────────────
async function whisper(blob) {
  try {
    const fd = new FormData();
    fd.append("file", new File([blob], "audio.webm", { type: blob.type || "audio/webm" }));
    fd.append("model", "whisper-1");
    fd.append("language", "es");
    fd.append("prompt", "Sonidos animales: ladridos, maullidos, gemidos, gruñidos, aullidos, ronroneos, bufidos.");
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${OPENAI_KEY}` }, body: fd,
    });
    return (await r.json()).text || "";
  } catch { return ""; }
}

// ── CLAUDE via proxy ──────────────────────────────────────────
async function analyze({ frame, audio, mode, type }) {
  const states = type === "perro" ? "alegre|triste|enojado|enfermo|celo" : "alegre|relajado|triste|enojado|enfermo|celo";
  const audioNote = audio ? `\nAudio detectado por Whisper: "${audio}"\n` : "";
  const prompt = `Sos experto en comportamiento ${type === "perro" ? "canino" : "felino"}.${audioNote}
${mode === "video" ? `Analizá la imagen del ${type}: cola, orejas, cuerpo, ojos, expresión.` : ""}
Respondé SOLO JSON sin markdown:
{"estado":"${states}","confianza":85,"explicacion":"2-3 oraciones claras en español","senales_audio":["a1","a2"],"senales_visuales":["v1","v2"],"posible_enfermedad":false,"enfermedad_nota":""}`;

  const content = frame && mode === "video"
    ? [{ type:"image", source:{ type:"base64", media_type:"image/jpeg", data:frame }}, { type:"text", text:prompt }]
    : [{ type:"text", text:prompt }];

  const r = await fetch("/api/analyze", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ messages:[{ role:"user", content }] }),
  });
  const d = await r.json();
  const t = d.content?.map(b => b.text||"").join("")||"";
  return JSON.parse(t.replace(/```json|```/g,"").trim());
}

async function askVet(msgs, type) {
  const r = await fetch("/api/chat", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      system: `Sos el Dr. Paws, veterinario virtual experto de AnimusPet. Español rioplatense, cálido y profesional. Especialista en ${type==="gato"?"felinos":"caninos"}. Respuestas claras de máximo 3 párrafos. Nunca reemplazás consulta presencial. Terminás con consejo concreto.`,
      messages: msgs.map(m=>({ role:m.role, content:m.content })),
    }),
  });
  const d = await r.json();
  return d.content?.[0]?.text || "No pude responder. Intentá de nuevo.";
}

// ═══════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [page,      setPage]      = useState("home");
  const [pets,      setPets]      = useState([]);
  const [pet,       setPet]       = useState(null);
  const [showAdd,   setShowAdd]   = useState(false);
  const [newName,   setNewName]   = useState("");
  const [newType,   setNewType]   = useState("perro");
  const [mode,      setMode]      = useState("video");
  const [rec,       setRec]       = useState(false);
  const [cd,        setCd]        = useState(0);
  const [step,      setStep]      = useState("");
  const [result,    setResult]    = useState(null);
  const [stream,    setStream]    = useState(null);
  const [uses,      setUses]      = useState(0);
  const [user,      setUser]      = useState(null);
  const [authLoad,  setAuthLoad]  = useState(false);
  const [vetMsgs,   setVetMsgs]   = useState([]);
  const [vetIn,     setVetIn]     = useState("");
  const [vetLoad,   setVetLoad]   = useState(false);

  const vidRef    = useRef(null);
  const canRef    = useRef(null);
  const mrRef     = useRef(null);
  const chunkRef  = useRef([]);
  const vetEndRef = useRef(null);

  useEffect(() => {
    const u = parseInt(localStorage.getItem(STORAGE_KEY)||"0");
    setUses(u);
    const p = JSON.parse(localStorage.getItem(PETS_KEY)||"[]");
    setPets(p);
    if (p.length) setPet(p[0]);
  }, []);

  useEffect(() => {
    vetEndRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [vetMsgs]);

  const savePets = p => { localStorage.setItem(PETS_KEY, JSON.stringify(p)); setPets(p); };

  const addPet = () => {
    if (!newName.trim()) return;
    const np = { id: Date.now(), name: newName.trim(), type: newType, history: [] };
    const updated = [...pets, np];
    savePets(updated);
    setPet(np);
    setNewName("");
    setShowAdd(false);
  };

  const login = async () => {
    setAuthLoad(true);
    try {
      const fb = await getFirebase();
      const provider = new fb.GoogleAuthProvider();
      const res = await fb.signInWithPopup(fb.auth, provider);
      setUser({ name: res.user.displayName, photo: res.user.photoURL });
    } catch(e) {
      console.error(e);
      alert("Error de Firebase. Verificá que el dominio esté autorizado en console.firebase.google.com");
    }
    setAuthLoad(false);
  };

  const logout = async () => {
    try { const fb = await getFirebase(); await fb.signOut(fb.auth); } catch {}
    setUser(null);
  };

  const startCam = async () => {
    const s = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
    setStream(s);
    if (vidRef.current) vidRef.current.srcObject = s;
  };

  const stopCam = () => { stream?.getTracks().forEach(t=>t.stop()); setStream(null); };

  const getFrame = () => {
    if (!vidRef.current||!canRef.current) return null;
    const c = canRef.current, ctx = c.getContext("2d");
    c.width = vidRef.current.videoWidth;
    c.height = vidRef.current.videoHeight;
    ctx.drawImage(vidRef.current,0,0);
    return c.toDataURL("image/jpeg",0.8).split(",")[1];
  };

  const startCapture = async (p) => {
    if (uses >= FREE_LIMIT) { setPage("paywall"); return; }
    const target = p || pet;
    if (!target) { setShowAdd(true); return; }
    setPet(target);
    await startCam();
    setPage("capture");
  };

  const toggleRec = () => {
    if (rec) { mrRef.current?.stop(); setRec(false); setCd(0); return; }
    const frame = getFrame();
    chunkRef.current = [];
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    const mr = new MediaRecorder(stream, { mimeType:mime });
    mr.ondataavailable = e => { if (e.data.size>0) chunkRef.current.push(e.data); };
    mr.onstop = async () => {
      stopCam();
      setPage("analyzing");
      try {
        setStep("🎙️ Whisper transcribe el audio real...");
        const blob = new Blob(chunkRef.current, { type:mime });
        const audio = await whisper(blob);
        setStep("🧠 Claude analiza postura y sonido...");
        const res = await analyze({ frame: mode==="video"?frame:null, audio, mode, type:pet.type });
        res.petName = pet.name;
        res.petType = pet.type;
        res.fecha   = new Date().toLocaleDateString("es-AR");
        res.audio   = audio;
        const newUses = uses + 1;
        localStorage.setItem(STORAGE_KEY, newUses.toString());
        setUses(newUses);
        const updated = pets.map(p => p.id===pet.id ? { ...p, history:[...(p.history||[]),res] } : p);
        savePets(updated);
        setPet(updated.find(p=>p.id===pet.id));
        setResult(res);
        setPage("result");
      } catch(e) {
        console.error(e);
        alert("Error al analizar. Verificá tu conexión e intentá de nuevo.");
        setPage("home");
      }
    };
    mrRef.current = mr;
    mr.start(100);
    setRec(true);
    let c=10; setCd(c);
    const iv = setInterval(()=>{ c--; setCd(c); if(c<=0){clearInterval(iv);mr.stop();setRec(false);} },1000);
  };

  const openVet = () => {
    if (!vetMsgs.length) setVetMsgs([{ role:"assistant", content:`¡Hola! Soy el Dr. Paws 🐾 Veterinario virtual de AnimusPet.${pet?` Veo que analizaste a ${pet.name}.`:""} ¿En qué puedo ayudarte hoy?` }]);
    setPage("vet");
  };

  const sendVet = async () => {
    if (!vetIn.trim()||vetLoad) return;
    const msgs = [...vetMsgs, { role:"user", content:vetIn }];
    setVetMsgs(msgs); setVetIn(""); setVetLoad(true);
    try {
      const reply = await askVet(msgs, pet?.type||"perro");
      setVetMsgs([...msgs, { role:"assistant", content:reply }]);
    } catch {
      setVetMsgs([...msgs, { role:"assistant", content:"Error al conectar. Intentá de nuevo." }]);
    }
    setVetLoad(false);
  };

  const share = platform => {
    if (!result) return;
    const m = (MOODS[result.petType]||MOODS.perro)[result.estado];
    const txt = `${m?.emoji} ¡${result.petName} está ${m?.label} hoy!\nAnalizado con AnimusPet 🐾\nanimuspet.com`;
    const enc = encodeURIComponent(txt);
    window.open({ whatsapp:`https://wa.me/?text=${enc}`, twitter:`https://twitter.com/intent/tweet?text=${enc}`, facebook:`https://www.facebook.com/sharer/sharer.php?u=https://animuspet.com` }[platform], "_blank");
  };

  const moodMap  = result ? (MOODS[result.petType]||MOODS.perro) : MOODS.perro;
  const moodInfo = result ? (moodMap[result.estado]||moodMap.alegre) : null;
  const diseases = result ? (DISEASES[result.petType]?.[result.estado]||[]) : [];
  const left     = Math.max(0, FREE_LIMIT - uses);
  const acc      = pet?.type==="gato" ? "#9B7FD4" : "#D4AF37";

  // ── CSS global ────────────────────────────────────────────────
  const G = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Nunito:wght@400;600;700&display=swap');
    * { box-sizing:border-box; margin:0; padding:0; }
    body { background:#080808; }
    @keyframes spin { to { transform:rotate(360deg); } }
    @keyframes blink { 50% { opacity:.2; } }
    @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
    @keyframes pulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.05); } }
    .fade { animation: fadeUp .4s ease both; }
    .page { min-height:100vh; background:#080808; color:#F0E8D8; font-family:'Nunito',sans-serif; overflow-x:hidden; }
    .serif { font-family:'Playfair Display',serif; }
    .nav { display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid #1A1A1A; background:#050505; position:sticky; top:0; z-index:100; backdrop-filter:blur(10px); }
    .logo { font-family:'Playfair Display',serif; font-size:18px; color:#D4AF37; letter-spacing:2px; }
    .btn-gold { background:linear-gradient(135deg,#D4AF37,#B8963E); color:#080808; border:none; border-radius:50px; padding:18px 40px; font-size:16px; font-weight:700; cursor:pointer; font-family:'Nunito',sans-serif; width:100%; max-width:320px; letter-spacing:.5px; transition:transform .15s,box-shadow .15s; }
    .btn-gold:active { transform:scale(.97); }
    .btn-outline { background:transparent; color:#D4AF37; border:2px solid #D4AF37; border-radius:50px; padding:16px 40px; font-size:15px; font-weight:700; cursor:pointer; font-family:'Nunito',sans-serif; width:100%; max-width:320px; }
    .btn-ghost { background:transparent; color:#666; border:1px solid #2A2A2A; border-radius:50px; padding:10px 22px; font-size:13px; cursor:pointer; font-family:'Nunito',sans-serif; }
    .card { background:#0F0F0F; border:1px solid #1E1E1E; border-radius:24px; padding:24px; margin:12px 16px; }
    .card-gold { background:linear-gradient(135deg,#16100000,#0A0800); border:1px solid #D4AF3755; border-radius:24px; padding:24px; margin:12px 16px; }
    .section-title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:2px; margin-bottom:14px; }
    .pet-chip { display:inline-flex; align-items:center; gap:6px; padding:10px 18px; border-radius:50px; font-size:14px; font-weight:700; cursor:pointer; font-family:'Nunito',sans-serif; transition:all .2s; border:none; }
    .mode-btn { flex:1; max-width:160px; border-radius:18px; padding:18px 12px; cursor:pointer; font-size:14px; font-weight:700; font-family:'Nunito',sans-serif; text-align:center; transition:all .2s; border:none; }
    textarea { background:#0F0F0F; border:1px solid #2A2A2A; border-radius:18px; color:#F0E8D8; padding:14px 20px; font-size:15px; font-family:'Nunito',sans-serif; outline:none; resize:none; line-height:1.5; }
    textarea:focus { border-color:#D4AF37; }
    input[type=text] { background:#0F0F0F; border:1px solid #2A2A2A; border-radius:14px; color:#F0E8D8; padding:16px 20px; font-size:16px; font-family:'Nunito',sans-serif; outline:none; width:100%; }
    input[type=text]:focus { border-color:#D4AF37; }
  `;

  // ── HOME ──────────────────────────────────────────────────────
  if (page==="home") return (
    <div className="page">
      <style>{G}</style>

      <nav className="nav">
        <span className="logo">🐾 ANIMUSPET</span>
        <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
          <button className="btn-ghost" style={{ fontSize:"18px", padding:"8px 12px" }} onClick={()=>setPage("history")}>📁</button>
          <button className="btn-ghost" style={{ background:"linear-gradient(135deg,#D4AF37,#B8963E)", color:"#080808", border:"none", fontWeight:"700", padding:"10px 18px" }} onClick={openVet}>🩺 Dr. Paws</button>
          {user
            ? <img src={user.photo} alt="" style={{ width:"36px", height:"36px", borderRadius:"50%", border:"2px solid #D4AF37", cursor:"pointer" }} onClick={logout} title="Cerrar sesión" />
            : <button className="btn-ghost" style={{ color:"#D4AF37", borderColor:"#D4AF37" }} onClick={login}>{authLoad?"...":"Ingresar"}</button>
          }
        </div>
      </nav>

      {/* HERO */}
      <div style={{ textAlign:"center", padding:"52px 24px 32px" }} className="fade">
        <div style={{ display:"inline-block", background:"#0F0A00", border:"1px solid #D4AF3766", color:"#D4AF37", borderRadius:"20px", padding:"6px 18px", fontSize:"11px", marginBottom:"24px", letterSpacing:"2px" }}>
          ✦ WHISPER · CLAUDE VISION · IA MULTIMODAL ✦
        </div>
        <h1 className="serif" style={{ fontSize:"clamp(32px,8vw,56px)", color:"#D4AF37", lineHeight:1.05, marginBottom:"14px" }}>
          El alma de tu<br />mascota, en<br />tus manos
        </h1>
        <p style={{ color:"#666", fontSize:"15px", maxWidth:"280px", margin:"0 auto 36px", lineHeight:1.8 }}>
          Grabá 10 segundos y la IA detecta su estado emocional con audio real
        </p>

        {/* Selector mascota */}
        {pets.length > 0 ? (
          <div style={{ marginBottom:"28px" }}>
            <p style={{ color:"#555", fontSize:"12px", marginBottom:"12px", letterSpacing:"1px", textTransform:"uppercase" }}>¿Quién analizamos hoy?</p>
            <div style={{ display:"flex", gap:"10px", justifyContent:"center", flexWrap:"wrap", padding:"0 16px" }}>
              {pets.map(p => (
                <button key={p.id} className="pet-chip"
                  style={{ background: pet?.id===p.id ? "linear-gradient(135deg,#D4AF37,#B8963E)" : "#111", color: pet?.id===p.id ? "#080808" : "#888", border: pet?.id===p.id ? "none" : "1px solid #2A2A2A" }}
                  onClick={()=>setPet(p)}>
                  {p.type==="gato"?"🐱":"🐶"} {p.name}
                </button>
              ))}
              <button className="pet-chip" style={{ background:"#111", color:"#D4AF37", border:"1px solid #D4AF3766" }} onClick={()=>setShowAdd(true)}>
                + Agregar
              </button>
            </div>
          </div>
        ) : null}

        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"12px" }}>
          {pet ? (
            <button className="btn-gold" style={{ animation:"pulse 2s infinite" }} onClick={()=>startCapture(pet)}>
              {pet.type==="gato"?"🐱":"🐶"} Analizar a {pet.name}
            </button>
          ) : (
            <button className="btn-gold" onClick={()=>setShowAdd(true)}>
              + Agregar mi primera mascota
            </button>
          )}
          <span style={{ color:"#3A3A3A", fontSize:"12px" }}>
            {left > 0 ? `${left} de ${FREE_LIMIT} análisis gratuitos restantes` : "Plan Free agotado · Activá Pro"}
          </span>
        </div>
      </div>

      {/* MODAL AGREGAR MASCOTA */}
      {showAdd && (
        <div style={{ position:"fixed", inset:0, background:"#000000CC", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px" }}>
          <div style={{ background:"#0F0F0F", border:"1px solid #D4AF3766", borderRadius:"28px", padding:"36px 28px", width:"100%", maxWidth:"360px" }} className="fade">
            <h2 className="serif" style={{ color:"#D4AF37", fontSize:"26px", textAlign:"center", marginBottom:"28px" }}>🐾 Nueva Mascota</h2>

            {/* Tipo */}
            <p style={{ color:"#555", fontSize:"12px", marginBottom:"10px", textTransform:"uppercase", letterSpacing:"1px" }}>Tipo de mascota</p>
            <div style={{ display:"flex", gap:"12px", marginBottom:"24px" }}>
              {[{k:"perro",i:"🐶",l:"Perro"},{k:"gato",i:"🐱",l:"Gato"}].map(t=>(
                <button key={t.k} className="mode-btn"
                  style={{ background: newType===t.k ? "linear-gradient(135deg,#D4AF37,#B8963E)" : "#161616", color: newType===t.k ? "#080808" : "#666", border: newType===t.k ? "none" : "1px solid #2A2A2A" }}
                  onClick={()=>setNewType(t.k)}>
                  <div style={{ fontSize:"40px", marginBottom:"8px" }}>{t.i}</div>
                  <div style={{ fontSize:"15px" }}>{t.l}</div>
                </button>
              ))}
            </div>

            {/* Nombre */}
            <p style={{ color:"#555", fontSize:"12px", marginBottom:"10px", textTransform:"uppercase", letterSpacing:"1px" }}>Nombre</p>
            <input type="text"
              placeholder={newType==="gato" ? "Ej: Luna, Michi, Garfield..." : "Ej: Max, Pelusa, Rocky..."}
              value={newName}
              onChange={e=>setNewName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&addPet()}
              style={{ marginBottom:"24px" }}
            />

            <div style={{ display:"flex", gap:"12px" }}>
              <button className="btn-ghost" style={{ flex:1, padding:"14px" }} onClick={()=>{setShowAdd(false);setNewName("");}}>Cancelar</button>
              <button className="btn-gold" style={{ flex:2, padding:"14px", maxWidth:"none" }} onClick={addPet}>Guardar 🐾</button>
            </div>
          </div>
        </div>
      )}

      {/* ESTADOS */}
      <div style={{ padding:"8px 0 16px" }}>
        {[{esp:"perro",col:"#D4AF37",lbl:"🐶 Estados en Perros"},{esp:"gato",col:"#9B7FD4",lbl:"🐱 Estados en Gatos"}].map(({esp,col,lbl})=>(
          <div key={esp} className="card" style={{ background:"#0A0A0A", border:"1px solid #161616" }}>
            <p className="section-title" style={{ color:col }}>{lbl}</p>
            <div style={{ display:"flex", gap:"18px", flexWrap:"wrap" }}>
              {Object.values(MOODS[esp]).map(m=>(
                <div key={m.label} style={{ textAlign:"center" }}>
                  <div style={{ fontSize:"32px" }}>{m.emoji}</div>
                  <div style={{ color:"#444", fontSize:"10px", marginTop:"4px" }}>{m.label.split("/")[0].trim()}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* LOGIN CTA */}
      {!user && (
        <div className="card-gold" style={{ textAlign:"center" }}>
          <div style={{ fontSize:"36px", marginBottom:"10px" }}>🔐</div>
          <h3 className="serif" style={{ color:"#D4AF37", fontSize:"22px", marginBottom:"8px" }}>Guardá tu historial</h3>
          <p style={{ color:"#666", fontSize:"13px", marginBottom:"20px", lineHeight:1.6 }}>Iniciá sesión con Google para no perder el seguimiento emocional de tus mascotas</p>
          <div style={{ display:"flex", justifyContent:"center" }}>
            <button className="btn-gold" style={{ maxWidth:"240px" }} onClick={login}>{authLoad?"Conectando...":"🔑 Ingresar con Google"}</button>
          </div>
        </div>
      )}

      <div style={{ height:"40px" }} />
    </div>
  );

  // ── CAPTURA ───────────────────────────────────────────────────
  if (page==="capture") return (
    <div className="page" style={{ display:"flex", flexDirection:"column" }}>
      <style>{G}</style>
      <nav className="nav">
        <button className="btn-ghost" style={{ color:"#D4AF37", borderColor:"transparent" }} onClick={()=>{stopCam();setPage("home");}}>← Volver</button>
        <span className="logo">{pet?.type==="gato"?"🐱":"🐶"} {pet?.name}</span>
        <span style={{ width:"60px" }} />
      </nav>

      <div style={{ textAlign:"center", padding:"12px 16px 8px" }}>
        <p style={{ color:"#555", fontSize:"12px" }}>Grabá ~10 seg · Whisper analiza el audio real</p>
      </div>

      {/* Selector modo */}
      <div style={{ display:"flex", gap:"10px", margin:"8px 20px", justifyContent:"center" }}>
        {[{k:"video",i:"📹",l:"Video + Audio"},{k:"audio",i:"🎙️",l:"Solo Audio"}].map(m=>(
          <button key={m.k} className="mode-btn"
            style={{ background: mode===m.k ? "linear-gradient(135deg,#D4AF37,#B8963E)" : "#0F0F0F", color: mode===m.k ? "#080808" : "#555", border: mode===m.k ? "none" : "1px solid #222" }}
            onClick={()=>setMode(m.k)}>
            <div style={{ fontSize:"24px", marginBottom:"4px" }}>{m.i}</div>
            <div style={{ fontSize:"12px" }}>{m.l}</div>
          </button>
        ))}
      </div>

      {/* Cámara */}
      <div style={{ margin:"0 16px", borderRadius:"24px", overflow:"hidden", border:`3px solid ${acc}`, background:"#000", aspectRatio:"4/3", position:"relative" }}>
        <video ref={vidRef} autoPlay muted playsInline style={{ width:"100%", height:"100%", objectFit:"cover" }} />

        {rec && <div style={{ position:"absolute", top:"14px", right:"14px", display:"flex", alignItems:"center", gap:"6px", background:"#000000BB", borderRadius:"20px", padding:"6px 14px" }}>
          <div style={{ width:"10px", height:"10px", borderRadius:"50%", background:"#E74C3C", animation:"blink 1s infinite" }} />
          <span style={{ color:"#fff", fontSize:"12px", fontWeight:"700" }}>REC</span>
        </div>}

        {rec && cd > 0 && <div style={{ position:"absolute", bottom:"16px", left:"50%", transform:"translateX(-50%)", background:acc, color:"#080808", borderRadius:"50%", width:"52px", height:"52px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"22px", fontWeight:"900" }}>{cd}</div>}

        {mode==="audio" && <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", background:"#000000CC" }}>
          <div style={{ fontSize:"64px" }}>{rec?"🔴":"🎙️"}</div>
          <div style={{ color:acc, fontSize:"14px", fontWeight:"700", marginTop:"10px" }}>{rec?`Grabando... ${cd}s`:"Modo Solo Audio"}</div>
        </div>}

        {!rec && mode==="video" && <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"linear-gradient(transparent,#000000CC)", padding:"20px 16px 14px", fontSize:"12px", color:"#888" }}>
          💡 {pet?.type==="gato" ? "Mostrá orejas, cola, bigotes y movimientos" : "Mostrá cola, orejas y comportamiento completo"}
        </div>}
      </div>
      <canvas ref={canRef} style={{ display:"none" }} />

      <div style={{ padding:"20px 16px", textAlign:"center" }}>
        <button className="btn-gold"
          style={{ background: rec ? "linear-gradient(135deg,#E74C3C,#C0392B)" : pet?.type==="gato" ? "linear-gradient(135deg,#9B7FD4,#6B4FBB)" : "linear-gradient(135deg,#D4AF37,#B8963E)" }}
          onClick={toggleRec}>
          {rec ? `⏹ Detener (${cd}s)` : `⏺ Grabar a ${pet?.name}`}
        </button>
        <p style={{ color:"#333", fontSize:"11px", marginTop:"10px" }}>✦ Grabación automática de 10 segundos</p>
      </div>
    </div>
  );

  // ── ANALIZANDO ────────────────────────────────────────────────
  if (page==="analyzing") return (
    <div className="page" style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh" }}>
      <style>{G}</style>
      <div style={{ textAlign:"center", padding:"40px 20px" }} className="fade">
        <div style={{ fontSize:"72px", marginBottom:"24px", display:"inline-block", animation:"spin 2s linear infinite" }}>
          {pet?.type==="gato"?"🐱":"🐾"}
        </div>
        <h2 className="serif" style={{ color:"#D4AF37", fontSize:"24px", marginBottom:"8px" }}>Analizando a {pet?.name}...</h2>
        <p style={{ color:"#555", fontSize:"13px", maxWidth:"220px", margin:"0 auto 28px", lineHeight:1.6 }}>{step}</p>
        <div style={{ display:"flex", flexDirection:"column", gap:"10px", maxWidth:"260px", margin:"0 auto" }}>
          {[
            { icon:"🎙️", label:"Whisper", desc:"Transcribe audio real", done: step.includes("Claude") },
            { icon:"🧠", label:"Claude Vision", desc:"Analiza postura + sonido", done: false },
          ].map((s,i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:"12px", background:"#0F0F0F", border:`1px solid ${s.done?"#52C878":"#222"}`, borderRadius:"14px", padding:"12px 16px" }}>
              <span style={{ fontSize:"22px" }}>{s.icon}</span>
              <div style={{ flex:1, textAlign:"left" }}>
                <div style={{ color:s.done?"#52C878":"#D4AF37", fontSize:"13px", fontWeight:"700" }}>{s.label}</div>
                <div style={{ color:"#555", fontSize:"11px" }}>{s.desc}</div>
              </div>
              <span style={{ fontSize:"16px" }}>{s.done?"✅":"⏳"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── RESULTADO ─────────────────────────────────────────────────
  if (page==="result" && result && moodInfo) return (
    <div className="page">
      <style>{G}</style>
      <nav className="nav">
        <button className="btn-ghost" style={{ color:"#D4AF37", borderColor:"transparent" }} onClick={()=>setPage("home")}>← Inicio</button>
        <span className="logo">🐾 RESULTADO</span>
        <button className="btn-ghost" style={{ background:"linear-gradient(135deg,#D4AF37,#B8963E)", color:"#080808", border:"none", fontWeight:"700", padding:"10px 16px" }} onClick={openVet}>🩺 Dr. Paws</button>
      </nav>

      {/* Card resultado */}
      <div style={{ background:`linear-gradient(${moodInfo.grad})`, borderRadius:"28px", padding:"36px 28px", margin:"16px", textAlign:"center" }} className="fade">
        <div style={{ fontSize:"80px", marginBottom:"12px" }}>{moodInfo.emoji}</div>
        <h2 className="serif" style={{ color:"#080808", fontSize:"26px", marginBottom:"8px" }}>{result.petName} está {moodInfo.label}</h2>
        <div style={{ background:"#00000020", borderRadius:"14px", padding:"6px 18px", display:"inline-block", marginBottom:"14px" }}>
          <span style={{ color:"#080808", fontSize:"12px", fontWeight:"700" }}>
            {result.petType==="gato"?"🐱 Gato":"🐶 Perro"} · {result.confianza}% de confianza
          </span>
        </div>
        <p style={{ color:"#080808", fontSize:"14px", lineHeight:1.7 }}>{result.explicacion}</p>
      </div>

      {/* Compartir */}
      <div className="card">
        <p className="section-title" style={{ color:"#D4AF37" }}>📤 Compartir el estado de {result.petName}</p>
        <div style={{ display:"flex", gap:"10px" }}>
          {[{k:"whatsapp",c:"#25D366",l:"💬 WhatsApp"},{k:"twitter",c:"#1DA1F2",l:"🐦 Twitter"},{k:"facebook",c:"#1877F2",l:"👥 Facebook"}].map(s=>(
            <button key={s.k} onClick={()=>share(s.k)}
              style={{ flex:1, background:s.c, color:"#fff", border:"none", borderRadius:"14px", padding:"12px 8px", fontSize:"12px", fontWeight:"700", cursor:"pointer", fontFamily:"'Nunito',sans-serif" }}>
              {s.l}
            </button>
          ))}
        </div>
      </div>

      {/* Audio Whisper */}
      {result.audio && (
        <div className="card" style={{ borderColor:"#1E3A1E" }}>
          <p className="section-title" style={{ color:"#52C878" }}>🎙️ Whisper escuchó</p>
          <p style={{ color:"#666", fontSize:"13px", fontStyle:"italic", lineHeight:1.6 }}>"{result.audio}"</p>
        </div>
      )}

      {/* Señales */}
      {(result.senales_audio?.length||result.senales_visuales?.length) ? (
        <div className="card">
          {result.senales_audio?.length ? <>
            <p className="section-title" style={{ color:"#52C878" }}>🎙️ Señales de Audio</p>
            {result.senales_audio.map((s,i)=><p key={i} style={{ color:"#ccc", fontSize:"14px", marginBottom:"8px", paddingLeft:"8px", borderLeft:"2px solid #52C878" }}>· {s}</p>)}
          </> : null}
          {result.senales_visuales?.length ? <>
            <p className="section-title" style={{ color:"#D4AF37", marginTop:"16px" }}>📸 Señales Visuales</p>
            {result.senales_visuales.map((s,i)=><p key={i} style={{ color:"#ccc", fontSize:"14px", marginBottom:"8px", paddingLeft:"8px", borderLeft:"2px solid #D4AF37" }}>· {s}</p>)}
          </> : null}
        </div>
      ) : null}

      {/* Consejo */}
      <div className="card-gold">
        <p className="section-title" style={{ color:"#D4AF37" }}>💡 Consejo para {result.petName}</p>
        <p style={{ color:"#ccc", fontSize:"14px", lineHeight:1.7 }}>{moodInfo.tip}</p>
      </div>

      {/* Enfermedades */}
      {diseases.length ? (
        <div className="card" style={{ borderColor:"#3A1E1E" }}>
          <p className="section-title" style={{ color:"#E74C3C" }}>🏥 Condiciones a descartar con tu vet</p>
          {diseases.map((d,i)=><p key={i} style={{ color:"#ccc", fontSize:"14px", marginBottom:"8px" }}>⚠️ {d}</p>)}
          <div style={{ background:"#1A000080", borderRadius:"12px", padding:"12px 14px", marginTop:"12px" }}>
            <p style={{ color:"#E74C3C", fontSize:"12px" }}>Esto no reemplaza una consulta veterinaria profesional.</p>
          </div>
        </div>
      ) : null}

      <div style={{ padding:"16px", display:"flex", flexDirection:"column", gap:"12px", paddingBottom:"40px" }}>
        <button className="btn-gold" style={{ fontSize:"17px", padding:"18px" }} onClick={openVet}>🩺 Consultar con Dr. Paws</button>
        <button className="btn-outline" onClick={()=>{setResult(null);setPage("home");}}>📹 Nuevo Análisis</button>
        <div style={{ display:"flex", justifyContent:"center" }}>
          <button className="btn-ghost" onClick={()=>setPage("history")}>📁 Ver Mis Estados</button>
        </div>
      </div>
    </div>
  );

  // ── HISTORIAL ─────────────────────────────────────────────────
  if (page==="history") return (
    <div className="page">
      <style>{G}</style>
      <nav className="nav">
        <button className="btn-ghost" style={{ color:"#D4AF37", borderColor:"transparent" }} onClick={()=>setPage("home")}>← Inicio</button>
        <span className="logo">📁 MIS ESTADOS</span>
        <span style={{ width:"60px" }} />
      </nav>
      {!pets.length ? (
        <div style={{ textAlign:"center", padding:"80px 24px" }}>
          <div style={{ fontSize:"56px", marginBottom:"16px" }}>📁</div>
          <p style={{ color:"#555" }}>Aún no tenés mascotas registradas</p>
          <div style={{ display:"flex", justifyContent:"center", marginTop:"24px" }}>
            <button className="btn-gold" onClick={()=>{setPage("home");setShowAdd(true);}}>+ Agregar mascota</button>
          </div>
        </div>
      ) : (
        <div style={{ padding:"16px" }}>
          {pets.map(p => {
            const pm = MOODS[p.type]||MOODS.perro;
            const h  = p.history||[];
            return (
              <div key={p.id} style={{ marginBottom:"28px" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"14px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
                    <div style={{ fontSize:"36px" }}>{p.type==="gato"?"🐱":"🐶"}</div>
                    <div>
                      <div className="serif" style={{ color:"#D4AF37", fontSize:"20px" }}>{p.name}</div>
                      <div style={{ color:"#555", fontSize:"12px" }}>{h.length} análisis guardados</div>
                    </div>
                  </div>
                  <button className="btn-gold" style={{ width:"auto", padding:"10px 20px", fontSize:"13px", maxWidth:"none" }} onClick={()=>startCapture(p)}>+ Analizar</button>
                </div>

                {h.length > 0 && (
                  <div style={{ display:"flex", gap:"10px", overflowX:"auto", paddingBottom:"10px", marginBottom:"12px" }}>
                    {Object.entries(pm).map(([k,m])=>{
                      const cnt = h.filter(x=>x.estado===k).length;
                      return cnt > 0 ? (
                        <div key={k} style={{ background:"#0F0F0F", border:"1px solid #1E1E1E", borderRadius:"16px", padding:"12px 16px", textAlign:"center", minWidth:"72px" }}>
                          <div style={{ fontSize:"24px" }}>{m.emoji}</div>
                          <div style={{ color:"#D4AF37", fontWeight:"700", fontSize:"16px" }}>{cnt}</div>
                          <div style={{ color:"#444", fontSize:"10px" }}>{m.label.split("/")[0].trim()}</div>
                        </div>
                      ) : null;
                    })}
                  </div>
                )}

                {[...h].reverse().map((x,i)=>{
                  const m = pm[x.estado]||pm.alegre;
                  return (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:"14px", padding:"14px 0", borderBottom:"1px solid #111" }}>
                      <div style={{ fontSize:"32px" }}>{m.emoji}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:"700", color:"#F0E8D8", fontSize:"14px" }}>{m.label}</div>
                        <div style={{ color:"#555", fontSize:"11px" }}>{x.fecha} · {x.confianza}% confianza</div>
                        {x.audio && <div style={{ color:"#333", fontSize:"11px", fontStyle:"italic", marginTop:"2px" }}>🎙️ "{x.audio.substring(0,50)}..."</div>}
                      </div>
                      <div style={{ width:"10px", height:"10px", borderRadius:"50%", background:m.color, flexShrink:0 }} />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── VET ───────────────────────────────────────────────────────
  if (page==="vet") return (
    <div className="page" style={{ display:"flex", flexDirection:"column", height:"100vh" }}>
      <style>{G}</style>
      <nav className="nav">
        <button className="btn-ghost" style={{ color:"#D4AF37", borderColor:"transparent" }} onClick={()=>setPage(result?"result":"home")}>← Volver</button>
        <span className="logo">🩺 DR. PAWS</span>
        <span style={{ width:"60px" }} />
      </nav>

      {/* Header Dr. Paws */}
      <div style={{ background:"#0A0A0A", borderBottom:"1px solid #1A1A1A", padding:"14px 20px", display:"flex", alignItems:"center", gap:"14px" }}>
        <div style={{ width:"46px", height:"46px", background:"linear-gradient(135deg,#D4AF37,#B8963E)", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"22px", flexShrink:0 }}>🐾</div>
        <div>
          <div className="serif" style={{ color:"#D4AF37", fontSize:"18px" }}>Dr. Paws</div>
          <div style={{ color:"#52C878", fontSize:"11px", fontWeight:"700" }}>● En línea · Especialista canino & felino</div>
        </div>
      </div>

      {/* Mensajes */}
      <div style={{ flex:1, overflowY:"auto", padding:"16px", display:"flex", flexDirection:"column", gap:"12px" }}>
        {vetMsgs.map((m,i)=>(
          <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
            <div style={{
              background: m.role==="user" ? "linear-gradient(135deg,#D4AF37,#B8963E)" : "#161616",
              color: m.role==="user" ? "#080808" : "#F0E8D8",
              borderRadius: m.role==="user" ? "22px 22px 6px 22px" : "22px 22px 22px 6px",
              padding:"14px 18px",
              maxWidth:"80%",
              marginLeft: m.role==="user" ? "auto" : "0",
              fontSize:"14px",
              lineHeight:1.6,
              fontFamily:"'Nunito',sans-serif",
            }}>{m.content}</div>
          </div>
        ))}
        {vetLoad && (
          <div style={{ display:"flex" }}>
            <div style={{ background:"#161616", borderRadius:"22px 22px 22px 6px", padding:"14px 18px", fontSize:"14px", color:"#666", fontFamily:"'Nunito',sans-serif" }}>
              Dr. Paws está escribiendo...
            </div>
          </div>
        )}
        <div ref={vetEndRef} />
      </div>

      {/* Input expandible */}
      <div style={{ padding:"12px 16px", borderTop:"1px solid #1A1A1A", background:"#0A0A0A" }}>
        <div style={{ display:"flex", gap:"10px", alignItems:"flex-end" }}>
          <textarea
            rows={2}
            style={{ flex:1 }}
            placeholder={`Preguntale al Dr. Paws sobre ${pet?.name||"tu mascota"}...`}
            value={vetIn}
            onChange={e=>setVetIn(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); sendVet(); } }}
          />
          <button onClick={sendVet}
            style={{ background:"linear-gradient(135deg,#D4AF37,#B8963E)", border:"none", borderRadius:"50%", width:"50px", height:"50px", cursor:"pointer", fontSize:"20px", flexShrink:0, marginBottom:"2px" }}>
            →
          </button>
        </div>
        <p style={{ color:"#333", fontSize:"11px", marginTop:"6px", textAlign:"center" }}>Enter para enviar · Shift+Enter para nueva línea</p>
      </div>
    </div>
  );

  // ── PAYWALL ───────────────────────────────────────────────────
  if (page==="paywall") return (
    <div className="page">
      <style>{G}</style>
      <nav className="nav">
        <button className="btn-ghost" style={{ color:"#D4AF37", borderColor:"transparent" }} onClick={()=>setPage("home")}>← Volver</button>
        <span className="logo">🐾 ANIMUSPET</span>
        <span style={{ width:"60px" }} />
      </nav>
      <div style={{ textAlign:"center", padding:"52px 24px 20px" }} className="fade">
        <div style={{ fontSize:"64px", marginBottom:"16px" }}>🔒</div>
        <h2 className="serif" style={{ color:"#D4AF37", fontSize:"32px", marginBottom:"10px" }}>Análisis agotados</h2>
        <p style={{ color:"#555", fontSize:"14px", lineHeight:1.6 }}>Usaste tus {FREE_LIMIT} análisis gratuitos.<br/>Activá Pro para continuar.</p>
      </div>
      <div style={{ background:"linear-gradient(135deg,#16100080,#0A080080)", border:"2px solid #D4AF37", borderRadius:"28px", padding:"32px", margin:"16px", textAlign:"center" }}>
        <div style={{ background:"#D4AF37", color:"#080808", borderRadius:"20px", padding:"4px 18px", display:"inline-block", fontSize:"11px", fontWeight:"700", marginBottom:"16px", letterSpacing:"1px" }}>⭐ MÁS POPULAR</div>
        <h3 className="serif" style={{ color:"#D4AF37", fontSize:"36px", margin:"0 0 4px" }}>$4.99<span style={{ fontSize:"18px", color:"#666" }}>/mes</span></h3>
        <p style={{ color:"#555", fontSize:"13px", marginBottom:"24px" }}>Plan Pro · AnimusPet</p>
        {["✅ Análisis ilimitados (perros y gatos)","✅ Múltiples mascotas con nombres","✅ Dr. Paws sin límites","✅ Audio real via Whisper","✅ Historial emocional completo","✅ Compartir en redes"].map(f=>(
          <p key={f} style={{ color:"#ccc", fontSize:"14px", marginBottom:"10px", textAlign:"left" }}>{f}</p>
        ))}
        <div style={{ display:"flex", justifyContent:"center", marginTop:"24px" }}>
          <button className="btn-gold" onClick={()=>window.open(MP_URL,"_blank")}>💳 Activar con MercadoPago</button>
        </div>
        <p style={{ color:"#333", fontSize:"11px", marginTop:"12px" }}>Pago seguro · Cancelá cuando quieras</p>
      </div>
      <div style={{ display:"flex", justifyContent:"center", padding:"16px 16px 40px" }}>
        <button className="btn-ghost" onClick={()=>setPage("home")}>Volver al inicio</button>
      </div>
    </div>
  );

  return null;
}
