'use client'

import React, { useState, useRef } from 'react'
import { bakeHeaderFooter } from './CvUtils'

/**
 * SalesFormat.tsx — full standalone Sales CV importer
 * -------------------------------------------------------
 * - Imports a PDF/DOCX file, bakes header/footer (Zitko branding)
 * - Uploads to Vincere
 * - Uses same logic and UI behaviour as original CvTab “Sales” mode
 */

export default function SalesFormat(): JSX.Element {
  // ======== UI state ========
  const [candidateId, setCandidateId] = useState('')
  const [candidateName, setCandidateName] = useState('')
  const [processing, setProcessing] = useState(false)
  const [salesDocName, setSalesDocName] = useState('')
  const [salesDocUrl, setSalesDocUrl] = useState<string | null>(null)
  const [salesErr, setSalesErr] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ======== Handle file selection ========
  async function onUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await handleFile(file)
  }

  async function handleFile(file: File) {
    try {
      setProcessing(true)
      setSalesDocName(file.name)
      setSalesErr(null)
      setSuccessMsg(null)

      // Add branding header/footer for sales CV
      const baked = await bakeHeaderFooter(file)
      const url = URL.createObjectURL(baked)
      setSalesDocUrl(url)
    } catch (err: any) {
      setSalesErr(err.message || 'Error processing file')
    } finally {
      setProcessing(false)
    }
  }

  // ======== Drag-and-drop support ========
  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  function onClickUpload() {
    fileInputRef.current?.click()
  }

  // ======== Upload to Vincere ========
  async function uploadToVincere() {
    if (!salesDocUrl) return
    try {
      setProcessing(true)
      const blob = await fetch(salesDocUrl).then((r) => r.blob())
      const formData = new FormData()
      const fileName = salesDocName?.replace(/\.(docx?|pdf)$/i, '') || 'SalesCV'
      formData.append('file', blob, `${fileName}_Sales.pdf`)
      formData.append('candidateId', candidateId)
      const res = await fetch('/api/vincere/upload', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error('Upload failed')
      setSuccessMsg('Sales CV uploaded successfully!')
    } catch (err: any) {
      setSalesErr(err.message)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="card p-4 space-y-4">
      <h2 className="font-semibold text-lg mb-2">Sales Format CV Import</h2>

      {/* Candidate input */}
      <div className="grid sm:grid-cols-[1fr_auto] gap-2">
        <input
          className="input"
          placeholder="Enter Candidate ID"
          value={candidateId}
          onChange={(e) => setCandidateId(e.target.value)}
          disabled={processing}
        />
      </div>

      {/* File input (hidden) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={onUploadChange}
        className="hidden"
      />

      {/* Drag/drop area */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${
          dragOver ? 'border-[#F7941D]' : 'border-gray-300 hover:border-gray-400'
        }`}
        onClick={onClickUpload}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <p className="text-sm text-gray-600">
          {salesDocName
            ? `File selected: ${salesDocName}`
            : 'Click or drag a PDF/DOCX file here to import'}
        </p>
      </div>

      <div className="flex gap-3 mt-3">
        <button
          type="button"
          className="btn btn-brand"
          onClick={onClickUpload}
          disabled={processing}
        >
          {processing ? 'Processing…' : 'Import CV'}
        </button>
        <button
          type="button"
          className="btn btn-grey"
          onClick={uploadToVincere}
          disabled={!salesDocUrl || !candidateId || processing}
        >
          Upload to Vincere
        </button>
      </div>

      {salesErr && (
        <div className="text-xs text-red-600 mt-2">
          {String(salesErr).slice(0, 300)}
        </div>
      )}
      {successMsg && (
        <div className="text-xs text-green-600 mt-2">{successMsg}</div>
      )}

      {/* Preview area */}
      {salesDocUrl && (
        <div className="mt-6 border-t pt-4">
          <h3 className="font-semibold text-sm mb-2">Preview</h3>
          <iframe
            src={salesDocUrl}
            className="w-full h-[600px] border rounded"
            title="Sales CV Preview"
          />
        </div>
      )}
    </div>
  )
}
