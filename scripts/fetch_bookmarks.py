#!/usr/bin/env python3
"""Turn saved X bookmark API pages into current_ids.json + new_raw.json (stdlib only).

X is fetched via the connector (get_users_bookmarks, max_results=100,
post.fields=created_at,text,author_id,entities,note_tweet,article,
expansions=author_id, user.fields=username,name). Save each page response
verbatim as page_001.json, page_002.json, ... (follow meta.next_token as
pagination_token until a page has no next_token).

Usage:
  python3 scripts/fetch_bookmarks.py [--pages-dir <repo>/../pages]
      [--out-dir <repo>/..] [--existing data/bookmarks.json]
Defaults sit next to the repo, outside it (standard clone /workspace/xshelf/repo
-> pages in /workspace/xshelf/pages, outputs in /workspace/xshelf).

Checks: pages numbered contiguously from 001; every page but the last has
meta.next_token, the last has none; each page has 'data', no 'errors', and
meta.result_count == len(data). The last page may instead be empty (no 'data',
result_count 0): X sometimes ends pagination that way, and it also means zero
bookmarks when it is the only page. Complete -> writes <out>/current_ids.json
(ids in API order, first occurrence kept). Incomplete -> deletes any stale
current_ids.json and exits 2.
Always writes <out>/new_raw.json: raw posts not in --existing, API order, plus
author_username, author_name and expanded_text (t.co: media -> 「[图片/视频]」,
else unwound_url / expanded_url; unmatched kept; note_tweet text if longer).
Then write titles/summaries/categories into new.json and run:
  python3 scripts/merge.py new.json [--current current_ids.json]   (only if complete)
"""
import argparse,json,os,re,sys
here=os.path.dirname(os.path.abspath(__file__))
# 同一 Grok 账号的 Bot 共用一台电脑，工作目录跟着仓库走，不写死路径
work=os.path.normpath(os.path.join(here,'..','..'))
ap=argparse.ArgumentParser()
ap.add_argument('--pages-dir',default=os.path.join(work,'pages'))
ap.add_argument('--out-dir',default=work)
ap.add_argument('--existing',default=os.path.join(here,'..','data','bookmarks.json'))
a=ap.parse_args()
files=sorted((int(m.group(1)),f) for f in os.listdir(a.pages_dir) if (m:=re.fullmatch(r'page_(\d+)\.json',f)))
probs=[]
if not files: probs.append('no page files')
if [n for n,_ in files]!=list(range(1,len(files)+1)): probs.append(f'page numbers not contiguous: {[n for n,_ in files]}')
pages=[]
for i,(n,f) in enumerate(files):
    try: p=json.load(open(os.path.join(a.pages_dir,f),encoding='utf-8'))
    except Exception as e: probs.append(f'{f}: unreadable ({e})');pages.append({});continue
    pages.append(p);meta=p.get('meta') or {};last=i==len(files)-1
    if p.get('errors'): probs.append(f'{f}: has errors')
    if last and 'data' not in p and meta.get('result_count')==0: pass
    elif not isinstance(p.get('data'),list): probs.append(f'{f}: missing data')
    elif 'result_count' in meta and meta['result_count']!=len(p['data']): probs.append(f'{f}: result_count {meta["result_count"]} != {len(p["data"])}')
    if not last and not meta.get('next_token'): probs.append(f'{f}: no next_token but not last page')
    if last and meta.get('next_token'): probs.append(f'{f}: last page still has next_token (more pages to fetch)')
ids=[];posts={};users={}
for p in pages:
    for u in (p.get('includes') or {}).get('users',[]): users.setdefault(u['id'],u)
    for t in p.get('data') or []:
        if t['id'] not in posts: posts[t['id']]=t;ids.append(t['id'])
def expand(t):
    nt=t.get('note_tweet') or {}
    s=nt['text'] if len(nt.get('text',''))>len(t.get('text','')) else t.get('text','')
    m={}
    for e in ((t.get('entities') or {}).get('urls') or [])+((nt.get('entities') or {}).get('urls') or []):
        m.setdefault(e['url'],'「[图片/视频]」' if e.get('media_key') else (e.get('unwound_url') or e.get('expanded_url') or e['url']))
    return re.sub(r'https://t\.co/\w+',lambda x:m.get(x.group(0),x.group(0)),s)
have={str(b['id']) for b in json.load(open(a.existing,encoding='utf-8'))}
new=[]
for i in ids:
    if i in have: continue
    t=dict(posts[i]);u=users.get(t.get('author_id'),{})
    t.update(author_username=u.get('username',''),author_name=u.get('name',''),expanded_text=expand(t));new.append(t)
os.makedirs(a.out_dir,exist_ok=True)
json.dump(new,open(os.path.join(a.out_dir,'new_raw.json'),'w',encoding='utf-8'),ensure_ascii=False,indent=1)
cp=os.path.join(a.out_dir,'current_ids.json');ok=not probs
if ok: json.dump(ids,open(cp,'w',encoding='utf-8'))
elif os.path.exists(cp): os.remove(cp)
for p in probs: print('INCOMPLETE:',p,file=sys.stderr)
print(f"pages {len(files)}, total ids {len(ids)}, complete {'yes' if ok else 'NO (current_ids.json not written)'}, new {len(new)}")
sys.exit(0 if ok else 2)
