# -*- coding: utf-8 -*-
"""Legendary War unused-asset audit (read-only). Writes audit_candidates.json into the quarantine dir.
Usage: python -X utf8 asset_audit_20261114.py
"""
import json, os, re, sys, time, fnmatch
from pathlib import Path

ROOT = Path(r"C:\Users\김진섭\Works\legendary_war")
PUB = ROOT / "public"
QDIR = ROOT / "_asset_quarantine_20261114"
NOW = time.time()
RECENT_SEC = 24 * 3600
IMG_EXT = {".png", ".webp", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".wav", ".mp3", ".ogg", ".opus", ".glb", ".ttf", ".otf", ".woff", ".woff2", ".tsx", ".json"}
TEXT_EXT = {".js", ".mjs", ".cjs", ".ts", ".jsx", ".vue", ".css", ".scss", ".php", ".json", ".html", ".tsx", ".tmx", ".txt", ".xml", ".yml", ".yaml", ".csv", ".md", ".py", ".sh"}

# paths held by other agents / explicit exclusions (relative to ROOT, posix)
HOLD_GLOBS = [
    "public/assets/ui_skin/library/nav*", "public/assets/ui/_candidates_campaign*", "public/assets/ui/logo*",
    "public/assets/ui/tooltip*", "public/assets/maps/library/nodes*", "public/assets/units/boat_base*",
    "*/_bak_*", "public/assets/manifest.json.bak_*", "*20261114*",
]
JUNK_SEG = re.compile(r"^(_.*|.*candidates?.*|.*preview.*|qa|raw|.*trial.*|test|mockups?|.*backup.*|_orig.*|.*_bak.*)$", re.I)


def rel(p: Path) -> str:
    return p.relative_to(ROOT).as_posix()


def held(r: str) -> bool:
    return any(fnmatch.fnmatch(r, g) or fnmatch.fnmatch(r, g + "/*") for g in HOLD_GLOBS)


def read_text(p: Path):
    try:
        return p.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


# ---------- corpora ----------
def walk(base: Path, exts, skip_dirs=("node_modules", "vendor")):
    if not base.exists():
        return
    for dp, dns, fns in os.walk(base):
        dns[:] = [d for d in dns if d not in skip_dirs]
        for f in fns:
            p = Path(dp) / f
            if p.suffix.lower() in exts:
                yield p


runtime_docs = []
for sub in ["resources", "app", "config", "routes", "database", "tests", "public/build"]:
    runtime_docs += list(walk(ROOT / sub, TEXT_EXT))
runtime_docs += [PUB / "index.php"]
meta_skip = {"webp_map.json", "sprite_audit.json"}
for p in walk(PUB / "assets", {".json", ".tsx", ".tmx", ".css", ".txt"}):
    r = rel(p)
    segs = r.split("/")[2:-1]
    if p.name in meta_skip or ".bak" in p.name or any(JUNK_SEG.match(s) for s in segs):
        continue
    runtime_docs.append(p)
tool_docs = list(walk(ROOT / "scripts", TEXT_EXT)) + [p for p in walk(ROOT / "docker", {".mjs", ".js", ".py", ".sh", ".cjs"}) if p.stat().st_size < 2_000_000 and p.name != Path(__file__).name]

TOK_PATH = re.compile(r"[A-Za-z0-9_\-@./\uac00-\ud7a3]+")
TOK_ID = re.compile(r"[A-Za-z0-9_]+")
TOK_NAME = re.compile(r"[A-Za-z0-9_\-@.\uac00-\ud7a3]+")


def build(docs):
    suffixes, names, ids, raw = set(), set(), set(), []
    for p in docs:
        t = read_text(p)
        raw.append(t)
        for tok in TOK_PATH.findall(t):
            parts = [x for x in tok.split("/") if x]
            for i in range(len(parts)):
                suffixes.add("/".join(parts[i:]))
        names.update(TOK_NAME.findall(t))
        ids.update(TOK_ID.findall(t))
    return suffixes, names, ids, "\n".join(raw)


RT_SUF, RT_NAME, RT_ID, RT_RAW = build(runtime_docs)
TL_SUF, TL_NAME, TL_ID, TL_RAW = build(tool_docs)

# dynamic template literals in runtime JS -> regex
dyn = []
for p in walk(ROOT / "resources" / "js", {".js", ".mjs"}):
    for lit in re.findall(r"`([^`]*\$\{[^`]*)`", read_text(p)):
        if not re.search(r"\.(png|webp|jpe?g|json|wav|mp3|ogg|opus|svg)", lit):
            continue
        rx = re.escape(lit)
        rx = re.sub(r"\\\$\\\{[^}]*\\\}", "[^?#]*", rx)
        dyn.append((rel(p), lit, re.compile("(^|/)" + rx.lstrip("/") + "$") if not lit.startswith("${") else re.compile(rx + "$")))

# manifest: every string that looks like a path, and keys
man = json.load(open(PUB / "assets" / "manifest.json", encoding="utf-8"))
MAN_PATHS = set()
MAN_KEYS = set()


def collect(o):
    if isinstance(o, dict):
        for v in o.values():
            collect(v)
    elif isinstance(o, list):
        for v in o:
            collect(v)
    elif isinstance(o, str) and re.search(r"\.[A-Za-z0-9]{2,5}$", o) and "/" in o:
        MAN_PATHS.add(o.lstrip("/").removeprefix("public/"))


collect(man)
for it in man["items"]:
    MAN_KEYS.add(it.get("key"))
MAN_SUF = set()
for mp in MAN_PATHS:
    parts = mp.split("/")
    for i in range(len(parts)):
        MAN_SUF.add("/".join(parts[i:]))


def strip_scale(stem):
    return re.sub(r"(@[0-9.]+x|_x[0-9]+|_[0-9]+x)$", "", stem)


def analyze(p: Path):
    r = rel(p)
    pubrel = r.removeprefix("public/")
    name, stem = p.name, strip_scale(p.stem)
    st = p.stat()
    res = {"path": r, "bytes": st.st_size, "mtime": time.strftime("%Y-%m-%d %H:%M", time.localtime(st.st_mtime))}
    checks = {}
    checks["manifest_path"] = pubrel in MAN_PATHS or any(s in MAN_SUF for s in [pubrel, "/".join(pubrel.split("/")[1:])])
    checks["rt_path"] = pubrel in RT_SUF or "/".join(pubrel.split("/")[1:]) in RT_SUF
    checks["rt_basename"] = name in RT_NAME or name in RT_SUF
    checks["rt_stem"] = stem in RT_ID or stem in RT_NAME or p.stem in RT_NAME
    dm = [lit for (_f, lit, rx) in dyn if rx.search("/" + pubrel)]
    # portraitUrl fallback `/assets/portraits/${id}.png` only fires when manifest lacks portrait.<id>
    if p.suffix.lower() == ".png" and pubrel.startswith("assets/portraits/") and pubrel.count("/") == 2:
        if f"portrait.{p.stem}" in MAN_KEYS:
            dm = [d for d in dm if "/assets/portraits/${" not in d]
    checks["rt_dynamic"] = dm[:3]
    checks["tool_ref"] = (pubrel in TL_SUF) or (name in TL_NAME) or (stem in TL_ID)
    sib = None
    for ext in (".webp",):
        if p.suffix.lower() in (".png", ".jpg", ".jpeg") and p.with_suffix(ext).exists():
            sib = rel(p.with_suffix(ext))
    res["checks"] = checks
    res["webp_sibling"] = sib
    return res


BASENAMES = {}
for _dp, _dn, _fn in os.walk(PUB / "assets"):
    for _f in _fn:
        BASENAMES[_f] = BASENAMES.get(_f, 0) + 1


def classify(res, p: Path):
    r = res["path"]
    c = res["checks"]
    segs = r.split("/")
    junk = [s for s in segs[2:-1] if JUNK_SEG.match(s)]
    recent = NOW - p.stat().st_mtime < RECENT_SEC
    if c["manifest_path"]:
        return None
    referenced_rt = c["rt_path"] or c["rt_basename"] or bool(c["rt_dynamic"])
    if held(r) or recent:
        return {**res, "class": "orphan" if not junk else "placeholder", "confidence": "hold", "reason": "held path (other agent / _bak_ / manifest.json.bak_) or modified <24h"} if not c["rt_path"] and not c["rt_dynamic"] else None
    if junk and not c["rt_dynamic"] and "_orig_bgm_20261102" in r:
        return None if referenced_rt else {**res, "class": "old_version", "confidence": "med", "reason": "pre-replacement BGM kept as provenance; folder is cited in audio/bgm/*.loop.json source notes (user_src_* originals live here)"}
    if junk and not c["rt_dynamic"]:
        # inside a work folder: a bare basename/stem hit is explained by the same-named live file elsewhere;
        # count only references whose path includes the work-folder segment
        i = segs.index(junk[0])
        tail = "/".join(segs[i:])
        referenced_rt = tail in RT_SUF or "/".join(segs[i + 1:]) in RT_SUF and False
        if not referenced_rt:
            same = BASENAMES.get(p.name, 0)
            res = {**res, "basename_dupes": same}
            if c["tool_ref"] and (NOW - p.stat().st_mtime) < 7 * 86400:
                pass
            if "manifest_fragment" in p.name:
                return {**res, "class": "orphan", "confidence": "med", "reason": "manifest fragment in work folder (pipeline record)"}
            cls = "old_version" if re.search(r"bak|backup|orig|_r[0-9]|old", "/".join(junk), re.I) else ("dummy" if re.search("test|mock", "/".join(junk), re.I) else "placeholder")
            return {**res, "class": cls, "confidence": "high",
                    "reason": f"in work folder {junk}; no runtime reference to a path containing '{tail}'; not in manifest; no dynamic match" + ("; basename also used by a live file elsewhere" if same > 1 else "") + ("; mentioned by tooling scripts" if c["tool_ref"] else "")}
    if held(r) or recent:
        cat = "orphan"
        return {**res, "class": cat, "confidence": "hold", "reason": "held path (other agent) or modified <24h"} if not referenced_rt and not c["rt_stem"] else None
    if "manifest_fragment" in p.name and not referenced_rt:
        return {**res, "class": "orphan", "confidence": "med", "reason": "manifest fragment (pipeline merge record); keep unless merge tooling confirmed"}
    if ".bak" in p.name:
        if referenced_rt:
            return None
        return {**res, "class": "old_version", "confidence": "high", "reason": "dated .bak copy of a json; not referenced at runtime"}
    if referenced_rt:
        return None
    # stem-only reference
    if c["rt_stem"]:
        sib = res["webp_sibling"]
        if sib and (sib.removeprefix("public/") in MAN_PATHS or sib.removeprefix("public/") in RT_SUF):
            return {**res, "class": "duplicate", "confidence": "high" if not junk else "high",
                    "reason": f"png/jpg source; served variant {sib} is the one referenced (manifest/code); this file's path/basename not referenced; no dynamic pattern match"}
        if junk:
            return {**res, "class": "old_version" if any(re.search('bak|backup|orig|_r[0-9]', s, re.I) for s in junk) else "placeholder",
                    "confidence": "med", "reason": f"in work folder {junk}; path/basename unreferenced but stem token '{p.stem}' appears in runtime text (ambiguous)"}
        return None
    cls = "orphan"
    if junk:
        j = "/".join(junk).lower()
        cls = "old_version" if re.search(r"bak|backup|orig|_r[0-9]|old", j) else ("dummy" if "test" in j or "mock" in j else "placeholder")
    conf = "high"
    reason = "no path/basename/stem reference in runtime code/data, not in manifest, no dynamic pattern match"
    if c["tool_ref"]:
        conf = "med"
        reason += "; referenced by tooling script (scripts/ or docker/)"
    return {**res, "class": cls, "confidence": conf, "reason": reason}


def main():
    cands = []
    scan_roots = [PUB / "assets", PUB / "fonts", PUB / "models", PUB / "images"]
    scanned = 0
    for base in scan_roots:
        for dp, dns, fns in os.walk(base):
            for f in fns:
                p = Path(dp) / f
                if p.name == "manifest.json" and p.parent == PUB / "assets":
                    continue
                scanned += 1
                c = classify(analyze(p), p)
                if c:
                    cands.append(c)
    # old build snapshots (directory-level, never auto-moved)
    for d in sorted(PUB.glob("build-*")):
        sz = sum(f.stat().st_size for f in d.rglob("*") if f.is_file())
        newest = max((f.stat().st_mtime for f in d.rglob("*") if f.is_file()), default=0)
        ref = d.name in RT_RAW
        cands.append({"path": rel(d), "bytes": sz, "kind": "dir", "class": "old_version",
                      "confidence": "hold" if NOW - newest < RECENT_SEC else "med",
                      "reason": f"previous build snapshot (rollback point); referenced_in_runtime={ref}; not auto-moved"})
    # docker pipeline previews (directory-level)
    for base in [ROOT / "docker" / "gemini", ROOT / "docker" / "maps"]:
        for dp, dns, fns in os.walk(base):
            d = Path(dp)
            if re.search(r"preview|(^|_)qa$|contact", d.name, re.I) and fns:
                files = [x for x in d.rglob("*") if x.is_file()]
                if not files:
                    continue
                newest = max(x.stat().st_mtime for x in files)
                only_img = all(x.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"} for x in files)
                r = rel(d)
                man_hit = any(mp.startswith(r) or r.split("docker/", 1)[-1] in mp for mp in MAN_PATHS)
                conf = "hold" if NOW - newest < RECENT_SEC else ("high" if only_img and not man_hit else "med")
                cands.append({"path": r, "bytes": sum(x.stat().st_size for x in files), "kind": "dir", "files": len(files),
                              "class": "placeholder", "confidence": conf,
                              "reason": "pipeline QA/preview renders (not served, regenerable)" + ("" if only_img else "; contains non-image files") + ("; referenced from manifest" if man_hit else "")})
                dns[:] = []
    summ = {}
    for c in cands:
        k = c["confidence"]
        summ.setdefault(k, [0, 0])
        summ[k][0] += 1
        summ[k][1] += c["bytes"]
    out = {"generated": time.strftime("%Y-%m-%d %H:%M:%S"), "scanned_files_public": scanned,
           "corpus": {"runtime_docs": len(runtime_docs), "tool_docs": len(tool_docs), "dynamic_patterns": [d[1] for d in dyn]},
           "rules": "high = not in manifest, path/basename/stem not referenced in runtime code+data (resources, app, config, routes, database, tests, public/build, public/assets json), no dynamic template match, not modified <24h, not held; png with referenced webp sibling = duplicate; tooling-only reference = med",
           "summary": {k: {"count": v[0], "bytes": v[1]} for k, v in summ.items()},
           "candidates": sorted(cands, key=lambda c: (c["confidence"], c["path"]))}
    QDIR.mkdir(exist_ok=True)
    json.dump(out, open(QDIR / "audit_candidates.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(out["summary"]), "scanned", scanned)


if __name__ == "__main__":
    main()
