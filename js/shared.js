/* ============================================================
   SHARED HELPERS
   Loaded on every page, after firebase-config.js.
   Requires each page to include the standard toast/modal markup:
     <div class="modal-backdrop" id="modal-backdrop"><div class="modal" id="modal-content"></div></div>
     <div class="toast" id="toast"></div>
============================================================ */

/* ---------- formatting ---------- */
function money(n){ return '₱' + Number(n).toLocaleString('en-PH',{minimumFractionDigits:0}); }
function fmtDate(d){ if(!d) return ''; const dt = new Date(d+'T00:00:00'); return dt.toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}); }
function today(){ return new Date().toISOString().slice(0,10); }
function slug(str){ return str.toLowerCase().trim().replace(/[^a-z0-9]+/g,'.').replace(/(^\.|\.$)/g,''); }
function genPassword(){
  const letters='BCDFGHJKLMNPQRSTVWXYZ', digits='0123456789';
  let out='';
  for(let i=0;i<3;i++) out+=letters[Math.floor(Math.random()*letters.length)];
  for(let i=0;i<3;i++) out+=digits[Math.floor(Math.random()*digits.length)];
  return out;
}

/* ---------- toast / modal ---------- */
let toastTimer;
function showToast(msg, type){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show '+(type||'');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 2600);
}
function openModal(html){
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-backdrop').classList.add('open');
}
function closeModal(){
  document.getElementById('modal-backdrop').classList.remove('open');
  document.getElementById('modal-content').innerHTML = '';
}
function wireModalBackdrop(){
  document.getElementById('modal-backdrop').addEventListener('click', (e)=>{
    if(e.target.id==='modal-backdrop') closeModal();
  });
}

/* ---------- state ---------- */
let session = null;       // {uid, role, name, section, studentId}
let SETTINGS = {amountDue:500, deadline:'2026-12-15', schoolYear:'2026-2027'};

const ROLE_LABEL = {admin:'Admin', principal:'Principal', adviser:'Adviser', parent:'Parent', student:'Student'};
const HOME_PAGE = {admin:'admin.html', principal:'principal.html', adviser:'adviser.html', parent:'student-parent.html', student:'student-parent.html'};

async function loadSettings(){
  try{
    const doc = await fsDb.collection('settings').doc('main').get();
    if(doc.exists) SETTINGS = doc.data();
  }catch(e){ console.error('settings load failed', e); }
}

/* ============================================================
   PAGE GUARD
   Call at the top of every non-login page:
     guardPage(['admin'], (s)=>{ ...start the page... });
   Redirects to login.html if signed out, or to that role's own
   home page if signed in as a different role (both enforced again
   server-side by Firestore Security Rules - this is UX only).
============================================================ */
function guardPage(allowedRoles, onReady){
  auth.onAuthStateChanged(async (user)=>{
    if(!user){ window.location.href = 'index.html'; return; }
    const accDoc = await fsDb.collection('accounts').doc(user.uid).get();
    if(!accDoc.exists){
      await auth.signOut();
      window.location.href = 'index.html';
      return;
    }
    const acc = accDoc.data();
    session = {uid:user.uid, role:acc.role, name:acc.name, section:acc.section||null, studentId:acc.studentId||null};
    if(!allowedRoles.includes(session.role)){
      window.location.href = HOME_PAGE[session.role] || 'index.html';
      return;
    }
    await loadSettings();
    setRolePill();
    wireLogout();
    wireModalBackdrop();
    startIdleWatcher();
    onReady(session);
  });
}
function setRolePill(){
  const el = document.getElementById('role-pill-text');
  if(!el) return;
  let pillText = ROLE_LABEL[session.role];
  if(session.role==='adviser') pillText += ' · '+session.section;
  pillText += ' · '+session.name;
  el.textContent = pillText;
}
function wireLogout(){
  const btn = document.getElementById('logout-btn');
  if(!btn) return;
  btn.addEventListener('click', async ()=>{
    await auth.signOut();
    window.location.href = 'index.html';
  });
}
const IDLE_LIMIT_MS = 15 * 60 * 1000; // 15 minutes
let idleTimer;
function resetIdleTimer(){
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async ()=>{
    await auth.signOut();
    window.location.href = 'index.html';
  }, IDLE_LIMIT_MS);
}
function startIdleWatcher(){
  ['mousemove','keydown','click','scroll','touchstart'].forEach(evt=>{
    document.addEventListener(evt, resetIdleTimer);
  });
  resetIdleTimer();
}
/* ============================================================
   DATA HELPERS (Firestore queries, scoped per role by design)
============================================================ */
async function fetchAllStudents(){
  const snap = await fsDb.collection('students').get();
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}
async function fetchSectionStudents(section){
  const snap = await fsDb.collection('students').where('section','==',section).get();
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}
async function fetchOneStudent(studentId){
  const doc = await fsDb.collection('students').doc(studentId).get();
  return doc.exists ? {id:doc.id, ...doc.data()} : null;
}
async function fetchAllPayments(){
  const snap = await fsDb.collection('payments').orderBy('date','desc').get();
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}
async function fetchSectionPayments(section){
  const snap = await fsDb.collection('payments').where('section','==',section).get();
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}
async function fetchStudentPayments(studentId){
  const snap = await fsDb.collection('payments').where('studentId','==',studentId).get();
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}
async function fetchOwnSubmissions(studentId){
  const snap = await fsDb.collection('paymentSubmissions').where('studentId','==',studentId).get();
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}
async function fetchPendingSubmissions(){
  const snap = await fsDb.collection('paymentSubmissions').where('status','==','pending').get();
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}
function studentPaidAmount(studentId, payments){
  return payments.filter(p=>p.studentId===studentId).reduce((s,p)=>s+Number(p.amount),0);
}
function studentStatus(paid){
  if(paid<=0) return 'unpaid';
  if(paid<SETTINGS.amountDue) return 'partial';
  return 'paid';
}
function statusPill(status){
  const map = {paid:['✓','Fully paid'], partial:['◐','Partial'], unpaid:['✕','Unpaid']};
  const [icon,label] = map[status];
  return `<span class="status-pill ${status}">${icon} ${label}</span>`;
}
function computeStats(students, payments){
  let paid=0, partial=0, unpaid=0;
  students.forEach(s=>{
    const st = studentStatus(studentPaidAmount(s.id, payments));
    if(st==='paid') paid++; else if(st==='partial') partial++; else unpaid++;
  });
  return {total:students.length, paid, partial, unpaid};
}

/* ============================================================
   SHARED MARKUP FRAGMENTS
============================================================ */
function studentsTable(list, payments, opts){
  opts = opts||{};
  if(!list.length) return `<div class="empty-state"><div class="big">🗂️</div>No students yet. Add your first student to get started.</div>`;
  return `
  <table>
    <thead><tr><th>Student</th><th>ID</th><th>Grade &amp; Section</th><th>Balance</th><th>Status</th><th></th></tr></thead>
    <tbody>
      ${list.map(s=>{
        const paid = studentPaidAmount(s.id, payments);
        const bal = Math.max(SETTINGS.amountDue-paid,0);
        const status = studentStatus(paid);
        return `<tr>
          <td><strong>${s.name}</strong></td>
          <td class="id-mono">${s.id}</td>
          <td>${s.grade} · ${s.section}</td>
          <td>${money(bal)}</td>
          <td>${statusPill(status)}</td>
          <td style="text-align:right;white-space:nowrap;">
              ${opts.showAccount!==false?`<button class="btn sm ghost" data-qr="${s.id}">Account</button>`:''}
              ${opts.edit?`<button class="btn sm ghost" data-edit="${s.id}">Edit</button>`:''}
              ${opts.edit?`<button class="btn sm ghost danger" data-delete="${s.id}">Delete</button>`:''}
         </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}
function wireQrButtons(root){
  (root||document).querySelectorAll('[data-qr]').forEach(b=>b.addEventListener('click', ()=>openQrModal(b.dataset.qr)));
}
function wireDeleteButtons(root){
  (root||document).querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click', ()=>confirmDeleteStudent(b.dataset.delete)));
}
async function confirmDeleteStudent(studentId){
  const s = await fetchOneStudent(studentId);
  const isAdmin = session && session.role === 'admin';
  if(!s) return;
  openModal(`
    <h3>Delete student?</h3>
    <div class="sub">${s.name} · ${s.id}</div>
    <div class="login-note" style="margin-top:8px;">This permanently removes the student's record and payment history. This cannot be undone.</div>
    <div class="modal-actions">
      <button class="btn ghost" id="del-cancel">Cancel</button>
      <button class="btn danger" id="del-confirm">Delete student</button>
    </div>
  `);
  document.getElementById('del-cancel').addEventListener('click', closeModal);
  document.getElementById('del-confirm').addEventListener('click', async ()=>{
    try{
      const paySnap = await fsDb.collection('payments').where('studentId','==',studentId).get();
      const batch = fsDb.batch();
      paySnap.docs.forEach(d=>batch.delete(d.ref));
      batch.delete(fsDb.collection('students').doc(studentId));
      await batch.commit();
      closeModal();
      showToast('Student deleted.', 'success');
      if(typeof reloadCurrentPage === 'function') reloadCurrentPage();
    }catch(e){
      showToast('Delete failed: '+(e.message||'try again'), 'error');
    }
  });
}
async function openQrModal(studentId){
  const s = await fetchOneStudent(studentId);
  const isAdmin = session && session.role === 'admin';
  const credsHtml = isAdmin ? ((s.studentPassword || s.parentPassword) ? `
    <div class="staff-row"><div><strong>Student login</strong><br>Username: <span class="id-mono">${s.id}</span></div><span class="id-mono">${s.studentPassword||'—'}</span></div>
    <div class="staff-row"><div><strong>Parent login</strong><br>Username: <span class="id-mono">${s.id}.parent</span></div><span class="id-mono">${s.parentPassword||'—'}</span></div>
  ` : `<div class="login-note" style="margin-top:8px;">Credentials for this account weren't saved (created before this feature). To help this student, use Delete then re-add them.</div>`) : '';
  openModal(`
    <h3>Student Account &amp; QR Code</h3>
    <div class="sub">${s.name} · ${s.grade} · Section ${s.section}</div>
    <div class="qr-box"><div id="qr-render"></div><div class="qr-id">${s.id}</div></div>
    ${credsHtml}
    <div class="login-note" style="margin-top:2px;">The QR code is for quick ID lookup, it does not contain the password.</div>
    <div class="modal-actions">
      <button class="btn ghost" id="qr-close">Close</button>
      <button class="btn navy" id="qr-print">🖶 Print / distribute</button>
    </div>
  `);
  setTimeout(()=>{
    document.getElementById('qr-render').innerHTML='';
    new QRCode(document.getElementById('qr-render'), {text:s.id, width:170, height:170, colorDark:'#4A0F1C', colorLight:'#ffffff'});
  },10);
  document.getElementById('qr-close').addEventListener('click', closeModal);
  document.getElementById('qr-print').addEventListener('click', ()=>window.print());
}

/* ============================================================
   DASHBOARD + REPORTS
   (shared by admin.html and principal.html)
============================================================ */
async function pageDashboard(readOnly){
  const students = await fetchAllStudents();
  const payments = await fetchAllPayments();
  const stats = computeStats(students, payments);
  const collected = payments.reduce((s,p)=>s+Number(p.amount),0);
  const pct = n => stats.total? Math.round(n/stats.total*100):0;
  return `
    <div class="page-header">
      <div class="page-eyebrow">${readOnly?'Principal · School Overview':'Admin · Dashboard'}</div>
      <h2>${readOnly?'School-wide payment status':'PTA Payment Overview'}</h2>
      <div class="page-desc">School Year ${SETTINGS.schoolYear} · Amount due per student: ${money(SETTINGS.amountDue)} · Deadline ${fmtDate(SETTINGS.deadline)}</div>
    </div>
    <div class="stat-row">
      <div class="stat-card"><div class="n">${stats.total}</div><div class="l">Total students</div></div>
      <div class="stat-card paid"><div class="n">${stats.paid}</div><div class="l">Fully paid</div></div>
      <div class="stat-card partial"><div class="n">${stats.partial}</div><div class="l">Partially paid</div></div>
      <div class="stat-card unpaid"><div class="n">${stats.unpaid}</div><div class="l">Unpaid</div></div>
    </div>
    <div class="bar-wrap">
      <h3>Collection breakdown · ${money(collected)} collected of ${money(SETTINGS.amountDue*stats.total)} expected</h3>
      <div class="bar-row"><div class="bar-label">Fully paid</div><div class="bar-track"><div class="bar-fill" style="width:${pct(stats.paid)}%;background:var(--green)"></div></div><div class="bar-count">${stats.paid}</div></div>
      <div class="bar-row"><div class="bar-label">Partial</div><div class="bar-track"><div class="bar-fill" style="width:${pct(stats.partial)}%;background:var(--amber)"></div></div><div class="bar-count">${stats.partial}</div></div>
      <div class="bar-row"><div class="bar-label">Unpaid</div><div class="bar-track"><div class="bar-fill" style="width:${pct(stats.unpaid)}%;background:var(--maroon)"></div></div><div class="bar-count">${stats.unpaid}</div></div>
    </div>
    <div class="panel">
      <div class="panel-head"><h3>All students</h3></div>
      ${studentsTable(students, payments, {edit:false})}
    </div>
  `;
}

async function pageReports(isAdmin){
  const students = await fetchAllStudents();
  const payments = await fetchAllPayments();
  const stats = computeStats(students, payments);
  const collected = payments.reduce((s,p)=>s+Number(p.amount),0);
  const tiles = [
    {ic:'📊', t:'Payment Summary', d:'Counts by status', key:'summary'},
    {ic:'💰', t:'Collection Report', d:'Total amount collected', key:'collection'},
    {ic:'⚠️', t:'Unpaid Report', d:'Students with no payment', key:'unpaid'},
    {ic:'🗓️', t:'Monthly Report', d:'Payments grouped by month', key:'monthly'},
    {ic:'🏫', t:'Grade / Section Report', d:'Breakdown by section', key:'section'},
  ];
  return `
    <div class="page-header">
      <div class="page-eyebrow">${isAdmin?'Admin':'Principal'} · Reports &amp; Summary</div>
      <h2>Reports</h2>
      <div class="page-desc">Click a report to preview it below, or export as CSV.</div>
    </div>
    <div class="report-grid">
      ${tiles.map(t=>`<div class="report-tile" data-report="${t.key}"><div class="ic">${t.ic}</div><div class="t">${t.t}</div><div class="d">${t.d}</div></div>`).join('')}
    </div>
    <div class="panel" id="report-output">
      <div class="panel-head"><h3>Payment Summary</h3><button class="btn sm gold" id="btn-export-csv">⬇ Export CSV</button></div>
      ${reportBody('summary', students, payments, stats, collected)}
    </div>
  `;
}
function reportBody(key, students, payments, stats, collected){
  if(key==='summary'){
    return `<div class="stat-row">
      <div class="stat-card"><div class="n">${stats.total}</div><div class="l">Total students</div></div>
      <div class="stat-card paid"><div class="n">${stats.paid}</div><div class="l">Fully paid</div></div>
      <div class="stat-card partial"><div class="n">${stats.partial}</div><div class="l">Partially paid</div></div>
      <div class="stat-card unpaid"><div class="n">${stats.unpaid}</div><div class="l">Unpaid</div></div>
    </div>`;
  }
  if(key==='collection'){
    return `<div class="stat-row">
      <div class="stat-card"><div class="n">${money(collected)}</div><div class="l">Total collected</div></div>
      <div class="stat-card"><div class="n">${money(SETTINGS.amountDue*stats.total)}</div><div class="l">Total expected</div></div>
      <div class="stat-card"><div class="n">${payments.length}</div><div class="l">Transactions</div></div>
    </div>`;
  }
  if(key==='unpaid'){
    const list = students.filter(s=>studentStatus(studentPaidAmount(s.id,payments))==='unpaid');
    return studentsTable(list, payments, {edit:false});
  }
  if(key==='monthly'){
    const groups = {};
    payments.forEach(p=>{ const m=p.date.slice(0,7); groups[m]=(groups[m]||0)+Number(p.amount); });
    const keys = Object.keys(groups).sort();
    if(!keys.length) return `<div class="empty-state">No payments recorded yet.</div>`;
    return `<table><thead><tr><th>Month</th><th>Amount collected</th></tr></thead><tbody>
      ${keys.map(k=>`<tr><td>${k}</td><td>${money(groups[k])}</td></tr>`).join('')}
    </tbody></table>`;
  }
  if(key==='section'){
    const sections = [...new Set(students.map(s=>s.section))];
    return `<table><thead><tr><th>Grade / Section</th><th>Students</th><th>Paid</th><th>Partial</th><th>Unpaid</th></tr></thead><tbody>
      ${sections.map(sec=>{
        const list = students.filter(s=>s.section===sec);
        const st = computeStats(list, payments);
        return `<tr><td>${list[0].grade} · ${sec}</td><td>${st.total}</td><td>${st.paid}</td><td>${st.partial}</td><td>${st.unpaid}</td></tr>`;
      }).join('')}
    </tbody></table>`;
  }
}
function exportCsv(key, students, payments){
  let rows = [];
  if(key==='unpaid'){
    rows.push(['Student','ID','Grade','Section','Balance']);
    students.filter(s=>studentStatus(studentPaidAmount(s.id,payments))==='unpaid').forEach(s=>rows.push([s.name,s.id,s.grade,s.section,SETTINGS.amountDue]));
  } else if(key==='monthly'){
    const groups={};
    payments.forEach(p=>{ const m=p.date.slice(0,7); groups[m]=(groups[m]||0)+Number(p.amount); });
    rows.push(['Month','Amount collected']);
    Object.keys(groups).sort().forEach(k=>rows.push([k, groups[k]]));
  } else if(key==='section'){
    rows.push(['Section','Students','Paid','Partial','Unpaid']);
    [...new Set(students.map(s=>s.section))].forEach(sec=>{
      const list = students.filter(s=>s.section===sec);
      const st = computeStats(list, payments);
      rows.push([sec, st.total, st.paid, st.partial, st.unpaid]);
    });
  } else if(key==='collection'){
    rows.push(['Date','Student','Method','Reference','Amount']);
    payments.forEach(p=>{
      const s = students.find(x=>x.id===p.studentId);
      rows.push([p.date, s?s.name:p.studentId, p.method, p.reference, p.amount]);
    });
  } else {
    rows.push(['Student','ID','Grade','Section','Paid','Balance','Status']);
    students.forEach(s=>{
      const paid = studentPaidAmount(s.id,payments);
      rows.push([s.name, s.id, s.grade, s.section, paid, Math.max(SETTINGS.amountDue-paid,0), studentStatus(paid)]);
    });
  }
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `pta-${key}-report.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Report exported as CSV.', 'success');
}
function wireReportEvents(){
  const main = document.getElementById('main');
  main.querySelectorAll('[data-report]').forEach(tile=>{
    tile.addEventListener('click', async ()=>{
      const key = tile.dataset.report;
      const students = await fetchAllStudents();
      const payments = await fetchAllPayments();
      const stats = computeStats(students, payments);
      const collected = payments.reduce((s,p)=>s+Number(p.amount),0);
      const titles = {summary:'Payment Summary', collection:'Collection Report', unpaid:'Unpaid Report', monthly:'Monthly Report', section:'Grade / Section Report'};
      document.getElementById('report-output').innerHTML = `
        <div class="panel-head"><h3>${titles[key]}</h3><button class="btn sm gold" id="btn-export-csv">⬇ Export CSV</button></div>
        ${reportBody(key, students, payments, stats, collected)}
      `;
      document.getElementById('btn-export-csv').addEventListener('click', ()=>exportCsv(key, students, payments));
      wireQrButtons(document.getElementById('report-output'));
    });
  });
  const exportBtn = document.getElementById('btn-export-csv');
  if(exportBtn) exportBtn.addEventListener('click', async ()=>{
    const students = await fetchAllStudents();
    const payments = await fetchAllPayments();
    exportCsv('summary', students, payments);
  });
}
