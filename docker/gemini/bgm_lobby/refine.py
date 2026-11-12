# 루프 후보 정밀화: 템포 정밀 추정 + 후보(a,b)의 lag 를 10ms -> 샘플 단위로 맞추고 이음새 상관도 계산.
# 실행: python -I /scripts/refine.py /work/src.f32 a1:b1 a2:b2 ...
import sys, json
import numpy as np

SR = 48000
x = np.fromfile(sys.argv[1], dtype=np.float32).reshape(-1, 2)
mono = x.mean(axis=1)
N = len(mono)
flux = np.load("/work/flux.npy")
fps = 100.0

# 템포 정밀화: 자기상관 피크 포물선 보간 + 긴 lag(8, 16, 32 박) 정합으로 주기 정밀화
ac = np.correlate(flux, flux, mode="full")[len(flux) - 1:]
def peak_near(l0, r=3):
    l0 = int(round(l0)); seg = ac[l0 - r:l0 + r + 1]; k = int(np.argmax(seg)); l = l0 - r + k
    if 0 < k < len(seg) - 1:
        y0, y1, y2 = seg[k - 1], seg[k], seg[k + 1]; l += 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2)
    return l
base = peak_near(66)
est = []
for m in (1, 4, 8, 16, 32, 64):
    est.append(peak_near(base * m, 4) / m)
beat = float(np.median(est[2:])) / fps
tempo = {"beat_period_s": round(beat, 5), "bpm": round(60 / beat, 3), "per_multiple": [round(60 * fps / e, 3) for e in est]}

def logspec(seg, n_fft=2048, hop=480):
    fr = 1 + (len(seg) - n_fft) // hop
    idx = np.arange(n_fft)[None, :] + hop * np.arange(fr)[:, None]
    S = np.abs(np.fft.rfft(seg[idx] * np.hanning(n_fft), axis=1))
    f = np.fft.rfftfreq(n_fft, 1 / SR); e = np.geomspace(40, 16000, 49)
    Bd = np.stack([S[:, (f >= e[i]) & (f < e[i + 1])].sum(axis=1) for i in range(48)], axis=1)
    return np.log1p(Bd * 10)

out = {"tempo": tempo, "cands": []}
for arg in sys.argv[2:]:
    a, b = map(float, arg.split(":"))
    W = 4.0
    A = logspec(mono[int((a - W) * SR):int((a + W) * SR)])
    # lag 정밀(10ms): b 주변 ±0.5초
    best = None
    for d in range(-50, 51):
        bb = b + d / 100
        Bs = logspec(mono[int((bb - W) * SR):int((bb + W) * SR)])
        n = min(len(A), len(Bs))
        sim = float(np.mean(np.sum(A[:n] * Bs[:n], 1) / (np.linalg.norm(A[:n], axis=1) * np.linalg.norm(Bs[:n], axis=1) + 1e-9)))
        dist = float(np.mean(np.abs(A[:n] - Bs[:n])))
        if best is None or dist < best[1]:
            best = (bb, dist, sim)
    bb = best[0]
    # 샘플 단위: 이음새 전후 0.5초 파형 상관, ±12ms
    ia, ib = int(round(a * SR)), int(round(bb * SR))
    w = SR // 2
    ref = x[ia - w:ia + w]
    bestc = None
    for d in range(-576, 577):
        seg = x[ib + d - w:ib + d + w]
        c = float(np.sum(ref * seg) / (np.sqrt(np.sum(ref ** 2) * np.sum(seg ** 2)) + 1e-12))
        if bestc is None or c > bestc[1]:
            bestc = (d, c)
    ib += bestc[0]
    L = (ib - ia) / SR
    out["cands"].append({"a_in": a, "b_in": b, "a_samp": ia, "b_samp": ib, "a_s": ia / SR, "b_s": ib / SR,
                         "len_s": round(L, 5), "len_beats": round(L / beat, 3), "len_bars4": round(L / beat / 4, 3),
                         "spec_dist": round(best[1], 4), "spec_cos": round(best[2], 4), "wave_corr_1s": round(bestc[1], 4)})
json.dump(out, open("/work/refine.json", "w"), indent=1)
print(json.dumps(out, indent=1))
