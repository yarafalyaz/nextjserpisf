import json

with open("coverage/coverage-final.json") as f:
    d = json.load(f)

for k in d.keys():
    if "master.actions.ts" in k:
        print("Found:", k)
        s = d[k]["s"]
        total = len(s)
        covered = sum(1 for v in s.values() if v > 0)
        print(f"stmts: total={total} covered={covered} pct={100*covered/total:.2f}")

        sm = d[k]["statementMap"]
        uncovered_stmts = [sid for sid, v in s.items() if v == 0]
        print("uncovered stmt lines:", sorted(sm[sid]["start"]["line"] for sid in uncovered_stmts))

        # branches
        b = d[k]["b"]
        bm = d[k]["branchMap"]
        print("\nuncovered branches:")
        for bid, counts in b.items():
            for i, c in enumerate(counts):
                if c == 0:
                    try:
                        loc = bm[bid]["locations"][i] if "locations" in bm[bid] and i < len(bm[bid]["locations"]) else bm[bid]["loc"]
                        print(f"  branch {bid}[{i}] type={bm[bid]['type']} line {loc['start']['line']}")
                    except Exception as e:
                        pass
