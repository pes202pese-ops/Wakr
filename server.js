// وكر الأوغاد - سيرفر بدون أي مكتبات خارجية (Node 18+)
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000, FILE=process.env.DATA_FILE||path.join(__dirname,'data.json');
const CITIES=['غزة','الدوحة','دبي','طهران','طرابلس','مدينة العصابات'], FLY=[0,400,400,800,1000,300];
const CRIMES=[{n:'سرقة حقيبة',c:2,min:20,max:60,xp:3,p:.9},{n:'سطو على متجر',c:4,min:80,max:200,xp:7,p:.75},{n:'سرقة سيارة',c:6,min:200,max:500,xp:12,p:.6},{n:'سطو على بنك',c:10,min:700,max:1800,xp:25,p:.4}];
const SHOP={knife:{n:'سكين',t:'atk',v:5,price:300},pistol:{n:'مسدس',t:'atk',v:15,price:1500},armor:{n:'درع',t:'def',v:10,price:1000},bread:{n:'خبز (+20 صحة)',t:'heal',v:20,price:50}};
let db={users:{},tokens:{},chat:[]};
try{db=JSON.parse(fs.readFileSync(FILE))}catch(e){}
let dirty=false;const save=()=>{dirty=true};
setInterval(()=>{if(dirty){dirty=false;fs.writeFile(FILE,JSON.stringify(db),()=>{})}},3000);
const maxE=u=>100,maxC=u=>20+u.level*2,maxH=u=>100+u.level*10,need=u=>50*u.level;
function tick(u){const t=Date.now(),d=(t-u.t)/1000;u.t=t;
 u.energy=Math.min(maxE(u),u.energy+d/30);u.courage=Math.min(maxC(u),u.courage+d/60);
 if(u.hospitalUntil<=t)u.health=Math.min(maxH(u),u.health+d/20);
 if(u.trip&&u.trip.until<=t){u.city=u.trip.to;u.trip=null}}
function pub(u){tick(u);return{name:u.name,level:u.level,xp:u.xp,need:need(u),cash:Math.floor(u.cash),gold:u.gold,
 energy:Math.floor(u.energy),maxE:maxE(u),courage:Math.floor(u.courage),maxC:maxC(u),health:Math.floor(u.health),maxH:maxH(u),
 city:u.city,cityName:CITIES[u.city],trip:u.trip,hospitalUntil:u.hospitalUntil,jailUntil:u.jailUntil,inv:u.inv,wins:u.wins}}
const hash=(p,s)=>crypto.scryptSync(p,s,32).toString('hex');
function mk(name,pass){const s=crypto.randomBytes(8).toString('hex');
 return{name,salt:s,pw:hash(pass,s),cash:500,gold:4,level:1,xp:0,energy:100,courage:20,health:100,city:0,trip:null,
 hospitalUntil:0,jailUntil:0,inv:{atk:0,def:0},wins:0,t:Date.now(),last:Date.now()}}
function addXp(u,x){u.xp+=x;while(u.xp>=need(u)){u.xp-=need(u);u.level++;u.health=maxH(u)}}
const busy=u=>u.trip?'أنت مسافر':u.hospitalUntil>Date.now()?'أنت في المستشفى':u.jailUntil>Date.now()?'أنت في السجن':null;
const rnd=(a,b)=>Math.floor(a+Math.random()*(b-a+1));
const API={
 'POST /register':(b)=>{const n=String(b.u||'').trim().slice(0,16),p=String(b.p||'');
  if(n.length<3||p.length<4)throw'الاسم 3 أحرف على الأقل وكلمة السر 4';
  if(db.users[n.toLowerCase()])throw'الاسم مستخدم';
  db.users[n.toLowerCase()]=mk(n,p);return login(n,p)},
 'POST /login':b=>login(String(b.u||''),String(b.p||'')),
 'GET /me':(b,u)=>pub(u),
 'GET /crimes':()=>CRIMES,
 'POST /crime':(b,u)=>{const e=busy(u);if(e)throw e;const c=CRIMES[b.id];if(!c)throw'جريمة غير معروفة';tick(u);
  if(u.courage<c.c)throw'شجاعتك لا تكفي';u.courage-=c.c;
  if(Math.random()<c.p+u.level*.005){const m=rnd(c.min,c.max);u.cash+=m;addXp(u,c.xp);return{ok:1,msg:`نجحت: ${c.n}. ربحت ${m} و${c.xp} خبرة`}}
  u.jailUntil=Date.now()+c.c*10000;return{ok:0,msg:`قُبض عليك! سجن ${c.c*10} ثانية`}},
 'POST /heal':(b,u)=>{tick(u);const c=Math.ceil((maxH(u)-u.health)*4);if(c<=0)throw'صحتك كاملة';if(u.cash<c)throw'تحتاج '+c;
  u.cash-=c;u.health=maxH(u);u.hospitalUntil=0;return{msg:'تم العلاج'}},
 'POST /bail':(b,u)=>{const s=Math.ceil((u.jailUntil-Date.now())/1000);if(s<=0)throw'لست مسجوناً';const c=s*5;if(u.cash<c)throw'الكفالة '+c;u.cash-=c;u.jailUntil=0;return{msg:'خرجت بالكفالة'}},
 'GET /shop':()=>SHOP,
 'POST /buy':(b,u)=>{const e=busy(u);if(e)throw e;const i=SHOP[b.item];if(!i)throw'غير موجود';if(u.cash<i.price)throw'المال لا يكفي';
  u.cash-=i.price;if(i.t=='heal'){tick(u);u.health=Math.min(maxH(u),u.health+i.v)}else u.inv[i.t]+=i.v;return{msg:'اشتريت '+i.n}},
 'GET /players':(b,u)=>Object.values(db.users).filter(x=>x!==u&&x.city==u.city&&!x.trip).slice(0,30).map(x=>({name:x.name,level:x.level,hp:x.hospitalUntil>Date.now()})),
 'POST /attack':(b,u)=>{const e=busy(u);if(e)throw e;const v=db.users[String(b.target||'').toLowerCase()];
  if(!v||v===u)throw'خصم غير صالح';if(v.city!=u.city||v.trip)throw'الخصم ليس معك في نفس المدينة';tick(u);tick(v);
  if(v.hospitalUntil>Date.now())throw'الخصم في المستشفى';if(u.energy<10)throw'تحتاج 10 طاقة';u.energy-=10;
  const a=u.level*3+u.inv.atk+rnd(0,20),d=v.level*3+v.inv.def+rnd(0,20);
  if(a>d){const s=Math.floor(v.cash*.1);v.cash-=s;u.cash+=s;v.health-=rnd(20,40);u.wins++;addXp(u,10);
   if(v.health<=0){v.health=1;v.hospitalUntil=Date.now()+60000}return{ok:1,msg:`فزت على ${v.name} وسرقت ${s}`}}
  u.health-=rnd(10,25);if(u.health<=0){u.health=1;u.hospitalUntil=Date.now()+60000}return{ok:0,msg:`خسرت أمام ${v.name}`}},
 'GET /flights':(b,u)=>CITIES.map((n,i)=>({id:i,n,price:FLY[i],secs:FLY[i]/10+10})),
 'POST /fly':(b,u)=>{const e=busy(u);if(e)throw e;const i=b.to|0;if(i<0||i>=CITIES.length||i==u.city)throw'وجهة غير صالحة';
  if(u.cash<FLY[i])throw'المال لا يكفي';u.cash-=FLY[i];u.trip={to:i,until:Date.now()+(FLY[i]/10+10)*1000};return{msg:'أقلعت إلى '+CITIES[i]}},
 'GET /chat':()=>db.chat.slice(-40),
 'POST /chat':(b,u)=>{const t=String(b.t||'').trim().slice(0,200);if(!t)throw'اكتب رسالة';db.chat.push({n:u.name,t,at:Date.now()});if(db.chat.length>200)db.chat.shift();return{msg:'تم'}},
 'GET /rank':()=>Object.values(db.users).sort((a,b)=>b.level-a.level||b.wins-a.wins).slice(0,20).map(x=>({name:x.name,level:x.level,wins:x.wins}))};
function login(n,p){const u=db.users[n.toLowerCase()];if(!u||hash(p,u.salt)!==u.pw)throw'بيانات الدخول خاطئة';
 const t=crypto.randomBytes(24).toString('hex');db.tokens[t]=n.toLowerCase();save();return{token:t}}
const MIME={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css'};
http.createServer((req,res)=>{
 const url=req.url.split('?')[0];
 if(url.startsWith('/api/')){let body='';req.on('data',c=>{body+=c;if(body.length>1e5)req.destroy()});
  req.on('end',()=>{const send=(c,o)=>{res.writeHead(c,{'Content-Type':'application/json;charset=utf-8'});res.end(JSON.stringify(o))};
   try{const k=req.method+' '+url.slice(4),f=API[k];if(!f)return send(404,{error:'غير موجود'});
    const pubK=k.endsWith('/login')||k.endsWith('/register');let u=null;
    if(!pubK){const t=(req.headers.authorization||'').replace('Bearer ','');u=db.users[db.tokens[t]];if(!u)return send(401,{error:'سجّل الدخول'});u.last=Date.now()}
    const r=f(body?JSON.parse(body):{},u);save();send(200,r)}catch(e){send(400,{error:typeof e=='string'?e:'خطأ'})}});return}
 fs.readFile(path.join(__dirname,'index.html'),(e,d)=>{if(e){res.writeHead(404);return res.end('404')}res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(d)});
}).listen(PORT,()=>console.log('السيرفر يعمل على المنفذ '+PORT));
