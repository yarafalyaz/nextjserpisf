#!/usr/bin/env python3
"""Bulk-refactor NextResponse.json({ error: ... }, { status: N }) → apiError(code, msg)"""
import os
import re

FILES = [
    "src/app/api/dashboard/notifications/route.ts",
    "src/app/api/address/route.ts",
    "src/app/api/attachments/[...path]/route.ts",
    "src/app/api/notifications/route.ts",
    "src/app/api/notifications/[id]/read/route.ts",
    "src/app/api/upload/route.ts",
    "src/app/api/upload/avatar/route.ts",
    "src/app/api/upload/items/route.ts",
    "src/app/api/upload/attachments/route.ts",
    "src/app/api/cron/asset-depreciation/route.ts",
    "src/app/api/cron/route.ts",
    "src/app/api/cron/daily-notifications/route.ts",
    "src/app/api/activity-logs/route.ts",
]

STATUS_MAP = {
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    400: "BAD_REQUEST",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
}

PATTERN = re.compile(
    r'return\s+NextResponse\.json\(\s*\{\s*error:\s*((?:"[^"]*")|(?:`[^`]*`))\s*\}\s*,\s*\{\s*status:\s*(\d+)\s*\}\s*\)',
    re.DOTALL
)

total = 0
for filepath in FILES:
    if not os.path.exists(filepath):
        print(f"  SKIP {filepath} (not found)")
        continue

    with open(filepath) as f:
        content = f.read()

    if 'return NextResponse.json({ error:' not in content and not PATTERN.search(content):
        print(f"  SKIP {filepath} (no patterns)")
        continue

    needs_import = 'apiError' not in content or 'api-response' not in content
    counter = [0]

    def replace_match(m):
        msg = m.group(1)
        status = int(m.group(2))
        code = STATUS_MAP.get(status, "INTERNAL_ERROR")
        counter[0] += 1
        return f'return apiError("{code}", {msg})'

    new_content = PATTERN.sub(replace_match, content)

    if counter[0] == 0:
        print(f"  SKIP {filepath} (no regex matches)")
        continue

    if needs_import:
        lines = new_content.split("\n")
        last_import = -1
        for i, line in enumerate(lines):
            if line.startswith("import "):
                last_import = i
        if last_import >= 0:
            lines.insert(last_import + 1, 'import { apiError } from "@/lib/api-response"')
            new_content = "\n".join(lines)

    with open(filepath, "w") as f:
        f.write(new_content)

    print(f"  ✓ {filepath}: {counter[0]} converted")
    total += counter[0]

print(f"\nTotal: {total} error responses refactored")
