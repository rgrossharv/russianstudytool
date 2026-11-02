'use strict';
const $ = s => document.querySelector(s);
const KEY = 'war-peace-study-v1';
let state;
try { state = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { state = {}; }
state.cards = Array.isArray(state.cards) ? state.cards : [];
state.chapter = Number.isInteger(state.chapter) ? state.chapter : 0;
let chapters = [], selectionData = null, reviewCard = null, revealed = false, filter = 'all';
const save = () => { localStorage.setItem(KEY, JSON.stringify(state)); updateBadge(); };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const dueCards = () => state.cards.filter(c => !c.due || c.due <= Date.now()).sort((a,b) => (a.due || 0)-(b.due || 0));
function updateBadge(){ $('#dueBadge').textContent = dueCards().length; }
function toast(message){ const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),2500); }
function setTheme(theme){ state.theme=theme; document.documentElement.classList.toggle('dark',theme==='dark'); $('#themeToggle').textContent=theme==='dark'?'☀':'☾'; $('#themeToggle').setAttribute('aria-label',theme==='dark'?'Switch to light mode':'Switch to dark mode'); save(); }
setTheme(state.theme || (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
$('#themeToggle').addEventListener('click',()=>setTheme(state.theme==='dark'?'light':'dark'));
function showView(view){ document.body.classList.toggle('reading',view==='read'); ['read','review','collection'].forEach(v=>{ $(`#${v}View`).hidden=v!==view; document.querySelector(`[data-view="${v}"]`).classList.toggle('active',v===view); }); if(view==='review') renderReview(); if(view==='collection') renderCollection(); if(view==='read') requestAnimationFrame(renderChapter); window.scrollTo(0,0); }
document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
$('.brand').addEventListener('click',e=>{e.preventDefault();showView('read')});
let pageStarts = [{ru:0,en:0}], pageIndex = 0, pageEnd = null;
function chapterLength(paras){return paras.reduce((sum,p)=>sum+p.length,0)}
function cutAtWord(paras, proposed, start){
 const text=paras.join(''); let end=Math.min(text.length,Math.floor(proposed));
 if(end>=text.length)return text.length;
 while(end>start && !/\s/.test(text[end-1]) && !/\s/.test(text[end]))end--;
 return end>start?end:Math.min(text.length,Math.floor(proposed));
}
function pageHTML(paras,start,end,russian){
 let offset=0, out='';
 paras.forEach((p,i)=>{const a=Math.max(0,start-offset), b=Math.min(p.length,end-offset);offset+=p.length;if(b<=a)return;
 let html='',last=a;
 if(russian){const marks=state.cards.filter(c=>c.chapter===state.chapter&&c.paragraph===i&&Number.isInteger(c.start)&&Number.isInteger(c.end)&&c.end>a&&c.start<b).sort((x,y)=>x.start-y.start);
 for(const mark of marks){const x=Math.max(a,mark.start),y=Math.min(b,mark.end);if(x<last||y<=x)continue;html+=escapeHtml(p.slice(last,x))+`<mark title="Saved to your collection">${escapeHtml(p.slice(x,y))}</mark>`;last=y;}}
 html+=escapeHtml(p.slice(last,b));out+=`<p data-index="${i}" data-offset="${a}">${html}</p>`;
 });return out;
}
function pageFits(paras,start,end,russian,probe){probe.innerHTML=pageHTML(paras,start,end,russian);return probe.scrollHeight<=probe.clientHeight+1;}
function alignmentForChapter(){return window.BOOK_ALIGNMENT?.[String(state.chapter)]||null;}
function alignmentVersion(){const a=alignmentForChapter();return `2:${a?.method||'none'}:${a?.alignmentHash||'none'}`;}
function alignedEnglishOffset(ru, chapter){
 const points=alignmentForChapter()?.points;
 if(!points || points.length<2)return Math.round(ru/chapterLength(chapter.ru)*chapterLength(chapter.en));
 let lo=0,hi=points.length-1;
 while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(points[mid][0]<=ru)lo=mid;else hi=mid-1;}
 const left=points[lo],right=points[Math.min(lo+1,points.length-1)];
 if(right[0]===left[0])return right[1];
 return Math.round(left[1]+(ru-left[0])/(right[0]-left[0])*(right[1]-left[1]));
}
function calculatePage(start){
 const chapter=chapters[state.chapter], rl=chapterLength(chapter.ru), el=chapterLength(chapter.en);
 const visible=$('.reading-column:not(.mobile-hidden) .book-text')||$('#russianText');
 const width=visible.clientWidth,height=visible.clientHeight;
 if(!width||!height)return {ru:start.ru,en:start.en};
 const probe=document.createElement('div');probe.className='book-text';probe.style.cssText=`position:fixed;visibility:hidden;left:-10000px;top:0;width:${width}px;height:${height}px;overflow:hidden;`;document.body.appendChild(probe);
 let lo=0,hi=1,best={ru:start.ru,en:start.en};
 for(let i=0;i<20;i++){
  const mid=(lo+hi)/2;
  const ru=cutAtWord(chapter.ru,start.ru+(rl-start.ru)*mid,start.ru);
  const mapped=ru>=rl?el:alignedEnglishOffset(ru,chapter);
  const desired=start.ru>=rl?start.en+(el-start.en)*mid:Math.max(start.en,mapped);
  const en=cutAtWord(chapter.en,desired,start.en);
  if(pageFits(chapter.ru,start.ru,ru,true,probe)&&pageFits(chapter.en,start.en,en,false,probe)){best={ru,en};lo=mid}else hi=mid;
 }
 // Fill each spread with whole, precomputed pairs whenever they fit.
 // Only split a pair when a single pair is too large for a page.
 const pairs=alignmentForChapter()?.pairs||[];
 let pairedEnd=null;
 for(const pair of pairs){const ru=pair[1],en=pair[3];
  if(ru<start.ru||en<start.en||(ru===start.ru&&en===start.en))continue;
  if(!pageFits(chapter.ru,start.ru,ru,true,probe)||!pageFits(chapter.en,start.en,en,false,probe))break;
  pairedEnd={ru,en};
 }
 if(pairedEnd)best=pairedEnd;
 probe.remove();
 if(best.ru===start.ru && best.en===start.en){
  if(start.ru<rl)best.ru=Math.min(rl,start.ru+1);
  else if(start.en<el)best.en=Math.min(el,start.en+1);
 }
 return best;
}
function renderChapter(){
 const chapter=chapters[state.chapter]; if(!chapter||$('#readView').hidden)return;
 $('#chapterSelect').value=state.chapter;
 const alignment=alignmentForChapter(); const method=alignment?.method==='argos'?'offline translation':alignment?'sentence and text clues':'text length';
 $('#alignmentNote').textContent=`English: Maude translation · aligned using ${method}${chapter.approximate?' · chapter divisions differ':''}`;
 $('#prevChapter').disabled=state.chapter===0; $('#nextChapter').disabled=state.chapter===chapters.length-1;
 const start=pageStarts[pageIndex];pageEnd=calculatePage(start);
 $('#russianText').innerHTML=pageHTML(chapter.ru,start.ru,pageEnd.ru,true);
 $('#englishText').innerHTML=pageHTML(chapter.en,start.en,pageEnd.en,false);
 $('#prevPage').disabled=pageIndex===0;
 const finished=pageEnd.ru>=chapterLength(chapter.ru)&&pageEnd.en>=chapterLength(chapter.en);
 $('#nextPage').disabled=finished&&state.chapter===chapters.length-1;
 $('#pageIndicator').textContent=`PAGE ${pageIndex+1}${finished?' · END OF CHAPTER':''}`;
 state.readingPage={chapter:state.chapter,starts:pageStarts,index:pageIndex,alignmentVersion:alignmentVersion()};save();
}
function changeChapter(n){ if(n<0||n>=chapters.length)return; state.chapter=n;pageStarts=[{ru:0,en:0}];pageIndex=0;renderChapter();window.scrollTo({top:0,behavior:'smooth'}); }
$('#chapterSelect').addEventListener('change',e=>changeChapter(Number(e.target.value)));
$('#prevChapter').addEventListener('click',()=>changeChapter(state.chapter-1)); $('#nextChapter').addEventListener('click',()=>changeChapter(state.chapter+1));
$('#prevPage').addEventListener('click',()=>{if(pageIndex>0){pageIndex--;renderChapter()}else if(state.chapter>0)changeChapter(state.chapter-1)});
$('#nextPage').addEventListener('click',()=>{const c=chapters[state.chapter];if(pageEnd.ru>=chapterLength(c.ru)&&pageEnd.en>=chapterLength(c.en)){changeChapter(state.chapter+1);return;}pageStarts=pageStarts.slice(0,pageIndex+1);pageStarts.push(pageEnd);pageIndex++;renderChapter()});
function mobileLanguage(lang){document.querySelector('.russian').classList.toggle('mobile-hidden',lang==='en');document.querySelector('.english').classList.toggle('mobile-hidden',lang==='ru');$('#showRussian').classList.toggle('active',lang==='ru');$('#showEnglish').classList.toggle('active',lang==='en');renderChapter()}
mobileLanguage('ru');
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{pageStarts=pageStarts.slice(0,pageIndex+1);renderChapter()},150)});
function captureSelection(){
 const sel=window.getSelection(); if(!sel || sel.isCollapsed || !sel.rangeCount)return;
 const range=sel.getRangeAt(0); const node=range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;
 const p=node.closest?.('#russianText p'); if(!p || !p.contains(range.startContainer) || !p.contains(range.endContainer))return;
 const raw=range.toString(); const trimStart=raw.length-raw.trimStart().length, term=raw.trim(); if(!term||term.length>200)return;
 const before=range.cloneRange(); before.selectNodeContents(p); before.setEnd(range.startContainer,range.startOffset);
 const start=Number(p.dataset.offset||0)+before.toString().length+trimStart; selectionData={chapter:state.chapter,paragraph:Number(p.dataset.index),start,end:start+term.length,context:chapters[state.chapter].ru[Number(p.dataset.index)]};
 $('#saveForm').reset(); $('#grammarFields').hidden=true; $('#term').value=term; $('#contextPreview').textContent=selectionData.context; $('#saveDialog').showModal(); lookupWord(term);
}
$('#russianText').addEventListener('mouseup',()=>setTimeout(captureSelection,10));
$('#russianText').addEventListener('touchend',()=>setTimeout(captureSelection,500));
$('#russianText').addEventListener('keyup',e=>{if(e.shiftKey)captureSelection()});
$('#closeDialog').addEventListener('click',()=>$('#saveDialog').close());
$('#saveDialog').addEventListener('click',e=>{if(e.target===$('#saveDialog'))$('#saveDialog').close()});
document.querySelectorAll('[name="kind"]').forEach(x=>x.addEventListener('change',()=>$('#grammarFields').hidden=$('input[name="kind"]:checked').value!=='grammar'));
$('#saveForm').addEventListener('submit',e=>{
 e.preventDefault(); if(!selectionData)return;
 const kind=$('input[name="kind"]:checked').value;
 const grammar={}; if(kind==='grammar') for(const name of ['pos','case','number','gender','person','tense','conjugation','aspect']) if($('#'+name).value) grammar[name]=$('#'+name).value;
 const existing=selectionData.editId && state.cards.find(c=>c.id===selectionData.editId);
 if(existing){Object.assign(existing,{term:$('#term').value.trim(),meaning:$('#meaning').value.trim(),kind,grammar});}
 else state.cards.push({id:uid(),term:$('#term').value.trim(),meaning:$('#meaning').value.trim(),kind,grammar,...selectionData,chapterLabel:chapters[selectionData.chapter].label,due:Date.now(),interval:0,ease:2.5,created:Date.now()});
 save(); $('#saveDialog').close(); window.getSelection()?.removeAllRanges(); renderChapter(); if(!$('#collectionView').hidden)renderCollection(); toast('Saved to your collection');
});
function grammarText(c){ return Object.values(c.grammar||{}).filter(Boolean).join(' · '); }
function renderReview(){
 const due=dueCards(); if(!reviewCard || !due.some(c=>c.id===reviewCard.id)){reviewCard=due[0]||null;revealed=false;}
 if(!reviewCard){$('#reviewContent').innerHTML=`<div class="empty"><div class="eyebrow" style="justify-content:center"><span class="red-dot"></span> ALL CAUGHT UP</div><h2>Nothing due right now.</h2><p>${state.cards.length?'Come back later, or keep reading and collect something new.':'Select a word or phrase in the Russian text to make your first card.'}</p><button class="text-button" id="goRead">Back to reading →</button></div>`; $('#goRead').onclick=()=>showView('read'); return;}
 const c=reviewCard;
 $('#reviewContent').innerHTML=`<div class="review-wrap"><div class="review-meta"><span>YOUR DAILY PRACTICE</span><span>${due.length} DUE</span></div><div class="flashcard"><span class="kind">${c.kind==='grammar'?'GRAMMAR':'VOCABULARY'} · ${escapeHtml(c.chapterLabel||'')}</span><h2 lang="ru">${escapeHtml(c.term)}</h2>${revealed?`<div class="answer">${escapeHtml(c.meaning||'No meaning added yet.')}</div>${grammarText(c)?`<p class="grammar-summary">${escapeHtml(grammarText(c))}</p>`:''}<p class="context">${escapeHtml(c.context||'')}</p>`:'<p class="context">Can you recall what this means?</p>'}</div><div class="review-actions">${revealed?'<div class="ratings"><button data-rating="again">Again<small>1 min</small></button><button data-rating="hard">Hard<small>shorter interval</small></button><button data-rating="good">Good<small>growing interval</small></button><button data-rating="easy">Easy<small>longer interval</small></button></div>':'<button class="primary" id="reveal">Show answer <span>↓</span></button>'}</div></div>`;
 if(!revealed)$('#reveal').onclick=()=>{revealed=true;renderReview()}; else document.querySelectorAll('[data-rating]').forEach(b=>b.onclick=()=>rateCard(b.dataset.rating));
}
function rateCard(rating){ const c=reviewCard, day=86400000; c.ease=c.ease||2.5; if(rating==='again'){c.interval=0;c.due=Date.now()+60000;c.ease=Math.max(1.3,c.ease-.2);} else {if(rating==='hard'){c.interval=Math.max(1,Math.round((c.interval||1)*1.2));c.ease=Math.max(1.3,c.ease-.15);} if(rating==='good')c.interval=c.interval?Math.max(1,Math.round(c.interval*c.ease)):1; if(rating==='easy'){c.interval=c.interval?Math.max(4,Math.round(c.interval*c.ease*1.3)):4;c.ease+=.15;} c.due=Date.now()+c.interval*day;} save(); reviewCard=null;revealed=false;renderReview(); }
function renderCollection(){
 const cards=state.cards.filter(c=>filter==='all'||c.kind===filter).sort((a,b)=>(b.created||0)-(a.created||0));
 const counts={}; state.cards.filter(c=>c.kind==='grammar').forEach(c=>Object.values(c.grammar||{}).forEach(v=>counts[v]=(counts[v]||0)+1));
 $('#collectionContent').innerHTML=`<div class="collection-tools"><div class="filters"><button data-filter="all" class="${filter==='all'?'active':''}">All · ${state.cards.length}</button><button data-filter="vocab" class="${filter==='vocab'?'active':''}">Vocabulary · ${state.cards.filter(c=>c.kind==='vocab').length}</button><button data-filter="grammar" class="${filter==='grammar'?'active':''}">Grammar · ${state.cards.filter(c=>c.kind==='grammar').length}</button></div><div class="storage-tools"><button class="subtle-button" id="export">Export backup</button><button class="subtle-button" id="import">Import backup</button><input id="importFile" type="file" accept="application/json" hidden></div></div>${Object.keys(counts).length?`<div class="grammar-summary">YOUR GRAMMAR FORMS &nbsp; ${Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${escapeHtml(k)} (${v})`).join(' &nbsp; · &nbsp; ')}</div>`:''}<div class="collection-list">${cards.length?cards.map(c=>`<div class="card-row"><div><h3 lang="ru">${escapeHtml(c.term)}</h3><small>${c.kind==='grammar'?'GRAMMAR':'VOCABULARY'} · ${escapeHtml(c.chapterLabel||'')}</small></div><div><p>${escapeHtml(c.meaning||'No note added')}</p><small>${escapeHtml(grammarText(c))}</small></div><div class="card-actions"><button data-edit="${escapeHtml(c.id)}">Edit</button><button data-delete="${escapeHtml(c.id)}">Delete</button></div></div>`).join(''):'<div class="empty"><h2>Your notebook is waiting.</h2><p>Select Russian text while reading to save your first card.</p></div>'}</div>`;
 document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;renderCollection()});
 document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{if(confirm('Delete this card and its highlight?')){state.cards=state.cards.filter(c=>c.id!==b.dataset.delete);save();renderCollection();renderChapter();}});
 document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editCard(b.dataset.edit));
 $('#export').onclick=()=>{const blob=new Blob([JSON.stringify({version:1,cards:state.cards,chapter:state.chapter},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='war-peace-study-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
 $('#import').onclick=()=>$('#importFile').click(); $('#importFile').onchange=async e=>{try{const data=JSON.parse(await e.target.files[0].text());if(!Array.isArray(data.cards)||!data.cards.every(c=>c&&typeof c.term==='string'&&typeof c.id==='string'))throw Error();if(!confirm('Replace your current collection with this backup?'))return;state.cards=data.cards; if(Number.isInteger(data.chapter)&&data.chapter>=0&&data.chapter<chapters.length)state.chapter=data.chapter;pageStarts=[{ru:0,en:0}];pageIndex=0;save();renderCollection();renderChapter();toast('Backup imported');}catch{toast('Could not read that backup');}};
}
function editCard(id){
 const c=state.cards.find(x=>x.id===id);if(!c)return;
 selectionData={editId:id,chapter:c.chapter,paragraph:c.paragraph,start:c.start,end:c.end,context:c.context};
 $('#saveForm').reset(); $('#term').value=c.term; $('#meaning').value=c.meaning||'';
 document.querySelector(`input[name="kind"][value="${c.kind==='grammar'?'grammar':'vocab'}"]`).checked=true;
 $('#grammarFields').hidden=c.kind!=='grammar';
 for(const name of ['pos','case','number','gender','person','tense','conjugation','aspect']) $('#'+name).value=(c.grammar||{})[name]||'';
 $('#contextPreview').textContent=c.context||''; $('#lookupStatus').textContent=''; $('#grammarChoices').hidden=true; $('#saveDialog').showModal();
}
if (Array.isArray(window.BOOK_CHAPTERS) && window.BOOK_CHAPTERS.length) {
 chapters=window.BOOK_CHAPTERS;
 state.chapter=Math.max(0,Math.min(state.chapter,chapters.length-1));
 const savedPage=state.readingPage; if(savedPage?.chapter===state.chapter && Array.isArray(savedPage.starts) && savedPage.starts.length && Number.isInteger(savedPage.index) && savedPage.index>=0 && savedPage.index<savedPage.starts.length){if(savedPage.alignmentVersion===alignmentVersion()){pageStarts=savedPage.starts;pageIndex=savedPage.index;}else{const old=savedPage.starts[savedPage.index];pageStarts=[{ru:old.ru,en:alignedEnglishOffset(old.ru,chapters[state.chapter])}];pageIndex=0;}}
 document.body.classList.add('reading');
 $('#chapterSelect').innerHTML=chapters.map((c,i)=>`<option value="${i}">${escapeHtml(c.label)}</option>`).join('');
 renderChapter(); updateBadge();
} else {
 $('#russianText').textContent='The book data could not be loaded. Keep the data folder next to index.html.';
}
