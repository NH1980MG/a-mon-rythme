const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),ctx={};vm.createContext(ctx);vm.runInContext(html.match(/<script id="core">([\s\S]*?)<\/script>/)[1]+';globalThis.api=Core',ctx);const api=ctx.api;
function state(){return {version:2,theme:'soft',groups:[],tags:[],goals:[{id:'g',title:'Japonais',groupId:null,tagIds:[],done:false,priority:false,horizon:null,period:null,defaultDuration:null,templates:[]}],sessions:[]};}
test('terminer un objectif crée un bilan non présumé et daté',()=>{
 assert.equal(typeof api.setGoalDone,'function');const s=state();api.setGoalDone(s,'g',true,'2026-10-14T12:00:00.000Z');assert.equal(s.goals[0].done,true);assert.equal(s.goals[0].completion.percent,null);assert.equal(s.goals[0].completion.alignment,null);assert.equal(s.goals[0].completion.completedAt,'2026-10-14T12:00:00.000Z');assert.doesNotThrow(()=>api.validateImport(s));
});
test('accepte les cinq pourcentages et les quatre états indépendants',()=>{
 assert.equal(typeof api.recordCompletion,'function');const s=state();s.goals[0].done=true;
 for(const p of [20,25,50,75,100])for(const a of ['exactly','mostly','slightly','not-at-all']){api.recordCompletion(s,'g',p,a);assert.equal(s.goals[0].completion.percent,p);assert.equal(s.goals[0].completion.alignment,a);assert.doesNotThrow(()=>api.validateImport(s));}
 const before=JSON.stringify(s);assert.throws(()=>api.recordCompletion(s,'g',33,'exactly'));assert.equal(JSON.stringify(s),before);assert.throws(()=>api.recordCompletion(s,'g',100,'other'));
});
test('l’historique trie les objectifs terminés et permet de reprendre sans perdre les séances',()=>{
 assert.equal(typeof api.completedGoals,'function');const s=state();s.goals.push({...s.goals[0],id:'b',title:'Lecture'});api.setGoalDone(s,'g',true,'2026-10-13T12:00:00.000Z');api.setGoalDone(s,'b',true,'2026-10-14T12:00:00.000Z');assert.equal(api.completedGoals(s)[0].id,'b');s.sessions=[{id:'s',goalId:'b'}];api.setGoalDone(s,'b',false);assert.equal(api.completedGoals(s).length,1);assert.equal(s.sessions.length,1);
});
test('un ancien objectif terminé reste sans date ni bilan inventés',()=>{
 const s=state();s.goals[0].done=true;const imported=api.validateImport(s);assert.equal(imported.goals[0].completion,undefined);
 assert.equal(typeof api.completedGoals,'function');assert.equal(api.completedGoals(imported).length,1);
});
test('les imports refusent les bilans et descriptions mal formés',()=>{
 const s=state();s.goals[0].completion={completedAt:null,percent:33,alignment:'exactly'};assert.throws(()=>api.validateImport(s));delete s.goals[0].completion;s.sessions=[{id:'s',goalId:'g',title:'Révision',date:'2026-10-14',time:'09:00',duration:30,done:false,description:42}];assert.throws(()=>api.validateImport(s));s.sessions[0].description='a'.repeat(5001);assert.throws(()=>api.validateImport(s));s.sessions[0].description='Une description\navec des étapes.';assert.equal(api.validateImport(s).sessions[0].description,s.sessions[0].description);
});
test('les anciennes priorités terminées ne bloquent pas les trois priorités actives',()=>{
 const s=state();s.goals.push(...Array.from({length:3},(_,i)=>({...s.goals[0],id:'old'+i,done:true,priority:true})));assert.doesNotThrow(()=>api.validateImport(s));assert.equal(api.togglePriority(s,'g'),true);assert.doesNotThrow(()=>api.validateImport(s));api.setGoalDone(s,'old0',false);assert.equal(s.goals[1].priority,false);
});
