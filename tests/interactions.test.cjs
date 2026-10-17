// Integration tests execute the real scripts and event handlers without a browser.
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function boot(initial,broken=false){
 const stored=new Map(initial?[['a-mon-rythme-v1',JSON.stringify(initial)]]:[]),listeners={},nodes={},downloads=[];
 function node(id){return nodes[id]??= {style:{},classList:{toggle(){},add(){},remove(){}},setAttribute(){},removeAttribute(){},scrollIntoView(){},innerHTML:'',textContent:'',hidden:true,dataset:{},open:false,addEventListener(type,fn){this[type]=fn},querySelector(){return null},showModal(){this.open=true},close(){this.open=false},click(){},focus(){},getBoundingClientRect(){return {left:0,right:500,top:0,bottom:500}}};}
 const storage={getItem:k=>{if(broken)throw Error('blocked');return stored.get(k)||null},setItem:(k,v)=>{if(broken)throw Error('blocked');stored.set(k,v)}};
 const document={body:node('body'),documentElement:node('html'),activeElement:null,controls:[],querySelector:node,querySelectorAll:q=>q==='[data-action]'?document.controls:[],getElementById:id=>node('#'+id),addEventListener:(type,fn)=>listeners[type]=fn,createElement:()=>({click(){downloads.push({href:this.href,name:this.download})}})};
 class FormData{constructor(f){this.fields=f.fields}get(k){const v=this.fields[k];return Array.isArray(v)?v[0]:v??null}getAll(k){const v=this.fields[k];return v===undefined?[]:Array.isArray(v)?v:[v]}}
 const context={document,window:{localStorage:storage},crypto:{randomUUID:()=>require('node:crypto').randomUUID()},matchMedia:()=>({matches:false}),setTimeout:()=>0,clearTimeout(){},confirm:()=>true,FormData,Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},console};
 vm.createContext(context);for(const [,s] of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))vm.runInContext(s,context);
 function click(action,dataset={},extra={}){const button={dataset:{action,...dataset},...extra};listeners.click({preventDefault(){},target:{closest:q=>q==='[data-action]'?button:null}})}
 function submit(kind,fields,dataset={}){listeners.submit({preventDefault(){},target:{id:'edit-form',dataset:{kind,id:'',...dataset},fields}})}
 return {click,submit,node,listeners,storage,downloads,document,data:()=>JSON.parse(stored.get('a-mon-rythme-v1')),view:()=>node('#view').innerHTML};
}
test('démarre avec un calendrier et une liste vide sans dépendance distante',()=>{
 const app=boot();assert.match(app.view(),/Mon calendrier/);assert.match(app.view(),/Tout commence ici/);assert.equal(app.data().goals.length,0);
 assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+href=["'](?:https?:)?\/\//);
});
test('crée un objectif et choisit sa période avec deux clics puis validation dans le calendrier',()=>{
 const app=boot();app.submit('goal',{title:'Mon <objectif>',groupId:'etudes',tags:['tech']});const id=app.data().goals[0].id;
 assert.match(app.view(),/Mon &lt;objectif&gt;/);app.click('range',{id});app.click('day',{date:'2026-10-29'});app.click('day',{date:'2026-10-20'});
 assert.equal(app.data().goals[0].period,null);app.click('apply-range');assert.deepEqual(app.data().goals[0].period,{start:'2026-10-20',end:'2026-10-29'});assert.equal(app.data().goals[0].horizon,null);
 app.click('done',{id},{checked:true});assert.equal(app.data().goals[0].done,true);
 const reload=boot(app.data());assert.equal(reload.data().goals[0].done,true);reload.click('tab',{tab:'history'});assert.match(reload.view(),/Mon &lt;objectif&gt;/);
});
test('planifie un modèle glissé puis déplace sa séance sans toucher au modèle',()=>{
 const app=boot();app.submit('goal',{title:'Lecture',groupId:'perso'});const goalId=app.data().goals[0].id;
 app.submit('template',{title:'Lire',duration:'20'},{goal:goalId});const templateId=app.data().goals[0].templates[0].id;
 const transfer={setData(){}};
 app.listeners.dragstart({target:{closest:()=>({dataset:{drag:'template',goal:goalId,id:templateId}})},dataTransfer:transfer});
 app.listeners.drop({preventDefault(){},target:{closest:()=>({dataset:{date:'2026-10-15'},classList:{remove(){}}})}});
 assert.equal(app.node('#modal').open,true);assert.match(app.node('#modal').innerHTML,/2026-10-15/);
 app.submit('session',{goalId,title:'Lire',date:'2026-10-15',time:'09:30',duration:'20'});
 const sessionId=app.data().sessions[0].id;
 app.listeners.dragstart({target:{closest:()=>({dataset:{drag:'session',id:sessionId}})},dataTransfer:transfer});
 app.listeners.drop({preventDefault(){},target:{closest:()=>({dataset:{date:'2026-10-18'},classList:{remove(){}}})}});
 assert.equal(app.data().sessions[0].date,'2026-10-18');assert.equal(app.data().goals[0].templates.length,1);assert.equal(app.data().goals[0].horizon,null);
});
test('gère groupes, étiquettes et changement de classement',()=>{
 const app=boot();app.submit('group',{name:'Travail',color:'#547e9b'});app.submit('tag',{name:'Important'});
 const s=app.data(),group=s.groups.at(-1),tag=s.tags.at(-1);app.submit('goal',{title:'Projet',groupId:group.id,tags:[tag.id]});
 app.listeners.change({target:{id:'grouping',value:'tag'}});assert.match(app.view(),/Important/);
 app.click('delete-group',{id:group.id});assert.equal(app.data().goals[0].groupId,null);
 app.click('delete-tag',{id:tag.id});assert.deepEqual(app.data().goals[0].tagIds,[]);
});
test('un import invalide ne remplace pas les données et l’export reste disponible',async()=>{
 const app=boot();app.submit('goal',{title:'À conserver',groupId:''});const before=app.data();
 await app.node('#import-file').change({target:{files:[{size:20,text:async()=>'{"version":2}'}],value:'fake'}});
 assert.deepEqual(app.data(),before);assert.match(app.node('#toast').textContent,/invalide/);
 app.click('export');assert.match(app.downloads[0].name,/a-mon-rythme-.*\.json/);
});
test('un stockage bloqué laisse créer et exporter les objectifs',()=>{
 const app=boot(undefined,true);assert.equal(app.node('#storage-warning').hidden,false);
 assert.equal(app.node('#save-status').innerHTML,'À exporter');
 app.submit('goal',{title:'Sans stockage',groupId:''});assert.match(app.view(),/Sans stockage/);
 app.click('export');assert.equal(app.downloads.length,1);
});
test('le focus reste sur la vue semaine et sur une étoile dont le style change',()=>{
 const app=boot();
 const control=(dataset,className)=>({dataset,className,closest:()=>null,focus(){this.focused=true}});
 app.document.activeElement=control({action:'calendar-view',mode:'week'},'');
 const month=control({action:'calendar-view',mode:'month'},''),week=control({action:'calendar-view',mode:'week'},'active');app.document.controls=[month,week];
 app.click('calendar-view',{mode:'week'});assert.equal(week.focused,true);assert.equal(month.focused,undefined);
 app.submit('goal',{title:'Priorité',groupId:''});const id=app.data().goals[0].id;
 app.document.activeElement=control({action:'priority',id},'icon-btn star');const star=control({action:'priority',id},'icon-btn star on');app.document.controls=[star];
 app.click('priority',{id});assert.equal(star.focused,true);
});
test('sépare horizon et période et conserve les deux thèmes après rechargement',()=>{
 const app=boot();app.submit('goal',{title:'Japonais',horizon:'2026-12-31',periodStart:'2026-10-01',periodEnd:'2026-10-31'});
 assert.equal(app.data().goals[0].horizon,'2026-12-31');assert.equal(app.data().goals[0].period.start,'2026-10-01');
 app.click('theme',{theme:'colorful'});assert.equal(app.data().theme,'colorful');assert.equal(boot(app.data()).data().theme,'colorful');
});
test('le menu compte les séances placées et effectuées sans quantité à prévoir',()=>{
 const app=boot();app.submit('goal',{title:'Japonais'});const id=app.data().goals[0].id;app.click('sessions',{id});
 assert.match(app.node('#session-drawer').innerHTML,/0 placée/);app.submit('session',{goalId:id,title:'Vocabulaire',date:'2026-10-20',time:'09:00',duration:'30'});
 const sid=app.data().sessions[0].id;app.click('session-done',{id:sid},{checked:true});assert.equal(app.data().sessions[0].done,true);assert.match(app.node('#session-drawer').innerHTML,/1 effectuée/);
 app.click('delete-session',{id:sid});assert.match(app.node('#session-drawer').innerHTML,/0 placée/);
});
test('la sélection de période peut être annulée sans modifier les données',()=>{
 const app=boot();app.submit('goal',{title:'Lecture'});const id=app.data().goals[0].id,before=app.data();app.click('range',{id});app.click('day',{date:'2026-10-12'});app.click('day',{date:'2026-10-30'});app.click('cancel-range');assert.deepEqual(app.data(),before);
});
test('le brouillon survit à la sélection du calendrier et reste non enregistré',()=>{
 const app=boot();app.click('new-goal');app.node('#edit-form').dataset={id:''};app.node('#edit-form').fields={title:'Brouillon japonais',groupId:'etudes',tags:['tech'],horizon:'2026-12-31',defaultDuration:'45'};
 app.click('draft-period');app.click('day',{date:'2026-10-01'});app.click('day',{date:'2026-10-31'});app.click('apply-range');
 assert.equal(app.data().goals.length,0);assert.equal(app.node('#modal').open,true);assert.match(app.node('#modal').innerHTML,/Brouillon japonais/);assert.match(app.node('#modal').innerHTML,/2026-10-31/);assert.match(app.node('#modal').innerHTML,/2026-12-31/);
});
test('le rectangle souris produit une plage continue temporaire puis validée',()=>{
 const app=boot();app.submit('goal',{title:'Japonais'});const id=app.data().goals[0].id;app.click('range',{id});
 const first={dataset:{date:'2026-10-05'}},last={dataset:{date:'2026-10-23'}};
 app.listeners.pointerdown({pointerType:'mouse',button:0,clientX:100,clientY:100,target:{closest:q=>q==='.day'?first:null}});
 app.document.elementFromPoint=()=>({closest:()=>last});app.listeners.pointermove({clientX:250,clientY:220,preventDefault(){}});
 assert.equal(app.node('#selection-rectangle').hidden,false);assert.equal(app.node('#selection-rectangle').style.width,'150px');assert.equal(app.data().goals[0].period,null);
 app.listeners.pointerup();app.click('apply-range');assert.deepEqual(app.data().goals[0].period,{start:'2026-10-05',end:'2026-10-23'});assert.equal(app.node('#range-shade').hidden,true);
});
test('annuler la sélection rouvre le brouillon avec sa période initiale',()=>{
 const app=boot();app.click('new-goal');app.node('#edit-form').dataset={id:''};app.node('#edit-form').fields={title:'À garder',periodStart:'2026-10-02',periodEnd:'2026-10-15'};app.click('draft-period');app.click('day',{date:'2026-11-01'});app.click('cancel-range');assert.match(app.node('#modal').innerHTML,/À garder/);assert.match(app.node('#modal').innerHTML,/2026-10-15/);assert.doesNotMatch(app.node('#modal').innerHTML,/2026-11-01/);
});
test('une modification de période en conflit ne remplace pas l’objectif',()=>{
 const app=boot();app.submit('goal',{title:'Japonais',periodStart:'2026-10-01',periodEnd:'2026-10-31'});const id=app.data().goals[0].id;app.submit('session',{goalId:id,title:'Vocabulaire',date:'2026-10-15',time:'09:00',duration:'30'});const before=app.data();
 app.submit('goal',{title:'Nouveau nom',periodStart:'2026-10-20',periodEnd:'2026-10-31'},{id});assert.deepEqual(app.data(),before);assert.match(app.node('#form-error').textContent,/Vocabulaire/);
});
test('le démarrage conserve une copie du format précédent avant migration',()=>{
 const old={version:1,groups:[],tags:[],goals:[{id:'g',title:'Ancien objectif',groupId:null,tagIds:[],horizon:{start:'2026-10-01',end:'2026-10-31'},done:false,priority:false,templates:[]}],sessions:[{id:'s',goalId:'g',title:'Ancienne séance',date:'2026-11-01',time:'09:00',duration:30}]};
 const app=boot(old);assert.deepEqual(JSON.parse(app.storage.getItem('a-mon-rythme-v1-backup-v1')),old);assert.equal(app.data().version,2);assert.equal(app.data().goals[0].horizon,null);assert.equal(app.data().sessions[0].legacyOutside,true);assert.match(app.view(),/1 hors période/);
});
test('restaure un ancien export en mémoire même quand le stockage est indisponible',async()=>{
 const old={version:1,groups:[],tags:[],goals:[{id:'g',title:'Japonais restauré',groupId:null,tagIds:[],horizon:null,done:false,priority:false,templates:[]}],sessions:[]};
 const app=boot(undefined,true);await app.node('#import-file').change({target:{files:[{size:200,text:async()=>JSON.stringify(old)}],value:'old.json'}});
 assert.match(app.view(),/Japonais restauré/);assert.equal(app.node('#storage-warning').hidden,false);assert.equal(app.node('#save-status').innerHTML,'À exporter');app.click('export');assert.equal(app.downloads.length,1);
});
test('l’historique sauvegarde le pourcentage et les quatre niveaux de conformité',()=>{
 const app=boot();app.submit('goal',{title:'Japonais'});const id=app.data().goals[0].id;app.click('done',{id},{checked:true});assert.match(app.node('#modal').innerHTML,/Bilan/);assert.equal(app.data().goals[0].completion.percent,null);
 app.submit('completion',{percent:'75',alignment:'mostly'},{id});assert.equal(app.data().goals[0].completion.percent,75);app.click('tab',{tab:'history'});assert.match(app.view(),/75 %/);assert.match(app.view(),/Plutôt conforme/);app.click('resume-goal',{id});assert.equal(app.data().goals[0].done,false);assert.doesNotMatch(app.view(),/data-history-goal=/);
});
test('une description de séance se modifie depuis le calendrier et survit au rechargement',()=>{
 const app=boot();app.submit('goal',{title:'Japonais'});const goalId=app.data().goals[0].id;app.submit('session',{goalId,title:'Vocabulaire',date:'2026-10-14',time:'09:00',duration:'30',description:'<script>danger</script>\nÉtape 1'});const id=app.data().sessions[0].id;
 const reload=boot(app.data());reload.click('edit-session',{id});assert.match(reload.node('#modal').innerHTML,/name="description"/);assert.match(reload.node('#modal').innerHTML,/&lt;script&gt;danger&lt;\/script&gt;/);reload.submit('session',{goalId,title:'Vocabulaire',date:'2026-10-14',time:'09:00',duration:'30',description:'Nouvelle description'},{id});assert.equal(reload.data().sessions[0].description,'Nouvelle description');
});
test('le panneau Études contient dix sources et explique les possibilités réelles de l’outil',()=>{
 const app=boot();app.click('tab',{tab:'studies'});assert.equal((app.view().match(/data-study=/g)||[]).length,10);assert.equal((app.view().match(/class="study-source"/g)||[]).length,10);assert.match(app.view(),/Dans À mon rythme/);assert.match(app.view(),/ne peut pas bloquer/);app.click('study-filter',{category:'learning'});assert.equal((app.view().match(/data-study=/g)||[]).length,4);
});
test('le filtre d’études sélectionné garde le focus au clavier',()=>{
 const app=boot();app.click('tab',{tab:'studies'});const control=category=>({dataset:{action:'study-filter',category},closest:()=>null,focus(){this.focused=true}});app.document.activeElement=control('learning');const all=control('all'),learning=control('learning');app.document.controls=[all,learning];app.click('study-filter',{category:'learning'});assert.equal(learning.focused,true);assert.equal(all.focused,undefined);
});
test('une ancienne séance hors période accepte une description sans être déplacée',()=>{
 const old={version:1,groups:[],tags:[],goals:[{id:'g',title:'Ancien objectif',groupId:null,tagIds:[],horizon:{start:'2026-10-01',end:'2026-10-10'},done:false,priority:false,templates:[]}],sessions:[{id:'s',goalId:'g',title:'Ancienne séance',date:'2026-10-14',time:'09:00',duration:30}]};const app=boot(old);app.click('edit-session',{id:'s'});app.submit('session',{goalId:'g',title:'Ancienne séance',date:'2026-10-14',time:'09:00',duration:'30',description:'Notes conservées'},{id:'s'});assert.equal(app.data().sessions[0].description,'Notes conservées');assert.equal(app.data().sessions[0].date,'2026-10-14');assert.equal(app.data().sessions[0].legacyOutside,true);
});
test('crée un groupe hebdomadaire et son créneau du lundi à heure fixe',()=>{
 const app=boot();app.click('tab',{tab:'habits'});app.submit('habit-group',{name:'Routine du lundi',color:'#69825a',anchorDate:'2026-10-12',patternDays:'7',mode:'repeat',repeatCount:'1',repeatUnit:'7',endDate:''});
 const id=app.data().habitGroups[0].id;app.submit('habit-slot',{title:'Japonais',dayOffset:'0',time:'18:00',duration:'45',description:'Révision'},{habit:id});assert.equal(app.data().habitGroups[0].slots.length,1);
 app.click('tab',{tab:'goals'});assert.match(app.view(),/Japonais/);assert.match(app.view(),/18:00/);assert.match(app.view(),/edit-habit-occurrence/);assert.equal(app.data().sessions.length,0);
});
test('cocher et modifier une occurrence d’habitude reste persistant sans créer un objectif',()=>{
 const app=boot();app.submit('habit-group',{name:'Routine',color:'#69825a',anchorDate:'2026-10-12',patternDays:'7',mode:'repeat',repeatCount:'1',repeatUnit:'7'});const gid=app.data().habitGroups[0].id;app.submit('habit-slot',{title:'Japonais',dayOffset:'0',time:'18:00',duration:'30',description:''},{habit:gid});const slot=app.data().habitGroups[0].slots[0],key=JSON.stringify([gid,slot.id,'2026-10-12']);app.click('habit-done',{id:key},{checked:true});assert.equal(app.data().habitGroups[0].exceptions[0].done,true);
 app.click('edit-habit-occurrence',{id:key});assert.match(app.node('#modal').innerHTML,/18:00/);app.submit('habit-occurrence',{title:'Révision spéciale',date:'2026-10-13',time:'19:00',duration:'45',description:'Notes',done:'on'},{id:key});const reload=boot(app.data());assert.equal(reload.data().habitGroups[0].exceptions[0].date,'2026-10-13');assert.equal(reload.data().goals.length,0);reload.click('reset-habit-occurrence',{id:key});assert.equal(reload.data().habitGroups[0].exceptions.length,0);
});
test('le mode exceptionnel et la fréquence personnalisée se configurent dans le groupe',()=>{
 const app=boot();app.submit('habit-group',{name:'Exception',color:'#69825a',anchorDate:'2026-10-12',patternDays:'3',mode:'once'});assert.equal(app.data().habitGroups[0].repeatEvery,null);app.submit('habit-group',{name:'Deux semaines',color:'#69825a',anchorDate:'2026-10-12',patternDays:'7',mode:'repeat',repeatCount:'2',repeatUnit:'7'});assert.equal(app.data().habitGroups[1].repeatEvery,14);assert.equal(app.data().habitGroups[1].patternDays,7);
});
