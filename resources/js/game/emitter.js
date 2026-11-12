// 가벼운 이벤트 이미터 (Phaser 비의존). on()은 해제 함수를 반환한다.
export function createEmitter() {
    const map = new Map();
    return {
        on(name, fn) {
            if (!map.has(name)) map.set(name, new Set());
            map.get(name).add(fn);
            return () => map.get(name)?.delete(fn);
        },
        emit(name, payload) {
            map.get(name)?.forEach((fn) => fn(payload));
        },
    };
}
