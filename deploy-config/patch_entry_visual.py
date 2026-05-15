#!/usr/bin/env python3
"""
Patch main system bundle to align EntryStation visual style with LTL workspace.
All markers have been verified to exist exactly once in the bundle.
"""

import sys

INPUT = '/home/ubuntu/index-CTp6isfg-v113432.js'
OUTPUT = '/home/ubuntu/index-CTp6isfg-v113432.js'  # overwrite in place

with open(INPUT, 'r') as f:
    content = f.read()

original_len = len(content)
patches_applied = []

# ============================================================
# PATCH 1: Inject stats bar before the Tabs component
# ============================================================
# Variables in scope: n (active tab), r (setTab), dt (entry queue data), $a (stats)
# Verified unique marker at offset 1092260

PATCH1_MARKER = '          }),\n          a.jsxs(xo, {\n            "data-loc": "client/src/pages/EntryStation.tsx:1409",'

PATCH1_REPLACEMENT = """          }),
          a.jsx("div", {
            className: "flex flex-wrap items-center gap-3 text-[12px] text-slate-700 px-1 py-2",
            children: [
              a.jsxs("div", {
                role: "button",
                tabIndex: 0,
                onClick: function() { r("orders"); },
                className: "flex items-center gap-2.5 bg-white rounded-lg border shadow-sm px-3 py-1.5 hover:shadow-md transition-all cursor-pointer select-none " + (n === "orders" ? "border-blue-400 ring-2 ring-blue-100 bg-blue-50/30" : "border-slate-200"),
                children: [
                  a.jsx("span", { className: "text-[13px] font-semibold text-slate-800", children: "\\u5F85\\u5206\\u6D41" }),
                  a.jsx("span", { className: "ml-1 text-[15px] font-bold tabular-nums text-cyan-600", children: String(dt?.total ?? 0) }),
                ],
              }),
              a.jsxs("div", {
                role: "button",
                tabIndex: 0,
                onClick: function() { r("total"); },
                className: "flex items-center gap-2.5 bg-white rounded-lg border shadow-sm px-3 py-1.5 hover:shadow-md transition-all cursor-pointer select-none " + (n === "total" ? "border-blue-400 ring-2 ring-blue-100 bg-blue-50/30" : "border-slate-200"),
                children: [
                  a.jsx("span", { className: "text-[13px] font-semibold text-slate-800", children: "\\u5168\\u90E8\\u8BA2\\u5355" }),
                  a.jsx("span", { className: "ml-1 text-[15px] font-bold tabular-nums text-teal-600", children: String($a.total ?? 0) }),
                ],
              }),
              a.jsxs("div", {
                role: "button",
                tabIndex: 0,
                onClick: function() { r("settlement"); },
                className: "flex items-center gap-2.5 bg-white rounded-lg border shadow-sm px-3 py-1.5 hover:shadow-md transition-all cursor-pointer select-none " + (n === "settlement" ? "border-blue-400 ring-2 ring-blue-100 bg-blue-50/30" : "border-slate-200"),
                children: [
                  a.jsx("span", { className: "text-[13px] font-semibold text-slate-800", children: "TMS\\u5BFC\\u51FA" }),
                ],
              }),
            ],
          }),
          a.jsxs(xo, {
            "data-loc": "client/src/pages/EntryStation.tsx:1409","""

if PATCH1_MARKER in content:
    content = content.replace(PATCH1_MARKER, PATCH1_REPLACEMENT, 1)
    patches_applied.append("PATCH 1: Stats bar injected")
else:
    print("ERROR: PATCH 1 marker not found!")
    sys.exit(1)

# ============================================================
# PATCH 2: Change batch operation bar to sticky style
# ============================================================
PATCH2_MARKER = 'b.size > 0\n                      ? a.jsx(st, {\n                          "data-loc": "client/src/pages/EntryStation.tsx:1475",\n                          className: "border-primary/20 bg-primary/5",'

PATCH2_REPLACEMENT = 'b.size > 0\n                      ? a.jsx("div", {\n                          "data-loc": "client/src/pages/EntryStation.tsx:1475",\n                          style: { position: "sticky", top: "0px", zIndex: 20, background: "linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%)", border: "1px solid #93c5fd", borderRadius: "8px", boxShadow: "0 2px 8px rgba(59,130,246,0.10)", padding: "0", marginBottom: "8px", backdropFilter: "blur(8px)" },'

if PATCH2_MARKER in content:
    content = content.replace(PATCH2_MARKER, PATCH2_REPLACEMENT, 1)
    patches_applied.append("PATCH 2: Batch bar changed to sticky div")
else:
    print("WARNING: PATCH 2 marker not found!")

# Also change the CardContent (nt) inside to a plain div
PATCH2B_MARKER = 'children: a.jsxs(nt, {\n                            "data-loc":\n                              "client/src/pages/EntryStation.tsx:1476",\n                            className:\n                              "flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between",'
PATCH2B_REPLACEMENT = 'children: a.jsxs("div", {\n                            "data-loc":\n                              "client/src/pages/EntryStation.tsx:1476",\n                            className:\n                              "flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between",'

if PATCH2B_MARKER in content:
    content = content.replace(PATCH2B_MARKER, PATCH2B_REPLACEMENT, 1)
    patches_applied.append("PATCH 2b: CardContent changed to div")
else:
    print("WARNING: PATCH 2b marker not found!")

# ============================================================
# PATCH 3: Modify card colors - align with LTL workspace
# ============================================================
PATCH3_OLD = 'ls ? (ge.isUrgent ? "bg-red-50/60 hover:bg-red-100/80 border-l-2 border-l-red-500" : "bg-blue-50/60 hover:bg-blue-100/80 border-l-2 border-l-blue-500") : "",\n        !ls && ge.isUrgent && !ge.isMerged ? "bg-red-50/60 hover:bg-red-100/80 border-l-2 border-l-red-500" : "",\n        !ls && ge.isUrgent && ge.isMerged ? "bg-red-50/20" : "",\n        !ls && !ge.isUrgent && ge.isMerged ? "bg-blue-50/25" : "",\n        !ls && !ge.isUrgent && !ge.isMerged ? "bg-green-50/60 hover:bg-green-100/80 border-l-2 border-l-green-500" : "",\n        !ls && !ge.isUrgent && !ge.isMerged ? "bg-green-50/60 hover:bg-green-100/80 border-l-2 border-l-green-500" : "",'

PATCH3_NEW = 'ls ? (ge.isUrgent ? "bg-red-50/60 hover:bg-red-100/80 border-l-[3px] border-l-red-500 rounded-lg shadow-sm" : "bg-blue-50/60 hover:bg-blue-100/80 border-l-[3px] border-l-blue-500 rounded-lg shadow-sm") : "",\n        !ls && ge.isUrgent && !ge.isMerged ? "bg-red-50/60 hover:bg-red-100/80 border-l-[3px] border-l-red-500 rounded-lg shadow-sm" : "",\n        !ls && ge.isUrgent && ge.isMerged ? "bg-red-50/30 border-l-[3px] border-l-red-400 rounded-lg shadow-sm" : "",\n        !ls && !ge.isUrgent && ge.isMerged ? "bg-blue-50/30 border-l-[3px] border-l-blue-400 rounded-lg shadow-sm" : "",\n        !ls && !ge.isUrgent && !ge.isMerged ? "bg-emerald-50/60 hover:bg-emerald-100/80 border-l-[3px] border-l-emerald-500 rounded-lg shadow-sm" : "",\n        !ls && !ge.isUrgent && !ge.isMerged ? "bg-emerald-50/60 hover:bg-emerald-100/80 border-l-[3px] border-l-emerald-500 rounded-lg shadow-sm" : "",'

if PATCH3_OLD in content:
    content = content.replace(PATCH3_OLD, PATCH3_NEW, 1)
    patches_applied.append("PATCH 3: Card colors aligned (emerald, thicker border, rounded)")
else:
    print("WARNING: PATCH 3 marker not found!")

# ============================================================
# PATCH 4: Page background - add bg-slate-50 to main container
# ============================================================
PATCH4_MARKER = '"data-loc": "client/src/pages/EntryStation.tsx:1304",\n        className: "space-y-4",'
PATCH4_REPLACEMENT = '"data-loc": "client/src/pages/EntryStation.tsx:1304",\n        className: "space-y-4 bg-slate-50/80 rounded-xl p-4 min-h-[calc(100vh-80px)]",'

if PATCH4_MARKER in content:
    content = content.replace(PATCH4_MARKER, PATCH4_REPLACEMENT, 1)
    patches_applied.append("PATCH 4: Page background changed to slate-50")
else:
    print("WARNING: PATCH 4 marker not found!")

# ============================================================
# PATCH 5: Batch bar info text style
# ============================================================
PATCH5_MARKER = 'className: "text-sm font-medium",\n                                    children: [\n                                      "\u5df2\u9009\u62e9 ",'
PATCH5_REPLACEMENT = 'className: "text-[13px] font-semibold text-slate-800",\n                                    children: [\n                                      "\u5df2\u9009 ",'

if PATCH5_MARKER in content:
    content = content.replace(PATCH5_MARKER, PATCH5_REPLACEMENT, 1)
    patches_applied.append("PATCH 5: Batch info text style aligned")
else:
    print("WARNING: PATCH 5 marker not found!")

# ============================================================
# PATCH 6: Hide the subtitle text
# ============================================================
PATCH6_MARKER = 'className: "mt-0.5 text-sm text-muted-foreground",\n                    children:\n                      "\u5de6\u4fa7\u4e00\u7ea7\u83dc\u5355\u5df2\u6536\u53e3\u4e3a\u5f55\u5355\u53f0'
PATCH6_REPLACEMENT = 'className: "mt-0.5 text-sm text-muted-foreground hidden",\n                    children:\n                      "\u5de6\u4fa7\u4e00\u7ea7\u83dc\u5355\u5df2\u6536\u53e3\u4e3a\u5f55\u5355\u53f0'

if PATCH6_MARKER in content:
    content = content.replace(PATCH6_MARKER, PATCH6_REPLACEMENT, 1)
    patches_applied.append("PATCH 6: Subtitle hidden")
else:
    print("WARNING: PATCH 6 marker not found!")

# ============================================================
# PATCH 7: Tab list style - hide the main tabs since stats bar replaces them
# ============================================================
PATCH7_MARKER = 'a.jsxs(fo, {\n                "data-loc": "client/src/pages/EntryStation.tsx:1410",\n                children: [\n                  a.jsxs(gs, {\n                    "data-loc": "client/src/pages/EntryStation.tsx:1411",\n                    value: "orders",'
PATCH7_REPLACEMENT = 'a.jsxs(fo, {\n                "data-loc": "client/src/pages/EntryStation.tsx:1410",\n                style: { display: "none" },\n                children: [\n                  a.jsxs(gs, {\n                    "data-loc": "client/src/pages/EntryStation.tsx:1411",\n                    value: "orders",'

if PATCH7_MARKER in content:
    content = content.replace(PATCH7_MARKER, PATCH7_REPLACEMENT, 1)
    patches_applied.append("PATCH 7: Main tabs hidden (replaced by stats bar)")
else:
    print("WARNING: PATCH 7 marker not found!")

# ============================================================
# PATCH 8: Search bar style - align height and look
# ============================================================
idx_search = content.find('EntryStation.tsx:1441')
if idx_search > 0:
    search_area = content[idx_search:idx_search+600]
    old8 = 'className: "h-9 pl-9",'
    new8 = 'className: "h-8 pl-9 rounded-md border-slate-300 text-[13px]",'
    local_idx = search_area.find(old8)
    if local_idx >= 0:
        abs_idx = idx_search + local_idx
        content = content[:abs_idx] + new8 + content[abs_idx + len(old8):]
        patches_applied.append("PATCH 8: Search bar style aligned")
    else:
        print("WARNING: PATCH 8 search className not found near marker!")
else:
    print("WARNING: PATCH 8 marker not found!")

# ============================================================
# Write output
# ============================================================
with open(OUTPUT, 'w') as f:
    f.write(content)

print(f"\n{'='*60}")
print(f"Patches applied: {len(patches_applied)}/{9}")
for p in patches_applied:
    print(f"  \u2713 {p}")
print(f"Original size: {original_len}")
print(f"Patched size:  {len(content)}")
print(f"Delta: +{len(content) - original_len} bytes")
print(f"Output: {OUTPUT}")
