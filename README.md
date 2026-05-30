# 프론트엔드 — 막차 실패 위험 이상탐지 (목업)

> **목업의 목표**: 같은 백엔드가 사용자 질문에 따라 매번 **다른 워크플로우**를 만든다는 것을 발표 시연에서 즉시 보여주는 것.

3개 화면 + 3개 시나리오(정상/위험/비) 토글 한 벌로 보고서 §10 화면설계와 §11 시연 시나리오를 모두 커버합니다.

---

## 두 가지 사용 방식

### A. 빠르게 보기 (npm 설치 없이)

`preview.html` 파일을 **더블클릭**하면 브라우저에서 바로 열립니다.
React, ReactDOM, Babel, Tailwind를 CDN에서 로드해서 빌드 단계가 필요 없습니다.

```text
frontend/preview.html         ← 더블클릭
```

### B. 실제 Vite 프로젝트로 키우기 (백엔드 연결 시)

1. `frontend` 디렉터리에서 Vite 프로젝트를 생성:

   ```bash
   npm create vite@latest . -- --template react
   npm install
   npm install -D tailwindcss postcss autoprefixer
   npx tailwindcss init -p
   ```

2. `tailwind.config.js`의 `content`에 `./src/**/*.{js,jsx,ts,tsx}` 추가.

3. `src/index.css`에 다음 3줄:

   ```css
   @tailwind base;
   @tailwind components;
   @tailwind utilities;
   ```

4. 우리 컴포넌트로 교체:

   ```bash
   cp src/App.jsx ./src/App.jsx     # 이미 같은 위치라면 그대로 사용
   npm run dev
   ```

5. 백엔드 연동(4주차)이 시작되면 `App.jsx`의 `SCENARIOS` 더미 데이터를 FastAPI 호출로 교체합니다:

   ```js
   const res = await fetch("/api/analyze", { ... });
   const data = await res.json();
   ```

---

## 디자인 결정 메모

- **다크 테마 / 데스크탑 우선**: 막차 상황은 늦은 밤 사용 컨텍스트라 다크가 자연스럽습니다. 또한 다크 배경은 발표 화면에서 컬러 액센트(emerald/amber/rose)가 더 도드라집니다. 1280px 기준 레이아웃, max-w-3xl 대화 영역.
- **홈 = Claude 스타일 단일 질문창**: 출발지/목적지 분리 입력 없이 자연어 한 줄로 받습니다. 응답 카드 안 상단의 "요청 파싱(Goal Manager)" 박스가 출발지·목적지·상황을 추출해서 보여줘서 이 자체가 §5.1 Goal Manager의 데모 역할을 합니다.
- **추천 질문 칩 3개**: 보고서 §11 시연 시나리오 3개를 그대로 칩으로 노출. 클릭 시 자동으로 자동 모드로 복귀해서 해당 질문을 전송 → Agent가 키워드로 시나리오 판정 → 다른 워크플로우 생성.
- **시나리오 토글의 "자동" 모드**: 기본값. 사용자 질문에서 `안 와|지연|놓치` → 위험, `비|눈|우산` → 비, 그 외 → 정상으로 감지. 발표 중 "임의 질문에도 반응한다"를 보여주는 용도. 강제 정상/위험/비 모드는 시연 안정성용.
- **Workflow는 우측 슬라이드 패널**: 채팅 흐름을 깨지 않으면서 필요할 때만 펼칩니다. 답변 카드 안의 "Workflow 분석 →" 링크 또는 헤더 우측 Workflow 버튼으로 토글.
- **Workflow 시각화는 세로 타임라인**: Goal → Plan → Tool → Critic → Re-plan → Plan → ... → Final 흐름을 위에서 아래로 따라갑니다. Re-plan 노드(주황 ↻)와 두 번째 Plan이 등장하는 위험 시나리오가 Level 3의 핵심 증거.
- **Critic 카드는 ok/ng로 색 구분**: emerald = "정보 충분" / amber = "정보 부족"
- **Re-plan / Critic NG 통계는 강조**: 워크플로우 상단 5개 통계 중 Re-plan과 Critic NG는 값이 0보다 크면 주황 배경으로 자동 강조됩니다. 발표 슬라이드에 캡처할 때 한눈에 들어오도록.

---

## 폴더 구조

```
frontend/
├── README.md                ← 지금 이 파일
├── preview.html             ← 더블클릭으로 보는 단일 파일 버전
└── src/
    └── App.jsx              ← Vite 프로젝트에 그대로 떨어뜨릴 React 컴포넌트
```
