/* ============================================
   Apollo's Table — Dashboard Logic (Security)
   ============================================ */

(function () {
  'use strict';

  var PASS_KEY = 'apollo_gate';
  var DEFAULT_HASH = '3293409';
  var DATA_PATH = 'data/businesses.json';

  function simpleHash(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + ch;
      hash |= 0;
    }
    return String(Math.abs(hash));
  }

  // ---- Password Gate ----
  function initGate() {
    var overlay = document.getElementById('password-overlay');
    if (!overlay) return;
    var stored = localStorage.getItem(PASS_KEY);
    var customHash = localStorage.getItem('apollo_custom_hash');
    var targetHash = customHash || DEFAULT_HASH;

    if (stored === targetHash) {
      overlay.classList.add('hidden');
      return;
    }
    overlay.classList.remove('hidden');
    var form = overlay.querySelector('.gate-form');
    var input = overlay.querySelector('.gate-input');
    var errorEl = overlay.querySelector('.gate-error');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var val = input.value.trim();
      if (simpleHash(val) === targetHash) {
        localStorage.setItem(PASS_KEY, simpleHash(val));
        overlay.classList.add('fade-out');
        setTimeout(function () { overlay.classList.add('hidden'); }, 400);
      } else {
        errorEl.textContent = 'Wrong password';
        input.value = '';
        input.focus();
        setTimeout(function () { errorEl.textContent = ''; }, 2500);
      }
    });
    input.focus();
  }

  // ---- Settings ----
  function initSettings() {
    var btn = document.getElementById('settings-toggle');
    var panel = document.getElementById('settings-panel');
    if (!btn || !panel) return;
    btn.addEventListener('click', function () { panel.classList.toggle('open'); });
    document.addEventListener('click', function (e) {
      if (panel.classList.contains('open') && !panel.contains(e.target) && e.target !== btn) {
        panel.classList.remove('open');
      }
    });
    var passForm = panel.querySelector('.settings-pass-form');
    if (passForm) {
      passForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = passForm.querySelector('input');
        var val = input.value.trim();
        if (val.length < 3) return;
        var hashed = simpleHash(val);
        localStorage.setItem('apollo_custom_hash', hashed);
        localStorage.setItem(PASS_KEY, hashed);
        input.value = '';
        var msg = passForm.querySelector('.settings-msg');
        if (msg) { msg.textContent = 'Password updated'; setTimeout(function () { msg.textContent = ''; }, 2000); }
      });
    }
    var logoutBtn = panel.querySelector('.btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        localStorage.removeItem(PASS_KEY);
        location.reload();
      });
    }
  }

  // ---- Helpers ----
  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }

  function gradeClass(grade) {
    if (!grade) return 'grade-f';
    switch (grade.toUpperCase()) {
      case 'A': return 'grade-a';
      case 'B': return 'grade-b';
      default: return 'grade-c';
    }
  }

  function stageLabel(stage) {
    var labels = {
      discovered: 'Discovered',
      scanned: 'Scanned',
      report_draft: 'Report Draft',
      report_ready: 'Report Ready',
      outreach_sent: 'Outreach Sent',
      responded: 'Responded'
    };
    return labels[stage] || stage;
  }

  function stageClass(stage) {
    switch (stage) {
      case 'responded': return 'sold';
      case 'outreach_sent': return 'listed';
      case 'report_ready': return 'photographed';
      case 'report_draft': return 'picked-up';
      case 'scanned': return 'targeted';
      default: return 'targeted';
    }
  }

  // ---- Main ----
  function initDashboard() {
    var container = document.getElementById('business-container');
    if (!container) return;

    fetch(DATA_PATH)
      .then(function (r) {
        if (!r.ok) throw new Error('No data');
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.businesses) {
          renderEmpty(container);
          return;
        }

        renderStats(data.stats);
        renderGradeBar(data.stats.grades);
        populateCategories(data.businesses);
        initFilters(data.businesses, container);
        renderBusinesses(data.businesses, container);
      })
      .catch(function () {
        renderEmpty(container);
      });
  }

  function renderStats(stats) {
    if (!stats) return;
    setText('stat-total', stats.total || 0);
    setText('stat-scanned', stats.scanned || 0);
    setText('stat-reported', stats.reported || 0);
    setText('stat-outreach', stats.outreachSent || 0);
    setText('stat-responses', stats.responses || 0);
  }

  function renderGradeBar(grades) {
    var el = document.getElementById('grade-bar');
    if (!el || !grades || !grades.length) return;
    var total = 0;
    grades.forEach(function (g) { total += g.count; });
    if (total === 0) return;

    var colors = { A: '#3ecf6e', B: '#7bc87b', C: '#e8a832', D: '#e07840', F: '#e05252' };
    var html = '<div style="display:flex;gap:2px;height:8px;border-radius:4px;overflow:hidden;margin-bottom:1.25rem;">';
    grades.sort(function (a, b) { return (a.grade || '').localeCompare(b.grade || ''); });
    grades.forEach(function (g) {
      var pct = (g.count / total * 100).toFixed(1);
      var color = colors[g.grade] || '#5a5868';
      html += '<div title="Grade ' + g.grade + ': ' + g.count + '" style="width:' + pct + '%;background:' + color + ';"></div>';
    });
    html += '</div>';
    el.innerHTML = html;
  }

  function populateCategories(businesses) {
    var catSelect = document.getElementById('filter-category');
    if (!catSelect) return;
    var cats = {};
    businesses.forEach(function (b) {
      if (b.category) cats[b.category] = true;
    });
    Object.keys(cats).sort().forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
      catSelect.appendChild(opt);
    });
  }

  function initFilters(allBiz, container) {
    var stageFilter = document.getElementById('filter-stage');
    var gradeFilter = document.getElementById('filter-grade');
    var catFilter = document.getElementById('filter-category');
    var countEl = document.getElementById('filter-count');

    function apply() {
      var stage = stageFilter ? stageFilter.value : 'all';
      var grade = gradeFilter ? gradeFilter.value : 'all';
      var cat = catFilter ? catFilter.value : 'all';

      var filtered = allBiz.filter(function (b) {
        if (stage !== 'all' && b.pipeline_stage !== stage) return false;
        if (grade !== 'all' && b.grade !== grade) return false;
        if (cat !== 'all' && b.category !== cat) return false;
        return true;
      });

      if (countEl) countEl.textContent = filtered.length + ' business' + (filtered.length !== 1 ? 'es' : '');
      renderBusinesses(filtered, container);
    }

    if (stageFilter) stageFilter.addEventListener('change', apply);
    if (gradeFilter) gradeFilter.addEventListener('change', apply);
    if (catFilter) catFilter.addEventListener('change', apply);

    if (countEl) countEl.textContent = allBiz.length + ' business' + (allBiz.length !== 1 ? 'es' : '');
  }

  function renderBusinesses(businesses, container) {
    if (businesses.length === 0) {
      container.innerHTML = '<div class="empty-state" style="grid-column:1/-1">' +
        '<div class="empty-icon">&#128269;</div>' +
        '<h3>No businesses match</h3>' +
        '<p>Try changing your filters</p></div>';
      return;
    }

    var html = '';
    businesses.forEach(function (b) {
      var gc = gradeClass(b.grade);
      var scoreDisplay = b.score != null ? b.score + '/100' : 'Not scanned';

      html += '<div class="deal-card ' + gc + '">';
      html += '<div class="deal-body">';
      html += '<div class="deal-header">';
      html += '<div class="deal-title">' + escapeHtml(b.name) + '</div>';
      if (b.grade) html += '<span class="deal-grade ' + gc + '">' + escapeHtml(b.grade) + '</span>';
      html += '</div>';

      html += '<div class="deal-metrics">';
      html += '<div class="deal-metric"><span class="metric-label">Score</span><span class="metric-value ' + (b.score < 60 ? 'text-red' : '') + '">' + scoreDisplay + '</span></div>';
      html += '<div class="deal-metric"><span class="metric-label">Category</span><span class="metric-value">' + escapeHtml(b.category || '-') + '</span></div>';
      html += '<div class="deal-metric"><span class="metric-label">City</span><span class="metric-value">' + escapeHtml(b.city || '-') + '</span></div>';
      html += '<div class="deal-metric"><span class="metric-label">Stage</span><span class="metric-value"><span class="status-badge ' + stageClass(b.pipeline_stage) + '">' + stageLabel(b.pipeline_stage) + '</span></span></div>';
      html += '</div>';

      html += '<div class="deal-footer">';
      html += '<span>' + escapeHtml(b.url) + '</span>';
      if (b.has_report) html += '<a class="deal-link" href="report.html?b=' + encodeURIComponent(b.slug) + '" target="_blank">View Report</a>';
      html += '</div>';

      html += '</div></div>';
    });

    container.innerHTML = html;
  }

  function renderEmpty(container) {
    container.innerHTML = '<div class="empty-state" style="grid-column:1/-1">' +
      '<div class="empty-icon">&#128737;</div>' +
      '<h3>No businesses yet</h3>' +
      '<p>Run the scanner to start building your pipeline.</p>' +
      '<code>node cli.js discover</code>' +
      '</div>';
  }

  // ---- Init ----
  document.addEventListener('DOMContentLoaded', function () {
    initGate();
    initSettings();
    initDashboard();
  });

})();
