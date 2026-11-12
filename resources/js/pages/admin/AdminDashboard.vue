<script setup>
// 대시보드: 시즌 요약(국가 점수·영토 수) / 미처리 채팅 신고 수 / 최근 전쟁 이벤트 / 최근 감사 로그
import { onMounted, ref } from 'vue';
import { adminApi, errText, fmtTime, short } from '../../admin/adminApi.js';

const season = ref(null); const seasonErr = ref('');
const reports = ref(null); const reportsErr = ref('');
const audit = ref([]); const auditErr = ref('');
const loading = ref(true);
const stats = ref(null); // GET /api/admin/dashboard 집계(사용자·전투·감사 로그 오늘 수). 실패 시 줄 숨김
async function load() {
    loading.value = true;
    await Promise.all([
        adminApi.season().then((d) => { season.value = d; seasonErr.value = ''; }).catch((e) => { season.value = null; seasonErr.value = e.code === 'season_not_found' ? '시즌이 없습니다.' : errText(e); }),
        adminApi.reports({ status: 'open' }).then((d) => { reports.value = d; reportsErr.value = ''; }).catch((e) => { reportsErr.value = errText(e); }),
        adminApi.dashboard().then((d) => { stats.value = d; }).catch(() => { stats.value = null; }),
        adminApi.audit({ per_page: 10 }).then((d) => { audit.value = (d?.data ?? []).slice(0, 10); auditErr.value = ''; }).catch((e) => { auditErr.value = errText(e); }),
    ]);
    loading.value = false;
}
onMounted(load);
</script>

<template>
    <div>
        <div class="adm-row"><h1 class="grow">대시보드</h1><button :disabled="loading" @click="load">새로고침</button></div>
        <div v-if="stats" class="adm-grid" style="margin-bottom: 16px">
            <div class="adm-card"><h3>사용자</h3><div class="adm-stat">{{ stats.users?.total ?? '-' }}</div><div class="muted">오늘 가입 {{ stats.users?.today ?? 0 }} · 정지 {{ stats.users?.banned ?? 0 }}</div></div>
            <div class="adm-card"><h3>전투</h3><div class="adm-stat">{{ stats.battles?.today ?? '-' }}</div><div class="muted">오늘 시작 · 진행 중 {{ stats.battles?.in_progress ?? 0 }}</div></div>
            <div class="adm-card"><h3>오늘 관리 작업</h3><div class="adm-stat">{{ stats.audit_logs_today ?? '-' }}</div><div class="muted">감사 로그 기록 수</div></div>
        </div>
        <div class="adm-grid">
            <div class="adm-card">
                <h3>시즌 전쟁</h3>
                <div v-if="seasonErr" class="muted">{{ seasonErr }}</div>
                <template v-else-if="season">
                    <div class="adm-stat">{{ season.season.name }}</div>
                    <div class="muted">#{{ season.season.id }} · {{ season.season.scenario_code }} · <span class="tag" :class="season.season.status === 'active' ? 'on' : ''">{{ season.season.status }}</span></div>
                    <div class="muted">{{ fmtTime(season.season.start_at) }} ~ {{ fmtTime(season.season.end_at) }}</div>
                    <table style="margin-top: 8px"><tbody><tr><th>국가</th><th>점수</th><th>영토</th><th>인원</th></tr>
                        <tr v-for="c in season.countries" :key="c.id"><td>{{ c.code }}</td><td>{{ c.score }}</td><td>{{ c.territories }}</td><td>{{ c.member_count }}</td></tr>
                    </tbody></table>
                </template>
                <RouterLink to="/admin/war">시즌 전쟁 관리 →</RouterLink>
            </div>
            <div class="adm-card">
                <h3>미처리 채팅 신고</h3>
                <div v-if="reportsErr" class="err">{{ reportsErr }}</div>
                <div v-else class="adm-stat">{{ reports?.total ?? '-' }}</div>
                <RouterLink to="/admin/chat">신고 큐 열기 →</RouterLink>
            </div>
        </div>
        <div class="adm-card">
            <h3>최근 전쟁 이벤트</h3>
            <div v-if="!season?.recent_events?.length" class="muted">없음</div>
            <div v-else class="adm-table-wrap"><table><tbody>
                <tr><th>시각</th><th>종류</th><th>국가</th><th>영토</th><th>내용</th></tr>
                <tr v-for="e in season.recent_events.slice(0, 10)" :key="e.id"><td>{{ fmtTime(e.created_at) }}</td><td>{{ e.type }}</td><td>{{ e.country ?? '-' }}</td><td>{{ e.territory_id ?? '-' }}</td><td class="mono">{{ short(e.payload, 90) }}</td></tr>
            </tbody></table></div>
        </div>
        <div class="adm-card">
            <h3>최근 감사 로그</h3>
            <div v-if="auditErr" class="err">{{ auditErr }}</div>
            <div v-else class="adm-table-wrap"><table><tbody>
                <tr><th>시각</th><th>관리자</th><th>동작</th><th>대상</th></tr>
                <tr v-for="a in audit" :key="a.id"><td>{{ fmtTime(a.created_at) }}</td><td>{{ a.user_id ?? 'CLI' }}</td><td>{{ a.action }}</td><td>{{ a.entity }} #{{ a.entity_key }}</td></tr>
            </tbody></table></div>
            <RouterLink to="/admin/audit">감사 로그 전체 →</RouterLink>
        </div>
    </div>
</template>
