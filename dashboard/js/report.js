/* ============================================
   Apollo's Table — Public Report Page
   ============================================ */

(function () {
  'use strict';

  var DATA_BASE = 'data/reports/';

  function getSlug() {
    var params = new URLSearchParams(window.location.search);
    return params.get('b') || params.get('business') || params.get('id');
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }

  function gradeClass(grade) {
    return 'grade-' + (grade || 'f').toLowerCase();
  }

  function gradeLabel(grade) {
    var labels = { A: 'Excellent', B: 'Good', C: 'Fair', D: 'Poor', F: 'Critical' };
    return labels[grade] || 'Unknown';
  }

  function severityLabel(sev) {
    return (sev || 'info').charAt(0).toUpperCase() + (sev || 'info').slice(1);
  }

  function renderReport(data) {
    var wrapper = document.getElementById('report');
    var biz = data.business;
    var scan = data.scan;
    var contact = data.contact || {};
    var circumference = 2 * Math.PI * 48;
    var offset = circumference - (scan.score / 100) * circumference;
    var gc = gradeClass(scan.grade);
    var scanDate = scan.scanned_at ? new Date(scan.scanned_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

    // Update page title
    document.title = 'Security Report — ' + biz.name;

    var html = '';

    // Header
    html += '<div class="report-header">';
    html += '<div class="report-badge">Website Security Report</div>';
    html += '<h1>' + escapeHtml(biz.name) + '</h1>';
    html += '<div class="report-url">' + escapeHtml(biz.url) + '</div>';
    if (scanDate) html += '<div class="report-date">Scanned ' + scanDate + '</div>';
    html += '</div>';

    // Score
    html += '<div class="score-section">';
    html += '<div class="score-ring">';
    html += '<svg viewBox="0 0 108 108">';
    html += '<circle class="ring-bg" cx="54" cy="54" r="48" />';
    html += '<circle class="ring-fill ' + gc + '" cx="54" cy="54" r="48" stroke-dasharray="' + circumference.toFixed(1) + '" stroke-dashoffset="' + offset.toFixed(1) + '" style="stroke: var(--' + colorForGrade(scan.grade) + ')" />';
    html += '</svg>';
    html += '<div class="score-text"><span class="score-number">' + scan.score + '</span><span class="score-label">out of 100</span></div>';
    html += '</div>';
    html += '<div class="grade-display">';
    html += '<div class="grade-letter ' + gc + '">' + escapeHtml(scan.grade) + '</div>';
    html += '<div class="grade-label">' + gradeLabel(scan.grade) + '</div>';
    html += '</div>';
    html += '</div>';

    // Narrative
    if (data.narrative) {
      html += '<div class="narrative-section">';
      html += '<h2>What We Found</h2>';
      var paragraphs = data.narrative.split('\n\n');
      for (var i = 0; i < paragraphs.length; i++) {
        var p = paragraphs[i].trim();
        if (p) html += '<p>' + escapeHtml(p) + '</p>';
      }
      html += '</div>';
    }

    // Findings
    if (scan.findings && scan.findings.length > 0) {
      html += '<div class="findings-section">';
      html += '<h2>Detailed Findings</h2>';
      for (var j = 0; j < scan.findings.length; j++) {
        var f = scan.findings[j];
        html += '<div class="finding-card ' + escapeHtml(f.severity) + '">';
        html += '<div class="finding-header">';
        html += '<span class="finding-severity ' + escapeHtml(f.severity) + '">' + severityLabel(f.severity) + '</span>';
        html += '<span class="finding-title">' + escapeHtml(f.title) + '</span>';
        html += '</div>';
        html += '<div class="finding-detail">' + escapeHtml(f.detail) + '</div>';
        html += '</div>';
      }
      html += '</div>';
    }

    // CTA
    html += '<div class="cta-section">';
    html += '<h2>Ready to Fix These Issues?</h2>';
    html += '<p>I\'m a local website security consultant based in Southern NH. I can walk you through these findings and get your site secured — usually in a day or two.</p>';
    html += '<div class="cta-contact">';
    if (contact.name) html += '<span class="cta-item">' + escapeHtml(contact.name) + '</span>';
    if (contact.phone) html += '<span class="cta-item"><a href="tel:' + escapeHtml(contact.phone) + '">' + escapeHtml(contact.phone) + '</a></span>';
    if (contact.email) html += '<span class="cta-item"><a href="mailto:' + escapeHtml(contact.email) + '">' + escapeHtml(contact.email) + '</a></span>';
    html += '</div>';
    html += '</div>';

    // Footer
    html += '<div class="report-footer">';
    html += '<p>This report was generated using publicly available information only. No unauthorized access or testing was performed.</p>';
    html += '</div>';

    wrapper.innerHTML = html;
  }

  function colorForGrade(grade) {
    switch (grade) {
      case 'A': return 'green';
      case 'B': return 'green';
      case 'C': return 'amber';
      case 'D': return 'amber';
      case 'F': return 'red';
      default: return 'text-muted';
    }
  }

  function renderError(msg) {
    var wrapper = document.getElementById('report');
    wrapper.innerHTML = '<div class="report-error">' +
      '<h2>Report Not Found</h2>' +
      '<p>' + escapeHtml(msg) + '</p>' +
      '</div>';
  }

  // Init
  var slug = getSlug();
  if (!slug) {
    renderError('No business specified. Add ?b=business-name to the URL.');
    return;
  }

  fetch(DATA_BASE + encodeURIComponent(slug) + '.json')
    .then(function (r) {
      if (!r.ok) throw new Error('Not found');
      return r.json();
    })
    .then(renderReport)
    .catch(function () {
      renderError('Could not find a report for "' + slug + '". It may not have been published yet.');
    });

})();
