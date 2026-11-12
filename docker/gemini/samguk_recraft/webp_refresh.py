# 삼국 재제작 초상 10장 WebP 재변환(호출 없음, 안아트 2026-11-08). webp_map.json 대응 경로(png 옆 .webp)를 portrait_out 새 원본으로 다시 쓴다.
# 규칙 = webp_convert/publish.py 초상 규칙(lossy q90, alpha_quality 100, method 6, 896x1200). 백업: 없을 때만 docker/db-backup-20261108/samguk-recraft/ 에 보존.
import json, os, shutil
from PIL import Image
W = 'docker/gemini/samguk_recraft'; BK = 'docker/db-backup-20261108/samguk-recraft'
T = {'gyebaek': ['assets/portraits/gyebaek.webp', 'assets/portraits/npc/npc_gyebaek.webp'], 'seondeok': ['assets/portraits/seondeok.webp'],
     'kim_yusin': ['assets/portraits/kim_yusin.webp', 'assets/portraits/npc/npc_kim_yusin.webp'], 'jumong': ['assets/portraits/jumong.webp']}
for c in ['npc_yeon_taejo', 'npc_yeon_jayu', 'npc_ondal', 'npc_goguryeo_yalu_ferry_captain', 'npc_goguryeo_cavalry_captain', 'npc_goguryeo_spear_captain']:
    T[c] = [f'assets/portraits/npc/{c}.webp']
res = []
for c, ps in T.items():
    src = Image.open(f'{W}/portrait_out/{c}.png').convert('RGBA'); assert src.size == (896, 1200), (c, src.size)
    for p in ps:
        dst = f'public/{p}'; before = os.path.getsize(dst) if os.path.exists(dst) else None
        b = f'{BK}/{p}'
        if before is not None and not os.path.exists(b): os.makedirs(os.path.dirname(b), exist_ok=True); shutil.copy2(dst, b)
        src.save(dst, 'WEBP', quality=90, alpha_quality=100, method=6)
        a = Image.open(dst); amax = max(abs(x - y) for x, y in zip(a.getchannel('A').getdata(), src.getchannel('A').getdata()))
        res.append({'code': c, 'path': p, 'png': p[:-5] + '.png' if os.path.exists('public/' + p[:-5] + '.png') else None, 'bytes_before': before, 'bytes_after': os.path.getsize(dst), 'size': a.size, 'alpha_max_diff': amax, 'backup': b if os.path.exists(b) else None})
json.dump(res, open(f'{W}/webp_refresh_result.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for r in res: print(r['path'], r['bytes_before'], '->', r['bytes_after'], r['size'], 'aΔ', r['alpha_max_diff'], 'png' if r['png'] else '-')
