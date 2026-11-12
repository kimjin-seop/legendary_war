<script setup>
import { useCounterStore } from '../stores/counter';
const counter = useCounterStore();
</script>

<template>
    <h1>Home (Laravel + Vue 3 + Vite)</h1>
    <button @click="counter.increment()">count: {{ counter.count }}</button>
    <p><RouterLink to="/battle">전투 프로토타입 (/battle)</RouterLink></p>
</template>
