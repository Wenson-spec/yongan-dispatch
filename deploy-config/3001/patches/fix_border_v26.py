#!/usr/bin/env python3
"""
Generate index_v26.html with ::before pseudo-element CSS fix for table row left border lines.
This replaces the v25 border-left on td:first-child approach with ::before on TR,
which works correctly even for tables with checkbox columns.
"""

with open('/home/ubuntu/index_v25.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the old v25 style block with the new v26 style block
old_style = '''    <style>
      /* V25 Zebra striping for table rows */
      [data-slot="table-body"] > tr:not(.bg-red-50\\/30):nth-child(even) { background-color: var(--color-slate-100) !important; }
      [data-slot="table-body"] > tr:not(.bg-red-50\\/30):nth-child(odd) { background-color: white !important; }
      [data-slot="table-body"] > tr.bg-red-50\\/30 { background-color: #fef2f24d !important; }
      
      /* V25 Fix: Left border line on first TD (border-separate tables don't render TR borders) */
      /* Urgent rows: red left line */
      [data-slot="table-body"] > tr.border-l-4.border-l-red-500 > td:first-child {
        border-left: 4px solid oklch(0.637 0.237 25.331) !important;
      }
      /* Non-urgent rows: slate-400 left line */
      [data-slot="table-body"] > tr.border-l-4.border-l-slate-400 > td:first-child {
        border-left: 4px solid oklch(0.704 0.04 256.788) !important;
      }
    </style>'''

new_style = '''    <style>
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

if old_style in content:
    content = content.replace(old_style, new_style)
    print("Successfully replaced v25 style with v26 style")
else:
    # Try to find the style tag and replace it
    import re
    style_pattern = r'<style>.*?</style>'
    match = re.search(style_pattern, content, re.DOTALL)
    if match:
        print(f"Found style block at position {match.start()}-{match.end()}")
        print(f"Current style content:\n{match.group()[:500]}")
        content = content[:match.start()] + new_style + content[match.end():]
        print("Replaced style block")
    else:
        print("ERROR: Could not find style block to replace!")
        exit(1)

# Update version references
content = content.replace('v25', 'v26')
content = content.replace('V25', 'V26')

with open('/home/ubuntu/index_v26.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Written to index_v26.html")

# Verify the new style is present
with open('/home/ubuntu/index_v26.html', 'r', encoding='utf-8') as f:
    v26 = f.read()

if '::before' in v26 and 'border-l-red' in v26 and 'border-l-slate' in v26:
    print("VERIFIED: ::before pseudo-element CSS is in v26")
else:
    print("ERROR: CSS not found in v26!")
