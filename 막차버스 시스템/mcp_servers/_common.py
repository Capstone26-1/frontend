"""공통 헬퍼: mock 데이터 로딩과 시나리오 스위칭.

환경변수:
    DATA_MODE        : "mock" (기본) | "real" → real은 추후 공공 API 연결 시 구현
    MOCK_SCENARIO    : "normal" (기본) | "delay" | "rain" → 데모 시나리오 전환
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

_BASE_DIR = Path(__file__).resolve().parent.parent
_MOCK_DIR = _BASE_DIR / "mock_data"


def get_scenario() -> str:
    """현재 시나리오명을 반환. 정의되지 않은 값이면 normal로 폴백."""
    scen = os.environ.get("MOCK_SCENARIO", "normal").lower()
    return scen if scen in {"normal", "delay", "rain"} else "normal"


def is_real_mode() -> bool:
    return os.environ.get("DATA_MODE", "mock").lower() == "real"


@lru_cache(maxsize=16)
def _load_mock(file_stem: str) -> dict:
    path = _MOCK_DIR / f"{file_stem}.json"
    if not path.exists():
        raise FileNotFoundError(f"mock 파일이 없습니다: {path}")
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def get_mock_scenario(file_stem: str, scenario: str | None = None) -> dict:
    """mock_data/<file_stem>.json 의 scenarios.<scen> 블록을 반환."""
    scen = (scenario or get_scenario()).lower()
    data = _load_mock(file_stem)
    scenarios = data.get("scenarios", {})
    if scen not in scenarios:
        scen = "normal"
    return scenarios[scen]
