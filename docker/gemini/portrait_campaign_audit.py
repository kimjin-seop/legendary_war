# 캠페인(서가) 연관 인물 초상화 보유 감사(읽기 전용). 출력: docker/gemini/portrait_campaign/audit.json + 콘솔 표
# 출처: database/data/shelf_map_meta.json(heroes·factions), heroes.json, npc_roster_v3.json, scenario/shelf_*_npcs.json,
#       public/assets/manifest.json(portrait.<code>/.thumb), manifest unit.hero/unit.npc(스프라이트 보유)
# 사용: python -X utf8 docker/gemini/portrait_campaign_audit.py
import os, json, glob
ROOT = os.path.dirname(os.path.abspath(__file__))
APP = os.path.normpath(os.path.join(ROOT, '..', '..'))
D = os.path.join(APP, 'database', 'data')
J = lambda p: json.load(open(p, encoding='utf-8'))

meta = J(os.path.join(D, 'shelf_map_meta.json'))
heroes = {h['code']: h for h in J(os.path.join(D, 'heroes.json'))['items']}
npcs = {n['code']: n for n in J(os.path.join(D, 'npc_roster_v3.json'))['items']}
man = J(os.path.join(APP, 'public', 'assets', 'manifest.json'))['items']
pkeys = {i['key'] for i in man if str(i.get('key', '')).startswith('portrait.')}
# 스프라이트: manifest unit.hero.<code>.* 또는 unit.npc.<code>.*
spr = {k.split('.')[2] for k in (i['key'] for i in man) if k.startswith(('unit.hero.', 'unit.npc.')) and k.count('.') >= 2}
# 미병합 초상화 조각(다른 작업이 만든 deferred 산출) — 있으면 '조각에 있음'으로 표시
frag_keys = set()
for f in glob.glob(os.path.join(APP, 'public', 'assets', '**', '*fragment*.json'), recursive=True):
    try:
        for it in J(f).get('items', []):
            if str(it.get('key', '')).startswith('portrait.'): frag_keys.add(it['key'])
    except Exception:
        pass

shelf_npcs = {}
for f in sorted(glob.glob(os.path.join(D, 'scenario', 'shelf_*_npcs.json'))):
    d = J(f); items = d.get('items') or d.get('npcs') or (d if isinstance(d, list) else [])
    for n in items:
        if isinstance(n, dict) and n.get('code'):
            shelf_npcs[n['code']] = {**n, '_file': os.path.basename(f)}

rows = []
def add(code, shelf, role, src):
    h = heroes.get(code) or npcs.get(code) or shelf_npcs.get(code) or {}
    rows.append({
        'code': code, 'name_ko': h.get('name_ko') or h.get('name') or '', 'shelf': shelf['shelf_code'], 'shelf_name': shelf['name_ko'],
        'status': shelf.get('status'), 'role': role, 'source': src,
        'culture': h.get('culture', ''), 'era': h.get('era', '') or shelf.get('era_label', ''),
        'in_heroes': code in heroes, 'in_npc_roster': code in npcs, 'in_shelf_npcs': shelf_npcs.get(code, {}).get('_file'),
        'portrait': f'portrait.{code}' in pkeys, 'thumb': f'portrait.{code}.thumb' in pkeys,
        'portrait_in_fragment': f'portrait.{code}' in frag_keys, 'sprite': code in spr,
    })

for s in meta['shelves']:
    for h in s.get('heroes', []):
        add(h['code'], s, h.get('role', ''), 'shelf.heroes')
    num = s['shelf_code'].replace('ch', '')
    for code, n in shelf_npcs.items():
        if n['_file'].startswith(f'shelf_{num}_'):
            add(code, s, n.get('side') or n.get('role') or 'npc', f"scenario/{n['_file']}")
    for f in s.get('factions', []):
        for k in ('leader', 'leaders', 'rep', 'representative', 'heroes'):
            for c in (f.get(k) or []) if isinstance(f.get(k), list) else ([f.get(k)] if f.get(k) else []):
                add(c if isinstance(c, str) else c.get('code'), s, f'faction:{f["id"]}', 'shelf.factions')

need = [r for r in rows if not r['portrait'] and not r['portrait_in_fragment']]
out = {'shelves': [s['shelf_code'] for s in meta['shelves']], 'count': len(rows), 'missing_portrait': len(need),
       'missing_sprite': sorted({r['code'] for r in rows if not r['sprite']}), 'rows': rows}
os.makedirs(os.path.join(ROOT, 'portrait_campaign'), exist_ok=True)
json.dump(out, open(os.path.join(ROOT, 'portrait_campaign', 'audit.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for r in rows:
    print(f"{r['shelf']:5} {r['role']:10} {r['code']:28} {r['name_ko']:10} {r['culture']:10} 초상={'O' if r['portrait'] else ('F' if r['portrait_in_fragment'] else 'X')} 썸={'O' if r['thumb'] else 'X'} 스프라이트={'O' if r['sprite'] else 'X'} {r['source']}")
print('총', len(rows), '초상 없음', len(need), [r['code'] for r in need])
