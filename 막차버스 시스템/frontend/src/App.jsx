/**
 * 막차 실패 위험 이상탐지 — 프론트엔드 목업 (다크 / 채팅형)
 *
 * 홈: Claude 스타일 단일 질문창 + 추천 질문 칩 3개
 * 응답: 채팅 카드 안에 "Goal Manager 파싱 → 결과" 통합 표시
 * Workflow: 우측 슬라이드 패널로 토글
 *
 * 시나리오 토글 (헤더 우상단)
 *   - 자동(기본): 사용자 질문 키워드로 시나리오 자동 판정
 *   - 정상/위험/비: 발표 시연용 강제 모드
 *
 * 백엔드 연결 시 SCENARIOS 더미 데이터는 POST /api/analyze 응답으로 교체.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";

// ───────────────────── 시나리오별 더미 데이터 ─────────────────────

const SCENARIOS = {
  normal: {
    label: "정상",
    parsed: { origin: "강남역", destination: "사당역", situation: "정상", time: "2026-05-25 23:42" },
    result: {
      verdict: "안전",
      verdictTone: "emerald",
      riskScore: 0,
      anomalyType: "정상",
      confidence: 0.92,
      headline: "막차까지 21분 여유 — 현재 노선으로 충분합니다.",
      reasons: [
        { label: "여유 시간", value: "21.0분", weight: "+0", tone: "good" },
        { label: "실시간 지연", value: "없음", weight: "+0", tone: "good" },
      ],
      recommendations: [
        "현재 143번 경로(강남→사당) 그대로 이용 가능합니다.",
        "혹시 모를 지연 대비 23:55 전 출발을 권장합니다.",
      ],
      toolsUsed: ["last_transport_time_tool", "live_arrival_tool", "risk_score_tool"],
    },
    stats: { tools: 3, replans: 0, criticOk: 1, criticNg: 0, durationMs: 1240 },
    workflow: [
      { kind: "goal", body: "강남 → 사당 막차 가능 여부 판단" },
      { kind: "plan", title: "Plan #1", body: "기본 경로 + 막차 시간 + 위험 점수" },
      { kind: "tool", tool: "last_transport_time_tool", result: "막차까지 28분, 환승 도보 0분" },
      { kind: "tool", tool: "live_arrival_tool", result: "143번 7분 후 도착, 지연 없음" },
      { kind: "tool", tool: "risk_score_tool", result: "slack 21.0분 → 0점 / 정상" },
      { kind: "critic", body: "정보 충분, 정상 판정.", decision: "ok" },
      { kind: "final", body: "막차 안전. 추가 분석 불필요." },
    ],
  },

  delay: {
    label: "위험",
    parsed: {
      origin: "강남역(추정)",
      destination: "사당역(추정)",
      situation: "버스 장시간 미도착 → 막차 실패 위험 호소",
      time: "2026-05-25 23:58",
    },
    result: {
      verdict: "매우 위험",
      verdictTone: "rose",
      riskScore: 100,
      anomalyType: "막차 실패 위험 (매우 높음)",
      confidence: 0.81,
      headline: "기존 노선 막차 실패 가능성 매우 높음 — 2호선 직통 권장.",
      reasons: [
        { label: "여유 시간", value: "-10.0분", weight: "+90", tone: "bad" },
        { label: "실시간 지연", value: "12분", weight: "+20", tone: "bad" },
        { label: "강수", value: "비 1.5mm", weight: "+10", tone: "warn" },
        { label: "도로 사고", value: "중간 심각도", weight: "+20", tone: "bad" },
      ],
      recommendations: [
        "기존 143번 경로는 막차 실패 가능성 매우 높음 — 비추천.",
        "지하철 2호선 강남→사당 직통(약 18분) 권장. 막차까지 27분 여유.",
        "버스+택시 조합도 가능하나 비용 약 9,800원.",
      ],
      toolsUsed: [
        "live_arrival_tool",
        "last_transport_time_tool",
        "risk_score_tool",
        "traffic_incident_tool",
        "weather_tool",
        "alternative_route_tool",
      ],
    },
    stats: { tools: 7, replans: 1, criticOk: 1, criticNg: 1, durationMs: 3680 },
    workflow: [
      { kind: "goal", body: "버스 지연 호소 → 막차 실패 위험 판정" },
      { kind: "plan", title: "Plan #1", body: "실시간 상태 확인 우선" },
      { kind: "tool", tool: "live_arrival_tool", result: "143번 18분 후, 12분 지연" },
      { kind: "tool", tool: "last_transport_time_tool", result: "막차까지 12분, 환승 4분" },
      { kind: "tool", tool: "risk_score_tool", result: "slack -10.0분 → 90점" },
      { kind: "critic", body: "위험은 확실. 그러나 원인/대체경로 정보 부족.", decision: "ng",
        missing: ["traffic_incident", "weather", "alternative_route"] },
      { kind: "replan", body: "새 sub-goal: 지연 원인 분석 + 대체 경로 탐색" },
      { kind: "plan", title: "Plan #2", body: "원인 진단 후 대안 제시" },
      { kind: "tool", tool: "traffic_incident_tool", result: "강남대로 사고 (중간 심각도)" },
      { kind: "tool", tool: "weather_tool", result: "비 1.5mm, 노면 미끄러움" },
      { kind: "tool", tool: "alternative_route_tool", result: "2호선 직통 권장 (18분)" },
      { kind: "tool", tool: "risk_score_tool", result: "재계산: 100점 (cap)" },
      { kind: "critic", body: "원인 + 대체경로 확보. 정보 충분.", decision: "ok" },
      { kind: "final", body: "막차 실패 위험. 2호선 권장." },
    ],
  },

  rain: {
    label: "비",
    parsed: {
      origin: "강남역(추정)",
      destination: "사당역(추정)",
      situation: "강수 중 — 비 영향 우려",
      time: "2026-05-25 23:30",
    },
    result: {
      verdict: "주의",
      verdictTone: "sky",
      riskScore: 10,
      anomalyType: "정상",
      confidence: 0.87,
      headline: "막차 여유 충분. 비 영향으로 약간의 지연 가능.",
      reasons: [
        { label: "여유 시간", value: "28.0분", weight: "+0", tone: "good" },
        { label: "강수", value: "비 5.2mm", weight: "+10", tone: "warn" },
      ],
      recommendations: [
        "막차까지 여유 충분합니다. 다만 비 영향 약간의 지연 가능.",
        "지하철 2호선이 실내 환승으로 비 영향 가장 적습니다.",
      ],
      toolsUsed: [
        "weather_tool",
        "last_transport_time_tool",
        "live_arrival_tool",
        "risk_score_tool",
      ],
    },
    stats: { tools: 4, replans: 0, criticOk: 1, criticNg: 0, durationMs: 1620 },
    workflow: [
      { kind: "goal", body: "비 영향 고려한 막차 가능 여부 판단" },
      { kind: "plan", title: "Plan #1", body: "발화에 '비' 키워드 → weather 우선" },
      { kind: "tool", tool: "weather_tool", result: "비 5.2mm, 강수확률 95%" },
      { kind: "tool", tool: "last_transport_time_tool", result: "막차까지 40분, 도보 3분" },
      { kind: "tool", tool: "live_arrival_tool", result: "143번 9분 후, 3분 지연" },
      { kind: "tool", tool: "risk_score_tool", result: "slack 28.0분 + 비 → 10점" },
      { kind: "critic", body: "정보 충분. 위험 낮으나 비 영향 안내 필요.", decision: "ok" },
      { kind: "final", body: "막차 가능. 우산/지하철 권장." },
    ],
  },
};

const TOOL_REGISTRY = [
  { name: "live_arrival_tool", desc: "실시간 도착 정보" },
  { name: "last_transport_time_tool", desc: "막차 시간 / 경로 옵션" },
  { name: "weather_tool", desc: "강수 · 강설 · 기온" },
  { name: "traffic_incident_tool", desc: "사고 · 공사 · 통제" },
  { name: "risk_score_tool", desc: "위험 점수 + Anomaly Type" },
  { name: "alternative_route_tool", desc: "대체 경로" },
  { name: "route_search_tool", desc: "경로 후보 일반 검색" },
  { name: "bus_location_tool", desc: "차량 위치" },
  { name: "explanation_tool", desc: "최종 자연어 설명" },
];

const SUGGESTIONS = [
  { query: "지금 강남역에서 사당역까지 막차 탈 수 있어?", scenario: "normal" },
  { query: "버스가 20분째 안 오는데 막차 놓치는 거 아니야?", scenario: "delay" },
  { query: "비 오는데 지금 출발해도 막차 가능해?", scenario: "rain" },
];

// ───────────────────── 시나리오 자동 판정 ─────────────────────

function detectScenario(text) {
  if (/안\s?와|안와|지연|늦|놓치/.test(text)) return "delay";
  if (/비|눈|우산|장마|폭우/.test(text)) return "rain";
  return "normal";
}

// ───────────────────── 헤더 ─────────────────────

function Header({ scenario, setScenario, onToggleWorkflow, workflowOpen, hasMessages, onReset }) {
  const opts = [
    { id: "auto", label: "자동" },
    { id: "normal", label: "정상" },
    { id: "delay", label: "위험" },
    { id: "rain", label: "비" },
  ];

  return (
    <header className="bg-slate-950/80 backdrop-blur border-b border-slate-800 sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-4">
        <button onClick={onReset} className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/90 group-hover:bg-indigo-400 flex items-center justify-center text-white font-bold transition">
            막
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-slate-100">막차 위험탐지 Agent</div>
            <div className="text-xs text-slate-500">MCP · Dynamic Workflow</div>
          </div>
        </button>

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">시나리오</span>
            <div className="flex rounded-md border border-slate-800 overflow-hidden bg-slate-900">
              {opts.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setScenario(o.id)}
                  className={
                    "px-3 py-1.5 text-xs transition " +
                    (scenario === o.id
                      ? "bg-slate-100 text-slate-900 font-medium"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800")
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {hasMessages && (
            <button
              onClick={onToggleWorkflow}
              className={
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition border " +
                (workflowOpen
                  ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800")
              }
              title="Dynamic Workflow 분석 패널 토글"
            >
              <span className="text-base leading-none">⏿</span>
              Workflow
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

// ───────────────────── Hero (빈 상태) ─────────────────────

function Hero({ onSend, onSuggestion }) {
  const [text, setText] = useState("");

  return (
    <div className="max-w-3xl mx-auto px-6 pt-20">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          MCP Tool Server 5개 연결됨
        </div>
        <h1 className="mt-6 text-4xl font-semibold text-slate-100 tracking-tight">
          오늘 막차, 안전하게 탈 수 있을까요?
        </h1>
        <p className="mt-3 text-slate-400">
          출발지·목적지·지금 상황을 자유롭게 적어주세요. Agent가 알아서 필요한 정보를 골라 분석합니다.
        </p>
      </div>

      <div className="mt-10">
        <Composer text={text} setText={setText} onSend={() => text.trim() && onSend(text)} large />
      </div>

      <div className="mt-6">
        <div className="text-xs text-slate-500 mb-3">이런 질문을 해보세요</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => onSuggestion(s)}
              className="text-left px-4 py-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-600 hover:bg-slate-800/60 transition"
            >
              <div className="text-sm text-slate-200 leading-relaxed">{s.query}</div>
              <div className="mt-2 text-xs text-slate-500">시나리오: {SCENARIOS[s.scenario].label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────────── Composer (입력창) ─────────────────────

function Composer({ text, setText, onSend, large = false, disabled = false }) {
  const ref = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled) onSend();
    }
  };

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [text]);

  return (
    <div
      className={
        "flex items-end gap-2 p-3 rounded-2xl border bg-slate-900/80 transition " +
        (disabled ? "border-slate-800 opacity-60" : "border-slate-700 focus-within:border-indigo-500/60")
      }
    >
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={large ? "예: 강남역에서 사당역까지 막차 탈 수 있어?" : "추가 질문을 입력하세요..."}
        rows={1}
        disabled={disabled}
        className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 resize-none outline-none px-2 py-2 max-h-40"
      />
      <button
        onClick={onSend}
        disabled={disabled || !text.trim()}
        className={
          "shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition " +
          (disabled || !text.trim()
            ? "bg-slate-800 text-slate-600 cursor-not-allowed"
            : "bg-indigo-500 hover:bg-indigo-400 text-white")
        }
        aria-label="보내기"
      >
        <SendIcon />
      </button>
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

// ───────────────────── 채팅 메시지들 ─────────────────────

function ChatList({ messages, isLoading, onOpenWorkflow, scrollRef }) {
  return (
    <div className="max-w-3xl mx-auto px-6 pt-8 pb-40 space-y-6">
      {messages.map((m, i) =>
        m.role === "user" ? (
          <UserMessage key={i} text={m.content} />
        ) : (
          <AssistantMessage key={i} data={m} onOpenWorkflow={onOpenWorkflow} />
        )
      )}
      {isLoading && <LoadingMessage />}
      <div ref={scrollRef} />
    </div>
  );
}

function UserMessage({ text }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tr-md bg-indigo-500 text-white text-sm leading-relaxed shadow-sm">
        {text}
      </div>
    </div>
  );
}

function LoadingMessage() {
  return (
    <div className="flex items-center gap-3 text-slate-400 text-sm">
      <div className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "120ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "240ms" }} />
      </div>
      <span>Agent가 Tool들을 호출하는 중...</span>
    </div>
  );
}

// 메인 어시스턴트 응답 카드: Goal Manager + 결과 카드 + 점수 분해 + 추천 + Tools + Workflow 버튼
function AssistantMessage({ data, onOpenWorkflow }) {
  const r = data.result;
  const parsed = data.parsed;

  const verdictToneMap = {
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
    sky: "bg-sky-500/10 border-sky-500/30 text-sky-300",
    rose: "bg-rose-500/10 border-rose-500/30 text-rose-300",
  };
  const scoreColorMap = {
    emerald: "text-emerald-400",
    sky: "text-sky-400",
    amber: "text-amber-400",
    rose: "text-rose-400",
  };
  const scoreTone =
    r.riskScore >= 60 ? "rose" : r.riskScore >= 30 ? "amber" : r.riskScore > 0 ? "sky" : "emerald";

  return (
    <div className="space-y-3">
      {/* Goal Manager 파싱 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="text-indigo-400">◎</span>
          <span className="font-semibold text-slate-300">요청 파싱</span>
          <span className="text-slate-600">(Goal Manager)</span>
        </div>
        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <ParsedField label="출발지" value={parsed.origin} />
          <ParsedField label="목적지" value={parsed.destination} />
          <ParsedField label="시각" value={parsed.time} />
          <ParsedField label="상황" value={parsed.situation} highlight />
        </div>
      </div>

      {/* 헤드라인 카드 */}
      <div className={"rounded-xl border p-5 flex items-center gap-5 " + verdictToneMap[r.verdictTone]}>
        <div className={"text-5xl font-bold leading-none " + scoreColorMap[scoreTone]}>{r.riskScore}</div>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wider opacity-70">현재 판정</div>
          <div className="text-xl font-semibold mt-0.5 text-slate-100">{r.verdict}</div>
          <div className="text-xs mt-1 opacity-90">
            <span className="font-medium">Anomaly Type:</span> {r.anomalyType}
          </div>
          <p className="text-sm mt-2 text-slate-200">{r.headline}</p>
        </div>
        <div className="text-right">
          <div className="text-xs opacity-70">신뢰도</div>
          <div className="text-lg font-semibold text-slate-100">{(r.confidence * 100).toFixed(0)}%</div>
        </div>
      </div>

      {/* 점수 분해 + 추천 행동 (2단) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SectionCard title="왜 위험한가" subtitle="slack = 막차까지 − 도착 예정 − 환승 도보">
          <ul className="space-y-2.5">
            {r.reasons.map((row, i) => (
              <li key={i} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-200">{row.label}</div>
                  <div className="text-xs text-slate-500">{row.value}</div>
                </div>
                <ScoreChip weight={row.weight} tone={row.tone} />
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="추천 행동">
          <ul className="space-y-2.5">
            {r.recommendations.map((rec, i) => (
              <li key={i} className="flex gap-3 text-sm text-slate-300 leading-relaxed">
                <div
                  className={
                    "shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold " +
                    (i === 0 ? "bg-indigo-500/20 text-indigo-300" : "bg-slate-800 text-slate-400")
                  }
                >
                  {i + 1}
                </div>
                <div>{rec}</div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      {/* 사용된 Tools + Workflow 버튼 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="text-xs text-slate-500">사용된 MCP Tool {r.toolsUsed.length}개</div>
        <div className="flex flex-wrap gap-1.5">
          {r.toolsUsed.map((t, i) => (
            <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-xs font-mono">
              {t}
            </span>
          ))}
        </div>
        <button
          onClick={onOpenWorkflow}
          className="ml-auto text-xs text-indigo-300 hover:text-indigo-200 font-medium"
        >
          Workflow 분석 →
        </button>
      </div>
    </div>
  );
}

function ParsedField({ label, value, highlight }) {
  return (
    <div
      className={
        "rounded-md border px-2.5 py-1.5 " +
        (highlight ? "border-indigo-500/40 bg-indigo-500/10" : "border-slate-800 bg-slate-950/60")
      }
    >
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={"text-xs mt-0.5 " + (highlight ? "text-indigo-200" : "text-slate-300")}>{value}</div>
    </div>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-sm font-semibold text-slate-200">{title}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function ScoreChip({ weight, tone }) {
  const toneMap = {
    good: "bg-emerald-500/15 text-emerald-300",
    warn: "bg-amber-500/15 text-amber-300",
    bad: "bg-rose-500/15 text-rose-300",
  };
  return <span className={"px-2.5 py-1 rounded-md text-sm font-mono " + toneMap[tone]}>{weight}점</span>;
}

// ───────────────────── Workflow 슬라이드 패널 ─────────────────────

function WorkflowPanel({ data, onClose }) {
  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 animate-fadeIn"
      />
      <aside
        className="fixed top-0 right-0 h-full w-full md:w-[720px] bg-slate-950 border-l border-slate-800 z-40 overflow-y-auto animate-slideIn"
      >
        <div className="sticky top-0 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-6 py-3 flex items-center gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-100">Dynamic Workflow</div>
            <div className="text-xs text-slate-500">Agent가 직접 만든 실행 경로</div>
          </div>
          <button
            onClick={onClose}
            className="ml-auto w-8 h-8 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition flex items-center justify-center"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5">
          <WorkflowStats stats={data.stats} />
          <Timeline steps={data.workflow} />
          <ToolRegistryList usedTools={data.result.toolsUsed} />
        </div>
      </aside>
    </>
  );
}

function WorkflowStats({ stats }) {
  const items = [
    { label: "Tool 호출", value: stats.tools },
    { label: "Re-plan", value: stats.replans, highlight: stats.replans > 0 },
    { label: "Critic OK", value: stats.criticOk },
    { label: "Critic NG", value: stats.criticNg, highlight: stats.criticNg > 0 },
    { label: "실행 시간", value: (stats.durationMs / 1000).toFixed(2) + "s" },
  ];
  return (
    <div className="grid grid-cols-5 gap-2">
      {items.map((it) => (
        <div
          key={it.label}
          className={
            "rounded-md border px-3 py-2 " +
            (it.highlight ? "border-orange-500/40 bg-orange-500/10" : "border-slate-800 bg-slate-900/60")
          }
        >
          <div className="text-[10px] uppercase tracking-wider text-slate-500">{it.label}</div>
          <div className={"text-lg font-semibold mt-0.5 " + (it.highlight ? "text-orange-300" : "text-slate-100")}>
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function Timeline({ steps }) {
  return (
    <ol className="mt-6 relative">
      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-slate-800" />
      <div className="space-y-2.5">
        {steps.map((step, i) => (
          <TimelineNode key={i} step={step} index={i} />
        ))}
      </div>
    </ol>
  );
}

function TimelineNode({ step, index }) {
  const kindMap = {
    goal: {
      dot: "bg-indigo-500",
      title: "Goal",
      border: "border-indigo-500/30",
      bg: "bg-indigo-500/10",
      titleColor: "text-indigo-200",
    },
    plan: {
      dot: "bg-blue-500",
      title: step.title || "Plan",
      border: "border-blue-500/30",
      bg: "bg-blue-500/10",
      titleColor: "text-blue-200",
    },
    tool: {
      dot: "bg-slate-500",
      title: step.tool,
      border: "border-slate-700",
      bg: "bg-slate-900/60",
      titleColor: "text-slate-200",
    },
    critic: {
      dot: step.decision === "ok" ? "bg-emerald-500" : "bg-amber-500",
      title: step.decision === "ok" ? "Critic ✓ 정보 충분" : "Critic ⚠ 정보 부족",
      border: step.decision === "ok" ? "border-emerald-500/30" : "border-amber-500/40",
      bg: step.decision === "ok" ? "bg-emerald-500/10" : "bg-amber-500/10",
      titleColor: step.decision === "ok" ? "text-emerald-200" : "text-amber-200",
    },
    replan: {
      dot: "bg-orange-500",
      title: "↻ Re-planner",
      border: "border-orange-500/50",
      bg: "bg-orange-500/15",
      titleColor: "text-orange-200",
    },
    final: {
      dot: "bg-indigo-500",
      title: "Final Answer",
      border: "border-indigo-500/30",
      bg: "bg-indigo-500/10",
      titleColor: "text-indigo-200",
    },
  };
  const cfg = kindMap[step.kind];

  return (
    <li className="relative pl-10">
      <div className={"absolute left-[9px] top-2 w-3.5 h-3.5 rounded-full border-2 border-slate-950 " + cfg.dot} />
      <div className={"rounded-md border px-3 py-2 " + cfg.border + " " + cfg.bg}>
        <div className="flex items-center justify-between">
          <div className={"text-sm font-semibold " + cfg.titleColor}>
            {step.kind === "tool" ? <span className="font-mono text-xs">{cfg.title}</span> : cfg.title}
          </div>
          <div className="text-xs text-slate-500">#{index + 1}</div>
        </div>
        {step.body && <div className="text-sm text-slate-300 mt-0.5">{step.body}</div>}
        {step.result && <div className="text-xs text-slate-500 mt-1">→ {step.result}</div>}
        {step.missing && (
          <div className="mt-1 flex flex-wrap gap-1">
            {step.missing.map((m) => (
              <span
                key={m}
                className="px-1.5 py-0.5 rounded text-xs bg-amber-500/20 text-amber-200 font-mono"
              >
                missing: {m}
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function ToolRegistryList({ usedTools }) {
  return (
    <div className="mt-8">
      <div className="text-sm font-semibold text-slate-200">Tool Registry</div>
      <p className="text-xs text-slate-500 mt-0.5">
        Planner Agent가 매번 이 카탈로그에서 다음 Tool을 선택합니다.
      </p>
      <ul className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
        {TOOL_REGISTRY.map((t) => {
          const used = usedTools.includes(t.name);
          return (
            <li
              key={t.name}
              className={
                "px-3 py-2 rounded-md border text-sm " +
                (used
                  ? "border-indigo-500/40 bg-indigo-500/10"
                  : "border-slate-800 bg-slate-900/40")
              }
            >
              <div className="flex items-center justify-between">
                <div className="font-mono text-xs text-slate-200">{t.name}</div>
                {used ? (
                  <span className="text-[10px] text-indigo-300 font-semibold">USED</span>
                ) : (
                  <span className="text-[10px] text-slate-600">—</span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{t.desc}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ───────────────────── App ─────────────────────

export default function App() {
  const [scenario, setScenario] = useState("auto"); // auto | normal | delay | rain
  const [messages, setMessages] = useState([]);
  const [followup, setFollowup] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const bottomRef = useRef(null);

  const lastAssistant = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant"),
    [messages]
  );

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, isLoading]);

  const handleSend = (text) => {
    const scen = scenario === "auto" ? detectScenario(text) : scenario;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsLoading(true);
    setTimeout(() => {
      const d = SCENARIOS[scen];
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          scenarioKey: scen,
          parsed: d.parsed,
          result: d.result,
          workflow: d.workflow,
          stats: d.stats,
        },
      ]);
      setIsLoading(false);
    }, 900);
  };

  const handleSuggestion = (s) => {
    if (scenario !== "auto") setScenario("auto"); // 추천칩 클릭 시 자동 모드로 복귀
    handleSend(s.query);
  };

  const handleReset = () => {
    setMessages([]);
    setFollowup("");
    setWorkflowOpen(false);
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }
        .animate-fadeIn { animation: fadeIn 200ms ease-out; }
        .animate-slideIn { animation: slideIn 280ms cubic-bezier(0.2, 0.8, 0.2, 1); }
      `}</style>

      <Header
        scenario={scenario}
        setScenario={setScenario}
        onToggleWorkflow={() => setWorkflowOpen((v) => !v)}
        workflowOpen={workflowOpen}
        hasMessages={hasMessages}
        onReset={handleReset}
      />

      {!hasMessages ? (
        <Hero onSend={handleSend} onSuggestion={handleSuggestion} />
      ) : (
        <ChatList
          messages={messages}
          isLoading={isLoading}
          onOpenWorkflow={() => setWorkflowOpen(true)}
          scrollRef={bottomRef}
        />
      )}

      {hasMessages && (
        <div className="fixed bottom-0 left-0 right-0 z-10 pointer-events-none">
          <div className="max-w-3xl mx-auto px-6 pb-6 pointer-events-auto">
            <div className="bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent pt-8 -mx-6 px-6">
              <Composer
                text={followup}
                setText={setFollowup}
                onSend={() => {
                  if (followup.trim() && !isLoading) {
                    handleSend(followup);
                    setFollowup("");
                  }
                }}
                disabled={isLoading}
              />
            </div>
          </div>
        </div>
      )}

      {workflowOpen && lastAssistant && (
        <WorkflowPanel data={lastAssistant} onClose={() => setWorkflowOpen(false)} />
      )}
    </div>
  );
}
