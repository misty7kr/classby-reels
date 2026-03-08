import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    apiMode,
    openaiKey,
    anthropicKey,
    openaiModel = "gpt-4o-mini",
    anthropicModel = "claude-sonnet-4-5",
    input,
  } = body;

  const {
    academyName,
    subject,
    grade,
    region,
    tone,
    ctaText,
    customMsg,
  } = input;

  const TONE_DESC: Record<string, string> = {
    empathy:   "공감형 — 학부모/학생의 고민에 공감하며 시작. 부드럽고 진정성 있는 말투.",
    factbomb:  "팩폭형 — 직접적이고 날카로운 사실 제시. 짧고 강렬한 문장.",
    compare:   "비교형 — 타 방식과 비교해 우월성 부각. 논리적이고 설득력 있는 구조.",
    curiosity: "궁금증형 — 호기심을 자극하는 질문으로 시작. 답을 끝까지 보게 만드는 구조.",
    story:     "스토리형 — 실제 학생/학부모 사례처럼 시작. 감성적이고 몰입감 있는 전개.",
  };

  const toneDesc = TONE_DESC[tone] || TONE_DESC.empathy;

  const systemPrompt = `당신은 한국 학원 마케팅 전문가입니다.
설득형 숏폼 영상(릴스/쇼츠)의 5컷 텍스트 스크립트를 생성합니다.

규칙:
- 각 컷은 화면에 표시될 짧은 텍스트 (최대 2줄, 한 줄당 최대 15자)
- 이모지 절대 금지
- 특수문자 최소화 (마침표, 쉼표, 물음표, 느낌표만 허용)
- 한국어로만 작성
- 컷 구조: [후킹] → [문제제기] → [원인/인사이트] → [해결책/차별점] → [CTA]

JSON 형식으로만 응답:
{
  "cuts": [
    { "id": 1, "role": "후킹",     "line1": "...", "line2": "..." },
    { "id": 2, "role": "문제제기", "line1": "...", "line2": "..." },
    { "id": 3, "role": "인사이트", "line1": "...", "line2": "..." },
    { "id": 4, "role": "해결책",   "line1": "...", "line2": "..." },
    { "id": 5, "role": "CTA",      "line1": "...", "line2": "..." }
  ],
  "theme": "dark_gradient | light_minimal | neon_dark | warm_gradient",
  "accentColor": "#hex색상"
}`;

  const userPrompt = `학원명: ${academyName}
지역: ${region}
과목: ${subject}
대상: ${grade}
톤: ${toneDesc}
CTA 문구: ${ctaText || `${academyName} 지금 상담`}
${customMsg ? `추가 강조 포인트: ${customMsg}` : ""}

위 정보로 설득력 높은 5컷 릴스 스크립트를 생성해줘.`;

  try {
    let resultText = "";

    if (apiMode === "openai" || apiMode === "hybrid") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: openaiModel,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 800,
          temperature: 0.85,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(`OpenAI 오류: ${e?.error?.message || res.status}`);
      }
      const data = await res.json();
      resultText = data.choices[0]?.message?.content ?? "";

      // hybrid: Claude로 인간화 Pass
      if (apiMode === "hybrid" && anthropicKey) {
        const parsed = JSON.parse(resultText);
        const humanizePrompt = `다음 릴스 스크립트를 더 자연스럽고 설득력 있게 다듬어줘.
원본 JSON 구조를 그대로 유지하면서 각 line1, line2 텍스트만 개선해.
규칙: 이모지 금지, 최대 15자/줄, 한국어만.

${JSON.stringify(parsed, null, 2)}

동일한 JSON 구조로만 응답해.`;

        const r2 = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: anthropicModel,
            max_tokens: 800,
            messages: [{ role: "user", content: humanizePrompt }],
          }),
        });
        if (r2.ok) {
          const d2 = await r2.json();
          const raw = d2.content?.[0]?.text ?? "";
          const clean = raw.replace(/```json|```/g, "").trim();
          try { resultText = JSON.stringify(JSON.parse(clean)); } catch { /* keep original */ }
        }
      }
    } else {
      // anthropic only
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: anthropicModel,
          max_tokens: 800,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(`Claude 오류: ${e?.error?.message || res.status}`);
      }
      const data = await res.json();
      const raw = data.content?.[0]?.text ?? "";
      resultText = raw.replace(/```json|```/g, "").trim();
    }

    const parsed = JSON.parse(resultText);
    return NextResponse.json({ ok: true, ...parsed });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
