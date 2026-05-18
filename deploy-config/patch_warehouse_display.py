#!/usr/bin/env python3
"""
Patch frontend bundle to fix warehouse display in group cards.
1. FindVehicle: Use getGroupWarehouseSummary for group mode
2. EntryStation 待分流 tab: Add warehouse line to group subtitle
3. EntryStation 全部订单 tab: Add warehouse line to group subtitle
"""
import sys

INPUT = '/tmp/frontend_current.js'
OUTPUT = '/tmp/frontend_current.js'

with open(INPUT, 'r') as f:
    content = f.read()

original_len = len(content)
patches_applied = []

# ============================================================
# PATCH 1: Fix FindVehicle warehouse display for group mode
# ============================================================
PATCH1_FIND = '    f = r.warehouseName || r.originCity || "-",\n    g = uE(n.map((j) => pE(j))),'
PATCH1_REPLACE = '    f = i ? ioe(n) : r.warehouseName || r.originCity || "-",\n    g = uE(n.map((j) => pE(j))),'

count = content.count(PATCH1_FIND)
if count == 1:
    content = content.replace(PATCH1_FIND, PATCH1_REPLACE)
    patches_applied.append("PATCH 1: FindVehicle warehouse group summary")
elif count == 0:
    # Already patched from previous run
    if content.count(PATCH1_REPLACE) == 1:
        patches_applied.append("PATCH 1: Already applied (FindVehicle)")
    else:
        print("ERROR: PATCH 1 marker not found!")
        sys.exit(1)

# ============================================================
# PATCH 2: EntryStation 待分流 tab - Add warehouse to group subtitle
# ============================================================
# Insert a warehouse div after the 客户/货物 div
PATCH2_FIND = '''        "客户：",
        Pt[0]?.customerName || "-",
        "；货物：",
        Pt[0]?.cargoName || "-",
      ],
    }),
    Pt[0]?.mergedPlanNumber'''

PATCH2_REPLACE = '''        "客户：",
        Pt[0]?.customerName || "-",
        "；货物：",
        Pt[0]?.cargoName || "-",
      ],
    }),
    a.jsxs("div", {
      children: [
        "发出仓库：",
        ioe(Pt),
      ],
    }),
    Pt[0]?.mergedPlanNumber'''

count = content.count(PATCH2_FIND)
if count == 1:
    content = content.replace(PATCH2_FIND, PATCH2_REPLACE)
    patches_applied.append("PATCH 2: EntryStation 待分流 warehouse display")
elif count == 0:
    print("WARNING: PATCH 2 marker not found, skipping")
else:
    print(f"WARNING: PATCH 2 marker found {count} times, applying first only")
    content = content.replace(PATCH2_FIND, PATCH2_REPLACE, 1)
    patches_applied.append("PATCH 2: EntryStation 待分流 warehouse display (first match)")

# ============================================================
# PATCH 3: EntryStation 全部订单 tab - Add warehouse to group subtitle
# ============================================================
PATCH3_FIND = '''        Va?.customerName || "-",
        "；货物：",
        Va?.cargoName || "-",
      ],
    }),
    Va?.mergedPlanNumber'''

PATCH3_REPLACE = '''        Va?.customerName || "-",
        "；货物：",
        Va?.cargoName || "-",
      ],
    }),
    a.jsxs("div", {
      children: [
        "发出仓库：",
        ioe(Tt),
      ],
    }),
    Va?.mergedPlanNumber'''

count = content.count(PATCH3_FIND)
if count == 1:
    content = content.replace(PATCH3_FIND, PATCH3_REPLACE)
    patches_applied.append("PATCH 3: EntryStation 全部订单 warehouse display")
elif count == 0:
    print("WARNING: PATCH 3 marker not found, skipping")
else:
    print(f"WARNING: PATCH 3 marker found {count} times, applying first only")
    content = content.replace(PATCH3_FIND, PATCH3_REPLACE, 1)
    patches_applied.append("PATCH 3: EntryStation 全部订单 warehouse display (first match)")

with open(OUTPUT, 'w') as f:
    f.write(content)

print(f"Patches applied: {len(patches_applied)}")
for p in patches_applied:
    print(f"  - {p}")
print(f"File size: {original_len} -> {len(content)} ({len(content) - original_len:+d} bytes)")
