<script setup>
// 유저 진행도 초기화 모달(POST /api/admin/users/{id}/reset-progress, docs/ADMIN_API_SPEC.md '유저 진행도 초기화').
// 대상 이름 정확 일치 + 사유 2~200자일 때만 실행. 실행 중 중복 클릭 방지. 성공 시 결과 요약을 같은 모달에 표시하고 emit('done')
import { computed, ref } from 'vue';
import { adminApi } from '../adminApi.js';

const props = defineProps({ user: { type: Object, required: true } });
const emit = defineEmits(['close', 'done']);

const typed = ref('');
const reason = ref('');
const busy = ref(false);
const error = ref('');
const result = ref(null);

const reasonLen = computed(() => reason.value.trim().length);
const nameOk = computed(() => typed.value === String(props.user.name ?? ''));
const reasonOk = computed(() => reasonLen.value >= 2 && reasonLen.value <= 200);
const can = computed(() => !busy.value && !result.value && nameOk.value && reasonOk.value);

// 오류 문구: 서버 message 우선, 없으면 코드별 한국어
const CODE_TEXT = {
    confirm_mismatch: '확인용 이름이 대상 유저 이름과 일치하지 않습니다.',
    cannot_reset_self: '본인 계정은 초기화할 수 없습니다.',
    cannot_reset_admin: '관리자 계정은 초기화할 수 없습니다.',
    user_in_active_room: '대상 유저가 진행 중인 방에 있습니다. 방이 끝난 뒤 다시 시도하세요.',
    not_found: '유저를 찾을 수 없습니다. 목록을 새로고침하세요.',
    forbidden: '관리자 권한이 필요합니다.',
};
function resetErr(e) {
    if (!e) return '';
    const base = e.message || CODE_TEXT[e.code] || (e.status === 403 ? CODE_TEXT.forbidden : e.status === 404 ? CODE_TEXT.not_found : '요청을 처리하지 못했습니다.');
    const f = e.fields ? Object.values(e.fields).flat().filter(Boolean).join(' / ') : '';
    return `${base}${f && f !== base ? ` — ${f}` : ''}${e.code ? ` [${e.code}${e.status ? ` ${e.status}` : ''}]` : e.status ? ` [${e.status}]` : ''}`;
}

const EXTRA = ['battles_abandoned', 'wallet_balance_zeroed'];
const tableRows = computed(() => Object.entries(result.value?.counts ?? {}).filter(([k]) => !EXTRA.includes(k)).sort((a, b) => Number(b[1]) - Number(a[1])));
const totalDeleted = computed(() => tableRows.value.reduce((s, [, n]) => s + (Number(n) || 0), 0));
const num = (n) => (Number(n) || 0).toLocaleString('ko-KR');

async function run() {
    if (!can.value) return;
    busy.value = true; error.value = '';
    try {
        result.value = await adminApi.resetProgress(props.user.id, typed.value, reason.value.trim());
        emit('done', result.value);
    } catch (e) { error.value = resetErr(e); } finally { busy.value = false; }
}
function close() { if (!busy.value) emit('close'); }
</script>

<template>
    <div class="adm-modal-bg" @click.self="close">
        <div class="adm-modal" role="dialog" aria-modal="true">
            <h2>진행도 초기화</h2>
            <p class="mono">{{ user.name }} (#{{ user.id }}{{ user.email ? `, ${user.email}` : '' }}){{ user.is_guest ? ' · 게스트' : '' }}</p>

            <template v-if="!result">
                <div class="err">
                    <b>되돌릴 수 없습니다.</b> 계정(이름·이메일·권한·정지 상태)은 유지되고, 영웅·편성·장비·스테이지 진행·소탕·퀘스트·인벤토리·뽑기 기록·시즌 소속·랭크 등 진행 데이터가 삭제됩니다.
                    재화(골드·펜) 잔액은 0으로 상쇄된 뒤 시작 상태(시작 골드·펜, 시작 영웅)가 다시 지급되고, 레벨은 1로 돌아갑니다. 진행 중 전투는 포기 처리됩니다.
                    <br /><b>운영 환경에서는 실행 전 DB 백업이 필수입니다</b> (docs/BACKUP_PROCEDURE.md).
                </div>
                <label class="f">사유 (2~200자, 감사 로그에 남습니다) · <span :style="{ color: reasonLen > 200 ? 'var(--danger)' : '' }">{{ reasonLen }}/200</span></label>
                <input v-model="reason" style="width: 100%; box-sizing: border-box" maxlength="200" :disabled="busy" />
                <label class="f">확인을 위해 대상 이름 <b class="mono">{{ user.name }}</b> 을(를) 그대로 입력하세요</label>
                <input v-model="typed" class="mono" style="width: 100%; box-sizing: border-box" autocomplete="off" :disabled="busy" />
                <div v-if="typed && !nameOk" class="muted" style="font-size: 12px; margin-top: 4px">이름이 일치하지 않습니다(대소문자·공백 포함 정확히 일치).</div>
                <div v-if="error" class="err" style="margin-top: 10px">{{ error }}</div>
                <div class="actions">
                    <button :disabled="busy" @click="close">취소</button>
                    <button class="danger" :disabled="!can" @click="run">{{ busy ? '초기화 중...' : '진행도 초기화' }}</button>
                </div>
            </template>

            <template v-else>
                <div class="okmsg">초기화 완료 · 감사 로그 #{{ result.audit_id }}</div>
                <div v-if="result.warning" class="err">{{ result.warning }}</div>
                <div>삭제된 행 합계 <b>{{ num(totalDeleted) }}</b>건
                    <span class="muted"> · 포기 처리된 전투 {{ num(result.counts?.battles_abandoned) }} · 재화 잔액 0 처리 {{ num(result.counts?.wallet_balance_zeroed) }}</span>
                </div>
                <details style="margin-top: 6px">
                    <summary class="muted" style="cursor: pointer">테이블별 상세 ({{ tableRows.length }})</summary>
                    <table class="mono"><tbody>
                        <tr v-for="[t, n] in tableRows" :key="t"><td>{{ t }}</td><td style="text-align: right">{{ num(n) }}</td></tr>
                    </tbody></table>
                </details>
                <h3 style="margin-top: 12px">지급된 시작 상태</h3>
                <div>레벨 {{ result.granted?.level ?? 1 }} · 골드 {{ num(result.granted?.gold) }} · 펜 {{ num(result.granted?.pen) }}</div>
                <div style="margin-top: 4px">
                    영웅:
                    <span v-if="!(result.granted?.heroes ?? []).length" class="muted">없음</span>
                    <span v-for="h in result.granted?.heroes ?? []" :key="h.hero_id" class="tag on" style="margin: 2px 4px 2px 0">{{ h.name_ko ?? `#${h.hero_id}` }}{{ h.rarity ? ` (${h.rarity})` : '' }}</span>
                </div>
                <details v-if="(result.kept ?? []).length" style="margin-top: 8px">
                    <summary class="muted" style="cursor: pointer">유지된 데이터</summary>
                    <ul class="muted mono" style="margin: 6px 0 0; padding-left: 18px"><li v-for="k in result.kept" :key="k">{{ k }}</li></ul>
                </details>
                <div class="actions"><button class="primary" @click="close">닫기</button></div>
            </template>
        </div>
    </div>
</template>
