(function(){
"use strict";
// C11
var config={
defaultSwapStyle:"innerHTML",defaultSwapDelay:0,defaultSettleDelay:20,
indicatorClass:"htmx-request",addedClass:"htmx-added",settlingClass:"htmx-settling",
swappingClass:"htmx-swapping",includeIndicatorStyles:true,historyEnabled:true,
historyCacheSize:10,refreshOnHistoryMiss:false,allowEval:true,allowScriptTags:true,
inlineScriptNonce:"",selfRequestsOnly:true,withCredentials:false,timeout:0,
scrollBehavior:"instant",defaultFocusScroll:false,getCacheBusterParam:false,
globalViewTransitions:false,methodsThatUseUrlParams:["get"],
scrollIntoViewOnBoost:true
};
var extensions={};
var historyCache=[];
var syncMap=new WeakMap();
var processedMap=new WeakMap();
var hxOnMap=new WeakMap();
// C11 meta config
function loadConfig(){
var meta=document.querySelector('meta[name="htmx-config"]');
if(meta){try{var c=JSON.parse(meta.getAttribute("content"));for(var k in c)config[k]=c[k];}catch(e){}}
}
// C10
function parseInterval(str){
if(!str)return 0;
if(/ms$/.test(str))return parseInt(str);
if(/s$/.test(str))return parseInt(str)*1000;
return parseInt(str);
}
// C14 + C16 extension onEvent inlined
function fire(elt,name,detail){
detail=detail||{};
var evt=new CustomEvent(name,{bubbles:true,cancelable:true,detail:detail});
var active=getActiveExtensions(elt);
for(var i=0;i<active.length;i++){
if(active[i].onEvent)try{active[i].onEvent(name,evt);}catch(e){}
}
if(htmx.logger)htmx.logger(elt,name,detail);
elt.dispatchEvent(evt);
return evt;
}
// C18
function getAttr(elt,attr){
if(!elt||!elt.getAttribute)return null;
var val=elt.getAttribute(attr);
if(val!==null)return val;
var p=elt.parentElement;
while(p){
var dis=p.getAttribute("hx-disinherit");
if(dis){
if(dis==="*")return null;
if(dis.split(/\s+/).indexOf(attr)>=0)return null;
}
val=p.getAttribute(attr);
if(val!==null)return val;
p=p.parentElement;
}
return null;
}
// C4 inlined target resolution
function resolveTarget(elt,val){
if(!val||val==="this")return elt;
if(val.indexOf("closest ")===0)return elt.closest(val.slice(8));
if(val.indexOf("find ")===0)return elt.querySelector(val.slice(5));
if(val.indexOf("next ")===0){
var sel=val.slice(5);var sib=elt.nextElementSibling;
while(sib){if(sib.matches(sel))return sib;sib=sib.nextElementSibling;}
return null;
}
if(val==="next")return elt.nextElementSibling;
if(val.indexOf("previous ")===0){
var sel2=val.slice(9);var sib2=elt.previousElementSibling;
while(sib2){if(sib2.matches(sel2))return sib2;sib2=sib2.previousElementSibling;}
return null;
}
if(val==="previous")return elt.previousElementSibling;
return document.querySelector(val);
}
// C16
function getActiveExtensions(elt){
var result=[];var ignore={};
var node=elt;
while(node&&node.getAttribute){
var ext=node.getAttribute("hx-ext");
if(ext){
var parts=ext.split(/\s*,\s*/);
for(var i=0;i<parts.length;i++){
var p=parts[i].trim();
if(p.indexOf("ignore:")===0){ignore[p.slice(7)]=true;}
else if(!ignore[p]&&extensions[p]&&result.indexOf(extensions[p])<0){
result.push(extensions[p]);
}
}
}
node=node.parentElement;
}
return result;
}
// C3
function parseSwap(str){
var spec={swap:config.defaultSwapStyle,swapDelay:config.defaultSwapDelay,
settleDelay:config.defaultSettleDelay,scroll:null,show:null,
focusScroll:config.defaultFocusScroll,transition:config.globalViewTransitions};
if(!str)return spec;
var parts=str.split(/\s+/);
spec.swap=parts[0];
for(var i=1;i<parts.length;i++){
var t=parts[i];
if(t.indexOf("swap:")===0)spec.swapDelay=parseInterval(t.slice(5));
else if(t.indexOf("settle:")===0)spec.settleDelay=parseInterval(t.slice(7));
else if(t.indexOf("scroll:")===0){
var sv=t.slice(7);var ci=sv.lastIndexOf(":");
if(ci>0){spec.scroll={dir:sv.slice(ci+1),selector:sv.slice(0,ci)};}
else{spec.scroll={dir:sv,selector:null};}
}
else if(t.indexOf("show:")===0){
var shv=t.slice(5);var shi=shv.lastIndexOf(":");
if(shi>0){spec.show={dir:shv.slice(shi+1),selector:shv.slice(0,shi)};}
else{spec.show={dir:shv,selector:null};}
}
else if(t.indexOf("focus-scroll:")===0)spec.focusScroll=t.slice(13)==="true";
else if(t.indexOf("transition:")===0)spec.transition=t.slice(11)==="true";
}
return spec;
}
// C3 simple switch
function doSwap(target,html,swapStyle){
if(!target)return;
switch(swapStyle){
case "innerHTML":target.innerHTML=html;break;
case "outerHTML":target.outerHTML=html;break;
case "beforebegin":target.insertAdjacentHTML("beforebegin",html);break;
case "afterbegin":target.insertAdjacentHTML("afterbegin",html);break;
case "beforeend":target.insertAdjacentHTML("beforeend",html);break;
case "afterend":target.insertAdjacentHTML("afterend",html);break;
case "delete":target.remove();break;
case "none":break;
default:target.innerHTML=html;
}
}
// C8
function processOob(html){
var tmp=document.createElement("div");
tmp.innerHTML=html;
var oobElts=tmp.querySelectorAll("[hx-swap-oob]");
for(var i=oobElts.length-1;i>=0;i--){
var el=oobElts[i];
var spec=el.getAttribute("hx-swap-oob");
el.removeAttribute("hx-swap-oob");
var strategy="outerHTML",selector=null;
if(spec&&spec!=="true"){
var ci=spec.indexOf(":");
if(ci>=0){strategy=spec.slice(0,ci);selector=spec.slice(ci+1);}
else{strategy=spec;}
}
var tgt=selector?document.querySelector(selector):(el.id?document.getElementById(el.id):null);
if(tgt){
fire(tgt,"htmx:oobBeforeSwap",{fragment:el});
if(strategy==="outerHTML"){doSwap(tgt,el.outerHTML,strategy);}
else{doSwap(tgt,el.innerHTML,strategy);}
fire(tgt,"htmx:oobAfterSwap",{fragment:el});
}else{fire(document.body,"htmx:oobErrorNoTarget",{content:el});}
el.parentNode.removeChild(el);
}
return tmp.innerHTML;
}
// C8 select-oob
function processSelectOob(responseHtml,selectOob){
if(!selectOob)return responseHtml;
var tmp=document.createElement("div");
tmp.innerHTML=responseHtml;
var entries=selectOob.split(/\s*,\s*/);
for(var i=0;i<entries.length;i++){
var entry=entries[i].trim();if(!entry)continue;
var ci=entry.indexOf(":");
var srcSel,tgtSel;
if(ci>=0){srcSel=entry.slice(0,ci);tgtSel=entry.slice(ci+1);}
else{srcSel=tgtSel=entry;}
var src=tmp.querySelector(srcSel);
var tgt=document.querySelector(tgtSel);
if(src&&tgt){
fire(tgt,"htmx:oobBeforeSwap",{fragment:src});
doSwap(tgt,src.outerHTML,"outerHTML");
fire(tgt,"htmx:oobAfterSwap",{fragment:src});
src.parentNode.removeChild(src);
}
}
return tmp.innerHTML;
}
// C9 scripts - swap only
function processScripts(elt){
if(!config.allowScriptTags)return;
var scripts=elt.querySelectorAll("script");
for(var i=0;i<scripts.length;i++){
var old=scripts[i];
var ns=document.createElement("script");
var attrs=old.attributes;
for(var j=0;j<attrs.length;j++)ns.setAttribute(attrs[j].name,attrs[j].value);
if(config.inlineScriptNonce)ns.nonce=config.inlineScriptNonce;
ns.textContent=old.textContent;
old.parentNode.replaceChild(ns,old);
}
}
// C9 hx-on:* - swap only
function processHxOn(elt){
if(!config.allowEval)return;
var all=elt.querySelectorAll("*");
var elts=[elt];
for(var i=0;i<all.length;i++)elts.push(all[i]);
for(var j=0;j<elts.length;j++){
var el=elts[j];
var attrs=el.attributes;
if(!attrs)continue;
for(var k=0;k<attrs.length;k++){
var name=attrs[k].name;
if(name.indexOf("hx-on:")!==0)continue;
var evtName;
if(name.indexOf("hx-on::")===0){evtName="htmx:"+name.slice(7);}
else{evtName=name.slice(6);}
var code=attrs[k].value;
var key="__hxon_"+evtName;
if(!hxOnMap.has(el))hxOnMap.set(el,{});
var map=hxOnMap.get(el);
if(map[key])continue;
var fn=new Function("event",code);
el.addEventListener(evtName,function(f,e){return function(evt){f.call(e,evt);};}(fn,el));
map[key]=true;
}
}
}
// C5 parse triggers
function parseTriggers(elt,attr){
var triggers=[];
if(!attr){
var tag=elt.tagName;
if(tag==="FORM")attr="submit";
else if(tag==="INPUT"||tag==="SELECT"||tag==="TEXTAREA")attr="change";
else attr="click";
}
var parts=attr.split(/\s*,\s*/);
for(var i=0;i<parts.length;i++){
var raw=parts[i].trim();if(!raw)continue;
var trig={event:null,modifiers:{},filter:null};
if(raw.indexOf("every ")===0){
trig.event="every";
trig.modifiers.pollInterval=parseInterval(raw.slice(6).trim());
triggers.push(trig);continue;
}
var tokens=raw.split(/\s+/);
var evtPart=tokens[0];
var bi=evtPart.indexOf("[");
if(bi>=0){
trig.event=evtPart.slice(0,bi);
trig.filter=evtPart.slice(bi+1,evtPart.lastIndexOf("]"));
}else{trig.event=evtPart;}
var j=1;
while(j<tokens.length){
var m=tokens[j];
if(m==="once")trig.modifiers.once=true;
else if(m==="changed")trig.modifiers.changed=true;
else if(m==="consume")trig.modifiers.consume=true;
else if(m.indexOf("delay:")===0)trig.modifiers.delay=parseInterval(m.slice(6));
else if(m.indexOf("throttle:")===0)trig.modifiers.throttle=parseInterval(m.slice(9));
else if(m.indexOf("target:")===0)trig.modifiers.targetFilter=m.slice(7);
else if(m.indexOf("queue:")===0)trig.modifiers.queue=m.slice(6);
else if(m.indexOf("from:")===0){
var fromVal=m.slice(5);j++;
while(j<tokens.length){
var next=tokens[j];
if(next==="once"||next==="changed"||next==="consume"||
next.indexOf("delay:")===0||next.indexOf("throttle:")===0||
next.indexOf("target:")===0||next.indexOf("queue:")===0||
next.indexOf("from:")===0||next.indexOf("root:")===0||
next.indexOf("threshold:")===0)break;
fromVal+=" "+next;j++;
}
trig.modifiers.from=fromVal;continue;
}
else if(m.indexOf("root:")===0)trig.modifiers.root=m.slice(5);
else if(m.indexOf("threshold:")===0)trig.modifiers.threshold=parseFloat(m.slice(10));
j++;
}
triggers.push(trig);
}
return triggers;
}
// C5 resolve from: target
function resolveFromTarget(elt,from){
if(!from)return elt;
if(from==="document")return document;
if(from==="window")return window;
if(from.indexOf("closest ")===0)return elt.closest(from.slice(8));
if(from.indexOf("find ")===0)return elt.querySelector(from.slice(5));
if(from.indexOf("next ")===0){
var sel=from.slice(5);var s=elt.nextElementSibling;
while(s){if(s.matches(sel))return s;s=s.nextElementSibling;}return null;
}
if(from==="next")return elt.nextElementSibling;
if(from.indexOf("previous ")===0){
var sel2=from.slice(9);var s2=elt.previousElementSibling;
while(s2){if(s2.matches(sel2))return s2;s2=s2.previousElementSibling;}return null;
}
if(from==="previous")return elt.previousElementSibling;
return document.querySelector(from);
}
// C13 FormData collection
function collectParams(elt,verb){
var fd=new FormData();
var form=elt.closest("form");
if(elt.tagName==="FORM")form=elt;
if(form)fd=new FormData(form);
if(elt.name&&elt.value!==undefined&&elt.tagName!=="FORM"){
fd.set(elt.name,elt.value);
}
// hx-include
var inc=getAttr(elt,"hx-include");
if(inc){
var incElt=resolveTarget(elt,inc);
if(incElt){
var incElts;
if(incElt.tagName==="FORM"){
var ffd=new FormData(incElt);
ffd.forEach(function(v,k){fd.append(k,v);});
incElts=[];
}else if(incElt.name){
fd.append(incElt.name,incElt.value||"");incElts=[];
}else{
incElts=incElt.querySelectorAll("input[name],select[name],textarea[name]");
for(var n=0;n<incElts.length;n++)fd.append(incElts[n].name,incElts[n].value||"");
}
}else{
try{
var matched=document.querySelectorAll(inc);
for(var m=0;m<matched.length;m++){
var me=matched[m];
if(me.tagName==="FORM"){
var ff2=new FormData(me);
ff2.forEach(function(v,k){fd.append(k,v);});
}else if(me.name){fd.append(me.name,me.value||"");}
else{
var mi=me.querySelectorAll("input[name],select[name],textarea[name]");
for(var q=0;q<mi.length;q++)fd.append(mi[q].name,mi[q].value||"");
}
}
}catch(e){}
}
}
// hx-vals
var vals=getAttr(elt,"hx-vals");
if(vals){
try{
if(config.allowEval&&vals.indexOf("js:")===0){
var obj=new Function("return ("+vals.slice(3)+")")();
for(var vk in obj)fd.append(vk,obj[vk]);
}else{
var parsed=JSON.parse(vals);
for(var pk in parsed)fd.append(pk,parsed[pk]);
}
}catch(e){}
}
// hx-params filtering
var params=getAttr(elt,"hx-params");
if(params&&params!=="*"){
if(params==="none"){
var keys=[];fd.forEach(function(v,k){if(keys.indexOf(k)<0)keys.push(k);});
for(var d=0;d<keys.length;d++)fd.delete(keys[d]);
}else if(params.indexOf("not ")===0){
var excl=params.slice(4).split(/\s*,\s*/);
for(var e=0;e<excl.length;e++)fd.delete(excl[e].trim());
}else{
var incl=params.split(/\s*,\s*/);
var allKeys=[];fd.forEach(function(v,k){if(allKeys.indexOf(k)<0)allKeys.push(k);});
for(var f=0;f<allKeys.length;f++){
if(incl.indexOf(allKeys[f].trim())<0)fd.delete(allKeys[f]);
}
}
}
return fd;
}
// C7 fire trigger response headers
function fireTriggerHeaders(elt,headerVal){
if(!headerVal)return;
try{
var parsed=JSON.parse(headerVal);
for(var name in parsed){
fire(elt,name,parsed[name]&&typeof parsed[name]==="object"?parsed[name]:{value:parsed[name]});
}
}catch(e){
var names=headerVal.split(/\s*,\s*/);
for(var i=0;i<names.length;i++){if(names[i].trim())fire(elt,names[i].trim());}
}
}
// C12 history cache
function saveToCache(url,content,title,scroll){
for(var i=0;i<historyCache.length;i++){
if(historyCache[i].url===url){historyCache.splice(i,1);break;}
}
historyCache.push({url:url,content:content,title:title,scroll:scroll});
if(historyCache.length>config.historyCacheSize)historyCache.shift();
}
function getFromCache(url){
for(var i=0;i<historyCache.length;i++){
if(historyCache[i].url===url)return historyCache[i];
}
return null;
}
function snapshotAndSave(url){
var histElt=document.querySelector("[hx-history-elt]")||document.body;
fire(histElt,"htmx:beforeHistorySave");
saveToCache(url,histElt.innerHTML,document.title,window.scrollY);
}
// C1-C19 main request
function issueRequest(elt,verb,url,source,isBoosted){
// C13 hx-confirm
var confirmMsg=getAttr(elt,"hx-confirm");
if(confirmMsg){
var ce=fire(elt,"htmx:confirm",{question:confirmMsg,issueRequest:function(){doRequest();}});
if(ce.defaultPrevented)return;
if(!confirm(confirmMsg))return;
}
doRequest();
function doRequest(){
// C13 hx-prompt
var promptVal=null;
var promptMsg=getAttr(elt,"hx-prompt");
if(promptMsg){promptVal=prompt(promptMsg);if(promptVal===null)return;}
// C17 validation
var validate=getAttr(elt,"hx-validate");
if(validate==="true"){
var vform=elt.closest("form")||elt;
if(vform.checkValidity){
fire(vform,"htmx:validation:validate");
if(!vform.checkValidity()){
vform.reportValidity();
fire(vform,"htmx:validation:failed");
fire(vform,"htmx:validation:halted");
return;
}
}
}
var fd=collectParams(source||elt,verb);
// C4 target resolution inlined
var targetVal=getAttr(elt,"hx-target");
var target=targetVal?resolveTarget(elt,targetVal):(isBoosted?document.body:elt);
var swapStr=getAttr(elt,"hx-swap")||config.defaultSwapStyle;
var swapSpec=parseSwap(swapStr);
var selectVal=elt.getAttribute?elt.getAttribute("hx-select"):null;
var selectOobVal=elt.getAttribute?elt.getAttribute("hx-select-oob"):null;
// request headers
var headers={"HX-Request":"true","HX-Current-URL":window.location.href};
if(target&&target.id)headers["HX-Target"]=target.id;
if(elt.id)headers["HX-Trigger"]=elt.id;
if(elt.name)headers["HX-Trigger-Name"]=elt.name;
if(isBoosted)headers["HX-Boosted"]="true";
if(promptVal!==null)headers["HX-Prompt"]=promptVal;
// hx-headers inlined (single JSON.parse)
var hdrVal=getAttr(elt,"hx-headers");
if(hdrVal){try{var hobj=JSON.parse(hdrVal);for(var hk in hobj)headers[hk]=hobj[hk];}catch(e){}}
// C14 configRequest - FormData passed directly
var configEvt=fire(elt,"htmx:configRequest",{
verb:verb.toUpperCase(),path:url,parameters:fd,headers:headers,target:target,triggeringEvent:null
});
if(configEvt.defaultPrevented)return;
url=configEvt.detail.path;
// C19 selfRequestsOnly
if(config.selfRequestsOnly){
try{
var u=new URL(url,window.location.href);
if(u.origin!==window.location.origin){fire(elt,"htmx:sendError",{});return;}
}catch(e){}
}
// sync check inlined
var syncVal=getAttr(elt,"hx-sync");
var syncElt=elt,syncMode="drop";
if(syncVal){
var sci=syncVal.indexOf(":");
if(sci>=0){
syncElt=resolveTarget(elt,syncVal.slice(0,sci).trim())||elt;
syncMode=syncVal.slice(sci+1).trim();
}else{syncMode=syncVal.trim();}
}
if(syncMode==="replace"||syncMode==="abort"){
var prev=syncMap.get(syncElt);
if(prev)prev.abort();
}else if(syncMode==="drop"){
if(syncMap.get(syncElt))return;
}
var controller=new AbortController();
syncMap.set(syncElt,controller);
// C19 request config
var reqOpts={timeout:config.timeout,credentials:config.withCredentials};
var reqAttr=getAttr(elt,"hx-request");
if(reqAttr){try{var ro=JSON.parse(reqAttr);
if(ro.timeout!==undefined)reqOpts.timeout=ro.timeout;
if(ro.credentials!==undefined)reqOpts.credentials=ro.credentials==="include"||ro.credentials===true;
}catch(e){}}
// indicator inlined
var indSel=getAttr(elt,"hx-indicator");
var indicators=[];
if(indSel){try{indicators=Array.prototype.slice.call(document.querySelectorAll(indSel));}catch(e){}}
else{indicators=[elt];}
for(var ii=0;ii<indicators.length;ii++)indicators[ii].classList.add(config.indicatorClass);
// C13 hx-disabled-elt
var disabledSel=getAttr(elt,"hx-disabled-elt");
var disabledElts=[];
if(disabledSel){try{disabledElts=Array.prototype.slice.call(document.querySelectorAll(disabledSel));}catch(e){}}
for(var di=0;di<disabledElts.length;di++)disabledElts[di].disabled=true;
// fetch options
var method=verb.toUpperCase();
var fetchUrl=url;
var fetchOpts={method:method,headers:{},signal:controller.signal};
if(reqOpts.credentials||config.withCredentials)fetchOpts.credentials="include";
for(var hk2 in headers)fetchOpts.headers[hk2]=headers[hk2];
// C16 transformRequest
var active=getActiveExtensions(elt);
for(var xi=0;xi<active.length;xi++){
if(active[xi].transformRequest)active[xi].transformRequest(fetchOpts.headers,fd,elt);
}
// C2 GET vs non-GET
var isGet=config.methodsThatUseUrlParams.indexOf(verb.toLowerCase())>=0;
if(isGet){
var qs=new URLSearchParams(fd).toString();
if(qs)fetchUrl+=(fetchUrl.indexOf("?")>=0?"&":"?")+qs;
if(config.getCacheBusterParam){
fetchUrl+=(fetchUrl.indexOf("?")>=0?"&":"?")+"org.htmx.cache-buster="+encodeURIComponent(new Date().valueOf());
}
}else{
var hasFile=false;
var encAttr=getAttr(elt,"hx-encoding");
fd.forEach(function(v){if(v instanceof File)hasFile=true;});
if(hasFile||encAttr==="multipart/form-data"){
fetchOpts.body=fd;
}else{
fetchOpts.headers["Content-Type"]="application/x-www-form-urlencoded";
fetchOpts.body=new URLSearchParams(fd).toString();
}
}
// C14 beforeRequest
var brEvt=fire(elt,"htmx:beforeRequest",{xhr:null,target:target,requestConfig:fetchOpts});
if(brEvt.defaultPrevented){cleanup();return;}
// abort listener
var abortHandler=function(){controller.abort();fire(elt,"htmx:xhr:abort");};
elt.addEventListener("htmx:abort",abortHandler,{once:true});
fire(elt,"htmx:beforeSend",{xhr:null,target:target,requestConfig:fetchOpts});
// C19 timeout
var timeoutId=null;
if(reqOpts.timeout>0){
timeoutId=setTimeout(function(){controller.abort();fire(elt,"htmx:timeout",{});},reqOpts.timeout);
}
fetch(fetchUrl,fetchOpts).then(function(response){
if(timeoutId)clearTimeout(timeoutId);
var status=response.status;
return response.text().then(function(responseText){
// C16 transformResponse
for(var ti=0;ti<active.length;ti++){
if(active[ti].transformResponse)responseText=active[ti].transformResponse(responseText,null,elt);
}
fire(elt,"htmx:afterRequest",{xhr:null,target:target,successful:status>=200&&status<300});
// C7 redirect/refresh
var hxRedirect=response.headers.get("HX-Redirect");
if(hxRedirect){window.location.href=hxRedirect;return;}
var hxRefresh=response.headers.get("HX-Refresh");
if(hxRefresh==="true"){window.location.reload();return;}
// C7 HX-Location
var hxLocation=response.headers.get("HX-Location");
if(hxLocation){
var locSpec;
try{locSpec=JSON.parse(hxLocation);}catch(e){locSpec={path:hxLocation};}
var locTarget=locSpec.target?document.querySelector(locSpec.target):document.body;
var locVerb=(locSpec.verb||"get").toLowerCase();
issueRequest(locTarget,locVerb,locSpec.path,locTarget,false);
return;
}
// C2 status
if(status===204)return;
var shouldSwap=status>=200&&status<300;
if(!shouldSwap)fire(elt,"htmx:responseError",{xhr:null,target:target,status:status});
// C7 retarget/reswap
var hxRetarget=response.headers.get("HX-Retarget");
if(hxRetarget)target=document.querySelector(hxRetarget);
var hxReswap=response.headers.get("HX-Reswap");
if(hxReswap)swapSpec=parseSwap(hxReswap);
// C14 beforeSwap
var bsEvt=fire(target||elt,"htmx:beforeSwap",{
xhr:null,target:target,requestConfig:fetchOpts,shouldSwap:shouldSwap,
serverResponse:responseText
});
if(bsEvt.detail.shouldSwap!==undefined)shouldSwap=bsEvt.detail.shouldSwap;
if(bsEvt.detail.target)target=bsEvt.detail.target;
if(!shouldSwap||!target)return;
// title extraction - regex + trim
var titleMatch=responseText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
if(titleMatch)document.title=titleMatch[1].trim();
// C12 two URL branches: push and replace
var pushUrl=getAttr(elt,"hx-push-url");
var replaceUrl=getAttr(elt,"hx-replace-url");
var hxPush=response.headers.get("HX-Push-Url");
var hxReplace=response.headers.get("HX-Replace-Url");
if(hxPush!==null)pushUrl=hxPush;
if(hxReplace!==null)replaceUrl=hxReplace;
if(isBoosted&&!pushUrl&&!replaceUrl)pushUrl="true";
var actualUrl=url;
if(pushUrl&&pushUrl!=="false"){
var pu=pushUrl==="true"?actualUrl:pushUrl;
snapshotAndSave(window.location.href);
history.pushState({htmx:true},"",pu);
fire(elt,"htmx:pushedIntoHistory",{path:pu});
}else if(replaceUrl&&replaceUrl!=="false"){
var ru=replaceUrl==="true"?actualUrl:replaceUrl;
snapshotAndSave(window.location.href);
history.replaceState({htmx:true},"",ru);
fire(elt,"htmx:replacedInHistory",{path:ru});
}
var doTheSwap=function(){
setTimeout(function(){
// C8 select-oob then OOB
responseText=processSelectOob(responseText,selectOobVal);
responseText=processOob(responseText);
// C3 hx-select
if(selectVal){
var selTmp=document.createElement("div");
selTmp.innerHTML=responseText;
var selMatch=selTmp.querySelector(selectVal);
responseText=selMatch?selMatch.outerHTML:"";
}
// C8 hx-preserve inlined
var preserved=[];
if(target){
var presElts=target.querySelectorAll("[hx-preserve][id]");
for(var pi=0;pi<presElts.length;pi++){
preserved.push({id:presElts[pi].id,clone:presElts[pi].cloneNode(true)});
}
}
target.classList.add(config.swappingClass);
var childrenBefore=Array.prototype.slice.call(target.children);
doSwap(target,responseText,swapSpec.swap);
target.classList.remove(config.swappingClass);
// restore preserved
for(var ri=0;ri<preserved.length;ri++){
var ph=document.getElementById(preserved[ri].id);
if(ph)ph.parentNode.replaceChild(preserved[ri].clone,ph);
}
// C7 HX-Trigger + HX-Trigger-After-Swap fire after swap before settle
fireTriggerHeaders(elt,response.headers.get("HX-Trigger"));
fireTriggerHeaders(elt,response.headers.get("HX-Trigger-After-Swap"));
fire(target,"htmx:afterSwap",{xhr:null,target:target});
// settle phase
target.classList.add(config.settlingClass);
var childrenAfter=Array.prototype.slice.call(target.children);
for(var ai=0;ai<childrenAfter.length;ai++){
if(childrenBefore.indexOf(childrenAfter[ai])<0){
childrenAfter[ai].classList.add(config.addedClass);
}
}
setTimeout(function(){
target.classList.remove(config.settlingClass);
for(var ci=0;ci<childrenAfter.length;ci++){
childrenAfter[ci].classList.remove(config.addedClass);
}
fireTriggerHeaders(elt,response.headers.get("HX-Trigger-After-Settle"));
fire(target,"htmx:afterSettle",{xhr:null,target:target});
// C9 process then scripts then hx-on then SSE/WS
process(target);
processScripts(target);
processHxOn(target);
initSSE(target);
initWS(target);
fire(target,"htmx:load",{});
// scroll/show
if(swapSpec.scroll){
var scrollElt=swapSpec.scroll.selector?document.querySelector(swapSpec.scroll.selector):target;
if(scrollElt){
if(swapSpec.scroll.dir==="top")scrollElt.scrollTop=0;
else if(swapSpec.scroll.dir==="bottom")scrollElt.scrollTop=scrollElt.scrollHeight;
}
}
if(swapSpec.show){
var showElt=swapSpec.show.selector?document.querySelector(swapSpec.show.selector):target;
if(showElt){
showElt.scrollIntoView({behavior:config.scrollBehavior,block:swapSpec.show.dir==="top"?"start":"end"});
}
}
if(isBoosted&&config.scrollIntoViewOnBoost){
window.scrollTo({top:0,behavior:config.scrollBehavior});
}
if(swapSpec.focusScroll){
var focused=target.querySelector("[autofocus]");
if(focused){focused.focus();focused.scrollIntoView({behavior:config.scrollBehavior});}
}
},swapSpec.settleDelay);
},swapSpec.swapDelay);
};
// C9 view transitions
if(swapSpec.transition&&document.startViewTransition){
document.startViewTransition(function(){doTheSwap();});
}else{doTheSwap();}
});
}).catch(function(err){
if(timeoutId)clearTimeout(timeoutId);
if(err.name!=="AbortError"){
fire(elt,"htmx:sendError",{error:err});
fire(elt,"htmx:afterRequest",{xhr:null,target:target,successful:false});
}
}).finally(function(){cleanup();});
function cleanup(){
syncMap.delete(syncElt);
for(var ci=0;ci<indicators.length;ci++)indicators[ci].classList.remove(config.indicatorClass);
for(var di2=0;di2<disabledElts.length;di2++)disabledElts[di2].disabled=false;
}
}
}
// C5 attach triggers
function attachTrigger(elt,verb,url){
var trigAttr=getAttr(elt,"hx-trigger");
var triggers=parseTriggers(elt,trigAttr);
for(var i=0;i<triggers.length;i++){
(function(trig){
if(trig.event==="every"){
var iv=setInterval(function(){
if(!document.body.contains(elt)){clearInterval(iv);return;}
issueRequest(elt,verb,url,elt,false);
},trig.modifiers.pollInterval);
return;
}
if(trig.event==="load"){
issueRequest(elt,verb,url,elt,false);return;
}
if(trig.event==="revealed"){
var obs=new IntersectionObserver(function(entries){
for(var e=0;e<entries.length;e++){
if(entries[e].isIntersecting){obs.disconnect();issueRequest(elt,verb,url,elt,false);}
}
});
obs.observe(elt);return;
}
if(trig.event==="intersect"){
var ioOpts={};
if(trig.modifiers.root)ioOpts.root=document.querySelector(trig.modifiers.root);
if(trig.modifiers.threshold!==undefined)ioOpts.threshold=trig.modifiers.threshold;
var io=new IntersectionObserver(function(entries){
for(var e=0;e<entries.length;e++){
if(entries[e].isIntersecting)issueRequest(elt,verb,url,elt,false);
}
},ioOpts);
io.observe(elt);return;
}
var listenTarget=resolveFromTarget(elt,trig.modifiers.from)||elt;
var fired=false;
var delayTimer=null;
var throttleTimer=null;
var lastValue=undefined;
listenTarget.addEventListener(trig.event,function(evt){
if(trig.filter&&config.allowEval){
try{if(!new Function("event","return("+trig.filter+")").call(elt,evt))return;}catch(e){return;}
}
if(trig.modifiers.targetFilter){
if(!evt.target.matches(trig.modifiers.targetFilter))return;
}
if(trig.modifiers.consume){evt.preventDefault();evt.stopPropagation();}
if(trig.event==="submit")evt.preventDefault();
if(trig.modifiers.once&&fired)return;
if(trig.modifiers.changed){
var cv=elt.value;
if(cv===lastValue)return;
lastValue=cv;
}
var doIt=function(){
fired=true;
issueRequest(elt,verb,url,elt,false);
};
if(trig.modifiers.delay!==undefined){
clearTimeout(delayTimer);
delayTimer=setTimeout(doIt,trig.modifiers.delay);
return;
}
if(trig.modifiers.throttle!==undefined){
if(throttleTimer)return;
doIt();
throttleTimer=setTimeout(function(){throttleTimer=null;},trig.modifiers.throttle);
return;
}
if(trig.modifiers.queue){
var qm=trig.modifiers.queue;
if(qm==="none")return;
if(syncMap.get(elt)&&qm==="first")return;
}
doIt();
});
})(triggers[i]);
}
}
// C6 single boost function for links and forms
function boost(container){
var links=container.querySelectorAll("a");
var forms=container.querySelectorAll("form");
for(var i=0;i<links.length;i++){
var a=links[i];
if(processedMap.get(a))continue;
var bv=getAttr(a,"hx-boost");
if(bv!=="true")continue;
if(a.getAttribute("hx-boost")==="false")continue;
processedMap.set(a,true);
a.addEventListener("click",function(evt){
if(evt.metaKey||evt.ctrlKey||evt.shiftKey||evt.altKey)return;
var href=this.getAttribute("href");
if(!href||href===""||href.charAt(0)==="#"||href.indexOf("mailto:")===0||href.indexOf("javascript:")===0)return;
evt.preventDefault();
issueRequest(this,"get",href,this,true);
});
}
for(var j=0;j<forms.length;j++){
var f=forms[j];
if(processedMap.get(f))continue;
var fbv=getAttr(f,"hx-boost");
if(fbv!=="true")continue;
if(f.getAttribute("hx-boost")==="false")continue;
processedMap.set(f,true);
f.addEventListener("submit",function(evt){
evt.preventDefault();
var action=this.action||this.getAttribute("action")||window.location.href;
var method=(this.method||this.getAttribute("method")||"get").toLowerCase();
issueRequest(this,method,action,this,true);
});
}
}
// C15 SSE
function initSSE(root){
var elts=root.querySelectorAll("[sse-connect]");
if(root.getAttribute&&root.getAttribute("sse-connect"))processSSEElement(root);
for(var i=0;i<elts.length;i++)processSSEElement(elts[i]);
}
function processSSEElement(elt){
if(elt._sseSource)return;
var url=elt.getAttribute("sse-connect");
if(!url)return;
var es=new EventSource(url);
elt._sseSource=es;
es.onopen=function(){fire(elt,"htmx:sseOpen");};
es.onerror=function(){fire(elt,"htmx:sseError");};
var swapElts=elt.querySelectorAll("[sse-swap]");
for(var i=0;i<swapElts.length;i++){
(function(se){
var evtName=se.getAttribute("sse-swap");
es.addEventListener(evtName,function(e){
var data=e.data;
data=processOob(data);
var tgtVal=se.getAttribute("hx-target");
var tgt=tgtVal?resolveTarget(se,tgtVal):se;
var sw=se.getAttribute("hx-swap")||config.defaultSwapStyle;
doSwap(tgt,data,parseSwap(sw).swap);
process(tgt);processScripts(tgt);processHxOn(tgt);
fire(tgt,"htmx:load");
});
})(swapElts[i]);
}
var closeAttr=elt.getAttribute("sse-close");
if(closeAttr){
es.addEventListener(closeAttr,function(){es.close();elt._sseSource=null;});
}
var sseCheck=setInterval(function(){
if(!document.body.contains(elt)){es.close();elt._sseSource=null;clearInterval(sseCheck);}
},1000);
}
// C15 WebSocket
function initWS(root){
var elts=root.querySelectorAll("[ws-connect]");
if(root.getAttribute&&root.getAttribute("ws-connect"))processWSElement(root);
for(var i=0;i<elts.length;i++)processWSElement(elts[i]);
}
function processWSElement(elt){
if(elt._ws)return;
var url=elt.getAttribute("ws-connect");
if(!url)return;
var retryDelay=1000;var maxDelay=30000;
function connect(){
var ws=new WebSocket(url);
elt._ws=ws;
ws.onmessage=function(e){
var data=e.data;
data=processOob(data);
var sw=elt.getAttribute("hx-swap")||config.defaultSwapStyle;
doSwap(elt,data,parseSwap(sw).swap);
process(elt);processScripts(elt);processHxOn(elt);
fire(elt,"htmx:load");
retryDelay=1000;
};
ws.onclose=function(){
elt._ws=null;
if(document.body.contains(elt)){
setTimeout(connect,retryDelay);
retryDelay=Math.min(retryDelay*2,maxDelay);
}
};
ws.onerror=function(){};
var senders=elt.querySelectorAll("[ws-send]");
for(var i=0;i<senders.length;i++){
if(senders[i]._wsBound)continue;
senders[i]._wsBound=true;
senders[i].addEventListener(senders[i].tagName==="FORM"?"submit":"click",function(evt){
evt.preventDefault();
var form=this.closest("form")||this;
var fd=form.tagName==="FORM"?new FormData(form):new FormData();
var obj={};fd.forEach(function(v,k){obj[k]=v;});
if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));
});
}
}
connect();
var wsCheck=setInterval(function(){
if(!document.body.contains(elt)){
if(elt._ws){elt._ws.close();elt._ws=null;}
clearInterval(wsCheck);
}
},1000);
}
// process by verb-specific selectors
function process(elt){
if(!elt||!elt.querySelectorAll)return;
if(elt.closest&&elt.closest("[hx-disable]"))return;
var verbs=["get","post","put","patch","delete"];
for(var v=0;v<verbs.length;v++){
var sel="[hx-"+verbs[v]+"]";
var matches=elt.querySelectorAll(sel);
var all=[];
if(elt.getAttribute&&elt.getAttribute("hx-"+verbs[v])!==null)all.push(elt);
for(var m=0;m<matches.length;m++)all.push(matches[m]);
for(var i=0;i<all.length;i++){
var el=all[i];
if(processedMap.get(el))continue;
if(el.closest&&el.closest("[hx-disable]"))continue;
fire(el,"htmx:beforeProcessNode");
processedMap.set(el,true);
attachTrigger(el,verbs[v],el.getAttribute("hx-"+verbs[v]));
fire(el,"htmx:afterProcessNode");
}
}
boost(elt);
}
// initialization
function init(){
loadConfig();
// C12 popstate
window.addEventListener("popstate",function(evt){
var cached=getFromCache(window.location.href);
var histElt=document.querySelector("[hx-history-elt]")||document.body;
if(cached){
fire(histElt,"htmx:historyRestore",{path:window.location.href});
histElt.innerHTML=cached.content;
document.title=cached.title;
process(histElt);processScripts(histElt);processHxOn(histElt);
initSSE(histElt);initWS(histElt);
setTimeout(function(){window.scrollTo(0,cached.scroll);},0);
}else{
fire(histElt,"htmx:historyCacheMiss",{path:window.location.href});
if(config.refreshOnHistoryMiss){window.location.reload();return;}
fetch(window.location.href,{headers:{"HX-Request":"true","HX-History-Restore-Request":"true"}})
.then(function(r){return r.text();}).then(function(html){
fire(histElt,"htmx:historyCacheMissLoad",{path:window.location.href,serverResponse:html});
var bodyMatch=html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
if(bodyMatch)html=bodyMatch[1];
histElt.innerHTML=html;
var titleMatch=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
if(titleMatch)document.title=titleMatch[1].trim();
process(histElt);processScripts(histElt);processHxOn(histElt);
initSSE(histElt);initWS(histElt);
}).catch(function(err){
fire(histElt,"htmx:historyCacheMissError",{path:window.location.href,error:err});
});
}
});
// indicator styles inlined
if(config.includeIndicatorStyles){
var style=document.createElement("style");
style.textContent=".htmx-indicator{opacity:0;transition:opacity 200ms ease-in;}.htmx-request .htmx-indicator,.htmx-request.htmx-indicator{opacity:1;}";
document.head.appendChild(style);
}
// initial process - NO scripts, NO hx-on:*
process(document.body);
initSSE(document.body);
initWS(document.body);
}
// C10 public API
var htmx={
version:VERSION,
config:config,
logger:null,
process:function(elt){process(elt);processScripts(elt);processHxOn(elt);initSSE(elt);initWS(elt);},
find:function(a,b){
if(b===undefined)return document.querySelector(a);
return a.querySelector(b);
},
findAll:function(a,b){
if(b===undefined)return Array.prototype.slice.call(document.querySelectorAll(a));
return Array.prototype.slice.call(a.querySelectorAll(b));
},
closest:function(elt,sel){return elt.closest(sel);},
remove:function(elt){elt.remove();},
addClass:function(elt,cls,delay){
if(delay){setTimeout(function(){elt.classList.add(cls);},parseInterval(delay));}
else{elt.classList.add(cls);}
},
removeClass:function(elt,cls,delay){
if(delay){setTimeout(function(){elt.classList.remove(cls);},parseInterval(delay));}
else{elt.classList.remove(cls);}
},
toggleClass:function(elt,cls){elt.classList.toggle(cls);},
takeClass:function(elt,cls){
var sibs=elt.parentElement.children;
for(var i=0;i<sibs.length;i++)sibs[i].classList.remove(cls);
elt.classList.add(cls);
},
trigger:function(elt,name,detail){fire(elt,name,detail);},
swap:function(target,html,swapSpec){
var spec=swapSpec?parseSwap(swapSpec):parseSwap(config.defaultSwapStyle);
html=processOob(html);
doSwap(target,html,spec.swap);
process(target);processScripts(target);processHxOn(target);
},
values:function(elt){
var fd=collectParams(elt,"get");
var obj={};fd.forEach(function(v,k){obj[k]=v;});
return obj;
},
on:function(a,b,c){
if(typeof a==="string"){document.addEventListener(a,b);}
else{a.addEventListener(b,c);}
},
off:function(a,b,c){
if(typeof a==="string"){document.removeEventListener(a,b);}
else{a.removeEventListener(b,c);}
},
ajax:function(verb,url,spec){
var target=document.body;
var source=document.body;
if(typeof spec==="string"){target=document.querySelector(spec);source=target;}
else if(spec&&spec.nodeType){target=spec;source=spec;}
else if(spec){
if(spec.target){target=typeof spec.target==="string"?document.querySelector(spec.target):spec.target;}
if(spec.source){source=typeof spec.source==="string"?document.querySelector(spec.source):spec.source;}
}
issueRequest(target,verb.toLowerCase(),url,source,false);
},
defineExtension:function(name,def){
extensions[name]=def;
if(def.init)def.init({config:config});
},
removeExtension:function(name){delete extensions[name];},
parseInterval:parseInterval,
logAll:function(){htmx.logger=function(elt,evt,detail){console.log(evt,elt,detail);};},
logNone:function(){htmx.logger=null;},
_:{fire:fire,getAttr:getAttr,resolveTarget:resolveTarget,doSwap:doSwap,processScripts:processScripts}
};
window.htmx=htmx;
if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",init);}
else{init();}
})();
