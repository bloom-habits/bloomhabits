/* ==========================================================================
   server.js — серверная часть Habits (без зависимостей, Node.js 18+).
   Делает:
   1) отдаёт index.html и подставляет настройки бота вместо маркера HABITS_CONF
   2) POST /api/settings — сохраняет настройки напоминаний (проверка подписи initData)
   3) каждую минуту шлёт напоминания через бота (с учётом часового пояса и «тихих часов»)
   4) бот: /start присылает кнопку открытия Mini App; учёт рефералов (startapp=ref_<id>)
   Запуск: cp .env.example .env -> заполнить -> node server.js
   ========================================================================== */
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');

/* ---------- Настройки из .env (читаем вручную, без dotenv) ---------- */
try{fs.readFileSync(path.join(__dirname,'.env'),'utf8').split('\n').forEach(l=>{
  const m=l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);if(m&&!(m[1] in process.env))process.env[m[1]]=m[2]})}catch(e){}
const TOKEN=process.env.BOT_TOKEN||'',BOT=process.env.BOT_USERNAME||'',APP=process.env.APP_SHORT_NAME||'';
const PORT=+process.env.PORT||3000,DB=path.join(__dirname,'data.json');
if(!TOKEN)console.warn('⚠ BOT_TOKEN не задан: проверка подписи и напоминания не работают');

/* ---------- Простая база: data.json {users:{id:{...настройки}}} ---------- */
let db={users:{}};try{db=JSON.parse(fs.readFileSync(DB,'utf8'))}catch(e){}
const saveDb=()=>fs.writeFile(DB,JSON.stringify(db),()=>{});

/* ---------- Проверка подписи initData (https://core.telegram.org/bots/webapps) ---------- */
function checkInit(initData){
  if(!TOKEN||!initData)return null;
  const p=new URLSearchParams(initData),hash=p.get('hash');p.delete('hash');
  const str=[...p.entries()].map(([k,v])=>k+'='+v).sort().join('\n');
  const secret=crypto.createHmac('sha256','WebAppData').update(TOKEN).digest();
  const calc=crypto.createHmac('sha256',secret).update(str).digest('hex');
  if(calc!==hash||Date.now()/1000-(+p.get('auth_date')||0)>86400)return null;
  try{return JSON.parse(p.get('user'))}catch(e){return null}
}

/* ---------- Telegram Bot API ---------- */
const tgApi=(m,b)=>fetch(`https://api.telegram.org/bot${TOKEN}/${m}`,{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({ok:false,e}));
const appUrl=()=>BOT?`https://t.me/${BOT}${APP?'/'+APP:''}`:'';

/* ---------- Тексты бота (RU/EN) ---------- */
const TXT={
  ru:{start:'Привет! Я помогу выработать полезные привычки. Открывай трекер 👇',open:'Открыть Habits',
      remind:['Пора отметить привычки на сегодня ✅','Как дела с привычками? Загляни в трекер 💪','Маленький шаг сегодня — большой результат завтра 🌱']},
  en:{start:'Hi! I will help you build good habits. Open the tracker 👇',open:'Open Habits',
      remind:['Time to check in your habits today ✅','How are your habits going? Take a look 💪','A small step today is a big result tomorrow 🌱']}
};

/* ---------- Напоминания: проверка раз в минуту ---------- */
function localHM(tz){
  try{return new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())}
  catch(e){return new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())}
}
/* «Тихие часы» могут переходить через полночь (22:00–08:00) */
const inQuiet=(n,s,e)=>s<=e?(n>=s&&n<e):(n>=s||n<e);
setInterval(()=>{
  if(!TOKEN)return;
  const now=Date.now();
  for(const [id,u] of Object.entries(db.users)){
    if(!u.on||!u.time)continue;
    const hm=localHM(u.tz),day=hm+'|'+new Date().toISOString().slice(0,10);
    if(hm!==u.time||u.sent===day)continue;
    if(u.qOn&&inQuiet(hm,u.qs,u.qe))continue;
    const t=TXT[u.lang==='en'?'en':'ru'];
    u.sent=day;
    tgApi('sendMessage',{chat_id:id,text:t.remind[now%t.remind.length],
      reply_markup:appUrl()?{inline_keyboard:[[{text:t.open,url:appUrl()}]]}:undefined}).then(r=>{
        /* пользователь заблокировал бота — отключаем напоминания */
        if(r&&r.ok===false&&r.error_code===403){u.on=false;saveDb()}});
  }
  saveDb();
},60000);

/* ---------- Бот: long polling (webhook и публичный адрес не нужны) ---------- */
async function poll(offset){
  if(!TOKEN)return;
  const r=await tgApi('getUpdates',{offset,timeout:30,allowed_updates:['message']});
  let next=offset;
  for(const up of (r.result||[])){
    next=up.update_id+1;
    const m=up.message;if(!m||!m.text||!/^\/start/.test(m.text))continue;
    const t=TXT[/^(ru|uk|be|kk)/.test(m.from.language_code||'ru')?'ru':'en'];
    tgApi('sendMessage',{chat_id:m.chat.id,text:t.start,
      reply_markup:appUrl()?{inline_keyboard:[[{text:t.open,url:appUrl()}]]}:undefined});
  }
  setTimeout(()=>poll(next),r.ok?0:5000);
}
poll(0);

/* ---------- HTTP ---------- */
const send=(res,code,body,type)=>{res.writeHead(code,{'Content-Type':type||'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(body)};
http.createServer((req,res)=>{
  /* Главная: подставляем настройки бота вместо маркера HABITS_CONF */
  if(req.method==='GET'&&(req.url==='/'||req.url.startsWith('/?')||req.url==='/index.html')){
    try{
      const conf='window.HABITS_CONF='+JSON.stringify({bot:BOT,app:APP}).replace(/</g,'\\u003c')+';';
      return send(res,200,fs.readFileSync(path.join(__dirname,'index.html'),'utf8').replace('/*HABITS_CONF*/',conf),'text/html; charset=utf-8');
    }catch(e){return send(res,500,'index.html not found','text/plain')}
  }
  /* Настройки напоминаний от приложения */
  if(req.method==='POST'&&req.url==='/api/settings'){
    let body='';req.on('data',c=>{body+=c;if(body.length>1e5)req.destroy()});
    req.on('end',()=>{
      let d;try{d=JSON.parse(body)}catch(e){return send(res,400,'{"ok":false}')}
      const user=checkInit(d.initData);
      if(!user)return send(res,401,'{"ok":false,"error":"bad initData"}');
      const old=db.users[user.id]||{},ref=/^ref_(\d+)$/.exec(d.ref||'');
      db.users[user.id]=Object.assign(old,{
        on:!!d.on,time:/^\d\d:\d\d$/.test(d.time)?d.time:'09:00',qOn:!!d.qOn,
        qs:/^\d\d:\d\d$/.test(d.qs)?d.qs:'22:00',qe:/^\d\d:\d\d$/.test(d.qe)?d.qe:'08:00',
        lang:d.lang==='en'?'en':'ru',tz:String(d.tz||'UTC').slice(0,64)});
      /* Реферал засчитывается один раз и не самому себе */
      if(ref&&!old.refBy&&ref[1]!==String(user.id)){
        db.users[user.id].refBy=ref[1];
        const inv=db.users[ref[1]]||(db.users[ref[1]]={});inv.refCount=(inv.refCount||0)+1;
      }
      saveDb();send(res,200,'{"ok":true}');
    });return;
  }
  if(req.url==='/health')return send(res,200,'ok','text/plain');
  send(res,404,'Not found','text/plain');
}).listen(PORT,()=>console.log('Habits: http://localhost:'+PORT));
