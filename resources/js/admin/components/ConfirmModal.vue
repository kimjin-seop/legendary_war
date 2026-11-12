<script setup>
// 확인 모달: 위험 동작은 confirmText(정확히 일치) 입력, 사유가 필요하면 reasonMin(기본 5~200자). 확인 시 emit('ok', {reason})
import { computed, ref } from 'vue';

const props = defineProps({
    title: { type: String, required: true },
    message: { type: String, default: '' },
    confirmText: { type: String, default: '' },
    needReason: { type: Boolean, default: false },
    reasonMin: { type: Number, default: 5 },
    okLabel: { type: String, default: '확인' },
    danger: { type: Boolean, default: false },
    busy: { type: Boolean, default: false },
    error: { type: String, default: '' },
});
const emit = defineEmits(['ok', 'cancel']);
const typed = ref('');
const reason = ref('');
const can = computed(() => !props.busy && (!props.confirmText || typed.value === props.confirmText) && (!props.needReason || (reason.value.trim().length >= props.reasonMin && reason.value.trim().length <= 200)));
</script>

<template>
    <div class="adm-modal-bg" @click.self="emit('cancel')">
        <div class="adm-modal" role="dialog" aria-modal="true">
            <h2>{{ title }}</h2>
            <p v-if="message" style="white-space: pre-line">{{ message }}</p>
            <slot />
            <template v-if="needReason">
                <label class="f">사유 ({{ reasonMin }}~200자, 감사 로그에 남습니다)</label>
                <input v-model="reason" style="width: 100%; box-sizing: border-box" maxlength="200" />
            </template>
            <template v-if="confirmText">
                <label class="f">확인을 위해 <b class="mono">{{ confirmText }}</b> 를 그대로 입력하세요</label>
                <input v-model="typed" class="mono" style="width: 100%; box-sizing: border-box" autocomplete="off" />
            </template>
            <div v-if="error" class="err" style="margin-top: 10px">{{ error }}</div>
            <div class="actions">
                <button @click="emit('cancel')">취소</button>
                <button :class="danger ? 'danger' : 'primary'" :disabled="!can" @click="emit('ok', { reason: reason.trim() })">{{ busy ? '처리 중...' : okLabel }}</button>
            </div>
        </div>
    </div>
</template>
