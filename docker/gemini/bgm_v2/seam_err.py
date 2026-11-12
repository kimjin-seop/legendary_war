# 이음새 오차 vs 코덱 잡음: 기준(무손실 패딩 WAV)은 주기적이라 마커 반복이 완전 연속. 디코드본을 같은 위치에서 이어 붙였을 때의 (디코드-기준) 오차가
# 이음새 ±10ms 에서 파일 내부 임의 지점의 코덱 잡음보다 큰지(배수) 측정. 전대역과 >6kHz 대역. 실행: python -I seam_err.py pad.json ref.wav file...
import sys, json, subprocess, numpy as np
SR = 48000; meta = json.load(open(sys.argv[1])); P, L = meta["P"], meta["L"]
def dec(f):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-f", "f32le", "-ar", "48000", "-ac", "2", "-"], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).mean(1).astype(np.float64)
r = dec(sys.argv[2]); n = 960; fr = np.fft.rfftfreq(n, 1 / SR); hw = np.hanning(n)
def e(x, hp): s = np.abs(np.fft.rfft(x * hw)) ** 2; return float(s[fr > 6000].sum() if hp else s.sum())
for f in sys.argv[3:]:
    z = dec(f)[:len(r)]; g = float(np.dot(z, r[:len(z)]) / np.dot(z, z)); z = z * g
    def splice(x): return np.concatenate([x[P + L - SR:P + L], x[P:P + SR]])
    err = splice(z) - splice(r); s0 = SR - n // 2
    rng = np.random.default_rng(5); pos = rng.integers(P + SR, P + L - SR, 400)
    inner = (z - r[:len(z)])
    out = {"file": f.split("/")[-1], "lsGain": round(g, 3)}
    for hp in (False, True):
        es = e(err[s0:s0 + n], hp); ei = np.array([e(inner[p - n // 2:p + n // 2], hp) for p in pos])
        out["hf6k" if hp else "full"] = {"seamErrVsInnerMedianDb": round(10 * np.log10(es / np.median(ei)), 1), "innerPercentile": round(float((ei < es).mean() * 100), 1)}
    print(json.dumps(out))
