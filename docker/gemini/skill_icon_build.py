# 스킬 아이콘 빌드(안아트, 2026-11-01). API 호출 없음.
# 48/ 96/ 개별 PNG → 아틀라스 @1x/@2x(+JSON hash) · skill_code→키 매핑 · manifest 조각 · 미리보기 컨택트 시트 · 자동 점검표
# 실행: <python(Pillow,numpy)> docker/gemini/skill_icon_build.py
import json, os, sys, hashlib, datetime
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from skill_icon_pp import CAT, COND, BG, FRAME, GEM, S  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
G = os.path.join(ROOT, 'docker', 'gemini')
OUT = os.path.join(ROOT, 'public', 'assets', 'skill_icons')
REL = 'assets/skill_icons'
COLS, PAD = 20, 2

skills = json.load(open(os.path.join(G, 'skill_icon_skills.json'), encoding='utf8'))['skills']
qa_path = os.path.join(G, 'skill_icon_qa.json')
qa = json.load(open(qa_path, encoding='utf8')).get('items', {}) if os.path.exists(qa_path) else {}
src_path = os.path.join(G, 'skill_icon_sources.json')
srcs = json.load(open(src_path, encoding='utf8')).get('sources', {}) if os.path.exists(src_path) else {}
sheets = {c: sh['id'] for sh in json.load(open(os.path.join(G, 'skill_icon_sheets.json'), encoding='utf8')) for c in sh['codes']}
rank = lambda s: (4 if s.get('batch') == 'nx' else 0 if s['type'] == 'active' else 3 if s['code'].startswith('sh_') else 2 if s['id'] < 100 else 1, s['id'])
order = sorted(skills, key=rank)
present = [s for s in order if os.path.exists(os.path.join(OUT, '48', f"{s['code']}.png"))]
missing = [s['code'] for s in order if s not in present]


def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return round((la + 0.05) / (lb + 0.05), 2)


def build_atlas(scale):
    sz = S * scale; pad = PAD * scale
    rows = (len(present) + COLS - 1) // COLS
    W, H = COLS * (sz + pad * 2), rows * (sz + pad * 2)
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0)); frames = {}
    for i, s in enumerate(present):
        im = Image.open(os.path.join(OUT, '48' if scale == 1 else '96', f"{s['code']}.png"))
        x, y = (i % COLS) * (sz + pad * 2) + pad, (i // COLS) * (sz + pad * 2) + pad
        atlas.paste(im, (x, y), im)
        frames[f"skill.{s['code']}"] = {'frame': {'x': x, 'y': y, 'w': sz, 'h': sz}, 'rotated': False, 'trimmed': False,
                                        'spriteSourceSize': {'x': 0, 'y': 0, 'w': sz, 'h': sz}, 'sourceSize': {'w': sz, 'h': sz}}
    name = f'skill_icons@{scale}x'
    p = os.path.join(OUT, 'atlas', f'{name}.png'); atlas.save(p, optimize=True)
    meta = {'app': 'docker/gemini/skill_icon_build.py', 'image': f'{name}.png', 'format': 'RGBA8888', 'size': {'w': W, 'h': H}, 'scale': str(scale), 'filter': 'NEAREST'}
    json.dump({'frames': frames, 'meta': meta}, open(os.path.join(OUT, 'atlas', f'{name}.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=0)
    return {'path': f'{REL}/atlas/{name}.png', 'json': f'{REL}/atlas/{name}.json', 'size': [W, H], 'bytes': os.path.getsize(p)}


def auto_checks(s):
    im = np.asarray(Image.open(os.path.join(OUT, '48', f"{s['code']}.png")))
    a = im[..., 3] > 0; rgb = im[..., :3].astype(int)
    mag = ((rgb[..., 0] > 200) & (rgb[..., 2] > 200) & (rgb[..., 1] < 90) & a).sum()
    semi = ((im[..., 3] > 0) & (im[..., 3] < 255)).sum()
    cols = len({tuple(c) for c in rgb[a]})
    body = np.zeros_like(a); body[4:44, 4:44] = True; body[0:9, 38:48] = False  # 보라 마름모 자리 제외
    r_, g_, b_ = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    purple = (body & a & (r_ - g_ > 40) & (b_ - g_ > 40) & (np.abs(r_ - b_) < 110)).sum()  # 분홍·자주·보라 잔색
    small = np.asarray(Image.open(os.path.join(OUT, '48', f"{s['code']}.png")).convert('L').resize((24, 24), Image.BOX)).astype(float)
    return {'magenta_px': int(mag), 'purple_px': int(purple), 'semi_alpha_px': int(semi), 'colors': cols, 'contrast24_std': round(float(small[3:21, 3:21].std()), 1)}


def contact_sheet():
    cw, chh, cols = 156, 134, 12
    rows = (len(present) + cols - 1) // cols
    W, H = cols * cw + 16, rows * chh + 16 + 40
    sheet = Image.new('RGBA', (W, H), (16, 28, 58, 255)); d = ImageDraw.Draw(sheet)
    d.text((8, 8), f'skill icons {len(present)}/{len(order)}  | 96px(2x) + 48px + 24px  | gold octagon=active, silver=passive, purple gem=conditional', fill=(230, 230, 230))
    for i, s in enumerate(present):
        im = Image.open(os.path.join(OUT, '96', f"{s['code']}.png"))
        x, y = 8 + (i % cols) * cw, 40 + (i // cols) * chh
        sheet.paste(im, (x, y), im)
        sm = Image.open(os.path.join(OUT, '48', f"{s['code']}.png")); sheet.paste(sm, (x + 100, y), sm)
        t = sm.resize((24, 24), Image.BOX); sheet.paste(t, (x + 100, y + 54), t)
        v = qa.get(s['code'], {}).get('verdict', '')
        d.text((x, y + 100), s['code'][:19], fill=(235, 235, 235))
        if v and v != 'pass': d.text((x, y + 114), v, fill=(255, 140, 120))
    p = os.path.join(OUT, 'preview', 'skill_icons_contact.png'); sheet.save(p, optimize=True)
    # 24px 실사용 크기 판독용(1:1, 36개씩 줄)
    c2 = Image.new('RGBA', (36 * 28 + 8, ((len(present) + 35) // 36) * 28 + 8), (16, 28, 58, 255))
    for i, s in enumerate(present):
        t = Image.open(os.path.join(OUT, '48', f"{s['code']}.png")).resize((24, 24), Image.BOX)
        c2.paste(t, (4 + (i % 36) * 28, 4 + (i // 36) * 28), t)
    c2.resize((c2.width * 2, c2.height * 2), Image.NEAREST).save(os.path.join(OUT, 'preview', 'skill_icons_24px_x2.png'), optimize=True)
    return p


def main():
    for d in ('atlas', 'preview'): os.makedirs(os.path.join(OUT, d), exist_ok=True)
    a1, a2 = build_atlas(1), build_atlas(2)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    rules = {
        'frame': {'active': '금 프레임 + 팔각(모서리 5px 깎음)', 'passive': '은 프레임 + 사각(모서리 2px 깎음)', 'conditional': '패시브 중 발동 조건 템플릿은 우상단 보라 마름모(7x7)', 'aura': '지휘관 오라(auras·공유 오라 au_*)는 원형 청동 프레임(모티프 30px)'},
        'category_by_template': {k: sorted(t for t, c in CAT.items() if c == k) for k in sorted(set(CAT.values()))},
        'category_colors': {k: {'outer': v[0], 'disk': v[1], 'accent': v[2], 'accent_vs_outer_contrast': contrast(v[2], v[0])} for k, v in BG.items()},
        'hyb': '공수 혼합(T_ATKDEF_HYBRID·T_LAST_STAND)은 배경판을 대각선으로 분할(왼쪽 위 atk 적색 / 오른쪽 아래 def 청색)',
        'conditional_templates': sorted(COND), 'frame_colors': FRAME, 'gem_colors': GEM,
        'size': '48x48 @1x, 96x96 @2x(NEAREST 2배). 모티프 36px(오라 30px)+1px 외곽선, 안쪽 판 42px. 아틀라스 칸 사이 투명 여백 2px(@2x 4px) = 번짐 방지',
        'fallback': {'order': ['skill.<code>', 'skill.default_<unit_type> (액티브, 영웅 병종)', 'skill.sh_atk_m (패시브 공격계) / skill.sh_def_m (방어계) / skill.sh_heal_m (치유계) / skill.sh_hyb_m (그 외 패시브)', 'skill.aura_both (오라)'], 'note': 'category_by_template 로 계열을 구해 같은 계열 sh_*_m 을 쓰면 색 체계가 유지됨. 끝까지 없으면 아이콘 칸 숨김(빈 사각 금지)'},
    }
    mapping, items, checks = {}, [], {}
    for s in order:
        c = s['code']; key = f'skill.{c}'; ok = s in present
        cat = 'hyb' if CAT.get(s['template']) == 'hyb' else CAT.get(s['template'], 'atk')
        q = qa.get(c, {})
        mapping[c] = {'key': key if ok else None, 'name': s['name'], 'type': s['type'], 'template': s['template'], 'category': cat,
                      'conditional': s['type'] not in ('active', 'aura') and s['template'] in COND, 'source': s.get('source', 'DB skills 스냅샷(2026-11-01)'), 'enabled': s['enabled'], 'heroes': s['heroes'],
                      'frame': key if ok else None, 'png': f'{REL}/48/{c}.png' if ok else None, 'png2x': f'{REL}/96/{c}.png' if ok else None, 'atlasFrame': key if ok else None,
                      'qa': q.get('verdict', 'unreviewed')}
        if not ok: continue
        checks[c] = auto_checks(s)
        items.append({'key': key, 'type': 'icon', 'path': f'{REL}/48/{c}.png', 'size': '48x48', 'alpha': True, 'filter': 'NEAREST',
                      'variants': {'2x': {'path': f'{REL}/96/{c}.png', 'size': '96x96'}}, 'atlas': {'key': 'atlas.skill_icons', 'frame': key, 'note': '2x 는 atlas.skill_icons.variants.2x(같은 프레임명)'},
                      'bytes': os.path.getsize(os.path.join(OUT, '48', f'{c}.png')),
                      'generator': {'model': 'gemini-nano-banana-2.1', 'api': 'Interactions API', 'size': '2K', 'script': 'docker/gemini/skill_icon_gen.mjs + style_skill_icons.mjs → skill_icon_pp.py'},
                      'prompt_ref': f"skill_icon_motifs.json motifs.{c} / sheet {srcs.get(c, {}).get('sheet', sheets.get(c))}",
                      'license': 'Google Gemini API 생성물(SynthID 워터마크 포함), 후처리(다운샘플·양자화·프레임)는 자체 코드. 상업 이용 범위는 Gemini API 약관 확인 필요',
                      'qa': {'checked': c in qa, 'verdict': q.get('verdict', 'unreviewed'), 'issues': q.get('issues', [])}, 'verify': bool(q.get('verify', False))})
    frag = {'_note': '스킬 아이콘 manifest 조각(안아트, 2026-11-03 개정). manifest 에는 아틀라스 1항목(atlas.skill_icons)만 등록하고 개별 PNG(48/·96/)는 소스로 보관(개별 로드 금지). 프레임명 = skill.<skill_code>, 코드별 메타(계열·프레임 종류·QA)는 skill_icon_map.json. 픽셀아트: NEAREST, 정수 배율만.',
            'generatedAt': now, 'basePath': 'public', 'rules': rules,
            'items': [{'key': 'atlas.skill_icons', 'textureKey': 'skill_icons', 'type': 'atlas', 'scope': 'skill', 'deferred': True, 'unitPx': 2, 'alpha': True, 'filter': 'NEAREST',
                       **a2, 'cell': 96, 'pad': PAD * 2, 'cols': COLS, 'frames': len(present),
                       'variants': {'1x': {'unitPx': 1, **a1, 'cell': 48, 'pad': PAD}},
                       'frameMap': f'{REL}/skill_icon_map.json',
                       'keyRule': '프레임명 skill.<skill_code> (DB skills.code / default_active_skills by_unit_type.*.code / auras.code / 공유 au_*·sh_*). 프레임 없으면 skill_icon_map.json rules.fallback 참고',
                       'loadHints': 'Phaser: ensureSkinTexture(scene, "skill_icons", cb) 로 지연 로드(scope skill). 기본 경로 = @2x(96px 칸, 2px*2 투명 여백), variants.1x = 48px 칸. 표시 48px -> @2x 를 0.5 또는 @1x 를 1.0, 96px -> @2x 1.0, 24px -> @1x 0.5. texture.setFilter(NEAREST). 프레임 조회: scene.textures.get("skill_icons").has("skill." + code)',
                       'generator': {'model': 'gemini-nano-banana-2.1', 'api': 'Interactions API', 'size': '2K', 'script': 'docker/gemini/skill_icon_gen.mjs + style_skill_icons.mjs -> skill_icon_pp.py -> skill_icon_build.py', 'sheets': 'public/assets/skill_icons/raw/{sk01..sk18,rgA01..rgD01,nx01,nx02}.jpg'},
                       'prompt_ref': 'docker/gemini/skill_icon_motifs.json + style_skill_icons.mjs SKILL_ICON_STYLE/NEG',
                       'license': 'Google Gemini API 생성물(SynthID 워터마크 포함), 후처리(다운샘플·양자화·프레임)는 자체 코드. 상업 이용 범위는 Gemini API 약관 확인 필요',
                       'qa': {'verdicts': {v: sum(1 for x in mapping.values() if x['qa'] == v) for v in sorted({x['qa'] for x in mapping.values()})}, 'auto_issues': sum(1 for v in checks.values() if v['magenta_px'] or v['semi_alpha_px'])},
                       'verify': any(bool(qa.get(c, {}).get('verify')) for c in mapping)}]}
    json.dump(frag, open(os.path.join(OUT, 'manifest_fragment.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    json.dump({'_note': 'skill_code → 아틀라스 프레임(skill.<code>) 매핑. 대상 = DB skills 스냅샷 282 + 2026-11-03 nx 24(병종 기본 액티브·오라·공유 오라). key=null 이면 아이콘 없음 -> rules.fallback', 'generatedAt': now, 'count': len(order), 'present': len(present), 'missing': missing,
               'rules': rules, 'map': mapping}, open(os.path.join(OUT, 'skill_icon_map.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    json.dump({'generatedAt': now, 'auto': checks}, open(os.path.join(OUT, 'preview', 'auto_checks.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=0)
    contact_sheet()
    bad = {c: v for c, v in checks.items() if v['magenta_px'] or v['semi_alpha_px']}
    print(f'아이콘 {len(present)}/{len(order)}, 누락 {len(missing)} {missing[:10]}, 자동점검 이상 {len(bad)} {list(bad)[:10]}')
    print('atlas', a1, a2)


if __name__ == '__main__':
    main()
