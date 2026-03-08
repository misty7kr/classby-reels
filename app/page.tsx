"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── 타입 ──────────────────────────────────────────────
type ApiMode = "openai" | "anthropic" | "hybrid";
type Tone = "empathy" | "factbomb" | "compare" | "curiosity" | "story";
type ThemeKey = "dark_gradient" | "light_minimal" | "neon_dark" | "warm_gradient";

interface Cut {
  id: number;
  role: string;
  line1: string;
  line2: string;
}

interface GenerateResult {
  cuts: Cut[];
  theme: ThemeKey;
  accentColor: string;
}

// ── 테마 정의 ──────────────────────────────────────────
const THEMES: Record<ThemeKey, {
  bg: string[];        // gradient stops
  textColor: string;
  subColor: string;
  badgeBg: string;
  badgeText: string;
}> = {
  dark_gradient: {
    bg: ["#0d0d0d", "#1a1a2e", "#16213e"],
    textColor: "#ffffff",
    subColor: "#aaaacc",
    badgeBg: "rgba(255,255,255,0.08)",
    badgeText: "#8888bb",
  },
  light_minimal: {
    bg: ["#f8f8f6", "#f0ede8", "#e8e4de"],
    textColor: "#111111",
    subColor: "#666666",
    badgeBg: "rgba(0,0,0,0.06)",
    badgeText: "#888888",
  },
  neon_dark: {
    bg: ["#040408", "#0a0a18", "#050510"],
    textColor: "#e8ff47",
    subColor: "#7777aa",
    badgeBg: "rgba(232,255,71,0.08)",
    badgeText: "#556633",
  },
  warm_gradient: {
    bg: ["#1a0a00", "#2d1500", "#1a0800"],
    textColor: "#fff4e6",
    subColor: "#cc9966",
    badgeBg: "rgba(255,200,100,0.1)",
    badgeText: "#997744",
  },
};

const TONE_OPTIONS: { value: Tone; label: string; desc: string }[] = [
  { value: "empathy",   label: "공감형",   desc: "학부모/학생 고민에 공감하며 시작" },
  { value: "factbomb",  label: "팩폭형",   desc: "직접적이고 강렬한 사실 제시" },
  { value: "compare",   label: "비교형",   desc: "타 방식 대비 우월성 부각" },
  { value: "curiosity", label: "궁금증형", desc: "호기심을 자극하는 질문으로 시작" },
  { value: "story",     label: "스토리형", desc: "실제 사례처럼 감성적 전개" },
];

const SUBJECT_OPTIONS = ["영어","수학","국어","과학","사회","논술","코딩","전과목"];
const GRADE_OPTIONS   = ["초등 전체","초등 저학년","초등 고학년","중등 전체","중1","중2","중3","고등 전체","고1","고2","고3","재수·N수"];

// ── Canvas 렌더 유틸 ──────────────────────────────────
const REEL_W = 1080;
const REEL_H = 1920;
const CUT_DURATION = 2.5; // seconds per cut
const FPS = 30;

function drawCut(
  ctx: CanvasRenderingContext2D,
  cut: Cut,
  themeKey: ThemeKey,
  accentColor: string,
  progress: number // 0~1 fade
) {
  const theme = THEMES[themeKey] || THEMES.dark_gradient;
  const W = REEL_W;
  const H = REEL_H;

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, W * 0.6, H);
  const stops = theme.bg;
  grad.addColorStop(0, stops[0]);
  grad.addColorStop(0.5, stops[1] || stops[0]);
  grad.addColorStop(1, stops[2] || stops[0]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Subtle grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 80) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 80) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Accent decorative line (left edge)
  const accentGrad = ctx.createLinearGradient(0, H * 0.3, 0, H * 0.7);
  accentGrad.addColorStop(0, "transparent");
  accentGrad.addColorStop(0.5, accentColor);
  accentGrad.addColorStop(1, "transparent");
  ctx.strokeStyle = accentGrad;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(60, H * 0.3); ctx.lineTo(60, H * 0.7); ctx.stroke();

  // Fade in alpha
  ctx.globalAlpha = Math.min(1, progress * 3);

  // Role badge
  ctx.font = `500 36px 'Noto Sans KR', sans-serif`;
  ctx.fillStyle = theme.badgeText;
  const roleW = ctx.measureText(cut.role).width + 40;
  ctx.fillStyle = theme.badgeBg;
  roundRect(ctx, W / 2 - roleW / 2, H / 2 - 220, roleW, 56, 28);
  ctx.fill();
  ctx.fillStyle = theme.badgeText;
  ctx.textAlign = "center";
  ctx.fillText(cut.role, W / 2, H / 2 - 182);

  // Cut number dot
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2 - 270, 8, 0, Math.PI * 2);
  ctx.fill();

  // Main text
  const fontSize = cut.line2 ? 96 : 108;
  ctx.font = `700 ${fontSize}px 'Noto Sans KR', sans-serif`;
  ctx.fillStyle = theme.textColor;
  ctx.textAlign = "center";

  if (cut.line2) {
    ctx.fillText(cut.line1, W / 2, H / 2 - 40);
    ctx.fillText(cut.line2, W / 2, H / 2 + 80);
  } else {
    ctx.fillText(cut.line1, W / 2, H / 2 + 30);
  }

  // Bottom bar
  const barProgress = Math.min(1, progress * 2);
  ctx.fillStyle = accentColor;
  ctx.fillRect(60, H - 80, (W - 120) * barProgress, 3);

  ctx.globalAlpha = 1;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── 보이스 목록 ───────────────────────────────────────
const VOICES = [
  { id: "ZZ4xhVcc83kZBfNIlIIz", label: "Manho · 남성 차분" },
  { id: "6Vgh4FaCc0SCcWPwcyXa", label: "Hyein · 여성 친근" },
  { id: "CxErO97xpQgQXYmapDKX", label: "Theo · 남성 전문가" },
  { id: "F7wT70V3u09d2rY9pNa6", label: "Yura · 여성 에너지" },
  { id: "5XgfKMHL4qnyg2mabE5t", label: "Steven · 남성 신뢰" },
  { id: "m3gJBS8OofDJfycyA2Ip", label: "Taehyung · 남성 자연" },
  { id: "U1cJYS4EdbaHmfR7YzHd", label: "Minho · 남성 강렬" },
  { id: "93nuHbke4dTER9x2pDwE", label: "재밌는 아저씨 🎭" },
] as const;
type VoiceId = typeof VOICES[number]["id"];

// ── 컴포넌트 ──────────────────────────────────────────
export default function Page() {
  // Auth
  const [authOk, setAuthOk]     = useState(false);
  const [pw, setPw]             = useState("");
  const [authErr, setAuthErr]   = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // API
  const [apiMode, setApiMode]           = useState<ApiMode>("openai");
  const [openaiKey, setOpenaiKey]       = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiModel, setOpenaiModel]   = useState("gpt-4o-mini");
  const [anthropicModel]                = useState("claude-sonnet-4-5");

  // Input
  const [academyName, setAcademyName] = useState("");
  const [subject, setSubject]         = useState("영어");
  const [grade, setGrade]             = useState("중등 전체");
  const [region, setRegion]           = useState("송도");
  const [tone, setTone]               = useState<Tone>("empathy");
  const [ctaText, setCtaText]         = useState("");
  const [customMsg, setCustomMsg]     = useState("");

  // Result
  const [result, setResult]   = useState<GenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  // Canvas / Preview
  const canvasRef               = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef        = useRef<HTMLCanvasElement>(null);
  const [activeCut, setActiveCut] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const animFrameRef = useRef<number>(0);
  const editingCuts = useRef<Cut[]>([]);
  const [exportStatus, setExportStatus] = useState("");

  // TTS
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsReady, setTtsReady]     = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<VoiceId>("93nuHbke4dTER9x2pDwE");
  const audioBufferRef = useRef<ArrayBuffer | null>(null);

  // ── localStorage 키 저장/로드 ────────────────────
  useEffect(() => {
    const savedOpenai = localStorage.getItem("classby_openai_key");
    const savedAnthropic = localStorage.getItem("classby_anthropic_key");
    const savedMode = localStorage.getItem("classby_api_mode") as ApiMode | null;
    const savedVoice = localStorage.getItem("classby_voice_id") as VoiceId | null;
    if (savedOpenai) setOpenaiKey(savedOpenai);
    if (savedAnthropic) setAnthropicKey(savedAnthropic);
    if (savedMode) setApiMode(savedMode);
    if (savedVoice) setSelectedVoice(savedVoice);
  }, []);

  // 키 변경 시 자동 저장
  useEffect(() => { if (openaiKey) localStorage.setItem("classby_openai_key", openaiKey); }, [openaiKey]);
  useEffect(() => { if (anthropicKey) localStorage.setItem("classby_anthropic_key", anthropicKey); }, [anthropicKey]);
  useEffect(() => { localStorage.setItem("classby_api_mode", apiMode); }, [apiMode]);
  useEffect(() => { localStorage.setItem("classby_voice_id", selectedVoice); }, [selectedVoice]);

  // ── Auth ──────────────────────────────────────────
  async function doAuth() {
    setAuthLoading(true); setAuthErr(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d?.error || "인증 실패"); }
      setAuthOk(true);
    } catch (e: unknown) { setAuthErr(e instanceof Error ? e.message : "인증 실패"); }
    finally { setAuthLoading(false); }
  }

  // ── Generate ──────────────────────────────────────
  async function generate() {
    setErr(null); setResult(null);
    if (!academyName.trim()) { setErr("학원명을 입력해줘."); return; }
    if ((apiMode === "openai" || apiMode === "hybrid") && !openaiKey.trim()) { setErr("OpenAI API Key를 입력해줘."); return; }
    if ((apiMode === "anthropic" || apiMode === "hybrid") && !anthropicKey.trim()) { setErr("Anthropic API Key를 입력해줘."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiMode, openaiKey, anthropicKey, openaiModel, anthropicModel,
          input: { academyName, subject, grade, region, tone, ctaText, customMsg },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "생성 실패");
      setResult(data);
      editingCuts.current = data.cuts;
      setActiveCut(0);
      // 카피 생성 직후 자동으로 TTS 생성
      generateTTS(data.cuts);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "오류"); }
    finally { setLoading(false); }
  }

  // ── TTS 생성 ──────────────────────────────────────
  async function generateTTS(cuts: Cut[], voiceId?: string) {
    setTtsLoading(true); setTtsReady(false); audioBufferRef.current = null;
    try {
      const script = cuts.map((c) => {
        const t = [c.line1, c.line2].filter(Boolean).join(" ");
        return t;
      }).join(". ");

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: script, voiceId: voiceId || selectedVoice }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error || "TTS 실패");
      }
      const buf = await res.arrayBuffer();
      audioBufferRef.current = buf;
      setTtsReady(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "TTS 오류");
    } finally {
      setTtsLoading(false);
    }
  }

  // ── Preview Canvas draw ───────────────────────────
  const drawPreview = useCallback((cutIdx: number, progress: number) => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !result) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cut = editingCuts.current[cutIdx] || result.cuts[cutIdx];
    if (!cut) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawCut(ctx, cut, result.theme as ThemeKey, result.accentColor, progress);
  }, [result]);

  useEffect(() => {
    if (result) {
      editingCuts.current = result.cuts;
      drawPreview(0, 1);
    }
  }, [result, drawPreview]);

  useEffect(() => {
    if (!isPlaying || !result) return;
    let frame = 0;
    const totalFrames = result.cuts.length * CUT_DURATION * FPS;

    function loop() {
      const cutIdx = Math.min(
        Math.floor(frame / (CUT_DURATION * FPS)),
        result!.cuts.length - 1
      );
      const cutFrame = frame % (CUT_DURATION * FPS);
      const progress = cutFrame / (CUT_DURATION * FPS);
      drawPreview(cutIdx, progress);
      setActiveCut(cutIdx);
      frame++;
      if (frame >= totalFrames) { setIsPlaying(false); setActiveCut(0); drawPreview(0, 1); return; }
      animFrameRef.current = requestAnimationFrame(loop);
    }
    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, result, drawPreview]);

  // ── Export WebM + Audio ──────────────────────────
  async function exportVideo() {
    if (!result || isExporting) return;
    setIsExporting(true);
    setExportProgress(0);
    setExportStatus("영상 렌더링 중...");

    const canvas = canvasRef.current;
    if (!canvas) { setIsExporting(false); return; }
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
    if (!ctx) { setIsExporting(false); return; }
    const safeCtx = ctx as CanvasRenderingContext2D;

    try {
      const exportResult = result;
      const totalFrames = exportResult.cuts.length * CUT_DURATION * FPS;

      // 1) 비디오 스트림 캡처
      const videoStream = canvas.captureStream(FPS);

      // 2) 오디오 스트림 (TTS 있으면 붙이기)
      let finalStream: MediaStream = videoStream;
      let audioCtx: AudioContext | null = null;

      if (audioBufferRef.current) {
        setExportStatus("음성 합성 중...");
        audioCtx = new AudioContext();
        const decoded = await audioCtx.decodeAudioData(audioBufferRef.current.slice(0));
        const dest = audioCtx.createMediaStreamDestination();
        const source = audioCtx.createBufferSource();
        source.buffer = decoded;
        source.connect(dest);

        // 비디오 + 오디오 트랙 합치기
        const combined = new MediaStream([
          ...videoStream.getVideoTracks(),
          ...dest.stream.getAudioTracks(),
        ]);
        finalStream = combined;
        source.start(0);
      }

      setExportStatus("영상 인코딩 중...");

      // 3) MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";
      const recorder = new MediaRecorder(finalStream, {
        mimeType,
        videoBitsPerSecond: 8_000_000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.start();

        let frame = 0;
        function renderFrame() {
          if (frame >= totalFrames) { recorder.stop(); return; }
          const cutIdx = Math.min(
            Math.floor(frame / (CUT_DURATION * FPS)),
            exportResult.cuts.length - 1
          );
          const cutFrame = frame % (CUT_DURATION * FPS);
          const progress = cutFrame / (CUT_DURATION * FPS);
          const cut = editingCuts.current[cutIdx];
          drawCut(safeCtx, cut, exportResult.theme as ThemeKey, exportResult.accentColor, progress);
          setExportProgress(Math.round((frame / totalFrames) * 100));
          frame++;
          setTimeout(renderFrame, 1000 / FPS);
        }
        renderFrame();
      });

      if (audioCtx) audioCtx.close();

      setExportStatus("다운로드 준비 중...");
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reels_${academyName}_${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("영상 내보내기 중 오류가 발생했어요.");
    } finally {
      setIsExporting(false);
      setExportProgress(0);
      setExportStatus("");
    }
  }

  // ── Auth Screen ───────────────────────────────────
  if (!authOk) {
    return (
      <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          {/* Logo */}
          <div style={{ marginBottom: 40, textAlign: "center" }}>
            <div style={{ fontFamily: "Syne, sans-serif", fontSize: 11, letterSpacing: "0.25em", color: "#aaa", marginBottom: 12, textTransform: "uppercase" }}>
              ClassBy
            </div>
            <h1 style={{ fontFamily: "Syne, sans-serif", fontSize: 32, fontWeight: 800, color: "#f0f0f0", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              Reels<br />
              <span style={{ color: "#e8ff47" }}>Studio</span>
            </h1>
            <p style={{ marginTop: 12, color: "#aaa", fontSize: 13 }}>
              설득형 AI 쇼츠 자동화 · 전용 서비스
            </p>
          </div>

          <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 16, padding: 28 }}>
            <label style={{ display: "block", fontSize: 12, color: "#666", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
              Access Code
            </label>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doAuth(); }}
              placeholder="••••••••"
              style={{ fontSize: 16, letterSpacing: "0.15em" }}
            />
            {authErr && (
              <div style={{ marginTop: 12, color: "#ff6b6b", fontSize: 13 }}>{authErr}</div>
            )}
            <button
              onClick={doAuth}
              disabled={authLoading || !pw}
              style={{
                marginTop: 16,
                width: "100%",
                padding: "14px 0",
                background: pw ? "#e8ff47" : "#1a1a1a",
                color: pw ? "#000" : "#444",
                border: "none",
                borderRadius: 10,
                fontFamily: "Syne, sans-serif",
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: "0.05em",
                cursor: pw ? "pointer" : "not-allowed",
                transition: "all 0.2s",
              }}
            >
              {authLoading ? "확인 중..." : "입장"}
            </button>
          </div>

          <p style={{ marginTop: 20, textAlign: "center", color: "#888", fontSize: 12 }}>
            ClassBy 주 7회 플랜 전용 서비스입니다.
          </p>
        </div>
      </div>
    );
  }

  // ── Main App ──────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#f0f0f0" }}>
      {/* Header */}
      <header style={{
        borderBottom: "1px solid #111",
        padding: "16px 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(8,8,8,0.95)",
        backdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em" }}>
            ClassBy <span style={{ color: "#e8ff47" }}>Reels</span>
          </span>
          <span style={{ fontSize: 11, letterSpacing: "0.12em", color: "#888", textTransform: "uppercase" }}>
            Studio
          </span>
        </div>
        <div style={{ fontSize: 12, color: "#888" }}>
          AI · Canvas · Export
        </div>
      </header>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

        {/* ── LEFT: 설정 패널 ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* API 설정 */}
          <Section label="01 API 설정">
            {/* 모드 선택 */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {(["openai", "anthropic", "hybrid"] as ApiMode[]).map((m) => (
                <button key={m} onClick={() => setApiMode(m)} style={{
                  flex: 1, padding: "8px 4px",
                  background: apiMode === m ? "#1a1a1a" : "transparent",
                  border: `1px solid ${apiMode === m ? "#333" : "#1a1a1a"}`,
                  borderRadius: 8, color: apiMode === m ? "#e8ff47" : "#444",
                  fontFamily: "Syne, sans-serif", fontSize: 11, fontWeight: 700,
                  letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer",
                }}>
                  {m === "openai" ? "OpenAI" : m === "anthropic" ? "Claude" : "Hybrid"}
                </button>
              ))}
            </div>

            {(apiMode === "openai" || apiMode === "hybrid") && (
              <div style={{ marginBottom: 12 }}>
                <FieldLabel>OpenAI API Key</FieldLabel>
                <input type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-..." />
                {apiMode === "openai" && (
                  <>
                    <select value={openaiModel} onChange={(e) => setOpenaiModel(e.target.value)} style={{ marginTop: 6 }}>
                      <option value="gpt-4o-mini">gpt-4o-mini (빠름·저렴)</option>
                      <option value="gpt-4o">gpt-4o (고품질)</option>
                      <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                    </select>
                    {openaiKey && (
                      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#e8ff47" }} />
                        <span style={{ fontSize: 11, color: "#e8ff47" }}>브라우저에 저장됨</span>
                        <button onClick={() => { setOpenaiKey(""); localStorage.removeItem("classby_openai_key"); }}
                          style={{ marginLeft: "auto", fontSize: 10, color: "#555", background: "transparent", border: "none", cursor: "pointer" }}>
                          삭제
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {(apiMode === "anthropic" || apiMode === "hybrid") && (
              <div>
                <FieldLabel>Anthropic API Key</FieldLabel>
                <input type="password" value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} placeholder="sk-ant-..." />
                {anthropicKey && (
                  <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#e8ff47" }} />
                    <span style={{ fontSize: 11, color: "#e8ff47" }}>브라우저에 저장됨</span>
                    <button onClick={() => { setAnthropicKey(""); localStorage.removeItem("classby_anthropic_key"); }}
                      style={{ marginLeft: "auto", fontSize: 10, color: "#555", background: "transparent", border: "none", cursor: "pointer" }}>
                      삭제
                    </button>
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* 기본 정보 */}
          <Section label="02 학원 정보">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <FieldLabel>학원명</FieldLabel>
                <input value={academyName} onChange={(e) => setAcademyName(e.target.value)} placeholder="예: 저스틴 영어학원" />
              </div>
              <div>
                <FieldLabel>지역</FieldLabel>
                <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="예: 송도" />
              </div>
              <div>
                <FieldLabel>과목</FieldLabel>
                <select value={subject} onChange={(e) => setSubject(e.target.value)}>
                  {SUBJECT_OPTIONS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <FieldLabel>대상 학년</FieldLabel>
                <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                  {GRADE_OPTIONS.map((g) => <option key={g}>{g}</option>)}
                </select>
              </div>
            </div>
          </Section>

          {/* 톤 선택 */}
          <Section label="03 영상 톤">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {TONE_OPTIONS.map((t) => (
                <button key={t.value} onClick={() => setTone(t.value)} style={{
                  padding: "10px 14px",
                  background: tone === t.value ? "#141414" : "transparent",
                  border: `1px solid ${tone === t.value ? "#2a2a2a" : "#111"}`,
                  borderRadius: 10, textAlign: "left", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: tone === t.value ? "#e8ff47" : "#222",
                    flexShrink: 0,
                  }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: tone === t.value ? "#f0f0f0" : "#555" }}>
                      {t.label}
                    </div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </Section>

          {/* 목소리 선택 */}
          <Section label="04 목소리 선택">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {VOICES.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVoice(v.id as VoiceId)}
                    style={{
                      padding: "10px 12px",
                      background: selectedVoice === v.id ? "#141414" : "transparent",
                      border: `1px solid ${selectedVoice === v.id ? "#e8ff47" : "#111"}`,
                      borderRadius: 10, textAlign: "left", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 8,
                    }}
                  >
                    <div style={{
                      width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                      background: selectedVoice === v.id ? "#e8ff47" : "#222",
                    }} />
                    <span style={{ fontSize: 12, color: selectedVoice === v.id ? "#f0f0f0" : "#666", fontWeight: selectedVoice === v.id ? 600 : 400 }}>
                      {v.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </Section>

          {/* 추가 설정 */}
          <Section label="05 추가 설정">
            <FieldLabel>CTA 문구 (선택)</FieldLabel>
            <input value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder={`예: ${academyName || "학원명"} 지금 상담`} style={{ marginBottom: 10 }} />
            <FieldLabel>강조 포인트 (선택)</FieldLabel>
            <textarea
              value={customMsg}
              onChange={(e) => setCustomMsg(e.target.value)}
              placeholder="예: 개별밀착 방식, 소수정예 5명, 내신 1등급 비율 80% 등"
              rows={3}
              style={{ resize: "none" }}
            />
          </Section>

          {/* 생성 버튼 */}
          {err && (
            <div style={{ padding: "12px 16px", background: "#1a0808", border: "1px solid #3a1010", borderRadius: 10, color: "#ff8888", fontSize: 13 }}>
              {err}
            </div>
          )}
          <button
            onClick={generate}
            disabled={loading}
            style={{
              width: "100%", padding: "16px 0",
              background: loading ? "#0e0e0e" : "#e8ff47",
              color: loading ? "#333" : "#000",
              border: "none", borderRadius: 12,
              fontFamily: "Syne, sans-serif", fontWeight: 800,
              fontSize: 15, letterSpacing: "0.04em",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s",
            }}
          >
            {loading ? "AI 생성 중..." : "설득형 릴스 생성하기"}
          </button>
        </div>

        {/* ── RIGHT: 프리뷰 + 컷 에디터 ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* 숨겨진 고해상도 캔버스 (export용) */}
          <canvas ref={canvasRef} width={REEL_W} height={REEL_H} style={{ display: "none" }} />

          {/* 프리뷰 캔버스 */}
          <div style={{
            background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 16,
            padding: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
              <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#999" }}>
                Preview · 9:16
              </span>
              {result && (
                <div style={{ display: "flex", gap: 8 }}>
                  <SmallBtn onClick={() => {
                    if (isPlaying) { cancelAnimationFrame(animFrameRef.current); setIsPlaying(false); drawPreview(activeCut, 1); }
                    else setIsPlaying(true);
                  }}>
                    {isPlaying ? "정지" : "재생"}
                  </SmallBtn>
                </div>
              )}
            </div>

            {/* 9:16 canvas container */}
            <div style={{
              width: "100%", maxWidth: 280,
              aspectRatio: "9/16",
              borderRadius: 12, overflow: "hidden",
              background: "#000",
              boxShadow: "0 0 40px rgba(0,0,0,0.8)",
            }}>
              <canvas
                ref={previewCanvasRef}
                width={REEL_W}
                height={REEL_H}
                style={{ width: "100%", height: "100%", display: "block" }}
              />
              {!result && (
                <div style={{
                  position: "absolute", inset: 0, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  color: "#888", fontSize: 13, textAlign: "center",
                  pointerEvents: "none",
                }} />
              )}
            </div>

            {/* 컷 인디케이터 */}
            {result && (
              <div style={{ display: "flex", gap: 6 }}>
                {result.cuts.map((_, i) => (
                  <button key={i} onClick={() => { setActiveCut(i); drawPreview(i, 1); }} style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: activeCut === i ? "#e8ff47" : "#1a1a1a",
                    border: `1px solid ${activeCut === i ? "#e8ff47" : "#222"}`,
                    color: activeCut === i ? "#000" : "#555",
                    fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 12,
                    cursor: "pointer",
                  }}>
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 컷 에디터 */}
          {result && (
            <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 16, padding: 20 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#999", marginBottom: 16 }}>
                Script Editor
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {result.cuts.map((cut, i) => (
                  <div key={cut.id} style={{
                    padding: "14px 16px",
                    background: activeCut === i ? "#111" : "transparent",
                    border: `1px solid ${activeCut === i ? "#1e1e1e" : "#111"}`,
                    borderRadius: 10, cursor: "pointer",
                  }} onClick={() => { setActiveCut(i); drawPreview(i, 1); }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 10, color: "#e8ff47", fontFamily: "Syne, sans-serif", fontWeight: 700 }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span style={{ fontSize: 11, color: "#aaa" }}>{cut.role}</span>
                    </div>
                    <input
                      value={editingCuts.current[i]?.line1 ?? cut.line1}
                      onChange={(e) => {
                        const updated = [...editingCuts.current];
                        updated[i] = { ...updated[i], line1: e.target.value };
                        editingCuts.current = updated;
                        drawPreview(i, 1);
                      }}
                      style={{ marginBottom: 6, fontSize: 13, padding: "6px 10px" }}
                      placeholder="1번째 줄"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <input
                      value={editingCuts.current[i]?.line2 ?? cut.line2}
                      onChange={(e) => {
                        const updated = [...editingCuts.current];
                        updated[i] = { ...updated[i], line2: e.target.value };
                        editingCuts.current = updated;
                        drawPreview(i, 1);
                      }}
                      style={{ fontSize: 13, padding: "6px 10px" }}
                      placeholder="2번째 줄 (선택)"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TTS 상태 */}
          {result && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 14px",
              background: ttsReady ? "rgba(232,255,71,0.06)" : "#0a0a0a",
              border: `1px solid ${ttsReady ? "rgba(232,255,71,0.15)" : "#111"}`,
              borderRadius: 10,
            }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                background: ttsReady ? "#e8ff47" : ttsLoading ? "#ff6b35" : "#333",
              }} />
              <span style={{ fontSize: 12, color: ttsReady ? "#e8ff47" : ttsLoading ? "#ff6b35" : "#555", flex: 1 }}>
                {ttsReady ? "음성 준비 완료" : ttsLoading ? "음성 생성 중..." : "음성 없음"}
              </span>
              {!ttsLoading && result && (
                <button onClick={() => generateTTS(editingCuts.current, selectedVoice)} style={{
                  fontSize: 11, color: "#888",
                  background: "transparent", border: "1px solid #222",
                  borderRadius: 6, padding: "3px 10px", cursor: "pointer",
                }}>
                  재생성
                </button>
              )}
            </div>
          )}

          {/* 다운로드 버튼 */}
          {result && (
            <button
              onClick={exportVideo}
              disabled={isExporting || ttsLoading}
              style={{
                width: "100%", padding: "16px 0",
                background: (isExporting || ttsLoading) ? "#0e0e0e" : "#111",
                color: (isExporting || ttsLoading) ? "#555" : "#e8ff47",
                border: "1px solid #222",
                borderRadius: 12,
                fontFamily: "Syne, sans-serif", fontWeight: 700,
                fontSize: 14, letterSpacing: "0.04em",
                cursor: (isExporting || ttsLoading) ? "not-allowed" : "pointer",
                transition: "all 0.2s",
              }}
            >
              {isExporting
                ? `${exportStatus || "내보내는 중..."} ${exportProgress}%`
                : ttsLoading
                ? "음성 생성 중..."
                : ttsReady ? "영상+음성 다운로드" : "영상만 다운로드 (무음)"}
            </button>
          )}

          {!result && !loading && (
            <div style={{
              background: "#0d0d0d", border: "1px solid #111",
              borderRadius: 16, padding: 32,
              display: "flex", flexDirection: "column",
              alignItems: "center", gap: 12, textAlign: "center",
            }}>
              <div style={{ fontSize: 32 }}>🎬</div>
              <div style={{ fontSize: 14, color: "#aaa" }}>
                왼쪽에서 설정을 완료하고<br />생성 버튼을 눌러줘.
              </div>
            </div>
          )}

          {loading && (
            <div style={{
              background: "#0d0d0d", border: "1px solid #111",
              borderRadius: 16, padding: 32,
              display: "flex", flexDirection: "column",
              alignItems: "center", gap: 16,
            }}>
              <div style={{ width: "100%", height: 2, background: "#111", borderRadius: 2, overflow: "hidden" }}>
                <div className="shimmer" style={{ height: "100%" }} />
              </div>
              <div style={{ fontSize: 13, color: "#aaa" }}>AI가 설득형 스크립트를 작성하고 있어...</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 작은 컴포넌트 ──────────────────────────────────────
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#0d0d0d", border: "1px solid #111", borderRadius: 16, padding: 20 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#888", marginBottom: 16, fontFamily: "Syne, sans-serif", fontWeight: 700 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: "#aaa", letterSpacing: "0.06em", marginBottom: 6, textTransform: "uppercase" }}>
      {children}
    </div>
  );
}

function SmallBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 12px",
      background: "transparent",
      border: "1px solid #1e1e1e",
      borderRadius: 6, color: "#666",
      fontSize: 11, cursor: "pointer",
      fontFamily: "Syne, sans-serif",
    }}>
      {children}
    </button>
  );
}
