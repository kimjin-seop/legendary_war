"""영웅 카드 프레임에서 코스트 메달 제거(안아트, 2026-11-08). API 호출 없음.
card_pp.build_parts 와 같은 입력(raw + card_picks)·같은 합성 순서로 card.frame.<r> 을 다시 만들되 메달만 빼고 합성한다.
메달이 덮던 자리는 원본 프레임의 오른쪽 아래 모서리 장식 + 스탯 바 오른쪽 끝이 그대로 드러난다(다른 영역 픽셀은 동일).
실행(컨테이너): sh docker/gemini/card_py.sh python docker/gemini/card_nomedal.py [check|write]
  check: 메달 포함 재합성이 기존 qa/_frame_master_<r>.png 와 일치하는지 확인 + 메달 없는 미리보기만 qa/ 에 저장
  write: card.frame.<r>@2x/@3x(png/webp) + qa/_frame_master_<r>.png 덮어쓰기
"""
import sys, json
import numpy as np
from PIL import Image
sys.path.insert(0, 'docker/gemini')
import card_pp as C

mode = sys.argv[1] if len(sys.argv) > 1 else 'check'
rf = C.rect('rank_flag'); nb = C.rect('name_banner'); sb = C.rect('stat_bar'); cm = C.rect('cost_medal')
banner = C.trim(C.drop_small(C.keyout(C.pick('piece', 'banner'))))
statbar = C.trim(C.drop_small(C.keyout(C.pick('piece', 'statbar'))))
medal = C.trim(C.drop_small(C.keyout(C.pick('piece', 'medal'))))
banner_r = C.slice3(banner, nb[2], nb[3], C.PICK.get('banner_cap', 0.16))
statbar_r = C.slice3(statbar, sb[2], sb[3], C.PICK.get('statbar_cap', 0.08))
medal_r = C.fit(medal, cm[2], cm[3])
report = {}
for r in C.RAR:
    kind = C.KEY.get(r, 'm')
    fr = C.trim(C.drop_small(C.keyout(C.pick('frame', f'frame_{r}'), kind)))
    fr = C.fit(fr, C.W, C.H)
    fr.putalpha(Image.fromarray(np.minimum(np.asarray(fr)[..., 3], np.asarray(C.round_mask(C.W, C.H, C.corner_r())))))
    fl = C.trim(C.drop_small(C.keyout(C.pick('flag', f'flag_{r}'), kind)))
    fl = fl.resize((rf[2], round(fl.height * rf[2] / fl.width)), Image.LANCZOS)
    flc = Image.new('RGBA', fl.size); flc.alpha_composite(fl)
    lb = C.dark_navy_bbox(flc, (0, int(fl.height * 0.15), fl.width, int(fl.height * 0.85)))
    side = min(lb[2] - lb[0], lb[3] - lb[1]); cx, cy = (lb[0] + lb[2]) / 2, (lb[1] + lb[3]) / 2
    C.draw_letter(flc, (cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2), r.upper(), r)

    def comp(with_medal):
        c = Image.new('RGBA', (C.W, C.H))
        c.alpha_composite(fr); c.alpha_composite(statbar_r, (sb[0], sb[1])); c.alpha_composite(banner_r, (nb[0], nb[1]))
        if with_medal:
            c.alpha_composite(medal_r, (cm[0], cm[1]))
        c.alpha_composite(flc, (rf[0], rf[1]))
        return c

    old = np.asarray(Image.open(f'{C.ROOT}/qa/_frame_master_{r}.png').convert('RGBA')).astype(int)
    a, b = np.asarray(comp(True)).astype(int), np.asarray(comp(False)).astype(int)
    diff_repro = int(np.abs(a - old).max())
    changed = np.any(a != b, axis=2); ys, xs = np.where(changed)
    report[r] = {'repro_maxdiff_vs_existing': diff_repro, 'changed_bbox': [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())] if len(xs) else None,
                 'changed_px': int(changed.sum())}
    nm = comp(False)
    if mode == 'write':
        if diff_repro > 2:
            print('ABORT: reproduction mismatch', r, diff_repro); sys.exit(1)
        C.save_pair(nm, f'{C.ROOT}/frames/card.frame.{r}', [('2x', 448), ('3x', 672)])
        nm.save(f'{C.ROOT}/qa/_frame_master_{r}.png')
    else:
        nm.save(f'{C.ROOT}/qa/_nomedal_preview_{r}.png')
print(json.dumps(report))
