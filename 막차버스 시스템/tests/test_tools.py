"""1주차 검증 테스트.

* Tool Registry JSON이 유효한가
* 모든 mock 파일이 normal/delay/rain 시나리오를 갖고 있는가
* 각 Tool이 시나리오별로 의미 있는 응답을 내는가
* risk_score 공식이 ARCHITECTURE.md §4 그대로 동작하는가
* 보고서의 3가지 시연 시나리오가 기대한 anomaly_type을 산출하는가
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

# 프로젝트 루트를 sys.path에 추가하지 않아도 되도록 tests를 패키지처럼 다룬다.
ROOT = Path(__file__).resolve().parent.parent
REGISTRY = ROOT / "tool_registry" / "registry.json"
MOCK_DIR = ROOT / "mock_data"

# ───────────────────────── Tool Registry ─────────────────────────

def test_registry_is_valid_json():
    with REGISTRY.open(encoding="utf-8") as f:
        data = json.load(f)
    assert "tools" in data
    assert isinstance(data["tools"], list)
    assert len(data["tools"]) >= 5


def test_registry_has_all_p0_tools():
    with REGISTRY.open(encoding="utf-8") as f:
        data = json.load(f)
    names = {t["name"] for t in data["tools"] if t.get("mvp_priority") == "P0"}
    expected = {
        "live_arrival_tool",
        "last_transport_time_tool",
        "weather_tool",
        "traffic_incident_tool",
        "risk_score_tool",
    }
    assert expected.issubset(names), f"누락된 P0 Tool: {expected - names}"


def test_registry_entries_have_required_fields():
    with REGISTRY.open(encoding="utf-8") as f:
        data = json.load(f)
    for t in data["tools"]:
        for key in ("name", "description", "when_to_use", "input_schema"):
            assert key in t, f"{t.get('name')}에 {key} 없음"


# ───────────────────────── Mock 데이터 ─────────────────────────

MOCK_STEMS = [
    "live_arrival",
    "last_transport",
    "weather",
    "traffic_incident",
    "alternative_route",
]


@pytest.mark.parametrize("stem", MOCK_STEMS)
def test_mock_file_has_all_scenarios(stem):
    path = MOCK_DIR / f"{stem}.json"
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    scenarios = data.get("scenarios", {})
    for scen in ("normal", "delay", "rain"):
        assert scen in scenarios, f"{stem}.json 에 시나리오 '{scen}' 누락"


# ───────────────────────── Tool 함수 ─────────────────────────

@pytest.fixture(autouse=True)
def _force_mock_mode(monkeypatch):
    """모든 테스트에서 mock 모드 강제."""
    monkeypatch.setenv("DATA_MODE", "mock")
    # lru_cache가 다른 테스트 환경값을 캐싱하지 않도록 모듈을 새로 import
    import importlib
    import mcp_servers._common as _common
    import mcp_servers.tools as _tools
    _common._load_mock.cache_clear()
    importlib.reload(_common)
    importlib.reload(_tools)


def _tools():
    from mcp_servers import tools
    return tools


@pytest.mark.parametrize("scen", ["normal", "delay", "rain"])
def test_live_arrival_returns_buses(monkeypatch, scen):
    monkeypatch.setenv("MOCK_SCENARIO", scen)
    from mcp_servers import _common, tools
    _common._load_mock.cache_clear()
    res = tools.live_arrival("23001", "143")
    assert "buses" in res
    assert len(res["buses"]) >= 1
    bus = res["buses"][0]
    assert "expected_arrival_min" in bus
    assert "delay_min" in bus


@pytest.mark.parametrize("scen", ["normal", "delay", "rain"])
def test_last_transport_has_options(monkeypatch, scen):
    monkeypatch.setenv("MOCK_SCENARIO", scen)
    from mcp_servers import _common, tools
    _common._load_mock.cache_clear()
    res = tools.last_transport_time("강남역", "사당역")
    assert len(res["options"]) >= 1
    opt = res["options"][0]
    assert "minutes_until_last" in opt
    assert "transfer_walk_min" in opt


def test_weather_rain_has_precipitation(monkeypatch):
    monkeypatch.setenv("MOCK_SCENARIO", "rain")
    from mcp_servers import _common, tools
    _common._load_mock.cache_clear()
    res = tools.weather("서울특별시 강남구")
    assert res["precipitation_type"] == "rain"
    assert res["precipitation_mm"] > 0


def test_traffic_incident_delay_has_incident(monkeypatch):
    monkeypatch.setenv("MOCK_SCENARIO", "delay")
    from mcp_servers import _common, tools
    _common._load_mock.cache_clear()
    res = tools.traffic_incident("강남구")
    assert len(res["incidents"]) >= 1
    inc = res["incidents"][0]
    assert "severity" in inc


def test_traffic_incident_filter_by_route(monkeypatch):
    monkeypatch.setenv("MOCK_SCENARIO", "delay")
    from mcp_servers import _common, tools
    _common._load_mock.cache_clear()
    res_all = tools.traffic_incident("강남구")
    res_143 = tools.traffic_incident("강남구", route_id="143")
    assert len(res_143["incidents"]) <= len(res_all["incidents"])
    for inc in res_143["incidents"]:
        assert "143" in inc.get("impact_on_route", [])


# ───────────────────────── risk_score 공식 ─────────────────────────

def test_risk_score_normal_is_low():
    """slack 21분, 무지연/맑음 → 정상."""
    from mcp_servers import tools
    r = tools.risk_score(
        minutes_until_last=28,
        expected_arrival_min=7,
        transfer_walk_min=0,
    )
    assert r["risk_score"] == 0
    assert r["anomaly_type"] == "정상"
    assert r["slack_min"] == 21.0


def test_risk_score_delay_scenario():
    """보고서 시나리오 ②: slack -10, 지연 12, 비, 사고(moderate)."""
    from mcp_servers import tools
    r = tools.risk_score(
        minutes_until_last=12,
        expected_arrival_min=18,
        transfer_walk_min=4,
        delay_min=12,
        precipitation_type="rain",
        incident_severity="moderate",
    )
    # 기본 90(slack<0) + 지연 +20(cap) + 비 +10 + 사고 +20 = 140 → cap 100
    assert r["risk_score"] == 100
    assert r["anomaly_type"] == "막차 실패 위험 (매우 높음)"
    assert r["slack_min"] == -10.0


def test_risk_score_borderline():
    """slack 6 → 기본 30점."""
    from mcp_servers import tools
    r = tools.risk_score(
        minutes_until_last=10,
        expected_arrival_min=4,
        transfer_walk_min=0,
    )
    assert r["risk_score"] == 30
    assert r["anomaly_type"] == "환승 실패 위험 가능"


def test_risk_score_severe_incident_alone():
    """slack 충분(15)이라도 severe 돌발 시 +30점은 반영되어야 한다."""
    from mcp_servers import tools
    r = tools.risk_score(
        minutes_until_last=20,
        expected_arrival_min=5,
        transfer_walk_min=0,
        incident_severity="severe",
    )
    assert r["risk_score"] == 30
    assert r["anomaly_type"] == "환승 실패 위험 가능"


# ─────────── 보고서 시연 시나리오 종합 검증 ───────────

def test_demo_scenario_normal(monkeypatch):
    monkeypatch.setenv("MOCK_SCENARIO", "normal")
    from mcp_servers import _common, tools
    _common._load_mock.cache_clear()

    last = tools.last_transport_time("강남역", "사당역")
    arr = tools.live_arrival("23001", "143")
    opt = last["options"][0]
    bus = arr["buses"][0]

    r = tools.risk_score(
        minutes_until_last=opt["minutes_until_last"],
        expected_arrival_min=bus["expected_arrival_min"],
        transfer_walk_min=opt["transfer_walk_min"],
        delay_min=bus["delay_min"],
    )
    assert r["anomaly_type"] == "정상"


def test_demo_scenario_delay(monkeypatch):
    monkeypatch.setenv("MOCK_SCENARIO", "delay")
    from mcp_servers import _common, tools
    _common._load_mock.cache_clear()

    last = tools.last_transport_time("강남역", "사당역")
    arr = tools.live_arrival("23001", "143")
    weather = tools.weather("서울특별시 강남구")
    incidents = tools.traffic_incident("강남구", route_id="143")
    opt = last["options"][0]
    bus = arr["buses"][0]
    inc_sev = incidents["incidents"][0]["severity"] if incidents["incidents"] else "none"

    r = tools.risk_score(
        minutes_until_last=opt["minutes_until_last"],
        expected_arrival_min=bus["expected_arrival_min"],
        transfer_walk_min=opt["transfer_walk_min"],
        delay_min=bus["delay_min"],
        precipitation_type=weather["precipitation_type"],
        incident_severity=inc_sev,
    )
    assert r["anomaly_type"] in {"막차 실패 위험", "막차 실패 위험 (매우 높음)"}
    assert r["risk_score"] >= 60


def test_demo_scenario_rain_is_safe_enough(monkeypatch):
    """비는 와도 막차까지 40분 여유 → 정상~경계 정도여야 한다."""
    monkeypatch.setenv("MOCK_SCENARIO", "rain")
    from mcp_servers import _common, tools
    _common._load_mock.cache_clear()

    last = tools.last_transport_time("강남역", "사당역")
    arr = tools.live_arrival("23001", "143")
    weather = tools.weather("서울특별시 강남구")
    opt = last["options"][0]
    bus = arr["buses"][0]

    r = tools.risk_score(
        minutes_until_last=opt["minutes_until_last"],
        expected_arrival_min=bus["expected_arrival_min"],
        transfer_walk_min=opt["transfer_walk_min"],
        delay_min=bus["delay_min"],
        precipitation_type=weather["precipitation_type"],
    )
    assert r["risk_score"] < 30  # 비 영향만 받는 정상 수준
