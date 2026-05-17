#!/usr/bin/env python3
"""
V25b Fix: Use border-left on td:first-child instead of box-shadow on TR.
The issue was that in border-separate tables:
- TR border-left doesn't render visually
- TR box-shadow is covered by TD cells
- Only border-left directly on TD:first-child works
"""

# Read the current index.html from server (use the v25 we just created)
with open('/home/ubuntu/index_v25.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the box-shadow rules with border-left on td:first-child
old_css = """      /* V25 Fix: Left border line using box-shadow (works with border-separate tables) */
      /* Urgent rows: red left line */
      [data-slot="table-body"] > tr.border-l-4.border-l-red-500 {
        box-shadow: inset 4px 0 0 0 oklch(0.637 0.237 25.331) !important;
      }
      /* Non-urgent rows: slate-400 left line */
      [data-slot="table-body"] > tr.border-l-4.border-l-slate-400 {
        box-shadow: inset 4px 0 0 0 oklch(0.704 0.04 256.788) !important;
      }"""

new_css = """      /* V25 Fix: Left border line on first TD (border-separate tables don't render TR borders) */
      /* Urgent rows: red left line */
      [data-slot="table-body"] > tr.border-l-4.border-l-red-500 > td:first-child {
        border-left: 4px solid oklch(0.637 0.237 25.331) !important;
      }
      /* Non-urgent rows: slate-400 left line */
      [data-slot="table-body"] > tr.border-l-4.border-l-slate-400 > td:first-child {
        border-left: 4px solid oklch(0.704 0.04 256.788) !important;
      }"""

if old_css in content:
    content = content.replace(old_css, new_css)
    print("✅ CSS updated: box-shadow → border-left on td:first-child")
else:
    print("❌ Could not find old CSS block!")
    exit(1)

# Write the updated file
with open('/home/ubuntu/index_v25.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Written to /home/ubuntu/index_v25.html")
print(f"   File size: {len(content)} bytes")
