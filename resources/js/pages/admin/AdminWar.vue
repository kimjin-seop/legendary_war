<script setup>
// 시즌 전쟁 관리: 시즌 요약(국가·영토·최근 이벤트), 시즌 생성(시나리오 imjin/france/rome + 확인 문자열 CREATE_SEASON),
// 강제 종료(요약 재확인 + END_SEASON_<id> + 사유), 공성 중 영토 점령도 보정(0~99 + 사유). war_tick_busy(409)는 재시도 안내
import { computed, onMounted, ref } from 'vue';
import { adminApi, errText, fmtTime, short } from '../../admin/adminApi.js';
import ConfirmModal from '../../admin/components/ConfirmModal.vue';

const SCENARIOS = [['imjin', '1592년 조선(조선·일본·명)'], ['france', '프랑스'], ['rome', '로마'], ['legnica', '레그니차(몽골·유럽)']];
const data = ref(null); const err = ref(''); const ok = ref(''); const loading = ref(false);
const seasonId = ref('');
const modal = ref(null); const mBusy = ref(false); const mErr = ref('');
const scenario = ref('imjin');
const occ = ref(0);
async function load() {
    loading.value = true; err.value = '';
    try { data.value = await adminApi.season(seasonId.value ? Number(seasonId.value) : null); }
    catch (e) { data.value = null; err.value = e.code === 'season_not_found' ? '시즌이 없습니다. 새 시즌을 생성하세요.' : errText(e); }
    finally { loading.value = false; }
}
const s = computed(() => data.value?.season ?? null);
const active = computed(() => s.value?.status === 'active');
function ask(kind, t = null) { modal.value = { kind, t }; mErr.value = ''; if (t) occ.value = t.occupation; }
async function run({ reason }) {
    const { kind, t } = modal.value; mBusy.value = true; mErr.value = '';
    try {
        if (kind === 'create') { const r = await adminApi.createSeason(scenario.value, 'CREATE_SEASON'); ok.value = `시즌 생성 완료 (#${r?.season_id ?? '?'}, ${scenario.value})`; seasonId.value = ''; }
        else if (kind === 'end') { await adminApi.endSeason(s.value.id, `END_SEASON_${s.value.id}`, reason); ok.value = `시즌 #${s.value.id} 강제 종료 완료`; }
        else if (kind === 'occ') { const r = await adminApi.occupation(t.id, Number(occ.value), reason); ok.value = `영토 ${t.code} 점령도 ${r?.occupation ?? occ.value}${r?.state === 'peace' ? ' (공성 종료)' : ''}`; }
        modal.value = null; load();
    } catch (e) { mErr.value = errText(e) + (e.code === 'war_tick_busy' ? ' — 잠시 후 [확인]을 다시 누르세요.' : ''); }
    finally { mBusy.value = false; }
}
const occValid = computed(() => Number.isInteger(Number(occ.value)) && Number(occ.value) >= 0 && Number(occ.value) <= 99);
onMounted(load);
</script>

<template>
    <div>
        <div class="adm-row">
            <h1 class="grow">시즌 전쟁</h1>
            <input v-model="seasonId" placeholder="시즌 ID(비우면 활성/최신)" style="width: 190px" @keyup.enter="load" />
            <button :disabled="loading" @click="load">조회</button>
            <button class="primary" @click="ask('create')">새 시즌 생성</button>
        </div>
        <div v-if="err" class="err">{{ err }}</div>
        <div v-if="ok" class="okmsg">{{ ok }} · <RouterLink to="/admin/audit">감사 로그 보기</RouterLink></div>
        <template v-if="s">
            <div class="adm-card">
                <div class="adm-row">
                    <div class="grow"><h2 style="margin: 0">{{ s.name }}</h2>
                        <div class="muted">#{{ s.id }} · 시나리오 {{ s.scenario_code }} · <span class="tag" :class="active ? 'on' : ''">{{ s.status }}</span> · {{ fmtTime(s.start_at) }} ~ {{ fmtTime(s.end_at) }}</div></div>
                    <button class="danger" :disabled="!active" @click="ask('end')">강제 종료</button>
                </div>
                <div class="adm-table-wrap"><table><tbody>
                    <tr><th>국가</th><th>점수</th><th>영토</th><th>인원</th></tr>
                    <tr v-for="c in data.countries" :key="c.id"><td>{{ c.code }}</td><td>{{ c.score }}</td><td>{{ c.territories }}</td><td>{{ c.member_count }}</td></tr>
                </tbody></table></div>
            </div>
            <div class="adm-card adm-table-wrap">
                <h3>영토</h3>
                <table><tbody>
                    <tr><th>ID</th><th>코드</th><th>소유</th><th>상태</th><th>공성국</th><th>점령도</th><th>최근 전투</th><th></th></tr>
                    <tr v-for="t in data.territories" :key="t.id">
                        <td>{{ t.id }}</td><td class="mono">{{ t.code }}</td><td>{{ t.owner ?? '-' }}</td><td><span class="tag" :class="t.state === 'siege' ? 'bad' : ''">{{ t.state }}</span></td>
                        <td>{{ t.siege_country ?? '-' }}</td><td>{{ t.occupation }}</td><td>{{ fmtTime(t.last_battle_at) }}</td>
                        <td><button class="sm" :disabled="t.state !== 'siege' || !active" :title="t.state !== 'siege' ? '공성 중인 영토만 보정할 수 있습니다' : ''" @click="ask('occ', t)">점령도 보정</button></td>
                    </tr>
                </tbody></table>
            </div>
            <div class="adm-card adm-table-wrap">
                <h3>최근 이벤트 (30)</h3>
                <table><tbody><tr><th>시각</th><th>종류</th><th>국가</th><th>영토</th><th>내용</th></tr>
                    <tr v-for="e in data.recent_events" :key="e.id"><td>{{ fmtTime(e.created_at) }}</td><td>{{ e.type }}</td><td>{{ e.country ?? '-' }}</td><td>{{ e.territory_id ?? '-' }}</td><td class="mono">{{ short(e.payload, 100) }}</td></tr>
                </tbody></table>
            </div>
        </template>
        <ConfirmModal v-if="modal?.kind === 'create'" title="새 시즌 생성" message="선택한 시나리오에 활성 시즌이 없을 때만 생성됩니다." confirm-text="CREATE_SEASON" ok-label="생성" :busy="mBusy" :error="mErr" @cancel="modal = null" @ok="run">
            <label class="f">시나리오</label>
            <select v-model="scenario"><option v-for="[k, l] in SCENARIOS" :key="k" :value="k">{{ l }} ({{ k }})</option></select>
        </ConfirmModal>
        <ConfirmModal v-if="modal?.kind === 'end'" title="시즌 강제 종료" :message="`#${s.id} ${s.name} (${s.scenario_code})\n국가 ${data.countries.length}개 · 영토 ${data.territories.length}개 · 공성 중 ${data.territories.filter((t) => t.state === 'siege').length}곳\n순위·MVP·시즌 결과는 정상 종료와 같게 정산되고, 새 시즌은 다음 틱이 자동 생성합니다.`"
            :confirm-text="`END_SEASON_${s.id}`" need-reason danger ok-label="강제 종료" :busy="mBusy" :error="mErr" @cancel="modal = null" @ok="run" />
        <ConfirmModal v-if="modal?.kind === 'occ'" :title="`점령도 보정 · ${modal.t.code}`" :message="`현재 ${modal.t.occupation} (공성국 ${modal.t.siege_country ?? '-'}). 0이면 공성 종료, 100 이상(소유권 이전)은 불가.`"
            need-reason :busy="mBusy || !occValid" :error="mErr || (occValid ? '' : '0~99 정수만 입력할 수 있습니다.')" ok-label="보정" @cancel="modal = null" @ok="run">
            <label class="f">새 점령도 (0~99)</label>
            <input v-model.number="occ" type="number" min="0" max="99" style="width: 120px" />
        </ConfirmModal>
    </div>
</template>
