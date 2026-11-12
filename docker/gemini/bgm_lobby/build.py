# 루프 파일 생성 + 이음새 수치 검증.
# 파일 = src[a:b], 끝 xf 초를 src[b-xf:b](페이드아웃) + src[a-xf:a](페이드인) 등전력 크로스페이드 -> 파일 끝이 src[a] 직전으로 이어져 처음으로 자연 연결.
# 실행: python -I /scripts/build.py /work/src.f32 name a_samp b_samp xf_s beat_s
#       python -I /scripts/build.py --check file.f32 name beat_s   (인코딩 후 디코드본 이음새 재검증)
import sys, json
import numpy as np

SR = 48000

def load(p):
    return np.fromfile(p, dtype=np.float32).reshape(-1, 2)

def rms_db(s):
    return float(20 * np.log10(np.sqrt(np.mean(s.astype(np.float64) ** 2)) + 1e-12))

def onset(seg, hop=480, n_fft=2048):
    m = seg.mean(axis=1)
    fr = 1 + (len(m) - n_fft) // hop
    idx = np.arange(n_fft)[None, :] + hop * np.arange(fr)[:, None]
    S = np.log1p(100 * np.abs(np.fft.rfft(m[idx] * np.hanning(n_fft), axis=1)))
    f = np.maximum(0, np.diff(S, axis=0)).sum(axis=1)
    return f - f.mean()

def beat_phase(f, beat, fps=100.0):
    t = np.arange(len(f)) / fps
    return float(np.angle(np.sum(f * np.exp(-2j * np.pi * t / beat))))

def seam_metrics(y, beat, src_stats):
    # y 를 반복 재생했을 때 끝 -> 처음 이음새
    wrap = np.concatenate([y[-6 * SR:], y[:6 * SR]])
    s = 6 * SR
    n = SR // 20  # 50ms
    m = {}
    m["rms50_before_db"] = round(rms_db(wrap[s - n:s]), 2)
    m["rms50_after_db"] = round(rms_db(wrap[s:s + n]), 2)
    m["rms50_delta_db"] = round(m["rms50_after_db"] - m["rms50_before_db"], 2)
    m["rms1s_delta_db"] = round(rms_db(wrap[s:s + SR]) - rms_db(wrap[s - SR:s]), 2)
    jump = np.abs(wrap[s] - wrap[s - 1])
    m["sample_jump"] = [round(float(v), 5) for v in jump]
    m["sample_jump_vs_src_p99"] = round(float(jump.max() / src_stats["diff_p99"]), 3)
    # 위상 연속성: 이음새 직전 5ms 로 선형 예측한 기울기 vs 직후 기울기(샘플 차분 부호·크기)
    d_before = wrap[s - 1] - wrap[s - 2]; d_at = wrap[s] - wrap[s - 1]; d_after = wrap[s + 1] - wrap[s]
    m["slope_before_at_after_L"] = [round(float(d_before[0]), 5), round(float(d_at[0]), 5), round(float(d_after[0]), 5)]
    # 스펙트럼 점프: 이음새 전/후 2048 창 로그스펙 거리 vs 원본 분포 백분위
    w = 2048
    A = np.log1p(100 * np.abs(np.fft.rfft(wrap[s - w:s].mean(1) * np.hanning(w))))
    B = np.log1p(100 * np.abs(np.fft.rfft(wrap[s:s + w].mean(1) * np.hanning(w))))
    dist = float(np.mean(np.abs(A - B)))
    m["spec_jump"] = round(dist, 4)
    m["spec_jump_src_percentile"] = round(float(np.mean(src_stats["spec_d"] < dist) * 100), 1)
    # 리듬 위상: 이음새 앞 6초 vs 뒤 6초 박 위상 차(ms)
    f = onset(wrap)
    h = len(f) // 2
    dp = beat_phase(f[h:], beat) - beat_phase(f[:h], beat) - 2 * np.pi * (h / 100.0) / beat
    dp = (dp + np.pi) % (2 * np.pi) - np.pi
    m["beat_phase_shift_ms"] = round(float(dp / (2 * np.pi) * beat * 1000), 1)
    m["beat_phase_shift_src_p90_ms"] = src_stats["phase_p90_ms"]
    return m

def src_stats(x, beat):
    st = {}
    d = np.abs(np.diff(x, axis=0)).max(axis=1)
    st["diff_p99"] = float(np.percentile(d, 99))
    w = 2048
    rng = np.random.default_rng(1)
    pos = rng.integers(10 * SR, len(x) - 10 * SR, 400)
    sd = []
    for p in pos:
        A = np.log1p(100 * np.abs(np.fft.rfft(x[p - w:p].mean(1) * np.hanning(w))))
        B = np.log1p(100 * np.abs(np.fft.rfft(x[p:p + w].mean(1) * np.hanning(w))))
        sd.append(np.mean(np.abs(A - B)))
    st["spec_d"] = np.array(sd)
    ph = []
    for p in pos[:60]:
        f = onset(x[p - 6 * SR:p + 6 * SR]); h = len(f) // 2
        dp = beat_phase(f[h:], beat) - beat_phase(f[:h], beat) - 2 * np.pi * (h / 100.0) / beat
        dp = (dp + np.pi) % (2 * np.pi) - np.pi
        ph.append(abs(dp / (2 * np.pi) * beat * 1000))
    st["phase_p90_ms"] = round(float(np.percentile(ph, 90)), 1)
    st["phase_median_ms"] = round(float(np.median(ph)), 1)
    return st

if sys.argv[1] == "--check":
    y = load(sys.argv[2]); beat = float(sys.argv[4])
    ref = load("/work/src.f32")
    st = src_stats(ref, beat)
    print(json.dumps({"name": sys.argv[3], "samples": len(y), "seconds": len(y) / SR, "seam": seam_metrics(y, beat, st)}))
    sys.exit()

x = load(sys.argv[1]); name = sys.argv[2]
a, b = int(sys.argv[3]), int(sys.argv[4]); xf = float(sys.argv[5]); beat = float(sys.argv[6])
n = int(round(xf * SR))
y = x[a:b].copy()
t = (np.arange(n) + 0.5) / n
fo = np.cos(t * np.pi / 2)[:, None]; fi = np.sin(t * np.pi / 2)[:, None]
y[-n:] = x[b - n:b] * fo + x[a - n:a] * fi
# 크로스페이드 구간 안의 RMS 굴곡(100ms): 실제 vs 두 원본 RMS 의 등전력 기대치
k = SR // 10
cur = []
for i in range(0, n - k + 1, k):
    out_r = rms_db(y[len(y) - n + i:len(y) - n + i + k])
    exp_r = 10 * np.log10(np.mean((x[b - n + i:b - n + i + k] * fo[i:i + k]) ** 2) + np.mean((x[a - n + i:a - n + i + k] * fi[i:i + k]) ** 2) + 1e-12)
    cur.append(round(out_r - float(exp_r), 2))
segA = x[a - n:a].ravel(); segB = x[b - n:b].ravel()
corr = float(np.dot(segA, segB) / np.sqrt(np.dot(segA, segA) * np.dot(segB, segB)))
y.astype(np.float32).tofile(f"/work/{name}.f32")
st = src_stats(x, beat)
res = {"name": name, "a_samp": a, "b_samp": b, "loop_start_src_s": a / SR, "loop_end_src_s": b / SR,
       "samples": len(y), "seconds": len(y) / SR, "beats": round(len(y) / SR / beat, 3), "xfade_s": xf, "xfade_curve": "equal-power(sin/cos)",
       "xfade_src_corr": round(corr, 3), "xfade_rms_dev_db_max": round(max(abs(v) for v in cur), 2),
       "seam": seam_metrics(y, beat, st), "src_baseline": {"diff_p99": round(st["diff_p99"], 5), "beat_phase_median_ms": st["phase_median_ms"], "beat_phase_p90_ms": st["phase_p90_ms"]}}
print(json.dumps(res))
json.dump(res, open(f"/work/{name}.json", "w"), indent=1)
