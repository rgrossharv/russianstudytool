#!/usr/bin/env python3
"""Generate monotonic bilingual sentence anchors. Optionally use local Argos Translate."""
import argparse
import hashlib
import importlib.metadata
import json
import math
import os
import re
import sqlite3
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ALGORITHM_VERSION = 1
SENTENCE = re.compile(r'(?<=[.!?…])(?:[»”"’\)]*)\s+(?=[А-ЯЁA-Z«“"—–])')
WORDS = re.compile(r"[^\W\d_]+|\d+", re.UNICODE)
STOP = set('the a an and or in on of at to for is was were are be been he she it they his her their that this with from as by i you we not but had has have who which prince princess count said says mr m mme de la le les et que je mon un une il elle au du en ne pas vous me se son sa moi si'.split())
TRANSLIT = str.maketrans({'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'i','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'})

def sentences(paragraphs):
    result=[]; offset=0
    for para in paragraphs:
        start=0
        for m in SENTENCE.finditer(para):
            end=m.end()
            if end>start: result.append((offset+start,offset+end,para[start:end]))
            start=end
        if start<len(para):result.append((offset+start,offset+len(para),para[start:]))
        offset+=len(para)
    return result

def features(text):
    text=unicodedata.normalize('NFKD',text.lower())
    text=''.join(c for c in text if not unicodedata.combining(c)).translate(TRANSLIT)
    words=WORDS.findall(text)
    # Coarse roots help compare inflected names and literal translations.
    return set(w[:5] for w in words if len(w)>3 and w not in STOP) | {w for w in words if w.isdigit()}

def score(rtext,etext,rfeat,efeat,ratio, semantic):
    a,b=len(rtext.strip()),len(etext.strip())
    if not a or not b:return 3.4
    length=min(3.0,abs(math.log((a*ratio+12)/(b+12))))
    common=len(rfeat & efeat)
    coverage=common / max(1,min(len(rfeat),len(efeat)))
    return length*1.25 - min(1.6, coverage*(2.8 if semantic else 1.8))

def align(ru,en,translator=None):
    rs,es=sentences(ru),sentences(en)
    if not rs or not es:return [[0,0],[sum(map(len,ru)),sum(map(len,en))]]
    translated=[translator(s[2]) for s in rs] if translator else [s[2] for s in rs]
    rf=[features(x) for x in translated];ef=[features(x[2]) for x in es]
    nr,ne=len(rs),len(es);ratio=sum(len(x[2]) for x in es)/max(1,sum(len(x[2]) for x in rs))
    # Sparse dynamic programming allows skipped sentences and merged sentences.
    rows=[{} for _ in range(nr+1)];rows[0][0]=(0,None)
    band=max(18, int(max(nr,ne)*.2)+4)
    transitions=((1,1,0),(1,2,.25),(2,1,.25),(2,2,.35),(1,0,1.5),(0,1,1.5))
    for i in range(nr+1):
        lo=max(0,round(i*ne/nr)-band);hi=min(ne,round(i*ne/nr)+band)
        for j in range(lo,hi+1):
            if i==0 and j==0:continue
            best=None
            for di,dj,penalty in transitions:
                if i<di or j<dj:continue
                prev=rows[i-di].get(j-dj)
                if prev is None:continue
                if di and dj:
                    rt=' '.join(translated[k] for k in range(i-di,i));et=' '.join(es[k][2] for k in range(j-dj,j))
                    ra=set().union(*rf[i-di:i]);ea=set().union(*ef[j-dj:j])
                    # Translation changes length; the length ratio should still be based on original text.
                    original=' '.join(rs[k][2] for k in range(i-di,i))
                    c=score(original,et,ra,ea,ratio,translator is not None)
                else:c=3.4
                candidate=prev[0]+c+penalty
                if best is None or candidate<best[0]:best=(candidate,(i-di,j-dj))
            if best is not None:rows[i][j]=best
    if ne not in rows[nr]:return [[0,0],[sum(map(len,ru)),sum(map(len,en))]]
    points=[];i,j=nr,ne
    while i or j:
        points.append([rs[i-1][1] if i else 0,es[j-1][1] if j else 0]);i,j=rows[i][j][1]
    points.append([0,0]);points.reverse()
    # A repeated coordinate represents an insertion/deletion; retain it in the path.
    return points

def content_hash(chapter):
    payload=json.dumps([chapter['ru'],chapter['en']],ensure_ascii=False,separators=(',',':'))
    return hashlib.sha256(payload.encode('utf8')).hexdigest()

class CachedTranslator:
    """Keep completed translations so an interrupted pass never starts over."""
    def __init__(self, translate, cache_path, model_id):
        self.translate=translate
        self.model_id=model_id
        self.db=sqlite3.connect(cache_path)
        self.db.execute('CREATE TABLE IF NOT EXISTS translations (model TEXT NOT NULL, source TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(model, source))')
        self.pending=0
    def __call__(self, text):
        key=hashlib.sha256(text.encode('utf8')).hexdigest()
        row=self.db.execute('SELECT result FROM translations WHERE model=? AND source=?',(self.model_id,key)).fetchone()
        if row is not None:return row[0]
        result=self.translate(text)
        if not isinstance(result,str) or not result.strip():raise RuntimeError('The translation model returned an empty result')
        self.db.execute('INSERT OR REPLACE INTO translations(model,source,result) VALUES (?,?,?)',(self.model_id,key,result))
        self.pending+=1
        if self.pending>=20:self.flush()
        return result
    def flush(self):
        self.db.commit();self.pending=0
    def close(self):
        self.flush();self.db.close()

def pairs_from_points(points):
    return [[a[0],b[0],a[1],b[1]] for a,b in zip(points,points[1:])]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--translator',choices=['none','argos'],default='none',help='argos uses an installed Russian→English Argos model locally')
    parser.add_argument('--chapter',type=int,help='Regenerate only this 1-based chapter, preserving other saved anchors')
    parser.add_argument('--resume',action='store_true',help='Skip chapters already aligned with the selected method')
    args=parser.parse_args();translator=None;model_id=None
    if args.translator=='argos':
        for var, subdir in [('XDG_DATA_HOME','data'),('XDG_CONFIG_HOME','config'),('XDG_CACHE_HOME','cache')]:
            os.environ.setdefault(var,str(ROOT/'.argos'/subdir))
        try:
            import argostranslate.translate
            language=argostranslate.translate.get_language_from_code('ru');target=argostranslate.translate.get_language_from_code('en')
            model=language.get_translation(target) if language and target else None
            if not model:raise RuntimeError('Russian→English Argos model is not installed')
            direct_model=getattr(model,'underlying',model)
            package=getattr(direct_model,'pkg',None)
            try: argos_version=importlib.metadata.version('argostranslate')
            except importlib.metadata.PackageNotFoundError: argos_version='unknown'
            model_id='ru-en:'+argos_version+':'+str(getattr(package,'package_version','unknown'))
            translator=CachedTranslator(model.translate,ROOT/'data/translation-cache.sqlite3',model_id)
        except (ImportError,RuntimeError) as e:raise SystemExit(f'Offline translation unavailable: {e}. See README.md.')
    content=(ROOT/'data/chapters.js').read_text(encoding='utf8');chapters=json.loads(content[content.index('['):content.rindex(';')])
    output=ROOT/'data/alignment.js';saved={}
    if output.exists():
        try:saved=json.loads(output.read_text(encoding='utf8').split('=',1)[1].rstrip(';\n '))
        except (ValueError,IndexError):pass
    if args.chapter is not None and not 1<=args.chapter<=len(chapters):raise SystemExit('Chapter number out of range')
    for n,c in enumerate(chapters,1):
        if args.chapter and n!=args.chapter:continue
        method='argos' if translator else 'heuristic'
        old=saved.get(str(c['id']),{})
        digest=content_hash(c)
        if args.resume and old.get('method')==method and old.get('algorithmVersion')==ALGORITHM_VERSION and old.get('sourceHash')==digest and (not translator or old.get('modelId')==model_id):continue
        try:
            points=align(c['ru'],c['en'],translator)
        except BaseException:
            if translator:translator.close()
            raise
        if translator:translator.flush()
        saved[str(c['id'])]={'method':method,'algorithmVersion':ALGORITHM_VERSION,'sourceHash':digest,'modelId':model_id,'points':points,'pairs':pairs_from_points(points),'alignmentHash':hashlib.sha256(json.dumps(points,separators=(',',':')).encode()).hexdigest()}
        # Checkpoint each chapter so an interrupted offline model run can resume.
        tmp=output.with_suffix('.tmp')
        tmp.write_text('window.BOOK_ALIGNMENT = '+json.dumps(saved,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf8')
        tmp.replace(output)
        if n%25==0 or args.chapter or translator:print(f'Aligned {n}/{len(chapters)}: {c["label"]}',flush=True)
    if translator:translator.close()
    print('Wrote',output)
if __name__=='__main__':main()
