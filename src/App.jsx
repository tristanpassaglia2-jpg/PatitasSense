import { useState, useRef, useEffect, useCallback } from "react";

// ============================================================
// ⚠️  PEGÁ TUS KEYS AQUÍ ANTES DE SUBIR A GITHUB
// ============================================================
const OPENAI_KEY  = "sk-proj-VnciT0PhcjwMqJH0R86HPDoO5Wzgs9NxWj6AGjfjQrkch3L0FPIiQzPtpcDTaQgSMG6yXEU3kqT3BlbkFJR59k3n1Ijbsq0gV0gm2KyDhfrS0gxN6ekfxy4wmEaKunwmx2wcpiXNqD25-sg4FC3mX4pv6fQA_KEY_AQUI";   // sk-proj-...
// La Claude Key ya está inyectada por el entorno de Anthropic
// ============================================================

const FREE_LIMIT  = 5;
const STORAGE_KEY = "ps_uses_v3";
const HISTORY_KEY = "ps_history_v3";

// ─── MOOD DATA ───────────────────────────────────────────────
const MOOD = {
  perro: {
    alegre:  { emoji:"😊", label:"Alegre",             color:"#FFD700", grad:"linear-gradient(135deg,#FFD700,#FFA500)", tip:"Aprovechá para jugar. Es el momento ideal para reforzar el vínculo." },
    triste:  { emoji:"😢", label:"Triste / Ansioso",   color:"#6B9FD4", grad:"linear-gradient(135deg,#6B9FD4,#4A7AB5)", tip:"Pasá tiempo de calidad. Si persiste más de 3 días, consultá un vet." },
    enojado: { emoji:"😠", label:"Enojado / Alerta",   color:"#E74C3C", grad:"linear-gradient(135deg,#E74C3C,#C0392B)", tip:"Identificá qué lo estresó. Retirá estímulos amenazantes." },
    enfermo: { emoji:"🤒", label:"Posible Enfermedad", color:"#E67E22", grad:"linear-gradient(135deg,#E67E22,#D35400)", tip:"Consultá con un veterinario cuanto antes." },
    celo:    { emoji:"💕", label:"En Celo",            color:"#E91E8C", grad:"linear-gradient(135deg,#E91E8C,#AD1457)", tip:"Período temporal. Supervisión especial para evitar escapadas." },
  },
  gato: {
    alegre:   { emoji:"😸", label:"Contento / Juguetón", color:"#FFD700", grad:"linear-gradient(135deg,#FFD700,#FFA500)", tip:"Los gatos contentos ronronean y amasan. Momento ideal para jugar." },
    relajado: { emoji:"😌", label:"Relajado / Cómodo",   color:"#4CAF50", grad:"linear-gradient(135deg,#4CAF50,#388E3C)", tip:"Tu gato se siente seguro en su entorno. ¡Excelente señal!" },
    triste:   { emoji:"😿", label:"Triste / Estresado",  color:"#6B9FD4", grad:"linear-gradient(135deg,#6B9FD4,#4A7AB5)", tip:"Verificá cambios en su entorno. Ofrecele un espacio seguro." },
    enojado:  { emoji:"😾", label:"Enojado / Asustado",  color:"#E74C3C", grad:"linear-gradient(135deg,#E74C3C,#C0392B)", tip:"No lo fuerces. Dále espacio y esperá que se calme solo." },
    enfermo:  { emoji:"🤒", label:"Posible Enfermedad",  color:"#E67E22", grad:"linear-gradient(135deg,#E67E22,#D35400)", tip:"Los gatos esconden el dolor. Cualquier cambio: consultá al vet." },
    celo:     { emoji:"💕", label:"En Celo",             color:"#E91E8C", grad:"linear-gradient(135deg,#E91E8C,#AD1457)", tip:"Celo frecuente en gatas. Considerá la esterilización." },
  },
};

const DISEASES = {
  perro: {
    alegre:[], triste:["Ansiedad por separación","Depresión canina","Hipotiroidismo"],
    enojado:["Dolor crónico","Problemas neurológicos","Fobia situacional"],
    enfermo:["Distemper","Parvovirus","Gastroenteritis","Infección urinaria","Artritis"],
    celo:["Piometra","Pseudopreñez","Infección reproductiva"],
  },
  gato: {
    alegre:[], relajado:[],
    triste:["Ansiedad felina","Depresión","Enfermedad renal","Dolor dental"],
    enojado:["Dolor oculto","Hipertiroidismo","Cistitis idiopática felina"],
    enfermo:["FeLV","Calicivirus","Panleukopenia","Diabetes felina","Enfermedad renal"],
    celo:["Piometra","Infección uterina","Quistes ováricos"],
  },
};

// ─── WHISPER — transcribir/describir audio real ─────────────
async function transcribeAudio(audioBlob) {
  const formData = new FormData();
  // Convertimos el blob a un archivo .webm que Whisper acepta
  const audioFile = new File([audioBlob], "audio.webm", { type: audioBlob.type || "audio/webm" });
  formData.append("file", audioFile);
  formData.append("model", "whisper-1");
  formData.append("language", "es");
  // Prompt para que Whisper sepa que puede ser un animal y describa sonidos
  formData.append("prompt", "Descripción de sonidos de animales: ladridos, maullidos, gemidos, gruñidos, aullidos, ronroneos, bufidos.");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}` },
    body: formData,
  });
  const data = await res.json();
  // Whisper devuelve el texto transcripto. Si el audio es un sonido animal
  // puede devolver onomatopeyas o silencio — lo manejamos abajo.
  return data.text || "";
}

// ─── CLAUDE — analizar estado emocional ─────────────────────
async function analyzeEmotion({ frame, audioText, captureMode, especie }) {
  const estados = especie === "perro"
    ? "alegre|triste|enojado|enfermo|celo"
    : "alegre|relajado|triste|enojado|enfermo|celo";

  const audioSection = audioText
    ? `\nSONIDO REAL DETECTADO POR WHISPER:\n"${audioText}"\nUsá esta información de sonido como señal primaria.\n`
    : "\nNo se detectó audio claro.\n";

  const posturaSection = especie === "perro"
    ? `POSTURA CANINA: cola (alta/baja/entre patas/moviéndose), orejas (adelante/atrás/caídas), cuerpo (rígido/relajado), expresión (jadeo, boca, mirada)`
    : `POSTURA FELINA: cola (erguida/baja/inflada/envuelta), orejas (adelante/aplastadas/rotadas), cuerpo (arqueado/relajado/enroscado), ojos (dilatados/entrecerrados), bigotes`;

  const prompt = `Sos un experto en comportamiento ${especie === "perro" ? "canino" : "felino"}.
${audioSection}
${captureMode === "video" ? `Analizá también la imagen del ${especie} evaluando:\n${posturaSection}` : ""}

Determiná el estado emocional más probable. Respondé SOLO en JSON sin markdown:
{
  "estado": "${estados}",
  "confianza": 85,
  "explicacion": "2-3 oraciones en español explicando el diagnóstico",
  "senales_audio": ["señal de sonido 1", "señal de sonido 2"],
  "senales_visuales": ["señal visual 1", "señal visual 2"],
  "posible_enfermedad": false,
  "enfermedad_nota": ""
}`;

  const content = frame && captureMode === "video"
    ? [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: frame } },
        { type: "text", text: prompt },
      ]
    : prompt;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content }],
    }),
  });
  const data = await res.json();
  const text = data.content?.map((b) => b.text || "").join("") || "";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ─── DR. PAWS chat ───────────────────────────────────────────
async function chatVet(messages, especie) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: `Sos el Dr. Paws, veterinario virtual de PatitasSense. Español rioplatense, cálido y profesional. Especialista en ${especie === "gato" ? "felinos" : "caninos"}. Máximo 3 párrafos. Nunca reemplazás consulta presencial. Terminás con consejo accionable.`,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || "No pude responder. Intentá de nuevo.";
}

// ============================================================
// APP
// ============================================================
export default function App() {
  const [screen,      setScreen]      = useState("home");
  const [especie,     setEspecie]     = useState(null);
  const [captureMode, setCaptureMode] = useState("video");
  const [recording,   setRecording]   = useState(false);
  const [countdown,   setCountdown]   = useState(0);
  const [result,      setResult]      = useState(null);
  const [history,     setHistory]     = useState([]);
  const [usesLeft,    setUsesLeft]    = useState(FREE_LIMIT);
  const [vetMsgs,     setVetMsgs]     = useState([]);
  const [vetInput,    setVetInput]    = useState("");
  const [vetLoading,  setVetLoading]  = useState(false);
  const [stream,      setStream]      = useState(null);
  const [alertShown,  setAlertShown]  = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState(""); // texto del paso actual

  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const mrRef     = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    const uses = parseInt(localStorage.getItem(STORAGE_KEY) || "0");
    setUsesLeft(Math.max(0, FREE_LIMIT - uses));
    setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"));
  }, []);

  useEffect(() => {
    if (history.length >= 3 && !alertShown) {
      const last3 = history.slice(-3).map((h) => h.estado);
      if (last3.every((e) => e === last3[0]) && !["alegre","relajado"].includes(last3[0]))
        setAlertShown(true);
    }
  }, [history, alertShown]);

  const saveResult = useCallback((res, esp) => {
    const uses = parseInt(localStorage.getItem(STORAGE_KEY) || "0") + 1;
    localStorage.setItem(STORAGE_KEY, uses.toString());
    setUsesLeft(Math.max(0, FREE_LIMIT - uses));
    const entry = { ...res, especie: esp, fecha: new Date().toLocaleDateString("es-AR"), timestamp: Date.now() };
    const hist  = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    hist.push(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
    setHistory(hist);
  }, []);

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
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

  const handleStartCapture = async (esp) => {
    if (usesLeft <= 0) { setScreen("paywall"); return; }
    setEspecie(esp);
    await startCamera();
    setScreen("capture");
  };

  const handleRecord = () => {
    if (recording) {
      mrRef.current?.stop();
      setRecording(false);
      setCountdown(0);
      return;
    }

    const frame = captureFrame();
    chunksRef.current = [];

    // Elegimos el mejor formato soportado por el browser
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "audio/mp4";

    const mr = new MediaRecorder(stream, { mimeType });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

    mr.onstop = async () => {
      stopCamera();
      setScreen("analyzing");

      try {
        // PASO 1: Whisper transcribe el audio real
        setAnalyzeStep("🎙️ Whisper está escuchando el audio...");
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        let audioText = "";
        try {
          audioText = await transcribeAudio(audioBlob);
        } catch (e) {
          console.warn("Whisper falló, continuamos sin audio:", e);
        }

        // PASO 2: Claude analiza imagen + descripción de audio
        setAnalyzeStep("🧠 Claude analiza postura y sonido...");
        const res = await analyzeEmotion({
          frame: captureMode === "video" ? frame : null,
          audioText,
          captureMode,
          especie,
        });

        res.audioTranscription = audioText; // guardamos para mostrar
        saveResult(res, especie);
        setResult(res);
        setScreen("result");
      } catch (err) {
        console.error(err);
        alert("Error al analizar. Revisá tus API keys y volvé a intentar.");
        setScreen("home");
      }
    };

    mrRef.current = mr;
    mr.start(100); // chunks cada 100ms
    setRecording(true);

    let c = 10;
    setCountdown(c);
    const iv = setInterval(() => {
      c--;
      setCountdown(c);
      if (c <= 0) { clearInterval(iv); mr.stop(); setRecording(false); }
    }, 1000);
  };

  const handleVetSend = async () => {
    if (!vetInput.trim() || vetLoading) return;
    const newMsgs = [...vetMsgs, { role: "user", content: vetInput }];
    setVetMsgs(newMsgs);
    setVetInput("");
    setVetLoading(true);
    try {
      const reply = await chatVet(newMsgs, especie || "perro");
      setVetMsgs([...newMsgs, { role: "assistant", content: reply }]);
    } catch {
      setVetMsgs([...newMsgs, { role: "assistant", content: "Error. Intentá de nuevo." }]);
    }
    setVetLoading(false);
  };

  const openVet = () => {
    if (vetMsgs.length === 0) {
      setVetMsgs([{ role: "assistant", content: `¡Hola! Soy el Dr. Paws 🐾 Veterinario virtual especialista en ${especie === "gato" ? "gatos" : "perros"}. ¿En qué puedo ayudarte?` }]);
    }
    setScreen("vet");
  };

  const especieActual = result?.especie || especie || "perro";
  const moodMap  = MOOD[especieActual] || MOOD.perro;
  const moodInfo = result ? (moodMap[result.estado] || moodMap.alegre) : null;
  const diseases = result ? (DISEASES[especieActual]?.[result.estado] || []) : [];
  const accent   = especie === "gato" ? "#9B7FD4" : "#D4AF37";

  // ─── ESTILOS ────────────────────────────────────────────────
  const S = {
    app:   { minHeight:"100vh", background:"#080808", color:"#F0EBE0", fontFamily:"'Georgia',serif", overflowX:"hidden" },
    nav:   { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 20px", borderBottom:"1px solid #1C1C1C", background:"#0A0A0A", position:"sticky", top:0, zIndex:100 },
    logo:  { fontSize:"17px", fontWeight:"700", color:"#D4AF37", letterSpacing:"1.5px" },
    navBtn:{ background:"none", border:"none", color:"#666", cursor:"pointer", fontSize:"12px", padding:"4px 8px" },
    pBtn:  { background:"linear-gradient(135deg,#D4AF37,#B8963E)", color:"#080808", border:"none", borderRadius:"50px", padding:"16px 40px", fontSize:"15px", fontWeight:"700", cursor:"pointer", width:"100%", maxWidth:"300px", letterSpacing:"0.3px" },
    sBtn:  { background:"transparent", color:"#D4AF37", border:"2px solid #D4AF37", borderRadius:"50px", padding:"14px 40px", fontSize:"14px", fontWeight:"600", cursor:"pointer", width:"100%", maxWidth:"300px" },
    gBtn:  { background:"transparent", color:"#666", border:"1px solid #2A2A2A", borderRadius:"50px", padding:"10px 24px", fontSize:"13px", cursor:"pointer" },
    card:  { background:"#0F0F0F", border:"1px solid #1E1E1E", borderRadius:"20px", padding:"22px", margin:"14px" },
    cGold: { background:"linear-gradient(135deg,#150F00,#0A0800)", border:"1px solid #D4AF37", borderRadius:"20px", padding:"22px", margin:"14px" },
    modeBtn:(a) => ({ flex:1, maxWidth:"140px", background: a ? "linear-gradient(135deg,#D4AF37,#B8963E)" : "#0F0F0F", color: a ? "#080808" : "#666", border: a ? "none" : "1px solid #222", borderRadius:"14px", padding:"14px 8px", cursor:"pointer", fontSize:"12px", fontWeight: a ? "700" : "400", textAlign:"center" }),
    bubble:(u) => ({ background: u ? "linear-gradient(135deg,#D4AF37,#B8963E)" : "#161616", color: u ? "#080808" : "#F0EBE0", borderRadius: u ? "20px 20px 4px 20px" : "20px 20px 20px 4px", padding:"12px 16px", maxWidth:"83%", marginLeft: u ? "auto" : "0", fontSize:"13px", lineHeight:1.6 }),
  };

  const AlertBanner = () => alertShown ? (
    <div style={{ background:"#1A0000", border:"1px solid #E74C3C", borderRadius:"12px", padding:"14px 16px", margin:"0 14px 14px", display:"flex", gap:"10px" }}>
      <span style={{ fontSize:"18px" }}>🔔</span>
      <div>
        <div style={{ fontWeight:"700", color:"#E74C3C", fontSize:"12px", marginBottom:"4px" }}>Patrón de alerta detectado</div>
        <div style={{ color:"#888", fontSize:"11px" }}>Tu mascota mostró el mismo estado 3 veces seguidas. Consultá con un veterinario.</div>
        <button onClick={openVet} style={{ marginTop:"8px", background:"#E74C3C", color:"#fff", border:"none", borderRadius:"20px", padding:"5px 12px", fontSize:"10px", cursor:"pointer" }}>Consultar Dr. Paws →</button>
      </div>
    </div>
  ) : null;

  // ════════════════════════════════════════════════════════════
  // PANTALLA: HOME
  // ════════════════════════════════════════════════════════════
  if (screen === "home") return (
    <div style={S.app}>
      <nav style={S.nav}>
        <span style={S.logo}>🐾 PATITASSENSE</span>
        <div style={{ display:"flex", gap:"6px" }}>
          <button style={S.navBtn} onClick={() => setScreen("history")}>📊</button>
          <button style={S.navBtn} onClick={openVet}>🩺 Vet</button>
        </div>
      </nav>

      <div style={{ textAlign:"center", padding:"44px 20px 20px" }}>
        <div style={{ display:"inline-block", background:"#0F0A00", border:"1px solid #D4AF37", color:"#D4AF37", borderRadius:"20px", padding:"5px 14px", fontSize:"10px", marginBottom:"20px", letterSpacing:"1px" }}>
          ✦ IA MULTIMODAL · AUDIO REAL + VISIÓN ✦
        </div>
        <h1 style={{ fontSize:"clamp(26px,7vw,46px)", fontWeight:"700", color:"#D4AF37", lineHeight:1.05, marginBottom:"10px" }}>
          Entendé lo que<br/>siente tu mascota
        </h1>
        <p style={{ color:"#666", fontSize:"13px", maxWidth:"280px", margin:"0 auto 12px", lineHeight:1.7 }}>
          Whisper escucha el audio real · Claude analiza la postura · Resultado en segundos
        </p>

        {/* Badge v3 */}
        <div style={{ display:"inline-flex", alignItems:"center", gap:"8px", background:"#0A0F0A", border:"1px solid #4CAF50", borderRadius:"20px", padding:"6px 14px", marginBottom:"32px" }}>
          <span style={{ width:"7px", height:"7px", borderRadius:"50%", background:"#4CAF50", display:"inline-block" }}/>
          <span style={{ color:"#4CAF50", fontSize:"11px", fontWeight:"700" }}>v3 · Audio real via Whisper</span>
        </div>

        <p style={{ color:"#555", fontSize:"12px", marginBottom:"14px" }}>¿Qué mascota querés analizar?</p>

        <div style={{ display:"flex", gap:"12px", padding:"0 20px", marginBottom:"20px" }}>
          {[
            { key:"perro", icon:"🐶", label:"Perro", sub:"5 estados", color:"#D4AF37", border:"#D4AF37", bg:"linear-gradient(135deg,#150F00,#0A0800)" },
            { key:"gato",  icon:"🐱", label:"Gato",  sub:"6 estados", color:"#9B7FD4", border:"#9B7FD4", bg:"linear-gradient(135deg,#0E0A18,#060410)" },
          ].map((sp) => (
            <button key={sp.key} onClick={() => handleStartCapture(sp.key)}
              style={{ flex:1, background:sp.bg, border:`2px solid ${sp.border}`, borderRadius:"18px", padding:"22px 10px", cursor:"pointer", textAlign:"center" }}>
              <div style={{ fontSize:"44px", marginBottom:"6px" }}>{sp.icon}</div>
              <div style={{ color:"#F0EBE0", fontWeight:"700", fontSize:"15px" }}>{sp.label}</div>
              <div style={{ color:sp.color, fontSize:"10px", marginTop:"3px" }}>{sp.sub}</div>
            </button>
          ))}
        </div>

        <div style={{ color:"#444", fontSize:"11px" }}>
          {usesLeft > 0 ? `${usesLeft} análisis gratis restantes` : "📦 Plan Free agotado · Activá Pro"}
        </div>
      </div>

      <AlertBanner />

      {/* Cómo funciona v3 */}
      <div style={{ margin:"0 14px 14px", background:"#0A0F0A", border:"1px solid #1E3A1E", borderRadius:"20px", padding:"20px" }}>
        <div style={{ color:"#4CAF50", fontWeight:"700", fontSize:"12px", marginBottom:"14px" }}>⚡ Cómo funciona v3</div>
        {[
          { icon:"🎙️", t:"Whisper escucha", d:"OpenAI Whisper transcribe el audio real del ladrido o maullido" },
          { icon:"📸", t:"Claude ve la postura", d:"Claude Vision analiza orejas, cola y lenguaje corporal" },
          { icon:"🧠", t:"Diagnóstico combinado", d:"Audio + imagen = resultado con alta precisión" },
        ].map((f) => (
          <div key={f.t} style={{ display:"flex", gap:"12px", alignItems:"flex-start", marginBottom:"12px" }}>
            <span style={{ fontSize:"22px" }}>{f.icon}</span>
            <div>
              <div style={{ color:"#D4AF37", fontWeight:"700", fontSize:"12px" }}>{f.t}</div>
              <div style={{ color:"#555", fontSize:"11px", marginTop:"2px" }}>{f.d}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Estados por especie */}
      <div style={{ padding:"0 14px 14px" }}>
        {[{ esp:"perro", color:"#D4AF37", label:"🐶 Perros" },{ esp:"gato", color:"#9B7FD4", label:"🐱 Gatos" }].map(({ esp, color, label }) => (
          <div key={esp} style={{ background:"#0A0A0A", border:"1px solid #181818", borderRadius:"18px", padding:"16px", marginBottom:"10px" }}>
            <div style={{ color, fontWeight:"700", fontSize:"11px", marginBottom:"10px", letterSpacing:"1px" }}>{label}</div>
            <div style={{ display:"flex", gap:"12px", flexWrap:"wrap" }}>
              {Object.values(MOOD[esp]).map((m) => (
                <div key={m.label} style={{ textAlign:"center" }}>
                  <div style={{ fontSize:"20px" }}>{m.emoji}</div>
                  <div style={{ color:"#444", fontSize:"9px", marginTop:"2px" }}>{m.label.split("/")[0].trim()}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ height:"32px" }} />
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // PANTALLA: CAPTURA
  // ════════════════════════════════════════════════════════════
  if (screen === "capture") return (
    <div style={{ ...S.app, display:"flex", flexDirection:"column" }}>
      <nav style={S.nav}>
        <button style={S.navBtn} onClick={() => { stopCamera(); setScreen("home"); }}>← Volver</button>
        <span style={S.logo}>{especie === "gato" ? "🐱" : "🐶"} CAPTURA</span>
        <span style={{ width:"50px" }} />
      </nav>

      <div style={{ padding:"10px 14px 0", textAlign:"center" }}>
        <p style={{ color:"#555", fontSize:"11px" }}>Grabá ~10 segundos · Whisper analizará el sonido real</p>
      </div>

      <div style={{ display:"flex", gap:"8px", margin:"10px 14px", justifyContent:"center" }}>
        <button style={S.modeBtn(captureMode === "video")} onClick={() => setCaptureMode("video")}>
          <div style={{ fontSize:"20px", marginBottom:"3px" }}>📹</div>Video + Audio
        </button>
        <button style={S.modeBtn(captureMode === "audio")} onClick={() => setCaptureMode("audio")}>
          <div style={{ fontSize:"20px", marginBottom:"3px" }}>🎙️</div>Solo Audio
        </button>
      </div>

      <div style={{ margin:"0 14px", borderRadius:"18px", overflow:"hidden", border:`2px solid ${accent}`, background:"#000", aspectRatio:"4/3", position:"relative" }}>
        <video ref={videoRef} autoPlay muted playsInline style={{ width:"100%", height:"100%", objectFit:"cover" }} />

        {recording && (
          <div style={{ position:"absolute", top:"12px", right:"12px", display:"flex", alignItems:"center", gap:"6px", background:"#000a", borderRadius:"20px", padding:"4px 10px" }}>
            <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:"#E74C3C", animation:"blink 1s infinite" }} />
            <span style={{ color:"#fff", fontSize:"11px" }}>REC</span>
          </div>
        )}
        {recording && countdown > 0 && (
          <div style={{ position:"absolute", bottom:"14px", left:"50%", transform:"translateX(-50%)", background:accent, color:"#080808", borderRadius:"50%", width:"44px", height:"44px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"20px", fontWeight:"900" }}>
            {countdown}
          </div>
        )}
        {captureMode === "audio" && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", background:"#000c" }}>
            <div style={{ fontSize:"52px" }}>{recording ? "🔴" : "🎙️"}</div>
            <div style={{ color:accent, fontSize:"12px", marginTop:"8px" }}>{recording ? `Whisper grabando... ${countdown}s` : "Modo Solo Audio"}</div>
            {recording && <div style={{ color:"#555", fontSize:"10px", marginTop:"4px" }}>Whisper analizará el sonido real</div>}
          </div>
        )}
        {!recording && captureMode === "video" && (
          <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"linear-gradient(transparent,#000c)", padding:"14px 12px 10px", fontSize:"10px", color:"#888" }}>
            💡 {especie === "gato" ? "Mostrá orejas, cola y movimientos" : "Mostrá cola, orejas y si está ladrando"}
          </div>
        )}
      </div>
      <canvas ref={canvasRef} style={{ display:"none" }} />

      <div style={{ padding:"16px 14px", textAlign:"center" }}>
        <button
          style={{ ...S.pBtn, background: recording ? "linear-gradient(135deg,#E74C3C,#C0392B)" : especie === "gato" ? "linear-gradient(135deg,#9B7FD4,#6B4FBB)" : "linear-gradient(135deg,#D4AF37,#B8963E)" }}
          onClick={handleRecord}
        >
          {recording ? `⏹ Detener (${countdown}s)` : "⏺ Grabar (10 seg)"}
        </button>
        <div style={{ color:"#333", fontSize:"10px", marginTop:"8px", display:"flex", alignItems:"center", justifyContent:"center", gap:"6px" }}>
          <span style={{ color:"#4CAF50" }}>✦</span> Whisper analizará el audio real
        </div>
      </div>
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}`}</style>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // PANTALLA: ANALIZANDO
  // ════════════════════════════════════════════════════════════
  if (screen === "analyzing") return (
    <div style={{ ...S.app, display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh" }}>
      <div style={{ textAlign:"center", padding:"40px 20px" }}>
        <div style={{ fontSize:"64px", marginBottom:"20px", display:"inline-block", animation:"spin 1.8s linear infinite" }}>
          {especie === "gato" ? "🐱" : "🐾"}
        </div>
        <h2 style={{ color:"#D4AF37", marginBottom:"6px", fontSize:"20px" }}>Analizando a tu {especie}...</h2>
        <p style={{ color:"#555", fontSize:"12px", maxWidth:"220px", margin:"0 auto 24px" }}>{analyzeStep}</p>

        <div style={{ display:"flex", flexDirection:"column", gap:"8px", maxWidth:"260px", margin:"0 auto" }}>
          {[
            { icon:"🎙️", label:"Whisper", desc:"Transcribe audio real", done: analyzeStep.includes("Claude") },
            { icon:"🧠", label:"Claude",  desc:"Analiza postura + sonido", done: false },
          ].map((step, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:"10px", background:"#0F0F0F", border:`1px solid ${step.done ? "#4CAF50" : "#222"}`, borderRadius:"12px", padding:"10px 14px" }}>
              <span style={{ fontSize:"18px" }}>{step.icon}</span>
              <div style={{ flex:1, textAlign:"left" }}>
                <div style={{ color: step.done ? "#4CAF50" : "#D4AF37", fontSize:"12px", fontWeight:"700" }}>{step.label}</div>
                <div style={{ color:"#555", fontSize:"10px" }}>{step.desc}</div>
              </div>
              <span style={{ fontSize:"14px" }}>{step.done ? "✅" : "⏳"}</span>
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // PANTALLA: RESULTADO
  // ════════════════════════════════════════════════════════════
  if (screen === "result" && result && moodInfo) return (
    <div style={S.app}>
      <nav style={S.nav}>
        <button style={S.navBtn} onClick={() => setScreen("home")}>← Inicio</button>
        <span style={S.logo}>{especieActual === "gato" ? "🐱" : "🐶"} RESULTADO</span>
        <button style={S.navBtn} onClick={openVet}>🩺 Vet</button>
      </nav>

      {/* Card principal */}
      <div style={{ background:moodInfo.grad, borderRadius:"22px", padding:"30px", margin:"14px", textAlign:"center" }}>
        <span style={{ fontSize:"68px", display:"block", marginBottom:"10px" }}>{moodInfo.emoji}</span>
        <h2 style={{ color:"#080808", fontSize:"22px", fontWeight:"900", marginBottom:"6px" }}>{moodInfo.label}</h2>
        <div style={{ background:"#00000018", borderRadius:"12px", padding:"4px 14px", display:"inline-block", marginBottom:"12px" }}>
          <span style={{ color:"#080808", fontSize:"11px", fontWeight:"700" }}>
            {especieActual === "gato" ? "🐱 Gato" : "🐶 Perro"} · {result.confianza}% confianza
          </span>
        </div>
        <p style={{ color:"#080808", fontSize:"13px", lineHeight:1.6 }}>{result.explicacion}</p>
      </div>

      {/* Audio transcripto — novedad de v3 */}
      {result.audioTranscription && (
        <div style={{ ...S.card, border:"1px solid #1E3A1E" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"10px" }}>
            <span style={{ fontSize:"16px" }}>🎙️</span>
            <span style={{ color:"#4CAF50", fontSize:"11px", fontWeight:"700", textTransform:"uppercase", letterSpacing:"1px" }}>Audio real · Whisper</span>
          </div>
          <p style={{ color:"#888", fontSize:"13px", fontStyle:"italic", margin:0, lineHeight:1.6 }}>
            "{result.audioTranscription}"
          </p>
        </div>
      )}

      {/* Señales de audio */}
      {result.senales_audio?.length > 0 && (
        <div style={S.card}>
          <h3 style={{ color:"#4CAF50", fontSize:"11px", marginBottom:"10px", textTransform:"uppercase", letterSpacing:"1px" }}>🎙️ Señales de Audio</h3>
          {result.senales_audio.map((s, i) => (
            <div key={i} style={{ display:"flex", gap:"8px", marginBottom:"7px" }}>
              <span style={{ color:"#4CAF50", fontWeight:"900" }}>·</span>
              <span style={{ color:"#ccc", fontSize:"13px" }}>{s}</span>
            </div>
          ))}
        </div>
      )}

      {/* Señales visuales */}
      {result.senales_visuales?.length > 0 && (
        <div style={S.card}>
          <h3 style={{ color:"#D4AF37", fontSize:"11px", marginBottom:"10px", textTransform:"uppercase", letterSpacing:"1px" }}>📸 Señales Visuales</h3>
          {result.senales_visuales.map((s, i) => (
            <div key={i} style={{ display:"flex", gap:"8px", marginBottom:"7px" }}>
              <span style={{ color:"#D4AF37", fontWeight:"900" }}>·</span>
              <span style={{ color:"#ccc", fontSize:"13px" }}>{s}</span>
            </div>
          ))}
        </div>
      )}

      {/* Consejo */}
      <div style={S.cGold}>
        <h3 style={{ color:"#D4AF37", fontSize:"11px", marginBottom:"8px", textTransform:"uppercase", letterSpacing:"1px" }}>💡 Consejo</h3>
        <p style={{ color:"#bbb", fontSize:"13px", lineHeight:1.6, margin:0 }}>{moodInfo.tip}</p>
      </div>

      {/* Enfermedades */}
      {diseases.length > 0 && (
        <div style={{ ...S.card, border:"1px solid #3A1E1E" }}>
          <h3 style={{ color:"#E74C3C", fontSize:"11px", marginBottom:"10px", textTransform:"uppercase", letterSpacing:"1px" }}>🏥 Condiciones a descartar</h3>
          {diseases.map((d, i) => (
            <div key={i} style={{ display:"flex", gap:"8px", alignItems:"center", marginBottom:"7px" }}>
              <span>⚠️</span><span style={{ color:"#ccc", fontSize:"13px" }}>{d}</span>
            </div>
          ))}
          <div style={{ marginTop:"10px", padding:"9px", background:"#1A0000", borderRadius:"9px" }}>
            <p style={{ color:"#E74C3C", fontSize:"11px", margin:0 }}>Esto no reemplaza una consulta veterinaria profesional.</p>
          </div>
        </div>
      )}

      <div style={{ padding:"14px", display:"flex", flexDirection:"column", gap:"10px", paddingBottom:"36px" }}>
        <button style={S.pBtn} onClick={openVet}>🩺 Consultar con Dr. Paws</button>
        <button style={S.sBtn} onClick={() => { setResult(null); setScreen("home"); }}>📹 Nuevo Análisis</button>
        <button style={S.gBtn} onClick={() => setScreen("history")}>📊 Ver Historial</button>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // PANTALLA: HISTORIAL
  // ════════════════════════════════════════════════════════════
  if (screen === "history") return (
    <div style={S.app}>
      <nav style={S.nav}>
        <button style={S.navBtn} onClick={() => setScreen("home")}>← Inicio</button>
        <span style={S.logo}>📊 HISTORIAL</span>
        <span style={{ width:"50px" }} />
      </nav>
      <AlertBanner />
      {history.length === 0 ? (
        <div style={{ textAlign:"center", padding:"80px 24px" }}>
          <div style={{ fontSize:"52px", marginBottom:"14px" }}>📊</div>
          <p style={{ color:"#555" }}>Aún no tenés análisis guardados</p>
          <button style={{ ...S.pBtn, marginTop:"20px" }} onClick={() => setScreen("home")}>Hacer primer análisis</button>
        </div>
      ) : (
        <div style={{ padding:"14px" }}>
          <h2 style={{ color:"#D4AF37", marginBottom:"4px", fontSize:"18px" }}>Historial emocional</h2>
          <p style={{ color:"#555", fontSize:"12px", marginBottom:"18px" }}>{history.length} registros guardados</p>
          {["perro","gato"].map((esp) => {
            const h2 = history.filter((h) => h.especie === esp);
            if (!h2.length) return null;
            const col = esp === "gato" ? "#9B7FD4" : "#D4AF37";
            return (
              <div key={esp} style={{ marginBottom:"18px" }}>
                <div style={{ color:col, fontWeight:"700", fontSize:"11px", marginBottom:"10px", letterSpacing:"1px" }}>
                  {esp === "gato" ? "🐱 GATOS" : "🐶 PERROS"} · {h2.length} análisis
                </div>
                <div style={{ display:"flex", gap:"8px", overflowX:"auto", paddingBottom:"8px" }}>
                  {Object.entries(MOOD[esp]).map(([key, m]) => {
                    const count = h2.filter((h) => h.estado === key).length;
                    return count > 0 ? (
                      <div key={key} style={{ background:"#0F0F0F", border:"1px solid #1E1E1E", borderRadius:"14px", padding:"10px 12px", textAlign:"center", minWidth:"64px" }}>
                        <div style={{ fontSize:"20px" }}>{m.emoji}</div>
                        <div style={{ color:col, fontWeight:"700", fontSize:"14px" }}>{count}</div>
                        <div style={{ color:"#444", fontSize:"9px" }}>{m.label.split("/")[0].trim()}</div>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            );
          })}
          {[...history].reverse().map((h, i) => {
            const esp = h.especie || "perro";
            const m   = (MOOD[esp] || MOOD.perro)[h.estado] || MOOD.perro.alegre;
            return (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:"10px", padding:"12px 0", borderBottom:"1px solid #141414" }}>
                <div style={{ fontSize:"28px" }}>{m.emoji}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:"700", color:"#F0EBE0", fontSize:"13px" }}>{m.label}</div>
                  <div style={{ color:"#555", fontSize:"10px" }}>{esp === "gato" ? "🐱" : "🐶"} {h.fecha} · {h.confianza}% confianza</div>
                </div>
                <div style={{ width:"7px", height:"7px", borderRadius:"50%", background:m.color }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // PANTALLA: VET
  // ════════════════════════════════════════════════════════════
  if (screen === "vet") return (
    <div style={{ ...S.app, display:"flex", flexDirection:"column", height:"100vh" }}>
      <nav style={S.nav}>
        <button style={S.navBtn} onClick={() => setScreen(result ? "result" : "home")}>← Volver</button>
        <span style={S.logo}>🩺 DR. PAWS</span>
        <span style={{ width:"50px" }} />
      </nav>
      <div style={{ background:"#0A0A0A", borderBottom:"1px solid #1A1A1A", padding:"12px 16px", display:"flex", alignItems:"center", gap:"12px" }}>
        <div style={{ width:"38px", height:"38px", background:"linear-gradient(135deg,#D4AF37,#B8963E)", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"18px" }}>🐾</div>
        <div>
          <div style={{ fontWeight:"700", color:"#D4AF37", fontSize:"14px" }}>Dr. Paws</div>
          <div style={{ color:"#4CAF50", fontSize:"10px" }}>● En línea · Especialista canino & felino</div>
        </div>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"14px", display:"flex", flexDirection:"column", gap:"10px" }}>
        {vetMsgs.map((m, i) => (
          <div key={i} style={{ display:"flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={S.bubble(m.role === "user")}>{m.content}</div>
          </div>
        ))}
        {vetLoading && (
          <div style={{ display:"flex" }}>
            <div style={S.bubble(false)}>Dr. Paws está escribiendo...</div>
          </div>
        )}
      </div>
      <div style={{ padding:"10px 14px", borderTop:"1px solid #1A1A1A", background:"#0A0A0A", display:"flex", gap:"8px" }}>
        <input
          style={{ background:"#0F0F0F", border:"1px solid #222", borderRadius:"50px", color:"#F0EBE0", padding:"12px 18px", flex:1, fontSize:"13px", outline:"none" }}
          placeholder="Preguntale al Dr. Paws..."
          value={vetInput}
          onChange={(e) => setVetInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleVetSend()}
        />
        <button onClick={handleVetSend} style={{ background:"linear-gradient(135deg,#D4AF37,#B8963E)", border:"none", borderRadius:"50%", width:"44px", height:"44px", cursor:"pointer", fontSize:"16px" }}>→</button>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // PANTALLA: PAYWALL
  // ════════════════════════════════════════════════════════════
  if (screen === "paywall") return (
    <div style={S.app}>
      <nav style={S.nav}>
        <button style={S.navBtn} onClick={() => setScreen("home")}>← Volver</button>
        <span style={S.logo}>🐾 PATITASSENSE</span>
        <span style={{ width:"50px" }} />
      </nav>
      <div style={{ textAlign:"center", padding:"40px 20px 14px" }}>
        <div style={{ fontSize:"52px", marginBottom:"14px" }}>🔒</div>
        <h2 style={{ color:"#D4AF37", fontSize:"24px", marginBottom:"8px" }}>Análisis agotados</h2>
        <p style={{ color:"#555", fontSize:"13px" }}>Usaste tus {FREE_LIMIT} análisis gratuitos. Activá Pro para continuar.</p>
      </div>
      <div style={{ background:"linear-gradient(135deg,#150F00,#0A0800)", border:"2px solid #D4AF37", borderRadius:"22px", padding:"28px", margin:"14px", textAlign:"center" }}>
        <div style={{ background:"#D4AF37", color:"#080808", borderRadius:"20px", padding:"4px 14px", display:"inline-block", fontSize:"10px", fontWeight:"700", marginBottom:"14px", letterSpacing:"1px" }}>⭐ MÁS POPULAR</div>
        <h3 style={{ color:"#D4AF37", fontSize:"30px", fontWeight:"900", margin:"0 0 4px" }}>$4.99<span style={{ fontSize:"15px", color:"#666" }}>/mes</span></h3>
        <p style={{ color:"#666", fontSize:"12px", marginBottom:"20px" }}>Plan Pro · PatitasSense</p>
        {[
          "✅ Análisis ilimitados (perros y gatos)",
          "✅ Audio real via Whisper",
          "✅ Historial emocional completo",
          "✅ Dr. Paws sin límites",
          "✅ Alertas de patrón inteligentes",
        ].map((f) => <div key={f} style={{ color:"#bbb", fontSize:"13px", marginBottom:"7px", textAlign:"left" }}>{f}</div>)}
        <button style={{ ...S.pBtn, marginTop:"20px" }}>Activar Plan Pro →</button>
        <p style={{ color:"#444", fontSize:"10px", marginTop:"10px" }}>Próximamente · MercadoPago & Stripe</p>
      </div>
      <div style={{ textAlign:"center", padding:"14px 14px 32px" }}>
        <button style={S.gBtn} onClick={() => setScreen("home")}>Volver al inicio</button>
      </div>
    </div>
  );

  return null;
}
