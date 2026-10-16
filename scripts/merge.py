#!/usr/bin/env python3
"""Merge categorized bookmarks into data/bookmarks.json by id.
Usage: python3 scripts/merge.py new.json [--current current_ids.json]
new.json: JSON array of objects.
  - New id: required id,url,title,summary,category,created_at; optional
    author_username,author_name,text,bookmarked_order. New ones are put first
    (newest bookmarks), orders renumbered, first_seen_at set to today (in
    config.json's timezone).
  - Existing id: only the fields given are overwritten (e.g. {id,text} to
    backfill expanded links); first_seen_at is kept, bookmarked_order only
    changes through the --current order.
  category must be one of the names in data/categories.json.
--current: JSON array of the ids the X API returned this run, in the API's
  order (newest bookmark first, pages concatenated in order, not sorted; only
  pass it when pagination fully succeeded). The API only returns the most
  recent bookmarks (a window) and its last id is the oldest one in the
  window, so a missing bookmark gets removed_at (hidden on the site, data kept)
  only if it is newer than that one; older ones are outside the window and left
  as is. Ones returned again are restored. Returned ids are ordered as the API
  returned them, so a re-bookmarked old post moves to the front. Refuses to
  hide more than 30% of active bookmarks at once.
Writes nothing when nothing changed; otherwise updates meta.json and
regenerates BOOKMARKS.md."""
import json,sys,datetime,os,argparse,subprocess
from zoneinfo import ZoneInfo
here=os.path.dirname(os.path.abspath(__file__));root=os.path.join(here,'..')
bp=os.path.join(root,'data','bookmarks.json');mp=os.path.join(root,'data','meta.json')
ap=argparse.ArgumentParser();ap.add_argument('new');ap.add_argument('--current');a=ap.parse_args()
old=json.load(open(bp,encoding='utf-8'));new=json.load(open(a.new,encoding='utf-8'))
# 分类是 {name, short}，也兼容只写名字的字符串
cats=[c['name'] if isinstance(c,dict) else c for c in json.load(open(os.path.join(root,'data','categories.json'),encoding='utf-8'))]
cfg=json.load(open(os.path.join(root,'config.json'),encoding='utf-8'))
tz=ZoneInfo(cfg.get('timezone') or 'Asia/Shanghai');now=datetime.datetime.now(tz);today=now.date().isoformat()
by={b['id']:b for b in old};req=['id','url','title','summary','category','created_at']
upd_keys=('url','title','summary','category','created_at','author_username','author_name','text')
add=[];upd=0
for b in new:
    if 'id' not in b: sys.exit(f"missing id: {b}")
    b['id']=str(b['id'])
    if 'category' in b and b['category'] not in cats: sys.exit(f"unknown category {b['category']!r} in {b['id']}, allowed: {cats}")
    o=by.get(b['id'])
    if o:
        ch={k:b[k] for k in upd_keys if k in b and b[k]!=o.get(k)}
        if ch: o.update(ch);upd+=1
    else:
        miss=[k for k in req if k not in b]
        if miss: sys.exit(f"missing field in {b['id']}: {miss}")
        b['first_seen_at']=today;by[b['id']]=b;add.append(b)
rm=back=0;ids=[]
if a.current:
    # 保持接口顺序（新→旧），重复的只留第一次出现
    ids=list(dict.fromkeys(str(i) for i in json.load(open(a.current,encoding='utf-8'))));cur=set(ids)
    for b in old:
        if b.get('removed_at') and b['id'] in cur: del b['removed_at'];back+=1
    act=[b for b in old if not b.get('removed_at')]
    # 接口只返回最近一段书签，最后一条是窗口里最早收藏的：比它还老的可能只是被挤出窗口，不算取消。
    # 不能取返回里 order 最大的那条：重新收藏的老帖会排到接口最前，存的却还是旧 order，会把边界抬高
    olds={b['id']:b for b in old}
    edge=next((olds[i]['bookmarked_order'] for i in reversed(ids) if i in olds),-1)
    gone=[b for b in act if b['id'] not in cur and b['bookmarked_order']<edge]
    # 翻页不完整时 current 会缺一大片，宁可报错也不批量隐藏
    if len(gone)>0.3*len(act): sys.exit(f"refusing to hide {len(gone)}/{len(act)} bookmarks (>30%), current ids look incomplete")
    for b in gone: b['removed_at']=today;rm+=1
add.sort(key=lambda b:b.get('bookmarked_order',0))
prev=add+sorted(old,key=lambda b:b.get('bookmarked_order',0))
# 本次返回的按接口顺序排在最前（重新收藏的老帖回到最前），其余保持原顺序
head=[by[i] for i in ids if i in by];hs={b['id'] for b in head}
allb=head+[b for b in prev if b['id'] not in hs]
moved=[b['id'] for b in allb]!=[b['id'] for b in prev]
if not (add or upd or rm or back or moved):
    print('no changes');sys.exit(0)
for n,b in enumerate(allb):
    b['bookmarked_order']=n
    for k in ('author_username','author_name','text'): b.setdefault(k,'')
json.dump(allb,open(bp,'w',encoding='utf-8'),ensure_ascii=False,indent=1)
total=sum(1 for b in allb if not b.get('removed_at'))
json.dump({'total':total,'updated_at':now.isoformat(timespec='seconds')},open(mp,'w',encoding='utf-8'),ensure_ascii=False)
print(f"added {len(add)}, updated {upd}, removed {rm}, restored {back}, total {total}"+(', reordered' if moved else ''))
subprocess.run([sys.executable,os.path.join(here,'gen_list.py')],check=True)
