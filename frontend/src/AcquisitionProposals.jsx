import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Plus, RefreshCw, Save } from 'lucide-react'
import { departments } from './data/departments'
import {
  assignProposalReviewer,
  getAcquisitionProposal,
  getAcquisitionProposals,
  getProjects,
  getProposalReviewers,
  linkProposalProject,
  reviewAcquisitionProposal,
  saveAcquisitionProposal,
  submitAcquisitionProposal,
  withdrawAcquisitionProposal,
} from './services/api'

const emptyForm = {
  title: '',
  description: '',
  purpose: '',
  department: '',
  location: { state: 'Karnataka', district: '', taluk: '', village: '', address: '' },
  proposedArea: '',
  areaUnit: 'acres',
  project: '',
  proposedParcels: [],
  documents: [],
}

const statusLabel = (status) => (status || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const recordId = (value) => value && typeof value === 'object' ? value._id || value.id || '' : value || ''
const dateLabel = (value) => value ? new Date(value).toLocaleDateString() : 'Not submitted'
const proposalToForm = (record) => {
  const form = { ...emptyForm }
  for (const field of Object.keys(emptyForm)) {
    if (Object.prototype.hasOwnProperty.call(record || {}, field) && field !== 'location' && field !== 'proposedParcels' && field !== 'documents' && field !== 'project') {
      form[field] = record[field]
    }
  }
  form.project = recordId(record?.project)
  form.location = { ...emptyForm.location, ...(record?.location || {}) }
  form.proposedParcels = (record?.proposedParcels || []).map((parcel) => ({
    surveyReference: parcel.surveyReference || '',
    area: parcel.area ?? '',
    areaUnit: parcel.areaUnit || 'acres',
    district: parcel.location?.district || '',
    taluk: parcel.location?.taluk || '',
    village: parcel.location?.village || '',
  }))
  form.documents = (record?.documents || []).map((document) => ({
    name: document.name || '',
    type: document.type || '',
    status: document.status || 'received',
    reviewRemarks: document.reviewRemarks || '',
  }))
  return form
}

export default function AcquisitionProposals({ user }) {
  const { id, action } = useParams()
  const navigate = useNavigate()
  const [proposals, setProposals] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [proposal, setProposal] = useState(null)
  const [projects, setProjects] = useState([])
  const [reviewers, setReviewers] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [reviewerFilter, setReviewerFilter] = useState('')
  const [page, setPage] = useState(1)
  const [reviewerId, setReviewerId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [remarks, setRemarks] = useState('')
  const [loading, setLoading] = useState(!id || id !== 'new')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [supportError, setSupportError] = useState('')
  const [notice, setNotice] = useState('')
  const isEditor = ['admin', 'project_officer'].includes(user?.role)
  const canCreate = isEditor
  const departmentOptions = [...new Set([...departments.map((item) => item.name), ...proposals.map((item) => item.department).filter(Boolean)])].sort((a, b) => a.localeCompare(b))
  const canEdit = proposal && ['draft', 'changes_requested'].includes(proposal.status)
    && (user?.role === 'admin' || (user?.role === 'project_officer' && recordId(proposal.createdBy) === user.id))
  const canAssign = user?.role === 'admin' && proposal?.status === 'submitted'
  const canReview = proposal?.status === 'under_review'
    && (user?.role === 'admin' || (user?.role === 'reviewer' && recordId(proposal.assignedReviewer) === user.id))
  const canApprove = canReview
    && recordId(proposal.createdBy) !== user?.id
    && recordId(proposal.submittedBy) !== user?.id
  const canWithdraw = ['draft', 'submitted'].includes(proposal?.status)
    && (user?.role === 'admin' || (user?.role === 'project_officer' && recordId(proposal.createdBy) === user.id))
  const canLink = proposal?.status === 'approved' && !proposal.project
    && (user?.role === 'admin' || (user?.role === 'project_officer' && recordId(proposal.createdBy) === user.id))

  const loadList = useCallback(async () => {
    try {
      const result = await getAcquisitionProposals({
        q: search,
        status: statusFilter,
        department: departmentFilter,
        project: projectFilter,
        reviewer: reviewerFilter,
        page,
        limit: 20,
      })
      setError('')
      setProposals(result.proposals)
      setPagination(result.pagination)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [departmentFilter, page, projectFilter, reviewerFilter, search, statusFilter])

  const loadDetail = useCallback(async () => {
    if (!id || id === 'new') return
    try {
      const result = await getAcquisitionProposal(id)
      setError('')
      setProposal(result.proposal)
      setForm(proposalToForm(result.proposal))
      setProjectId('')
      setReviewerId('')
      setRemarks('')
    } catch (requestError) {
      setProposal(null)
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (user?.role === 'field_officer') return
    const controller = new AbortController()
    getProjects({ signal: controller.signal })
      .then(setProjects)
      .catch((requestError) => { if (!controller.signal.aborted) setSupportError(requestError.message) })
    if (['admin', 'project_officer'].includes(user?.role)) {
      getProposalReviewers({ signal: controller.signal })
        .then(setReviewers)
        .catch((requestError) => { if (!controller.signal.aborted) setSupportError(requestError.message) })
    }
    return () => controller.abort()
  }, [user?.role])

  useEffect(() => {
    if (user?.role === 'field_officer') return
    if (id === 'new' && !canCreate) return
    const controller = new AbortController()
    const { signal } = controller
    if (id === 'new') {
      return () => controller.abort()
    }
    if (id) {
      getAcquisitionProposal(id, { signal })
        .then((result) => {
          if (signal.aborted) return
          setError('')
          setProposal(result.proposal)
          setForm(proposalToForm(result.proposal))
          setProjectId('')
          setReviewerId('')
          setRemarks('')
        })
        .catch((requestError) => {
          if (!signal.aborted) {
            setProposal(null)
            setError(requestError.message)
          }
        })
        .finally(() => { if (!signal.aborted) setLoading(false) })
    } else {
      getAcquisitionProposals({
        q: search,
        status: statusFilter,
        department: departmentFilter,
        project: projectFilter,
        reviewer: reviewerFilter,
        page,
        limit: 20,
      }, { signal })
        .then((result) => {
          if (signal.aborted) return
          setError('')
          setProposals(result.proposals)
          setPagination(result.pagination)
        })
        .catch((requestError) => { if (!signal.aborted) setError(requestError.message) })
        .finally(() => { if (!signal.aborted) setLoading(false) })
    }
    return () => controller.abort()
  }, [canCreate, departmentFilter, id, page, projectFilter, reviewerFilter, search, statusFilter, user?.role])

  const runAction = async (operation, successMessage) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await operation()
      setNotice(result.message || successMessage)
      if (id && id !== 'new') await loadDetail()
      else if (!id) await loadList()
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setBusy(false)
    }
  }

  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const updateLocation = (field, value) => setForm((current) => ({ ...current, location: { ...current.location, [field]: value } }))
  const updateParcel = (index, field, value) => setForm((current) => ({
    ...current,
    proposedParcels: current.proposedParcels.map((parcel, parcelIndex) => parcelIndex === index
      ? field === 'areaUnit' ? { ...parcel, areaUnit: value } : { ...parcel, [field]: value }
      : parcel),
  }))
  const submitForm = async (event) => {
    event.preventDefault()
    const body = {
      ...form,
      proposedArea: Number(form.proposedArea),
      project: form.project || null,
      proposedParcels: form.proposedParcels.filter((parcel) => parcel.surveyReference.trim()).map((parcel) => ({
        ...parcel,
        area: Number(parcel.area),
        location: { district: parcel.district, taluk: parcel.taluk, village: parcel.village },
      })),
      documents: form.documents.filter((document) => document.name.trim() && document.type.trim()),
    }
    const result = await runAction(() => saveAcquisitionProposal(body, canEdit ? id : undefined), 'Proposal draft saved.')
    if (result?.proposal) navigate(`/acquisition-proposals/${recordId(result.proposal)}`)
  }

  if (user?.role === 'field_officer') {
    return <main className="proposal-page"><h1>Acquisition Proposals</h1><p role="alert">Your role is not permitted to access acquisition proposals.</p></main>
  }

  if (id === 'new' && !canCreate) {
    return <main className="proposal-page"><h1>Acquisition Proposals</h1><p role="alert">Your role is not permitted to create proposals.</p><Link to="/acquisition-proposals">Return to register</Link></main>
  }

  if (loading) return <main className="proposal-page"><p role="status">Loading acquisition proposals…</p></main>

  if (id === 'new' || (action === 'edit' && canEdit)) {
    const editing = Boolean(id && id !== 'new' && action === 'edit' && canEdit)
    return <main className="proposal-page">
      <header className="proposal-header"><div><p className="eyebrow">Portfolio management</p><h1>{editing ? 'Edit proposal draft' : 'Create acquisition proposal'}</h1><p className="page-description">Draft a proposal without creating a project or land-parcel record.</p></div><Link className="outline-button" to={editing ? `/acquisition-proposals/${id}` : '/acquisition-proposals'}><ArrowLeft size={15}/> Back</Link></header>
      {error && <p className="form-error" role="alert">{error}</p>}
      {supportError && <p className="form-error" role="alert">Project/reviewer options could not be loaded: {supportError}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      <form className="panel proposal-form" onSubmit={submitForm}>
        <div className="proposal-form-grid">
          <label>Proposal title<input required maxLength={200} value={form.title} onChange={(event) => updateForm('title', event.target.value)}/></label>
          <label>Department<select required value={form.department} onChange={(event) => updateForm('department', event.target.value)}><option value="">Select department</option>{departments.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}{form.department && !departments.some((item) => item.name === form.department) && <option value={form.department}>{form.department}</option>}</select></label>
          <label className="proposal-wide">Description<textarea required maxLength={5000} rows="3" value={form.description} onChange={(event) => updateForm('description', event.target.value)}/></label>
          <label className="proposal-wide">Purpose<textarea required maxLength={2000} rows="2" value={form.purpose} onChange={(event) => updateForm('purpose', event.target.value)}/></label>
          <label>State<input required maxLength={100} value={form.location.state} onChange={(event) => updateLocation('state', event.target.value)}/></label>
          <label>District<input required maxLength={100} value={form.location.district} onChange={(event) => updateLocation('district', event.target.value)}/></label>
          <label>Taluk<input maxLength={100} value={form.location.taluk} onChange={(event) => updateLocation('taluk', event.target.value)}/></label>
          <label>Village<input maxLength={100} value={form.location.village} onChange={(event) => updateLocation('village', event.target.value)}/></label>
          <label className="proposal-wide">Address / location notes<input maxLength={300} value={form.location.address} onChange={(event) => updateLocation('address', event.target.value)}/></label>
          <label>Proposed total area<input required type="number" min="0.0001" step="any" value={form.proposedArea} onChange={(event) => updateForm('proposedArea', event.target.value)}/></label>
          <label>Area unit<select value={form.areaUnit} onChange={(event) => updateForm('areaUnit', event.target.value)}>{['acres', 'hectares', 'square_metres', 'square_feet'].map((unit) => <option key={unit}>{unit}</option>)}</select></label>
          <label className="proposal-wide">Existing project association (optional)<select value={form.project} onChange={(event) => updateForm('project', event.target.value)}><option value="">No project yet</option>{projects.map((item) => <option key={recordId(item)} value={recordId(item)}>{item.projectCode || item.name} · {item.location}</option>)}</select></label>
        </div>
        <section className="proposal-subform"><div className="proposal-subform-heading"><div><h2>Proposed parcel descriptions</h2><p>Proposal-time descriptions only; these do not create or alter land parcels.</p></div><button type="button" className="outline-button" onClick={() => updateForm('proposedParcels', [...form.proposedParcels, { surveyReference: '', area: '', areaUnit: form.areaUnit, district: '', taluk: '', village: '' }])}><Plus size={14}/> Add parcel</button></div>
          {form.proposedParcels.map((parcel, index) => <div className="proposal-parcel-row" key={`parcel-${index}`}><label>Survey reference<input required maxLength={100} value={parcel.surveyReference} onChange={(event) => updateParcel(index, 'surveyReference', event.target.value)}/></label><label>Area<input required type="number" min="0.0001" step="any" value={parcel.area} onChange={(event) => updateParcel(index, 'area', event.target.value)}/></label><label>Unit<select value={parcel.areaUnit} onChange={(event) => updateParcel(index, 'areaUnit', event.target.value)}>{['acres', 'hectares', 'square_metres', 'square_feet'].map((unit) => <option key={unit}>{unit}</option>)}</select></label><label>Village<input maxLength={100} value={parcel.village} onChange={(event) => updateParcel(index, 'village', event.target.value)}/></label><button type="button" className="text-button" onClick={() => updateForm('proposedParcels', form.proposedParcels.filter((_, parcelIndex) => parcelIndex !== index))}>Remove</button></div>)}
        </section>
        <section className="proposal-subform"><div className="proposal-subform-heading"><div><h2>Document metadata</h2><p>Metadata only. This module does not upload or store document files.</p></div><button type="button" className="outline-button" onClick={() => updateForm('documents', [...form.documents, { name: '', type: '', status: 'received' }])}><Plus size={14}/> Add document</button></div>
          {form.documents.map((document, index) => <div className="proposal-document-row" key={`document-${index}`}><label>Document name<input maxLength={150} value={document.name} onChange={(event) => setForm((current) => ({ ...current, documents: current.documents.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))}/></label><label>Type<input maxLength={100} value={document.type} onChange={(event) => setForm((current) => ({ ...current, documents: current.documents.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value } : item) }))}/></label><label>Status<select value={document.status} onChange={(event) => setForm((current) => ({ ...current, documents: current.documents.map((item, itemIndex) => itemIndex === index ? { ...item, status: event.target.value } : item) }))}>{['pending', 'received', 'approved', 'rejected'].map((value) => <option key={value}>{value}</option>)}</select></label><button type="button" className="text-button" onClick={() => updateForm('documents', form.documents.filter((_, documentIndex) => documentIndex !== index))}>Remove</button></div>)}
        </section>
        <div className="proposal-form-actions"><button className="primary-button" type="submit" disabled={busy}><Save size={15}/>{busy ? 'Saving…' : 'Save draft'}</button>{error && <span className="form-error" role="alert">{error}</span>}</div>
      </form>
    </main>
  }

  if (!id) return <main className="proposal-page">
    <header className="proposal-header"><div><p className="eyebrow">Portfolio management</p><h1>Acquisition Proposals</h1><p className="page-description">Prepare, submit and review acquisition proposals before project delivery begins.</p></div>{canCreate && <Link className="primary-button" to="/acquisition-proposals/new"><Plus size={15}/> New proposal</Link>}</header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {supportError && <p className="form-error" role="alert">Project/reviewer options could not be loaded: {supportError}</p>}
    <div className="filter-bar">
      <input aria-label="Search proposals" placeholder="Search proposal number, title or location" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }}/>
      <select aria-label="Filter by proposal status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}><option value="">All statuses</option>{['draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'rejected', 'withdrawn'].map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select>
      <select aria-label="Filter by department" value={departmentFilter} onChange={(event) => { setDepartmentFilter(event.target.value); setPage(1) }}><option value="">All departments</option>{departmentOptions.map((value) => <option key={value}>{value}</option>)}</select>
      <select aria-label="Filter by linked project" value={projectFilter} onChange={(event) => { setProjectFilter(event.target.value); setPage(1) }}><option value="">All project associations</option>{projects.map((item) => <option key={recordId(item)} value={recordId(item)}>{item.projectCode || item.name}</option>)}</select>
      {['admin', 'project_officer'].includes(user?.role) && <select aria-label="Filter by assigned reviewer" value={reviewerFilter} onChange={(event) => { setReviewerFilter(event.target.value); setPage(1) }}><option value="">All reviewers</option>{reviewers.map((item) => <option key={recordId(item)} value={recordId(item)}>{item.name}</option>)}</select>}
      <button className="outline-button" onClick={loadList} disabled={loading}><RefreshCw size={14}/> Refresh</button>
    </div>
    <section className="panel table-panel"><div className="panel-heading"><div><h2>Proposal register · {pagination.total}</h2><span>Proposal records are separate from projects until explicitly linked.</span></div></div>{loading ? <p role="status">Loading proposals…</p> : proposals.length ? <div className="table-scroll" role="region" aria-label="Acquisition proposal register" tabIndex={0}><table><thead><tr><th>Proposal</th><th>Department</th><th>Location</th><th>Proposed area</th><th>Created by</th><th>Reviewer</th><th>Status</th><th>Submitted</th><th/></tr></thead><tbody>{proposals.map((item) => <tr key={recordId(item)}><td><b>{item.proposalNumber}</b><small>{item.title}{item.isDemo ? ' · synthetic demo' : ''}</small></td><td>{item.department}</td><td>{[item.location?.district, item.location?.village].filter(Boolean).join(', ') || '—'}</td><td>{item.proposedArea} {item.areaUnit}</td><td>{item.createdBy?.name || '—'}</td><td>{item.assignedReviewer?.name || 'Unassigned'}</td><td><span className="badge neutral">{statusLabel(item.status)}</span></td><td>{dateLabel(item.submittedAt)}</td><td><Link className="text-button" to={`/acquisition-proposals/${recordId(item)}`}>Open <ArrowRight size={13}/></Link></td></tr>)}</tbody></table></div> : <p className="empty-state">No proposals match these filters. Create a draft to begin.</p>}</section>
    <div className="pagination"><span>Page {pagination.page} of {Math.max(1, pagination.pages)}</span><button className="outline-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button className="outline-button" disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>Next</button></div>
  </main>

  if (error && !proposal) return <main className="proposal-page"><header className="proposal-header"><h1>Acquisition Proposal</h1><Link className="outline-button" to="/acquisition-proposals"><ArrowLeft size={15}/> Register</Link></header><p className="form-error" role="alert">{error}</p></main>
  if (!proposal) return <main className="proposal-page"><p role="status">Proposal not found.</p><Link to="/acquisition-proposals">Return to register</Link></main>

  const submitForReview = () => runAction(() => submitAcquisitionProposal(id), 'Proposal submitted.')
  return <main className="proposal-page">
    <header className="proposal-header"><div><p className="eyebrow">Acquisition proposal</p><h1>{proposal.title}</h1><p className="page-description">{proposal.proposalNumber} · {proposal.department} · {statusLabel(proposal.status)}</p></div><div className="proposal-header-actions"><Link className="outline-button" to="/acquisition-proposals"><ArrowLeft size={15}/> Register</Link>{canEdit && <Link className="outline-button" to={`/acquisition-proposals/${id}/edit`}>Edit draft</Link>}</div></header>
    {notice && <p className="notice" role="status">{notice}</p>}{error && <p className="form-error" role="alert">{error}</p>}
    {supportError && <p className="form-error" role="alert">Project/reviewer options could not be loaded: {supportError}</p>}
    <section className="panel proposal-detail-grid"><div><span>Location</span><b>{[proposal.location?.village, proposal.location?.taluk, proposal.location?.district, proposal.location?.state].filter(Boolean).join(', ')}</b></div><div><span>Proposed area</span><b>{proposal.proposedArea} {proposal.areaUnit}</b></div><div><span>Created by</span><b>{proposal.createdBy?.name || 'Unavailable'}</b></div><div><span>Assigned reviewer</span><b>{proposal.assignedReviewer?.name || 'Unassigned'}</b></div><div><span>Submission date</span><b>{dateLabel(proposal.submittedAt)}</b></div><div><span>Linked project</span><b>{proposal.project ? <Link to={`/projects/${recordId(proposal.project)}`}>{proposal.project.projectCode || proposal.project.name}</Link> : 'Not linked'}</b></div><div className="proposal-detail-wide"><span>Purpose</span><p>{proposal.purpose}</p></div><div className="proposal-detail-wide"><span>Description</span><p>{proposal.description}</p></div></section>
    <section className="panel table-panel"><div className="panel-heading"><div><h2>Proposed parcels</h2><span>Proposal-time descriptions, not registered land-parcel records.</span></div></div>{proposal.proposedParcels?.length ? <div className="table-scroll" role="region" aria-label="Proposed parcel descriptions" tabIndex={0}><table><thead><tr><th>Survey reference</th><th>Area</th><th>Location</th></tr></thead><tbody>{proposal.proposedParcels.map((parcel) => <tr key={recordId(parcel)}><td>{parcel.surveyReference}</td><td>{parcel.area} {parcel.areaUnit}</td><td>{[parcel.location?.village, parcel.location?.taluk, parcel.location?.district].filter(Boolean).join(', ') || '—'}</td></tr>)}</tbody></table></div> : <p>No parcel descriptions recorded.</p>}</section>
    <section className="panel table-panel"><div className="panel-heading"><div><h2>Document metadata</h2><span>No document files are stored by this module.</span></div></div>{proposal.documents?.length ? <ul className="proposal-doc-list">{proposal.documents.map((item) => <li key={recordId(item)}>{item.name} · {item.type} · {statusLabel(item.status)}</li>)}</ul> : <p>No document metadata recorded.</p>}</section>
    {proposal.decisionRemarks && <section className="panel"><h2>Latest decision remarks</h2><p>{proposal.decisionRemarks}</p></section>}
    <section className="panel table-panel"><div className="panel-heading"><div><h2>Review history</h2><span>Server-recorded lifecycle events.</span></div></div>{proposal.reviewHistory?.length ? <ol className="proposal-history">{proposal.reviewHistory.map((event) => <li key={recordId(event)}><b>{statusLabel(event.action)}</b><span>{event.actor?.name || 'System'} · {new Date(event.timestamp).toLocaleString()}</span>{event.remarks && <p>{event.remarks}</p>}</li>)}</ol> : <p>No review history recorded.</p>}</section>
    <section className="panel proposal-actions"><h2>Available actions</h2>
      {canEdit && <div><p>Update the draft before submission.</p><Link className="outline-button" to={`/acquisition-proposals/${id}/edit`}>Edit draft</Link></div>}
      {canEdit && ['draft', 'changes_requested'].includes(proposal.status) && <button className="primary-button" disabled={busy} onClick={submitForReview}>Submit for review</button>}
      {canAssign && <div className="proposal-action-row"><label>Assign reviewer<select required value={reviewerId} onChange={(event) => setReviewerId(event.target.value)}><option value="">Select reviewer</option>{reviewers.map((reviewer) => <option key={recordId(reviewer)} value={recordId(reviewer)}>{reviewer.name}{reviewer.department ? ` · ${reviewer.department}` : ''}</option>)}</select></label><button className="primary-button" disabled={busy || !reviewerId} onClick={() => runAction(() => assignProposalReviewer(id, reviewerId), 'Reviewer assigned.')}>Assign and start review</button></div>}
      {canReview && <div className="proposal-review-action"><label>Decision remarks (required)<textarea minLength="5" maxLength="1000" required value={remarks} onChange={(event) => setRemarks(event.target.value)} rows="3"/></label>{!canApprove && <p role="status">You created or submitted this proposal. You may request changes or reject it, but you cannot approve your own proposal.</p>}<div className="proposal-header-actions">{[['request_changes', 'Request changes'], ['approve', 'Approve'], ['reject', 'Reject']].map(([action, label]) => <button key={action} className={action === 'approve' ? 'primary-button' : 'outline-button'} disabled={busy || remarks.trim().length < 5 || (action === 'approve' && !canApprove)} onClick={() => runAction(() => reviewAcquisitionProposal(id, action, remarks), `Proposal ${label.toLowerCase()}.`)}>{label}</button>)}</div></div>}
      {canWithdraw && <button className="outline-button" disabled={busy} onClick={() => runAction(() => withdrawAcquisitionProposal(id), 'Proposal withdrawn.')}>Withdraw proposal</button>}
      {canLink && <div className="proposal-action-row"><label>Link existing project<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Select project</option>{projects.map((item) => <option key={recordId(item)} value={recordId(item)}>{item.projectCode || item.name} · {item.location}</option>)}</select></label><button className="primary-button" disabled={busy || !projectId} onClick={() => runAction(() => linkProposalProject(id, projectId), 'Proposal linked to project.')}>Link project</button></div>}
      {!canEdit && !canAssign && !canReview && !canWithdraw && !canLink && <p>No workflow actions are available for your role or this proposal state.</p>}
    </section>
  </main>
}
