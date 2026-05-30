"""MCP 없이 각 Tool을 직접 호출하기 위한 CLI.

예시:
    python -m mcp_servers.cli live_arrival --stop 23001 --route 143
    MOCK_SCENARIO=delay python -m mcp_servers.cli live_arrival --stop 23001 --route 143
    python -m mcp_servers.cli risk_score \\
        --minutes-until-last 12 --expected-arrival-min 18 --transfer-walk-min 4 \\
        --delay 12 --precip rain --incident moderate
"""
from __future__ import annotations

import argparse
import json
import sys

from . import tools


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mcp_servers.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p1 = sub.add_parser("live_arrival")
    p1.add_argument("--stop", required=True)
    p1.add_argument("--route", required=True)

    p2 = sub.add_parser("last_transport")
    p2.add_argument("--origin", required=True)
    p2.add_argument("--destination", required=True)

    p3 = sub.add_parser("weather")
    p3.add_argument("--location", required=True)

    p4 = sub.add_parser("traffic_incident")
    p4.add_argument("--bbox", required=True)
    p4.add_argument("--route", default=None)

    p5 = sub.add_parser("risk_score")
    p5.add_argument("--minutes-until-last", type=float, required=True)
    p5.add_argument("--expected-arrival-min", type=float, required=True)
    p5.add_argument("--transfer-walk-min", type=float, required=True)
    p5.add_argument("--delay", type=float, default=0)
    p5.add_argument("--precip", default="none")
    p5.add_argument("--incident", default="none")

    args = parser.parse_args(argv)

    if args.cmd == "live_arrival":
        result = tools.live_arrival(args.stop, args.route)
    elif args.cmd == "last_transport":
        result = tools.last_transport_time(args.origin, args.destination)
    elif args.cmd == "weather":
        result = tools.weather(args.location)
    elif args.cmd == "traffic_incident":
        result = tools.traffic_incident(args.bbox, args.route)
    elif args.cmd == "risk_score":
        result = tools.risk_score(
            args.minutes_until_last,
            args.expected_arrival_min,
            args.transfer_walk_min,
            delay_min=args.delay,
            precipitation_type=args.precip,
            incident_severity=args.incident,
        )
    else:  # pragma: no cover
        parser.error(f"unknown cmd: {args.cmd}")
        return 2

    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
