import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { text, voiceId: bodyVoiceId } = await req.json();

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const defaultVoiceId = process.env.ELEVENLABS_VOICE_ID || "93nuHbke4dTER9x2pDwE";
  const voiceId = bodyVoiceId || defaultVoiceId;

  if (!apiKey) {
    return NextResponse.json({ error: "TTS not configured" }, { status: 500 });
  }

  if (!text?.trim()) {
    return NextResponse.json({ error: "텍스트가 없어요." }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(`ElevenLabs 오류: ${e?.detail?.message || res.status}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(arrayBuffer.byteLength),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "TTS 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
