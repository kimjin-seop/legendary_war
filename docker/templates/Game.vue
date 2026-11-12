<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF';

const MODEL_FILE = 'prop.glb';

const canvas = ref(null);
const error = ref('');
const loading = ref(true);
let engine = null;
let onResize = null;

onMounted(async () => {
    try {
        engine = new Engine(canvas.value, true);
        const scene = new Scene(engine);
        scene.clearColor = new Color4(0.1, 0.1, 0.15, 1);

        const camera = new ArcRotateCamera('cam', Math.PI / 4, Math.PI / 3, 5, Vector3.Zero(), scene);
        camera.attachControl(canvas.value, true);
        new HemisphericLight('light', new Vector3(0, 1, 0), scene).intensity = 0.7;
        new DirectionalLight('sun', new Vector3(-1, -2, -1), scene).intensity = 0.8;

        const result = await SceneLoader.ImportMeshAsync('', '/models/', MODEL_FILE, scene);

        // bounding box 기반 카메라 framing
        const { min, max } = result.meshes
            .filter((m) => m.getTotalVertices() > 0)
            .reduce(
                (acc, m) => {
                    const b = m.getBoundingInfo().boundingBox;
                    return {
                        min: Vector3.Minimize(acc.min, b.minimumWorld),
                        max: Vector3.Maximize(acc.max, b.maximumWorld),
                    };
                },
                { min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity) },
            );
        const center = min.add(max).scale(0.5);
        const radius = max.subtract(min).length() / 2 || 1;
        camera.setTarget(center);
        camera.radius = radius * 2.5;
        camera.lowerRadiusLimit = radius * 0.5;
        camera.upperRadiusLimit = radius * 6;
        camera.minZ = radius / 100;

        loading.value = false;
        console.log('[Game] GLB loaded');

        engine.runRenderLoop(() => scene.render());
        onResize = () => engine.resize();
        window.addEventListener('resize', onResize);
    } catch (e) {
        console.error('[Game] GLB load failed', e);
        loading.value = false;
        error.value = '모델을 불러오지 못했습니다: ' + (e?.message ?? e);
    }
});

onBeforeUnmount(() => {
    if (onResize) window.removeEventListener('resize', onResize);
    engine?.dispose();
    engine = null;
});
</script>

<template>
    <h1>Game (Babylon.js GLB)</h1>
    <p v-if="loading">로딩 중...</p>
    <p v-if="error" style="color: red">{{ error }}</p>
    <canvas ref="canvas" style="width: 100%; height: 70vh; touch-action: none"></canvas>
</template>
