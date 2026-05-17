#!/usr/bin/env python3
"""
Generate index_v27.html with td:first-child::before CSS fix.
This is the confirmed working approach for showing left border lines in tables.
"""

with open('/home/ubuntu/index_v26.html', 'r', encoding='utf-8') as f:
    content = f.read()

old_style = '''    <style>
      /* V26 Zebra striping for table rows */
      [data-slot="table-body"] > tr:not(.bg-red-50\\/30):nth-child(even) { background-color: var(--color-slate-100) !important; }
      [data-slot="table-body"] > tr:not(.bg-red-50\\/30):nth-child(odd) { background-color: white !important; }
      [data-slot="table-body"] > tr.bg-red-50\\/30 { background-color: #fef2f24d !important; }
      
      /* V26 Fix: Left border line using ::before pseudo-element on TR.
         This works for ALL table layouts including border-separate with checkbox columns.
         TR must have position:relative for ::before absolute positioning to work. */
      [data-slot="table-body"] > tr {
        position: relative !important;
      }
      /* Urgent rows: red left line (#ef4444 = red-500) */
      [data-slot="table-body"] > tr[class*="border-l-red"]::before {
        content: '' !important;
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        bottom: 0 !important;
        width: 4px !important;
        background-color: #ef4444 !important;
        z-index: 10 !important;
        pointer-events: none !important;
      }
      /* Non-urgent rows: slate-400 left line (#94a3b8) */
      [data-slot="table-body"] > tr[class*="border-l-slate"]::before {
        content: '' !important;
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        bottom: 0 !important;
        width: 4px !important;
        background-color: #94a3b8 !important;
        z-index: 10 !important;
        pointer-events: none !important;
      }
      /* Remove the old border-left from td:first-child to avoid double lines */
      [data-slot="table-body"] > tr > td:first-child {
        border-left: none !important;
      }
    </style>'''

new_style = '''    <style>
      /* V27 Zebra striping for table rows */
      [data-slot="table-body"] > tr:not(.bg-red-50\\/30):nth-child(even) { background-color: var(--color-slate-100) !important; }
      [data-slot="table-body"] > tr:not(.bg-red-50\\/30):nth-child(odd) { background-color: white !important; }
      [data-slot="table-body"] > tr.bg-red-50\\/30 { background-color: #fef2f24d !important; }
      
      /* V27 Fix: Left border line using ::before on td:first-child.
         TR::before does NOT render in table-row context (CSS spec limitation).
         td:first-child::before works correctly and is visible inside the table. */
      
      /* Urgent rows: red left line (#ef4444 = red-500) */
      [data-slot="table-body"] > tr[class*="border-l-red"] > td:first-child {
        position: relative !important;
      }
      [data-slot="table-body"] > tr[class*="border-l-red"] > td:first-child::before {
        content: '' !important;
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        bottom: 0 !important;
        width: 4px !important;
        background-color: #ef4444 !important;
        z-index: 10 !important;
        pointer-events: none !important;
        display: block !important;
      }
      /* Non-urgent rows: slate-400 left line (#94a3b8) */
      [data-slot="table-body"] > tr[class*="border-l-slate"] > td:first-child {
        position: relative !important;
      }
      [data-slot="table-body"] > tr[class*="border-l-slate"] > td:first-child::before {
        content: '' !important;
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        bottom: 0 !important;
        width: 4px !important;
        background-color: #94a3b8 !important;
        z-index: 10 !important;
        pointer-events: none !important;
        display: block !important;
      }
      /* Remove any residual border-left from td:first-child */
      [data-slot="table-body"] > tr > td:first-child {
        border-left: none !important;
      }
    </style>'''

if old_style in content:
    content = content.replace(old_style, new_style)
    print("Successfully replaced v26 style with v27 style")
else:
    import re
    style_pattern = r'<style>.*?</style>'
    match = re.search(style_pattern, content, re.DOTALL)
    if match:
        print(f"Found style block at position {match.start()}-{match.end()}")
        content = content[:match.start()] + new_style + content[match.end():]
        print("Replaced style block via regex")
    else:
        print("ERROR: Could not find style block!")
        exit(1)

# Update version references
content = content.replace('v26', 'v27')
content = content.replace('V26', 'V27')

with open('/home/ubuntu/index_v27.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Written to index_v27.html")

# Verify
with open('/home/ubuntu/index_v27.html', 'r', encoding='utf-8') as f:
    v27 = f.read()

checks = [
    ('::before on td:first-child', 'td:first-child::before' in v27),
    ('red line', '#ef4444' in v27),
    ('slate line', '#94a3b8' in v27),
    ('V27 comment', 'V27' in v27),
]
for name, ok in checks:
    print(f"  {'OK' if ok else 'FAIL'}: {name}")
