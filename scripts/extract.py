#!/usr/bin/env python3
"""Extract the two supplied EPUBs into a chapter-aligned local reader dataset."""
import json, re, zipfile, xml.etree.ElementTree as ET
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent

def paragraphs(data, russian=False):
    root = ET.fromstring(data.replace(b"&nbsp;", b"&#160;"))
    out = []
    for p in root.iter():
        if p.tag.split('}')[-1] != 'p': continue
        # Footnote references are not part of the reading text.
        for child in list(p.iter()):
            if child.tag.split('}')[-1] == 'a' and (russian or child.attrib.get('href', '').startswith('#')):
                child.text = ''
                for sub in child.iter():
                    if sub is not child: sub.text = ''
        text = ' '.join(''.join(p.itertext()).split())
        if text and not re.fullmatch(r'CHAPTER\s+[IVXLCDM]+', text, re.I): out.append(text)
    return out

with zipfile.ZipFile(ROOT / 'voina-i-mir.epub') as ru, zipfile.ZipFile(ROOT / 'warandpeacepevear.epub') as en:
    ru_names = sorted(n for n in ru.namelist() if re.search(r'001_003_\d{3}_\d{3}_\d{3}\.xhtml$', n) or re.search(r'001_003_004_005_00[12]_\d{3}\.xhtml$', n))
    en_names = []
    for n in sorted(x for x in en.namelist() if re.fullmatch(r'index_split_\d+\.html', x)):
        root = ET.fromstring(en.read(n))
        ps = [' '.join(''.join(p.itertext()).split()) for p in root.iter() if p.tag.split('}')[-1] == 'p']
        if ps and re.fullmatch(r'CHAPTER\s+[IVXLCDM]+', ps[0], re.I): en_names.append(n)
    # The editions divide two parts into different numbers of chapters.
    # Match those parts by relative text length, at paragraph boundaries.
    ru_groups=[]
    for n in ru_names:
        nums=list(map(int,re.findall(r'\d{3}',Path(n).stem)))
        key=tuple(nums[2:-1])
        if not ru_groups or ru_groups[-1][0] != key: ru_groups.append((key,[]))
        ru_groups[-1][1].append(n)
    en_groups=[]
    for n in en_names:
        root=ET.fromstring(en.read(n))
        first=next(' '.join(''.join(p.itertext()).split()) for p in root.iter() if p.tag.split('}')[-1]=='p')
        if first == 'CHAPTER I': en_groups.append([])
        en_groups[-1].append(n)
    if len(ru_groups)!=len(en_groups): raise SystemExit('Part count mismatch')
    chapters=[]
    for (key, rnames), enames in zip(ru_groups,en_groups):
        rparas=[paragraphs(ru.read(n),True) for n in rnames]
        eparas=[paragraphs(en.read(n)) for n in enames]
        approximate=len(rnames)!=len(enames)
        if approximate:
            flat=[p for group in eparas for p in group]
            total_r=sum(len(p) for group in rparas for p in group)
            total_e=sum(len(p) for p in flat)
            boundaries=[]; cumulative=0; pos=0; length=0
            for group in rparas[:-1]:
                cumulative+=sum(map(len,group)); target=cumulative/total_r*total_e
                while pos<len(flat) and length+len(flat[pos])/2<target:
                    length+=len(flat[pos]); pos+=1
                boundaries.append(pos)
            starts=[0]+boundaries; ends=boundaries+[len(flat)]
            eparas=[flat[a:b] for a,b in zip(starts,ends)]
        for j,(rp,ep) in enumerate(zip(rparas,eparas),1):
            label=(f'Epilogue · Part {key[-1]} · Chapter {j}' if len(key)==3 else f'Volume {key[0]} · Part {key[1]} · Chapter {j}')
            chapters.append(dict(id=len(chapters), label=label, approximate=approximate, ru=rp, en=ep))
    (ROOT / 'data' / 'chapters.js').write_text('window.BOOK_CHAPTERS = ' + json.dumps(chapters,ensure_ascii=False,separators=(',',':')) + ';\n', encoding='utf8')
    print(f'Extracted {len(chapters)} aligned chapters')
