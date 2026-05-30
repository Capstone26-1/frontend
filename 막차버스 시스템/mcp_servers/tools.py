"""핵심 Tool 함수들.

MCP 서버(server.py), CLI(cli.py), 단위 테스트(tests/test_tools.py)가
모두 이 모듈을 import 한다.

real 모드(공공 API)는 추후 주차에 추가하며, 일단 mock 모드만 동작한다.
"""
from __future__ import annotations

from typing import Optional

from ._common import get_mock_scenario, is_real_mode


# ─────────────────────────── live_arrival_tool ─────────────────────────────

def live_arrival(stop_id: str, route_id: str) -> dict:
    """특정 정류장의 특정 노선 실시간 도착 정보."""
    if is_real_mode():
        raise NotImplementedError(
            "real 모드는 다음 주차에 서울 TOPIS 버스도착정보 API와 연결합니다."
        )
    data = get_mock_scenario("live_arrival")
    buses = [b for b in data["buses"] if b["route_id"] == route_id]
    return {
        "stop_id": data["stop_id"],
        "stop_name": data["stop_name"],
        "queried_at": data["queried_at"],
        "buses": buses or data["buses"],  # 매칭 없으면 전체 반환 (데모 편의)
    }


# ─────────────────────────── last_transport_time_tool ──────────────────────

def last_transport_time(origin: str, destination: str) -> dict:
    """출발지→목적지의 가능한 대중교통 옵션과 막차 출발 시간."""
    if is_real_mode():
        raise NotImplementedError
    return get_mock_scenario("last_transport")


# ─────────────────────────── weather_tool ──────────────────────────────────

def weather(location: str) -> dict:
    """단기 강수/강설/기온 정보."""
    if is_real_mode():
        raise NotImplementedError
    return get_mock_scenario("weather")


# ─────────────────────────── traffic_incident_tool ─────────────────────────

def traffic_incident(bbox: str, route_id: Optional[str] = None) -> dict:
    """지정 영역의 도로 돌발상황."""
    if is_real_mode():
        raise NotImplementedError
    data = get_mock_scenario("traffic_incident")
    incidents = data["incidents"]
    if route_id:
        incidents = [i for i in incidents if route_id in i.get("impact_on_route", [])]
    return {**data, "incidents": incidents}


# ─────────────────────────── risk_score_tool ───────────────────────────────

_INCIDENT_PENALTY = {"none": 0, "low": 10, "moderate": 20, "severe": 30}


def risk_score(
    minutes_until_last: float,
    expected_arrival_min: float,
    transfer_walk_min: float,
    delay_min: float = 0,
    precipitation_type: str = "none",
    incident_severity: str = "none",
) -> dict:
    """막차 실패 위험 점수와 anomaly_type 계산.

    ARCHITECTURE.md §4 의 공식 구현.
    """
    slack = minutes_until_last - expected_arrival_min - transfer_walk_min

    if slack >= 10:
        base = 0
    elif slack >= 5:
        base = 30
    elif slack >= 0:
        base = 60
    else:
        base = 90

    delay_bonus = int(min(20, max(0, delay_min * 2)))
    weather_bonus = 10 if precipitation_type in {"rain", "snow", "sleet"} else 0
    incident_bonus = _INCIDENT_PENALTY.get(incident_severity, 0)

    total = min(100, base + delay_bonus + weather_bonus + incident_bonus)

    if total >= 90:
        anomaly_type = "막차 실패 위험 (매우 높음)"
    elif total >= 60:
        anomaly_type = "막차 실패 위험"
    elif total >= 30:
        anomaly_type = "환승 실패 위험 가능"
    else:
        anomaly_type = "정상"

    parts = [f"여유 시간 {slack:.1f}분 → 기본 {base}점"]
    if delay_bonus:
        parts.append(f"실시간 지연 {delay_min}분 → +{delay_bonus}점")
    if weather_bonus:
        parts.append(f"강수({precipitation_type}) → +{weather_bonus}점")
    if incident_bonus:
        parts.append(f"돌발상황({incident_severity}) → +{incident_bonus}점")

    return {
        "slack_min": round(slack, 1),
        "risk_score": int(total),
        "anomaly_type": anomaly_type,
        "explanation": " · ".join(parts),
    }
