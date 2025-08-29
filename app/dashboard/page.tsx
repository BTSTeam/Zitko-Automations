// app/dashboard/page.tsx
// Updated dashboard/page.tsx with Page Size dropdown removed and KPIs section hidden
'use client'
import { useState, useEffect, type Dispatch, type SetStateAction, type ReactNode } from 'react'

type TabKey = 'match' | 'source' | 'cv'

type JobSummary = {
  id?: string
  job_title?: string
  location?: string
  skills?: string[]
  qualifications?: string[]
  public_description?: string
  internal_description?: string
  coords?: { lat: number, lng: number } | null
}

type CandidateRow = {
  id: string
  name: string
  title?: string
  location?: string
  linkedin?: string | null
  skills?: string[]
}

type ScoredRow = {
  candidateId: string
  candidateName: string
  score: number
  reason: string
  linkedin?: string
}

// --- helpers ---
function htmlToText(html?: string): string {
  if (!html) return ''
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return (doc.body?.textContent || '')
      .replace(/\u00A0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  } catch {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
}

function KPIs() {
  return (
    <div className="grid sm:grid-cols-3 gap-4 mb-6">
      <div className="kpi"><h3>—</h3><p>Candidates Matched</p></div>
      <div className="kpi"><h3>—</h3><p>Candidates Sourced</p></div>
      <div className="kpi"><h3>—</h3><p>CVs Formatted</p></div>
    </div>
  )
}

function Tabs({
  tab,
  setTab
}: {
  tab: TabKey
  setTab: Dispatch<SetStateAction<TabKey>>
}) {
  const Item = ({ id, children }: { id: TabKey; children: ReactNode }) => (
    <button
      onClick={() => setTab(id)}
      className={`tab ${tab === id ? 'tab-active' : ''}`}
    >
      {children}
    </button>
  )
  return (
    <div className="flex gap-2 mb-6 justify-center">
      <Item id="match">Candidate Matching</Item>
      <Item id="source">Candidate Sourcing</Item>
      <Item id="cv">CV Formatting</Item>
    </div>
  )
}

function Table({
  rows, sortBy, setSortBy, filter, setFilter
}: {
  rows: ScoredRow[],
  sortBy: [keyof ScoredRow, 'asc'|'desc'],
  setSortBy: (s:[keyof ScoredRow,'asc'|'desc'])=>void,
  filter: string,
  setFilter: (v:string)=>void
}) {
  const sorted = [...rows].sort((a,b)=>{
    const [key, dir] = sortBy
    const va = a[key], vb = b[key]
    let cmp = 0
    if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb
    else cmp = String(va ??
