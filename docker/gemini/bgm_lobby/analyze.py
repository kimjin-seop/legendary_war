# 로비 BGM 분석: 에너지 곡선, 템포 추정, 자기유사도 기반 루프 후보 탐색.
# 실행: python -I /scripts/analyze.py /work/src.f32  (48kHz stereo float32 raw)
import sys, json
import numpy as np

SR = 48000
x = np.fromfile(sys.argv[1], dtype=np.float32).reshape(-1, 2)
mono = x.mean(axis=1)
N = len(mono)
dur = N / SR
out = {"samples": N, "duration": dur}

def db(v):
    return 20 * np.log10(np.maximum(v, 1e-9))

# 1) 에너지 곡선(1초 RMS)
sec = SR
nb = N // sec
rms1 = np.sqrt((mono[: nb * sec].reshape(nb, sec) ** 2).mean(axis=1))
out["rms_1s_db"] = [round(float(v), 1) for v in db(rms1)]
# 처음/끝 0.1초 해상도 5초
h = SR // 10
def rms_slice(a, b):
    seg = mono[a:b]
    k = len(seg) // h
    return [round(float(v), 1) for v in db(np.sqrt((seg[: k * h].reshape(k, h) ** 2).mean(axis=1)))]
out["head_5s_100ms_db"] = rms_slice(0, 5 * SR)
out["tail_5s_100ms_db"] = rms_slice(N - 5 * SR, N)
out["first_sample_abs"] = float(np.abs(x[:10]).max())
out["last_samples_abs"] = float(np.abs(x[-10:]).max())

# 2) STFT
n_fft, hop = 2048, 480  # hop 10ms
win = np.hanning(n_fft).astype(np.float32)
frames = 1 + (N - n_fft) // hop
idx = np.arange(n_fft)[None, :] + hop * np.arange(frames)[:, None]
S = np.empty((frames, n_fft // 2 + 1), dtype=np.float32)
for i in range(0, frames, 2000):
    j = min(frames, i + 2000)
    S[i:j] = np.abs(np.fft.rfft(mono[idx[i:j]] * win, axis=1))
freqs = np.fft.rfftfreq(n_fft, 1 / SR)
fps = SR / hop

# 온셋 강도(스펙트럴 플럭스, log 압축)
L = np.log1p(100 * S)
flux = np.maximum(0, np.diff(L, axis=0)).sum(axis=1)
flux = flux - np.convolve(flux, np.ones(50) / 50, mode="same")
flux = np.maximum(flux, 0)
# 템포: 온셋 자기상관(50~200 BPM)
ac = np.correlate(flux, flux, mode="full")[len(flux) - 1:]
lo, hi = int(fps * 60 / 200), int(fps * 60 / 50)
lags = np.arange(lo, hi)
# 로그-가우시안 가중(120BPM 중심 편향 완화를 위해 약하게)
cand = sorted(((float(ac[l]), l) for l in lags), reverse=True)
peaks = []
for v, l in cand:
    if all(abs(l - p) > 3 for _, p in peaks):
        peaks.append((v, l))
    if len(peaks) >= 6:
        break
out["tempo_candidates_bpm"] = [round(60 * fps / l, 2) for _, l in peaks]
out["tempo_ac_strength"] = [round(v / ac[0], 3) for v, _ in peaks]

# 3) 특징: 크로마 12 + 로그 대역에너지 12, 0.1초 프레임
chroma = np.zeros((frames, 12), dtype=np.float32)
valid = (freqs > 55) & (freqs < 5000)
pc = (np.round(12 * np.log2(freqs[valid] / 440.0)) % 12).astype(int)
P = S[:, valid] ** 2
for k in range(12):
    chroma[:, k] = P[:, pc == k].sum(axis=1)
edges = np.geomspace(40, 16000, 13)
bands = np.stack([S[:, (freqs >= edges[i]) & (freqs < edges[i + 1])].sum(axis=1) for i in range(12)], axis=1)
g = 10  # 10프레임 = 0.1초
fr = frames // g
def pool(a):
    return a[: fr * g].reshape(fr, g, -1).mean(axis=1)
C = pool(chroma); C = np.log1p(C / (C.mean() + 1e-9)); C -= C.mean(axis=1, keepdims=True)
B = np.log1p(pool(bands)); B -= B.mean(axis=0, keepdims=True)
F = np.concatenate([C / (np.linalg.norm(C, axis=1, keepdims=True) + 1e-9), 0.7 * B / (np.linalg.norm(B, axis=1, keepdims=True) + 1e-9)], axis=1)
F /= np.linalg.norm(F, axis=1, keepdims=True) + 1e-9

# 루프 후보: lag(초) 마다 frame 유사도 -> 8초 창 평균(이음새 전 4초 + 후 4초)
W = 80
res = []
for lag in range(300, fr - 100):  # 30초 이상
    s = (F[:-lag] * F[lag:]).sum(axis=1)
    sm = np.convolve(s, np.ones(W) / W, mode="valid")  # sm[t] = mean s[t..t+W)
    # 이음새 a = t + W/2 (창 중앙), b = a + lag
    for t in np.argsort(-sm)[:3]:
        a = (t + W // 2) / 10.0
        res.append((float(sm[t]), a, a + lag / 10.0, lag / 10.0))
res.sort(reverse=True)
def pick(lo_s, hi_s, n=6):
    picked = []
    for r in res:
        if lo_s <= r[3] <= hi_s and r[1] >= 2 and r[2] <= dur - 2:
            if all(abs(r[1] - p[1]) > 3 or abs(r[3] - p[3]) > 1 for p in picked):
                picked.append(r)
        if len(picked) >= n:
            break
    return [{"score": round(s, 4), "a": a, "b": b, "len": l} for s, a, b, l in picked]
out["loop_long"] = pick(60, 150)
out["loop_short"] = pick(38, 62)
# 이웃 lag 대비 대비도: 같은 a 에서 lag 별 곡선(최상위 후보에 대해)
np.save("/work/F.npy", F)
np.save("/work/flux.npy", flux)
json.dump(out, open("/work/analysis.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps({k: v for k, v in out.items()}, ensure_ascii=False))
