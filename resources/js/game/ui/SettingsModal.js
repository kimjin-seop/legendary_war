import { Modal } from './Modal.js';
import { Tabs } from './Tabs.js';
import { Button } from './Button.js';
import { makeText } from './common.js';
import { settings } from '../settings.js';
import { FONT_LABELS, CSS, MIN_TOUCH } from '../theme.js';
import { FX } from '../fx_config.js';
import { L, QUALITY } from '../layout.js';

// 설정: [화면] 글자 크기 3단계 / 연출 강도 / 배속 / 그래픽 품질 / 전체화면(지원 환경만)
//       [전투] 교전 컷신 켜짐/끄기 / 대기 시 방향 선택 / 전투 알림 / 전체화면
//       [소리] 배경음 볼륨 / 효과음 볼륨(음소거 ~ 100%)
// 낮은 화면(휴대폰 가로)에서도 스크롤 없이 들어가도록 세 페이지로 나눴다. 닫을 때 onClose({fontChanged}).
export function openSettings(scene, onClose) {
    const startLevel = settings.get().fontLevel;
    const fsOk = !!scene.scale.fullscreen?.available;
    const m = new Modal(scene, {
        title: '설정',
        w: 620,
        h: Math.min(L.lh - 24, 470),
        onClose: () => onClose?.({ fontChanged: settings.get().fontLevel !== startLevel }),
    });
    const inner = Math.min(620, L.lw - 24) - 48;
    const labelW = Math.min(150, inner * 0.36);
    const page = scene.add.container(0, L.short ? 44 : 52); // 가로 폰: 위 탭 줄과 간격 축소
    // 행 간격(row()·전체화면·확인 창 행 공유, 정검수 Medium). 가로 폰은 5행(마지막 행 높이 36)이 버튼 줄 6 위에서 끝나도록 계산(모달 높이 min(470, lh-12), 본문 시작 62+12, 페이지 44)
    const STEP = L.short ? Math.max(30, Math.min(40, Math.floor((Math.min(470, L.lh - 12) - Math.max(48, MIN_TOUCH) - 24 - 6 - (62 + 12 + 44) - 36) / 4))) : 48;
    const LY = L.short ? 18 : 22; const LS = L.short ? 15 : 17; // 라벨 세로 위치·크기
    m.inner.add(page);
    const row = (i, label, items, active, onChange) => {
        const y = i * STEP; // 5줄도 낮은 화면에 들어가게 간격 48(탭 높이 44), 가로 폰 40(탭 36)
        page.add(makeText(scene, 24, y + (L.short ? 18 : 22), label, { size: L.short ? 15 : 17, color: CSS.muted, origin: [0, 0.5] }));
        page.add(new Tabs(scene, { x: 24 + labelW, y, w: inner - labelW, ...(L.short ? { h: 36 } : {}), items, active, onChange, size: tabSize(items, inner - labelW), modal: true }));
    };
    // 좁은 세로 화면(390 등, 라벨 옆 탭 폭 < 300)의 5칸 행(소리 탭): 라벨을 윗줄에 두고 탭을 전체 폭으로(강화면 2026-11-07: '100%'가 '10...'으로 잘리고 '음소거'가 매우 작음)
    const narrow = inner - labelW < 300;
    const SSTEP = 26 + 44 + 12; // 쌓은 행 간격: 라벨 줄 26 + 탭 44 + 여백 12
    const rowStack = (i, label, items, active, onChange) => {
        if (!narrow) { row(i, label, items, active, onChange); return; }
        const y = i * SSTEP;
        page.add(makeText(scene, 24, y + 10, label, { size: 15, color: CSS.muted, origin: [0, 0.5] }));
        page.add(new Tabs(scene, { x: 24, y: y + 26, w: inner, items, active, onChange, size: tabSize(items, inner), minSize: 10, modal: true }));
    };
    // 칸 폭(탭 배경 좌우 2 + 글자 외곽선 여백)에 가장 긴 라벨이 들어가도록 글자 크기를 16에서 최소 10까지 줄인다(모바일 음량 5칸 I-9)
    const tabSize = (items, w, base = 16) => {
        const room = w / items.length - 12;
        const probe = makeText(scene, 0, 0, '', { size: base, bold: true, stroke: { color: '#0B1020', width: 3 } });
        const maxW = Math.max(...items.map((it) => { probe.setText(String(it.label)); return probe.width; }));
        probe.destroy();
        return maxW <= room ? base : Math.max(10, Math.floor(base * room / maxW));
    };
    const build = (p) => {
        page.removeAll(true);
        const s = settings.get();
        if (p === 0) {
            row(0, '글자 크기', FONT_LABELS.map((label, i) => ({ key: i, label })), s.fontLevel, (k) => settings.set({ fontLevel: k }));
            row(1, '연출 강도', FX.levelLabels.map((label, i) => ({ key: i, label })), s.fxLevel, (k) => settings.set({ fxLevel: k }));
            row(2, '진행 속도', FX.speeds.map((v) => ({ key: v, label: `${v}배속` })), s.speed, (k) => settings.set({ speed: k }));
            row(3, '그래픽 품질', QUALITY.map((q, i) => ({ key: i, label: q.label })), s.quality, (k) => settings.set({ quality: k }));
            row(4, '지형 표현', [{ key: 1, label: '매끄럽게' }, { key: 0, label: '격자' }], s.terrainSmooth === false ? 0 : 1, (k) => settings.set({ terrainSmooth: k === 1 })); // 다음 전투 진입부터 적용
        } else if (p === 1) {
            // 교전 컷신: 연출 '풀'에서만 재생(축약·끄기에서는 월드 공격 모션)
            // 2026-11-04: 탭 넘기기 옵션 통합(켜짐·탭 넘김 = 기본 / 켜짐 = 탭해도 끝까지 / 끄기 = 컷신 없이 맵 위 공격 모션·데미지 숫자)
            // 2026-11-14: 모바일도 미설정 = 켜짐·탭 넘김(경량 재생, FxManager.mobileLite). 명시적으로 끈 경우(cutscene === false)만 '끄기'
            row(0, '교전 컷신', [{ key: 2, label: '켜짐·탭 넘김' }, { key: 1, label: '켜짐' }, { key: 0, label: '끄기' }], s.cutscene === false ? 0 : s.cutTapSkip === false ? 1 : 2, (k) => settings.set({ cutscene: k !== 0, cutTapSkip: k !== 1 }));
            row(1, '대기 시 방향', [{ key: 1, label: '선택' }, { key: 0, label: '자동' }], s.waitFacing === false ? 0 : 1, (k) => settings.set({ waitFacing: k === 1 }));
            // 전투 알림 표시 방식: 상단 안내 배너 문구 양·알림 토스트·로그 빨간 점(전체 로그는 상단 '로그' 버튼으로 항상 볼 수 있음)
            row(2, '전투 알림', [{ key: 1, label: '최소' }, { key: 2, label: '보통' }, { key: 3, label: '상세' }, { key: 0, label: '끄기' }], s.notify ?? 1, (k) => settings.set({ notify: k }));
            if (fsOk) {
                page.add(makeText(scene, 24, 3 * STEP + LY, '전체화면', { size: LS, color: CSS.muted, origin: [0, 0.5] }));
                page.add(new Button(scene, { x: 24 + labelW, y: 3 * STEP, w: inner - labelW, ...(L.short ? { h: 36 } : {}), label: '전체화면 전환', modal: true, size: 16, onClick: () => scene.scale.toggleFullscreen() }));
            }
            // '다시 묻지 않기'로 끈 확인 창 복원(현재: 교대 행동 첫 활성화 확인 altConfirmSkip). 끈 것이 없으면 안내만
            const skipped = ['altConfirmSkip'].filter((k) => s[k]);
            page.add(makeText(scene, 24, 4 * STEP + LY, '확인 창', { size: LS, color: CSS.muted, origin: [0, 0.5] }));
            if (skipped.length) page.add(new Button(scene, { x: 24 + labelW, y: 4 * STEP, w: inner - labelW, ...(L.short ? { h: 36 } : {}), label: "'다시 묻지 않기' 해제", modal: true, size: 16, onClick: () => { settings.set(Object.fromEntries(skipped.map((k) => [k, false]))); build(1); } }));
            else page.add(makeText(scene, 24 + labelW, 4 * STEP + LY, '다시 묻지 않기로 끈 확인 창이 없습니다.', { size: L.short ? 13 : 14, color: CSS.muted, origin: [0, 0.5], wrap: inner - labelW })); // 좁은 화면 줄바꿈(I-10)
        } else {
            // 소리: 배경음(bgmVolume/bgmMuted, audio.js BGM 매니저가 즉시 반영) / 효과음(sfxVolume/sfxMuted) / 전투 음성(voiceVolume/voiceMuted)
            const vols = [0, 0.25, 0.5, 0.75, 1];
            const nearOf = (cur) => vols.reduce((a, v) => (Math.abs(v - cur) < Math.abs(a - cur) ? v : a), 1);
            const volItems = vols.map((v) => ({ key: v, label: v === 0 ? '음소거' : `${Math.round(v * 100)}%` }));
            rowStack(0, '배경음', volItems, nearOf(s.bgmMuted ? 0 : (s.bgmVolume ?? 1)), (k) => settings.set({ bgmVolume: k, bgmMuted: k === 0 }));
            rowStack(1, '효과음', volItems, nearOf(s.sfxMuted ? 0 : (s.sfxVolume ?? 1)), (k) => settings.set({ sfxVolume: k, sfxMuted: k === 0 }));
            // 전투 음성(함성·비명·영웅 외침, fx/BattleVoice): 효과음과 별도로 끔/볼륨(voiceMuted/voiceVolume). 효과음이 음소거면 이 값과 무관하게 무음
            rowStack(2, '전투 음성', vols.map((v) => ({ key: v, label: v === 0 ? '끔' : `${Math.round(v * 100)}%` })), nearOf(s.voiceMuted ? 0 : (s.voiceVolume ?? 1)), (k) => settings.set({ voiceVolume: k, voiceMuted: k === 0 }));
        }
    };
    m.inner.add(new Tabs(scene, { x: 24, y: 0, w: inner, items: [{ key: 0, label: '화면' }, { key: 1, label: '전투' }, { key: 2, label: '소리' }], active: 0, onChange: (k) => build(k), size: 16, modal: true }));
    build(0);
    return m;
}
