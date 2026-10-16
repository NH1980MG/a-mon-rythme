const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),ctx={};vm.createContext(ctx);vm.runInContext(html.match(/<script id="core">([\s\S]*?)<\/script>/)[1]+';globalThis.api=Core',ctx);const api=ctx.api,plain=x=>JSON.parse(JSON.stringify(x));
function state(){return {version:2,theme:'soft',groups:[],tags:[],goals:[{id:'g',title:'Japonais',groupId:null,tagIds:[],done:false,priority:false,horizon:'2026-12-31',period:{start:'2026-10-01',end:'2026-10-31'},defaultDuration:null,templates:[]}],sessions:[]};}
const session=(id='s',date='2026-10-10')=>({id,goalId:'g',title:'Japonais',date,time:'09:00',duration:30,done:false});
test('migre les anciennes plages en périodes et conserve les modèles et séances hors plage',()=>{
 assert.equal(typeof api.migrate,'function');const old=state();old.version=1;delete old.theme;const g=old.goals[0];g.horizon=g.period;delete g.period;delete g.defaultDuration;g.templates=[{id:'t',title:'Vocabulaire',duration:20}];old.sessions=[session('s','2026-11-01')];delete old.sessions[0].done;
 const next=api.migrate(old);assert.equal(next.version,2);assert.equal(next.goals[0].horizon,null);assert.equal(next.goals[0].period.end,'2026-10-31');assert.equal(next.goals[0].templates[0].title,'Vocabulaire');assert.equal(next.sessions[0].date,'2026-11-01');assert.equal(next.sessions[0].legacyOutside,true);assert.equal(next.sessions[0].done,false);assert.equal(old.version,1);assert.doesNotThrow(()=>api.validateImport(next));
});
test('un objectif sans aucune planification est valide',()=>{
 const s=state();s.goals[0].horizon=null;s.goals[0].period=null;assert.equal(api.validateImport(s).goals[0].period,null);
});
test('le classement par horizon utilise la date cible et pas la période',()=>{
 const s=state();assert.equal(api.buckets(s,'horizon')[0].name,'2026-12-31');
});
test('une séance respecte les bornes inclusives sans changer les dates de l’objectif',()=>{
 const s=state();api.createSession(s,session('a','2026-10-01'));api.createSession(s,session('b','2026-10-31'));assert.throws(()=>api.createSession(s,session('c','2026-11-01')),/période/);assert.equal(s.sessions.length,2);assert.equal(s.goals[0].horizon,'2026-12-31');
 const before=JSON.stringify(s);assert.throws(()=>api.moveSession(s,'a','2026-09-30'),/période/);assert.equal(JSON.stringify(s),before);
});
test('une période excluant une séance est refusée sans modification',()=>{
 assert.equal(typeof api.setPeriod,'function');const s=state();s.sessions=[session()];const before=JSON.stringify(s);assert.throws(()=>api.setPeriod(s,'g',{start:'2026-10-20',end:'2026-10-31'}),/Japonais/);assert.equal(JSON.stringify(s),before);api.setPeriod(s,'g',null);assert.equal(s.goals[0].period,null);
});
test('les compteurs ne comptent que les séances placées dont les effectuées',()=>{
 assert.equal(typeof api.sessionCounts,'function');const s=state();s.goals[0].templates=[{id:'t',title:'Modèle',duration:30}];assert.deepEqual(plain(api.sessionCounts(s,'g')),{placed:0,done:0});api.createSession(s,session());assert.deepEqual(plain(api.sessionCounts(s,'g')),{placed:1,done:0});s.sessions[0].done=true;api.moveSession(s,'s','2026-10-20');assert.deepEqual(plain(api.sessionCounts(s,'g')),{placed:1,done:1});s.sessions=[];assert.equal(api.sessionCounts(s,'g').placed,0);
});
test('le thème est validé et conservé dans les sauvegardes',()=>{
 const s=state();s.theme='colorful';assert.equal(api.validateImport(s).theme,'colorful');s.theme='unknown';assert.throws(()=>api.validateImport(s));
});
test('les couleurs de texte gardent un contraste lisible pour les groupes extrêmes',()=>{
 assert.equal(typeof api.colorTokens,'function');for(const c of ['#ffffff','#000000','#ffff00','#0000ff','#69825a']){const t=api.colorTokens(c);assert.match(t.ink,/^#[a-f\d]{6}$/i);assert.match(t.tint,/^#[a-f\d]{6}$/i);assert.ok(t.contrast>=4.5,`${c}: ${t.contrast}`);assert.match(t.accent,/^#[a-f\d]{6}$/i);assert.ok(t.contrastSoft>=4.5,`${c}: ${t.contrastSoft}`);}
});
