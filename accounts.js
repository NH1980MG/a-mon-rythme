/* Account state and synchronization. No DOM, OAuth credentials or session tokens. */
'use strict';
globalThis.RythmeAccounts = (() => {
 const GUEST_KEY='a-mon-rythme-v1', CACHE_PREFIX='a-mon-rythme-account:';
 const copy=x=>JSON.parse(JSON.stringify(x));
 const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
 function createAccountController({client,storage,validate,makeEmpty,onChange=()=>{}}){
  let generation=0,serial=0,worker=null,loaded=false,guestBroken=false;
  // A full disk must not turn an external SIGNED_OUT into loss of an offline draft.
  // Recovery drafts remain hidden until the same identity signs in again.
  const recoveries=new Map();
  const empty=validate(makeEmpty()),emptySignature=stable(empty);
  const hasContent=data=>stable(data)!==emptySignature;
  let guest=copy(empty);
  let snapshot={user:null,status:'guest',data:copy(guest),revision:null,pending:false,error:'',cacheError:'',guestAvailable:false};
  try{const raw=storage?.getItem(GUEST_KEY);if(raw)guest=validate(JSON.parse(raw));}catch{guestBroken=true;snapshot.cacheError='La sauvegarde locale ne peut pas être lue. Exporte tes données.';}
  snapshot.data=copy(guest);
  const getSnapshot=()=>copy(snapshot);
  function emit(){onChange(getSnapshot());}
  function key(){return snapshot.user?CACHE_PREFIX+snapshot.user.id:GUEST_KEY;}
  function cache(){
   try{
    if(!storage||(!snapshot.user&&guestBroken))throw Error('storage unavailable');
    const value=snapshot.user?{data:snapshot.data,revision:snapshot.revision,pending:snapshot.pending}:snapshot.data;
    storage.setItem(key(),JSON.stringify(value));snapshot.cacheError='';return true;
   }catch{snapshot.cacheError='La copie dans ce navigateur est indisponible. Tu peux exporter tes données.';return false;}
  }
  function pendingCache(id){
   try{const raw=storage?.getItem(CACHE_PREFIX+id);if(!raw)return null;const c=JSON.parse(raw);if(c.pending!==true||!Number.isSafeInteger(c.revision)||c.revision<1)return null;return {data:validate(c.data),revision:c.revision};}
   catch{snapshot.cacheError='Une copie locale du compte est illisible. Elle n’a pas été remplacée.';return {invalid:true};}
  }
  function validRow(row){if(!row||!Number.isSafeInteger(row.revision)||row.revision<1||row.user_id!==snapshot.user.id)throw Error('invalid remote');return validate(row.data);}
  async function setSession(session){
   const user=session?.user?.id?{id:session.user.id,email:session.user.email||''}:null;
   if(user?.id===snapshot.user?.id){snapshot.user=user;emit();return;}
   if(snapshot.user&&snapshot.pending)recoveries.set(snapshot.user.id,{data:copy(snapshot.data),revision:snapshot.revision});
   const gen=++generation;worker=null;loaded=false;serial=0;
   snapshot={user,status:user?'loading':'guest',data:validate(makeEmpty()),revision:null,pending:false,error:'',cacheError:'',guestAvailable:false};
   if(!user){snapshot.data=copy(guest);emit();return;}
   emit();const cached=recoveries.get(user.id)||pendingCache(user.id);
   try{
    const result=await client.from('user_workspaces').select('user_id,data,revision').eq('user_id',user.id).maybeSingle();
    if(gen!==generation)return;if(result.error)throw result.error;
    let row=result.data;
    if(!row){
     // A successful read is required before creating an empty workspace.
     if(cached){snapshot.data=cached.invalid?validate(makeEmpty()):cached.data;snapshot.revision=cached.revision||null;snapshot.pending=!cached.invalid;snapshot.status='conflict';snapshot.error='La sauvegarde distante est absente. Exporte la copie locale avant de recharger.';emit();return;}
     const created=await client.from('user_workspaces').insert({user_id:user.id,data:validate(makeEmpty())}).select('user_id,data,revision').maybeSingle();
     if(gen!==generation)return;if(created.error||!created.data)throw Error('create failed');row=created.data;
    }
    snapshot.data=validRow(row);snapshot.revision=row.revision;loaded=true;
    snapshot.guestAvailable=!hasContent(snapshot.data)&&hasContent(guest);
    if(cached){
     if(cached.invalid){snapshot.status='error';snapshot.error='Exporte ou conserve la copie locale illisible avant de continuer.';loaded=false;emit();return;}
     snapshot.data=cached.data;snapshot.pending=true;serial++;
     if(cached.revision!==row.revision){snapshot.revision=cached.revision;snapshot.status='conflict';snapshot.error='Une autre version existe sur le serveur. Exporte ta copie ou recharge la version distante.';emit();return;}
    }
    snapshot.status='ready';cache();emit();if(snapshot.pending)await flush();
   }catch{
    if(gen!==generation)return;
    if(cached&&!cached.invalid){snapshot.data=cached.data;snapshot.revision=cached.revision;snapshot.pending=true;}
    snapshot.status='error';snapshot.error='Impossible de charger ce compte. Réessaie la connexion réseau ; aucune donnée distante n’a été remplacée.';emit();
   }
  }
  function flush(){
   if(worker)return worker;
   if(!snapshot.user||!loaded||!snapshot.pending||['conflict','error','loading'].includes(snapshot.status))return Promise.resolve();
   const gen=generation,id=snapshot.user.id;
   const job=(async()=>{
    while(gen===generation&&snapshot.pending){
     const sentSerial=serial,data=copy(snapshot.data),revision=snapshot.revision;snapshot.status='saving';snapshot.error='';emit();
     try{
      const result=await client.from('user_workspaces').update({data}).eq('user_id',id).eq('revision',revision).select('user_id,data,revision').maybeSingle();
      if(gen!==generation)return;if(result.error)throw result.error;
      if(!result.data){snapshot.status='conflict';snapshot.error='Une autre version existe sur le serveur. Ta copie est conservée ici.';cache();emit();return;}
      validRow(result.data);snapshot.revision=result.data.revision;snapshot.pending=serial!==sentSerial;snapshot.status=snapshot.pending?'saving':'ready';if(!snapshot.pending)recoveries.delete(id);cache();emit();
     }catch{if(gen!==generation)return;snapshot.status='offline';snapshot.error='Sauvegarde en ligne interrompue. Tes modifications restent à synchroniser.';cache();emit();return;}
    }
   })();
   worker=job;job.finally(()=>{if(worker===job)worker=null;});return job;
  }
  function edit(data){
   if(snapshot.user&&(!loaded||['loading','error','conflict'].includes(snapshot.status)))throw Error('Attends le chargement du compte ou résous le conflit.');
   const next=validate(copy(data));snapshot.data=next;serial++;
   if(!snapshot.user){guest=copy(next);cache();emit();return;}
   snapshot.guestAvailable=!hasContent(next)&&hasContent(guest);
   snapshot.pending=true;cache();emit();void flush();
  }
  async function retry(){
   if(!snapshot.user||snapshot.status==='conflict')return;
   if(!loaded){const user=snapshot.user;snapshot.user=null;return setSession({user});}
   snapshot.status='ready';return flush();
  }
  async function adoptGuest(){
   if(!snapshot.user||!loaded||snapshot.status!=='ready'||!snapshot.guestAvailable||hasContent(snapshot.data))throw Error('Cette copie n’est pas disponible.');
   edit(guest);snapshot.guestAvailable=false;emit();await flush();
  }
  async function reloadRemote(){
   if(!snapshot.user)return;
   // The caller must explicitly confirm abandoning pending edits, and can export first.
   const user=snapshot.user;
   try{storage?.removeItem(CACHE_PREFIX+user.id);}catch{throw Error('Impossible de retirer la copie locale. Exporte-la avant de continuer.');}
   recoveries.delete(user.id);
   snapshot.user=null;await setSession({user});
  }
  async function signOut(){
   if(snapshot.pending&&snapshot.cacheError)throw Error('Exporte les modifications avant de te déconnecter : la copie locale est indisponible.');
   const result=await client.auth.signOut();if(result.error)throw Error('Déconnexion impossible. Réessaie.');await setSession(null);
  }
  return {setSession,getSnapshot,edit,retry,adoptGuest,reloadRemote,signOut};
 }
 return {createAccountController};
})();
