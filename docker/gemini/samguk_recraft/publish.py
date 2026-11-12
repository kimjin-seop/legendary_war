# 삼국 복식 재제작 게시(호출 없음, 안아트 2026-11-08). QA 합격본만 기존 경로에 덮어쓰기(경로·키 불변) + 덮어쓰기 전 백업 + manifest 조각 산출.
# 대상 경로 = public/assets/manifest.json 의 기존 키(portrait.<code>[.thumb], portrait.npc_<hero>[.thumb], unit.hero.<code>.*, unit.hero.gwanggaeto_v4.*, unit.npc.<code>.*)의 path·variants.x2
#            + 키 밖 원본 PNG(public/assets/portraits/<code>.png, portraits/npc/<code>.png 가 이미 있으면 동일 갱신; 다른 생성기의 참조 원본)
# 백업: docker/db-backup-20261108/samguk-recraft/<public 기준 상대경로>(이미 있으면 덮지 않음 = 최초 원본 보존)
# 변환: 초상 webp q90 alpha_quality 100 method 6(webp_convert 규칙), 썸네일 = portrait_out/thumb(q88), 스프라이트 webp = lossless(알파 0/255 보존), png 는 그대로 복사.
# manifest.json·assets.js 는 수정하지 않음 → public/assets/samguk_recraft_manifest_fragment.json(갱신 항목 메타 + replaces_existing_keys).
# 실행(프로젝트 루트): docker run --rm -v samguk_pylib:/pylib -v "$(pwd -W):/app" -w /app -e PYTHONPATH=/pylib python:3.12 python docker/gemini/samguk_recraft/publish.py [--dry]
import json, os, re, shutil, sys, datetime
from PIL import Image
W = 'docker/gemini/samguk_recraft'; PUB = 'public'; BK = 'docker/db-backup-20261108/samguk-recraft'
dry = '--dry' in sys.argv
man = json.load(open('public/assets/manifest.json', encoding='utf-8'))['items']
qa = json.load(open(f'{W}/qa.json', encoding='utf-8'))
calls = [json.loads(l) for l in open(f'{W}/calls_log.jsonl', encoding='utf-8') if l.strip()]
HEROES = {'gyebaek', 'kim_yusin', 'eulji_mundeok', 'gwanggaeto', 'jangsu', 'seondeok', 'jumong'}

def backup(dst):
    rel = os.path.relpath(dst, PUB); b = os.path.join(BK, rel)
    if os.path.exists(dst) and not os.path.exists(b):
        os.makedirs(os.path.dirname(b), exist_ok=True); shutil.copy2(dst, b)
    return b

def write(src, dst, kind):
    if dry: return
    backup(dst)
    if dst.endswith('.webp') and not src.endswith('.webp'):
        im = Image.open(src).convert('RGBA')
        if kind == 'portrait': im.save(dst, 'WEBP', quality=90, alpha_quality=100, method=6)
        else: im.save(dst, 'WEBP', lossless=True, method=6)
    else: shutil.copyfile(src, dst)

frag, replaced, log = [], [], []
for code, q in qa.items():
    if code.startswith('_'): continue
    if not all((q.get(a) or {}).get('verdict') in ('pass', 'minor') for a in ('portrait', 'sprite')): continue  # 초상·시트 둘 다 합격한 인물만(불일치 방지)
    for asset in ('portrait', 'sprite'):
        v = (q.get(asset) or {}).get('verdict')
        if v not in ('pass', 'minor'): continue
        if asset == 'portrait':
            keys = [f'portrait.{code}', f'portrait.{code}.thumb'] + ([f'portrait.npc_{code}', f'portrait.npc_{code}.thumb'] if code in HEROES else [])
            extra = [p for p in (f'{PUB}/assets/portraits/{code}.png', f'{PUB}/assets/portraits/npc/{code}.png') if os.path.exists(p)]
            for p in extra: write(f'{W}/portrait_out/{code}.png', p, 'portrait'); log.append(p)
        else:
            pat = re.compile(rf'^unit\.(hero\.{code}|npc\.{code}' + (r'|hero\.gwanggaeto_v4' if code == 'gwanggaeto' else '') + r')\.(ally|enemy)\.64(\.sheet)?$')
            keys = [it['key'] for it in man if pat.match(it['key'])]
        for it in man:
            if it['key'] not in keys: continue
            paths = [it['path']] + ([it['variants']['x2']] if isinstance(it.get('variants'), dict) and it['variants'].get('x2') else [])
            for p in paths:
                dst = f'{PUB}/{p}'
                if asset == 'portrait':
                    src = f'{W}/portrait_out/thumb/{code}.webp' if it['key'].endswith('.thumb') else f'{W}/portrait_out/{code}.png'
                else:
                    m = pat.match(it['key']); side, sheet = m.group(2), '_sheet' if m.group(3) else ''
                    src = f'{W}/sprite_out/{"64_x2" if "/64_x2/" in p else "64"}/hero_{code}_{side}{sheet}.png'
                if not os.path.exists(src): raise SystemExit(f'원본 없음 {src}')
                write(src, dst, asset); log.append(dst)
            meta = {'key': it['key'], 'path': it['path'], 'variants': it.get('variants'), 'bytes': None if dry else os.path.getsize(f"{PUB}/{it['path']}"),
                    'revision': 'samguk-recraft-20261108', 'generator': 'gemini interactions', 'model': 'gemini-nano-banana-2.1',
                    'script': f'{W}/samguk_gen.mjs({asset}) → ' + ('portrait_pp.sh(alpha_process.py B, 896x1200, thumb 256x343 q88) → publish.py(webp q90 a100)' if asset == 'portrait' else 'sprite_pp.sh(hero_dir_pp_v4.mjs 32색·알파 0/255·적 hue 185-265→빨강) → publish.py'),
                    'prompt_ref': f'{W}/samguk_style.mjs#{code}', 'raw': f'{W}/raw_{asset}/{code}.jpg', 'calls': sum(1 for c in calls if c['id'] == code and c['category'] == f'samguk_{asset}'),
                    'qa': {'checked': True, 'verdict': v, 'issues': q[asset].get('issues', []), 'date': '2026-11-08'},
                    'verify': True, 'verify_note': q.get('verify', ''), 'spec': 'docs/SAMGUK_COSTUME_SPEC_20261108.md',
                    'backup': f'{BK}/{it["path"]}', 'license': 'AI 생성(내부 제작, 모델 이용약관 따름) — 외부 배포 전 확인 필요'}
            frag.append(meta); replaced.append(it['key'])
out = {'note': '삼국(고구려·백제·신라) 복식 고증 재제작(안아트 2026-11-08). 기존 키·경로 그대로 파일만 교체 — 병합 시 replaces_existing_keys 항목의 bytes·revision·qa·verify_note 만 갱신. ASSET_VERSION bump 필요(같은 경로 덮어쓰기라 캐시 무효화).',
       'generated': datetime.datetime.now().isoformat(timespec='seconds'), 'replaces_existing_keys': sorted(set(replaced)), 'items': frag,
       'extra_files_updated_outside_manifest': sorted(set(p for p in log if not any(p.endswith(m['path']) or (m.get('variants') or {}).get('x2', '#') in p for m in frag)))}
if not dry:
    json.dump(out, open('public/assets/samguk_recraft_manifest_fragment.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(('[dry] ' if dry else '') + f'키 {len(set(replaced))}, 파일 {len(set(log))}')
missing = [c for c in qa if not c.startswith('_') and not all((qa[c].get(a) or {}).get('verdict') in ('pass', 'minor') for a in ('portrait', 'sprite'))]
print('미게시(합격 아님):', missing)
