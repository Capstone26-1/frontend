# 아키텍처 — Level 3 Dynamic Workflow Agent

## 1. 전체 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│                       User Request (자연어)                      │
└──────────────────────────────┬──────────────────────────────────┘
                               ▼
                      ┌────────────────┐
                      │  Goal Manager  │  요청 → 구조화된 목표 + 성공 조건
                      └────────┬───────┘
                               ▼
              ┌──────────────────────────────┐
              │         Planner Agent        │  Tool Registry 조회 후 1-step 선택
              └────────────┬─────────────────┘
                           │  (tool_name, arguments, reason)
                           ▼
              ┌──────────────────────────────┐
              │      MCP Tool Executor       │  MCP Client → Tool Server
              └────────────┬─────────────────┘
                           ▼
              ┌──────────────────────────────┐
              │      Observation Store       │  모든 Tool 결과 + 시각 + 신뢰도
              └────────────┬─────────────────┘
                           ▼
              ┌──────────────────────────────┐
              │        Critic Agent          │  "지금 답해도 되나?" 판정
              └────────┬─────────────────────┘
                       │ enough?
              ┌────────┴────────┐
              │ no              │ yes
              ▼                 ▼
        ┌──────────┐    ┌──────────────────┐
        │ Replanner│    │  Final Answerer  │
        └────┬─────┘    └──────────────────┘
             │  new sub-goal
             └─────► (Planner 다시)
```

핵심은 **Planner가 한 번에 전체 워크플로우를 짜지 않는다**는 점입니다. 한 번에 한 Tool씩 고르고, 결과를 보고, Critic이 더 필요한지 판정하고, 부족하면 Re-planner가 다음 sub-goal을 만듭니다. 이것이 LangGraph 표현으로 자연스럽게 cycle로 모델링됩니다.

## 2. 컴포넌트 책임

### 2.1 Goal Manager (`agent/goal_manager.py`)
- **입력**: 사용자 자연어
- **출력**:
  ```json
  {
    "main_goal": "사용자가 현재 위치에서 목적지까지 오늘 안에 대중교통으로 도착 가능한지 판단",
    "context": { "origin": "강남역", "destination": "사당역", "current_time": "23:45" },
    "success_criteria": [...]
  }
  ```
- LLM 한 번 호출 (Anthropic structured output).

### 2.2 Planner Agent (`agent/planner.py`)
- **입력**: 현재 Goal + Observation Store 누적 결과 + Tool Registry
- **출력**: 다음에 호출할 **단일** Tool 결정
  ```json
  {
    "selected_tool": "live_arrival_tool",
    "arguments": { "stop_id": "23001", "route_id": "143" },
    "reason": "막차 가능 여부를 판단하려면 현재 버스 도착 예정 시간이 필요하다."
  }
  ```
- "더 호출할 게 없다"면 `"selected_tool": null`을 내고 Critic 단계로.

### 2.3 MCP Tool Executor (`agent/tool_executor.py`)
- Planner가 고른 Tool을 MCP Client로 호출.
- 예외/타임아웃/스키마 위반 시 Observation에 `status: "error"`로 기록 (그래도 루프는 계속).

### 2.4 Observation Store (`agent/observation_store.py`)
- **단순 로그가 아닙니다.** Critic과 Re-planner의 판단 근거.
- 각 entry:
  ```json
  {
    "step": 3,
    "tool": "live_arrival_tool",
    "arguments": {...},
    "result": {...},
    "status": "ok",
    "ts": "2026-05-25T23:46:12+09:00",
    "confidence": 0.85
  }
  ```

### 2.5 Critic Agent (`agent/critic.py`)
- **입력**: Goal + 모든 Observation
- **출력**:
  ```json
  {
    "enough_to_answer": false,
    "reason": "환승 여유 시간이 2분으로 위험하지만, 지연 원인 정보가 없어 대체경로 추천 근거가 부족.",
    "missing_info": ["traffic_incident", "weather"]
  }
  ```

### 2.6 Re-planner (`agent/replanner.py`)
- **입력**: Critic이 지목한 `missing_info`
- **출력**: 새 sub-goal + 우선 호출할 Tool 후보
  ```json
  {
    "new_sub_goal": "막차 실패 위험의 원인 분석과 대체 경로 탐색",
    "preferred_tools": ["traffic_incident_tool", "weather_tool", "alternative_route_tool"]
  }
  ```

### 2.7 Loop (`agent/loop.py`)
LangGraph `StateGraph`로 위 노드들을 연결. 안전장치:
- `MAX_TOOL_CALLS` (기본 8) 도달 시 강제 Final.
- `MAX_REPLAN_STEPS` (기본 3) 도달 시 강제 Final.
- 같은 Tool을 같은 인자로 2회 이상 호출 시 skip (무한루프 방지).

## 3. Tool Registry 스키마

`tool_registry/registry.json` 단일 파일. Planner LLM에 그대로 들어가는 컨텍스트.

```json
{
  "tools": [
    {
      "name": "live_arrival_tool",
      "description": "특정 정류장의 특정 노선 버스 실시간 도착 예정 시간을 조회.",
      "when_to_use": "사용자가 특정 버스/정류장을 언급했거나, 막차 시간과 비교가 필요할 때.",
      "input_schema": {
        "type": "object",
        "properties": {
          "stop_id": {"type": "string"},
          "route_id": {"type": "string"}
        },
        "required": ["stop_id", "route_id"]
      },
      "output_schema": { ... },
      "data_source": "서울 열린데이터광장 - 버스도착정보 (mock: mock_data/live_arrival.json)"
    },
    ...
  ]
}
```

## 4. 이상 점수 (Anomaly Score) 공식

`risk_score_tool`에서 계산:

```
slack_min = last_bus_time - expected_arrival - transfer_walk_time

base_score:
  slack >= 10        →  0
  10 > slack >= 5    → 30
   5 > slack >= 0    → 60
       slack < 0     → 90

추가 가산:
  + 실시간 지연(분) × 2           (최대 +20)
  + 강수/강설 있음                +10
  + 도로 돌발상황(사고/공사/통제)  +20

anomaly_type:
  90 이상  → "막차 실패 위험 (매우 높음)"
  60~89   → "막차 실패 위험"
  30~59   → "환승 실패 위험 가능"
  ...     → "정상"
```

이 점수는 **Critic이 Re-plan을 트리거하는 신호** 역할도 합니다 (점수 ≥ 60이면 원인 분석 Tool 호출 강제).

## 5. 왜 LangGraph인가

LangGraph는 노드(=Agent/Tool)와 엣지(=상태 전이)를 명시적으로 그릴 수 있고, cycle(루프)을 자연스럽게 표현합니다. Plan → Act → Observe → Critique → Re-plan 같은 구조는 일반 sequential chain으로는 깔끔하게 안 나옵니다. 또한 LangGraph는 각 노드의 입출력을 state에 누적해주기 때문에 Observation Store 구현이 거의 무료로 따라옵니다.

## 6. 시연 시나리오 3개

| # | 사용자 입력 | 기대 워크플로우 |
|---|---|---|
| ① 정상 | "지금 강남에서 사당까지 갈 수 있어?" | route → last_transport → risk_score → **Critic OK** → Final |
| ② 위험 | "버스가 20분째 안 와" | live_arrival → last_transport → risk_score → **Critic NG** → Re-plan → traffic_incident → weather → alternative_route → Final |
| ③ 날씨 | "비 오는데 막차 가능?" | weather → route → last_transport → risk_score → Final |

같은 백엔드, 같은 Tool 세트인데 워크플로우가 매번 다르다는 점을 시연 화면에서 보여주는 게 발표 포인트.
