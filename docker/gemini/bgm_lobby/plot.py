import json, numpy as np, matplotlib
matplotlib.use("Agg"); import matplotlib.pyplot as plt
SR=48000
x=np.fromfile("/work/src.f32",dtype=np.float32).reshape(-1,2).mean(1)
h=SR//10; k=len(x)//h
r=20*np.log10(np.sqrt((x[:k*h].reshape(k,h)**2).mean(1))+1e-9)
fig,ax=plt.subplots(3,1,figsize=(14,9))
t=np.arange(k)/10
ax[0].plot(t,r,lw=.7); ax[0].set_ylim(-50,-5); ax[0].set_title("source RMS 100ms (dB)")
for n,c in (("L1a","r"),("S2a","g")):
    d=json.load(open(f"/work/{n}.json")); ax[0].axvspan(d["loop_start_src_s"],d["loop_end_src_s"],color=c,alpha=.12,label=n)
ax[0].legend(); ax[0].set_xticks(range(0,156,5)); ax[0].grid(alpha=.3)
for i,n in enumerate(("L1a","S2a")):
    y=np.fromfile(f"/work/{n}.f32",dtype=np.float32).reshape(-1,2).mean(1)
    w=np.concatenate([y[-3*SR:],y[:3*SR]]); tt=(np.arange(len(w))-3*SR)/SR
    ax[i+1].plot(tt,w,lw=.3); ax[i+1].axvline(0,color='r'); ax[i+1].axvspan(-1,0,color='orange',alpha=.2)
    ax[i+1].set_title(f"{n} wrap: end(-3s..0) -> start(0..3s), orange=crossfade")
plt.tight_layout(); plt.savefig("/work/overview.png",dpi=80)
