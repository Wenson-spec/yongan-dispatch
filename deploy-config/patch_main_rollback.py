#!/usr/bin/env python3
"""
Patch the main system bundle to make the command center rollback button
call revertLtlPickupSubchain for outsource sub-chain orders.

Strategy:
1. Add a new state variable __isPickupSubchain alongside [P, k]
2. Add revertLtlPickupSubchain mutation alongside K
3. In Ke function, detect if order is pickup subchain and set the flag
4. In confirm button onClick, check the flag and call the right mutation
"""

FILE = '/home/ubuntu/index-CTp6isfg-v113432.js'

with open(FILE, 'r') as f:
    content = f.read()

original_size = len(content)
patches_applied = 0

# ============================================================
# PATCH 1: Add __isPickupSubchain state after [P, k] = useState(null)
# ============================================================
old_state = '[P, k] = y.useState(null),\n    [R, A] = y.useState'
new_state = '[P, k] = y.useState(null),\n    [__isPickupSubchain, __setIsPickupSubchain] = y.useState(false),\n    [R, A] = y.useState'

if old_state in content:
    content = content.replace(old_state, new_state, 1)
    patches_applied += 1
    print(f"PATCH 1: Added __isPickupSubchain state - OK")
else:
    print(f"PATCH 1: Pattern not found - SKIP")

# ============================================================
# PATCH 2: Add revertLtlPickupSubchain mutation after K definition
# ============================================================
old_k_mutation = 'K = we.order.rollbackStatus.useMutation({\n      onSuccess: (U) => {\n        (Ca(),\n          Ne(),\n          q.success(`订単已退回：${U.fromLabel} → ${U.toLabel}`),\n          k(null),\n          A(""));\n      },\n      onError: (U) => q.error(U.message),\n    })'

# Use a more robust search - find K mutation and add after it
k_pattern = 'K = we.order.rollbackStatus.useMutation({\n      onSuccess: (U) => {\n        (Ca(),\n          Ne(),\n          q.success(`\u8ba2\u5355\u5df2\u9000\u56de\uff1a${U.fromLabel} \u2192 ${U.toLabel}`),'

if k_pattern in content:
    # Find the end of K mutation definition - look for the closing "})"
    k_idx = content.find(k_pattern)
    # Find the closing ")," after K definition
    # Pattern: onError: (U) => q.error(U.message),\n    }),
    k_close_pattern = 'onError: (U) => q.error(U.message),\n    }),'
    k_close_idx = content.find(k_close_pattern, k_idx)
    if k_close_idx >= 0:
        insert_point = k_close_idx + len(k_close_pattern)
        
        new_mutation = """
    __revertPickup = we.order.revertLtlPickupSubchain.useMutation({
      onSuccess: (U) => {
        (Ca(),
          Ne(),
          q.success(U.message || "\u5916\u8bf7\u5b50\u5355\u5df2\u9000\u56de\uff0c\u7236\u8ba2\u5355\u5df2\u6062\u590d"),
          k(null),
          A(""),
          __setIsPickupSubchain(false));
      },
      onError: (U) => q.error(U.message || "\u9000\u56de\u5931\u8d25"),
    }),"""
        
        content = content[:insert_point] + new_mutation + content[insert_point:]
        patches_applied += 1
        print(f"PATCH 2: Added __revertPickup mutation - OK")
    else:
        print(f"PATCH 2: K close pattern not found - SKIP")
else:
    print(f"PATCH 2: K mutation pattern not found - SKIP")

# ============================================================
# PATCH 3: Modify Ke function to detect pickup subchain
# ============================================================
old_ke = 'Ke = y.useCallback(\n      (U, Ie) => {\n        const Dt = fe(U);\n        if (Dt) {\n          q.error(Dt);\n          return;\n        }\n        const sa = Ie ?? U?.orderId ?? U?.id;\n        sa && (k(sa), A(""));\n      },\n      [fe],\n    ),'

new_ke = 'Ke = y.useCallback(\n      (U, Ie) => {\n        const Dt = fe(U);\n        if (Dt) {\n          q.error(Dt);\n          return;\n        }\n        const sa = Ie ?? U?.orderId ?? U?.id;\n        __setIsPickupSubchain(!!(U?.subchainStage === "pickup" && U?.ltlSegmentMode === "pickup_outsource"));\n        sa && (k(sa), A(""));\n      },\n      [fe],\n    ),'

if old_ke in content:
    content = content.replace(old_ke, new_ke, 1)
    patches_applied += 1
    print(f"PATCH 3: Modified Ke to detect pickup subchain - OK")
else:
    print(f"PATCH 3: Ke pattern not found - SKIP")

# ============================================================
# PATCH 4: Modify confirm button to call the right mutation
# ============================================================
old_confirm = 'P && R.trim() && K.mutate({ id: P, reason: R.trim() });'
new_confirm = 'P && R.trim() && (__isPickupSubchain ? __revertPickup.mutate({ subchainOrderId: P, reason: R.trim() }) : K.mutate({ id: P, reason: R.trim() }));'

if old_confirm in content:
    # Only replace the first occurrence (in the command center dialog)
    content = content.replace(old_confirm, new_confirm, 1)
    patches_applied += 1
    print(f"PATCH 4: Modified confirm button onClick - OK")
else:
    print(f"PATCH 4: Confirm button pattern not found - SKIP")

# ============================================================
# PATCH 5: Also modify the "退回中..." / "确认退回" button text
# ============================================================
old_pending = 'K.isPending ? "\u9000\u56de\u4e2d..." : "\u786e\u8ba4\u9000\u56de"'
new_pending = '(K.isPending || __revertPickup.isPending) ? "\u9000\u56de\u4e2d..." : (__isPickupSubchain ? "\u786e\u8ba4\u9000\u56de\u5916\u8bf7" : "\u786e\u8ba4\u9000\u56de")'

if old_pending in content:
    content = content.replace(old_pending, new_pending, 1)
    patches_applied += 1
    print(f"PATCH 5: Modified button text - OK")
else:
    print(f"PATCH 5: Button text pattern not found - SKIP")

# ============================================================
# PATCH 6: Also modify disabled condition
# ============================================================
old_disabled = '!R.trim() || K.isPending,'
new_disabled = '!R.trim() || K.isPending || __revertPickup.isPending,'

# Only replace the first occurrence near the rollback dialog
idx_disabled = content.find(old_disabled, 1700000)
if idx_disabled >= 0 and idx_disabled < 1800000:
    content = content[:idx_disabled] + new_disabled + content[idx_disabled + len(old_disabled):]
    patches_applied += 1
    print(f"PATCH 6: Modified disabled condition - OK")
else:
    print(f"PATCH 6: Disabled pattern not found - SKIP")

# Write output
with open(FILE, 'w') as f:
    f.write(content)

print(f"\n=== Summary ===")
print(f"Patches applied: {patches_applied}/6")
print(f"File size: {original_size} -> {len(content)}")

# Verify
with open(FILE, 'r') as f:
    verify = f.read()
print(f"__isPickupSubchain count: {verify.count('__isPickupSubchain')}")
print(f"__revertPickup count: {verify.count('__revertPickup')}")
print(f"revertLtlPickupSubchain count: {verify.count('revertLtlPickupSubchain')}")
