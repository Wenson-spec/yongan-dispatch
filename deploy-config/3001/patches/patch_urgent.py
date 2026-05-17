#!/usr/bin/env python3
"""Patch monitoring-page combined-order row to show '加急' badge and red background."""
import sys, os, shutil

PATH = "/var/www/yongan/dist/public/assets/index-CTp6isfg.js"

with open(PATH, "r", encoding="utf-8") as f:
    src = f.read()

orig_size = len(src)
print(f"Original size: {orig_size}")

# Patch 1: replace row className for the monitoring page combined-order row.
old_cls = '"cursor-pointer border-l-2 border-l-blue-500 bg-blue-50 hover:bg-blue-100/80"'
new_cls = ('Ie.some((Ka) => Ka.isUrgent) '
           '? "cursor-pointer border-l-2 border-l-red-500 bg-red-50 hover:bg-red-50" '
           ': "cursor-pointer border-l-2 border-l-blue-500 bg-blue-50 hover:bg-blue-100/80"')

cnt1 = src.count(old_cls)
print(f"Pattern1 occurrences: {cnt1}")
assert cnt1 == 1, f"Expected exactly 1 occurrence of cls pattern, got {cnt1}"
src = src.replace(old_cls, new_cls, 1)

# Patch 2: insert '加急' badge after the [Ie.length, "单"] badge inside the
# block whose data-loc is CommandCenter.tsx:2927.  The exact multiline snippet
# (with current indentation) is searched; we anchor on the data-loc string to
# avoid touching the other two similar blocks (1657 / 1921).
anchor = (
    '                                                                          a.jsxs(\n'
    '                                                                            de,\n'
    '                                                                            {\n'
    '                                                                              "data-loc":\n'
    '                                                                                "client/src/pages/CommandCenter.tsx:2927",\n'
    '                                                                              variant:\n'
    '                                                                                "outline",\n'
    '                                                                              className:\n'
    '                                                                                "bg-blue-100 text-[10px] text-blue-700 border-blue-300",\n'
    '                                                                              children:\n'
    '                                                                                [\n'
    '                                                                                  Ie.length,\n'
    '                                                                                  "单",\n'
    '                                                                                ],\n'
    '                                                                            },\n'
    '                                                                          ),\n'
    '                                                                        ],\n'
)

cnt2 = src.count(anchor)
print(f"Pattern2 occurrences: {cnt2}")
assert cnt2 == 1, f"Expected exactly 1 occurrence of badge anchor, got {cnt2}"

inject = (
    '                                                                          a.jsxs(\n'
    '                                                                            de,\n'
    '                                                                            {\n'
    '                                                                              "data-loc":\n'
    '                                                                                "client/src/pages/CommandCenter.tsx:2927",\n'
    '                                                                              variant:\n'
    '                                                                                "outline",\n'
    '                                                                              className:\n'
    '                                                                                "bg-blue-100 text-[10px] text-blue-700 border-blue-300",\n'
    '                                                                              children:\n'
    '                                                                                [\n'
    '                                                                                  Ie.length,\n'
    '                                                                                  "单",\n'
    '                                                                                ],\n'
    '                                                                            },\n'
    '                                                                          ),\n'
    '                                                                          Ie.some((Ka) => Ka.isUrgent) && a.jsx(de, { variant: "outline", className: "text-[10px] px-1.5 py-0 bg-red-500 text-white border-red-500", children: "\u52A0\u6025" }),\n'
    '                                                                        ],\n'
)

src = src.replace(anchor, inject, 1)

new_size = len(src)
print(f"New size: {new_size}, delta: {new_size - orig_size}")

with open(PATH, "w", encoding="utf-8") as f:
    f.write(src)

print("Patch applied successfully.")
