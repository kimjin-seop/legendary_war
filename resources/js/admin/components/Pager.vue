<script setup>
// Laravel paginate 응답(current_page, last_page, total) 페이지 이동
defineProps({ page: { type: Object, default: null } });
const emit = defineEmits(['go']);
</script>

<template>
    <div v-if="page && page.last_page > 1" class="adm-pager">
        <button class="sm" :disabled="page.current_page <= 1" @click="emit('go', 1)">처음</button>
        <button class="sm" :disabled="page.current_page <= 1" @click="emit('go', page.current_page - 1)">이전</button>
        <span class="muted">{{ page.current_page }} / {{ page.last_page }} (총 {{ page.total }}건)</span>
        <button class="sm" :disabled="page.current_page >= page.last_page" @click="emit('go', page.current_page + 1)">다음</button>
        <button class="sm" :disabled="page.current_page >= page.last_page" @click="emit('go', page.last_page)">끝</button>
    </div>
    <div v-else-if="page" class="muted" style="margin-top: 8px">총 {{ page.total ?? 0 }}건</div>
</template>
