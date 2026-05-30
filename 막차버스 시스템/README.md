# 막차버스 시스템 — MCP 기반 Dynamic Workflow Agent

> **이 프로젝트는 "막차 앱"이 아닙니다.**
> MCP Tool들을 골라 쓰면서 스스로 계획·실행·검증·재계획을 반복하는
> ** Dynamic Workflow Agent Framework**를 만들고,
> 그 위에 "막차 실패 위험 이상탐지"라는 시연용 사용 사례를 얹습니다.

---

## 1. 무엇이 다른가

기존 "조건분기" 방식은 개발자가 미리 그려둔 트리를 따라갈 뿐이라 진짜 Dynamic Workflow라고 말하기 어렵습니다. 우리 시스템은 매 사용자 요청마다 Agent가 직접

```
Goal 생성 → Tool Registry 조회 → Plan 작성 → Tool 실행 → Observation 저장
       → Critic 검증 → 부족하면 Re-plan → 최종 응답
```

을 돌립니다. 같은 "막차 실패 위험" 판단이라도 질문이 "지금 강남에서 집까지 갈 수 있어?"인지 "버스가 20분째 안 와"인지 "비 오는데 가능해?"인지에 따라 호출되는 Tool 순서가 매번 달라집니다.

---

## 2. 폴더 구조

```
막차버스 시스템/
├── README.md                    ← 지금 이 파일
├── requirements.txt
├── .env.example                 ← .env로 복사해 키 채우기
├── .gitignore
│
├── docs/
│   └── ARCHITECTURE.md          ← Level 3 Agent Loop 상세 설계
│
├── tool_registry/
│   └── registry.json            ← Planner가 보고 Tool을 선택하는 카탈로그
│
├── mock_data/                   ← 키 없이도 데모가 돌아가게 하는 샘플 응답
│   ├── live_arrival.json
│   ├── last_transport.json
│   ├── weather.json
│   ├── traffic_incident.json
│   └── alternative_route.json
│
├── mcp_servers/                 ← MCP Python SDK로 만든 Tool Server들
│   ├── live_arrival_server.py
│   ├── last_transport_time_server.py
│   ├── weather_server.py
│   ├── traffic_incident_server.py
│   └── risk_score_server.py
│
├── agent/                       ← (2주차 이후) Level 3 Agent Loop
│   ├── goal_manager.py
│   ├── planner.py
│   ├── tool_executor.py
│   ├── observation_store.py
│   ├── critic.py
│   ├── replanner.py
│   └── loop.py
│
├── api/                         ← (4주차) FastAPI 엔드포인트
│   └── main.py
│
└── tests/
    └── test_tools.py
```

---

## 3. 빠른 시작 (Mock 모드)

API 키 없이도 데모가 돌아가도록 `DATA_MODE=mock`이 기본값입니다.

```bash
# 1. 가상환경
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux

# 2. 설치
pip install -r requirements.txt

# 3. 환경 변수
copy .env.example .env          # Windows
# cp .env.example .env          # macOS/Linux
# .env 안의 ANTHROPIC_API_KEY만 채우면 됩니다.

# 4. Tool 단위 테스트
pytest tests/ -v

# 5. 단일 Tool 호출 데모 (MCP 없이 CLI로)
python -m mcp_servers.cli live_arrival --stop 23001 --route 143

# 시나리오 전환 (정상 / 위험 / 비)
$env:MOCK_SCENARIO="delay"; python -m mcp_servers.cli live_arrival --stop 23001 --route 143

# 위험 점수 단독 계산
python -m mcp_servers.cli risk_score `
    --minutes-until-last 12 --expected-arrival-min 18 --transfer-walk-min 4 `
    --delay 12 --precip rain --incident moderate

# 6. MCP 서버를 stdio로 띄우기 (MCP 클라이언트가 spawn)
python -m mcp_servers.server
```

---

## 4. 공공데이터 API 키 발급 가이드

MVP 시연은 mock으로 충분하지만, 마지막 주차에 실제 데이터로 바꿔치기 하려면 다음 3개를 받아둡니다. 모두 무료이고, 발급에 영업일 1~3일 정도 걸립니다.

### 4.1 서울 열린데이터광장 — 버스도착정보·버스위치정보
1. `https://data.seoul.go.kr` 가입
2. 마이페이지 → 인증키 신청 → 일반 인증키 발급 (즉시)
3. "서울특별시_버스도착정보 조회 서비스", "서울특별시_버스위치정보 조회 서비스" 활용 신청
4. 발급된 인증키를 `.env`의 `SEOUL_OPEN_API_KEY`에 붙여 넣기

### 4.2 국토교통부 ITS — 돌발상황정보
1. `https://www.its.go.kr/opendata` 가입
2. 오픈API → "돌발상황정보" 활용 신청 (사용 목적: 학생 프로젝트)
3. 승인 후 발급된 키를 `.env`의 `ITS_API_KEY`에 입력

### 4.3 기상청 — 단기예보 (강수/강설)
1. `https://www.data.go.kr` 가입
2. "기상청_단기예보 ((구) 동네예보) 조회서비스" 검색 → 활용 신청
3. 발급키를 `.env`의 `KMA_API_KEY`에 입력

> 실제 운영 모드로 전환할 때는 `.env`에서 `DATA_MODE=real`로 바꾸기만 하면 됩니다.

---

## 5. LLM 선택

기본값은 **Anthropic Claude Sonnet 4.6**입니다.

| 역할 | 추천 모델 | 이유 |
|---|---|---|
| Planner / Re-planner | `claude-sonnet-4-6` | 엄격한 JSON 출력, Tool 선택 reasoning이 안정적 |
| Critic | `claude-sonnet-4-6` | 정보 충분성 판단을 보수적으로 잘함 |
| (예산 절약) Planner | `claude-haiku-4-5` | 단순 라우팅이라면 충분, 가격 1/10 |

OpenAI/Ollama로 바꾸고 싶다면 `agent/planner.py`의 LLM 클라이언트만 교체하면 됩니다 (다음 단계에서 추상화해둡니다).

---

## 6. 로드맵 (보고서 5주차 계획 매핑)

| 주차 | 산출물 | 폴더 |
|---|---|---|
| 1주차 | API 명세, Tool 입출력 스키마, mock 데이터, **현재 단계** | `mock_data/`, `tool_registry/` |
| 2주차 | MCP Tool Server 5개 + 단위 테스트 | `mcp_servers/`, `tests/` |
| 3주차 | Level 3 Agent Loop (Plan-Act-Observe-Critique-Replan) | `agent/` |
| 4주차 | FastAPI + React 프론트(Workflow 시각화 포함) | `api/`, `frontend/` |
| 5주차 | 배포, 시연 시나리오 3개, 발표자료 | — |

자세한 컴포넌트 설계는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 참고.
