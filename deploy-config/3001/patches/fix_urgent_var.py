#!/usr/bin/env python3
"""
Fix isUrgent/hasUrgent variable references in patched_5pages.js.

The issue: we replaced `"rounded-lg border p-4 space-y-2.5 bg-white " + borderClass`
with `\`rounded-lg ... ${isUrgent ? "bg-red-50/30" : "bg-white"} \` + borderClass`
globally, then later replaced all `isUrgent` in that pattern with `hasUrgent`.

But the correct variable name depends on scope:
- 找车台 renderGroupCard (line 53551): uses `hasUrgent` (we defined it) ✅
- 找车台 确认派车tab (lines 52943, 53106, 53443): need to check scope
- 派车台 (lines 58985, 59063): uses `isUrgent` (defined at line 58975)
- 指挥台 (lines 42665, 42848): need to check scope

Strategy: For each occurrence, check what variable is available in that scope.
"""

with open('/home/ubuntu/patched_5pages.js', 'r') as f:
    lines = f.readlines()

# Check each location's scope for the correct variable name
locations = [42665, 42848, 52943, 53106, 53443, 53551, 58985, 59063]

for loc in locations:
    # Search backwards for variable definitions
    found_var = None
    for i in range(loc - 2, max(loc - 50, 0), -1):
        line = lines[i]
        if 'var hasUrgent' in line or 'const hasUrgent' in line:
            found_var = 'hasUrgent'
            break
        if 'var isUrgent' in line or 'const isUrgent' in line:
            found_var = 'isUrgent'
            break
        if 'hasUrgent' in line and ('orders.some' in line or 'hasUrgent =' in line):
            found_var = 'hasUrgent'
            break
    
    current_line = lines[loc - 1]
    if found_var == 'isUrgent' and 'hasUrgent' in current_line:
        print(f"Line {loc}: fixing hasUrgent -> isUrgent (scope has isUrgent)")
        lines[loc - 1] = current_line.replace('hasUrgent', 'isUrgent')
    elif found_var == 'hasUrgent':
        print(f"Line {loc}: OK (scope has hasUrgent)")
    elif found_var is None:
        # Need to add a variable definition
        print(f"Line {loc}: WARNING - no urgent variable found in scope, checking broader context")
        # Check if there's an 'orders' or 'item' variable we can use
        for i in range(loc - 2, max(loc - 100, 0), -1):
            line = lines[i]
            if 'orders.some' in line and 'isUrgent' in line:
                found_var = line.strip().split('=')[0].strip().split()[-1]
                print(f"  Found: {found_var} at line {i+1}")
                break

# Also need to fix the 指挥台 lines 42665 and 42848
# Check what's in scope there
print("\n=== Checking 指挥台 scope ===")
for loc in [42665, 42848]:
    for i in range(loc - 2, max(loc - 30, 0), -1):
        line = lines[i]
        if 'isUrgent' in line or 'hasUrgent' in line or 'Urgent' in line:
            print(f"  Line {i+1} (near {loc}): {line.strip()[:100]}")
            break

# Check 找车台 确认派车tab scope (52943, 53106, 53443)
print("\n=== Checking 找车台确认派车tab scope ===")
for loc in [52943, 53106, 53443]:
    for i in range(loc - 2, max(loc - 30, 0), -1):
        line = lines[i]
        if 'isUrgent' in line or 'hasUrgent' in line or 'Urgent' in line:
            print(f"  Line {i+1} (near {loc}): {line.strip()[:100]}")
            break

with open('/home/ubuntu/patched_5pages.js', 'w') as f:
    f.writelines(lines)

print("\nDone!")
