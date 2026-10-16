#!/usr/bin/env python3
"""Regenerate BOOKMARKS.md from data/bookmarks.json + data/meta.json + config.json."""
import json,os,datetime,collections,re
from zoneinfo import ZoneInfo
root=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
B=[b for b in json.load(open(os.path.join(root,'data','bookmarks.json'),encoding='utf-8')) if not b.get('removed_at')]
M=json.load(open(os.path.join(root,'data','meta.json'),encoding='utf-8'))
C=json.load(open(os.path.join(root,'config.json'),encoding='utf-8'))
zn=C.get('timezone') or 'Asia/Shanghai';tz=ZoneInfo(zn)
dt=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00')).astimezone(tz)
g=collections.defaultdict(list)
for b in B:g[b['category']].append(b)
cs=sorted(g,key=lambda c:(-len(g[c]),c))
esc=lambda s:re.sub(r'([\[\]|*_`<>])',r'\\\1',str(s or ''))
o=[f"# {esc(C.get('title') or '我的 X 书签')}",'']
if C.get('site_url'): o+=[f"在线浏览（分类筛选、全文搜索）：**{C['site_url']}**",'']
o+=[f"共 **{M['total']}** 条书签，最后更新：{dt(M['updated_at']).strftime('%Y-%m-%d %H:%M')}（{zn}）" if M.get('updated_at') else '还没有书签。','',
    '这个文件由 `scripts/gen_list.py` 生成，不要手改。','']
if cs: o+=['## 目录','']+[f'- [{esc(c)}](#cat-{n}) — {len(g[c])} 条' for n,c in enumerate(cs)]
for n,c in enumerate(cs):
    o+=['',f'<a id="cat-{n}"></a>','',f'## {esc(c)}（{len(g[c])}）','']
    for b in sorted(g[c],key=lambda b:b['created_at'],reverse=True):
        o.append(f"- **[{esc(b['title'])}]({b['url']})** — {esc(b['summary'])}  \n  @{esc(b.get('author_username',''))} · {dt(b['created_at']).date()}")
open(os.path.join(root,'BOOKMARKS.md'),'w',encoding='utf-8').write('\n'.join(o)+'\n')
print('BOOKMARKS.md regenerated')
