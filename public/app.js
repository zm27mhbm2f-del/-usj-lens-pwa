const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const TZ = 'Asia/Tokyo';
const today = new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const state = { live:null, usj:null, opening:null, rideStats:null, period:'hours', showFilter:'all', favorites:new Set(JSON.parse(localStorage.getItem('usj.favorites')||'[]')) };

const JA = new Map([
  [12066,'ミニオン・ハチャメチャ・ライド'],[13005,'名探偵コナン・ザ・ワールド'],[12073,'フライト・オブ・ザ・ヒッポグリフ'],[12072,'フリーズ・レイ・スライダー'],[12065,'ハリー・ポッター・アンド・ザ・フォービドゥン・ジャーニー'],[7065,'ハローキティのカップケーキ・ドリーム'],[7063,'ハローキティのリボン・コレクション'],[7077,'ハリウッド・ドリーム・ザ・ライド'],[12070,'ハリウッド・ドリーム・ザ・ライド ～バックドロップ～'],[12068,'ジョーズ'],[12061,'マリオカート ～クッパの挑戦状～'],[14402,'ドンキーコングのクレイジー・トロッコ'],[12197,'オリバンダーの店'],[12091,'プレイング・ウィズおさるのジョージ'],[7214,'シング・オン・ツアー'],[7092,'ザ・フライング・ダイナソー'],[12075,'フライング・スヌーピー'],[12071,'ヨッシー・アドベンチャー']
]);

function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function fmtTime(iso){if(!iso)return '--:--';try{return new Intl.DateTimeFormat('ja-JP',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));}catch{return '--:--'}}
function fmtDateJa(d){const [y,m,day]=d.split('-').map(Number);return `${y}年${m}月${day}日`;}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2400);}
async function api(url){const r=await fetch(url,{headers:{accept:'application/json'}});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.detail||j.error||`HTTP ${r.status}`);return j;}
function saveFavorites(){localStorage.setItem('usj.favorites',JSON.stringify([...state.favorites]));}
function displayName(r){return JA.get(Number(r.id))||r.name;}

function renderSummary(){
  $('#todayLabel').textContent=fmtDateJa(today);
  const l=state.live;
  if(l){
    const open=l.rides.filter(r=>r.isOpen);
    const ageMs=l.updatedAt?Date.now()-new Date(l.updatedAt).getTime():Infinity;
    const stale=ageMs>20*60*1000;
    $('#parkState').textContent=stale?'データ更新遅延':(open.length?'営業中':'営業状況を確認中');
    $('#parkAvg').textContent=l.summary?.average==null?'--分':`${l.summary.average}分`;
    $('#openCount').textContent=`${l.summary?.open ?? open.length} / ${l.summary?.total ?? l.rides.length}`;
    const best=[...open].sort((a,b)=>a.wait-b.wait).slice(0,3);
    $('#bestNowItems').textContent=stale?'最新データの更新を待っています':(best.length?best.map(r=>`${displayName(r)} ${r.wait}分`).join(' ・ '):'運行中データを確認中');
  }
  const h=state.usj?.officialHours;
  $('#officialHours').textContent=h?`${h.open} — ${h.close}`:'取得できません';
  const o=state.opening;
  $('#actualOpen').textContent=o?.actual||'未掲載';
  $('#actualOpenKind').textContent=o?.actual?'第三者記録':'第三者記録待ち';
}

function waitClass(w){return w>=100?'hot':w>=60?'warm':'cool';}
function renderLive(){
  const el=$('#rideList');
  if(!state.live){el.innerHTML='<div class="skeleton"></div><div class="skeleton"></div>';return;}
  let rides=[...state.live.rides];
  const q=$('#searchInput').value.trim().toLowerCase();
  if(q) rides=rides.filter(r=>(displayName(r)+' '+r.name+' '+r.land).toLowerCase().includes(q));
  const sort=$('#sortSelect').value;
  rides.sort((a,b)=>{
    if(sort==='waitDesc') return (a.isOpen===b.isOpen?b.wait-a.wait:Number(b.isOpen)-Number(a.isOpen));
    if(sort==='name') return displayName(a).localeCompare(displayName(b),'ja');
    if(sort==='favorite') return (Number(state.favorites.has(b.id))-Number(state.favorites.has(a.id))) || (a.isOpen===b.isOpen?a.wait-b.wait:Number(b.isOpen)-Number(a.isOpen));
    return (a.isOpen===b.isOpen?a.wait-b.wait:Number(b.isOpen)-Number(a.isOpen));
  });
  el.innerHTML=rides.map(r=>{
    const dn=displayName(r), diff=dn!==r.name;
    return `<article class="ride-card ${r.isOpen?'opened':''}"><button class="favorite ${state.favorites.has(r.id)?'on':''}" data-fav="${r.id}" aria-label="お気に入り">★</button><div class="ride-top"><div><div class="ride-name">${esc(dn)}</div>${diff?`<div class="ride-original">${esc(r.name)}</div>`:''}<div class="land">${esc(r.land||'')}</div></div><div class="status ${r.isOpen?'open':'closed'}">${r.isOpen?'● 運行中':'休止/終了'}</div></div><div><span class="wait ${waitClass(r.wait)}">${r.isOpen?r.wait:'—'}<small>${r.isOpen?'分':''}</small></span></div></article>`;
  }).join('')||'<div class="empty">該当するアトラクションがありません。</div>';
  $$('[data-fav]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.fav);state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);saveFavorites();renderLive();});
  $('#lastUpdated').textContent=`更新 ${fmtTime(state.live.updatedAt)}`;
}

function fillRideSelect(){
  const s=$('#rideSelect'), current=s.value;
  const rides=(state.live?.rides||[]).slice().sort((a,b)=>displayName(a).localeCompare(displayName(b),'ja'));
  s.innerHTML=rides.map(r=>`<option value="${r.id}">${esc(displayName(r))}</option>`).join('');
  if(current&&rides.some(r=>String(r.id)===current))s.value=current;
}
function fillYearSelect(){const y=Number(today.slice(0,4));$('#yearSelect').innerHTML=['all',...Array.from({length:13},(_,i)=>String(y-i))].map(v=>`<option value="${v}">${v==='all'?'全期間':v+'年'}</option>`).join('');$('#yearSelect').value=String(y);}

async function loadLive(silent=false){try{state.live=await api('/api/live');fillRideSelect();renderLive();renderSummary();if(!silent)toast('待ち時間を更新しました');}catch(e){if(!silent)toast('待ち時間を取得できませんでした');renderLive();}}
async function loadTodayMeta(silent=false){const results=await Promise.allSettled([api('/api/usj?date='+today),api('/api/opening?date='+today)]);if(results[0].status==='fulfilled')state.usj=results[0].value;if(results[1].status==='fulfilled')state.opening=results[1].value;renderSummary();renderShows();if(!silent&&results.some(x=>x.status==='rejected'))toast('一部データを取得できませんでした');}

function chart(rows){if(!rows?.length)return '<div class="empty">データがありません。</div>';const max=Math.max(...rows.map(x=>x.average||0),1);return rows.map(x=>`<div class="bar-item"><div class="bar-value">${Math.round(x.average)}分</div><div class="bar" style="height:${Math.max(2,(x.average/max)*138)}px"></div><div class="bar-label">${esc(String(x.label))}</div></div>`).join('');}
function statRows(rows){return (rows||[]).map(x=>`<div class="stat-row"><span>${esc(String(x.label))}</span><strong>${Math.round(x.average)}分</strong></div>`).join('');}
const monthMap={Jan:'1月',Feb:'2月',Mar:'3月',Apr:'4月',May:'5月',Jun:'6月',Jul:'7月',Aug:'8月',Sep:'9月',Oct:'10月',Nov:'11月',Dec:'12月'};
const weekMap={Sun:'日曜',Mon:'月曜',Tue:'火曜',Wed:'水曜',Thu:'木曜',Fri:'金曜',Sat:'土曜'};
function renderStats(){
  const p=state.period,d=state.rideStats;$('#datePickerWrap').classList.toggle('hidden',p!=='date');if(p==='date')return;
  if(!d){$('#avgChart').innerHTML='<div class="empty">読み込み中...</div>';$('#avgTable').innerHTML='';return;}
  let rows=[],title='';
  if(p==='hours'){rows=d.hours.map(x=>({...x,label:`${x.label}時`}));title='時間別平均';}
  if(p==='months'){rows=d.months.map(x=>({...x,label:monthMap[x.label]||x.label}));title='月別平均';}
  if(p==='years'){rows=d.years.map(x=>({...x,label:`${x.label}年`}));title='年別平均';}
  if(p==='weekdays'){rows=d.weekdays.map(x=>({...x,label:weekMap[x.label]||x.label}));title='曜日別平均';}
  $('#avgTitle').textContent=title;$('#avgSubtitle').textContent=`${d.name}・${d.year==='all'?'全期間':d.year+'年'}`;$('#avgChart').innerHTML=chart(rows);$('#avgTable').innerHTML=statRows(rows);
}
async function loadRideStats(){const id=Number($('#rideSelect').value);if(!id)return;const y=$('#yearSelect').value;state.rideStats=null;renderStats();try{state.rideStats=await api(`/api/history?type=ride&id=${id}&year=${encodeURIComponent(y)}`);renderStats();}catch{$('#avgChart').innerHTML='<div class="error-card">過去統計を取得できませんでした。時間をおいて再読み込みしてください。</div>';}}
async function loadDateHistory(){const d=$('#historyDate').value;if(!d)return;$('#avgTitle').textContent=`${fmtDateJa(d)} の平均`;$('#avgSubtitle').textContent='日付別・アトラクション別';$('#avgChart').innerHTML='<div class="empty">読み込み中...</div>';$('#avgTable').innerHTML='';try{const x=await api('/api/history?type=date&date='+encodeURIComponent(d));const rows=x.rides.map(r=>({label:r.name,average:r.average})).sort((a,b)=>b.average-a.average);$('#avgChart').innerHTML=chart(rows.slice(0,12).map((r,i)=>({...r,label:i+1})));$('#avgTable').innerHTML=statRows(rows);}catch{$('#avgChart').innerHTML='<div class="error-card">この日の履歴を取得できませんでした。</div>';}}

function renderShows(){
  const all=state.usj?.shows||[];const selected=$('#showDate').value||today;const filtered=state.showFilter==='all'?all:all.filter(s=>s.category===state.showFilter);$('#showCount').textContent=`${filtered.length}件`;$('#showHeading').textContent=`${fmtDateJa(selected)} のショー`;
  const now=new Date();$('#showList').innerHTML=filtered.map(s=>{const next=s.times.findIndex(t=>new Date(`${selected}T${t}:00+09:00`)>now);return `<article class="show-card"><div class="show-head"><span class="show-kind">${esc(s.category)}</span><div class="show-name">${esc(s.name)}</div></div><div class="time-pills">${s.times.map((t,i)=>`<span class="time-pill ${i===next&&selected===today?'next':''}">${t}</span>`).join('')}</div></article>`;}).join('')||'<div class="empty">この日のショー時刻を取得できませんでした。</div>';
}
async function loadShowsForDate(){const d=$('#showDate').value;try{state.usj=await api('/api/usj?date='+encodeURIComponent(d));renderShows();if(state.usj.warnings?.length)toast(state.usj.warnings[0]);}catch{toast('ショースケジュールを取得できませんでした');}}

function diffMinutes(open,actual){if(!open||!actual)return null;const [oh,om]=open.split(':').map(Number),[ah,am]=actual.split(':').map(Number);return ah*60+am-(oh*60+om);}
function renderHours(u,o){const h=u?.officialHours;$('#hoursBig').innerHTML=h?`${h.open} <span>→</span> ${h.close}`:'取得できません';$('#hoursActual').textContent=o?.actual||'未掲載';$('#hoursForecast').textContent=o?.predicted||'未掲載';const diff=diffMinutes(h?.open,o?.actual);$('#hoursDiff').textContent=diff==null?'—':diff===0?'±0分':`${diff>0?'+':''}${diff}分`;}
async function loadHoursForDate(){const d=$('#hoursDate').value;const [u,o]=await Promise.allSettled([api('/api/usj?date='+d),api('/api/opening?date='+d)]);renderHours(u.status==='fulfilled'?u.value:null,o.status==='fulfilled'?o.value:null);if(u.status==='rejected')toast('公式営業時間を取得できませんでした');}

function switchTab(id){$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));$$('.panel').forEach(p=>p.classList.toggle('active',p.id===id));if(id==='avg'&&!state.rideStats)loadRideStats();if(id==='hours')renderHours(state.usj,state.opening);}
function initEvents(){
  $$('.tab').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));$('#refreshBtn').onclick=()=>Promise.all([loadLive(),loadTodayMeta(true)]);$('#searchInput').oninput=renderLive;$('#sortSelect').onchange=renderLive;$('#rideSelect').onchange=loadRideStats;$('#yearSelect').onchange=loadRideStats;
  $$('#periodTabs button').forEach(b=>b.onclick=()=>{state.period=b.dataset.period;$$('#periodTabs button').forEach(x=>x.classList.toggle('active',x===b));if(state.period==='years'&&$('#yearSelect').value!=='all'){$('#yearSelect').value='all';loadRideStats();}else renderStats();});
  $('#loadDateBtn').onclick=loadDateHistory;$('#loadShowsBtn').onclick=loadShowsForDate;$$('#showFilters .chip').forEach(b=>b.onclick=()=>{state.showFilter=b.dataset.filter;$$('#showFilters .chip').forEach(x=>x.classList.toggle('active',x===b));renderShows();});$('#loadHoursBtn').onclick=loadHoursForDate;
}
async function init(){['#historyDate','#showDate','#hoursDate'].forEach(s=>$(s).value=today);fillYearSelect();initEvents();renderLive();await Promise.all([loadLive(true),loadTodayMeta(true)]);setInterval(()=>loadLive(true),5*60*1000);if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});}
init();
