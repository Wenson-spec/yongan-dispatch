#!/usr/bin/env python3
"""
Fix all hasUrgent references to correct variable names based on scope.
"""

with open('/home/ubuntu/patched_5pages.js', 'r') as f:
    lines = f.readlines()

# Line 42665: renderSingleCard(O) in 指挥台 待审批tab - O is order object
# Use O.isUrgent
lines[42664] = lines[42664].replace('hasUrgent ?', 'O.isUrgent ?')
print("Fixed line 42665: hasUrgent -> O.isUrgent")

# Line 52943: renderSingleCard(O) in 找车台 确认派车tab - O is order object
# Use O.isUrgent
lines[52942] = lines[52942].replace('hasUrgent ?', 'O.isUrgent ?')
print("Fixed line 52943: hasUrgent -> O.isUrgent")

# Line 53443: in 找车台 确认派车tab - check scope
# From earlier analysis: line 53433 has 'var urgentDiff = (y.isUrgent ? 1 : 0)...'
# This is in a sort function, not a card render. Let's check more context
for i in range(53435, 53450):
    print(f"  Line {i+1}: {lines[i].strip()[:120]}")

# Line 59063: in 派车台 - isUrgent is defined at 58975 but that's in a different function
# Let's check the immediate scope
print("\n=== Line 59063 context ===")
for i in range(59050, 59068):
    print(f"  Line {i+1}: {lines[i].strip()[:120]}")

with open('/home/ubuntu/patched_5pages.js', 'w') as f:
    f.writelines(lines)

print("\nSaved.")
