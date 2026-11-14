// 잠긴 기능 티저(2026-11-14 사용자 지시: 시즌 전쟁·랭크전 비활성화 + 기대감 모으는 '오픈 예정' 화면).
//  켜고 끄기 = features.js FEATURES. 잠긴 동안 로비 서브 탭은 그대로 보이고(오픈 예정 배지), 누르면 전투·지도 대신 이 화면을 그린다.
//  서버 호출 없음(알림 신청 등 서버 의존 기능 만들지 않음). 새 이미지 없이 기존 키만 재사용(스킨 panel_sub·문장 로고·pix.lock/ico.lock, 없으면 도형 폴백).
//  확정되지 않은 수치·날짜·보상 내용은 약속하지 않는다(날짜 미정 = '오픈 예정').
import { Button } from '../ui/Button.js';
import { makeText } from '../ui/common.js';
import { ScrollList } from '../ui/widgets.js';
import { skinIcon } from '../ui/skin.js';
import { pixelImage } from '../ui/PixelBadge.js';
import { motionOn } from '../ui/TabLoading.js';
import { brandEmblem } from '../brand.js';
import { COLOR, CSS } from '../theme.js';
import { L } from '../layout.js';
import { comingSoonOf } from '../features.js';

export const SOON_LABEL = '오픈 예정';

export const TEASER = {
    war: {
        title: '시즌 전쟁',
        hook: '천하는 아직 주인이 없습니다.',
        desc: '모든 지휘관이 하나의 지도 위에서 땅을 두고 맞붙는 시즌제 대전. 깃발을 꽂은 땅이 곧 당신의 이름이 됩니다.',
        points: [
            '시즌마다 새로 열리는 전장, 모두가 같은 출발선에서 시작합니다',
            '나라에 몸담고 동료 지휘관과 함께 영토를 넓혀 가세요',
            '시즌 동안 세운 공은 시즌 포인트 펜과 시즌 보상으로 돌아옵니다',
        ],
        foot: '전장을 다듬는 중입니다. 문이 열리는 날, 가장 먼저 깃발을 꽂으세요.',
    },
    rank: {
        title: '랭크전',
        hook: '누가 최고의 지휘관인가.',
        desc: '다른 지휘관과 1:1로 맞붙어 순위를 다투는 대전. 이길수록 당신의 이름이 더 높이 올라갑니다.',
        points: [
            '비슷한 실력의 상대와 펼치는 정면 승부',
            '편성과 상성을 읽는 쪽이 판을 가져갑니다',
            '시즌 순위에 따라 시즌 칭호와 보상이 주어집니다',
        ],
        foot: '지금 영웅을 키워 두면 첫 시즌의 출발선이 달라집니다.',
    },
};

// 잠금 아이콘(기존 키 재사용: 도트 pix.lock -> 스킨 ico.lock). 없으면 null
const lockIcon = (scene, size) => pixelImage(scene, 'pix.lock', 0, 0, size) ?? skinIcon(scene, 'lock', size);

// '오픈 예정' 알약 배지. 원점 = 오른쪽 가운데(x, y). 반환 Container(.w)
export function soonPill(scene, x, y, { size = 10, lock = true } = {}) {
    const c = scene.add.container(x, y);
    const t = makeText(scene, 0, 0, SOON_LABEL, { size, bold: true, color: CSS.onAccent, origin: [1, 0.5] });
    const lk = lock ? lockIcon(scene, Math.round(size * 1.1)) : null;
    const padX = Math.round(size * 0.6);
    const iw = lk ? lk.displayWidth + 3 : 0;
    const w = Math.ceil(t.width + iw + padX * 2);
    const h = Math.ceil(t.height + 2);
    const g = scene.add.graphics();
    g.fillStyle(COLOR.accentLight, 1).fillRoundedRect(-w, -h / 2, w, h, h / 2);
    g.lineStyle(1, COLOR.ink, 0.9).strokeRoundedRect(-w + 0.5, -h / 2 + 0.5, w - 1, h - 1, h / 2);
    t.setX(-padX);
    c.add([g, t]);
    if (lk) { lk.setPosition(-padX - t.width - 3 - lk.displayWidth / 2, 0); c.add(lk); }
    c.w = w;
    return c;
}

// 탭 바(Tabs)의 잠긴 기능 칸에 '오픈 예정' 배지 + 라벨 흐림. 탭 바를 다시 만들 때마다 호출(중복 방지)
export function markSoonTabs(scene, tabs) {
    if (!tabs?.scene || !tabs.cells?.length) return;
    const cs = tabs.cells;
    const cw = cs.length > 1 ? cs[1].bg.x - cs[0].bg.x : null;
    cs.forEach((cell, i) => {
        if (cell.vert || !comingSoonOf(cell.key) || cell.soonPill?.scene) return;
        const right = cw ? (i + 1) * cw - 4 : cell.label.x + cell.label.displayWidth / 2 + 12;
        cell.soonPill = soonPill(scene, right, 1, { size: L.short ? 9 : 10 });
        cell.label.setAlpha(0.8);
        tabs.add(cell.soonPill);
    });
}

// 티저 본문. kind = 'war' | 'rank'. 좁은 화면(390)·낮은 화면(667 가로)은 스크롤 목록 안에 그려 잘리지 않게
export async function tabComingSoon(scene, p, kind) {
    const T = TEASER[kind] ?? TEASER.war;
    const a = scene.area;
    scene.done();
    const list = new ScrollList(scene, { x: a.x, y: a.y, w: a.w, h: a.h, clip: true, bar: true });
    p.add(list);
    const box = list.content;
    const W = Math.min(a.w - 12, 640);
    const ox = Math.round((a.w - 8 - W) / 2);
    const compact = L.short;
    const pad = compact ? 14 : 22;
    const inner = W - pad * 2;
    const cx = ox + W / 2;
    const items = [];
    let y = compact ? 10 : 18;

    // 문장 로고(이미 받은 것만, 새 로드 없음) 또는 금 마름모
    const ek = [brandEmblem(0), brandEmblem(999)].map((v) => v?.key).find((k) => k && scene.textures.exists(k));
    const eh = compact ? 34 : 54;
    let mark;
    if (ek) {
        const fr = scene.textures.getFrame(ek);
        mark = scene.add.image(cx, y + eh / 2, ek).setDisplaySize(fr?.realHeight ? eh * (fr.realWidth / fr.realHeight) : eh, eh);
    } else {
        mark = scene.add.graphics({ x: cx, y: y + eh / 2 });
        const s = eh * 0.42;
        mark.fillStyle(COLOR.accent, 0.95).fillPoints([{ x: 0, y: -s }, { x: s, y: 0 }, { x: 0, y: s }, { x: -s, y: 0 }], true);
        mark.fillStyle(COLOR.ink, 1).fillPoints([{ x: 0, y: -s * 0.45 }, { x: s * 0.45, y: 0 }, { x: 0, y: s * 0.45 }, { x: -s * 0.45, y: 0 }], true);
    }
    items.push(mark);
    y += eh + (compact ? 8 : 12);

    const pill = soonPill(scene, 0, 0, { size: compact ? 12 : 13 });
    pill.setPosition(cx + pill.w / 2, y + 9);
    items.push(pill);
    y += compact ? 26 : 30;

    const title = makeText(scene, cx, y, T.title, { size: compact ? 24 : 32, heading: true, color: '#f0d58c', origin: [0.5, 0] });
    items.push(title);
    y += title.height + 4;
    const hook = makeText(scene, cx, y, T.hook, { size: compact ? 16 : 19, bold: true, color: CSS.text, origin: [0.5, 0], wrap: inner, align: 'center', stroke: { color: '#0B1020', width: 3 } });
    items.push(hook);
    y += hook.height + (compact ? 8 : 12);
    items.push(scene.add.rectangle(cx, y, Math.min(inner, 220), 2, COLOR.accent, 0.8));
    y += compact ? 10 : 14;
    const desc = makeText(scene, cx, y, T.desc, { size: compact ? 13 : 15, color: CSS.text, origin: [0.5, 0], wrap: inner, align: 'center' });
    items.push(desc);
    y += desc.height + (compact ? 10 : 16);

    // 기대 포인트: 금 마름모 + 한 줄(넘치면 줄바꿈)
    const bx = ox + pad + 4;
    T.points.forEach((line) => {
        const t = makeText(scene, bx + 18, y, line, { size: compact ? 13 : 15, color: CSS.text, origin: [0, 0], wrap: inner - 26 });
        const d = scene.add.graphics({ x: bx + 5, y: y + Math.min(t.height, compact ? 18 : 21) / 2 });
        d.fillStyle(COLOR.accentLight, 1).fillPoints([{ x: 0, y: -5 }, { x: 5, y: 0 }, { x: 0, y: 5 }, { x: -5, y: 0 }], true);
        items.push(d, t);
        y += t.height + (compact ? 6 : 10);
    });
    y += compact ? 4 : 8;
    const foot = makeText(scene, cx, y, T.foot, { size: compact ? 12 : 14, color: CSS.muted, origin: [0.5, 0], wrap: inner, align: 'center' });
    items.push(foot);
    y += foot.height + (compact ? 10 : 16);

    // 지금 할 수 있는 것: 방 대전(서버 의존 신규 기능 없음)
    const bw = Math.min(220, inner);
    items.push(new Button(scene, { x: cx - bw / 2, y, w: bw, h: 44, label: '방 대전으로 몸풀기', variant: 'primary', size: 15, onClick: () => scene.show('room') }));
    y += 44 + (compact ? 12 : 20);

    box.add(scene.sectionBg(ox, 0, W, y, 0.86));
    box.add(items);
    list.setContentHeight(y + 8);
    list.refreshMask();

    // 은은한 연출: 배지만 천천히 숨쉬기(효과 '풀' + 동작 줄이기 꺼짐일 때만)
    if (motionOn()) {
        const tw = scene.tweens.add({ targets: pill, alpha: 0.65, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        pill.once('destroy', () => tw.remove());
    }
}
