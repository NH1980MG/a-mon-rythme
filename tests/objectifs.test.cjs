const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const target=path.join(__dirname,'../index.html');
const html=fs.existsSync(target)?fs.readFileSync(target,'utf8'):'';
const source=html.match(/<script id="core">([\s\S]*?)<\/script>/)?.[1]||'';
const box={}; vm.createContext(box);vm.runInContext(source+';globalThis.api=typeof Core!=="undefined"?Core:{}',box);
const api=box.api;
const plain=x=>JSON.parse(JSON.stringify(x));
function state(){return {version:2,theme:'soft',groups:[{id:'g',name:'Études',color:'#318268'}],tags:[{id:'t',name:'Devoir'}],goals:[{id:'a',title:'Réviser',groupId:'g',tagIds:['t'],done:false,priority:false,horizon:null,period:null,defaultDuration:null,templates:[{id:'m',title:'Révision',duration:45}]}],sessions:[]};}
test('normalise une plage inversée et conserve les dates locales',()=>{
 assert.equal(typeof api.normalizeRange,'function');
 assert.deepEqual(plain(api.normalizeRange('2026-11-02','2026-10-30')),{start:'2026-10-30',end:'2026-11-02'});
 assert.throws(()=>api.normalizeRange('2026-02-30','2026-03-02'));
});
test('limite les priorités à trois et permet de libérer une place',()=>{
 assert.equal(typeof api.togglePriority,'function');const s=state();
 s.goals=Array.from({length:4},(_,i)=>({...s.goals[0],id:String(i)}));
 for(let i=0;i<3;i++) assert.equal(api.togglePriority(s,String(i)),true);
 assert.equal(api.togglePriority(s,'3'),false);assert.equal(s.goals[3].priority,false);
 api.togglePriority(s,'1');assert.equal(api.togglePriority(s,'3'),true);
});
test('supprime un groupe sans perdre les objectifs ni les séances',()=>{
 assert.equal(typeof api.removeGroup,'function');const s=state();s.sessions=[{id:'s',goalId:'a'}];api.removeGroup(s,'g');
 assert.equal(s.groups.length,0);assert.equal(s.goals.length,1);assert.equal(s.goals[0].groupId,null);assert.equal(s.sessions.length,1);
});
test('supprime les attributions d’une étiquette sans supprimer l’objectif',()=>{
 assert.equal(typeof api.removeTag,'function');const s=state();api.removeTag(s,'t');assert.equal(s.tags.length,0);assert.equal(s.goals[0].tagIds.length,0);
});
test('valide et copie une sauvegarde complète',()=>{
 assert.equal(typeof api.validateImport,'function');const s=state();assert.deepEqual(plain(api.validateImport(s)),s);
 assert.notEqual(api.validateImport(s),s);
});
test('refuse sauvegardes invalides, références cassées et durées incorrectes',()=>{
 assert.equal(typeof api.validateImport,'function');
 for(const change of [s=>s.goals[0].tagIds=['absent'],s=>s.goals[0].horizon='2026-02-30',s=>s.goals[0].templates[0].duration=-1,s=>s.groups[0].color='red;display:none',s=>s.sessions=[{id:'x',goalId:'missing',title:'X',date:'2026-10-13',time:'09:00',duration:30}],s=>s.goals[0].done='oui']){
  const s=state();change(s);assert.throws(()=>api.validateImport(s));
 }
 assert.throws(()=>api.validateImport({version:2}));
});
test('regroupe les objectifs par étiquettes sans dupliquer les données',()=>{
 assert.equal(typeof api.buckets,'function');const s=state();s.tags.push({id:'u',name:'Technologie'});s.goals[0].tagIds.push('u');
 const b=api.buckets(s,'tag');assert.equal(b.length,2);assert.equal(b[0].goals[0].id,'a');assert.equal(b[1].goals[0].id,'a');assert.equal(s.goals.length,1);
});
test('classe sans groupe et sans horizon dans leurs rubriques',()=>{
 assert.equal(typeof api.buckets,'function');const s=state();s.goals[0].groupId=null;
 assert.equal(api.buckets(s,'group').some(b=>b.name==='Sans groupe'&&b.goals.length===1),true);
 assert.equal(api.buckets(s,'horizon')[0].name,'Long terme');
});
test('crée plusieurs séances en conservant le modèle',()=>{
 assert.equal(typeof api.createSession,'function');const s=state();
 api.createSession(s,{id:'s1',goalId:'a',title:'Révision',date:'2026-10-13',time:'09:00',duration:45});
 api.createSession(s,{id:'s2',goalId:'a',title:'Révision',date:'2026-10-14',time:'10:00',duration:45});
 assert.equal(s.sessions.length,2);assert.equal(s.goals[0].templates.length,1);
 assert.throws(()=>api.createSession(s,{id:'s3',goalId:'a',title:'X',date:'2026-10-13',time:'25:00',duration:0}));
});
test('déplace une séance sans changer la durée ni l’horizon',()=>{
 assert.equal(typeof api.moveSession,'function');const s=state();s.goals[0].period={start:'2026-10-12',end:'2026-10-16'};
 s.sessions=[{id:'s',goalId:'a',title:'Révision',date:'2026-10-13',time:'09:00',duration:45}];
 api.moveSession(s,'s','2026-10-14');assert.equal(s.sessions[0].date,'2026-10-14');assert.equal(s.sessions[0].duration,45);assert.equal(s.goals[0].period.end,'2026-10-16');
});
test('affiche les caractères HTML comme du texte',()=>{
 assert.equal(typeof api.escapeHTML,'function');assert.equal(api.escapeHTML('<img src=x onerror="x"> &'), '&lt;img src=x onerror=&quot;x&quot;&gt; &amp;');
});
test('signale un stockage indisponible sans perdre les données en mémoire',()=>{
 assert.equal(typeof api.persist,'function');const s=state();const fail={setItem(){throw Error('quota')}};
 assert.equal(api.persist(fail,'test',s),false);assert.equal(s.goals[0].title,'Réviser');
 let saved;assert.equal(api.persist({setItem(k,v){saved=JSON.parse(v)}},'test',s),true);assert.equal(saved.goals[0].id,'a');
});
