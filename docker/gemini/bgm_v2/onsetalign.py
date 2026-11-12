# 이음새 앞 8초 리듬 정렬: src[b-8:b] 와 src[a-8:a] 온셋 엔벨로프 상호상관 피크 오프셋(ms, 1ms 해상도)
import os
WORK = os.environ.get("WORK", "/work")
import sys, json, numpy as np
SR = 48000
x = np.fromfile(WORK + "/src.f32", dtype=np.float32).reshape(-1, 2).mean(1)
def onset(m, hop=48, n_fft=1024):
    fr = 1 + (len(m) - n_fft) // hop
    idx = np.arange(n_fft)[None, :] + hop * np.arange(fr)[:, None]
    S = np.log1p(100 * np.abs(np.fft.rfft(m[idx] * np.hanning(n_fft), axis=1)))
    f = np.maximum(0, np.diff(S, axis=0)).sum(1); f = f - np.convolve(f, np.ones(200) / 200, "same")
    return np.maximum(f, 0)
for arg in sys.argv[1:]:
    a, b = map(int, arg.split(":"))
    W = 8 * SR
    fa = onset(x[a - W:a + 2 * SR]); fb = onset(x[b - W:b + 2 * SR])
    r = 150  # ±150ms
    cs = [float(np.dot(fa[r:-r], fb[r + d:len(fb) - r + d])) for d in range(-r, r + 1)]
    cs = np.array(cs) / (np.linalg.norm(fa[r:-r]) * np.linalg.norm(fb[r:-r]) + 1e-9)
    k = int(np.argmax(cs)) - r
    print(json.dumps({"a": a, "b": b, "onset_offset_ms": k, "onset_corr_peak": round(float(cs.max()), 3), "onset_corr_at0": round(float(cs[r]), 3), "b_adj": b + k * 48}))
