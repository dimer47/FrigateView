# Outil de migration : remplace des textes par des clés et alimente fr.json
import json, sys, os
FR = os.path.join(os.path.dirname(__file__), '../../src/shared/locales/fr.json')
def load():
    try: return json.load(open(FR))
    except FileNotFoundError: return {}
def setkey(d, key, val):
    parts = key.split('.'); cur = d
    for p in parts[:-1]: cur = cur.setdefault(p, {})
    if parts[-1] in cur and cur[parts[-1]] != val: raise SystemExit(f'clé en conflit: {key}')
    cur[parts[-1]] = val
def run(path, pairs, keys):
    s = open(path).read()
    for a, b in pairs:
        if s.count(a) != 1: raise SystemExit(f'{path}: {s.count(a)}× {a!r}')
        s = s.replace(a, b)
    open(path, 'w').write(s)
    d = load()
    for k, v in keys.items(): setkey(d, k, v)
    json.dump(d, open(FR, 'w'), ensure_ascii=False, indent=2)
