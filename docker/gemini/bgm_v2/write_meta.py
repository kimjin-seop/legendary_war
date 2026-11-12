# bgm_lobby / bgm_battle 의 loop.json + manifest 조각 생성(측정값은 실제 파일에서 다시 읽음, 이음새·품질 수치는 아래 QA 표 = 2026-11-02 실행 결과)
# 실행(프로젝트 루트): python -I docker/gemini/bgm_v2/write_meta.py
import json, hashlib, subprocess, os
D = "public/assets/audio/bgm"; P = 0.2
T = {
  "bgm_lobby": dict(key="bgm.lobby", L48=4350240, a=1094400, b=5444640, xf=0.5, curve="linear (등이득: 원본이 90.63s 주기로 그대로 반복된 곡이라 고상관 소재, 등전력이면 +3dB 불룩)",
    srcFile="사용자 제공 lobby.mp3 (MP3 48kHz stereo 192kbps, 119.56s, 제목 'Suspended Chord - Extended Loop', comment 'made with suno')",
    srcCorr={"waveCorr1s": 0.9949, "specCos": 0.9996, "onsetOffsetMs": 0}, tempo={"bpm": 91.09, "loopBeats": 137.59, "note": "곡 자체가 90.63s 주기 반복(Suno 확장)이라 박 정수배가 아니어도 반복 지점 파형이 일치"},
    loudIn=-15.9, gain=-1.1, enc={"opus": "libopus 22k VBR stereo (compression 10)", "mp3": "LAME ABR 26k mono 22.05kHz, lowpass 7.5kHz, +1.0dB(모노 다운믹스 보정, TP -1.0dBTP 제한)"},
    qa={"opus": {"seamErrVsCodecNoiseDb": 2.9, "seamErrInnerPercentile": 80.0, "seamHfBurstInnerPercentile": 90.8, "rms50msDeltaDb": 0.7, "hfCutoffHz": "없음(전대역)", "bandExcess4to20kDb": "+1.3~+3.8(저비트 노이즈 채움)", "pumpStdDb": 0.09, "lsd4to8kDb": 9.85, "stereoCorr": 0.645, "srcStereoCorr": 0.523},
        "mp3": {"seamErrVsCodecNoiseDb": -0.7, "seamErrInnerPercentile": 45.0, "rms50msDeltaDb": 2.55, "hfCutoffHz": 7640, "pumpStdDb": 0.06, "lsd4to8kDb": 37.15, "stereo": "모노", "note": "고역 버스트 비율(57dB)은 7.6kHz 이상이 거의 없어 분모가 0에 가까운 지표 착시. 이음새 오차 자체는 코덱 잡음 중앙값 수준"}},
    issues=["청취 미검증: 이음새(루프 끝 90.63s -> 0s) 및 원본 85.9~87.4s 완전 무음 브레이크(루프 63.1~64.6s 부근, 곡 의도인지 생성 결함인지 판단 필요)", "원본 인트로 0~22.8s 는 재생되지 않음(마커 루프 본체만 재생)", "mp3 폴백은 모노·7.6kHz 이하로 둔탁(Opus 미지원 브라우저만 해당)"]),
  "bgm_battle": dict(key="bgm.battle", L48=5188800, a=1232160, b=6420960, xf=0.9, curve="equal-power (sin/cos, 비반복 곡이라 비상관 소재)",
    srcFile="사용자 제공 battle.mp3 (MP3 48kHz stereo 177kbps, 184.20s, 제목 'Main Theme Loop', comment 'made with suno')",
    srcCorr={"waveCorr1s": "낮음(반복 구간 없음, 정상)", "spectralDist4s": 0.599, "onsetContinuity": 0.79, "onsetOffsetMs": -7, "onsetResidualMsAfter10msSnap": 3},
    tempo={"bpm": 133.2, "loopBeats": 240, "loopBars4_4": 60, "note": "박 단위 길이 고정(60마디) + 이음새 전후 4초 스펙트럼/리듬 연속성 최적 지점. 원본 끝 2초는 페이드아웃 엔딩이라 루프에서 제외"},
    loudIn=-16.1, gain=-0.9, enc={"opus": "libopus 20k VBR mono (compression 10), +0.7dB(모노 다운믹스 보정)", "mp3": "LAME ABR 22k mono 22.05kHz, lowpass 7.0kHz, +1.2dB(모노 보정)"},
    qa={"opus": {"seamErrVsCodecNoiseDb": -1.4, "seamErrInnerPercentile": 23.8, "seamHfBurstInnerPercentile": 12.5, "rms50msDeltaDb": -0.97, "rms1sDeltaDb": -2.04, "hfCutoffHz": "없음(전대역)", "bandExcess4to20kDb": "+0.6~+0.8", "pumpStdDb": 0.07, "lsd4to8kDb": 7.53, "stereo": "모노(스테레오 20k 는 좌우 상관 0.755->0.913 으로 이미 폭이 무너지고 스펙트럼 오차가 더 커 모노 채택)"},
        "mp3": {"seamErrVsCodecNoiseDb": -0.9, "seamErrInnerPercentile": 36.0, "rms1sDeltaDb": -1.92, "hfCutoffHz": 6914, "pumpStdDb": 0.08, "lsd4to8kDb": 55.11, "stereo": "모노"}},
    issues=["청취 미검증: 이음새 133.77s -> 25.67s 는 서로 다른 소절을 0.9s 크로스페이드로 잇는 음악적 접합(반복 구간이 없는 곡). 이음새에서 1초 RMS -2.0dB(곡이 점층적으로 커지는 구조라 루프 시작 시 한 단계 내려감)", "원본 인트로 0~25.67s, 133.77s 이후(~184s) 는 재생되지 않음", "모노(전투는 효과음 위주라 폭 손실 허용 판단)", "mp3 폴백은 7kHz 이하로 둔탁"]),
}
def probe(f):
    o = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,sample_rate,channels:format=duration,bit_rate,format_name", "-of", "json", f], capture_output=True, text=True).stdout)
    lo = subprocess.run(["ffmpeg", "-nostats", "-i", f, "-ac", "2", "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace").stderr
    I = TP = None
    for ln in lo.splitlines():
        s = ln.strip()
        if s.startswith("I:"): I = float(s.split()[1])
        if s.startswith("Peak:"): TP = float(s.split()[1])
    st = o["streams"][0]; fm = o["format"]
    return {"sampleRate": int(st["sample_rate"]), "channels": st["channels"], "measuredKbps": round(int(fm["bit_rate"]) / 1000, 1), "bytes": os.path.getsize(f),
            "durationS": round(float(fm["duration"]), 2), "lufsI_stereoDecode": I, "truePeakDbtp": TP, "sha256": hashlib.sha256(open(f, "rb").read()).hexdigest()}
for slot, t in T.items():
    L = t["L48"] / 48000; files = []
    for ext in ("opus", "mp3"):
        path = f"assets/audio/bgm/{slot}.{ext}"; m = probe(f"public/{path}")
        files.append({"path": path, "type": ext, "codec": t["enc"][ext], **m})
    loop = {"key": t["key"], "slot": slot, "files": files,
      "loop": {"note": f"파일 = [프리롤 {P}s] + [루프 본체 {L:.2f}s] + [포스트롤 {P}s]. 프리롤은 본체 끝, 포스트롤은 본체 처음의 복사본이라 파일 전체가 주기 {L:.2f}s 로 연속. 반드시 마커 구간(start~end)만 반복(파일 전체 loop:true 금지).",
        "marker": "loop", "start": P, "end": round(P + L, 2), "duration": round(L, 2),
        "start_sample_48k": 9600, "end_sample_48k": 9600 + t["L48"], "length_samples_48k": t["L48"],
        "start_sample_44k1": 8820, "end_sample_44k1": 8820 + round(L * 44100), "length_samples_44k1": round(L * 44100),
        "sampleExact": f"길이 {L:.2f}s 는 48kHz·44.1kHz 양쪽 정수 샘플(Web Audio 는 컨텍스트 레이트로 리샘플해 재생)"},
      "phaser": {"load": f"scene.load.audio('{slot}', ['/assets/audio/bgm/{slot}.opus', '/assets/audio/bgm/{slot}.mp3'])",
        "play": f"audio.bgm('{slot}', scene)  // audio.js 가 catalog marker 로 addMarker({{name:'loop', start:{P}, duration:{L:.2f}, config:{{loop:true}}}}) 후 play('loop')"},
      "source": {"file": t["srcFile"], "loopStartSrcS": round(t["a"] / 48000, 3), "loopEndSrcS": round(t["b"] / 48000, 3), "loopStartSrcSample48k": t["a"], "loopEndSrcSample48k": t["b"],
        "crossfade": {"durationS": t["xf"], "curve": t["curve"]}, "similarity": t["srcCorr"], "tempo": t["tempo"],
        "loudness": {"loopIntegratedBeforeLufs": t["loudIn"], "gainDb": t["gain"], "targetLufs": -17.0, "limiter": "없음(선형 게인만)"}},
      "sizeBudget": {"targetBytes": 300000, "rule": "총 길이 T초 -> 약 2400/T kbps", "fileSeconds": round(L + 2 * P, 2), "kbpsBudget": round(2400 / (L + 2 * P), 1)},
      "qa": t["qa"], "issues": t["issues"], "listenVerified": False,
      "license": "사용자 제작 파일(Suno 생성물, 'made with suno' 메타데이터). 공개 전 Suno 약관(요금제별 상업 이용 권리) 확인 필요",
      "backup": "public/assets/audio/_orig_bgm_20261102/ (이전 서비스 파일 + 사용자 원본 user_src_*.mp3)",
      "script": "docker/gemini/bgm_v2/ (analyze.py, refine.py, beatgrid.py, onsetalign.py, pad.py, final2.sh, select.sh, check2.py, burst_pct.py, seam_native.py, seam_err.py, qa.py, write_meta.py) - 호스트 ffmpeg 9.0.2(gyan full build), numpy 2.5.4"}
    json.dump(loop, open(f"{D}/{slot}.loop.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    o, mp = files
    frag = {"_note": "안아트 2026-11-02 v2(사용자 제공 곡 교체·300KB 목표). build_audio_manifest.mjs 가 audioSlot 을 읽어 audio/manifest.json slots 에 넣는다(bytes 는 실제 파일에서 재계산).",
      "audioSlot": {slot: {"type": "bgm", "path": mp["path"], "paths": [o["path"], mp["path"]], "loop": True, "loopMarker": {"name": "loop", "start": P, "duration": round(L, 2)},
        "loopMeta": f"assets/audio/bgm/{slot}.loop.json", "volume": 0.6,
        "volumeNote": "파일 -17 LUFS(로비·전투 동일). 0.6 이면 유효 약 -21.4 LUFS 로 로비=전투 체감 레벨 일치(구 bgm_battle 은 약 -13.5 LUFS x 0.5 = 약 -19.5 LUFS 였음)",
        "bytes": o["bytes"], "bytesFallbackMp3": mp["bytes"], "approxSeconds": round(L),
        "source": f"{t['srcFile']} 에서 {t['a']/48000:.2f}~{t['b']/48000:.2f}s 루프 추출, {t['xf']}s 크로스페이드, 0.2s 프리/포스트롤, -17 LUFS, {t['enc']['opus']}(.opus) + {t['enc']['mp3']}",
        "license": "사용자 제작 파일(Suno 생성물). 공개 전 Suno 약관 확인 필요", "method": "user-provided+edit"}},
      "manifestItem": {"key": t["key"], "path": o["path"], "variants": {"mp3": mp["path"]}, "type": "bgm", "bytes": o["bytes"], "loop": True, "loopMeta": f"assets/audio/bgm/{slot}.loop.json", "scope": "lazy",
        "generator": {"model": "Suno(사용자 생성)", "script": "docker/gemini/bgm_v2/"}, "prompt_ref": "없음(사용자 제작)", "license": "사용자 제작 파일(Suno 생성물). 공개 전 Suno 약관 확인 필요",
        "qa": {"checked": True, "verdict": "pass-numeric", "issues": t["issues"] + ["Safari 의 Ogg Opus 디코드 지원 verify(미지원이면 mp3 폴백)"]}, "verify": True, "listen_verified": False}}
    json.dump(frag, open(f"{D}/{slot}_manifest_fragment.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(slot, json.dumps(files, ensure_ascii=False))
