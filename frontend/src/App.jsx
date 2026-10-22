import { createContext, useContext, useEffect, useState } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, ArrowRight, Bell, BriefcaseBusiness, Check, CheckCircle2, ChevronDown, CircleHelp, ClipboardCheck, Clock3, FileBarChart, FileCheck2, Filter, Home, Landmark, Layers3, MapPin, Menu, MoreHorizontal, Search, Settings, ShieldCheck, UsersRound, X } from 'lucide-react'
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'
import { getFieldVerifications, getLandParcels, getProjects } from './services/api'

const nav = [{ label:'Dashboard', icon:Home, to:'/' }, { label:'Projects', icon:BriefcaseBusiness, to:'/projects' }, { label:'Land Parcels', icon:MapPin, to:'/parcels' }, { label:'Field Verification', icon:ClipboardCheck, to:'/field-verification' }, { label:'Compensation & R&R', icon:Landmark, to:'/compensation' }, { label:'Reports', icon:FileBarChart, to:'/reports' }, { label:'Audit Logs', icon:ShieldCheck, to:'/audit-logs' }, { label:'Settings', icon:Settings, to:'/settings' }]
const DataContext = createContext({ projects:[], parcels:[], verifications:[], loading:true, error:'', retry:()=>{} })
const chartData = [{m:'Apr',a:18,c:24},{m:'May',a:29,c:38},{m:'Jun',a:41,c:52},{m:'Jul',a:54,c:67},{m:'Aug',a:68,c:79},{m:'Sep',a:72,c:86}]

function DataProvider({children}) {
 const [projects,setProjects]=useState([])
 const [parcels,setParcels]=useState([])
 const [verifications,setVerifications]=useState([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [reload,setReload]=useState(0)
 const retry=()=>{setLoading(true);setError('');setReload(value=>value+1)}

 useEffect(()=>{
  const controller=new AbortController()
  Promise.allSettled([
   getProjects({signal:controller.signal}),
   getLandParcels({signal:controller.signal}),
   getFieldVerifications({signal:controller.signal})
  ]).then(results=>{
   if(controller.signal.aborted)return
   const [projectResult,parcelResult,verificationResult]=results
   if(projectResult.status==='fulfilled')setProjects(projectResult.value)
   if(parcelResult.status==='fulfilled')setParcels(parcelResult.value)
   if(verificationResult.status==='fulfilled')setVerifications(verificationResult.value)
   const failures=results.flatMap((result,index)=>result.status==='rejected'
    ? [`${['Projects','Land parcels','Field verifications'][index]}: ${result.reason instanceof Error?result.reason.message:String(result.reason)}`]
    : [])
   setError(failures.join(' '))
   setLoading(false)
  })
  return ()=>controller.abort()
 },[reload])

 return <DataContext.Provider value={{projects,parcels,verifications,loading,error,retry}}>{children}</DataContext.Provider>
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
function sumAmounts(records,key){
 const amounts=records.map(record=>record.compensation?.[key]).filter(value=>typeof value==='number'&&Number.isFinite(value))
 return amounts.length?amounts.reduce((total,value)=>total+value,0):null
}
function formatAmount(value){return typeof value!=='number'||!Number.isFinite(value)?'Unavailable':new Intl.NumberFormat('en-IN',{maximumFractionDigits:0}).format(value)}
function dateLabel(value){if(!value)return 'Unavailable';const date=new Date(value);return Number.isNaN(date.getTime())?'Unavailable':date.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}

function App(){return <BrowserRouter><Routes><Route path="/login" element={<Login/>}/><Route path="*" element={<DataProvider><Shell/></DataProvider>}/></Routes></BrowserRouter>}
function Login(){const navg=useNavigate(); return <main className="login-page"><div className="login-brand"><div className="brand-mark"><Landmark/></div><div><b>BhoomiDrishti</b><span>Government of India</span></div></div><div className="login-panel"><div className="emblem"><Landmark/></div><p className="eyebrow">SECURE OFFICER ACCESS</p><h1>National Land Acquisition<br/>& Management System</h1><p className="login-copy">Sign in to access the central administration workspace.</p><form onSubmit={e=>{e.preventDefault();navg('/')}}><label>Email or Username<input required placeholder="officer@gov.in"/></label><label>Password<input required type="password" placeholder="Enter your password"/></label><div className="login-options"><label><input type="checkbox"/> Remember me</label><a href="#forgot">Forgot password?</a></div><button className="primary-button login-button">Sign in to portal <ArrowRight size={16}/></button></form><div className="demo-note">● Demo environment · Sample data only</div></div><footer>A Government of India digital initiative <span>•</span> Designed for authorized use <span>•</span> v1.0.0</footer></main>}
function Shell(){const [open,setOpen]=useState(false);const {verifications}=useData();const loc=useLocation();const current=nav.find(n=>n.to===loc.pathname)||nav[0];return <div className="app-shell"><aside className={`sidebar ${open?'mobile-open':''}`}><div className="sidebar-top"><Link to="/" className="brand"><div className="brand-mark"><Landmark size={20}/></div><div><b>BhoomiDrishti</b><small>NALAMS</small></div></Link><button className="icon-button sidebar-close" onClick={()=>setOpen(false)}><X size={18}/></button></div><div className="demo-banner"><b>LIVE</b> API-backed records</div><nav>{nav.map(({label,icon:Icon,to})=><NavLink key={to} to={to} end={to==='/' } onClick={()=>setOpen(false)}><Icon size={18}/><span>{label}</span>{label==='Field Verification'&&<i>{verifications.length}</i>}</NavLink>)}</nav><div className="sidebar-bottom"><div className="help"><CircleHelp size={17}/> Help & support</div><div className="sidebar-user"><div className="avatar">CA</div><div><b>Central Admin</b><span>Administrator · demo profile</span></div><MoreHorizontal size={16}/></div></div></aside><div className="workspace"><header><button className="icon-button mobile-menu" onClick={()=>setOpen(true)}><Menu/></button><div className="breadcrumbs">Portal <span>/</span> <b>{current.label}</b></div><div className="header-actions"><div className="global-search"><Search size={16}/><input placeholder="Search projects, parcels..."/></div><button className="icon-button notify"><Bell size={18}/><i/></button><div className="top-user"><div className="avatar small">CA</div><div><b>Central Administrator</b><span>Demo profile</span></div><ChevronDown size={14}/></div></div></header><main className="content"><Routes><Route path="/" element={<Dashboard/>}/><Route path="/projects" element={<Projects/>}/><Route path="/projects/:id" element={<Details/>}/><Route path="/parcels" element={<ParcelMap/>}/><Route path="/field-verification" element={<FieldVerification/>}/><Route path="/compensation" element={<Compensation/>}/><Route path="/audit-logs" element={<AuditLogs/>}/><Route path="/reports" element={<Reports/>}/><Route path="/settings" element={<SettingsPage/>}/></Routes></main></div></div>}
function Header({eyebrow,title,description,action}){const {loading,error,retry}=useData();return <>{(loading||error)&&<div className="notice api-status" style={error?{borderLeftColor:'var(--red)',background:'#fff1f1'}:undefined} role={error?'alert':'status'}>{loading?'Loading live records…':`Could not load some live records: ${error}`}<button className="text-button" onClick={retry}>Retry</button></div>}<div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description&&<p className="page-description">{description}</p>}</div>{action}</div></>}
function Badge({status}){let c=status.toLowerCase().includes('critical')||status.toLowerCase().includes('delayed')||status.toLowerCase().includes('rejected')?'critical':status.toLowerCase().includes('pending')?'pending':status.toLowerCase().includes('verification')?'info':'success';return <span className={`badge ${c}`}><i/>{status}</span>}
function Stat({icon:Icon,label,value,change,tone='blue'}){return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={18}/></div><div className="stat-content"><span>{label}</span><b>{value}</b><small>{change}</small></div></div>}
function Dashboard(){
 const {projects,parcels,verifications}=useData()
 const acquired=parcels.filter(parcel=>parcel.acquisitionStatus==='acquired')
 const activeProjects=projects.filter(project=>!['completed','cancelled'].includes(project.status))
 const statusCount=status=>activeProjects.filter(project=>project.status===status).length
 return <>
  <Header eyebrow="Live portfolio overview" title="Good morning, Administrator" description="Summary of records currently available from the project APIs." action={<button className="outline-button"><FileBarChart size={15}/> Export report</button>}/>
  <div className="notice"><Activity size={19}/><div><b>Live API records</b><span>{projects.length} projects, {parcels.length} land parcels and {verifications.length} field verifications returned by the backend.</span></div></div>
  <div className="stats-grid">
   <Stat icon={BriefcaseBusiness} label="Project records" value={projects.length} change="Returned by API"/>
   <Stat icon={Layers3} label="Recorded parcel area" value={formatAreaTotal(parcels)} change={`${parcels.length} parcel records`} tone="saffron"/>
   <Stat icon={CheckCircle2} label="Area in acquired parcels" value={formatAreaTotal(acquired)} change={`${acquired.length} acquired parcel records`} tone="green"/>
   <Stat icon={FileCheck2} label="Estimated compensation · unit unspecified" value={formatAmount(sumAmounts(parcels,'estimatedAmount'))} change="From parcel records"/>
   <Stat icon={Landmark} label="Paid compensation · unit unspecified" value={formatAmount(sumAmounts(parcels,'paidAmount'))} change="From parcel records" tone="green"/>
   <Stat icon={UsersRound} label="Affected families" value="Unavailable" change="Not provided by API" tone="saffron"/>
  </div>
  <div className="dashboard-grid">
   <section className="panel chart-panel">
    <Heading title="Project progress" sub="Demo chart data · No analytics endpoint is available"/>
    <div className="chart-legend"><span><i/> Land acquired · demo</span><span><i/> Compensation assessed · demo</span></div>
    <ResponsiveContainer width="100%" height={250}><AreaChart data={chartData}><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#123b66" stopOpacity=".18"/><stop offset="1" stopColor="#123b66" stopOpacity="0"/></linearGradient></defs><CartesianGrid stroke="#e7ebf0" vertical={false}/><XAxis dataKey="m" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false}/><Tooltip/><Area type="monotone" dataKey="c" stroke="#e58a2b" fill="none"/><Area type="monotone" dataKey="a" stroke="#123b66" fill="url(#fill)"/></AreaChart></ResponsiveContainer>
   </section>
   <section className="panel status-panel"><Heading title="Acquisition status" sub="Live project status counts"/><div className="status-visual"><div><b>{activeProjects.length}</b><span>Active projects</span></div></div><div className="status-list"><p><i className="green"/>In progress <b>{statusCount('in_progress')}</b></p><p><i className="saffron"/>Delayed <b>{statusCount('delayed')}</b></p><p><i className="red"/>Planning <b>{statusCount('planning')}</b></p></div></section>
  </div>
  <section className="panel table-panel"><Heading title="Recent projects" sub="Latest records returned by the API" link="View all projects"/><ProjectTable rows={projects.slice(0,3)} compact/></section>
 </>
}
function Heading({title,sub,link}){return <div className="panel-heading"><div><h2>{title}</h2><span>{sub}</span></div>{link&&<Link className="text-button" to="/projects">{link} <ArrowRight size={14}/></Link>}</div>}
function ProjectTable({rows,compact=false}){
 const go=useNavigate()
 const {parcels}=useData()
 return <div className="table-scroll"><table><thead><tr><th>{compact?'Project name':'Project ID'}</th>{!compact&&<th>Department</th>}<th>Location</th><th>Land required</th><th>Area in acquired parcels</th>{!compact&&<th>Families</th>}<th>Progress</th><th>Status</th><th/></tr></thead><tbody>{rows.map(project=>{
  const projectParcels=parcels.filter(parcel=>getId(parcel.project)===getId(project))
  const acquired=projectParcels.filter(parcel=>parcel.acquisitionStatus==='acquired')
  return <tr key={getId(project)}><td><div className="project-cell"><b>{compact?displayValue(project.name):getId(project)}</b><small>{compact?getId(project):displayValue(project.name)}</small></div></td>{!compact&&<td>{displayValue(project.department)}</td>}<td>{displayValue(project.location)}</td><td>Unavailable</td><td>{formatAreaTotal(acquired)}</td>{!compact&&<td>Unavailable</td>}<td>Unavailable</td><td><Badge status={projectStatus(project.status)}/></td><td><button className="table-action" onClick={()=>go(`/projects/${getId(project)}`)}>View <ArrowRight size={12}/></button></td></tr>
 })}</tbody></table></div>
}
function Projects(){
 const {projects}=useData()
 const [q,setQ]=useState('')
 const [status,setStatus]=useState('All statuses')
 const [department,setDepartment]=useState('All departments')
 const [location,setLocation]=useState('All locations')
 const departments=[...new Set(projects.map(project=>project.department).filter(Boolean))]
 const locations=[...new Set(projects.map(project=>project.location).filter(Boolean))]
 const rows=projects.filter(project=>{
  const searchText=`${project.name||''} ${getId(project)} ${project.location||''} ${project.department||''}`.toLowerCase()
  return searchText.includes(q.toLowerCase())
   &&(status==='All statuses'||project.status===status)
   &&(department==='All departments'||project.department===department)
   &&(location==='All locations'||project.location===location)
 })
 return <>
  <Header eyebrow="Portfolio management" title="Projects" description="Monitor land acquisition projects returned by the API." action={<button className="primary-button"><BriefcaseBusiness size={15}/> New project</button>}/>
  <div className="filter-bar"><div className="filter-search"><Search size={16}/><input value={q} onChange={event=>setQ(event.target.value)} placeholder="Search by project name or ID"/></div>
   <select value={department} onChange={event=>setDepartment(event.target.value)}><option>All departments</option>{departments.map(value=><option key={value}>{value}</option>)}</select>
   <select value={location} onChange={event=>setLocation(event.target.value)}><option>All locations</option>{locations.map(value=><option key={value}>{value}</option>)}</select>
   <select value={status} onChange={event=>setStatus(event.target.value)}><option>All statuses</option>{['planning','in_progress','delayed','completed','cancelled'].map(value=><option key={value} value={value}>{projectStatus(value)}</option>)}</select>
   <button className="outline-button"><Filter size={15}/> More filters</button>
  </div>
  <section className="panel table-panel"><Heading title={`Project register · ${rows.length}`} sub="Showing live project records"/><ProjectTable rows={rows}/></section>
 </>
}
function Details(){
 const {id}=useParams()
 const {projects,parcels,loading}=useData()
 const project=projects.find(record=>getId(record)===id)
 if(!project)return <><Link className="back-link" to="/projects">← Back to projects</Link><Header eyebrow="Project register" title={loading?'Loading project…':'Project not found'} description={loading?'Waiting for live project records.':'No project with this MongoDB ID was returned by the API.'}/></>
 const linkedParcels=parcels.filter(parcel=>getId(parcel.project)===getId(project))
 const acquired=linkedParcels.filter(parcel=>parcel.acquisitionStatus==='acquired')
 const milestones=Array.isArray(project.milestones)?project.milestones:[]
 return <>
  <Link className="back-link" to="/projects">← Back to projects</Link>
  <Header eyebrow={`Project register · ${getId(project)}`} title={displayValue(project.name)} description={`${displayValue(project.department)} · ${displayValue(project.location)}`} action={<Badge status={projectStatus(project.status)}/>}/>
  <div className="detail-kpis"><Detail label="Project ID" value={getId(project)}/><Detail label="Department" value={displayValue(project.department)}/><Detail label="Location" value={displayValue(project.location)}/><Detail label="Land requirement" value="Unavailable"/><Detail label="Area in acquired parcels" value={formatAreaTotal(acquired)}/></div>
  <div className="details-grid">
   <section className="panel timeline-panel"><Heading title="Project milestones" sub="Milestones provided by the project API"/>{milestones.length?<div className="timeline">{milestones.map(milestone=>{
    const done=milestone.status==='completed'
    const current=milestone.status==='in_progress'
    return <div className={`timeline-item ${done?'completed':current?'current':'pending'}`} key={`${milestone.name}-${milestone.dueDate||''}`}><div className="marker">{done?<Check size={13}/>:''}</div><div><b>{displayValue(milestone.name)}</b><span>{projectStatus(milestone.status)} · Due {dateLabel(milestone.dueDate)}</span></div></div>
   })}</div>:<p>No milestones are available for this project.</p>}</section>
   <section className="panel"><Heading title="Project summary" sub="Values available from the backend"/><Detail label="Description" value={displayValue(project.description)}/><Detail label="Project type" value={displayValue(project.projectType)}/><Detail label="Parcel records" value={linkedParcels.length}/><Detail label="Area recorded in parcels" value={formatAreaTotal(linkedParcels)}/></section>
  </div>
  <section className="panel activity-panel"><Heading title="Activity history" sub="The current API does not expose project activity records."/><p>Unavailable from the current backend API.</p></section>
 </>
}
function Detail({label,value}){return <div className="detail-kpi"><span>{label}</span><b>{value}</b></div>};function Metric({label,value,color}){const available=typeof value==='number'&&Number.isFinite(value);return <div className="metric"><div><span>{label}</span><b>{available?`${value}%`:'Unavailable'}</b></div><span className="metric-bar"><i className={color} style={{width:available?`${value}%`:'0%'}}/></span></div>}
function ParcelMap(){
 const {parcels}=useData()
 const [selectedId,setSelectedId]=useState('')
 const positioned=parcels.filter(parcel=>Number.isFinite(parcel.location?.latitude)&&Number.isFinite(parcel.location?.longitude))
 const selected=parcels.find(parcel=>getId(parcel)===selectedId)||parcels[0]
 const center=positioned.length
  ?[positioned.reduce((sum,parcel)=>sum+parcel.location.latitude,0)/positioned.length,positioned.reduce((sum,parcel)=>sum+parcel.location.longitude,0)/positioned.length]
  :[20.5937,78.9629]
 const legend=[...new Set(parcels.map(parcel=>parcel.acquisitionStatus).filter(Boolean))]
 return <>
  <Header eyebrow="Spatial land records" title="Land parcels" description="Parcel records and available point coordinates from the land-parcel API." action={<span className="demo-label">LIVE PARCEL DATA</span>}/>
  <div className="map-layout">
   <section className="map-panel">
    <MapContainer key={positioned.map(getId).join(',')||'no-coordinates'} center={center} zoom={positioned.length?12:5} scrollWheelZoom={false}>
     <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
     {positioned.map(parcel=><CircleMarker key={getId(parcel)} center={[parcel.location.latitude,parcel.location.longitude]} radius={8} pathOptions={{color:parcelColor(parcel.acquisitionStatus),fillColor:parcelColor(parcel.acquisitionStatus),fillOpacity:.65}} eventHandlers={{click:()=>setSelectedId(getId(parcel))}}><Popup><b>{getId(parcel)}</b><br/>{displayValue(parcel.location?.village)}<br/>{parcelStatus(parcel.acquisitionStatus)}</Popup></CircleMarker>)}
    </MapContainer><span className="map-overlay">{positioned.length?'Live parcel coordinates':'No parcel coordinates available'}</span>
   </section>
   <aside className="parcel-side">
    {selected?<><Heading title={getId(selected)} sub="Selected parcel"/><Badge status={parcelStatus(selected.acquisitionStatus)}/><div className="parcel-photo">⌖<span>Cadastral imagery unavailable</span></div>
     {[['Survey number',selected.surveyNumber],['Village',selected.location?.village],['District',selected.location?.district],['Area',typeof selected.area==='number'?`${selected.area} ${selected.areaUnit||''}`.trim():null],['Owner',selected.owner?.name],['Approved compensation · unit unspecified',formatAmount(selected.compensation?.approvedAmount)]].map(([label,value])=><Detail key={label} label={label} value={displayValue(value)}/>)}
     <div className="parcel-actions"><button className="outline-button">View details</button><button className="primary-button"><ClipboardCheck size={14}/> Verify parcel</button></div>
    </>:<><Heading title="No parcel selected" sub="No land-parcel records were returned."/></>}
    <div className="legend"><b>Map legend</b>{legend.map(status=><span key={status}><i style={{background:parcelColor(status)}}/>{parcelStatus(status)}</span>)}</div>
   </aside>
  </div>
 </>
}
function FieldVerification(){
 const {verifications,parcels,projects}=useData()
 const verified=verifications.filter(record=>record.verificationStatus==='verified').length
 const pending=verifications.filter(record=>record.verificationStatus==='pending').length
 const gps=verifications.filter(record=>Number.isFinite(record.location?.latitude)&&Number.isFinite(record.location?.longitude)).length
 return <>
  <Header eyebrow="Officer workspace" title="Field verification" description="Read-only verification records returned by the backend." action={<span className="demo-label">READ ONLY</span>}/>
  <div className="verification-summary"><Stat icon={ClipboardCheck} label="Verification records" value={verifications.length} change="Returned by API"/><Stat icon={CheckCircle2} label="Verified" value={verified} change="" tone="green"/><Stat icon={Clock3} label="Pending" value={pending} change="" tone="saffron"/><Stat icon={MapPin} label="GPS captured" value={gps} change=""/></div>
  <section className="panel table-panel"><Heading title="Field verification roster" sub="Project, parcel and officer references are shown from populated API records where available."/><div className="table-scroll"><table><thead><tr><th>Parcel</th><th>Location / project</th><th>Evidence</th><th>Timestamp</th><th>Officer</th><th>Status</th><th/></tr></thead><tbody>{verifications.map(record=>{
   const parcelId=getId(record.landParcel)
   const parcel=parcels.find(item=>getId(item)===parcelId)||(record.landParcel&&typeof record.landParcel==='object'?record.landParcel:null)
   const projectId=getId(record.project)
   const project=projects.find(item=>getId(item)===projectId)||(record.project&&typeof record.project==='object'?record.project:null)
   const location=record.location?.latitude!=null&&record.location?.longitude!=null?`${record.location.latitude}, ${record.location.longitude}`:parcel?.location?.village||parcel?.location?.address||'Unavailable'
   const status=({pending:'Pending',verified:'Verification Completed',rejected:'Rejected'})[record.verificationStatus]||displayValue(record.verificationStatus)
   return <tr key={getId(record)}><td><div className="project-cell"><b>{parcelId||'Unavailable'}</b><small>Survey no. {displayValue(parcel?.surveyNumber)}</small></div></td><td>{location}<br/><small>{displayValue(project?.name||projectId)}</small></td><td>{Array.isArray(record.photos)?`${record.photos.length} photo${record.photos.length===1?'':'s'}`:'Unavailable'}</td><td>{dateLabel(record.verifiedAt||record.createdAt)}</td><td>{displayValue(record.verifiedBy?.name||getId(record.verifiedBy))}</td><td><Badge status={status}/></td><td><button className="table-action">Open <ArrowRight size={12}/></button></td></tr>
  })}</tbody></table></div>{!verifications.length&&<p>No field verification records were returned.</p>}</section>
 </>
}
function Compensation(){
 const {parcels,projects}=useData()
 const pending=parcels.filter(parcel=>parcel.compensation?.status==='pending')
 const rrParcels=parcels.filter(parcel=>parcel.rehabilitation?.required===true)
 const rrComplete=rrParcels.filter(parcel=>parcel.rehabilitation?.status==='completed').length
 const rrPercent=rrParcels.length?Math.round(rrComplete/rrParcels.length*100):null
 const records=parcels.filter(parcel=>parcel.compensation)
 return <>
  <Header eyebrow="Financial administration" title="Compensation & R&R" description="Compensation and rehabilitation values from live land-parcel records."/>
  <div className="stats-grid four"><Stat icon={FileCheck2} label="Estimated · unit unspecified" value={formatAmount(sumAmounts(parcels,'estimatedAmount'))} change="Parcel records" /><Stat icon={CheckCircle2} label="Paid · unit unspecified" value={formatAmount(sumAmounts(parcels,'paidAmount'))} change="Parcel records" tone="green"/><Stat icon={Clock3} label="Pending · unit unspecified" value={formatAmount(sumAmounts(pending,'estimatedAmount'))} change={`${pending.length} pending parcel records`} tone="saffron"/><Stat icon={UsersRound} label="Affected families" value="Unavailable" change="Not provided by API"/></div>
  <div className="dashboard-grid">
   <section className="panel chart-panel"><Heading title="Disbursement overview" sub="Demo chart data · No compensation analytics endpoint is available"/><ResponsiveContainer width="100%" height={240}><AreaChart data={chartData}><CartesianGrid stroke="#e7ebf0" vertical={false}/><XAxis dataKey="m"/><YAxis/><Tooltip/><Area type="monotone" dataKey="a" stroke="#2e7d50" fill="#2e7d50" fillOpacity=".15"/></AreaChart></ResponsiveContainer></section>
   <section className="panel"><Heading title="R&R outcomes" sub={`${rrParcels.length} parcels marked as requiring rehabilitation`}/><Metric label="R&R completed" value={rrPercent} color="green"/><Detail label="Completed parcels" value={`${rrComplete} / ${rrParcels.length}`}/><Detail label="Housing support" value="Unavailable"/><Detail label="Livelihood support" value="Unavailable"/></section>
  </div>
  <section className="panel table-panel"><Heading title="Compensation records" sub="Parcel-level amounts from the API; currency units are not specified by the schema."/><div className="table-scroll"><table><thead><tr><th>Parcel / survey</th><th>Project</th><th>Status</th><th>Estimated</th><th>Approved</th><th>Paid</th></tr></thead><tbody>{records.map(parcel=>{
   const projectId=getId(parcel.project)
   const project=projects.find(record=>getId(record)===projectId)
   return <tr key={getId(parcel)}><td><div className="project-cell"><b>{getId(parcel)}</b><small>Survey no. {displayValue(parcel.surveyNumber)}</small></div></td><td>{displayValue(parcel.project?.name||project?.name||projectId)}</td><td><Badge status={parcelStatus(parcel.compensation.status)}/></td><td>{formatAmount(parcel.compensation.estimatedAmount)}</td><td>{formatAmount(parcel.compensation.approvedAmount)}</td><td>{formatAmount(parcel.compensation.paidAmount)}</td></tr>
  })}</tbody></table></div>{!records.length&&<p>No compensation records were returned.</p>}</section>
 </>
}
function AuditLogs(){return <><Header eyebrow="Governance & compliance" title="Audit logs" description="Audit history is unavailable because no audit-log API endpoint is exposed."/><section className="panel table-panel"><Heading title="Activity trail" sub="The backend currently exposes no audit history records."/><p>Unavailable from the current backend API.</p></section></>}
function Reports(){return <><Header eyebrow="Insights & exports" title="Reports" description="Report-generation APIs are not available; these report categories are static placeholders."/><div className="report-grid">{[['Project progress report','Acquisition progress across all active projects',FileBarChart],['Compensation statement','Assessed and disbursed compensation by project',Landmark],['Affected families register','Family and R&R status summary',UsersRound],['Audit activity report','System actions and governance trail',ShieldCheck]].map(([t,d,I])=><div className="report-card" key={t}><I size={21}/><h2>{t}</h2><p>{d}</p><button className="text-button" disabled>Not available</button></div>)}</div></>};function SettingsPage(){return <><Header eyebrow="Administration" title="Settings" description="Profile, notification and security settings remain disconnected from the backend."/><section className="panel settings-panel">{[['Administrator profile','Demo profile · no profile API is available','Unavailable'],['Notification preferences','No notification preferences API is available','Unavailable'],['Security','Authentication and security settings are out of scope','Unavailable']].map(x=><div className="settings-row" key={x[0]}><div><h2>{x[0]}</h2><span>{x[1]}</span></div><button className="outline-button" disabled>{x[2]}</button></div>)}</section></>}
export default App
