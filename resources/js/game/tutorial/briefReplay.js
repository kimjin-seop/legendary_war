// '도움말 다시 보기'(2026-11-14): 이미 본 시오리 브리핑(개념 팝업·스테이지 안내·전투 조작 안내)을 목록에서 골라 ShioriBrief 로 다시 재생.
// '본 것' 판정 = localStorage 기록(guideFlow 와 같은 키). 다시 보기는 기록을 바꾸지 않는다.
import { Modal } from '../ui/Modal.js';
import { Button } from '../ui/Button.js';
import { makeText } from '../ui/common.js';
import { CSS } from '../theme.js';
import { L } from '../layout.js';
import { enqueueBrief, BRIEF_PRI } from '../ui/ShioriBrief.js';
import { loadGuide, tipStore, POPUP_KEY, guideDone } from './guideFlow.js';
import { briefPages, briefFor, linesToPages, fillBriefPages, fillBriefLines } from './briefData.js';

const KIND_LABEL = { deploy: '편성 안내', battle: '전투 안내' };

// 본 안내 목록: [{ key, label, pages: () => Promise<pages> }]
export async function seenBriefs() {
    const g = await loadGuide().catch(() => null);
    const out = [];
    // 전투 조작 안내(G1~G5): 완료(또는 건너뛰기) 기록이 있으면 단계 문구를 페이지로 이어서
    if (guideDone()) {
        out.push({ key: 'guide', label: '전투 조작 안내', pages: async () => {
            const steps = g?.guide_steps?.steps ?? [];
            const pages = [];
            // 전투 밖이라 스테이지 값이 없다: {goal} = 기존 G1 기본 목표 문구, {heroes} = '다른 영웅', 그 밖의 값 없는 토큰 문장은 빠짐(briefData.fillBriefPages)
            const g1 = steps.find((s) => s.id === 'G1_goal_banner')?.bubble ?? [];
            const tok = { goal: g1.join(' '), heroes: '다른 영웅' };
            for (const s of steps) {
                for (const [k, fb] of [[s.id, s.bubble], ...(s.follow_up_bubble ? [[`${s.id}:follow`, s.follow_up_bubble]] : [])]) {
                    const b = await briefFor(`guide:${k}`);
                    const bp = b ? fillBriefPages(b.pages, tok) : [];
                    pages.push(...(bp.length ? bp : linesToPages(fillBriefLines(fb ?? [], tok), s.id === 'G1_goal_banner' ? 'serious' : 'neutral')));
                }
            }
            return pages;
        } });
    }
    // 개념 팝업
    (g?.concept_popups?.popups ?? []).forEach((p) => {
        const k = POPUP_KEY[p.id];
        if (!k || !tipStore.get(`srpg.tip.${k}`)) return;
        out.push({ key: `concept:${p.id}`, label: p.title ?? p.id, pages: () => briefPages(`concept:${p.id}`, p.lines ?? [], p.expr ?? 'neutral') });
    });
    // 스테이지 안내
    Object.entries(g?.stage_hints ?? {}).forEach(([code, kinds]) => {
        if (code.startsWith('_') || !kinds || typeof kinds !== 'object') return;
        Object.entries(kinds).forEach(([kind, lines]) => {
            if (!Array.isArray(lines) || !tipStore.get(`srpg.tip.hint.${code}.${kind}`)) return;
            out.push({ key: `hint:${code}:${kind}`, label: `${KIND_LABEL[kind] ?? '안내'} · ${code}`, pages: () => briefPages(`hint:${code}:${kind}`, lines, 'neutral') });
        });
    });
    return out;
}

export async function openBriefReplay(scene) {
    const list = await seenBriefs();
    if (!scene.sys?.isActive()) return null;
    if (!list.length) return new Modal(scene, { title: '도움말 다시 보기', body: '아직 본 도움말이 없습니다.\n전투와 편성 중에 시오리가 알려 드린 안내가 여기에 모입니다.', w: 480, h: 280, buttons: [{ label: '확인' }] });
    const w = Math.min(560, L.lw - 24);
    const inner = w - 48;
    const cols = inner >= 420 ? 2 : 1;
    const bh = L.short ? 40 : 48; const gap = 8;
    const rows = Math.ceil(list.length / cols);
    const h = Math.min(L.lh - (L.short ? 12 : 24), 62 + 12 + 34 + rows * (bh + gap) + 96);
    const m = new Modal(scene, { title: '도움말 다시 보기', w, h, buttons: [{ label: '닫기' }] });
    m.inner.add(makeText(scene, 24, 0, '다시 볼 안내를 고르세요.', { size: 15, color: CSS.muted }));
    const bw = (inner - gap * (cols - 1)) / cols;
    list.forEach((it, i) => {
        const col = i % cols; const row = Math.floor(i / cols);
        m.inner.add(new Button(scene, { x: 24 + col * (bw + gap), y: 30 + row * (bh + gap), w: bw, h: bh, label: it.label, size: 15, modal: true, onClick: () => {
            m.close();
            enqueueBrief(scene, { key: `replay:${it.key}:${scene.time.now}`, pri: BRIEF_PRI.replay, force: true, pages: it.pages() });
        } }));
    });
    return m;
}
