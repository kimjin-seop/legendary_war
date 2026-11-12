# 저비트레이트 인코딩 품질 수치 점검(청취 대체 아님): 기준 = 게인 적용 패딩 WAV, 대상 = 인코딩 파일 디코드(48k stereo)
# - hfCutoffHz: 장기 스펙트럼이 기준 대비 -15dB 이상 떨어지기 시작하는 주파수(고음 깎임)
# - bandLossDb: 대역별 장기 에너지 차(기준 대비)
# - pumpStdDb/pumpMaxDb: 400ms RMS 의 (대상-기준) dB 차 표준편차/최대(펌핑·숨쉬기)
# - lsd: 프레임별 로그스펙트럼 거리(dB) 0-4k/4-8k/8-16k (양자화 잡음·고음 깨짐 지표)
# - stereoCorr: 좌우 상관(모노화 확인)
# 실행: python -I qa.py ref.wav file...
import sys, json, subprocess, numpy as np
SR = 48000
def dec(f):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-f", "f32le", "-ar", "48000", "-ac", "2", "-"], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2)
ref = dec(sys.argv[1])
nf, hop = 2048, 1024
fr = np.fft.rfftfreq(nf, 1 / SR)
def spec(m):
    n = 1 + (len(m) - nf) // hop; idx = np.arange(nf)[None, :] + hop * np.arange(n)[:, None]
    out = np.empty((n, nf // 2 + 1), np.float32)
    for i in range(0, n, 2000): out[i:i+2000] = np.abs(np.fft.rfft(m[idx[i:i+2000]] * np.hanning(nf), axis=1)) ** 2
    return out
Rm = ref.mean(1); RS = spec(Rm)
def align(t):
    # 코덱 지연 보정: 처음 5초 상호상관(±3000 샘플)
    a, b = Rm[SR:6 * SR], t.mean(1)
    best = max(range(-3000, 3001, 1), key=lambda d: float(np.dot(a[::8], b[SR + d:6 * SR + d][::8])) if SR + d >= 0 else -1e9)
    return t[best:] if best >= 0 else np.concatenate([np.zeros((-best, 2), np.float32), t]), best
for f in sys.argv[2:]:
    t, d = align(dec(f)); n = min(len(t), len(ref)); t = t[:n]; r = ref[:n]
    TS = spec(t.mean(1)); m = min(len(TS), len(RS)); A, B = RS[:m], TS[:m]
    lt = 10 * np.log10(B.mean(0) + 1e-12) - 10 * np.log10(A.mean(0) + 1e-12)
    cut = next((float(fr[i]) for i in range(len(fr)) if fr[i] > 2000 and np.all(lt[i:i + 20] < -15)), None)
    bands = {f"{lo//1000}-{hi//1000}k": round(float(10 * np.log10(B[:, (fr >= lo) & (fr < hi)].sum() / (A[:, (fr >= lo) & (fr < hi)].sum() + 1e-12))), 1)
             for lo, hi in [(0, 4000), (4000, 8000), (8000, 12000), (12000, 16000), (16000, 20000)]}
    act = A.sum(1) > 1e-6 * A.sum(1).max()
    def lsd(lo, hi):
        s = (fr >= lo) & (fr < hi)
        x = 10 * np.log10(A[act][:, s] + 1e-10); y = 10 * np.log10(B[act][:, s] + 1e-10)
        return round(float(np.mean(np.sqrt(np.mean((x - y) ** 2, axis=1)))), 2)
    w = int(0.4 * SR); k = n // w
    rr = 10 * np.log10((r[:k * w].mean(1).reshape(k, w) ** 2).mean(1) + 1e-12); tt = 10 * np.log10((t[:k * w].mean(1).reshape(k, w) ** 2).mean(1) + 1e-12)
    g = rr > rr.max() - 40; dd = (tt - rr)[g]
    sc = float(np.corrcoef(t[:, 0], t[:, 1])[0, 1])
    print(json.dumps({"file": f.split("/")[-1], "delay": d, "hfCutoffHz": cut, "bandLossDb": bands, "pumpStdDb": round(float(dd.std()), 2), "pumpMaxDb": round(float(np.abs(dd - np.median(dd)).max()), 2),
                      "lsd_0_4k": lsd(0, 4000), "lsd_4_8k": lsd(4000, 8000), "lsd_8_16k": lsd(8000, 16000), "stereoCorr": round(sc, 3)}, ensure_ascii=False))
