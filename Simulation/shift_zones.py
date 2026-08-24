import json

path = "src/data/floor1.json"
d = json.load(open(path, encoding="utf-8"))

TARGET_ZONES = {"F1-E", "F1-B"}
for loc in d["locations"]:
    if loc["zoneId"] in TARGET_ZONES:
        loc["y"] += 1

# occupied는 "매대가 차지하는 모든 칸"의 집합이므로 locations가 바뀌면 통째로 다시 만든다.
d["occupied"] = sorted({(loc["x"], loc["y"]) for loc in d["locations"]})
d["occupied"] = [list(c) for c in d["occupied"]]

json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)