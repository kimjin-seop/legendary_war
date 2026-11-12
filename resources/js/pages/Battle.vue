<script setup>
// 얇은 껍데기: 전체화면 div 하나에 Phaser 게임을 올린다. 모든 화면/UI는 game/ 의 Phaser Scene.
// 쿼리 ?ui=1 이면 스킨 데모 씬으로 시작한다(개발용).
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { useRoute } from 'vue-router';

const el = ref(null);
const failed = ref(false);
const route = useRoute();
let game = null;
let unmounted = false;
const prev = {};

onMounted(async () => {
    // 페이지 스크롤/확대(핀치) 방지: 컨테이너 touch-action 은 인라인 스타일로 지정
    prev.overflow = document.body.style.overflow;
    prev.overscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    try {
        const { createGame } = await import('../game/index.js');
        if (unmounted) return; // 로드 중 이탈 시 중복 게임 생성 방지
        // 개발용 진입: ?ui=1 스킨 데모, ?dialogue=tutorial:tut_00_opening | campaign:ch1_open (대화 씬 단독 확인)
        const dlg = typeof route.query.dialogue === 'string' ? route.query.dialogue.split(':') : null;
        game = createGame(el.value, {
            scene: route.query.ui ? 'UiDemo' : dlg ? 'Dialogue' : undefined,
            sceneData: dlg ? { source: dlg[0] === 'campaign' ? 'campaign' : 'tutorial', id: dlg[1] || undefined, next: { scene: 'Title' } } : undefined,
        });
    } catch (e) {
        console.error('[battle] 게임 로드 실패', e);
        failed.value = true;
    }
});
onBeforeUnmount(() => {
    unmounted = true;
    document.body.style.overflow = prev.overflow ?? '';
    document.body.style.overscrollBehavior = prev.overscroll ?? '';
    game?.destroy(true);
});
</script>

<template>
    <div
        ref="el"
        style="position: fixed; inset: 0; width: 100vw; height: 100dvh; z-index: 50; background: #1b2230; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none"
    ></div>
    <button v-if="failed" style="position: fixed; top: 16px; left: 16px; z-index: 60" @click="$router.go(0)">
        게임을 불러오지 못했습니다. 다시 시도
    </button>
</template>
