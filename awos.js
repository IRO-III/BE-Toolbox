import {calc_wbgt,calc_solar_parameters,clearSkyIrradiance} from './wbgt-model.js';
// Integration by Codex (OpenAI), September 2026. Model retained from the supplied
// 121 BEE WBGT reference; use explicit SI units and UTC instead of chained conversions.
const tokenURL='https://ang-apps.github.io/mesonet_api_token.txt';
export async function getToken(mesoCall,{signal,fetcher=fetch}={}) {
  const r=await fetcher(tokenURL,{signal,cache:'no-store'});
  if(!r.ok)throw Error('The weather token service is unavailable. Try again later.');
  const token=(await r.text()).trim();
  if(!/^[A-Za-z0-9._-]{8,512}$/.test(token))throw Error('The weather token service returned an invalid token.');
  return mesoCall(token); // Token stays in memory; never saved to browser storage or source.
}
export async function loadWeather(station,{signal,fetcher=fetch,now=Date.now()}={}) {
  const id=station.trim().toUpperCase();
  if(!/^[A-Z0-9]{3,8}$/.test(id))throw Error('Enter a valid station ID, such as KLCK.');
  return getToken(async token=>{
    const url=new URL('https://api.synopticdata.com/v2/stations/timeseries');
    url.search=new URLSearchParams({token,stid:id,recent:'180',vars:'air_temp,relative_humidity,wind_speed,pressure,cloud_layer_1',units:'temp|C,speed|mps,pres|mb',obtimezone:'utc',qc:'on'});
    const response=await fetcher(url,{signal,cache:'no-store'});
    if(!response.ok)throw Error('Weather request failed (HTTP '+response.status+'). Refresh to retrieve a new token.');
    const data=await response.json();
    if(data.SUMMARY?.RESPONSE_CODE!==1)throw Error('The weather service could not provide observations for this station.');
    return estimateLatest(data,id,now);
  },{signal,fetcher});
}
export function estimateLatest(data,id,now=Date.now()) {
  const s=data.STATION?.find(s=>s.STID===id);
  if(!s)throw Error('No observations returned for '+id+'.');
  const u=data.UNITS||{};
  if(u.air_temp!=='Celsius'||u.wind_speed!=='m/s'||u.pressure!=='Millibars'||u.relative_humidity!=='%')throw Error('Unexpected weather units. No estimate was calculated.');
  const lat=Number(s.LATITUDE),lon=Number(s.LONGITUDE);
  if(s.LATITUDE==null||s.LONGITUDE==null||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('Station coordinates are missing or invalid.');
  const o=s.OBSERVATIONS||{};
  const keys=['air_temp','relative_humidity','wind_speed','pressure','cloud_layer_1'].map(k=>Object.keys(o).filter(key=>new RegExp('^'+k+'_set_\\d+d?$').test(key)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})));
  const clouds={'clear':0,'thin scattered':.06,'scattered':.26,'broken':.51,'overcast':.88,'obscured':.88};
  const order=(o.date_time||[]).map((time,i)=>({time,i,ms:Date.parse(time)})).filter(x=>Number.isFinite(x.ms)).sort((a,b)=>b.ms-a.ms);
  for(const {time,i,ms} of order){
    if(now-ms>120*60000||ms-now>5*60000)continue;
    const values=keys.map(list=>list.map(k=>o[k]?.[i]).find(v=>v!==null&&v!==undefined));
    const [air,rh,wind,pressure,cloud]=values;
    if([air,rh,wind,pressure].some(v=>typeof v!=='number'||!Number.isFinite(v)))continue;
    const sky=cloud?.sky_condition;
    if(!(sky in clouds)||air< -40||air>54||rh<=0||rh>100||wind<0||wind>45||pressure<800||pressure>1100)continue;
    const d=new Date(ms),year=d.getUTCFullYear(),month=d.getUTCMonth()+1,day=d.getUTCDate(),hour=d.getUTCHours(),minute=d.getUTCMinutes();
    if(year<1950||year>2049)throw Error('Observation date is outside the solar model range.');
    const solar=clearSkyIrradiance(calc_solar_parameters(year,month,day+(hour+minute/60)/24,lat,lon,910).cza)*(1-.75*clouds[sky]**3.4);
    const model=calc_wbgt(year,month,day,hour,minute,0,0,lat,lon,solar,sky,pressure,air,rh,wind,10,0,1);
    if(model.retVal!==0||![model.Tnwb,model.Tg,model.Twbg].every(Number.isFinite))continue;
    return {station:id,name:s.NAME||id,time,ageMinutes:Math.max(0,Math.round((now-ms)/60000)),air,rh,wind,pressure,sky,solar,wet:model.Tnwb,globe:model.Tg,wbgt:model.Twbg};
  }
  throw Error('No complete, valid observation within the last 2 hours. Missing or stale readings are not used.');
}
export function mountAWOS(container,onData,onClear){
  container.innerHTML='<div class="panel-heading"><h2>WBGT data source</h2></div><label>Source<select id="weather-source"><option value="manual">On-site sensor readings</option><option value="awos">AWOS / weather station estimate</option></select></label><div id="weather-controls" hidden><div class="weather-fetch"><label>Station<select id="weather-station"><option value="TJSJ">TJSJ - Muniz ANGB</option><option value="TJBQ">TJBQ - Ramey, Aguadilla</option><option value="TISX">TISX - St Croix ANG</option></select></label><button type="button" id="weather-load">Load latest weather</button></div><p id="weather-status" role="status"></p><p class="weather-assumptions">Estimated outdoor WBGT using the reference’s Liljegren model. Assumes wind measured at 10 m, urban terrain, and solar radiation estimated from time, location and first cloud layer. Nearby airport conditions may differ from the work site.</p><p class="weather-credit">Weather observations: <a href="https://synopticdata.com/" target="_blank" rel="noopener">Synoptic Data</a>. Model adapted from the supplied 121 BEE WBGT page.</p></div>';
  const source=container.querySelector('#weather-source'),controls=container.querySelector('#weather-controls'),station=container.querySelector('#weather-station'),button=container.querySelector('#weather-load'),status=container.querySelector('#weather-status');let controller,serial=0;
  function clear(){serial++;controller?.abort();button.disabled=false;status.textContent='';onClear(source.value==='awos');}
  source.onchange=()=>{clear();controls.hidden=source.value!=='awos';};station.onchange=clear;
  button.onclick=async()=>{clear();const request=serial;controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);button.disabled=true;status.textContent='Retrieving weather observations…';try{const result=await loadWeather(station.value,{signal:controller.signal});if(request!==serial)return;onData(result);status.textContent=result.station+' · '+result.name+' · '+new Date(result.time).toLocaleString()+' · '+result.ageMinutes+' min old. Air '+(result.air*9/5+32).toFixed(1)+' °F; RH '+result.rh+'%; wind '+result.wind+' m/s; pressure '+result.pressure+' mb; '+result.sky+'.';}catch(e){if(request!==serial)return;status.textContent=e.name==='AbortError'?'Weather request timed out. Try again.':e instanceof TypeError?'Could not connect to the weather service. Check your connection and try again.':e.message;}finally{clearTimeout(timer);if(request===serial)button.disabled=false;}};
  return {reset(){source.value='manual';controls.hidden=true;clear();}};
}
