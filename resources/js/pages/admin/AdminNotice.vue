<script setup>
// 공지·점검 관리: 점검 상태(켜기 = 확인 문자열 MAINTENANCE), 공지 목록·작성·수정(노출 기간·고정·사용). 삭제 없음(enabled=false 로 내림)
import { onMounted, reactive, ref } from 'vue';
import { adminApi, errText, fmtTime, short } from '../../admin/adminApi.js';
import Pager from '../../admin/components/Pager.vue';
import ConfirmModal from '../../admin/components/ConfirmModal.vue';

const KIND = { notice: '공지', event: '이벤트', maintenance: '점검' };
const mt = ref(null); const mtErr = ref('');
const mtForm = reactive({ message: '', starts_at: '', ends_at: '' });
const page = ref(null); const err = ref(''); const ok = ref('');
const edit = ref(null); // {id?, kind, title, body, pinned, enabled, starts_at, ends_at}
const modal = ref(null); const mBusy = ref(false); const mErr = ref('');
const toLocal = (s) => { if (!s) return ''; const t = Date.parse(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(s)) ? '' : 'Z')); if (!Number.isFinite(t)) return ''; const d = new Date(t - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
const toIso = (v) => (v ? new Date(v).toISOString() : null);
async function loadMt() { try { mt.value = await adminApi.maintenance(); mtErr.value = ''; mtForm.message = mt.value?.message ?? ''; mtForm.starts_at = toLocal(mt.value?.starts_at); mtForm.ends_at = toLocal(mt.value?.ends_at); } catch (e) { mtErr.value = errText(e); } }
async function load(p = 1) { try { page.value = await adminApi.announcements({ page: p, per_page: 30 }); err.value = ''; } catch (e) { err.value = errText(e); } }
function newOne() { edit.value = { kind: 'notice', title: '', body: '', pinned: false, enabled: true, starts_at: '', ends_at: '' }; ok.value = ''; }
function pick(a) { edit.value = { id: a.id, kind: a.kind, title: a.title ?? '', body: a.body ?? '', pinned: !!a.pinned, enabled: !!a.enabled, starts_at: toLocal(a.starts_at), ends_at: toLocal(a.ends_at) }; ok.value = ''; }
const saveOpen = ref(false); // 공지 저장 사유 입력(서버 reason 필수, 감사 로그)
async function save({ reason } = {}) {
    const e = edit.value; mBusy.value = true; mErr.value = '';
    const body = { kind: e.kind, title: e.title.trim(), body: e.body, pinned: !!e.pinned, enabled: !!e.enabled, starts_at: toIso(e.starts_at), ends_at: toIso(e.ends_at), reason };
    try { if (e.id) await adminApi.updateAnnouncement(e.id, body); else await adminApi.createAnnouncement(body); ok.value = `공지 ${e.id ? `#${e.id} 수정` : '등록'} 완료`; edit.value = null; saveOpen.value = false; load(page.value?.current_page ?? 1); }
    catch (x) { mErr.value = errText(x); } finally { mBusy.value = false; }
}
function askMt(enabled) { modal.value = { enabled }; mErr.value = ''; }
async function runMt({ reason } = {}) {
    mBusy.value = true; mErr.value = '';
    const on = modal.value.enabled;
    try { mt.value = await adminApi.setMaintenance({ enabled: on, message: mtForm.message || null, starts_at: toIso(mtForm.starts_at), ends_at: toIso(mtForm.ends_at), reason, ...(on ? { confirm: 'MAINTENANCE' } : {}) }); ok.value = on ? '점검 설정 완료' : '점검 해제 완료'; modal.value = null; }
    catch (e) { mErr.value = errText(e); } finally { mBusy.value = false; }
}
onMounted(() => { loadMt(); load(); });
</script>

<template>
    <div>
        <h1>공지·점검</h1>
        <div v-if="ok" class="okmsg">{{ ok }} · <RouterLink to="/admin/audit">감사 로그 보기</RouterLink></div>
        <div class="adm-card">
            <h3>서버 점검</h3>
            <div v-if="mtErr" class="err">{{ mtErr }}</div>
            <div v-else-if="mt" class="adm-row">
                <span class="tag" :class="mt.active ? 'bad' : mt.enabled ? 'on' : ''">{{ mt.active ? '점검 중' : mt.enabled ? '점검 예정' : '꺼짐' }}</span>
                <span class="muted">{{ fmtTime(mt.starts_at) }} ~ {{ fmtTime(mt.ends_at) }}</span>
            </div>
            <label class="f">안내 문구(200자)</label>
            <input v-model="mtForm.message" maxlength="200" style="width: 100%; box-sizing: border-box" />
            <div class="adm-row" style="margin-top: 8px">
                <label class="muted">시작 <input v-model="mtForm.starts_at" type="datetime-local" /></label>
                <label class="muted">종료 <input v-model="mtForm.ends_at" type="datetime-local" /></label>
                <span class="grow" />
                <button class="danger" @click="askMt(true)">점검 켜기/갱신</button>
                <button :disabled="!mt?.enabled" @click="askMt(false)">점검 해제</button>
            </div>
            <p class="muted" style="margin: 6px 0 0">점검이 진행 중이면 관리자 외 사용자의 게임 API 가 503(maintenance)으로 막힙니다.</p>
        </div>
        <div class="adm-row"><h2 class="grow" style="margin: 0">공지</h2><button class="primary" @click="newOne">새 공지</button></div>
        <div v-if="err" class="err">{{ err }}</div>
        <div class="adm-grid" style="grid-template-columns: minmax(280px, 1.2fr) minmax(280px, 1fr)">
            <div class="adm-card adm-table-wrap">
                <table><tbody>
                    <tr><th>ID</th><th>종류</th><th>제목</th><th>노출</th><th>기간</th></tr>
                    <tr v-for="a in page?.data ?? []" :key="a.id" :class="{ sel: edit?.id === a.id }" style="cursor: pointer" @click="pick(a)">
                        <td>{{ a.id }}</td><td>{{ KIND[a.kind] ?? a.kind }}</td><td>{{ a.pinned ? '[고정] ' : '' }}{{ short(a.title, 40) }}</td>
                        <td><span class="tag" :class="a.enabled ? 'on' : ''">{{ a.enabled ? '사용' : '숨김' }}</span></td><td class="muted">{{ fmtTime(a.starts_at) }} ~ {{ fmtTime(a.ends_at) }}</td>
                    </tr>
                    <tr v-if="page && !(page.data ?? []).length"><td colspan="5" class="muted">공지 없음</td></tr>
                </tbody></table>
                <Pager :page="page" @go="load" />
            </div>
            <div class="adm-card">
                <div v-if="!edit" class="muted">공지를 선택하거나 [새 공지]를 누르세요.</div>
                <template v-else>
                    <h3>{{ edit.id ? `공지 #${edit.id} 수정` : '새 공지' }}</h3>
                    <label class="f">종류</label>
                    <select v-model="edit.kind"><option v-for="(l, k) in KIND" :key="k" :value="k">{{ l }}</option></select>
                    <label class="f">제목(100자)</label>
                    <input v-model="edit.title" maxlength="100" style="width: 100%; box-sizing: border-box" />
                    <label class="f">본문(4000자)</label>
                    <textarea v-model="edit.body" maxlength="4000" style="min-height: 140px; font-family: inherit; font-size: 14px" />
                    <div class="adm-row" style="margin-top: 8px">
                        <label><input v-model="edit.pinned" type="checkbox" /> 고정</label>
                        <label><input v-model="edit.enabled" type="checkbox" /> 사용</label>
                    </div>
                    <div class="adm-row">
                        <label class="muted">시작 <input v-model="edit.starts_at" type="datetime-local" /></label>
                        <label class="muted">종료 <input v-model="edit.ends_at" type="datetime-local" /></label>
                    </div>
                    <div class="adm-row"><span class="grow" /><button @click="edit = null">취소</button><button class="primary" :disabled="mBusy || !edit.title.trim() || !edit.body.trim()" @click="saveOpen = true; mErr = ''">저장...</button></div>
                </template>
            </div>
        </div>
        <ConfirmModal v-if="modal" :title="modal.enabled ? '점검 켜기' : '점검 해제'" :message="modal.enabled ? `점검 기간: ${mtForm.starts_at || '즉시'} ~ ${mtForm.ends_at || '수동 해제'}\n점검이 진행되면 관리자 외 사용자는 게임을 이용할 수 없습니다.` : '점검을 해제합니다.'"
            :confirm-text="modal.enabled ? 'MAINTENANCE' : ''" :danger="modal.enabled" :ok-label="modal.enabled ? '점검 켜기' : '해제'" :busy="mBusy" :error="mErr" need-reason @cancel="modal = null" @ok="runMt" />
        <ConfirmModal v-if="saveOpen && edit" :title="edit.id ? `공지 #${edit.id} 수정` : '공지 등록'" :message="`${edit.title}`" need-reason ok-label="저장" :busy="mBusy" :error="mErr" @cancel="saveOpen = false" @ok="save" />
    </div>
</template>
