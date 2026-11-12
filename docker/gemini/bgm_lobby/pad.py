# 루프 본체 y(a..b, 끝 크로스페이드) 앞뒤에 코덱 경계용 프리롤/포스트롤을 붙인다: z = y[-P:] + y + y[:Q]
# 재생은 마커(start=P/48000, duration=L/48000, loop) 로 본체만 반복 -> 인코더/리샘플러 경계 잡음이 재생 구간 밖으로 나간다.
# 실행: python -I /scripts/pad.py NAME a_samp b_samp xf_s pad_s
import sys, json, numpy as np
SR = 48000
x = np.fromfile("/work/src.f32", dtype=np.float32).reshape(-1, 2)
name, a, b, xf, pad = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
n = int(round(xf * SR)); P = int(round(pad * SR))
y = x[a:b].copy()
t = (np.arange(n) + 0.5) / n
y[-n:] = x[b - n:b] * np.cos(t * np.pi / 2)[:, None] + x[a - n:a] * np.sin(t * np.pi / 2)[:, None]
y.astype(np.float32).tofile(f"/work/{name}.f32")
np.concatenate([y[-P:], y, y[:P]]).astype(np.float32).tofile(f"/work/{name}_pad.f32")
json.dump({"name": name, "a": a, "b": b, "L": len(y), "P": P, "xf": xf}, open(f"/work/{name}_pad.json", "w"))
print(name, "L", len(y), "sec", len(y) / SR, "L%160", len(y) % 160, "P", P)
