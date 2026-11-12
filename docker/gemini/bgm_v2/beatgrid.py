# 비반복 곡 루프: 길이를 박 단위(k*beat)로 고정하고 a 주변을 훑어 이음새 전후 4초 로그스펙트럼 거리 + 온셋 상관(전후 각 4초) 최적을 찾는다.
# 실행: WORK=... python -I beatgrid.py src.f32 beat_s a_lo a_hi beats1,beats2,...
import sys, numpy as np
SR = 48000
x = np.fromfile(sys.argv[1], dtype=np.float32).reshape(-1, 2).mean(1)
beat = float(sys.argv[2]); alo, ahi = float(sys.argv[3]), float(sys.argv[4]); ks = [int(v) for v in sys.argv[5].split(",")]
hop, nf = 480, 2048
fr = 1 + (len(x) - nf) // hop
idx = np.arange(nf)[None, :] + hop * np.arange(fr)[:, None]
S = np.empty((fr, nf // 2 + 1), np.float32)
for i in range(0, fr, 3000): S[i:i+3000] = np.abs(np.fft.rfft(x[idx[i:i+3000]] * np.hanning(nf), axis=1))
f = np.fft.rfftfreq(nf, 1 / SR); e = np.geomspace(40, 16000, 49)
Bd = np.log1p(10 * np.stack([S[:, (f >= e[i]) & (f < e[i+1])].sum(1) for i in range(48)], 1))
L = np.log1p(100 * S); fl = np.maximum(0, np.diff(L, axis=0)).sum(1); fl = np.maximum(fl - np.convolve(fl, np.ones(50)/50, "same"), 0); fl = np.append(fl, 0)
W = 400  # 4s at 10ms
res = []
for k in ks:
    lag = k * beat * 100
    for a in range(int(alo*100), int(ahi*100)):
        b = int(round(a + lag))
        if b + W > fr: continue
        A, B = Bd[a-W:a+W], Bd[b-W:b+W]
        dist = float(np.mean(np.abs(A - B)))
        # 이음새를 넘는 실제 재생 순서 = [b-W, b) 다음 [a, a+W): 그 연속의 리듬이 원본 [a-W,a+W) 리듬과 같은지
        oa = fl[a-W:a+W]; ob = np.concatenate([fl[b-W:b], fl[a:a+W]])
        oc = float(np.dot(oa, ob) / (np.linalg.norm(oa) * np.linalg.norm(ob) + 1e-9))
        res.append((dist - 0.5 * oc, dist, oc, k, a / 100, b / 100))
res.sort(); out = []
for r in res:
    if all(abs(r[4] - p[4]) > 1.5 or r[3] != p[3] for p in out): out.append(r)
    if len(out) >= 12: break
for r in out: print(f"score={r[0]:.4f} dist={r[1]:.4f} onset={r[2]:.3f} beats={r[3]} bars={r[3]/4} a={r[4]} b={r[5]} len={r[5]-r[4]:.3f}")
