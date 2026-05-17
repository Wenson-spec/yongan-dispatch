#!/usr/bin/env python3
"""Fix index.html: update zebra CSS to use slate-100 and bg-red-50/30"""

with open('index_v23.html', 'r') as f:
    content = f.read()

# Replace the old style block with new one
old_style = """    <style>
      /* V22 Zebra striping for table rows */
      [data-slot="table-body"] > tr:not(.bg-red-100):nth-child(even) { background-color: var(--color-slate-50) !important; }
      [data-slot="table-body"] > tr:not(.bg-red-100):nth-child(odd) { background-color: white !important; }
      [data-slot="table-body"] > tr.bg-red-100 { background-color: var(--color-red-100) !important; }
    </style>"""

new_style = """    <style>
      /* V24 Zebra striping for table rows */
      [data-slot="table-body"] > tr:not(.bg-red-50\\/30):nth-child(even) { background-color: var(--color-slate-100) !important; }
      [data-slot="table-body"] > tr:not(.bg-red-50\\/30):nth-child(odd) { background-color: white !important; }
      [data-slot="table-body"] > tr.bg-red-50\\/30 { background-color: #fef2f24d !important; }
    </style>"""

if old_style in content:
    content = content.replace(old_style, new_style)
    print("Style block replaced successfully")
else:
    print("ERROR: old style block not found!")
    import sys
    sys.exit(1)

# Update version number
import re
content = re.sub(r'v=\d+v\d+', 'v=20260517v24', content)
print("Version updated to v24")

with open('index_v24.html', 'w') as f:
    f.write(content)

print(f"Saved to index_v24.html ({len(content)} bytes)")
