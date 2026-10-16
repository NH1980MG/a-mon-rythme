const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),ctx={};vm.createContext(ctx);vm.runInContext(html.match(/<script id="core">([\s\S]*?)<\/script>/)[1]+';globalThis.api=Core',ctx);const api=ctx.api;
function group(){return {id:'h',name:'Routine',color:'#547e9b',anchorDate:'2026-10-12',patternDays:7,repeatEvery:7,endDate:null,slots:[{id:'m',title:'Japonais',dayOffset:0,time:'18:00',duration:30,description:''}],exceptions:[]};}
function state(){return {version:2,theme:'soft',groups:[],tags:[],goals:[],sessions:[],habitGroups:[group()]};}
test('un créneau du lundi se répète à la même heure chaque semaine',()=>{
 assert.equal(typeof api.habitOccurrences,'function');const rows=api.habitOccurrences(state(),'2026-10-01','2026-10-31');assert.deepEqual(Array.from(rows,x=>x.date),['2026-10-12','2026-10-19','2026-10-26']);assert.equal(rows.every(x=>x.time==='18:00'),true);
});
test('la longueur du motif et sa cadence sont indépendantes',()=>{
 const s=state();s.habitGroups[0].repeatEvery=14;s.habitGroups[0].slots.push({id:'w',title:'Lecture',dayOffset:2,time:'10:00',duration:20,description:''});assert.equal(typeof api.habitOccurrences,'function');assert.deepEqual(Array.from(api.habitOccurrences(s,'2026-10-01','2026-10-31'),x=>x.date),['2026-10-12','2026-10-14','2026-10-26','2026-10-28']);
});
test('un motif exceptionnel est appliqué une seule fois sur ses différents jours',()=>{
 const s=state();s.habitGroups[0].repeatEvery=null;s.habitGroups[0].slots.push({id:'w',title:'Lecture',dayOffset:6,time:'10:00',duration:20,description:''});assert.equal(typeof api.habitOccurrences,'function');assert.deepEqual(Array.from(api.habitOccurrences(s,'2026-10-01','2026-11-30'),x=>x.date),['2026-10-12','2026-10-18']);
});
test('la fin facultative est inclusive et la répétition reste sur les jours civils',()=>{
 const s=state();s.habitGroups[0].endDate='2026-10-26';assert.equal(typeof api.habitOccurrences,'function');assert.equal(api.habitOccurrences(s,'2026-10-01','2026-11-30').length,3);s.habitGroups[0].endDate=null;const rows=api.habitOccurrences(s,'2026-10-26','2026-11-09');assert.deepEqual(Array.from(rows,x=>x.date),['2026-10-26','2026-11-02','2026-11-09']);assert.ok(rows.every(x=>x.time==='18:00'));
});
test('déplacer une occurrence n’en déplace pas les suivantes et ne crée pas de doublon',()=>{
 assert.equal(typeof api.updateHabitOccurrence,'function');const s=state(),row=api.habitOccurrences(s,'2026-10-12','2026-10-12')[0];api.updateHabitOccurrence(s,row.id,{date:'2026-11-01',description:'Exception',done:true});assert.equal(api.habitOccurrences(s,'2026-10-12','2026-10-12').length,0);const moved=api.habitOccurrences(s,'2026-11-01','2026-11-01');assert.equal(moved.length,1);assert.equal(moved[0].done,true);assert.equal(moved[0].description,'Exception');assert.equal(api.habitOccurrences(s,'2026-10-19','2026-10-19').length,1);assert.equal(api.habitOccurrences(s,'2026-10-01','2026-11-10').filter(x=>x.id===row.id).length,1);
});
test('une occurrence annulée peut être rétablie',()=>{
 assert.equal(typeof api.resetHabitOccurrence,'function');const s=state(),row=api.habitOccurrences(s,'2026-10-12','2026-10-12')[0];api.updateHabitOccurrence(s,row.id,{skipped:true});assert.equal(api.habitOccurrences(s,'2026-10-12','2026-10-12').length,0);api.resetHabitOccurrence(s,row.id);assert.equal(api.habitOccurrences(s,'2026-10-12','2026-10-12').length,1);
});
test('les dérogations et la validation survivent à l’export/import',()=>{
 assert.equal(typeof api.habitOccurrences,'function');const s=state(),row=api.habitOccurrences(s,'2026-10-12','2026-10-12')[0];api.updateHabitOccurrence(s,row.id,{done:true});const imported=api.validateImport(JSON.parse(JSON.stringify(s)));assert.equal(api.habitOccurrences(imported,'2026-10-12','2026-10-12')[0].done,true);
});
test('les motifs et jours incohérents sont refusés à l’import',()=>{
 for(const change of [g=>g.patternDays=0,g=>g.repeatEvery=2,g=>g.slots[0].dayOffset=7,g=>g.anchorDate='2026-02-30',g=>g.slots[0].time='25:00',g=>g.slots[0].duration=0,g=>g.exceptions=[{slotId:'missing',cycleStart:'2026-10-12'}]]){const s=state();change(s.habitGroups[0]);assert.throws(()=>api.validateImport(s));}
});
test('une modification invalide d’occurrence ne change pas les données',()=>{
 assert.equal(typeof api.updateHabitOccurrence,'function');const s=state(),row=api.habitOccurrences(s,'2026-10-12','2026-10-12')[0],before=JSON.stringify(s);assert.throws(()=>api.updateHabitOccurrence(s,row.id,{time:'25:00'}));assert.equal(JSON.stringify(s),before);
});
test('modifier le rythme ne doit pas orpheliner les occurrences personnalisées',()=>{
 assert.equal(typeof api.saveHabitGroup,'function');const s=state(),row=api.habitOccurrences(s,'2026-10-12','2026-10-12')[0];api.updateHabitOccurrence(s,row.id,{done:true});const changed=JSON.parse(JSON.stringify(s.habitGroups[0]));changed.anchorDate='2026-10-13';const before=JSON.stringify(s);assert.throws(()=>api.saveHabitGroup(s,changed));assert.equal(JSON.stringify(s),before);changed.anchorDate='2026-10-12';changed.name='Nouveau nom';api.saveHabitGroup(s,changed);assert.equal(s.habitGroups[0].name,'Nouveau nom');
});
test('un import de dérogation ne peut pas remplacer l’identité ou la couleur d’une occurrence',()=>{
 const s=state(),row=api.habitOccurrences(s,'2026-10-12','2026-10-12')[0];api.updateHabitOccurrence(s,row.id,{done:true});Object.assign(s.habitGroups[0].exceptions[0],{id:'autre',kind:'session',color:'other'});const imported=api.validateImport(s),result=api.habitOccurrences(imported,'2026-10-12','2026-10-12')[0];assert.equal(result.id,row.id);assert.equal(result.kind,'habit');assert.equal(result.color,'#547e9b');
});
test('la limite de personnalisations ne peut pas produire une sauvegarde illisible',()=>{
 const s=state(),g=s.habitGroups[0];g.anchorDate='1900-01-01';g.patternDays=1;g.repeatEvery=1;g.exceptions=Array.from({length:10000},(_,i)=>({slotId:'m',cycleStart:new Date(Date.UTC(1900,0,1+i)).toISOString().slice(0,10),title:'Japonais',date:new Date(Date.UTC(1900,0,1+i)).toISOString().slice(0,10),time:'18:00',duration:30,description:'',done:true,skipped:false}));assert.doesNotThrow(()=>api.validateImport(s));const row=api.habitOccurrences(s,'2026-10-12','2026-10-12')[0],before=JSON.stringify(s);assert.throws(()=>api.updateHabitOccurrence(s,row.id,{done:true}),/limite|Limite/);assert.equal(JSON.stringify(s),before);api.updateHabitOccurrence(s,JSON.stringify(['h','m','1900-01-01']),{done:false});assert.equal(g.exceptions[0].done,false);assert.doesNotThrow(()=>api.validateImport(s));
});
