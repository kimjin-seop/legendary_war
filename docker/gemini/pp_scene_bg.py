# 대사 장면 배경 후처리(API 호출 없음). raw/scene_bg/<id>.jpg -> public/assets/bg/scene/<set>/<name>.webp(1920x1080) + _1280.webp
# 처리: 16:9 중앙 cover 크롭 -> LANCZOS 축소 -> 대사창 가독 그라데이션(하단) + 초상화 슬롯 비네팅(좌우) + 상단 버튼 줄 약한 어둡게 -> WebP
# 실행(저장소 루트): python docker/gemini/pp_scene_bg.py [id ...]     (Pillow, numpy)
# 산출: 조각 public/assets/bg/scene/manifest_fragment_scene_bg.json, 매핑 public/assets/bg/scene/scene_bg_map.json, 미리보기 preview_contact.jpg, QA public/assets/bg/scene/scene_bg_qa.json
import json, os, sys, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont

RAW_ROOT = 'public/assets/raw'
OUT = 'public/assets/bg/scene'
W, H = 1920, 1080
# 가독 그레이딩 강도(곱셈 계수 = 1 - 값)
BOTTOM_START, BOTTOM_MAX = 0.60, 0.42   # 높이 60%부터 바닥까지 최대 42% 어둡게(smoothstep)
SIDE_MAX = 0.22                          # 좌우 가장자리 최대 22% 어둡게(가로 0~28%, 72~100%)
TOP_MAX = 0.18                           # 상단 0~10% 최대 18%
Q, Q_SMALL = 80, 78
CROP = {}

def jobs():
    js = subprocess.run(['node', '-e', "import('./docker/gemini/style_scene_bg.mjs').then(m=>console.log(JSON.stringify({jobs:m.SCENE_BG_FINAL.map(j=>({id:j.id,set:j.set,name:j.name,key:j.key,verify:j.verify,note:j.note??null,refs:j.refs??[],cat:j.raw_category})),map:m.SCENE_BG_MAP,prov:m.SCENE_BG_PROVISIONAL,qa:m.SCENE_BG_QA,crop:m.CROP_FIX})))"], capture_output=True, text=True, encoding='utf-8', check=True).stdout
    return json.loads(js)

def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

def mask():
    y = np.linspace(0, 1, H)[:, None]; x = np.linspace(0, 1, W)[None, :]
    m = np.ones((H, W))
    m *= 1 - BOTTOM_MAX * ss(BOTTOM_START, 1.0, y)
    side = np.maximum(ss(0.28, 0.0, x), ss(0.72, 1.0, x))
    m *= 1 - SIDE_MAX * side * ss(0.05, 0.25, y)  # 상단 모서리는 상단 처리와 겹치지 않게
    m *= 1 - TOP_MAX * ss(0.10, 0.0, y)
    return m

def lum(a):
    return (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]) / 255.0

def process(j, M):
    src = f"{RAW_ROOT}/{j['cat']}/{j['id']}.jpg"
    im = Image.open(src).convert('RGB'); sw, sh = im.size
    cf = CROP.get(j['id'])
    if cf:  # 호출 없이 크롭으로 살린 원본(CROP_FIX)
        l, t, r, b = cf['box']; im = im.crop((round(l * sw), round(t * sh), round(r * sw), round(b * sh)))
    sw2, sh2 = im.size
    tw = round(sh2 * 16 / 9)
    if tw <= sw2: l = (sw2 - tw) // 2; im = im.crop((l, 0, l + tw, sh2))
    else: th = round(sw2 * 9 / 16); t = (sh2 - th) // 2; im = im.crop((0, t, sw2, t + th))
    im = im.resize((W, H), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    pre_bottom = float(lum(a[int(H * 0.70):]).mean())
    a = np.clip(a * M[..., None], 0, 255)
    out = Image.fromarray(a.astype(np.uint8))
    d = f"{OUT}/{j['set']}"; os.makedirs(d, exist_ok=True)
    p1, p2 = f"{d}/{j['name']}.webp", f"{d}/{j['name']}_1280.webp"
    out.save(p1, 'WEBP', quality=Q, method=6)
    out.resize((1280, 720), Image.LANCZOS).save(p2, 'WEBP', quality=Q_SMALL, method=6)
    L = lum(a)
    box = L[int(H * 0.70):, int(W * 0.21):int(W * 0.79)]          # 대사창 영역(1100px 폭 기준 근사)
    side_l = L[int(H * 0.2):int(H * 0.85), :int(W * 0.33)]; side_r = L[int(H * 0.2):int(H * 0.85), int(W * 0.67):]
    # 흰 글자(#F0F0F0) 대비: 대사창은 반투명 패널이 덮지만, 패널 없이도 대비가 나오는지 최악(밝은 99퍼센타일) 기준으로 측정
    def rl(v): v = np.where(v <= 0.03928, v / 12.92, ((v + 0.055) / 1.055) ** 2.4); return v
    lin = rl(np.clip(a[int(H * 0.70):, int(W * 0.21):int(W * 0.79)] / 255.0, 0, 1)); Y = 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]
    y99 = float(np.percentile(Y, 99)); ymean = float(Y.mean())
    cr = lambda y: (0.871 + 0.05) / (y + 0.05)
    edges = np.abs(np.diff(L, axis=1))
    return {
        'key': j['key'], 'path': p1.replace('public/', ''), 'path_1280': p2.replace('public/', ''),
        'crop_fix': CROP.get(j['id']), 'bytes': os.path.getsize(p1), 'bytes_1280': os.path.getsize(p2), 'src': src.replace('public/', ''), 'src_size': [sw, sh],
        'metrics': {
            'dialog_luma_mean': round(float(box.mean()), 3), 'dialog_luma_p99': round(float(np.percentile(box, 99)), 3), 'dialog_luma_pre_grade': round(pre_bottom, 3),
            'white_text_contrast_mean': round(cr(ymean), 2), 'white_text_contrast_worst_p99': round(cr(y99), 2),
            'side_luma_l': round(float(side_l.mean()), 3), 'side_luma_r': round(float(side_r.mean()), 3),
            'side_detail_l': round(float(edges[int(H * 0.2):int(H * 0.85), :int(W * 0.33)].mean()), 4), 'side_detail_r': round(float(edges[int(H * 0.2):int(H * 0.85), int(W * 0.67):].mean()), 4),
            'center_detail': round(float(edges[int(H * 0.15):int(H * 0.55), int(W * 0.35):int(W * 0.65)].mean()), 4),
        },
    }

def contact(results, jl, dst):
    tw, th, pad, cap = 640, 360, 12, 30
    cols = 3; rows = (len(results) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * (tw + pad) + pad, rows * (th + cap + pad) + pad), (11, 19, 40))
    dr = ImageDraw.Draw(sheet)
    try: font = ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 18)
    except Exception: font = ImageFont.load_default()
    for i, r in enumerate(results):
        im = Image.open('public/' + r['path']).resize((tw, th), Image.LANCZOS)
        g = ImageDraw.Draw(im, 'RGBA')
        # 대사 화면 가이드: 대사창(1100x184, 하단 12px 여백) + 좌우 초상화 슬롯(대사창 폭 20%/80%) + 상단 버튼 줄
        s = tw / W; bw, bh = 1100 * s, 184 * s; bx = (tw - bw) / 2; by = th - 12 * s - bh
        g.rectangle([bx, by, bx + bw, by + bh], fill=(16, 28, 58, 150), outline=(217, 180, 90, 220), width=1)
        for k in (0.2, 0.8):
            cx = bx + bw * k; ph = th * 0.70; pw = ph * 0.6
            g.rectangle([cx - pw / 2, by + 32 * s - ph, cx + pw / 2, by + 32 * s], outline=(240, 213, 140, 160), width=1)
        g.text((bx + 10, by + 8), '대사창 위 흰 글자 가독 예시 텍스트', fill=(240, 240, 240, 255), font=ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 13) if os.path.exists('C:/Windows/Fonts/malgun.ttf') else None)
        x = pad + (i % cols) * (tw + pad); y = pad + (i // cols) * (th + cap + pad)
        sheet.paste(im, (x, y + cap))
        dr.text((x, y + 4), f"{r['key']}  ({r['bytes'] // 1024}KB)  {r['qa']['verdict']}", fill=(243, 220, 142), font=font)
    sheet.save(dst, quality=86)

def main():
    global CROP
    d = jobs(); M = mask(); CROP = d.get('crop') or {}; only = set(sys.argv[1:])
    os.makedirs(OUT, exist_ok=True)
    qa_path = f'{OUT}/scene_bg_qa.json'
    qa_manual = json.load(open(qa_path, encoding='utf-8')).get('manual', {}) if os.path.exists(qa_path) else {}
    results = []
    for j in d['jobs']:
        if not os.path.exists(f"{RAW_ROOT}/{j['cat']}/{j['id']}.jpg"): print('raw 없음', j['id']); continue
        r = process(j, M)  # 재처리 비용 작음: 지표 일관성을 위해 항상 전체 다시 계산
        man = qa_manual.get(j['key'], {'verdict': 'unchecked', 'issues': []})
        r['qa'] = man; r['job'] = j; results.append(r)
        print(r['key'], r['bytes'] // 1024, 'KB', r['metrics'])
    # manifest 조각(미병합). 부팅 일괄 로드 금지: scope 'lazy' + deferred(대화 진입 시 장면 키만 개별 요청)
    items = []
    for r in results:
        j = r['job']
        items.append({
            'key': r['key'], 'path': r['path'], 'type': 'image', 'format': 'webp', 'size': [W, H], 'alpha': False,
            'scope': 'lazy', 'deferred': True, 'filter': 'LINEAR',
            'variants': {'1280': r['path_1280']}, 'bytes_variants': {'1920': r['bytes'], '1280': r['bytes_1280']},
            'set': j['set'], 'usage': 'dialogue_background',
            'display': 'cover(화면을 빈틈없이 덮는 배율, 중앙 기준 잘림). 하단 약 40%와 좌우 가장자리는 대사창·초상화 가독용으로 미리 어둡게 구움(추가 오버레이 불필요, 원하면 0~20% 남색 오버레이)',
            'generator': {'model': 'gemini-nano-banana-2.1', 'api': 'Interactions API', 'size': '2K', 'aspect': '16:9', 'script': 'docker/gemini/gen_scene_bg.mjs + style_scene_bg.mjs, 후처리 pp_scene_bg.py'},
            'prompt_ref': f"style_scene_bg.mjs SCENE_BGS[{j['id']}]" + (f" (참조 이미지 {', '.join(j['refs'])} — 그림체 기준)" if j['refs'] else ''),
            'src_raw': r['src'], 'license': 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요',
            'qa': {'checked': r['qa']['verdict'] != 'unchecked', **r['qa'], 'metrics': r['metrics']},
            'verify': bool(j['verify']), **({'verify_note': j['note']} if j['note'] else {}),
        })
    frag = {'_note': '대사 장면 배경(bg.<set>.<name>) manifest 조각 — 미병합. 병합: docker/gemini/merge_fragments.mjs FRAGMENTS 에 { path: `${A}/bg/scene/manifest_fragment_scene_bg.json` } 1줄 추가(윤프론). 전 항목 scope lazy·deferred(부팅 로드 제외)',
            '_keyRule': 'bg.<set>.<name> — set: archive(서고 공통) | <서가 id>(imjin=임진왜란, 이후 goryeo_khitan 등). 예약 set: battle, screen. 파일 public/assets/bg/scene/<set>/<name>.webp(1920x1080) + <name>_1280.webp',
            '_generated': '2026-11-01', 'items': items}
    json.dump(frag, open(f'{OUT}/manifest_fragment_scene_bg.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    keys = {r['key'] for r in results}
    bad = [k for k in list(d['map'].values()) + list(d['prov'].values()) if k not in keys]
    mp = {'_note': '대화 장면 id(캠페인 scene.id / 튜토리얼 step.id / 11서가 scene.id) -> 배경 manifest 키. resources/js/game/data/dialogue/scene_bg_map.json 에 scenes 를 그대로 복사(윤프론). _provisional 은 전용 배경 제작 전 임시 대체(시대·지형 불일치 가능) — 쓰려면 scenes 에 합쳐 넣는다',
          '_source': 'docker/gemini/style_scene_bg.mjs SCENE_BG_MAP', 'scenes': d['map'], '_provisional': d['prov'], '_missing_keys': bad}
    json.dump(mp, open(f'{OUT}/scene_bg_map.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump({'_note': '자체 QA. manual = 육안 판정(안아트), metrics = 자동 지표', 'checklist': d['qa'], 'manual': qa_manual,
               'metrics': {r['key']: r['metrics'] for r in results}}, open(qa_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    contact(results, d['jobs'], f'{OUT}/preview_contact.jpg')
    print('items', len(items), 'missing map keys', bad, 'total KB', sum(r['bytes'] for r in results) // 1024, '/1280 KB', sum(r['bytes_1280'] for r in results) // 1024)

main()
