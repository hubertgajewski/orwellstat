"""Compute MTTR from a JSON list of GitHub issues piped on stdin.

Each issue must have 'createdAt' and 'closedAt' ISO-8601 timestamps.
Accepts an optional argument for the "no data" label; defaults to "N/A".
"""
import json
import sys
from datetime import datetime


def mttr(issues, na_label="N/A"):
    if not issues:
        return na_label
    deltas = []
    for i in issues:
        created = datetime.fromisoformat(i["createdAt"].replace("Z", "+00:00"))
        closed = datetime.fromisoformat(i["closedAt"].replace("Z", "+00:00"))
        deltas.append((closed - created).total_seconds())
    avg = sum(deltas) / len(deltas)
    days = avg / 86400
    return f"{days:.1f} days" if days >= 1 else f"{avg / 3600:.1f} hours"


data = json.load(sys.stdin)
na = sys.argv[1] if len(sys.argv) > 1 else "N/A"
print(mttr(data, na))
