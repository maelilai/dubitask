(function(){
  // Blöcke & Unteraufgaben
  const BLOCKS = {
    1: { title:"Block 1", daily:"Tischen",         weekly:"Wäsche sammeln & sortieren", color:"b1", stroke:"var(--b1)" },
    2: { title:"Block 2", daily:"Tisch putzen",    weekly:"Staubsaugen",                color:"b2", stroke:"var(--b2)" },
    3: { title:"Block 3", daily:"Tisch abräumen",  weekly:"Entsorgen",                  color:"b3", stroke:"var(--b3)" },
  };
  const WEEKDAY_LABELS = ["Mo","Di","Mi","Do","Fr","Sa","So"];

  const $ = (s,r=document)=>r.querySelector(s);
  function esc(s){return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}
  function loadJSON(k,f){try{const x=localStorage.getItem(k);return x?JSON.parse(x):f}catch{return f}}
  function saveJSON(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}

  // Monatsinfo (Montag als Wochenstart)
  function getMonthInfo(d=new Date()){
    const y=d.getFullYear(), m=d.getMonth();
    const first=new Date(y,m,1), last=new Date(y,m+1,0);
    const days=last.getDate();
    const jsFirst=first.getDay();            // So=0..Sa=6
    const moFirst=(jsFirst+6)%7;             // Mo=0..So=6
    const total=moFirst+days;
    const weekRows=Math.ceil(total/7);
    const title=first.toLocaleDateString("de-CH",{month:"long",year:"numeric"});
    const grid=[]; let cur=1;
    for(let w=0; w<weekRows; w++){
      const row=[];
      for(let d=0; d<7; d++){
        const idx=w*7+d;
        row.push(idx>=moFirst && cur<=days ? cur++ : null);
      }
      grid.push(row);
    }
    return {year:y, month:m, days, monthKey:`${y}-${String(m+1).padStart(2,"0")}`, title, weekRows, grid};
  }

  // 3er-Rotation
  function buildAssignments(names, weeks){
    const safe = names.length>=3 ? names.slice(0,3) : [...names, ...Array(3-names.length).fill("-")];
    const rows=[];
    for(let w=0; w<weeks; w++){
      rows.push({ week:w+1, B1:safe[(0+w)%3], B2:safe[(1+w)%3], B3:safe[(2+w)%3] });
    }
    return rows;
  }

  // Hilfen
  function isPastDate(M, day){
    const today = new Date();
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const d0 = new Date(M.year, M.month, day);
    return d0 < t0;
  }
  function isWeekPast(M, weekIndex){
    const row = M.grid[weekIndex] || [];
    let lastDay = null;
    for (let i = row.length - 1; i >= 0; i--) {
      if (row[i] != null) { lastDay = row[i]; break; }
    }
    if (lastDay == null) return false;
    return isPastDate(M, lastDay);
  }
  function getTodayMeta(M){
    const now = new Date();
    if(now.getFullYear()!==M.year || now.getMonth()!==M.month) return {day:null, weekIdx:null, date:now};
    const day = now.getDate();
    let weekIdx = null;
    for(let wi=0; wi<M.grid.length; wi++){
      if(M.grid[wi].includes(day)){ weekIdx = wi; break; }
    }
    return {day, weekIdx, date:now};
  }
  const countTrue = (obj, maxKey)=> {
    let n=0;
    for (const k in obj) {
      const i = parseInt(k,10);
      if (Number.isFinite(i) && (maxKey==null || i<=maxKey) && obj[k]) n++;
    }
    return n;
  };

  // ===== State =====
  let kids = loadJSON("jl_kids_arr", ["Mael","Lenas","Elea"]);
  let selectedKid = loadJSON("jl_selected_kid", "");
  let focusNow = loadJSON("jl_now_focus", false);
  let M    = getMonthInfo(new Date());

  // pro Block: daily {day:true}, weekly {week:true}
  let daily = {
    1: loadJSON(`jl_${M.monthKey}_b1_daily`, {}),
    2: loadJSON(`jl_${M.monthKey}_b2_daily`, {}),
    3: loadJSON(`jl_${M.monthKey}_b3_daily`, {}),
  };
  let weekly = {
    1: loadJSON(`jl_${M.monthKey}_b1_weekly`, {}),
    2: loadJSON(`jl_${M.monthKey}_b2_weekly`, {}),
    3: loadJSON(`jl_${M.monthKey}_b3_weekly`, {}),
  };

  // ===== Donuts (IDs für Live-Update) =====
  function donutSVG(id, pct, done, total, strokeColor){
    const r = 52, cx=60, cy=60, sw=12;
    const C = 2*Math.PI*r;
    const dash = Math.max(0, Math.min(100, pct)) / 100 * C;
    const rest = C - dash;
    return `
      <figure class="donut" aria-labelledby="${id}-title ${id}-desc">
        <svg width="160" height="160" viewBox="0 0 120 120" role="img">
          <title id="${id}-title">${pct}% erledigt</title>
          <desc id="${id}-desc">${done} von ${total} Aufgaben im Monat</desc>
          <g transform="rotate(-90, ${cx}, ${cy})">
            <circle class="ring-bg" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="${sw}" />
            <circle id="${id}-ring" class="ring-fg" cx="${cx}" cy="${cy}" r="${r}" fill="none"
                    stroke="${strokeColor}" stroke-width="${sw}"
                    stroke-dasharray="${dash} ${rest}" />
          </g>
          <text id="${id}-pct" class="label-center" x="50%" y="52%" text-anchor="middle">${pct}%</text>
          <text id="${id}-cnt" class="label-sub" x="50%" y="65%" text-anchor="middle">${done}/${total}</text>
        </svg>
      </figure>
    `;
  }

  // ===== Fortschritt pro Person =====
  function mapDayToWeekIndices(M){
    const map = Array(M.days+1).fill(null);
    M.grid.forEach((row, wi)=>{ row.forEach(d=>{ if(d!=null) map[d]=wi; }); });
    return map;
  }
  function calcPersonProgress(kidName){
    const asg = buildAssignments(kids, M.weekRows);
    const dayToWeek = mapDayToWeekIndices(M);

    let dailyDone = 0;
    for(let d=1; d<=M.days; d++){
      const wi = dayToWeek[d];
      if(wi==null) continue;
      let blockForKid = null;
      if(asg[wi]?.B1 === kidName) blockForKid = 1;
      else if(asg[wi]?.B2 === kidName) blockForKid = 2;
      else if(asg[wi]?.B3 === kidName) blockForKid = 3;
      if(blockForKid==null) continue;
      if(daily[blockForKid] && daily[blockForKid][d]) dailyDone++;
    }

    let weeklyDoneCnt = 0;
    for(let w=1; w<=M.weekRows; w++){
      const idx = w-1;
      let blockForKid = null;
      if(asg[idx]?.B1 === kidName) blockForKid = 1;
      else if(asg[idx]?.B2 === kidName) blockForKid = 2;
      else if(asg[idx]?.B3 === kidName) blockForKid = 3;
      if(blockForKid==null) continue;
      if(weekly[blockForKid] && weekly[blockForKid][w]) weeklyDoneCnt++;
    }

    const dailyTotal = M.days;
    const weeklyTotal = M.weekRows;
    const done  = dailyDone + weeklyDoneCnt;
    const total = dailyTotal + weeklyTotal;
    const pct   = total>0 ? Math.round((done/total)*100) : 0;
    return {dailyDone, weeklyDone:weeklyDoneCnt, done, total, pct};
  }

  // Donuts live updaten
  function updateDonutsUI(){
    const names = [kids[0]||"–", kids[1]||"–", kids[2]||"–"];
    const prog  = names.map(n=>calcPersonProgress(n));

    prog.forEach((p, idx)=>{
      const id = `p${idx+1}`;
      const ring = document.getElementById(`${id}-ring`);
      const pctT = document.getElementById(`${id}-pct`);
      const cntT = document.getElementById(`${id}-cnt`);
      if(!ring || !pctT || !cntT) return;
      const r = 52, C = 2*Math.PI*r;
      const dash = Math.max(0, Math.min(100, p.pct)) / 100 * C;
      const rest = C - dash;
      ring.setAttribute("stroke-dasharray", `${dash} ${rest}`);
      pctT.textContent = `${p.pct}%`;
      cntT.textContent = `${p.done}/${p.total}`;
      const t = document.getElementById(`${id}-title`);
      const d = document.getElementById(`${id}-desc`);
      if(t) t.textContent = `${p.pct}% erledigt`;
      if(d) d.textContent = `${p.done} von ${p.total} Aufgaben im Monat`;
    });
  }

  // ===== Heutige Aufgabe einer Person finden & hin scrollen =====
  function getTodayMetaForKid(kidName){
    const {day, weekIdx, date} = getTodayMeta(M);
    if(day==null || weekIdx==null) return null;
    const asg = buildAssignments(kids, M.weekRows);
    let block=null;
    if(asg[weekIdx]?.B1===kidName) block=1;
    else if(asg[weekIdx]?.B2===kidName) block=2;
    else if(asg[weekIdx]?.B3===kidName) block=3;
    if(!block) return null;
    return {block, day, weekIdx, date};
  }
  function scrollToKidToday(kidName){
    const info = getTodayMetaForKid(kidName);
    if(!info) return false;
    focusNow = true; saveJSON("jl_now_focus", true);
    render();
    setTimeout(()=>{
      const sel = `button.cell[data-type="daily"][data-b="${info.block}"][data-day="${info.day}"]`;
      const el = document.querySelector(sel);
      if(el){
        el.classList.add('pulse');
        el.scrollIntoView({behavior:'smooth', block:'center'});
        setTimeout(()=>el.classList.remove('pulse'), 2500);
      }
    }, 0);
    return true;
  }

  // ===== Rendering =====
  function render(){
    $("#monthTitle").textContent = `${M.title} • Rotation: Block 1 → 2 → 3`;

    const app = $("#app");
    const asg = buildAssignments(kids, M.weekRows);
    const nameFor = (n, wi) => (n===1?asg[wi]?.B1 : n===2?asg[wi]?.B2 : asg[wi]?.B3) || "–";
    const isHL = (n, wi) => selectedKid && nameFor(n, wi) === selectedKid;
    const {day: tDay, weekIdx: tWI} = getTodayMeta(M);

    // helper: Soll diese Woche/Tag als "NOW" markiert werden?
    const shouldMarkWeek = (n, wi) =>
      focusNow && wi===tWI && (!selectedKid || nameFor(n,wi)===selectedKid);

    const isTodayFor = (n, wi, day) =>
      focusNow && tDay!=null && wi===tWI && day===tDay && (!selectedKid || nameFor(n,wi)===selectedKid);

    function blockCard(n){
      const b = BLOCKS[n];
      return `
        <section class="panel block-card ${b.color}">
          <div class="title">
            <h2>${esc(b.title)} · <span class="muted">${esc(b.daily)} (täglich) • ${esc(b.weekly)} (1×/Woche)</span></h2>
          </div>

          <div class="block-grid">
            <!-- Links: täglich -->
            <div>
              <div class="muted" style="margin-bottom:6px">Täglich: ${esc(b.daily)}</div>
              <div class="grid-head" aria-hidden="true">
                <div></div>
                ${WEEKDAY_LABELS.map(d=>`<div class="muted" style="text-align:center">${d}</div>`).join("")}
              </div>
              <div id="dailyGrid-${n}">
                ${M.grid.map((row,wi)=>`
                  <div class="grid-week ${(isHL(n,wi)?'hl ':'') + (shouldMarkWeek(n,wi)?'now':'')}">
                    <div class="weeklabel">Woche ${wi+1} — Zuständig: ${esc(nameFor(n,wi))}</div>
                    ${row.map(day=>{
                      if(day===null) return `<div class="cell disabled"></div>`;
                      const on   = !!daily[n][day];
                      const past = isPastDate(M, day);
                      const todayMark = isTodayFor(n, wi, day) ? ' today' : '';
                      const cls  = `cell ${on?'done':''} ${past?'past':''}${todayMark}`;
                      return `<button class="${cls}" data-type="daily" data-b="${n}" data-day="${day}" aria-pressed="${on}">${day}</button>`;
                    }).join("")}
                  </div>
                `).join("")}
              </div>
            </div>

            <!-- Rechts: wöchentlich -->
            <div>
              <div class="muted" style="margin-bottom:6px">1× pro Woche: ${esc(b.weekly)}</div>
              <div id="weeklyList-${n}" class="weeklist">
                ${Array.from({length:M.weekRows}).map((_,i)=>`
                  <div class="weekrow ${isWeekPast(M,i)?'past':''} ${isHL(n,i)?'hl':''} ${shouldMarkWeek(n,i)?'now':''}">
                    <div><strong>Woche ${i+1}</strong> — ${esc(nameFor(n,i))}</div>
                    <input type="checkbox" class="sw" data-type="weekly" data-b="${n}" data-w="${i+1}" ${weekly[n][i+1]?'checked':''}/>
                  </div>
                `).join("")}
              </div>
            </div>
          </div>
        </section>`;
    }

    function sidebar(){
      const getVar = (name)=>getComputedStyle(document.documentElement).getPropertyValue(name)||"";
      const names = [kids[0]||"–", kids[1]||"–", kids[2]||"–"];
      const colors = [ getVar('--b1').trim()||'#0891b2', getVar('--b2').trim()||'#10b981', getVar('--b3').trim()||'#f59e0b' ];

      const prog = names.map(n=>{
        const p = calcPersonProgress(n);
        return {name:n, ...p};
      });

      return `
        <aside class="progress-panel">
          <section class="panel">
            <div class="title"><h2>Fortschritt pro Person</h2><div class="muted">${M.title}</div></div>

            ${prog.map((p,i)=>`
              <div class="stat">
                <h3>${esc(p.name)}</h3>
                ${donutSVG(`p${i+1}`, p.pct, p.done, p.total, colors[i])}
                <div class="kpi"><span>Erledigt:</span><b>${p.done}</b><span>von</span><b>${p.total}</b></div>
                <div class="muted" style="text-align:center">täglich + wöchentlich in „seinen“ Wochen</div>
              </div>
            `).join("")}
          </section>
        </aside>
      `;
    }

    // Filter-Chip
    const filterChip = $("#activeFilter");
    filterChip.style.display = selectedKid ? "inline-flex" : "none";
    if (selectedKid) filterChip.querySelector("b").textContent = selectedKid;

    // Button-Klasse (aktiv/inaktiv)
    const nowBtnClass = `btn primary ${focusNow ? 'active' : ''}`;

    app.innerHTML = `
      <section class="panel">
        <div class="title">
          <h2>So funktioniert’s</h2>
          <div class="muted">B1/B2/B3: täglich & wöchentlich • Filter über ☰</div>
        </div>
        <div class="legend">
          <span class="chip">B1: ${esc(BLOCKS[1].daily)} (täglich) · ${esc(BLOCKS[1].weekly)} (wöchentlich)</span>
          <span class="chip">B2: ${esc(BLOCKS[2].daily)} (täglich) · ${esc(BLOCKS[2].weekly)} (wöchentlich)</span>
          <span class="chip">B3: ${esc(BLOCKS[3].daily)} (täglich) · ${esc(BLOCKS[3].weekly)} (wöchentlich)</span>
        </div>
        <div class="row" style="margin-top:8px">
          <span class="label">Namen (Reihenfolge = Rotation):</span>
          <input id="kid1" class="input" value="${esc(kids[0]||"")}" />
          <input id="kid2" class="input" value="${esc(kids[1]||"")}" />
          <input id="kid3" class="input" value="${esc(kids[2]||"")}" />
          <button id="btnReset" class="btn" title="Häkchen für diesen Monat löschen">Monat zurücksetzen</button>
          <button id="btnNow" class="${nowBtnClass}" title="Zeige HEUTE & DIESE WOCHE">⚡️ Heute & diese Woche</button>
        </div>
      </section>

      <section class="layout">
        <div>
          ${blockCard(1)}
          ${blockCard(2)}
          ${blockCard(3)}
        </div>
        ${sidebar()}
      </section>

      <div class="muted" style="text-align:center">Alles wird pro Monat lokal im Browser gespeichert.</div>
    `;

    // Inputs
    ["kid1","kid2","kid3"].forEach((id,idx)=>{
      $("#"+id).addEventListener("input", e=>{
        kids[idx] = e.target.value.trim();
        saveJSON("jl_kids_arr", kids);
        render();
      });
    });

    $("#btnReset").addEventListener("click", ()=>{
      if(!confirm("Alle Häkchen für diesen Monat löschen?")) return;
      daily = {1:{},2:{},3:{}};
      weekly = {1:{},2:{},3:{}};
      saveJSON(`jl_${M.monthKey}_b1_daily`, daily[1]);
      saveJSON(`jl_${M.monthKey}_b2_daily`, daily[2]);
      saveJSON(`jl_${M.monthKey}_b3_daily`, daily[3]);
      saveJSON(`jl_${M.monthKey}_b1_weekly`, weekly[1]);
      saveJSON(`jl_${M.monthKey}_b2_weekly`, weekly[2]);
      saveJSON(`jl_${M.monthKey}_b3_weekly`, weekly[3]);
      render();
    });

    // initiale Donuts anzeigen
    updateDonutsUI();
  }

  // Menü (Hamburger) – inkl. HEUTE-Info & Sprung
  function formatTodayLine(date){
    try{
      const day = date.toLocaleDateString("de-CH",{weekday:"short", day:"2-digit", month:"short"});
      return day.replace(".", "");
    }catch{ return "Heute"; }
  }
  function renderMenu(){
    const menu = $("#menu");
    const items = ['Alle', ...kids.map(k=>k||'')];

    let nowBox = "";
    if(selectedKid){
      const info = getTodayMetaForKid(selectedKid);
      if(info){
        const b = info.block;
        const dayLine = formatTodayLine(info.date);
        nowBox = `
          <div class="menu-now">
            <h4>${esc(selectedKid)} · ${dayLine}</h4>
            <div><b>Block ${b}</b> – täglich: ${esc(BLOCKS[b].daily)}</div>
            <div class="small">Diese Woche: ${esc(BLOCKS[b].weekly)} (1×)</div>
            <div style="margin-top:8px;display:flex;gap:8px;justify-content:flex-end">
              <button id="menuJump" class="btn small primary">⬇ Zu HEUTE springen</button>
            </div>
          </div>
          <div class="menu-divider"></div>
        `;
      }else{
        nowBox = `
          <div class="menu-now">
            <h4>${esc(selectedKid)}</h4>
            <div class="small">Heute liegt außerhalb des angezeigten Monats.</div>
          </div>
          <div class="menu-divider"></div>
        `;
      }
    }

    menu.innerHTML = `
      <div class="menu-title">Nach Name filtern</div>
      ${nowBox}
      ${items.map(name=>{
        const key = (name==='Alle') ? '' : name;
        const active = (selectedKid === key);
        return `<button class="menu-item ${active?'active':''}" data-name="${esc(key)}">${name||'–'}</button>`;
      }).join("")}
    `;
  }
  function openMenu(open){
    const m = $("#menu");
    m.classList.toggle('open', !!open);
    m.setAttribute('aria-hidden', open ? 'false' : 'true');
    $("#menuBtn").setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  // Monatswechsel prüfen
  function watchMonth(){
    setInterval(()=>{
      const info = getMonthInfo(new Date());
      if(info.monthKey !== M.monthKey){
        M = info;
        daily = {
          1: loadJSON(`jl_${M.monthKey}_b1_daily`, {}),
          2: loadJSON(`jl_${M.monthKey}_b2_daily`, {}),
          3: loadJSON(`jl_${M.monthKey}_b3_daily`, {}),
        };
        weekly = {
          1: loadJSON(`jl_${M.monthKey}_b1_weekly`, {}),
          2: loadJSON(`jl_${M.monthKey}_b2_weekly`, {}),
          3: loadJSON(`jl_${M.monthKey}_b3_weekly`, {}),
        };
        render();
        renderMenu();
      }
    }, 60*60*1000);
  }

  // Globaler Click-Handler
  function onAppClick(e){
    // Toggle „Heute & diese Woche“
    if (e.target.closest('#btnNow')){
      focusNow = !focusNow;
      saveJSON("jl_now_focus", focusNow);
      render();
      if(focusNow){
        setTimeout(()=>{
          const t = document.querySelector('.grid-week.now, .weekrow.now');
          if(t) t.scrollIntoView({behavior:'smooth', block:'center'});
        }, 0);
      }
      return;
    }

    // Daily Button?
    const cell = e.target.closest('button.cell[data-type="daily"]');
    if(cell){
      const b = parseInt(cell.getAttribute("data-b"),10);
      const day = parseInt(cell.getAttribute("data-day"),10);
      if(Number.isFinite(b) && Number.isFinite(day)){
        daily[b][day] = !daily[b][day];
        saveJSON(`jl_${M.monthKey}_b${b}_daily`, daily[b]);
        cell.classList.toggle("done");
        updateDonutsUI();
      }
      return;
    }
    // Weekly Switch?
    const sw = e.target.closest('input.sw[data-type="weekly"][data-b][data-w]');
    if(sw){
      const b = parseInt(sw.getAttribute("data-b"),10);
      const w = parseInt(sw.getAttribute("data-w"),10);
      if(Number.isFinite(b) && Number.isFinite(w)){
        weekly[b][w] = sw.checked;
        saveJSON(`jl_${M.monthKey}_b${b}_weekly`, weekly[b]);
        updateDonutsUI();
      }
      return;
    }
  }

  // Init
  document.addEventListener("DOMContentLoaded", ()=>{
    // Menü-Button
    $("#menuBtn").addEventListener("click", (e)=>{
      e.stopPropagation();
      const isOpen = $("#menu").classList.contains('open');
      openMenu(!isOpen);
    });
    // Menü-Auswahl + Sprung + Klicks außerhalb
    document.addEventListener("click", (e)=>{
      // HEUTE springen im Menü
      if (e.target.closest('#menuJump')){
        if(selectedKid) scrollToKidToday(selectedKid);
        return;
      }
      // Person wählen
      const item = e.target.closest('.menu-item');
      if(item){
        selectedKid = item.getAttribute('data-name') || "";
        saveJSON("jl_selected_kid", selectedKid);
        render();          // Seite inkl. Highlights
        renderMenu();      // Menü mit Jetzt-Box aktualisieren
        openMenu(true);    // Menü offen lassen (Button sichtbar)
        return;
      }
      // Außerhalb -> Menü schließen
      if (!e.target.closest('#menu') && !e.target.closest('#menuBtn')) {
        openMenu(false);
      }
    });
    // Filter-Chip X
    $("#activeFilter").addEventListener("click", (e)=>{
      if(e.target.closest('.clear-x')){
        selectedKid = "";
        saveJSON("jl_selected_kid", selectedKid);
        renderMenu();
        render();
      }
    });

    render();
    renderMenu();
    $("#app").addEventListener("click", onAppClick);
    watchMonth();
  });
})();