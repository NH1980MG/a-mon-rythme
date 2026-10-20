/* Account panel and Supabase bootstrap; the planner remains usable without this module. */
'use strict';
(() => {
 let bridge,controller,client,snapshot,locationInfo,config,authSequence=0,panelOpen=false,notice='',providers=null;
 const esc=s=>bridge.escape(String(s??''));
 const button=(action,label,disabled=false)=>`<button type="button" class="btn ${action==='account-google'?'primary':'quiet'}" data-action="${action}"${disabled?' disabled':''}>${label}</button>`;
 const isWeb=()=>['http:','https:'].includes(locationInfo?.protocol);
 function content(){
  const s=snapshot;
  if(!s?.user){const unavailable=!client||!isWeb();return `<p class="form-note">Retrouve tes objectifs et ton calendrier sur tes appareils.</p><div class="account-options">${button('account-google','Continuer avec Google',unavailable||providers?.google===false)}${button('account-discord','Continuer avec Discord',unavailable||providers?.discord===false)}</div>${!isWeb()?`<p class="notice">La connexion nécessite une adresse web. <a href="https://nh1980mg.github.io/a-mon-rythme/">Ouvrir la version en ligne</a>. Le mode sans compte reste disponible ici.</p>`:''}${notice?`<p class="notice" role="status">${esc(notice)}</p>`:''}<p class="form-note">Ces connexions utilisent ton identité et ton adresse e-mail. Tes messages Gmail et tes conversations Discord restent privés.</p>${button('close-modal','Continuer sans compte')}`;}
  const status={loading:'Chargement…',ready:s.pending?'Modifications à synchroniser':'Données synchronisées',saving:'Synchronisation…',offline:'Modifications à synchroniser',conflict:'Une autre version a été enregistrée',error:'Chargement du compte impossible'}[s.status]||'';
  return `<p class="form-note">Connecté avec <strong>${esc(s.user.email||'ton compte')}</strong></p><p role="status">${esc(status)}</p>${s.error||s.cacheError?`<p class="notice">${esc([s.error,s.cacheError].filter(Boolean).join(' '))}</p>`:''}${notice?`<p class="notice">${esc(notice)}</p>`:''}${s.guestAvailable?`<p class="form-note">Ce compte est vide. Tu peux y copier les objectifs du mode sans compte de ce navigateur.</p>${button('account-adopt','Copier mes données locales',s.status!=='ready')}`:''}<div class="account-options">${button('export','Exporter mes données')}${s.status==='conflict'?button('account-reload','Recharger la version en ligne'):''}${['offline','error'].includes(s.status)?button('account-retry','Réessayer'):''}${button('account-logout','Se déconnecter')}</div><p class="form-note">Chaque compte possède son espace. En cas de conflit, exporte ta copie avant de recharger la version en ligne.</p>`;
 }
 function open(){panelOpen=true;bridge.openDialog(content());}
 function showGuest(app,loc){bridge=app;locationInfo=loc;snapshot=null;open();}
 async function handle(action){
  if(action==='account'){open();return;}
  if(!controller){if(action!=='close-modal'){notice='Connexion indisponible pour le moment. Recharge la version en ligne.';open();}return;}
  notice='';
  try{
   if(['account-google','account-discord'].includes(action)){
    if(!isWeb())return;
    if(controller.getSnapshot().user)return;
    const provider=action==='account-google'?'google':'discord';
    const settingsResponse=await fetch(config.url+'/auth/v1/settings',{headers:{apikey:config.publishableKey},credentials:'omit'});
    if(!settingsResponse.ok)throw Error('provider settings unavailable');
    const settings=await settingsResponse.json();providers=settings.external||{};
    if(providers[provider]!==true){notice=(provider==='google'?'Google':'Discord')+' n’est pas encore activé pour ce site. La configuration doit être terminée dans Supabase.';open();return;}
    const result=await client.auth.signInWithOAuth({provider,options:{redirectTo:config.siteUrl}});
    if(result.error)throw Error('provider unavailable');
   }else if(action==='account-logout'){await controller.signOut();}
   else if(action==='account-adopt'){if(window.confirm('Copier les données du mode sans compte dans ce compte vide ?'))await controller.adoptGuest();}
   else if(action==='account-reload'){if(window.confirm('Abandonner les modifications non synchronisées et recharger la version en ligne ? Exporte une copie avant.'))await controller.reloadRemote();}
   else if(action==='account-retry')await controller.retry();
  }catch{notice='Cette action n’a pas abouti. Vérifie la connexion ou la configuration Google/Discord, puis réessaie. Aucune donnée distante n’a été écrasée.';}
  if(panelOpen)open();
 }
 function start(supabaseClient,app,loc,settings){
  bridge=app;client=supabaseClient;locationInfo=loc;config=settings;notice='';providers=null;
  controller=globalThis.RythmeAccounts.createAccountController({client,storage:bridge.getStorage(),validate:bridge.validate,makeEmpty:bridge.makeEmpty,onChange(s){
   panelOpen=panelOpen&&bridge.isAccountDialogOpen();
   const previousId=snapshot?.user?.id;snapshot=s;
   if(previousId!==s.user?.id)panelOpen=false;
   bridge.applyAccountSnapshot(s);if(panelOpen)open();
  }});
  bridge.setAccountSink(data=>controller.edit(data));
  return controller;
 }
 function loadSDK(){
  if(window.supabase?.createClient)return Promise.resolve(window.supabase);
  return new Promise((resolve,reject)=>{
   const script=document.createElement('script'),timer=setTimeout(()=>reject(Error('SDK unavailable')),12000);
   script.src='vendor/supabase.js';script.async=true;
   script.onload=()=>{clearTimeout(timer);window.supabase?.createClient?resolve(window.supabase):reject(Error('SDK unavailable'));};
   script.onerror=()=>{clearTimeout(timer);reject(Error('SDK unavailable'));};document.head.appendChild(script);
  });
 }
 async function bootstrap(app,loc,settings){
  bridge=app;locationInfo=loc;config=settings;
  if(!isWeb()||!settings){showGuest(app,loc);app.closeDialog();panelOpen=false;return;}
  const expected=new URL(settings.siteUrl),here=loc.origin+loc.pathname;
  if(here!==expected.href&&here!==expected.href+'index.html'){
   notice='Pour te connecter, utilise l’adresse officielle du site.';return;
  }
  let authWatch;app.applyAccountSnapshot({user:null,status:'loading',data:app.makeEmpty(),pending:false,error:'',cacheError:''});
  try{
   const sdk=await loadSDK();
   const sdkClient=sdk.createClient(settings.url,settings.publishableKey,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true,storageKey:'rythme-auth-gsfwvaeyrufppausqdnr'}});
   const ctrl=start(sdkClient,app,loc,settings);
   authWatch=sdkClient.auth.onAuthStateChange((_event,session)=>{const sequence=++authSequence;setTimeout(()=>{if(sequence===authSequence)void ctrl.setSession(session);},0);});
   const sequence=authSequence;const result=await sdkClient.auth.getSession();
   if(result.error)throw result.error;if(sequence===authSequence)await ctrl.setSession(result.data.session);
   if(new URLSearchParams(loc.search||'').has('error')||new URLSearchParams((loc.hash||'').slice(1)).has('error')){
    notice='La connexion a été annulée ou refusée. Tu peux réessayer.';open();
   }
  }catch{
   authSequence++;authWatch?.data?.subscription?.unsubscribe();
   if(!controller?.getSnapshot().user){controller=null;client=null;snapshot=null;app.setAccountSink(null);app.applyAccountSnapshot({user:null,status:'guest',data:app.getGuestData(),pending:false,error:'Connexion aux comptes indisponible. Le mode sans compte reste utilisable.',cacheError:''});}
   else{const current=controller.getSnapshot();app.applyAccountSnapshot({...current,status:'error',error:'La session ne peut pas être vérifiée. Recharge le site ou réessaie plus tard.'});}
   notice='Connexion indisponible. Vérifie le réseau puis recharge le site.';
  }
 }
 const api={start,handle,showGuest,bootstrap};globalThis.RythmeAccountUI=window.RythmeAccountUI=api;
 if(window.RythmeApp&&typeof location!=='undefined')void bootstrap(window.RythmeApp,location,globalThis.RythmeSupabaseConfig);
})();
