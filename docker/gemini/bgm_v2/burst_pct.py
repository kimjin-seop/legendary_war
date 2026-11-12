# 이음새 고역 버스트(>6kHz, 10ms) 값이 같은 디코드 파일 내부 임의 지점 400곳 분포에서 몇 백분위인지 + 이음새 창의 고역/전대역 비(dB)
import os
WORK = os.environ.get("WORK", "/work")
import sys, json, subprocess, numpy as np
SR = 48000
meta = json.load(open(sys.argv[1])); P, L = meta["P"], meta["L"]
fr = np.fft.rfftfreq(480, 1 / SR)
def burst(m, s):
    sp = lambda q: np.abs(np.fft.rfft(q * np.hanning(480))) ** 2
    hf = []; tot = None
    for k, i in enumerate(range(s - 2400, s + 2400 - 480 + 1, 240)):
        p = sp(m[i:i + 480]); hf.append(float(p[fr > 6000].sum()))
        if k == 9: tot = float(p.sum())
    oth = [v for j, v in enumerate(hf) if abs(j - 9) > 1]
    return 10 * np.log10(hf[9] / (np.median(oth) + 1e-15)), 10 * np.log10(hf[9] / (tot + 1e-15))
for f in sys.argv[2:]:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-f", "f32le", "-ar", "48000", "-ac", "2", "-"], capture_output=True).stdout
    z = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).mean(1)
    y = z[P:P + L]; w = np.concatenate([y[-SR:], y[:SR]])
    sb, sr = burst(w, SR)
    rng = np.random.default_rng(3); pos = rng.integers(SR, L - SR, 400)
    d = np.array([burst(y, int(p))[0] for p in pos])
    print(json.dumps({"file": f.split("/")[-1], "seam_hf_burst_db": round(float(sb), 1), "inner_percentile": round(float((d < sb).mean() * 100), 1),
                      "inner_p50": round(float(np.median(d)), 1), "inner_p95": round(float(np.percentile(d, 95)), 1), "seam_hf_to_total_db": round(float(sr), 1)}))
