# 디코더 지연 보정 이음새 점검: 파일은 [y끝 P]+[y]+[y처음 P] 라 z[i] ~ z[i+L]. 디코드본의 실제 시작 오프셋 s(±64샘플)를 프리롤 상관으로 찾고
# 마커 구간 [P+s, P+s+L) 을 반복했을 때 이음새 고역(>6kHz) 버스트를 같은 파일 내부 400 지점 분포와 비교. rate=디코드 샘플레이트(native 권장)
# 실행: python -I seam_native.py pad.json rate file...
import sys, json, subprocess, numpy as np
meta = json.load(open(sys.argv[1])); SR0 = 48000; R = int(sys.argv[2])
P = round(meta["P"] * R / SR0); L = meta["L"] * R / SR0
for f in sys.argv[3:]:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-f", "f32le", "-ar", str(R), "-"], capture_output=True).stdout
    ch = int(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=channels", "-of", "csv=p=0", f], capture_output=True, text=True).stdout.split()[0])
    z = np.frombuffer(raw, dtype=np.float32).reshape(-1, ch).mean(1); Li = int(round(L))
    best = max(range(-64, 65), key=lambda s: -float(np.mean((z[P + s - P // 2:P + s + P // 2] - z[P + s + Li - P // 2:P + s + Li + P // 2]) ** 2)))
    a = P + best; y = z[a:a + Li]; w = np.concatenate([y[-R:], y[:R]])
    n = int(0.01 * R); fr = np.fft.rfftfreq(n, 1 / R)
    def hf(m, s): return [float(np.sum(np.abs(np.fft.rfft(m[i:i + n] * np.hanning(n)))[fr > 6000] ** 2)) for i in range(s - 5 * n, s + 5 * n - n + 1, n // 2)]
    def burst(m, s):
        h = hf(m, s); c = (len(h) - 1) // 2; oth = [v for j, v in enumerate(h) if abs(j - c) > 1]
        return 10 * np.log10(max(h[c - 1:c + 2]) / (np.median(oth) + 1e-15))
    sb = burst(w, R); rng = np.random.default_rng(3); d = np.array([burst(y, int(p)) for p in rng.integers(R, Li - R, 400)])
    jump = float(abs(w[R] - w[R - 1])); inner = np.percentile(np.abs(np.diff(y)), 99)
    resid = float(np.sqrt(np.mean((z[a - P // 2:a + P // 2] - z[a + Li - P // 2:a + Li + P // 2]) ** 2)) / (np.sqrt(np.mean(z[a:a + P] ** 2)) + 1e-12))
    print(json.dumps({"file": f.split("/")[-1], "rate": R, "decodeOffsetSamples": best, "periodicResidualRel": round(resid, 4), "seamHfBurstDb": round(float(sb), 1),
                      "innerPercentile": round(float((d < sb).mean() * 100), 1), "innerP95": round(float(np.percentile(d, 95)), 1), "sampleJumpVsInnerP99": round(float(jump / inner), 2)}))
