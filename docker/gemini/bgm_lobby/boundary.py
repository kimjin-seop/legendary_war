# 코덱 경계 오차: 디코드본 - 정규화 원본(정렬됨)의 10ms 창 SNR(시작/끝/전체 중앙값) + 이음새 10ms 고역(>6kHz) 에너지 대비
import sys, json, subprocess, numpy as np
SR = 48000
ref = np.fromfile(sys.argv[1], dtype=np.float32).reshape(-1, 2)
for f in sys.argv[2:]:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-f", "f32le", "-ar", "48000", "-ac", "2", "-"], capture_output=True).stdout
    y = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2)
    n = min(len(y), len(ref)); e = y[:n] - ref[:n]; w = 480
    def snr(i):
        return float(10 * np.log10(np.sum(ref[i:i + w] ** 2) / (np.sum(e[i:i + w] ** 2) + 1e-12)))
    allv = [snr(i) for i in range(w * 10, n - w * 10, w * 50)]
    wrap = np.concatenate([y[-2400:], y[:2400]]).mean(1)
    sp = lambda s: np.abs(np.fft.rfft(s * np.hanning(len(s))))
    fr = np.fft.rfftfreq(480, 1 / SR)
    hf = [float(np.sum(sp(wrap[i:i + 480])[fr > 6000] ** 2)) for i in range(0, 4800 - 480 + 1, 240)]
    seam_i = (2400 - 240) // 240  # 이음새를 중앙에 둔 창
    others = [v for j, v in enumerate(hf) if abs(j - seam_i) > 1]
    print(json.dumps({"file": f.split("/")[-1], "len": len(y), "ref_len": len(ref), "snr_start_10ms": [round(snr(i), 1) for i in (0, 480, 960)],
                      "snr_end_10ms": [round(snr(n - w * k), 1) for k in (3, 2, 1)], "snr_median": round(float(np.median(allv)), 1),
                      "seam_hf_ratio_db": round(10 * np.log10(hf[seam_i] / (np.median(others) + 1e-12)), 1)}))
