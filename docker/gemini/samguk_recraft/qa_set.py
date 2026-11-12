# qa.json 스프라이트 판정 기록(호출 없음). 사용: python qa_set.py <<< 'code|verdict|issues(;구분)|notes' 줄 단위
import json, sys
f = 'docker/gemini/samguk_recraft/qa.json'; d = json.load(open(f, encoding='utf-8'))
for line in sys.stdin.read().splitlines():
    if not line.strip(): continue
    code, v, iss, notes = line.split('|')
    d.setdefault(code, {})['sprite'] = {'verdict': v, 'issues': [i for i in iss.split(';') if i], 'notes': notes}
json.dump(d, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=1); print('ok')
