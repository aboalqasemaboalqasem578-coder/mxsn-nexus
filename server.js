const express=require('express');
const cors=require('cors');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const jwt=require('jsonwebtoken');
const multer=require('multer');
const bcrypt=require('bcryptjs');

const app=express();
const PORT=Number(process.env.PORT||3000);
const JWT_SECRET=process.env.JWT_SECRET||'CHANGE_ME_MXSN_V3_SECRET';
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'123456';
const CORS_ORIGIN=process.env.CORS_ORIGIN||'*';
const ROOT=__dirname, DATA_DIR=path.join(ROOT,'data'), DATA_FILE=path.join(DATA_DIR,'store.json'), UPLOADS=path.join(ROOT,'uploads'), PUBLIC=path.join(ROOT,'public');
fs.mkdirSync(DATA_DIR,{recursive:true}); fs.mkdirSync(UPLOADS,{recursive:true}); fs.mkdirSync(PUBLIC,{recursive:true});
function load(){try{return JSON.parse(fs.readFileSync(DATA_FILE,'utf8'))}catch{return {settings:{},products:[],orders:[]}}}
function save(x){const t=DATA_FILE+'.tmp';fs.writeFileSync(t,JSON.stringify(x,null,2));fs.renameSync(t,DATA_FILE)}
function id(p){return `${p}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`}
function safeProduct(p){return {id:p.id,name:p.name,description:p.description,price:p.price,currency:p.currency||'USD',imageUrl:p.imageUrl||'',active:p.active!==false,fileName:p.fileName||''}}
function auth(req,res,next){const h=req.headers.authorization||'';const token=h.startsWith('Bearer ')?h.slice(7):'';try{req.admin=jwt.verify(token,JWT_SECRET);next()}catch{res.status(401).json({error:'غير مصرح'})}}
function origin(req){return `${req.protocol}://${req.get('host')}`}
app.use(cors({origin:CORS_ORIGIN==='*'?true:CORS_ORIGIN.split(',').map(x=>x.trim())}));
app.use(express.json({limit:'2mb'}));
app.use(express.static(PUBLIC));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'MXSN Nexus Backend v3'}));
app.get('/api/store',(req,res)=>{const s=load();res.json({settings:s.settings,products:s.products.filter(p=>p.active!==false).map(safeProduct)})});
app.post('/api/admin/login',async(req,res)=>{const password=String(req.body?.password||'');const ok=await bcrypt.compare(password,await bcrypt.hash(ADMIN_PASSWORD,10));if(!ok)return res.status(401).json({error:'كلمة المرور غير صحيحة'});res.json({token:jwt.sign({role:'admin'},JWT_SECRET,{expiresIn:'7d'})})});
app.get('/api/admin/dashboard',auth,(req,res)=>{const s=load();res.json({settings:s.settings,products:s.products.map(safeProduct),orders:s.orders})});
app.put('/api/admin/settings',auth,(req,res)=>{const s=load(),b=req.body||{},fields=['name','tag','description','currency','maintenanceMessage','paymentProvider','paymentAccount','paymentInstructions'];for(const f of fields)if(typeof b[f]==='string')s.settings[f]=b[f];if(typeof b.maintenance==='boolean')s.settings.maintenance=b.maintenance;save(s);res.json(s.settings)});
app.post('/api/orders',(req,res)=>{const s=load();if(s.settings.maintenance)return res.status(503).json({error:s.settings.maintenanceMessage||'المتجر تحت الصيانة'});const b=req.body||{},p=s.products.find(x=>x.id===b.productId&&x.active!==false);if(!p)return res.status(404).json({error:'المنتج غير موجود'});const transferId=String(b.transferId||'').trim(),amount=Number(b.amount);if(transferId.length<3)return res.status(400).json({error:'أدخل رقم/معرّف التحويل'});if(!Number.isFinite(amount)||amount<=0)return res.status(400).json({error:'مبلغ غير صالح'});const o={id:id('ORD'),productId:p.id,productName:p.name,price:p.price,currency:p.currency||s.settings.currency||'USD',amount,transferId,customerName:String(b.customerName||'').trim(),customerContact:String(b.customerContact||'').trim(),status:'payment_submitted',createdAt:new Date().toISOString(),deliveryUrl:''};s.orders.unshift(o);save(s);res.status(201).json({orderId:o.id,status:o.status,message:'تم إرسال الطلب وبانتظار المراجعة.'})});
app.get('/api/orders/:id',(req,res)=>{const o=load().orders.find(x=>x.id===req.params.id);if(!o)return res.status(404).json({error:'الطلب غير موجود'});res.json({id:o.id,status:o.status,productName:o.productName,deliveryUrl:o.status==='paid'?o.deliveryUrl:'',updatedAt:o.updatedAt||''})});
app.put('/api/admin/orders/:id/status',auth,(req,res)=>{const allowed=['payment_submitted','paid','rejected','refunded'],status=req.body?.status;if(!allowed.includes(status))return res.status(400).json({error:'حالة غير صالحة'});const s=load(),o=s.orders.find(x=>x.id===req.params.id);if(!o)return res.status(404).json({error:'الطلب غير موجود'});o.status=status;o.updatedAt=new Date().toISOString();if(status==='paid'){const p=s.products.find(x=>x.id===o.productId);if(!p?.fileName)return res.status(400).json({error:'لا يوجد ملف للمنتج. ارفع ملف المنتج أولًا.'});o.deliveryUrl=`${origin(req)}/api/download/${encodeURIComponent(o.id)}`}save(s);res.json(o)});
const storage=multer.diskStorage({destination:(req,file,cb)=>cb(null,UPLOADS),filename:(req,file,cb)=>{const ext=path.extname(file.originalname).toLowerCase();const base=path.basename(file.originalname,ext).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,60)||'file';cb(null,`${Date.now()}-${base}${ext}`)}});const upload=multer({storage,limits:{fileSize:100*1024*1024}});
app.post('/api/admin/products',auth,upload.single('file'),(req,res)=>{const s=load(),b=req.body||{},price=Number(b.price);if(!String(b.name||'').trim()||!Number.isFinite(price)||price<0)return res.status(400).json({error:'بيانات المنتج غير صالحة'});const p={id:id('PRD'),name:String(b.name).trim(),description:String(b.description||''),price,currency:String(b.currency||s.settings.currency||'USD'),imageUrl:String(b.imageUrl||''),active:b.active!=='false',fileName:req.file?.filename||''};s.products.unshift(p);save(s);res.status(201).json(safeProduct(p))});
app.put('/api/admin/products/:id',auth,upload.single('file'),(req,res)=>{const s=load(),p=s.products.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'المنتج غير موجود'});const b=req.body||{};if(b.name!==undefined)p.name=String(b.name);if(b.description!==undefined)p.description=String(b.description);if(b.price!==undefined)p.price=Number(b.price);if(b.currency!==undefined)p.currency=String(b.currency);if(b.imageUrl!==undefined)p.imageUrl=String(b.imageUrl);if(b.active!==undefined)p.active=b.active!=='false';if(req.file){if(p.fileName)try{fs.unlinkSync(path.join(UPLOADS,p.fileName))}catch{}p.fileName=req.file.filename}save(s);res.json(safeProduct(p))});
app.delete('/api/admin/products/:id',auth,(req,res)=>{const s=load(),i=s.products.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'المنتج غير موجود'});const p=s.products[i];if(p.fileName)try{fs.unlinkSync(path.join(UPLOADS,p.fileName))}catch{}s.products.splice(i,1);save(s);res.json({ok:true})});
app.get('/api/download/:orderId',(req,res)=>{const s=load(),o=s.orders.find(x=>x.id===req.params.orderId);if(!o||o.status!=='paid')return res.status(403).send('الرابط غير متاح');const p=s.products.find(x=>x.id===o.productId);if(!p?.fileName)return res.status(404).send('ملف المنتج غير موجود');const f=path.join(UPLOADS,p.fileName);if(!fs.existsSync(f))return res.status(404).send('ملف المنتج غير موجود');res.download(f,p.name+path.extname(f))});
app.get('*',(req,res)=>res.sendFile(path.join(PUBLIC,'index.html')));
app.listen(PORT,()=>console.log(`MXSN Nexus v3 running on ${PORT}`));
