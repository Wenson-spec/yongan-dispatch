#!/usr/bin/env python3
"""
V25 Fix: Add box-shadow CSS to make left border visible in border-separate tables.
Also update version number to v25.
"""

# Read the current index.html
with open('/home/ubuntu/index_v24.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the old style block with new one that includes box-shadow fix
old_style = """    <style>
      /* V24 Zebra striping for table rows */
      [data-slot="table-body"] > tr:not(.bg-red-50\\/30):nth-child(even) { background-color: var(--color-slate-100) !important; }
      [data-slot="table-body"] > tr:not(.bg-red-50\\/30):nth-child(odd) { background-color: white !important; }
      [data-slot="table-body"] > tr.bg-red-50\\/30 { background-color: #fef2f24d !important; }
    </style>"""

new_style = """    <style>
      /* V25 Zebra striping for table rows */
      [data-slot="table-body"] > tr:not(.bg-red-50\\/30):nth-child(even) { background-color: var(--color-slate-100) !important; }
      [data-slot="table-body"] > tr:not(.bg-red-50\\/30):nth-child(odd) { background-color: white !important; }
      [data-slot="table-body"] > tr.bg-red-50\\/30 { background-color: #fef2f24d !important; }
      
      /* V25 Fix: Left border line using box-shadow (works with border-separate tables) */
      /* Urgent rows: red left line */
      [data-slot="table-body"] > tr.border-l-4.border-l-red-500 {
        box-shadow: inset 4px 0 0 0 oklch(0.637 0.237 25.331) !important;
      }
      /* Non-urgent rows: slate-400 left line */
      [data-slot="table-body"] > tr.border-l-4.border-l-slate-400 {
        box-shadow: inset 4px 0 0 0 oklch(0.704 0.04 256.788) !important;
      }
    </style>"""

if old_style in content:
    content = content.replace(old_style, new_style)
    print("✅ Style block updated with box-shadow fix")
else:
    print("❌ Could not find old style block!")
    print("Searching for partial match...")
    if "V24 Zebra striping" in content:
        print("Found V24 comment but exact match failed")
    exit(1)

# Update version number from v24 to v25
content = content.replace('v=20260517v24', 'v=20260517v25')
print("✅ Version updated to v25")

# Write the new file
with open('/home/ubuntu/index_v25.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Written to /home/ubuntu/index_v25.html")
print(f"   File size: {len(content)} bytes")
