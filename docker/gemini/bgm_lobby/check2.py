# 패딩 파일 디코드본에서 마커 구간 [P, P+L) 을 잘라 반복 이음새 검증 + 코덱 경계 고역 버스트 비교(패딩 없이 파일 전체를 루프할 때)
import sys, json, subprocess, numpy as np
SR = 48000
meta = json.load(open(sys.argv[1])); P, L = meta["P"], meta["L"]; gain = float(sys.argv[2])
p99 = 0.03515 * 10 ** (gain / 20)
def dec(f):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-f", "f32le", "-ar", "48000", "-ac", "2", "-"], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2)
def rdb(s): return float(20 * np.log10(np.sqrt(np.mean(s.astype(np.float64) ** 2)) + 1e-12))
fr = np.fft.rfftfreq(480, 1 / SR)
def seam(y):
    w = np.concatenate([y[-SR:], y[:SR]]); s = SR
    m = w.mean(1); sp = lambda q: np.abs(np.fft.rfft(q * np.hanning(len(q))))
    hf = [float(np.sum(sp(m[i:i + 480])[fr > 6000] ** 2)) for i in range(s - 2400, s + 2400 - 480 + 1, 240)]
    si = (2400 - 240) // 240; oth = [v for j, v in enumerate(hf) if abs(j - si) > 1]
    A = np.log1p(100 * np.abs(np.fft.rfft(m[s - 2048:s] * np.hanning(2048)))); B = np.log1p(100 * np.abs(np.fft.rfft(m[s:s + 2048] * np.hanning(2048))))
    return {"rms50_delta_db": round(rdb(w[s:s + 2400]) - rdb(w[s - 2400:s]), 2), "rms1s_delta_db": round(rdb(w[s:]) - rdb(w[:s]), 2),
            "sample_jump_vs_p99": round(float(np.abs(w[s] - w[s - 1]).max() / p99), 3), "spec_jump": round(float(np.mean(np.abs(A - B))), 4),
            "seam_hf_burst_db": round(10 * np.log10(hf[si] / (np.median(oth) + 1e-12)), 1)}
for f in sys.argv[3:]:
    z = dec(f)
    print(json.dumps({"file": f.split("/")[-1], "decoded_samples48k": len(z), "expected": L + 2 * P,
                      "marker_loop": seam(z[P:P + L]), "whole_file_loop_no_marker": seam(z)}))
