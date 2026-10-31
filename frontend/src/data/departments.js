export const departments = [
  { name: 'Public Works Department (PWD)', kind: 'department', parent: 'State/Union Territory government' },
  { name: 'National Highways Authority of India (NHAI)', kind: 'implementing_agency', parent: 'Ministry of Road Transport and Highways' },
  { name: 'Ministry of Road Transport and Highways (MoRTH)', kind: 'ministry', parent: 'Government of India' },
  { name: 'Irrigation and Water Resources Department', kind: 'department', parent: 'State/Union Territory government' },
  { name: 'Indian Railways', kind: 'implementing_agency', parent: 'Ministry of Railways' },
  { name: 'Ministry of Railways', kind: 'ministry', parent: 'Government of India' },
  { name: 'Energy and Power Department', kind: 'department', parent: 'State/Union Territory government' },
  { name: 'Urban Development and Municipal Administration', kind: 'department', parent: 'State/Union Territory government' },
  { name: 'Rural Development Department', kind: 'department', parent: 'State/Union Territory government' },
  { name: 'Housing and Urban Development Department', kind: 'department', parent: 'State/Union Territory government' },
  { name: 'Industrial Development Department', kind: 'department', parent: 'State/Union Territory government' },
  { name: 'Water Supply and Sanitation Department', kind: 'department', parent: 'State/Union Territory government' },
  { name: 'Other department or agency', kind: 'other', parent: '' },
]

export const departmentLabel = (department) => {
  if (!department) return 'Unavailable'
  const entry = departments.find((item) => item.name === department)
  return entry ? `${entry.name} · ${entry.kind.replaceAll('_', ' ')}` : department
}
