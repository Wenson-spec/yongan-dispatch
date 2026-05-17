import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('8.138.186.184', username='root', password='Cwy19880623')

def run(cmd, timeout=30):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    return out, err

sftp = ssh.open_sftp()

# Download the JS file
print("=== 下载 index-CqFsU2wZ.js ===")
sftp.get('/var/www/yongan/dist/public/assets/index-CqFsU2wZ.js', '/home/ubuntu/index-CqFsU2wZ.js')
print("下载完成")

# Read and fix
with open('/home/ubuntu/index-CqFsU2wZ.js', 'rb') as f:
    content = f.read()

print(f"文件大小: {len(content)} bytes")

# The brand subtitle "零担工作台" appears in two contexts in SidebarNav:
# 1. fontSize:11,color:xn.mutedFg,fontWeight:400},children:"零担工作台"  (line 204 - expanded sidebar)
# 2. fontSize:11,color:xn.mutedFg},children:"零担工作台"  (line 295 - collapsed sidebar)
# These are the subtitle under "永安物流" in the sidebar brand area
# We need to change them to "调度协同系统"

# Count occurrences
count_ltl = content.count('零担工作台'.encode('utf-8'))
print(f"'零担工作台' 出现次数: {count_ltl}")

# Show all contexts
import re
text = content.decode('utf-8', errors='replace')
matches = list(re.finditer(r'.{0,100}零担工作台.{0,100}', text))
for i, m in enumerate(matches):
    print(f"\n出现 {i+1}: ...{m.group()}...")

# The brand subtitle occurrences (fontSize:11) should be changed to "调度协同系统"
# The nav item label "零担工作台" (in the navigation list) should stay as is
# 
# Pattern to identify brand subtitle vs nav label:
# Brand subtitle: children:"零担工作台"  with fontSize:11 nearby
# Nav label: label:"零担工作台"  in nav items array

# Fix: replace only the brand subtitle occurrences
# Pattern 1: fontWeight:400},children:"零担工作台"
# Pattern 2: color:xn.mutedFg},children:"零担工作台"  (without fontWeight, second occurrence)

old1 = 'fontWeight:400},children:"零担工作台"'.encode('utf-8')
new1 = 'fontWeight:400},children:"调度协同系统"'.encode('utf-8')

old2_ctx = 'color:xn.mutedFg},children:"零担工作台"'.encode('utf-8')
new2_ctx = 'color:xn.mutedFg},children:"调度协同系统"'.encode('utf-8')

print(f"\n替换前 pattern1 出现次数: {content.count(old1)}")
print(f"替换前 pattern2 出现次数: {content.count(old2_ctx)}")

# Apply replacements
new_content = content.replace(old1, new1)
new_content = new_content.replace(old2_ctx, new2_ctx)

# Verify nav label is unchanged
nav_label = 'label:"零担工作台"'.encode('utf-8')
print(f"\n替换后 nav label 出现次数: {new_content.count(nav_label)} (应该 >= 1)")
print(f"替换后 '零担工作台' 总出现次数: {new_content.count('零担工作台'.encode('utf-8'))} (应该 = 1, 只剩nav label)")
print(f"替换后 '调度协同系统' 出现次数: {new_content.count('调度协同系统'.encode('utf-8'))} (应该 = 2)")

if new_content.count('调度协同系统'.encode('utf-8')) == 2:
    print("\n✅ 替换成功")
    
    # Save locally
    with open('/home/ubuntu/index-CqFsU2wZ-fixed.js', 'wb') as f:
        f.write(new_content)
    
    # Backup originals on server
    print("\n=== 备份原始文件 ===")
    run("cp /var/www/yongan/dist/public/assets/index-CqFsU2wZ.js /var/www/yongan/dist/public/assets/index-CqFsU2wZ.js.bak.brand_fix")
    run("cp /var/www/yongan_test/dist/public/assets/index-CqFsU2wZ.js /var/www/yongan_test/dist/public/assets/index-CqFsU2wZ.js.bak.brand_fix")
    print("备份完成")
    
    # Upload fixed file to both 3000 and 3001
    print("\n=== 上传修复后的文件到 3000 ===")
    sftp.put('/home/ubuntu/index-CqFsU2wZ-fixed.js', '/var/www/yongan/dist/public/assets/index-CqFsU2wZ.js')
    out, _ = run("wc -c /var/www/yongan/dist/public/assets/index-CqFsU2wZ.js")
    print(f"3000: {out.strip()}")
    
    print("\n=== 上传修复后的文件到 3001 ===")
    sftp.put('/home/ubuntu/index-CqFsU2wZ-fixed.js', '/var/www/yongan_test/dist/public/assets/index-CqFsU2wZ.js')
    out, _ = run("wc -c /var/www/yongan_test/dist/public/assets/index-CqFsU2wZ.js")
    print(f"3001: {out.strip()}")
    
    # Verify on server
    print("\n=== 验证服务器上的修复 ===")
    out, _ = run(r"""grep -o '.\{0,60\}调度协同系统.\{0,60\}' /var/www/yongan/dist/public/assets/index-CqFsU2wZ.js | head -5""")
    print("3000 JS 中的'调度协同系统':", out if out else "(未找到)")
    
    # Verify routes
    print("\n=== 验证路由 ===")
    for path in ['/', '/station/admin', '/station/ltl-workspace', '/ltl/']:
        out, _ = run(f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:3001{path}")
        print(f"  3001{path}: {out.strip()}")
    for path in ['/', '/station/admin']:
        out, _ = run(f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:3000{path}")
        print(f"  3000{path}: {out.strip()}")
        
else:
    print("\n❌ 替换失败，请检查 pattern")

sftp.close()
ssh.close()
