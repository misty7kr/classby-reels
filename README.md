# ClassBy Reels Studio

설득형 AI 쇼츠 자동화 서비스 (ClassBy 주 7회 플랜 전용)

## 기능
- AI 5컷 설득형 릴스 스크립트 자동 생성 (OpenAI / Claude / Hybrid)
- Canvas 브라우저 렌더링 (NAS/서버 불필요)
- 컷별 텍스트 인라인 편집
- WebM 영상 다운로드

## Vercel 배포

```bash
# 1. 레포 생성 후 push
git init && git add . && git commit -m "init"

# 2. Vercel 연결
vercel

# 3. 환경변수 설정 (Vercel 대시보드 > Settings > Environment Variables)
ACCESS_PASSWORD=your_secret_password
```

## 환경변수
| 변수 | 설명 |
|------|------|
| `ACCESS_PASSWORD` | 접근 비밀번호 (ClassBy 주 7회 가입자에게 제공) |

## 사용자 API 키
- 서버에 저장하지 않음
- 요청 시에만 전송됨
- OpenAI / Anthropic / Hybrid 선택 가능

## 영상 스펙
- 해상도: 1080x1920 (9:16)
- 포맷: WebM (VP9)
- 컷 수: 5컷
- 컷당 길이: 2.5초 (총 12.5초)
- 비트레이트: 8Mbps
