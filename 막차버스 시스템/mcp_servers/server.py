"""MCP Tool Server — 5개 P0 Tool을 단일 서버로 노출.

실행:
    python -m mcp_servers.server      # stdio 모드. MCP 클라이언트가 spawn.

FastMCP 데코레이터로 정의된 함수 시그니처에서 입력 스키마가 자동 생성된다.
"""
from __future__ import annotations

from typing import Optional

from mcp.server.fastmcp import FastMCP

from . import tools

mcp = FastMCP("막차 위험탐지 Tool Server")


@mcp.tool()
def live_arrival_tool(stop_id: str, route_id: str) -> dict:
    """특정 정류장의 특정 버스 노선 실시간 도착 정보를 반환한다."""
    return tools.live_arrival(stop_id, route_id)


@mcp.tool()
def last_transport_time_tool(origin: str, destination: str) -> dict:
    """출발지→목적지의 대중교통 옵션과 각 노선의 막차 출발 시간을 반환한다."""
    return tools.last_transport_time(origin, destination)


@mcp.tool()
def weather_tool(location: str) -> dict:
    """현재/단기 강수·강설·기온 정보를 반환한다."""
    return tools.weather(location)


@mcp.tool()
def traffic_incident_tool(bbox: str, route_id: Optional[str] = None) -> dict:
    """지정 영역의 도로 돌발상황을 반환한다."""
    return tools.traffic_incident(bbox, route_id)


@mcp.tool()
def risk_score_tool(
    minutes_until_last: float,
    expected_arrival_min: float,
    transfer_walk_min: float,
    delay_min: float = 0,
    precipitation_type: str = "none",
    incident_severity: str = "none",
) -> dict:
    """막차 실패 위험 점수와 anomaly_type을 계산한다."""
    return tools.risk_score(
        minutes_until_last,
        expected_arrival_min,
        transfer_walk_min,
        delay_min,
        precipitation_type,
        incident_severity,
    )


if __name__ == "__main__":
    mcp.run()
