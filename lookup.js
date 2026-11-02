/* Browser-side lookups: no reading context is sent, only the selected text. */
'use strict';
let lookupSequence = 0;
const formTags = {
 nom:['case','Nominative'], acc:['case','Accusative'], gen:['case','Genitive'], dat:['case','Dative'], ins:['case','Instrumental'], pre:['case','Prepositional'], loc:['case','Prepositional'],
 s:['number','Singular'], p:['number','Plural'], m:['gender','Masculine'], f:['gender','Feminine'], n:['gender','Neuter'],
 '1':['person','1st person'], '2':['person','2nd person'], '3':['person','3rd person'], pres:['tense','Present'], past:['tense','Past'], fut:['tense','Future'], imp:['tense','Imperative'], inf:['tense','Infinitive'], cond:['tense','Conditional'], pf:['aspect','Perfective'], impf:['aspect','Imperfective']
};
function wiktionaryAnalyses(wikitext){
 const russian=wikitext.split(/^==Russian==\s*$/m)[1]?.split(/^==[^=]/m)[0];if(!russian)return [];
 const results=[];let pos='';
 for(const line of russian.split('\n')){
  const heading=line.match(/^===+\s*(Noun|Pronoun|Adjective|Verb|Participle|Adverb)\s*===+/i);
  if(heading)pos=heading[1][0].toUpperCase()+heading[1].slice(1).toLowerCase();
  const match=line.match(/\{\{(?:inflection of|infl of)\|ru\|([^|}]+)\|[^|}]*\|([^}]+)\}\}/i);if(!match)continue;
  const lemma=match[1].normalize('NFD').replace(/[\u0300\u0301]/g,'').normalize('NFC');
  for(const group of match[2].split('|;|')){
   let options=[{}];
   for(const part of group.split('|')){
    const alternatives=part.split('//').map(t=>formTags[t.trim()]).filter(Boolean);
    if(alternatives.length){const next=[];for(const option of options)for(const [field,value] of alternatives)next.push({...option,[field]:value});options=next;}
   }
   for(const fields of options){if(!Object.keys(fields).length)continue; if(['Noun','Pronoun','Adjective','Verb'].includes(pos)) fields.pos=pos;
    const label=[lemma,...Object.values(fields)].join(' · ');if(!results.some(r=>r.label===label))results.push({label,fields});
   }
  }
 }
 return results.slice(0,30);
}
function applyGrammar(fields){
 for(const name of ['pos','case','number','gender','person','tense','conjugation','aspect']) document.querySelector('#'+name).value=fields[name]||'';
}
async function lookupWord(term){
 const seq=++lookupSequence, status=document.querySelector('#lookupStatus'), choices=document.querySelector('#grammarChoices');
 status.textContent='Looking up the selected text online (MyMemory and Wiktionary)…';choices.hidden=true;choices.replaceChildren();
 const isRussian=/[А-Яа-яЁё]/.test(term), singleRussian=/^[А-Яа-яЁё]+$/.test(term);
 const params=new URLSearchParams({q:term,langpair:isRussian?'ru|en':'fr|en'});
 const translation=fetch('https://api.mymemory.translated.net/get?'+params,{signal:AbortSignal.timeout(12000)}).then(r=>{if(!r.ok)throw Error('translation');return r.json()}).then(x=>{if(x.responseStatus!==200 || !x.responseData?.translatedText)throw Error('translation');return x.responseData.translatedText});
 const dictionary=singleRussian ? fetch('https://en.wiktionary.org/w/api.php?'+new URLSearchParams({action:'query',prop:'revisions',rvprop:'content',rvslots:'main',titles:term.toLowerCase(),format:'json',origin:'*'}),{signal:AbortSignal.timeout(12000)}).then(r=>{if(!r.ok)throw Error('dictionary');return r.json()}).then(x=>{const page=Object.values(x.query?.pages||{})[0];return wiktionaryAnalyses(page?.revisions?.[0]?.slots?.main?.['*']||'')}) : Promise.resolve([]);
 const [t,d]=await Promise.allSettled([translation,dictionary]);
 if(seq!==lookupSequence || !document.querySelector('#saveDialog').open || document.querySelector('#term').value!==term)return;
 const notes=[];
 if(t.status==='fulfilled'){if(!document.querySelector('#meaning').value)document.querySelector('#meaning').value=t.value;notes.push('Translation suggested by MyMemory.');} else notes.push('Translation unavailable; add a meaning yourself.');
 if(d.status==='fulfilled' && d.value.length){
  const options=d.value; applyGrammar(options[0].fields);
  const label=document.createElement('label');label.textContent=options.length>1?'Possible forms — choose the reading that fits the sentence:':'Possible form from Wiktionary — check it against the sentence:';
  const select=document.createElement('select');select.setAttribute('aria-label','Possible grammar analyses');
  options.forEach((o,i)=>{const option=document.createElement('option');option.value=i;option.textContent=o.label;select.appendChild(option)});
  select.addEventListener('change',()=>applyGrammar(options[Number(select.value)].fields));choices.append(label,select);choices.hidden=false;
  notes.push('Grammar is a dictionary suggestion, not context-disambiguated.');
 } else if(singleRussian) notes.push('No grammar form found; classify it manually.');
 else notes.push('Grammar lookup works on one Russian word at a time.');
 status.textContent=notes.join(' ');
}
