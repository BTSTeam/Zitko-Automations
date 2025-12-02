'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

type PlaceholderKey =
  | 'title'
  | 'location'
  | 'salary'
  | 'description'
  | 'benefits'
  | 'email'
  | 'phone';

type Region = 'IE' | 'UK' | 'US';

const MAX_JOBS = 8;

const COVER_BY_REGION: Record<Region, string> = {
  IE: '/templates/IRE-Cover.png',
  UK: '/templates/UK-Cover.png',
  US: '/templates/US-Cover.png',
};

const TEMPLATE_BY_REGION: Record<Region, string> = {
  IE: '/templates/zitko-dark-arc.png',          // Dark Arc
  UK: '/templates/zitko-dark-arc.png',          // Dark Arc
  US: '/templates/US-JZ-Template.png',          // New US template
};

interface JobZoneJob {
  jobId: string;
  title: string;
  location: string;
  salary: string;
  email: string;
  phone: string;
  description: string;
  benefits: string;
  fontSizes: Partial<Record<PlaceholderKey, number>>;
}

interface JobZoneSectionProps {
  enabled?: boolean;
}

export function JobZoneSection({ enabled = true }: JobZoneSectionProps) {
  const [region, setRegion] = useState<Region>('IE');
  const [jobIds, setJobIds] = useState<string[]>(Array(MAX_JOBS).fill(''));
  const [jobs, setJobs] = useState<JobZoneJob[]>([]);
  const [isFetching, setIsFetching] = useState(false);

  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const activeJobs = useMemo(
    () => jobs.filter(j => j.jobId.trim() !== ''),
    [jobs]
  );

  // ---- Fetch + hydrate a single job by ID ----
  const hydrateJob = useCallback(
    async (jobId: string): Promise<JobZoneJob | null> => {
      const trimmed = jobId.trim();
      if (!trimmed) return null;

      try {
        // 1) Fetch from Vincere (copy your existing SocialMediaTab logic here)
        const jobRes = await fetch(`/api/vincere/position/${trimmed}`);
        if (!jobRes.ok) throw new Error('Job fetch failed');
        const job = await jobRes.json();

        const description: string =
          job.publicDescription ||
          job.internalDescription ||
          job.description ||
          '';

        // 2) Extract title/location/salary/benefits
        const summaryRes = await fetch('/api/job/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description }),
        });
        const summary = summaryRes.ok ? await summaryRes.json() : {};

        // 3) TSI responsibilities + combined benefits line
        const shortRes = await fetch('/api/job/short-description', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description, mode: 'tsi' }),
        });
        const shortData = shortRes.ok ? await shortRes.json() : {};

        const mergedBenefits =
          shortData.benefits ||
          (Array.isArray(summary.benefits)
            ? summary.benefits.join('\n')
            : '') ||
          '';

        return {
          jobId: trimmed,
          title: summary.title || job.jobTitle || '',
          location: summary.location || job.location || '',
          salary: summary.salary || job.salaryText || '',
          // adjust these to your job payload fields:
          email: job.ownerEmail || job.contactEmail || '',
          phone: job.ownerPhone || job.contactPhone || '',
          description: shortData.description || '',
          benefits: mergedBenefits,
          fontSizes: {},
        };
      } catch (e) {
        console.error('JobZone hydrateJob error', e);
        return null;
      }
    },
    []
  );

  const handleFetchAll = useCallback(async () => {
    setIsFetching(true);
    try {
      const loaded: JobZoneJob[] = [];
      for (const id of jobIds) {
        const job = await hydrateJob(id);
        if (job) loaded.push(job);
      }
      setJobs(loaded);
    } finally {
      setIsFetching(false);
    }
  }, [jobIds, hydrateJob]);

  const updateJobField = useCallback(
    (idx: number, field: keyof JobZoneJob, value: string) => {
      setJobs(prev =>
        prev.map((j, i) => (i === idx ? { ...j, [field]: value } : j))
      );
    },
    []
  );

  const updateFontSize = useCallback(
    (idx: number, key: PlaceholderKey, value: number) => {
      setJobs(prev =>
        prev.map((job, i) =>
          i === idx
            ? {
                ...job,
                fontSizes: { ...job.fontSizes, [key]: value },
              }
            : job
        )
      );
    },
    []
  );

  const captureAllAsPng = useCallback(async () => {
    const jobsToExport = activeJobs;
    if (!jobsToExport.length) return;

    const refs = cardRefs.current;

    for (let i = 0; i < jobsToExport.length; i++) {
      const node = refs[i];
      if (!node) continue;

      const canvas = await html2canvas(node, {
        useCORS: true,
        backgroundColor: '#ffffff',
        scale: 2,
      });

      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      const safeTitle =
        jobsToExport[i].title?.replace(/[^\w.-]+/g, '_') || `job-${i + 1}`;

      a.href = dataUrl;
      a.download = `${region}-jobzone-${safeTitle}.png`;
      a.click();
    }
  }, [activeJobs, region]);

  const captureAllAsPdf = useCallback(async () => {
    const jobsToExport = activeJobs;
    if (!jobsToExport.length) return;

    const refs = cardRefs.current;
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: [1080, 1080],
    });

    let first = true;

    for (let i = 0; i < jobsToExport.length; i++) {
      const node = refs[i];
      if (!node) continue;

      const canvas = await html2canvas(node, {
        useCORS: true,
        backgroundColor: '#ffffff',
        scale: 2,
      });

      const img = canvas.toDataURL('image/png');
      if (!first) pdf.addPage();
      first = false;
      pdf.addImage(img, 'PNG', 0, 0, 1080, 1080);
    }

    pdf.save(`job-zone-${region}.pdf`);
  }, [activeJobs, region]);

  if (!enabled) return null;

  return (
    <section className="space-y-6">
      {/* PANEL 1: Region selector + up to 8 Job IDs */}
      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Job Zone</h2>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">Region:</span>
            {(['IE', 'UK', 'US'] as Region[]).map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setRegion(r)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  region === r
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {r === 'IE' ? 'Ireland' : r}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          {Array.from({ length: MAX_JOBS }).map((_, idx) => (
            <input
              key={idx}
              type="text"
              placeholder={`Job ID ${idx + 1}`}
              className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
              value={jobIds[idx] || ''}
              onChange={e => {
                const next = [...jobIds];
                next[idx] = e.target.value;
                setJobIds(next);
              }}
            />
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleFetchAll}
            disabled={isFetching}
            className="rounded-md bg-slate-800 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isFetching ? 'Loading…' : 'Fetch Jobs'}
          </button>
        </div>
      </div>

      {/* PANEL 2: left = 8×data forms, right = cover + 8×previews */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* LEFT: forms */}
        <div className="space-y-4">
          {activeJobs.map((job, idx) => (
            <div
              key={job.jobId || idx}
              className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <h3 className="text-sm font-semibold">
                Job {idx + 1} – {job.jobId}
              </h3>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                  placeholder="Job Title"
                  value={job.title}
                  onChange={e =>
                    updateJobField(idx, 'title', e.target.value)
                  }
                />
                <input
                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                  placeholder="Location"
                  value={job.location}
                  onChange={e =>
                    updateJobField(idx, 'location', e.target.value)
                  }
                />
                <input
                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                  placeholder="Salary"
                  value={job.salary}
                  onChange={e =>
                    updateJobField(idx, 'salary', e.target.value)
                  }
                />
                <input
                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                  placeholder="Email"
                  value={job.email}
                  onChange={e =>
                    updateJobField(idx, 'email', e.target.value)
                  }
                />
                <input
                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                  placeholder="Phone Number"
                  value={job.phone}
                  onChange={e =>
                    updateJobField(idx, 'phone', e.target.value)
                  }
                />
              </div>

              <textarea
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                rows={3}
                placeholder="Short Description"
                value={job.description}
                onChange={e =>
                  updateJobField(idx, 'description', e.target.value)
                }
              />

              <textarea
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                rows={3}
                placeholder="Benefits (one per line)"
                value={job.benefits}
                onChange={e =>
                  updateJobField(idx, 'benefits', e.target.value)
                }
              />

              {/* font sizes per template */}
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                {(['title', 'location', 'salary', 'description', 'benefits'] as PlaceholderKey[]).map(
                  key => (
                    <label key={key} className="flex items-center gap-1">
                      <span className="w-20 capitalize text-slate-500">
                        {key}
                      </span>
                      <input
                        type="number"
                        min={10}
                        max={80}
                        value={job.fontSizes[key] ?? ''}
                        onChange={e =>
                          updateFontSize(
                            idx,
                            key,
                            Number(e.target.value || 0)
                          )
                        }
                        className="w-20 rounded border border-slate-200 px-1 py-0.5 text-xs"
                      />
                    </label>
                  )
                )}
              </div>
            </div>
          ))}
        </div>

        {/* RIGHT: cover + previews */}
        <div className="space-y-4">
          {/* Cover on top */}
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <img
              src={COVER_BY_REGION[region]}
              alt={`${region} cover`}
              className="block w-full"
            />
          </div>

          {/* Previews – only as many as job IDs entered */}
          <div className="space-y-4">
            {activeJobs.map((job, idx) => (
              <div
                key={job.jobId || idx}
                ref={el => {
                  cardRefs.current[idx] = el;
                }}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
              >
                <JobCardPreview
                  backgroundSrc={TEMPLATE_BY_REGION[region]}
                  job={job}
                />
              </div>
            ))}
          </div>

          {/* Export buttons */}
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={captureAllAsPng}
              disabled={!activeJobs.length}
              className="rounded-md bg-slate-800 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Download PNGs
            </button>
            <button
              type="button"
              onClick={captureAllAsPdf}
              disabled={!activeJobs.length}
              className="rounded-md border border-slate-800 px-4 py-1.5 text-sm font-semibold text-slate-800 disabled:opacity-40"
            >
              Download PDF
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// IMPORTANT: replace this body with the same layout you already use
// for the Zitko Dark Arcs preview in SocialMediaTab, wired to `job`.
function JobCardPreview({
  backgroundSrc,
  job,
}: {
  backgroundSrc: string;
  job: JobZoneJob;
}) {
  return (
    <div className="relative aspect-square w-full bg-black">
      <img
        src={backgroundSrc}
        alt="Job Zone template"
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* 
        Paste your existing absolutely-positioned text layers here:
        - job.title, job.location, job.salary, job.description, job.benefits
        - job.email, job.phone
        - location icon image positioned in sync with the location text

        Use job.fontSizes[key] to override font sizes, falling back to your
        existing defaults so layout matches 'Zitko – Dark Arcs'.
      */}
    </div>
  );
}
