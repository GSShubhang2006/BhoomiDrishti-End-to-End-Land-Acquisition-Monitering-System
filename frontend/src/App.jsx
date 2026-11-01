import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Activity, ArrowRight, BriefcaseBusiness, Check, CheckCircle2, ChevronDown, CircleHelp, ClipboardCheck, Clock3, FileBarChart, FileCheck2, Home, Landmark, Layers3, MapPin, Menu, MoreHorizontal, Search, Settings, ShieldCheck, UsersRound, X, Plus, Bell } from 'lucide-react'
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'
import './forms.css'
import { archiveProject, getAuditLogs, getCurrentUser, getFieldOfficers, getFieldVerifications, getLandParcels, getNotifications, getProjects, getReadiness, markAllNotificationsRead, markNotificationRead, resolveNotification, saveFieldVerification, saveLandParcel, saveProject, signIn, signOut, updateProfile } from './services/api'
import { departments } from './data/departments'
import AcquisitionProposals from './AcquisitionProposals'

const nav = [{ label:'Dashboard', icon:Home, to:'/' }, { label:'Projects', icon:BriefcaseBusiness, to:'/projects' }, { label:'Acquisition Proposals', icon:FileCheck2, to:'/acquisition-proposals' }, { label:'Land Parcels', icon:MapPin, to:'/parcels' }, { label:'Readiness intelligence', icon:Activity, to:'/readiness' }, { label:'Field Verification', icon:ClipboardCheck, to:'/field-verification' }, { label:'Compensation & R&R', icon:Landmark, to:'/compensation' }, { label:'Notifications', icon:Bell, to:'/notifications' }, { label:'Reports', icon:FileBarChart, to:'/reports' }, { label:'Audit Logs', icon:ShieldCheck, to:'/audit-logs' }, { label:'Settings', icon:Settings, to:'/settings' }]
const DataContext = createContext({ projects:[], parcels:[], verifications:[], readiness:[], notifications:[], auditLogs:[], officers:[], loading:true, error:'', retry:()=>{} })
const AuthContext = createContext({ user:null, loading:true, error:'', refresh:()=>{}, signIn:async()=>{}, signOut:async()=>{}, updateProfile:async()=>{} })

function AuthProvider({children}){
 const [user,setUser]=useState(null)
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const refresh=async()=>{
  setLoading(true)
  setError('')
  try{const result=await getCurrentUser();setUser(result.user)}catch(requestError){if(requestError.status===401)setUser(null);else setError(requestError.message)}finally{setLoading(false)}
 }
 const authenticate=async credentials=>{const result=await signIn(credentials);setUser(result.user);setError('');return result.user}
 const endSession=async()=>{await signOut();setUser(null)}
 const saveProfile=async profile=>{const result=await updateProfile(profile);setUser(result.user);return result.user}
 useEffect(()=>{let active=true;getCurrentUser().then(result=>{if(active)setUser(result.user)}).catch(requestError=>{if(active){if(requestError.status!==401)setError(requestError.message);else setUser(null)}}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[])
 return <AuthContext.Provider value={{user,loading,error,refresh,signIn:authenticate,signOut:endSession,updateProfile:saveProfile}}>{children}</AuthContext.Provider>
}
function useAuth(){return useContext(AuthContext)}

function DataProvider({children}) {
 const [projects,setProjects]=useState([])
 const [parcels,setParcels]=useState([])
 const [verifications,setVerifications]=useState([])
 const [readiness,setReadiness]=useState([])
 const [notifications,setNotifications]=useState([])
 const [auditLogs,setAuditLogs]=useState([])
 const [officers,setOfficers]=useState([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [reload,setReload]=useState(0)
 const retry=()=>{setLoading(true);setError('');setReload(value=>value+1)}

 useEffect(()=>{
  const controller=new AbortController()
  Promise.allSettled([
   getProjects({signal:controller.signal}),
   getLandParcels({signal:controller.signal}),
   getFieldVerifications({signal:controller.signal}),
   getReadiness({signal:controller.signal}),
   getNotifications({signal:controller.signal}),
   getAuditLogs({signal:controller.signal}),
   getFieldOfficers({signal:controller.signal})
  ]).then(results=>{
   if(controller.signal.aborted)return
   const [projectResult,parcelResult,verificationResult,readinessResult,notificationResult,auditResult,officerResult]=results
   if(projectResult.status==='fulfilled')setProjects(projectResult.value)
   if(parcelResult.status==='fulfilled')setParcels(parcelResult.value)
   if(verificationResult.status==='fulfilled')setVerifications(verificationResult.value)
   if(readinessResult.status==='fulfilled')setReadiness(readinessResult.value)
   if(notificationResult.status==='fulfilled')setNotifications(notificationResult.value)
   if(auditResult.status==='fulfilled')setAuditLogs(auditResult.value)
   if(officerResult.status==='fulfilled')setOfficers(officerResult.value)
   const failures=results.flatMap((result,index)=>result.status==='rejected'
    ? [`${['Projects','Land parcels','Field verifications','Readiness','Notifications','Audit history','Field officers'][index]}: ${result.reason instanceof Error?result.reason.message:String(result.reason)}`]
    : [])
   setError(failures.join(' '))
   setLoading(false)
  })
  return ()=>controller.abort()
 },[reload])

 return <DataContext.Provider value={{projects,parcels,verifications,readiness,notifications,auditLogs,officers,loading,error,retry}}>{children}</DataContext.Provider>
}

function useData(){return useContext(DataContext)}
function getId(reference){return reference&&typeof reference==='object'?reference._id||reference.id||'':reference||''}
function displayValue(value){return value===null||value===undefined||value===''?'Unavailable':value}
function projectStatus(status=''){return ({planning:'Planning',in_progress:'In Progress',delayed:'Delayed',completed:'Completed',cancelled:'Cancelled',pending:'Pending'})[status]||displayValue(status)}
function parcelStatus(status=''){return ({identified:'Identified',verification_pending:'Verification Pending',verified:'Verified',notice_issued:'Notice Issued',compensation_pending:'Compensation Pending',compensation_paid:'Compensation Paid',possession_pending:'Possession Pending',acquired:'Acquired',approved:'Approved',partially_paid:'Partially Paid',paid:'Paid'})[status]||displayValue(status)}
function parcelColor(status=''){return status==='acquired'||status==='compensation_paid'?'#2e7d50':status==='compensation_pending'?'#e58a2b':status==='verification_pending'||status==='identified'?'#2468a0':'#758397'}
function formatAreaTotal(records){
 const totals=new Map()
 records.forEach(record=>{
  if(typeof record.area==='number'&&Number.isFinite(record.area)){
   const unit=record.areaUnit||'units'
   totals.set(unit,(totals.get(unit)||0)+record.area)
  }
 })
 return totals.size?[...totals].map(([unit,total])=>`${new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(total)} ${unit}`).join(', '):'Unavailable'
}
function sumArea(records){
 const totals=new Map()
 records.forEach(record=>{if(typeof record.area==='number'&&Number.isFinite(record.area)){const unit=record.areaUnit||'units';totals.set(unit,(totals.get(unit)||0)+record.area)}})
 return totals
}
function formatParcelAreas(records){
 const totals=sumArea(records)
 return totals.size?[...totals].map(([unit,total])=>`${new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(total)} ${unit}`).join(', '):'Unavailable'
}
function formatAmount(value,currency){if(typeof value!=='number'||!Number.isFinite(value))return 'Not recorded';if(currency==='INR')return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(value);return `${new Intl.NumberFormat('en-IN',{maximumFractionDigits:0}).format(value)} · currency not recorded`}
function formatParcelAmount(parcels,key){const groups=new Map();parcels.forEach(parcel=>{const amount=parcel.compensation?.[key];if(typeof amount==='number'&&Number.isFinite(amount)){const currency=parcel.compensation.currency||'unknown';groups.set(currency,(groups.get(currency)||0)+amount)}});return groups.size?[...groups].map(([currency,amount])=>formatAmount(amount,currency==='unknown'?undefined:currency)).join(' · '):'Not recorded'}
function formatOutstandingAmount(parcels){const groups=new Map();parcels.forEach(parcel=>{const compensation=parcel.compensation;const approved=compensation?.approvedAmount;const paid=compensation?.paidAmount;if(typeof approved==='number'&&Number.isFinite(approved)&&typeof paid==='number'&&Number.isFinite(paid)){const currency=compensation.currency||'unknown';groups.set(currency,(groups.get(currency)||0)+Math.max(0,approved-paid))}});return groups.size?[...groups].map(([currency,amount])=>formatAmount(amount,currency==='unknown'?undefined:currency)).join(' · '):'Not recorded'}
function dateLabel(value){if(!value)return 'Unavailable';const date=new Date(value);return Number.isNaN(date.getTime())?'Unavailable':date.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
function downloadCsv(filename,headers,rows){
 const escape=value=>{
  const text=value===null||value===undefined?'':String(value)
  const safe=/^\s*[=+\-@]/.test(text)?`'${text}`:text
  return `"${safe.replaceAll('"','""')}"`
 }
 const generatedAt=new Date().toISOString()
 const content=[['Generated at',...headers],...rows.map(row=>[generatedAt,...row])].map(row=>row.map(escape).join(',')).join('\r\n')
 const url=URL.createObjectURL(new Blob([`\uFEFF${content}`],{type:'text/csv;charset=utf-8'}))
 const link=document.createElement('a')
 link.href=url
 link.download=filename
 document.body.appendChild(link)
 link.click()
 link.remove()
 setTimeout(()=>URL.revokeObjectURL(url),1000)
}

function App(){return <BrowserRouter><AuthProvider><Routes><Route path="/login" element={<Login/>}/><Route path="*" element={<ProtectedApp/>}/></Routes></AuthProvider></BrowserRouter>}
function ProtectedApp(){const {user,loading,error,refresh}=useAuth();if(loading)return <main className="login-page"><p role="status">Checking your session…</p></main>;if(error)return <main className="login-page"><p role="alert">{error}</p><button className="primary-button" onClick={refresh}>Retry session check</button><Link to="/login">Go to sign in</Link></main>;if(!user)return <Navigate to="/login" replace/>;return <DataProvider><Shell/></DataProvider>}
function Login(){const {user,signIn}=useAuth();const navigate=useNavigate();const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);if(user)return <Navigate to="/" replace/>;return <main className="login-page"><div className="login-brand"><div className="brand-mark"><Landmark/></div><div><b>BhoomiDrishti</b><span>Land acquisition management</span></div></div><div className="login-panel"><div className="emblem"><Landmark/></div><p className="eyebrow">OFFICER ACCESS</p><h1>National Land Acquisition<br/>& Management System</h1><p className="login-copy">Sign in with an account provisioned by your administrator.</p><form onSubmit={async event=>{event.preventDefault();setMessage('');setBusy(true);try{await signIn({email,password});navigate('/',{replace:true})}catch(error){setMessage(error.message)}finally{setBusy(false)}}}><label>Email<input required type="email" autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)} placeholder="officer@example.gov.in"/></label><label>Password<input required type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)}/></label>{message&&<p role="alert">{message}</p>}<button className="primary-button login-button" type="submit" disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form><div className="demo-note">Sessions expire after 12 hours. Demo accounts are available only in development.</div></div><footer>Do not use synthetic demo records for legal or operational decisions.</footer></main>}
function Shell(){
 const [open,setOpen]=useState(false)
const [globalSearch,setGlobalSearch]=useState('')
 const {verifications,notifications}=useData()
 const {user,signOut}=useAuth()
 const navigate=useNavigate()
 const loc=useLocation()
 const visibleNav=nav.filter(item=>item.to!=='/acquisition-proposals'||user?.role!=='field_officer')
 const current=nav.find(n=>n.to===loc.pathname)||(loc.pathname.startsWith('/projects/')?nav[1]:loc.pathname.startsWith('/acquisition-proposals')?nav[2]:nav[0])
 return <div className="app-shell">
  <aside className={`sidebar ${open?'mobile-open':''}`}>
   <div className="sidebar-top"><Link to="/" className="brand"><div className="brand-mark"><Landmark size={20}/></div><div><b>BhoomiDrishti</b><small>NALAMS</small></div></Link><button className="icon-button sidebar-close" onClick={()=>setOpen(false)}><X size={18}/></button></div>
   <div className="demo-banner"><b>API</b> MongoDB-backed records</div>
   <nav>{visibleNav.map(({label,icon:Icon,to})=><NavLink key={to} to={to} end={to==='/'} onClick={()=>setOpen(false)}><Icon size={18}/><span>{label}</span>{label==='Field Verification'&&<i>{verifications.length}</i>}{label==='Notifications'&&notifications.some(item=>!item.readBy?.some(reader=>getId(reader)===user?.id))&&<i>{notifications.filter(item=>!item.readBy?.some(reader=>getId(reader)===user?.id)).length}</i>}</NavLink>)}</nav>
   <div className="sidebar-bottom"><div className="help"><CircleHelp size={17}/> Help & support</div><div className="sidebar-user"><div className="avatar">{user?.name?.[0]?.toUpperCase()||'U'}</div><div><b>{user?.name||'User'}</b><span>{user?.role||'Signed in'}</span></div><button className="icon-button" aria-label="Sign out" onClick={async()=>{try{await signOut();navigate('/login',{replace:true})}catch(error){window.alert(error.message)}}}><MoreHorizontal size={16}/></button></div></div>
  </aside>
  <div className="workspace">
   <header><button className="icon-button mobile-menu" onClick={()=>setOpen(true)} aria-label="Open navigation menu"><Menu/></button><div className="breadcrumbs">Portal <span>/</span> <b>{current.label}</b></div><div className="header-actions"><form className="global-search" role="search" onSubmit={event=>{event.preventDefault();navigate(`/projects${globalSearch.trim()?`?search=${encodeURIComponent(globalSearch.trim())}`:''}`)}}><Search size={16}/><input value={globalSearch} onChange={event=>setGlobalSearch(event.target.value)} placeholder="Search projects by name or ID" aria-label="Search projects by name or ID"/><button type="submit" aria-label="Open project search"><ArrowRight size={15}/></button></form><div className="top-user"><div className="avatar small">{user?.name?.[0]?.toUpperCase()||'U'}</div><div><b>{user?.name||'Signed in'}</b><span>{user?.role||''}</span></div><button className="icon-button" onClick={async()=>{try{await signOut();navigate('/login',{replace:true})}catch(error){window.alert(error.message)}}} aria-label="Sign out"><ChevronDown size={14}/></button></div></div></header>
   <main className="content"><Routes>
    <Route path="/" element={<Dashboard/>}/>
    <Route path="/projects" element={<Projects key={loc.search}/>} />
    <Route path="/projects/:id" element={<Details/>}/>
    <Route path="/acquisition-proposals/:id?/:action?" element={<AcquisitionProposals key={loc.pathname} user={user}/>} />
    <Route path="/parcels" element={<ParcelMap/>}/>
    <Route path="/readiness" element={<ReadinessPage/>}/>
    <Route path="/notifications" element={<NotificationsPage/>}/>
    <Route path="/field-verification" element={<FieldVerification/>}/>
    <Route path="/compensation" element={<Compensation/>}/>
    <Route path="/audit-logs" element={<AuditLogs/>}/>
    <Route path="/reports" element={<Reports/>}/>
    <Route path="/settings" element={<SettingsPage/>}/>
    <Route path="*" element={<Dashboard/>}/>
   </Routes></main>
  </div>
 </div>
}
function Header({eyebrow,title,description,action}){const {loading,error,retry}=useData();return <>{(loading||error)&&<div className="notice api-status" style={error?{borderLeftColor:'var(--red)',background:'#fff1f1'}:undefined} role={error?'alert':'status'}>{loading?'Loading live records…':`Could not load some live records: ${error}`}<button className="text-button" onClick={retry}>Retry</button></div>}<div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description&&<p className="page-description">{description}</p>}</div>{action}</div></>}
function Badge({status}){const value=status.toLowerCase();let c=value.includes('critical')||value.includes('high risk')||value.includes('delayed')||value.includes('rejected')||value.includes('overdue')?'critical':value.includes('moderate risk')||value.includes('pending')?'pending':value.includes('low risk')||value.includes('completed')||value.includes('approved')||value.includes('paid')||value.includes('acquired')?'success':value.includes('verification')?'info':'neutral';return <span className={`badge ${c}`}><i/>{status}</span>}
function Stat({icon:Icon,label,value,change,tone='blue'}){return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={18}/></div><div className="stat-content"><span>{label}</span><b>{value}</b><small>{change}</small></div></div>}
function RecordDialog({title,fields,initial={},onClose,onSubmit,error}){
 const dialogRef=useRef(null)
 const closeRef=useRef(onClose)
 useEffect(()=>{closeRef.current=onClose},[onClose])
 const [values,setValues]=useState(()=>Object.fromEntries(fields.map(field=>{
  const value=initial[field.name]??field.defaultValue??''
  const display=Array.isArray(value)?value.join(', '):field.type==='date'&&value?new Date(value).toISOString().slice(0,10):value
  return [field.name,display]
 })))
 useEffect(()=>{
  const dialog=dialogRef.current
  const previousFocus=document.activeElement
  const focusable=dialog?.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')
  focusable?.[0]?.focus()
  const trapFocus=event=>{
   if(event.key==='Escape'){event.preventDefault();closeRef.current();return}
   if(event.key!=='Tab'||!focusable?.length)return
   const first=focusable[0]
   const last=focusable[focusable.length-1]
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }
  dialog?.addEventListener('keydown',trapFocus)
  return ()=>{
   dialog?.removeEventListener('keydown',trapFocus)
   if(previousFocus instanceof HTMLElement&&previousFocus.isConnected)previousFocus.focus()
  }
 },[])
 const update=(name,value)=>setValues(current=>({...current,[name]:value}))
 const submit=event=>{
  event.preventDefault()
  const payload={}
  fields.forEach(field=>{
   const value=values[field.name]
   if(value===''||value===undefined)return
   if(field.type==='number')payload[field.name]=Number(value)
   else if(field.type==='list')payload[field.name]=value.split(',').map(item=>item.trim()).filter(Boolean)
   else payload[field.name]=value
  })
  onSubmit(payload)
 }
 return <div className="modal-backdrop"><section ref={dialogRef} className="record-modal" role="dialog" aria-modal="true" aria-labelledby="record-dialog-title">
  <div className="panel-heading"><h2 id="record-dialog-title">{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="Close form"><X size={18}/></button></div>
  <form onSubmit={submit} className="record-form">{fields.map(field=><label key={field.name}>{field.label}{field.options?<select required={field.required} value={values[field.name]} onChange={event=>update(field.name,event.target.value)}><option value="">Select…</option>{field.options.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</select>:field.type==='textarea'?<textarea required={field.required} minLength={field.minLength} maxLength={field.maxLength} value={values[field.name]} onChange={event=>update(field.name,event.target.value)} rows={3}/>:<input required={field.required} type={field.type||'text'} min={field.min} max={field.max} minLength={field.minLength} maxLength={field.maxLength} step={field.step} value={values[field.name]} onChange={event=>update(field.name,event.target.value)}/>}</label>)}{error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="outline-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button"><Check size={15}/> Save record</button></div></form>
 </section></div>
}
function Dashboard(){
 const {projects,parcels,verifications,readiness,error}=useData()
 const acquired=parcels.filter(parcel=>parcel.acquisitionStatus==='acquired')
 const activeProjects=projects.filter(project=>!['completed','cancelled'].includes(project.status))
 const statusCount=status=>activeProjects.filter(project=>project.status===status).length
 const readinessAverage=readiness.length?Math.round(readiness.reduce((total,item)=>total+item.score,0)/readiness.length):null
 const riskCount=risk=>readiness.filter(item=>item.risk===risk).length
 const projectStatuses=[['in_progress','In progress','#2e7d50'],['delayed','Delayed','#e58a2b'],['planning','Planning','#b84a4a']]
 const circumference=2*Math.PI*71
 let statusOffset=0
 return <>
  <Header eyebrow="Live portfolio overview" title="Land acquisition dashboard" description="Summary derived from current database records." action={<Link className="outline-button" to="/reports"><FileBarChart size={15}/> View reports</Link>}/>
  <div className="notice"><Activity size={19}/><div><b>{error?'Partial API data':'Live API records'}</b><span>{error?'Some endpoints could not be loaded; counts below may be incomplete.':`${projects.length} projects, ${parcels.length} land parcels and ${verifications.length} field verifications loaded from the backend.`}</span></div></div>
  <div className="stats-grid">
   <Stat icon={BriefcaseBusiness} label="Project records" value={projects.length} change="Returned by API"/>
   <Stat icon={Layers3} label="Recorded parcel area" value={formatAreaTotal(parcels)} change={`${parcels.length} parcel records`} tone="saffron"/>
   <Stat icon={CheckCircle2} label="Area in acquired parcels" value={formatAreaTotal(acquired)} change={`${acquired.length} acquired parcel records`} tone="green"/>
   <Stat icon={FileCheck2} label="Estimated compensation" value={formatParcelAmount(parcels,'estimatedAmount')} change="Currency shown only when recorded"/>
   <Stat icon={Landmark} label="Paid compensation" value={formatParcelAmount(parcels,'paidAmount')} change="Recorded payments only" tone="green"/>
   <Stat icon={Activity} label="Average parcel readiness" value={readinessAverage===null?'Unavailable':`${readinessAverage}/100`} change={`${riskCount('high')} high-risk parcel records`} tone={riskCount('high')?'saffron':'green'}/>
  </div>
  <div className="dashboard-grid">
   <section className="panel">
    <Heading title="Parcel readiness distribution" sub="Rules-based score calculated from current parcel records"/>
    {readiness.length?<div className="status-list"><p><i className="green"/>Low risk · readiness 75–100 <b>{riskCount('low')}</b></p><p><i className="saffron"/>Moderate risk · readiness 50–74 <b>{riskCount('moderate')}</b></p><p><i className="red"/>High risk · readiness 0–49 <b>{riskCount('high')}</b></p><Link className="text-button" to="/readiness">Review parcel blockers <ArrowRight size={14}/></Link></div>:<p>Readiness is unavailable until parcel records and the MongoDB connection are available.</p>}
   </section>
   <section className="panel status-panel"><Heading title="Active project status" sub="Live counts of planning, in-progress, and delayed projects"/><div className="status-visual"><svg className="status-donut" viewBox="0 0 180 180" role="img" aria-label={`Active project distribution: ${projectStatuses.map(([status,label])=>`${label} ${statusCount(status)}`).join(', ')}`}><circle cx="90" cy="90" r="71" fill="none" stroke="#e9eef3" strokeWidth="19"/>{projectStatuses.map(([status,label,color])=>{const count=statusCount(status);const length=activeProjects.length?circumference*count/activeProjects.length:0;const offset=statusOffset;statusOffset+=length;return <circle key={status} cx="90" cy="90" r="71" fill="none" stroke={color} strokeWidth="19" strokeDasharray={`${length} ${circumference-length}`} strokeDashoffset={-offset}><title>{label}: {count}</title></circle>})}</svg><div><b>{activeProjects.length}</b><span>Active projects</span></div></div><div className="status-list"><p><i className="green"/>In progress <b>{statusCount('in_progress')}</b></p><p><i className="saffron"/>Delayed <b>{statusCount('delayed')}</b></p><p><i className="red"/>Planning <b>{statusCount('planning')}</b></p></div></section>
  </div>
  <section className="panel table-panel"><Heading title="Recent projects" sub="Latest records returned by the API" link="View all projects"/><ProjectTable rows={projects.slice(0,3)} compact/></section>
 </>
}
function Heading({title,sub,link}){return <div className="panel-heading"><div><h2>{title}</h2><span>{sub}</span></div>{link&&<Link className="text-button" to="/projects">{link} <ArrowRight size={14}/></Link>}</div>}
function ProjectTable({rows,compact=false}){
 const go=useNavigate()
 const {parcels}=useData()
 return <div className="table-scroll" role="region" aria-label="Project register table" tabIndex={0}><table><thead><tr><th>{compact?'Project name':'Project ID'}</th>{!compact&&<th>Department</th>}<th>Location</th><th>Parcels</th><th>Total parcel area</th><th>Acquired parcel area</th><th>Progress</th><th>Status</th><th/></tr></thead><tbody>{rows.map(project=>{
  const projectParcels=parcels.filter(parcel=>getId(parcel.project)===getId(project))
  const acquired=projectParcels.filter(parcel=>parcel.acquisitionStatus==='acquired')
 const progress=projectParcels.length?`${Math.round(acquired.length/projectParcels.length*100)}% of parcels acquired`:'No parcels recorded'
 return <tr key={getId(project)}><td><div className="project-cell"><b>{compact?displayValue(project.name):getId(project)}</b><small>{compact?project.projectCode||getId(project):displayValue(project.name)}{project.isDemo?' · synthetic demo':''}</small></div></td>{!compact&&<td>{displayValue(project.department)}</td>}<td>{displayValue(project.location)}</td><td>{projectParcels.length}</td><td>{formatParcelAreas(projectParcels)}</td><td>{formatParcelAreas(acquired)}</td><td>{progress}</td><td><Badge status={projectStatus(project.status)}/></td><td><button className="table-action" onClick={()=>go(`/projects/${getId(project)}`)}>View <ArrowRight size={12}/></button></td></tr>
 })}</tbody></table></div>
}
function Projects(){
 const {projects,retry}=useData()
 const {user}=useAuth()
 const [searchParams]=useSearchParams()
 const canManage=['admin','project_officer'].includes(user?.role)
 const [showForm,setShowForm]=useState(false)
 const [formError,setFormError]=useState('')
 const [q,setQ]=useState(()=>searchParams.get('search')||'')
 const [status,setStatus]=useState('All statuses')
 const [department,setDepartment]=useState('All departments')
 const [location,setLocation]=useState('All recorded locations')
 const [sortField,setSortField]=useState('updatedAt')
 const [sortDirection,setSortDirection]=useState('desc')
 const [page,setPage]=useState(1)
 const pageSize=10
 const departmentOptions=[...new Set([...departments.map(item=>item.name),...projects.map(project=>project.department).filter(Boolean)])].sort((a,b)=>a.localeCompare(b))
 const locations=[...new Set(projects.map(project=>project.location).filter(Boolean))]
 const filteredRows=projects.filter(project=>{
  const searchText=`${project.name||''} ${project.projectCode||''} ${getId(project)} ${project.location||''} ${project.department||''}`.toLowerCase()
  return searchText.includes(q.toLowerCase())
   &&(status==='All statuses'||project.status===status)
   &&(department==='All departments'||project.department===department)
   &&(location==='All recorded locations'||project.location===location)
 })
 const rows=filteredRows.slice().sort((a,b)=>{
  const left=sortField==='name'?a.name:sortField==='department'?a.department:sortField==='status'?a.status:a.updatedAt
  const right=sortField==='name'?b.name:sortField==='department'?b.department:sortField==='status'?b.status:b.updatedAt
  return String(left||'').localeCompare(String(right||''),undefined,{numeric:true})*(sortDirection==='asc'?1:-1)
 })
 const pageCount=Math.max(1,Math.ceil(rows.length/pageSize))
 const pageRows=rows.slice((page-1)*pageSize,page*pageSize)
 return <>
  <Header eyebrow="Portfolio management" title="Projects" description="Create and track project records persisted in the database." action={canManage&&<button className="primary-button" onClick={()=>{setFormError('');setShowForm(true)}}><Plus size={15}/> New project</button>}/>
  <div className="filter-bar"><div className="filter-search"><Search size={16}/><input value={q} onChange={event=>{setQ(event.target.value);setPage(1)}} placeholder="Search by project name or ID"/></div>
   <select value={department} onChange={event=>{setDepartment(event.target.value);setPage(1)}}><option>All departments</option>{departmentOptions.map(value=><option key={value}>{value}</option>)}</select>
   <select value={location} onChange={event=>{setLocation(event.target.value);setPage(1)}}><option>All recorded locations</option>{locations.map(value=><option key={value}>{value}</option>)}</select>
   <select value={status} onChange={event=>{setStatus(event.target.value);setPage(1)}}><option>All statuses</option>{['planning','in_progress','delayed','completed','cancelled'].map(value=><option key={value} value={value}>{projectStatus(value)}</option>)}</select>
   <select aria-label="Sort projects by" value={sortField} onChange={event=>setSortField(event.target.value)}><option value="updatedAt">Recently updated</option><option value="name">Name</option><option value="department">Department</option><option value="status">Status</option></select>
   <button className="outline-button" onClick={()=>setSortDirection(value=>value==='asc'?'desc':'asc')} aria-label={`Sort ${sortDirection==='asc'?'descending':'ascending'}`}>{sortDirection==='asc'?'Ascending':'Descending'}</button>
   <span className="demo-label">{rows.filter(project=>project.isDemo).length} synthetic demo records</span>
  </div>
  <section className="panel table-panel"><Heading title={`Project register · ${rows.length}`} sub="Search, filter, sort and page through project records"/><ProjectTable rows={pageRows}/>{!rows.length&&<p>No matching projects. Create a project or clear the active filters.</p>}<div className="pagination"><span>Page {page} of {pageCount} · showing {rows.length?((page-1)*pageSize+1):0}–{Math.min(page*pageSize,rows.length)} of {rows.length}</span><div><button className="outline-button" disabled={page<=1} onClick={()=>setPage(value=>Math.max(1,value-1))}>Previous</button><button className="outline-button" disabled={page>=pageCount} onClick={()=>setPage(value=>Math.min(pageCount,value+1))}>Next</button></div></div></section>
  {showForm&&<RecordDialog title="Create project" fields={[
   {name:'projectCode',label:'Project identifier'},
   {name:'name',label:'Project name',required:true},
   {name:'department',label:'Department or implementing agency',required:true,options:departmentOptions.map(value=>({value,label:value}))},
   {name:'location',label:'Location',required:true},
   {name:'projectType',label:'Project type'},
   {name:'status',label:'Status',required:true,defaultValue:'planning',options:['planning','in_progress','delayed','completed','cancelled'].map(value=>({value,label:projectStatus(value)}))},
   {name:'startDate',label:'Start date',type:'date'},
   {name:'expectedEndDate',label:'Target completion date',type:'date'},
   {name:'requiredDocumentTypes',label:'Required document types (comma-separated)',type:'list'},
   {name:'description',label:'Description',type:'textarea'},
  ]} onClose={()=>setShowForm(false)} error={formError} onSubmit={async payload=>{
   try{await saveProject(payload);setShowForm(false);retry()}catch(error){setFormError(error.message)}
  }}/>}
 </>
}
function Details(){
 const {id}=useParams()
 const {projects,parcels,readiness,loading,retry}=useData()
 const {user}=useAuth()
 const canManage=['admin','project_officer'].includes(user?.role)
 const [showForm,setShowForm]=useState(false)
 const [formError,setFormError]=useState('')
 const [actionError,setActionError]=useState('')
 const navigate=useNavigate()
 const project=projects.find(record=>getId(record)===id)
 if(!project)return <><Link className="back-link" to="/projects">← Back to projects</Link><Header eyebrow="Project register" title={loading?'Loading project…':'Project not found'} description={loading?'Waiting for live project records.':'No project with this MongoDB ID was returned by the API.'}/></>
 const linkedParcels=parcels.filter(parcel=>getId(parcel.project)===getId(project))
 const acquired=linkedParcels.filter(parcel=>parcel.acquisitionStatus==='acquired')
 const milestones=Array.isArray(project.milestones)?project.milestones:[]
 const linkedReadiness=readiness.filter(item=>item.projectId===getId(project))
 const projectReadiness=linkedReadiness.length?Math.round(linkedReadiness.reduce((total,item)=>total+item.score,0)/linkedReadiness.length):null
 return <>
  <Link className="back-link" to="/projects">← Back to projects</Link>
  <Header eyebrow={`Project register · ${getId(project)}`} title={displayValue(project.name)} description={`${displayValue(project.department)} · ${displayValue(project.location)}${project.isDemo?' · synthetic demonstration record':''}`} action={<div className="parcel-actions"><Badge status={projectStatus(project.status)}/>{canManage&&<button className="outline-button" onClick={()=>{setFormError('');setShowForm(true)}}>Edit project</button>}{canManage&&!project.archivedAt&&<button className="outline-button" onClick={async()=>{if(!window.confirm('Archive this project? It will no longer appear in the active project register.'))return;setActionError('');try{await archiveProject(id);navigate('/projects')}catch(error){setActionError(error.message)}}}>Archive</button>}</div>}/>
  {actionError&&<p className="form-error" role="alert">{actionError}</p>}
  <div className="detail-kpis"><Detail label="Project ID" value={getId(project)}/><Detail label="Department" value={displayValue(project.department)}/><Detail label="Location" value={displayValue(project.location)}/><Detail label="Land requirement" value="Unavailable"/><Detail label="Area in acquired parcels" value={formatAreaTotal(acquired)}/><Detail label="Average parcel readiness" value={projectReadiness===null?'Unavailable':`${projectReadiness}/100`}/></div>
  <div className="details-grid">
   <section className="panel timeline-panel"><Heading title="Project milestones" sub="Milestones provided by the project API"/>{milestones.length?<div className="timeline">{milestones.map(milestone=>{
    const done=milestone.status==='completed'
    const current=milestone.status==='in_progress'
    return <div className={`timeline-item ${done?'completed':current?'current':'pending'}`} key={`${milestone.name}-${milestone.dueDate||''}`}><div className="marker">{done?<Check size={13}/>:''}</div><div><b>{displayValue(milestone.name)}</b><span>{projectStatus(milestone.status)} · Due {dateLabel(milestone.dueDate)}</span></div></div>
   })}</div>:<p>No milestones are available for this project.</p>}</section>
   <section className="panel"><Heading title="Project summary" sub="Values available from the backend"/><Detail label="Description" value={displayValue(project.description)}/><Detail label="Project type" value={displayValue(project.projectType)}/><Detail label="Parcel records" value={linkedParcels.length}/><Detail label="Area recorded in parcels" value={formatAreaTotal(linkedParcels)}/></section>
  </div>
  <section className="panel table-panel activity-panel"><Heading title="Project parcels" sub="Parcel progress is based on actual linked database records"/><ProjectParcelTable rows={linkedParcels}/></section>
  {showForm&&<RecordDialog title="Edit project" initial={project} fields={[
   {name:'projectCode',label:'Project identifier'},
   {name:'name',label:'Project name',required:true},
   {name:'department',label:'Department or implementing agency',required:true,options:[...new Set([...departments.map(item=>item.name),project.department].filter(Boolean))].map(value=>({value,label:value}))},
   {name:'location',label:'Location',required:true},
   {name:'projectType',label:'Project type'},
   {name:'status',label:'Status',required:true,options:['planning','in_progress','delayed','completed','cancelled'].map(value=>({value,label:projectStatus(value)}))},
   {name:'startDate',label:'Start date',type:'date'},
   {name:'expectedEndDate',label:'Target completion date',type:'date'},
   {name:'requiredDocumentTypes',label:'Required document types (comma-separated)',type:'list'},
   {name:'description',label:'Description',type:'textarea'},
  ]} onClose={()=>setShowForm(false)} error={formError} onSubmit={async payload=>{
   try{await saveProject(payload,id);setShowForm(false);retry()}catch(error){setFormError(error.message)}
  }}/>}
 </>
}
function ProjectParcelTable({rows}){
 if(!rows.length)return <p>No parcels are associated with this project yet.</p>
 return <div className="table-scroll" role="region" aria-label="Project parcel table" tabIndex={0}><table><thead><tr><th>Survey number</th><th>Parcel</th><th>Area</th><th>Status</th><th>Owner</th><th>Readiness</th></tr></thead><tbody>{rows.map(parcel=><tr key={getId(parcel)}><td>{parcel.surveyNumber}</td><td>{parcel.parcelCode||getId(parcel)}</td><td>{parcel.area} {parcel.areaUnit||''}</td><td><Badge status={parcelStatus(parcel.acquisitionStatus)}/></td><td>{displayValue(parcel.owner?.name)}</td><td><Link className="table-action" to={`/parcels?parcel=${encodeURIComponent(getId(parcel))}`}>View map <ArrowRight size={12}/></Link></td></tr>)}</tbody></table></div>
}
function Detail({label,value}){return <div className="detail-kpi"><span>{label}</span><b>{value}</b></div>};function Metric({label,value,color}){const available=typeof value==='number'&&Number.isFinite(value);return <div className="metric"><div><span>{label}</span><b>{available?`${value}%`:'Unavailable'}</b></div><span className="metric-bar"><i className={color} style={{width:available?`${value}%`:'0%'}}/></span></div>}
function ParcelMap(){
 const {parcels,projects,readiness,retry}=useData()
 const {user}=useAuth()
 const canManage=['admin','project_officer'].includes(user?.role)
 const [searchParams]=useSearchParams()
 const [selectedId,setSelectedId]=useState(searchParams.get('parcel')||'')
 const [statusFilter,setStatusFilter]=useState('all')
 const [projectFilter,setProjectFilter]=useState('all')
 const [districtFilter,setDistrictFilter]=useState('all')
 const [riskFilter,setRiskFilter]=useState('all')
 const [showForm,setShowForm]=useState(false)
 const [editingParcel,setEditingParcel]=useState(null)
 const [formError,setFormError]=useState('')
 const [tileError,setTileError]=useState(false)
 const readinessByParcel=new Map(readiness.map(item=>[item.parcelId,item]))
 const districts=[...new Set(parcels.map(parcel=>parcel.location?.district).filter(Boolean))].sort()
 const filteredParcels=parcels.filter(parcel=>(statusFilter==='all'||parcel.acquisitionStatus===statusFilter)&&(projectFilter==='all'||getId(parcel.project)===projectFilter)&&(districtFilter==='all'||parcel.location?.district===districtFilter)&&(riskFilter==='all'||readinessByParcel.get(getId(parcel))?.risk===riskFilter))
 const positioned=filteredParcels.filter(parcel=>Number.isFinite(parcel.location?.latitude)&&parcel.location.latitude>=-90&&parcel.location.latitude<=90&&Number.isFinite(parcel.location?.longitude)&&parcel.location.longitude>=-180&&parcel.location.longitude<=180)
 const selected=filteredParcels.find(parcel=>getId(parcel)===selectedId)||filteredParcels[0]
 const selectedReadiness=readiness.find(item=>item.parcelId===getId(selected))
 const center=positioned.length
  ?[positioned.reduce((sum,parcel)=>sum+parcel.location.latitude,0)/positioned.length,positioned.reduce((sum,parcel)=>sum+parcel.location.longitude,0)/positioned.length]
  :[20.5937,78.9629]
 const legend=[...new Set(filteredParcels.map(parcel=>parcel.acquisitionStatus).filter(Boolean))]
 return <>
  <Header eyebrow="Spatial land records" title="Land parcels" description="Register, edit and explore stored parcel points. No cadastral boundaries or official survey imagery are provided." action={canManage&&<button className="primary-button" onClick={()=>{setEditingParcel(null);setFormError('');setShowForm(true)}}><Plus size={15}/> Register parcel</button>}/>
  {parcels.some(parcel=>parcel.isDemo)&&<p className="record-warning">Synthetic demonstration records and map coordinates are not official land-survey data.</p>}
  <div className="filter-bar"><select aria-label="Filter by project" value={projectFilter} onChange={event=>setProjectFilter(event.target.value)}><option value="all">All projects</option>{projects.map(project=><option key={getId(project)} value={getId(project)}>{project.name}</option>)}</select><select aria-label="Filter by district" value={districtFilter} onChange={event=>setDistrictFilter(event.target.value)}><option value="all">All recorded districts</option>{districts.map(district=><option key={district} value={district}>{district}</option>)}</select><select aria-label="Filter by acquisition status" value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option value="all">All acquisition statuses</option>{[...new Set(parcels.map(parcel=>parcel.acquisitionStatus).filter(Boolean))].map(status=><option key={status} value={status}>{parcelStatus(status)}</option>)}</select><select aria-label="Filter by readiness risk" value={riskFilter} onChange={event=>setRiskFilter(event.target.value)}><option value="all">All readiness risks</option>{['high','moderate','low'].map(risk=><option key={risk} value={risk}>{risk} risk</option>)}</select><span className="demo-label">{filteredParcels.length} records · {positioned.length} with coordinates</span></div>
  <div className="map-layout">
   <section className="map-panel">
    <MapContainer key={positioned.map(getId).join(',')||'no-coordinates'} center={center} zoom={positioned.length?12:5} scrollWheelZoom>
     <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" eventHandlers={{tileerror:()=>setTileError(true),tileload:()=>setTileError(false)}}/>
     {positioned.map(parcel=>{
      const parcelReadiness=readinessByParcel.get(getId(parcel))
      const riskColor=parcelReadiness?.risk==='high'?'#b84a4a':parcelReadiness?.risk==='moderate'?'#e58a2b':parcelReadiness?.risk==='low'?'#2e7d50':'#758397'
      return <CircleMarker key={getId(parcel)} center={[parcel.location.latitude,parcel.location.longitude]} radius={8} pathOptions={{color:riskColor,fillColor:riskColor,fillOpacity:.65}} eventHandlers={{click:()=>setSelectedId(getId(parcel))}}><Popup><b>{getId(parcel)}</b><br/>{displayValue(parcel.location?.village)}<br/>{parcelStatus(parcel.acquisitionStatus)}<br/>Readiness: {parcelReadiness?`${parcelReadiness.score}/100 · ${parcelReadiness.risk} risk`:'Not available'}{parcel.isDemo&&<><br/>Synthetic demo coordinate, not a cadastral boundary</>}</Popup></CircleMarker>
     })}
    </MapContainer><span className="map-overlay">{positioned.length?'Saved parcel point coordinates':'No parcel coordinates available'}</span>{tileError&&<p className="record-warning" role="status">Map tiles could not be loaded. Parcel records remain available in the register.</p>}
   </section>
   <aside className="parcel-side">
    {selected?<><Heading title={getId(selected)} sub={selected.isDemo?'Selected synthetic demonstration parcel':'Selected parcel'}/><Badge status={parcelStatus(selected.acquisitionStatus)}/><div className="parcel-photo">⌖<span>Official cadastral imagery unavailable</span></div>
     {[['Survey number',selected.surveyNumber],['Village',selected.location?.village],['District',selected.location?.district],['Area',typeof selected.area==='number'?`${selected.area} ${selected.areaUnit||'unit not recorded'}`:null],['Owner',selected.owner?.name],['Approved compensation',formatAmount(selected.compensation?.approvedAmount,selected.compensation?.currency)]].map(([label,value])=><Detail key={label} label={label} value={displayValue(value)}/>)}
     <Detail label="Readiness score" value={selectedReadiness?`${selectedReadiness.score}/100 · ${selectedReadiness.risk} risk`:'Unavailable'}/>
     <div className="parcel-actions">{canManage&&<button className="outline-button" onClick={()=>{setEditingParcel(selected);setFormError('');setShowForm(true)}}>Edit parcel</button>}<Link className="outline-button" to={`/readiness?parcel=${encodeURIComponent(getId(selected))}`}>View readiness details</Link></div>
    </>:<><Heading title="No parcel selected" sub="No land-parcel records were returned."/></>}
    <div className="legend"><b>Readiness risk legend</b><span><i style={{background:'#b84a4a'}}/>High risk · 0–49</span><span><i style={{background:'#e58a2b'}}/>Moderate risk · 50–74</span><span><i style={{background:'#2e7d50'}}/>Low risk · 75–100</span><b>Acquisition status</b>{legend.map(status=><span key={status}><i style={{background:parcelColor(status)}}/>{parcelStatus(status)}</span>)}</div>
   </aside>
  </div>
  {showForm&&<RecordDialog title={editingParcel?'Edit land parcel':'Register land parcel'} initial={editingParcel?{
   ...editingParcel,
   project:getId(editingParcel.project),
   latitude:editingParcel.location?.latitude,
   longitude:editingParcel.location?.longitude,
   village:editingParcel.location?.village,
   subdistrict:editingParcel.location?.subdistrict||editingParcel.location?.taluk,
   district:editingParcel.location?.district,
   state:editingParcel.location?.state,
   stateCode:editingParcel.location?.stateCode,
   districtCode:editingParcel.location?.districtCode,
   subdistrictCode:editingParcel.location?.subdistrictCode,
   villageCode:editingParcel.location?.villageCode,
   ownerName:editingParcel.owner?.name,
  }:undefined} fields={[
   {name:'project',label:'Project',required:true,options:projects.map(project=>({value:getId(project),label:project.name}))},
   {name:'surveyNumber',label:'Survey reference (kept as entered)',required:true},
   {name:'surveyReferenceSource',label:'Survey reference source / note'},
   {name:'area',label:'Area',type:'number',required:true,min:'0.0001',step:'any'},
   {name:'areaUnit',label:'Area unit',required:true,defaultValue:'acres',options:['acres','hectares','square_metres','square_feet'].map(value=>({value,label:value.replaceAll('_',' ')}))},
   {name:'acquisitionStatus',label:'Acquisition status',required:true,defaultValue:'identified',options:['identified','verification_pending','verified','notice_issued','compensation_pending','compensation_paid','possession_pending','acquired'].map(value=>({value,label:parcelStatus(value)}))},
   {name:'landType',label:'Land type'},
   {name:'latitude',label:'Latitude',type:'number',min:'-90',max:'90',step:'any'},
   {name:'longitude',label:'Longitude',type:'number',min:'-180',max:'180',step:'any'},
   {name:'village',label:'Village / locality (manual entry)'},
   {name:'villageCode',label:'Village code (only if verified from a source)'},
   {name:'subdistrict',label:'Subdistrict / taluk (manual entry)'},
   {name:'subdistrictCode',label:'Subdistrict code (only if verified from a source)'},
   {name:'district',label:'District (manual entry)'},
   {name:'districtCode',label:'District code (only if verified from a source)'},
   {name:'state',label:'State / Union Territory (manual entry)'},
   {name:'stateCode',label:'State code (only if verified from a source)'},
   {name:'ownerName',label:'Landowner name'},
  ]} onClose={()=>{setShowForm(false);setEditingParcel(null)}} error={formError} onSubmit={async payload=>{
   const {latitude,longitude,village,subdistrict,district,state,stateCode,districtCode,subdistrictCode,villageCode,ownerName,...parcel}=payload
   const location={...(latitude!==undefined?{latitude}:{}),...(longitude!==undefined?{longitude}:{}),...(village?{village}:{}),...(subdistrict?{subdistrict,taluk:subdistrict}:{}),...(district?{district}:{}),...(state?{state}:{}),...(stateCode?{stateCode}:{}),...(districtCode?{districtCode}:{}),...(subdistrictCode?{subdistrictCode}:{}),...(villageCode?{villageCode}:{})}
   const owner=ownerName?{name:ownerName}:{}
   try{const response=await saveLandParcel({...parcel,...(Object.keys(location).length?{location}:{}),...(Object.keys(owner).length?{owner}:{})},editingParcel?getId(editingParcel):undefined);setShowForm(false);setEditingParcel(null);setSelectedId(getId(response.landParcel));retry()}catch(error){setFormError(error.message)}
  }}/>}
 </>
}
function ReadinessPage(){
 const {readiness,parcels,projects}=useData()
 const [searchParams]=useSearchParams()
 const selectedParcelId=searchParams.get('parcel')
 const ordered=readiness.filter(item=>!selectedParcelId||item.parcelId===selectedParcelId).slice().sort((first,second)=>first.score-second.score)
 const parcelById=new Map(parcels.map(parcel=>[getId(parcel),parcel]))
 const projectById=new Map(projects.map(project=>[getId(project),project]))
 return <>
  <Header eyebrow="Decision support · rules-based" title="Smart parcel readiness" description="Integer scores range from 0–100; higher means more readiness. Risk bands are high (0–49), moderate (50–74), and low (75–100). This is a transparent indicator, not a prediction."/>
  {selectedParcelId&&<p className="filter-bar">Filtered to parcel {selectedParcelId}. <Link className="text-button" to="/readiness">Clear parcel filter</Link></p>}
  {!readiness.length?<section className="panel"><p>No parcel readiness records are available. Configure project document checklists and load parcel records to calculate scores.</p></section>:<section className="panel table-panel">
   <Heading title="Parcel blockers and next steps" sub="Higher scores mean more recorded readiness. Missing configuration and workflow data are scored as explicit gaps."/>
   <div className="table-scroll" role="region" aria-label="Parcel readiness table" tabIndex={0}><table><thead><tr><th>Parcel / survey</th><th>Project</th><th>Readiness</th><th>Risk</th><th>Primary blocker</th><th>Recommended action</th></tr></thead><tbody>
    {ordered.map(item=>{
     const parcel=parcelById.get(item.parcelId)
     const project=projectById.get(item.projectId)
     return <tr key={item.parcelId}>
      <td><div className="project-cell"><b>{item.parcelId}</b><small>Survey no. {displayValue(parcel?.surveyNumber)}</small></div></td>
      <td>{displayValue(project?.name||item.projectId)}</td>
      <td><b>{item.score}/100</b></td>
      <td><Badge status={`${item.risk} risk`}/></td>
      <td>{item.factors[0]?.title||'No recorded blockers'}</td>
      <td>{item.nextSteps[0]?.action||'Continue monitoring recorded obligations.'}<br/><Link className="table-action" to={`/parcels?parcel=${encodeURIComponent(item.parcelId)}`}>Open parcel</Link></td>
     </tr>
    })}
   </tbody></table></div>
  </section>}
  <div className="report-grid">{ordered.map(item=><section className="report-card" key={`${item.parcelId}-reasons`}><Activity size={20}/><h2>{item.parcelId} · {item.score}/100 <Badge status={`${item.risk} risk`}/></h2><p>{item.factors.length?`${item.factors.length} contributing factor${item.factors.length===1?'':'s'}; deductions are cumulative and the final score is clamped to 0–100.`:'No blockers found in the recorded data.'}</p>{item.factors.length>0&&<ul>{item.factors.map(factor=><li key={factor.key}><b>{factor.title} (−{factor.deduction})</b> · {factor.nextStep}</li>)}</ul>}<Link className="text-button" to={`/parcels?parcel=${encodeURIComponent(item.parcelId)}`}>Open parcel record <ArrowRight size={13}/></Link></section>)}</div>
  <p className="page-description">Scoring weights are policy defaults documented in backend/services/readiness.js. Project-specific mandatory documents must be configured before document completeness can be assessed.</p>
 </>
}
function FieldVerification(){
 const {verifications,parcels,projects,officers,retry}=useData()
 const {user}=useAuth()
 const canAssign=['admin','project_officer'].includes(user?.role)
 const [showForm,setShowForm]=useState(false)
 const [selectedRecord,setSelectedRecord]=useState(null)
 const [formError,setFormError]=useState('')
 const verified=verifications.filter(record=>record.verificationStatus==='verified').length
 const pending=verifications.filter(record=>record.verificationStatus==='pending').length
 const gps=verifications.filter(record=>Number.isFinite(record.location?.latitude)&&Number.isFinite(record.location?.longitude)).length
 const editableParcels=selectedRecord?parcels:parcels.filter(parcel=>!verifications.some(record=>getId(record.landParcel)===getId(parcel)&&record.verificationStatus==='pending'))
 const statusOptions=selectedRecord
  ?(selectedRecord.verificationStatus==='pending'
   ?[{value:'pending',label:'Keep pending'},{value:'verified',label:'Mark verified'},{value:'rejected',label:'Reject'}]
   :[{value:'pending',label:'Reopen inspection'}])
  :[]
 return <>
  <Header eyebrow="Officer workspace" title="Field verification" description="Assign inspections to field officers, record outcomes and review the history of completed checks." action={canAssign&&<button className="primary-button" onClick={()=>{setSelectedRecord(null);setFormError('');setShowForm(true)}}><Plus size={15}/> Assign inspection</button>}/>
  <div className="verification-summary"><Stat icon={ClipboardCheck} label="Verification records" value={verifications.length} change="Returned by API"/><Stat icon={CheckCircle2} label="Verified" value={verified} change="" tone="green"/><Stat icon={Clock3} label="Pending" value={pending} change="" tone="saffron"/><Stat icon={MapPin} label="GPS captured" value={gps} change=""/></div>
  <section className="panel table-panel"><Heading title="Field verification roster" sub="Project, parcel and officer references are shown from populated API records where available."/><div className="table-scroll" role="region" aria-label="Field verification roster table" tabIndex={0}><table><thead><tr><th>Parcel</th><th>Location / project</th><th>Evidence</th><th>Due / updated</th><th>Officer</th><th>Status</th><th/></tr></thead><tbody>{verifications.map(record=>{
   const parcelId=getId(record.landParcel)
   const parcel=parcels.find(item=>getId(item)===parcelId)||(record.landParcel&&typeof record.landParcel==='object'?record.landParcel:null)
   const projectId=getId(record.project)
   const project=projects.find(item=>getId(item)===projectId)||(record.project&&typeof record.project==='object'?record.project:null)
   const location=record.location?.latitude!=null&&record.location?.longitude!=null?`${record.location.latitude}, ${record.location.longitude}`:parcel?.location?.village||parcel?.location?.address||'Unavailable'
   const status=({pending:'Pending',verified:'Verification Completed',rejected:'Rejected'})[record.verificationStatus]||displayValue(record.verificationStatus)
   return <tr key={getId(record)}><td><div className="project-cell"><b>{parcelId||'Unavailable'}</b><small>Survey no. {displayValue(parcel?.surveyNumber)}</small></div></td><td>{location}<br/><small>{displayValue(project?.name||projectId)}</small></td><td>{Array.isArray(record.photos)?`${record.photos.length} photo${record.photos.length===1?'':'s'}`:'No photo evidence recorded'}{record.history?.length>0&&<details><summary>History ({record.history.length})</summary><ul>{record.history.map(entry=><li key={entry._id}>{entry.action} · {dateLabel(entry.timestamp)}{entry.remarks?` · ${entry.remarks}`:''}</li>)}</ul></details>}</td><td>{dateLabel(record.dueDate||record.verifiedAt||record.updatedAt)}</td><td>{displayValue(record.verifiedBy?.name||getId(record.verifiedBy))}</td><td><Badge status={status}/></td><td>{canAssign||String(getId(record.verifiedBy))===String(user?.id)?<button className="table-action" onClick={()=>{setSelectedRecord(record);setFormError('');setShowForm(true)}}>{record.verificationStatus==='pending'?'Update':'History / reopen'} <ArrowRight size={12}/></button>:null}</td></tr>
  })}</tbody></table></div>{!verifications.length&&<p>No field verification records were returned.</p>}</section>
  {showForm&&<RecordDialog title={selectedRecord?'Update field inspection':'Assign field inspection'} fields={[
   ...(!selectedRecord?[
    {name:'landParcel',label:'Parcel · project / survey',required:true,options:editableParcels.map(parcel=>({value:getId(parcel),label:`${parcel.project?.name||projects.find(project=>getId(project)===getId(parcel.project))?.name||getId(parcel.project)} · ${parcel.surveyNumber||getId(parcel)}`}))},
    {name:'verifiedBy',label:'Field officer',required:true,options:officers.map(officer=>({value:getId(officer),label:`${officer.name}${officer.department?` · ${officer.department}`:''}`}))},
    {name:'dueDate',label:'Due date',type:'date'},
   ]:[
    {name:'verificationStatus',label:'Inspection outcome',required:true,options:statusOptions},
   ]),
   {name:'remarks',label:'Remarks',type:'textarea',required:Boolean(selectedRecord)},
  ]} initial={selectedRecord?{verificationStatus:selectedRecord.verificationStatus,remarks:selectedRecord.remarks}:undefined} onClose={()=>setShowForm(false)} error={formError} onSubmit={async payload=>{
   try{
    if(selectedRecord){
     if(payload.verificationStatus===selectedRecord.verificationStatus)delete payload.verificationStatus
     await saveFieldVerification(payload,getId(selectedRecord))
    }else{
     const parcel=parcels.find(item=>getId(item)===payload.landParcel)
     if(!parcel)throw new Error('Select a valid parcel.')
     await saveFieldVerification({...payload,project:getId(parcel.project)})
    }
    setShowForm(false)
    retry()
   }catch(error){setFormError(error.message)}
  }}/>}
 </>
}
function Compensation(){
 const {parcels,projects,retry}=useData()
 const {user}=useAuth()
 const canManage=['admin','project_officer'].includes(user?.role)
 const [showForm,setShowForm]=useState(false)
 const [editingParcel,setEditingParcel]=useState(null)
 const [formError,setFormError]=useState('')
 const [error,setError]=useState('')
 const [query,setQuery]=useState('')
 const [paymentFilter,setPaymentFilter]=useState('all')
 const [rehabilitationFilter,setRehabilitationFilter]=useState('all')
 const pending=parcels.filter(parcel=>parcel.compensation?.status==='pending')
 const rrParcels=parcels.filter(parcel=>parcel.rehabilitation?.required===true)
 const rrComplete=rrParcels.filter(parcel=>parcel.rehabilitation?.status==='completed').length
 const rrPercent=rrParcels.length?Math.round(rrComplete/rrParcels.length*100):null
 const records=parcels.filter(parcel=>parcel.compensation)
 const eligibleParcels=parcels.filter(parcel=>!parcel.compensation)
 const filteredRecords=parcels.filter(parcel=>{
  const projectName=parcel.project?.name||projects.find(project=>getId(project)===getId(parcel.project))?.name||''
  const search=`${getId(parcel)} ${parcel.parcelCode||''} ${parcel.surveyNumber||''} ${parcel.owner?.name||''} ${projectName}`.toLowerCase()
  return search.includes(query.toLowerCase())
   &&(paymentFilter==='all'||parcel.compensation?.status===paymentFilter)
   &&(rehabilitationFilter==='all'||(rehabilitationFilter==='not_required'
    ?parcel.rehabilitation?.required!==true
    :parcel.rehabilitation?.status===rehabilitationFilter))
 })
 const openForm=parcel=>{
  setError('')
  setFormError('')
  setEditingParcel(parcel||null)
  setShowForm(true)
 }
 const saveRecord=async payload=>{
  const {landParcel,beneficiaryName,beneficiaryContact,beneficiaryAddress,estimatedAmount,approvedAmount,paidAmount,currency,paymentStatus,paymentDate,rehabilitationRequired,rehabilitationStatus,rehabilitationDetails}=payload
  const parcel=editingParcel||parcels.find(item=>getId(item)===landParcel)
  if(!parcel){setFormError('Select a valid land parcel.');return}
  const compensation={
   ...parcel.compensation,
   estimatedAmount,
   ...(approvedAmount!==undefined?{approvedAmount}:{}),
   ...(paidAmount!==undefined?{paidAmount}:{}),
   currency,
   status:paymentStatus,
   ...(paymentDate?{paymentDate}:{}),
  }
  if(!paymentDate)delete compensation.paymentDate
  const owner={
   ...parcel.owner,
   ...(beneficiaryName?{name:beneficiaryName}:{}),
   ...(beneficiaryContact?{contactNumber:beneficiaryContact}:{}),
   ...(beneficiaryAddress?{address:beneficiaryAddress}:{}),
  }
  const rehabilitation={
   ...parcel.rehabilitation,
   required:rehabilitationRequired==='true',
   status:rehabilitationStatus,
   ...(rehabilitationDetails?{details:rehabilitationDetails}:{}),
  }
  try{
   await saveLandParcel({compensation,owner,rehabilitation},getId(parcel))
   setShowForm(false)
   setEditingParcel(null)
   setError('')
   retry()
  }catch(requestError){setFormError(requestError.message)}
 }
 return <>
  <Header eyebrow="Financial administration" title="Compensation & R&R" description="Manage beneficiary, payment and rehabilitation details stored on land-parcel records." action={canManage&&<button className="primary-button" disabled={!eligibleParcels.length} title={!eligibleParcels.length?'No parcels without compensation details are available':''} onClick={()=>openForm(null)}><Plus size={15}/> Add compensation record</button>}/>
  {canManage&&!eligibleParcels.length&&<p className="notice">No current parcel is missing its compensation record. Edit a record, or add compensation details after creating a parcel.</p>}
  {error&&<p className="form-error" role="alert">{error}</p>}
  <div className="stats-grid four"><Stat icon={FileCheck2} label="Compensation records" value={records.length} change={`${pending.length} pending payment`} /><Stat icon={Landmark} label="Estimated compensation" value={formatParcelAmount(parcels,'estimatedAmount')} change="Recorded estimates only" tone="blue"/><Stat icon={CheckCircle2} label="Amount paid" value={formatParcelAmount(parcels,'paidAmount')} change="Recorded payments only" tone="green"/><Stat icon={Clock3} label="Outstanding approved balance" value={formatOutstandingAmount(parcels)} change="Approved amount minus paid" tone="saffron"/></div>
  <div className="dashboard-grid">
   <section className="panel"><Heading title="Compensation obligations" sub="Amounts are grouped by recorded currency; no exchange-rate conversion is applied"/><Detail label="Approved amount" value={formatParcelAmount(parcels,'approvedAmount')}/><Detail label="Paid amount" value={formatParcelAmount(parcels,'paidAmount')}/><Detail label="Records with pending payment" value={pending.length}/></section>
   <section className="panel"><Heading title="R&R outcomes" sub={`${rrParcels.length} parcels marked as requiring rehabilitation`}/><Metric label="R&R completed" value={rrPercent} color="green"/><Detail label="Completed parcels" value={`${rrComplete} / ${rrParcels.length}`}/><Detail label="Housing support" value="Unavailable"/><Detail label="Livelihood support" value="Unavailable"/></section>
  </div>
  <section className="panel table-panel"><Heading title={`Compensation records · ${filteredRecords.length}`} sub="Search, filter and update embedded parcel compensation and R&R records."/>
   <div className="filter-bar">
    <div className="filter-search"><Search size={16}/><input aria-label="Search compensation records" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search beneficiary, parcel or project"/></div>
    <select aria-label="Filter by payment status" value={paymentFilter} onChange={event=>setPaymentFilter(event.target.value)}><option value="all">All payment statuses</option>{['pending','approved','partially_paid','paid'].map(status=><option key={status} value={status}>{parcelStatus(status)}</option>)}</select>
    <select aria-label="Filter by rehabilitation status" value={rehabilitationFilter} onChange={event=>setRehabilitationFilter(event.target.value)}><option value="all">All R&R statuses</option>{['not_required','pending','in_progress','completed'].map(status=><option key={status} value={status}>{status.replaceAll('_',' ')}</option>)}</select>
   </div>
   <div className="table-scroll" role="region" aria-label="Compensation and rehabilitation records table" tabIndex={0}><table><thead><tr><th>Beneficiary</th><th>Parcel / survey</th><th>Project</th><th>Payment status</th><th>Estimated / approved / paid</th><th>Payment date</th><th>R&R status</th>{canManage&&<th>Action</th>}</tr></thead><tbody>{filteredRecords.map(parcel=>{
   const projectId=getId(parcel.project)
   const project=projects.find(record=>getId(record)===projectId)
   return <tr key={getId(parcel)}><td>{displayValue(parcel.owner?.name)}{parcel.owner?.contactNumber&&<><br/><small>{parcel.owner.contactNumber}</small></>}</td><td><div className="project-cell"><b>{getId(parcel)}</b><small>Survey no. {displayValue(parcel.surveyNumber)}</small></div></td><td>{displayValue(parcel.project?.name||project?.name||projectId)}</td><td><Badge status={parcel.compensation?.status?parcelStatus(parcel.compensation.status):'Not recorded'}/></td><td>{formatAmount(parcel.compensation?.estimatedAmount,parcel.compensation?.currency)}<br/><small>Approved: {formatAmount(parcel.compensation?.approvedAmount,parcel.compensation?.currency)} · Paid: {formatAmount(parcel.compensation?.paidAmount,parcel.compensation?.currency)}</small></td><td>{dateLabel(parcel.compensation?.paymentDate)}</td><td>{parcel.rehabilitation?.required===true?displayValue(parcel.rehabilitation.status):'Not required'}</td>{canManage&&<td><button className="table-action" onClick={()=>openForm(parcel)}>{parcel.compensation?'Edit record':'Add details'} <ArrowRight size={12}/></button></td>}</tr>
  })}</tbody></table></div>{!filteredRecords.length&&<p>No compensation records match the selected search and filters.</p>}</section>
  {showForm&&<RecordDialog title={editingParcel?.compensation?'Edit compensation & R&R':'Add compensation & R&R'} initial={editingParcel?{
   landParcel:getId(editingParcel),
   beneficiaryName:editingParcel.owner?.name,
   beneficiaryContact:editingParcel.owner?.contactNumber,
   beneficiaryAddress:editingParcel.owner?.address,
   estimatedAmount:editingParcel.compensation?.estimatedAmount,
   approvedAmount:editingParcel.compensation?.approvedAmount,
   paidAmount:editingParcel.compensation?.paidAmount,
   currency:editingParcel.compensation?.currency||'INR',
   paymentStatus:editingParcel.compensation?.status||'pending',
   paymentDate:editingParcel.compensation?.paymentDate,
   rehabilitationRequired:editingParcel.rehabilitation?.required===true?'true':'false',
   rehabilitationStatus:editingParcel.rehabilitation?.status||'not_required',
   rehabilitationDetails:editingParcel.rehabilitation?.details,
  }:{currency:'INR',paymentStatus:'pending',rehabilitationRequired:'false',rehabilitationStatus:'not_required'}} fields={[
   ...(!editingParcel?[{name:'landParcel',label:'Land parcel · survey reference',required:true,options:eligibleParcels.map(parcel=>({value:getId(parcel),label:`${parcel.surveyNumber||getId(parcel)} · ${parcel.owner?.name||'Beneficiary not recorded'}`}))}]:[]),
   {name:'beneficiaryName',label:'Beneficiary / landowner name',required:true,maxLength:100},
   {name:'beneficiaryContact',label:'Beneficiary contact number',maxLength:40},
   {name:'beneficiaryAddress',label:'Beneficiary address',type:'textarea',maxLength:500},
   {name:'estimatedAmount',label:'Estimated compensation amount',type:'number',required:true,min:'0',step:'any'},
   {name:'approvedAmount',label:'Approved compensation amount',type:'number',min:'0',step:'any'},
   {name:'paidAmount',label:'Amount paid',type:'number',min:'0',step:'any'},
   {name:'currency',label:'Currency (ISO 4217 code)',required:true,minLength:3,maxLength:3},
   {name:'paymentStatus',label:'Payment status',required:true,options:['pending','approved','partially_paid','paid'].map(value=>({value,label:parcelStatus(value)}))},
   {name:'paymentDate',label:'Payment date',type:'date'},
   {name:'rehabilitationRequired',label:'Rehabilitation required',required:true,options:[{value:'true',label:'Yes'},{value:'false',label:'No'}]},
   {name:'rehabilitationStatus',label:'Rehabilitation status',required:true,options:['not_required','pending','in_progress','completed'].map(value=>({value,label:value.replaceAll('_',' ')}))},
   {name:'rehabilitationDetails',label:'Rehabilitation details',type:'textarea',maxLength:1000},
  ]} onClose={()=>{setShowForm(false);setEditingParcel(null)}} error={formError} onSubmit={saveRecord}/>}
 </>
}
function NotificationsPage(){
 const {notifications,retry}=useData()
 const {user}=useAuth()
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')
 const [resolving,setResolving]=useState(null)
 const open=notifications.filter(item=>!item.resolvedAt)
 const resolved=notifications.filter(item=>item.resolvedAt)
 const unread=notifications.filter(item=>!item.readBy?.some(reader=>getId(reader)===user?.id))
 const markRead=async id=>{
  setError('')
  setSuccess('')
  try{await markNotificationRead(id);setSuccess('Notification marked as read.');retry()}catch(requestError){setError(requestError.message)}
 }
 const markAllRead=async()=>{
  setError('')
  setSuccess('')
  try{const result=await markAllNotificationsRead();setSuccess(`${result.markedCount} notification${result.markedCount===1?'':'s'} marked as read.`);retry()}catch(requestError){setError(requestError.message)}
 }
 const resolve=async(id,reason)=>{
  setError('')
  setSuccess('')
  try{await resolveNotification(id,reason);setResolving(null);setSuccess('Notification resolved.');retry()}catch(requestError){setError(requestError.message)}
 }
 return <>
  <Header eyebrow="Priority actions" title="Notifications" description="Persisted alerts linked to their project or parcel. Read or resolve alerts after reviewing them." action={unread.length>0&&<button className="outline-button" onClick={markAllRead}>Mark all as read ({unread.length})</button>}/>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {success&&<p className="notice" role="status">{success}</p>}
  <section className="panel"><Heading title={`Open alerts · ${open.length}`} sub="Alerts are deduplicated by their persistent record key"/>
   {open.length?<div className="notification-list">{open.map(item=><article className="notification-card" key={getId(item)}><div><h2><Badge status={`${item.severity} priority`}/> {item.title}</h2><p>{item.message}</p><small>{displayValue(item.project?.name)} · {item.landParcel?`Survey ${item.landParcel.surveyNumber}`:'Project-level alert'} · {dateLabel(item.createdAt)}{item.isDemo?' · synthetic demo':''}</small><p>{item.landParcel?<Link className="text-button" to={`/parcels?parcel=${encodeURIComponent(getId(item.landParcel))}`}>Open parcel <ArrowRight size={13}/></Link>:item.project&&<Link className="text-button" to={`/projects/${getId(item.project)}`}>Open project <ArrowRight size={13}/></Link>}</p></div><div>{!item.readBy?.some(reader=>getId(reader)===user?.id)&&<button className="outline-button" onClick={()=>markRead(getId(item))}>Mark as read</button>}{['admin','project_officer'].includes(user?.role)&&(resolving===getId(item)?<form onSubmit={event=>{event.preventDefault();const reason=new FormData(event.currentTarget).get('reason');resolve(getId(item),reason)}}><label>Resolution reason<textarea name="reason" minLength={10} maxLength={500} required rows={2}/></label><button className="primary-button" type="submit">Confirm resolution</button><button className="outline-button" type="button" onClick={()=>setResolving(null)}>Cancel</button></form>:<button className="outline-button" onClick={()=>setResolving(getId(item))}>Resolve with reason</button>)}</div></article>)}</div>:<p>No open notifications are recorded. New alerts require a configured workflow or explicit notification record.</p>}
  </section>
  {resolved.length>0&&<section className="panel activity-panel"><Heading title={`Resolved · ${resolved.length}`} sub="Resolution timestamps, actor, and reason retained"/><div className="table-scroll" role="region" aria-label="Resolved notifications table" tabIndex={0}><table><thead><tr><th>Notification</th><th>Severity</th><th>Related record</th><th>Resolved</th><th>Actor / reason</th><th>Read</th></tr></thead><tbody>{resolved.map(item=><tr key={getId(item)}><td>{item.title}</td><td><Badge status={item.severity}/></td><td>{item.landParcel?.surveyNumber||item.project?.name||'Unavailable'}</td><td>{dateLabel(item.resolvedAt)}</td><td>{item.resolvedBy?.name||'Unavailable'} · {item.resolutionReason||'Reason not recorded'}</td><td>{item.readBy?.some(reader=>getId(reader)===user?.id)?'Read':<button className="table-action" onClick={()=>markRead(getId(item))}>Mark as read</button>}</td></tr>)}</tbody></table></div></section>}
 </>
}
function AuditLogs(){
 const {auditLogs}=useData()
 const [entityType,setEntityType]=useState('all')
 const rows=auditLogs.filter(item=>entityType==='all'||item.entityType===entityType)
 return <><Header eyebrow="Governance & compliance" title="Audit logs" description="Read-only audit records. Standard application routes do not offer audit edit or delete operations."/>
  <div className="filter-bar"><select value={entityType} onChange={event=>setEntityType(event.target.value)}><option value="all">All record types</option>{['Project','LandParcel','FieldVerification','AcquisitionProposal','Notification','User'].map(value=><option key={value}>{value}</option>)}</select><span className="demo-label">{rows.filter(item=>item.isDemo).length} synthetic demo events</span></div>
  <section className="panel table-panel"><Heading title={`Activity trail · ${rows.length}`} sub="Actor, action, entity, and timestamp from the audit API"/>{rows.length?<div className="table-scroll" role="region" aria-label="Audit activity table" tabIndex={0}><table><thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Record type</th><th>Record ID</th><th>Details</th></tr></thead><tbody>{rows.map(item=><tr key={getId(item)}><td>{dateLabel(item.timestamp)}</td><td>{displayValue(item.user?.name||getId(item.user))}</td><td>{item.action}</td><td>{item.entityType}</td><td>{getId(item.entityId)}</td><td>{item.description}{item.isDemo?' · synthetic demo':''}</td></tr>)}</tbody></table></div>:<p>No audit events are recorded yet.</p>}</section>
 </>
}
function Reports(){
 const {projects,parcels,verifications,readiness,auditLogs}=useData()
 const exportProjects=()=>downloadCsv('project-register.csv',['Project ID','Name','Department','Location','Status','Parcel count','Area recorded','Data classification'],projects.map(project=>{
  const linked=parcels.filter(parcel=>getId(parcel.project)===getId(project))
  return [getId(project),project.name,project.department,project.location,project.status,linked.length,formatAreaTotal(linked),project.isDemo?'Synthetic demo':'Recorded']
 }))
 const exportParcels=()=>downloadCsv('parcel-register.csv',['Parcel ID','Project ID','Survey reference','Area','Unit','Acquisition status','Data classification'],parcels.map(parcel=>[
  getId(parcel),getId(parcel.project),parcel.surveyNumber,parcel.area,parcel.areaUnit,parcel.acquisitionStatus,parcel.isDemo?'Synthetic demo':'Recorded'
 ]))
 const exportCompensation=()=>downloadCsv('compensation-register.csv',['Parcel ID','Project ID','Survey reference','Status','Estimated amount','Approved amount','Paid amount','Currency','Data classification'],parcels.filter(parcel=>parcel.compensation).map(parcel=>[
  getId(parcel),getId(parcel.project),parcel.surveyNumber,parcel.compensation.status,parcel.compensation.estimatedAmount,parcel.compensation.approvedAmount,parcel.compensation.paidAmount,parcel.compensation.currency||'Not recorded',parcel.isDemo?'Synthetic demo':'Recorded'
 ]))
 const exportVerifications=()=>downloadCsv('field-verifications.csv',['Verification ID','Project ID','Parcel ID','Status','Due date','Verified at','Data classification'],verifications.map(record=>[
  getId(record),getId(record.project),getId(record.landParcel),record.verificationStatus,record.dueDate,record.verifiedAt,record.isDemo?'Synthetic demo':'Recorded'
 ]))
 const parcelById=new Map(parcels.map(parcel=>[getId(parcel),parcel]))
 const exportReadiness=()=>downloadCsv('parcel-readiness.csv',['Parcel ID','Project ID','Readiness score','Risk','Primary blockers','Recommended actions','Data classification'],readiness.map(record=>[
  record.parcelId,record.projectId,record.score,record.risk,record.factors.map(factor=>`${factor.title} (-${factor.deduction})`).join('; '),record.nextSteps.map(step=>step.action).join('; '),parcelById.get(record.parcelId)?.isDemo?'Synthetic demo':'Recorded'
 ]))
 const exportAudit=()=>downloadCsv('audit-history.csv',['Timestamp','Actor','Action','Entity type','Entity ID','Description','Data classification'],auditLogs.map(record=>[
  record.timestamp,record.user?.name,record.action,record.entityType,getId(record.entityId),record.description,record.isDemo?'Synthetic demo':'Recorded'
 ]))
 const exportRr=()=>downloadCsv('rr-progress.csv',['Parcel ID','Project ID','Survey reference','R&R required','R&R status','Details','Data classification'],parcels.filter(parcel=>parcel.rehabilitation).map(parcel=>[
  getId(parcel),getId(parcel.project),parcel.surveyNumber,parcel.rehabilitation.required,parcel.rehabilitation.status,parcel.rehabilitation.details,parcel.isDemo?'Synthetic demo':'Recorded'
 ]))
 const reports=[
  ['Project register','Database-derived projects, parcel counts and recorded area',FileBarChart,projects.length,exportProjects],
  ['Parcel register','Survey references, areas and acquisition statuses',MapPin,parcels.length,exportParcels],
  ['Compensation register','Estimated, approved and paid amounts with explicit currency fields',Landmark,parcels.filter(parcel=>parcel.compensation).length,exportCompensation],
  ['Field verification log','Recorded inspections and due dates',ClipboardCheck,verifications.length,exportVerifications],
  ['Readiness and blockers','Rules-based score, contributing factors and next steps',Activity,readiness.length,exportReadiness],
  ['R&R progress','Recorded parcel R&R status and details',UsersRound,parcels.filter(parcel=>parcel.rehabilitation).length,exportRr],
  ['Audit history','Recorded audit events and actors',ShieldCheck,auditLogs.length,exportAudit],
 ]
 return <><Header eyebrow="Insights & exports" title="Reports" description="Download CSV reports generated from the current API records. Exports include only fields listed in each report."/><div className="report-grid">{reports.map(([title,description,Icon,count,exportReport])=><div className="report-card" key={title}><Icon size={21}/><h2>{title}</h2><p>{description}</p><p>{count} records</p><button className="text-button" onClick={exportReport}>Download CSV <ArrowRight size={14}/></button></div>)}</div></>
}
function SettingsPage(){
 const {user,updateProfile}=useAuth()
 const [showForm,setShowForm]=useState(false)
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')
 return <>
  <Header eyebrow="Account and administration" title="Settings" description="Manage your signed-in profile. Role changes and account provisioning require an administrator workflow." action={<button className="outline-button" onClick={()=>{setError('');setSuccess('');setShowForm(true)}}>Edit profile</button>}/>
  <section className="panel settings-panel">
   <div className="settings-row"><div><h2>Profile</h2><span>{user?.email||'Unavailable'} · {user?.role||'Role unavailable'}{user?.department?` · ${user.department}`:''}</span></div><span className="demo-label">Authenticated</span></div>
   <div className="settings-row"><div><h2>Password</h2><span>Passwords are stored using scrypt hashes; sessions expire after 12 hours.</span></div><span className="demo-label">Enabled</span></div>
   <div className="settings-row"><div><h2>Notification preferences</h2><span>Per-user delivery preferences are not implemented; persisted alerts remain available.</span></div><span className="demo-label">Unavailable</span></div>
  </section>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {success&&<p className="notice" role="status">{success}</p>}
  {showForm&&<RecordDialog title="Edit profile" initial={{name:user?.name,department:user?.department}} fields={[
   {name:'name',label:'Display name',required:true,maxLength:100},
   {name:'department',label:'Department',maxLength:150},
   {name:'currentPassword',label:'Current password',type:'password',maxLength:1024},
   {name:'newPassword',label:'New password (12 characters minimum)',type:'password',minLength:12,maxLength:1024},
  ]} onClose={()=>setShowForm(false)} error={error} onSubmit={async payload=>{
   setError('')
   if(payload.newPassword&&!payload.currentPassword){setError('Enter your current password to set a new password.');return}
   if(payload.newPassword&&payload.newPassword.length<12){setError('New password must contain at least 12 characters.');return}
   try{await updateProfile(payload);setShowForm(false);setSuccess('Profile updated successfully.')}
   catch(requestError){setError(requestError.message)}
  }}/>}
 </>
}
export default App
