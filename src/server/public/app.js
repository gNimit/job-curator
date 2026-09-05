let allJobs = [];
let currentProfile = null;

// DOM Elements
const profileSelect = document.getElementById('profileSelect');
const candidateName = document.getElementById('candidateName');
const candidateHeadline = document.getElementById('candidateHeadline');
const candidateSummary = document.getElementById('candidateSummary');
const constraintsGrid = document.getElementById('constraintsGrid');
const jobsContainer = document.getElementById('jobsContainer');
const searchInput = document.getElementById('searchInput');
const filterRecommendation = document.getElementById('filterRecommendation');
const filterBoard = document.getElementById('filterBoard');
const sortOrder = document.getElementById('sortOrder');
const btnCurate = document.getElementById('btnCurate');
const btnExportCsv = document.getElementById('btnExportCsv');
const btnExportJson = document.getElementById('btnExportJson');
const evalModal = document.getElementById('evalModal');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalBody = document.getElementById('modalBody');

// Stats Elements
const statTotal = document.getElementById('statTotal');
const statStrong = document.getElementById('statStrong');
const statModerate = document.getElementById('statModerate');
const statPassed = document.getElementById('statPassed');
const statAvgScore = document.getElementById('statAvgScore');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadProfiles();

  profileSelect.addEventListener('change', async (e) => {
    const profileId = e.target.value;
    if (profileId) {
      await loadProfileData(profileId);
    }
  });

  searchInput.addEventListener('input', renderJobs);
  filterRecommendation.addEventListener('change', renderJobs);
  filterBoard.addEventListener('change', renderJobs);
  sortOrder.addEventListener('change', renderJobs);

  modalCloseBtn.addEventListener('click', () => {
    evalModal.classList.remove('active');
  });

  evalModal.addEventListener('click', (e) => {
    if (e.target === evalModal) {
      evalModal.classList.remove('active');
    }
  });

  btnCurate.addEventListener('click', async () => {
    if (!currentProfile) return;
    btnCurate.disabled = true;
    const originalText = btnCurate.innerHTML;
    btnCurate.innerHTML = '⏳ Scraping & Evaluating...';

    try {
      const res = await fetch(`/api/profiles/${currentProfile.id}/curate`, { method: 'POST' });
      const data = await res.json();
      if (data.jobs) {
        allJobs = data.jobs;
        renderStats();
        renderJobs();
      }
    } catch (err) {
      alert(`Scrape error: ${err.message}`);
    } finally {
      btnCurate.disabled = false;
      btnCurate.innerHTML = originalText;
    }
  });
});

async function loadProfiles() {
  try {
    const res = await fetch('/api/profiles');
    const profiles = await res.json();

    profileSelect.innerHTML = '';
    if (!profiles || profiles.length === 0) {
      profileSelect.innerHTML = '<option value="">No profiles found</option>';
      jobsContainer.innerHTML =
        '<div style="text-align: center; padding: 3rem;">No profiles available. Run <code>job-curator run --resume resumes/candidate.pdf</code> to create one.</div>';
      return;
    }

    profiles.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.fullName} (${p.headline})`;
      profileSelect.appendChild(opt);
    });

    await loadProfileData(profiles[0].id);
  } catch (err) {
    console.error('Failed to load profiles:', err);
  }
}

async function loadProfileData(profileId) {
  try {
    // 1. Load Persona details
    const pRes = await fetch(`/api/profiles/${profileId}`);
    currentProfile = await pRes.json();
    renderProfileBanner(currentProfile);

    // Update export links
    btnExportCsv.href = `/api/profiles/${profileId}/export/csv`;
    btnExportJson.href = `/api/profiles/${profileId}/export/json`;

    // 2. Load Curated Jobs
    const jRes = await fetch(`/api/profiles/${profileId}/jobs`);
    allJobs = await jRes.json();

    renderStats();
    renderJobs();
  } catch (err) {
    console.error('Failed loading profile data:', err);
  }
}

function renderProfileBanner(p) {
  candidateName.textContent = p.fullName;
  candidateHeadline.textContent = p.headline;
  candidateSummary.textContent = p.summary;

  const c = p.hardConstraints || {};
  const roles = (c.targetRoles || []).join(', ');
  const arrangements = (c.workArrangements || []).join(', ');
  const locations = (c.allowedLocations || []).join(', ');
  const salary = c.minSalaryUSD ? `$${c.minSalaryUSD.toLocaleString()}/yr` : 'Flexible';
  const projectsList = (p.projects || []).map((pr) => pr.name).join(', ');

  constraintsGrid.innerHTML = `
    <span class="pill" style="background: rgba(139, 92, 246, 0.2); color: #c4b5fd; border: 1px solid rgba(139, 92, 246, 0.4);">⚡ Discipline: <strong>${escapeHtml(p.primarySpecialization || 'Backend')}</strong></span>
    <span class="pill highlight">🎯 Target Roles: <strong>${escapeHtml(roles || 'Any')}</strong></span>
    <span class="pill highlight">💼 Arrangement: <strong>${escapeHtml(arrangements || 'Remote')}</strong></span>
    <span class="pill highlight">📍 Locations: <strong>${escapeHtml(locations || 'Worldwide')}</strong></span>
    <span class="pill success">💵 Min Salary: <strong>${salary}</strong></span>
    <span class="pill">⏱ Experience: <strong>${p.yearsOfExperience} yrs</strong></span>
    ${projectsList ? `<span class="pill" style="background: rgba(6, 182, 212, 0.2); color: #67e8f9; border: 1px solid rgba(6, 182, 212, 0.4);">🚀 Projects: <strong>${escapeHtml(projectsList)}</strong></span>` : ''}
    <span class="pill warning">🚫 Excluded: <strong>${escapeHtml((c.excludedKeywords || []).join(', ') || 'None')}</strong></span>
  `;
}

function renderStats() {
  statTotal.textContent = allJobs.length;
  const strong = allJobs.filter((j) => (j.evaluation?.matchScore ?? 0) >= 80).length;
  const moderate = allJobs.filter(
    (j) => (j.evaluation?.matchScore ?? 0) >= 60 && (j.evaluation?.matchScore ?? 0) < 80
  ).length;
  const passed = allJobs.filter((j) => j.evaluation?.constraints?.allPassed).length;

  statStrong.textContent = strong;
  statModerate.textContent = moderate;
  statPassed.textContent = passed;

  if (allJobs.length > 0) {
    const sum = allJobs.reduce((acc, j) => acc + (j.evaluation?.matchScore ?? 0), 0);
    statAvgScore.textContent = `${Math.round(sum / allJobs.length)}%`;
  } else {
    statAvgScore.textContent = '0%';
  }
}

function renderJobs() {
  const query = searchInput.value.toLowerCase().trim();
  const recFilter = filterRecommendation.value;
  const boardFilter = filterBoard.value;
  const sort = sortOrder.value;

  let filtered = allJobs.filter((job) => {
    // Search filter
    if (query) {
      const matchTitle = job.title.toLowerCase().includes(query);
      const matchComp = job.company.toLowerCase().includes(query);
      const matchLoc = job.location.toLowerCase().includes(query);
      const matchTags = (job.tags || []).some((t) => t.toLowerCase().includes(query));
      const matchSkills = (job.evaluation?.matchedSkills || []).some((s) =>
        s.toLowerCase().includes(query)
      );
      if (!matchTitle && !matchComp && !matchLoc && !matchTags && !matchSkills) {
        return false;
      }
    }

    // Board filter
    if (boardFilter !== 'ALL' && job.board !== boardFilter) {
      return false;
    }

    // Recommendation filter
    if (recFilter === 'PASSED_ONLY' && !job.evaluation?.constraints?.allPassed) {
      return false;
    }
    if (recFilter !== 'ALL' && recFilter !== 'PASSED_ONLY') {
      if (job.evaluation?.recommendation !== recFilter) {
        return false;
      }
    }

    return true;
  });

  // Sorting
  filtered.sort((a, b) => {
    if (sort === 'score_desc') {
      return (b.evaluation?.matchScore ?? 0) - (a.evaluation?.matchScore ?? 0);
    }
    if (sort === 'score_asc') {
      return (a.evaluation?.matchScore ?? 0) - (b.evaluation?.matchScore ?? 0);
    }
    if (sort === 'date_desc') {
      return new Date(b.scrapedAt).getTime() - new Date(a.scrapedAt).getTime();
    }
    return 0;
  });

  if (filtered.length === 0) {
    jobsContainer.innerHTML = `
      <div style="text-align: center; padding: 3rem; color: var(--text-muted);" class="glass">
        No job listings match your current filters or constraints.
      </div>
    `;
    return;
  }

  jobsContainer.innerHTML = filtered
    .map((job) => {
      const score = job.evaluation?.matchScore ?? 0;
      let scoreClass = 'score-weak';
      let recLabel = 'Weak Match';

      if (!job.evaluation?.constraints?.allPassed) {
        scoreClass = 'score-rejected';
        recLabel = 'Constraint Failed';
      } else if (score >= 80) {
        scoreClass = 'score-strong';
        recLabel = 'Strong Match';
      } else if (score >= 60) {
        scoreClass = 'score-moderate';
        recLabel = 'Moderate Match';
      }

      const c = job.evaluation?.constraints || {};
      const locPass = c.locationCheck?.passed ? '✓' : '✗';
      const remPass = c.remoteCheck?.passed ? '✓' : '✗';
      const rolPass = c.roleCheck?.passed ? '✓' : '✗';
      const expPass = c.experienceCheck?.passed ? '✓' : '✗';

      const skillsHtml = (job.evaluation?.matchedSkills || [])
        .slice(0, 6)
        .map((s) => `<span class="skill-tag">${escapeHtml(s)}</span>`)
        .join('');

      const pitchText =
        (job.evaluation?.tailoredApplicationPitch || [])[0] ||
        'Direct background alignment with company tech stack and domain.';

      return `
        <article class="job-card glass">
          <div class="job-card-top">
            <div class="job-main-info">
              <h2 class="job-title">
                <a href="${escapeHtml(job.url)}" target="_blank" rel="noopener">${escapeHtml(job.title)}</a>
              </h2>
              <div class="job-company">${escapeHtml(job.company)} &bull; <span style="font-size: 0.85rem; color: var(--text-muted);">${escapeHtml(job.board)}</span></div>
            </div>

            <div class="score-badge ${scoreClass}">
              <span class="score-number">${score}%</span>
              <span class="score-label">${recLabel}</span>
            </div>
          </div>

          <div class="job-meta-row">
            <span>📍 ${escapeHtml(job.location)}</span>
            <span>💼 ${job.isRemote ? '🌐 Remote' : '🏢 On-Site / Hybrid'}</span>
            ${job.salary ? `<span>💵 ${escapeHtml(job.salary)}</span>` : ''}
          </div>

          <div class="constraints-status-bar">
            <span class="constraint-item ${c.locationCheck?.passed ? 'constraint-pass' : 'constraint-fail'}">
              ${locPass} Location
            </span>
            <span class="constraint-item ${c.remoteCheck?.passed ? 'constraint-pass' : 'constraint-fail'}">
              ${remPass} Remote
            </span>
            <span class="constraint-item ${c.roleCheck?.passed ? 'constraint-pass' : 'constraint-fail'}">
              ${rolPass} Role Fit
            </span>
            <span class="constraint-item ${c.experienceCheck?.passed ? 'constraint-pass' : 'constraint-fail'}">
              ${expPass} Experience
            </span>
          </div>

          ${skillsHtml ? `<div class="skills-tags">${skillsHtml}</div>` : ''}

          <div class="pitch-box">
            <div class="pitch-title">🤖 AI Tailored Application Pitch:</div>
            <div>"${escapeHtml(pitchText)}"</div>
          </div>

          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" onclick="showJobDetails('${job.id}')">
              📊 Deep Evaluation
            </button>
            <a href="${escapeHtml(job.url)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">
              Apply on ${escapeHtml(job.board)} ↗
            </a>
          </div>
        </article>
      `;
    })
    .join('');
}

window.showJobDetails = function (jobId) {
  const job = allJobs.find((j) => j.id === jobId);
  if (!job) return;

  const ev = job.evaluation || {};
  const c = ev.constraints || {};

  modalBody.innerHTML = `
    <h2 style="font-size: 1.5rem; margin-bottom: 0.25rem;">${escapeHtml(job.title)}</h2>
    <div style="color: var(--accent-cyan); font-weight: 600; margin-bottom: 1.5rem;">
      ${escapeHtml(job.company)} &bull; ${escapeHtml(job.location)} &bull; ${escapeHtml(job.board)}
    </div>

    <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1.5rem;">
      <div class="stat-value" style="color: var(--accent-cyan);">${ev.matchScore}%</div>
      <div>
        <div style="font-weight: 700;">${ev.recommendation || 'Evaluated'}</div>
        <div style="font-size: 0.85rem; color: var(--text-muted);">
          Hard Constraints Status: <strong>${c.allPassed ? '✓ ALL PASSED' : '✗ FAILED'}</strong>
        </div>
      </div>
    </div>

    <h3 style="font-size: 1.1rem; margin-bottom: 0.5rem; color: #fff;">1. Hard Constraints Breakdown</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; font-size: 0.85rem;">
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 0.5rem; font-weight: 600;">Location Check:</td>
        <td style="padding: 0.5rem; color: ${c.locationCheck?.passed ? 'var(--success)' : 'var(--danger)'};">
          ${c.locationCheck?.passed ? '✓ PASS' : '✗ FAIL'} - ${escapeHtml(c.locationCheck?.reason || '')}
        </td>
      </tr>
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 0.5rem; font-weight: 600;">Remote Arrangement:</td>
        <td style="padding: 0.5rem; color: ${c.remoteCheck?.passed ? 'var(--success)' : 'var(--danger)'};">
          ${c.remoteCheck?.passed ? '✓ PASS' : '✗ FAIL'} - ${escapeHtml(c.remoteCheck?.reason || '')}
        </td>
      </tr>
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 0.5rem; font-weight: 600;">Role Alignment:</td>
        <td style="padding: 0.5rem; color: ${c.roleCheck?.passed ? 'var(--success)' : 'var(--danger)'};">
          ${c.roleCheck?.passed ? '✓ PASS' : '✗ FAIL'} - ${escapeHtml(c.roleCheck?.reason || '')}
        </td>
      </tr>
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 0.5rem; font-weight: 600;">Experience & Seniority:</td>
        <td style="padding: 0.5rem; color: ${c.experienceCheck?.passed ? 'var(--success)' : 'var(--danger)'};">
          ${c.experienceCheck?.passed ? '✓ PASS' : '✗ FAIL'} - ${escapeHtml(c.experienceCheck?.reason || '')}
        </td>
      </tr>
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 0.5rem; font-weight: 600;">Salary Expectation:</td>
        <td style="padding: 0.5rem; color: ${c.salaryCheck?.passed ? 'var(--success)' : 'var(--danger)'};">
          ${c.salaryCheck?.passed ? '✓ PASS' : '✗ FAIL'} - ${escapeHtml(c.salaryCheck?.reason || '')}
        </td>
      </tr>
      ${c.dealbreakerCheck ? `
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 0.5rem; font-weight: 600;">Dealbreaker Filter:</td>
        <td style="padding: 0.5rem; color: ${c.dealbreakerCheck?.passed ? 'var(--success)' : 'var(--danger)'};">
          ${c.dealbreakerCheck?.passed ? '✓ PASS' : '✗ FAIL'} - ${escapeHtml(c.dealbreakerCheck?.reason || '')}
        </td>
      </tr>` : ''}
    </table>

    ${ev.scoreBreakdown ? `
    <h3 style="font-size: 1.1rem; margin-bottom: 0.5rem; color: #fff;">2. Resume-to-Role Scoring Breakdown</h3>
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1.5rem;">
      <div style="background: rgba(255,255,255,0.04); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border-color); text-align: center;">
        <div style="font-size: 1.25rem; font-weight: bold; color: var(--accent-cyan);">${ev.scoreBreakdown.technicalStackMatch}%</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">Technical Stack</div>
      </div>
      <div style="background: rgba(255,255,255,0.04); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border-color); text-align: center;">
        <div style="font-size: 1.25rem; font-weight: bold; color: var(--success);">${ev.scoreBreakdown.roleAndSeniorityMatch}%</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">Role & Seniority</div>
      </div>
      <div style="background: rgba(255,255,255,0.04); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border-color); text-align: center;">
        <div style="font-size: 1.25rem; font-weight: bold; color: #c4b5fd;">${ev.scoreBreakdown.projectAndExperienceMatch}%</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">Projects & Experience</div>
      </div>
    </div>
    ${ev.fitRationale ? `<p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: -0.75rem; margin-bottom: 1.5rem; font-style: italic;">"${escapeHtml(ev.fitRationale)}"</p>` : ''}
    ` : ''}

    <h3 style="font-size: 1.1rem; margin-bottom: 0.5rem; color: #fff;">3. Tailored Application Pitch</h3>
    <div style="background: rgba(6, 182, 212, 0.08); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
      <ul style="padding-left: 1.25rem; font-size: 0.9rem; line-height: 1.6;">
        ${(ev.tailoredApplicationPitch || [])
          .map((p) => `<li>${escapeHtml(p)}</li>`)
          .join('')}
      </ul>
      <button class="btn btn-secondary btn-sm" style="margin-top: 0.75rem;" onclick="copyPitchText()">
        📋 Copy Pitch to Clipboard
      </button>
    </div>

    <h3 style="font-size: 1.1rem; margin-bottom: 0.5rem; color: #fff;">3. Technical Competencies & Strengths</h3>
    <ul style="padding-left: 1.25rem; font-size: 0.9rem; line-height: 1.6; margin-bottom: 1.5rem;">
      ${(ev.strengths || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
    </ul>

    <div style="display: flex; justify-content: flex-end; gap: 1rem;">
      <a href="${escapeHtml(job.url)}" target="_blank" rel="noopener" class="btn btn-primary">
        Open Job Posting on ${escapeHtml(job.board)} ↗
      </a>
    </div>
  `;

  evalModal.classList.add('active');
};

window.copyPitchText = function () {
  const listItems = modalBody.querySelectorAll('ul li');
  const text = Array.from(listItems)
    .map((li) => li.textContent)
    .join('\n');
  navigator.clipboard.writeText(text).then(() => {
    alert('Pitch copied to clipboard!');
  });
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
