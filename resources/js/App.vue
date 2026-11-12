<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
const route = useRoute();
const isAdmin = computed(() => route.path.startsWith('/admin')); // 관리자 화면은 자체 사이드 메뉴(상단 개발용 링크 숨김)
</script>

<template>
    <nav v-if="!isAdmin">
        <RouterLink to="/">Home</RouterLink> |
        <RouterLink to="/about">About</RouterLink> |
        <RouterLink to="/game">Game</RouterLink> |
        <RouterLink to="/battle">Battle</RouterLink>
    </nav>
    <RouterView />
</template>
