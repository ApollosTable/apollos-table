/* ============================================
   Apollo's Table — Dashboard Logic
   ============================================ */

(function () {
  'use strict';

  // ---- Config ----
  const PASS_KEY = 'apollo_gate';
  const DEFAULT_HASH = '1411091249'; // simple hash of "apollo"
  const DATA_PATH = 'data/data.json';

  // ---- Simple string hash (not crypto, just a door) ----
  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + ch;
      hash |= 0;
    }
    return String(Math.abs(hash));
  }

  // ---- Password Gate ----
  function initGate() {
    const overlay = document.getElementById('password-overlay');
    if (!overlay) return;

    const stored = localStorage.getItem(PASS_KEY);
    const customHash = localStorage.getItem('apollo_custom_hash');
    const targetHash = customHash || DEFAULT_HASH;

    if (stored === targetHash) {
      overlay.classList.add('hidden');
      return;
    }

    overlay.classList.remove('hidden');

    const form = overlay.querySelector('.gate-form');
    const input = overlay.querySelector('.gate-input');
    const errorEl = overlay.querySelector('.gate-error');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const val = input.value.trim();
      const hashed = simpleHash(val);

      if (hashed === targetHash) {
        localStorage.setItem(PASS_KEY, hashed);
        overlay.classList.add('fade-out');
        setTimeout(function () {
          overlay.classList.add('hidden');
        }, 400);
      } else {
        errorEl.textContent = 'Wrong password';
        input.value = '';
        input.focus();
        setTimeout(function () {
          errorEl.textContent = '';
        }, 2500);
      }
    });

    input.focus();
  }

  // ---- Settings Panel ----
  function initSettings() {
    const btn = document.getElementById('settings-toggle');
    const panel = document.getElementById('settings-panel');
    if (!btn || !panel) return;

    btn.addEventListener('click', function () {
      panel.classList.toggle('open');
    });

    // Close on click outside
    document.addEventListener('click', function (e) {
      if (panel.classList.contains('open') && !panel.contains(e.target) && e.target !== btn) {
        panel.classList.remove('open');
      }
    });

    // Change password
    const passForm = panel.querySelector('.settings-pass-form');
    if (passForm) {
      passForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const input = passForm.querySelector('input');
        const val = input.value.trim();
        if (val.length < 3) return;
        const hashed = simpleHash(val);
        localStorage.setItem('apollo_custom_hash', hashed);
        localStorage.setItem(PASS_KEY, hashed);
        input.value = '';
        const msg = passForm.querySelector('.settings-msg');
        if (msg) {
          msg.textContent = 'Password updated';
          setTimeout(function () { msg.textContent = ''; }, 2000);
        }
      });
    }

    // Logout
    const logoutBtn = panel.querySelector('.btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        localStorage.removeItem(PASS_KEY);
        location.reload();
      });
    }
  }

  // ---- Format Helpers ----
  function currency(n) {
    if (n == null || isNaN(n)) return '$0';
    return '$' + Number(n).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }

  function currencyDecimal(n) {
    if (n == null || isNaN(n)) return '$0.00';
    return '$' + Number(n).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatDistance(miles) {
    if (miles == null || isNaN(miles)) return '?';
    return Number(miles).toFixed(1) + ' mi';
  }

  function relativeTime(dateStr) {
    if (!dateStr) return '';
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    if (isNaN(then)) return dateStr;
    const diff = now - then;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    if (hours < 24) return hours + 'h ago';
    if (days === 1) return 'yesterday';
    if (days < 7) return days + 'd ago';
    return new Date(dateStr).toLocaleDateString();
  }

  function gradeClass(grade) {
    if (!grade) return 'grade-c';
    switch (grade.toUpperCase()) {
      case 'A': return 'grade-a';
      case 'B': return 'grade-b';
      default: return 'grade-c';
    }
  }

  // ---- Data Loading ----
  function loadData(callback) {
    fetch(DATA_PATH)
      .then(function (r) {
        if (!r.ok) throw new Error('Failed to load data');
        return r.json();
      })
      .then(callback)
      .catch(function (err) {
        console.warn('Data load error:', err);
        callback(null);
      });
  }

  // ---- DEALS PAGE ----
  function initDealsPage() {
    var container = document.getElementById('deals-container');
    if (!container) return;

    loadData(function (data) {
      if (!data) {
        renderEmpty(container);
        return;
      }

      renderStats(data.stats);
      renderRefreshTime(data.generated_at);

      var deals = data.deals || [];
      if (deals.length === 0) {
        renderEmpty(container);
        return;
      }

      // Sort by profit descending by default
      deals.sort(function (a, b) {
        return (b.estimated_profit || 0) - (a.estimated_profit || 0);
      });

      initFilters(deals, container);
    });
  }

  function renderStats(stats) {
    if (!stats) return;
    setText('stat-total', stats.total_evaluated || 0);
    setText('stat-grade-a', stats.grade_a || 0);
    setText('stat-grade-b', stats.grade_b || 0);
    setText('stat-profit', currency(stats.total_potential_profit || 0));
  }

  function renderRefreshTime(ts) {
    var el = document.getElementById('refresh-time');
    if (!el) return;
    if (!ts) {
      el.textContent = 'No data yet';
      return;
    }
    el.textContent = 'Updated ' + relativeTime(ts);
  }

  // ---- User Preferences ----
  var PREFS_KEY = 'apollo_prefs';

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
  }

  function savePrefs(p) {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  }

  function initPrefsPanel() {
    var zip = document.getElementById('pref-zip');
    var radius = document.getElementById('pref-radius');
    var invest = document.getElementById('pref-invest');
    var profit = document.getElementById('pref-profit');
    var grade = document.getElementById('pref-grade');
    var shippable = document.getElementById('pref-shippable');
    var saveBtn = document.getElementById('pref-save');
    var msg = document.getElementById('pref-msg');

    if (!saveBtn) return;

    var p = loadPrefs();
    if (zip && p.zip) zip.value = p.zip;
    if (radius) { radius.value = p.radius || 30; setText('pref-radius-val', (p.radius || 30) + ' mi'); }
    if (invest) { invest.value = p.invest || 50; setText('pref-invest-val', currency(p.invest || 50)); }
    if (profit) { profit.value = p.profit || 25; setText('pref-profit-val', currency(p.profit || 25)); }
    if (grade && p.grade) grade.value = p.grade;
    if (shippable && p.shippable) shippable.checked = true;

    function updateLabels() {
      if (radius) setText('pref-radius-val', radius.value + ' mi');
      if (invest) setText('pref-invest-val', currency(Number(invest.value)));
      if (profit) setText('pref-profit-val', currency(Number(profit.value)));
    }
    if (radius) radius.addEventListener('input', updateLabels);
    if (invest) invest.addEventListener('input', updateLabels);
    if (profit) profit.addEventListener('input', updateLabels);

    saveBtn.addEventListener('click', function () {
      var prefs = {
        zip: zip ? zip.value.trim() : '',
        radius: radius ? Number(radius.value) : 30,
        invest: invest ? Number(invest.value) : 50,
        profit: profit ? Number(profit.value) : 25,
        grade: grade ? grade.value : 'all',
        shippable: shippable ? shippable.checked : false
      };
      savePrefs(prefs);
      if (msg) {
        msg.textContent = 'Saved — refreshing deals';
        msg.style.color = 'var(--green)';
        setTimeout(function () { msg.textContent = ''; }, 2000);
      }
      // Re-filter deals with new prefs
      if (window._apolloRefilter) window._apolloRefilter();
    });
  }

  function initFilters(allDeals, container) {
    var countEl = document.getElementById('filter-count');
    var tagsEl = document.getElementById('filter-tags');

    function applyFilters() {
      var p = loadPrefs();
      var minGrade = p.grade || 'all';
      var minProfit = p.profit || 0;
      var maxInvest = p.invest || 9999;
      var shippableOnly = p.shippable || false;

      var gradeOrder = ['A', 'B', 'C', 'F'];

      var filtered = allDeals.filter(function (d) {
        if (minGrade !== 'all') {
          var dealIdx = gradeOrder.indexOf((d.grade || 'F').toUpperCase());
          var minIdx = gradeOrder.indexOf(minGrade.toUpperCase());
          if (dealIdx > minIdx) return false;
        }
        if ((d.estimated_profit || 0) < minProfit) return false;
        if ((d.price || 0) > maxInvest) return false;
        if (shippableOnly && (d.sell_channel || '').toLowerCase() !== 'ebay') return false;
        return true;
      });

      // Render filter tags
      if (tagsEl) {
        var tags = [];
        if (minGrade !== 'all') tags.push('Grade ' + minGrade + '+');
        if (maxInvest < 9999) tags.push('Max ' + currency(maxInvest));
        if (minProfit > 0) tags.push(currency(minProfit) + '+ profit');
        if (shippableOnly) tags.push('eBay shippable');
        if (p.zip) tags.push(p.zip);
        tagsEl.innerHTML = tags.map(function (t) { return '<span class="filter-tag">' + t + '</span>'; }).join('');
      }

      if (countEl) countEl.textContent = filtered.length + ' deal' + (filtered.length !== 1 ? 's' : '');
      renderDeals(filtered, container);
    }

    window._apolloRefilter = applyFilters;
    applyFilters();
  }

  function renderDeals(deals, container) {
    if (deals.length === 0) {
      container.innerHTML = '<div class="empty-state">' +
        '<div class="empty-icon">&#9898;</div>' +
        '<h3>No deals match your filters</h3>' +
        '<p>Try widening your search criteria</p>' +
        '</div>';
      return;
    }

    var html = '';
    deals.forEach(function (d) {
      var gc = gradeClass(d.grade);
      var displayName = d.item_type || d.location || d.title || 'Untitled';
      var imageHtml = d.image_url
        ? '<img class="deal-image" src="' + escapeHtml(d.image_url) + '" alt="' + escapeHtml(displayName) + '" loading="lazy" onerror="this.outerHTML=\'<div class=deal-image-placeholder>No image</div>\'">'
        : '<div class="deal-image-placeholder">No image</div>';

      var channelBadge = (d.sell_channel || '').toLowerCase() === 'ebay'
        ? '<span class="channel-badge ebay">eBay</span>'
        : '<span class="channel-badge local">Local</span>';

      var askLabel = (d.price || 0) === 0 ? 'FREE' : currency(d.price);
      var roi = (d.price || 0) > 0 ? Math.round((d.estimated_profit || 0) / d.price * 100) + '%' : '--';

      html += '<div class="deal-card ' + gc + '">' +
        imageHtml +
        '<div class="deal-body">' +
          '<div class="deal-header">' +
            '<div class="deal-title">' + escapeHtml(displayName) + '</div>' +
            '<span class="deal-grade ' + gc + '">' + escapeHtml((d.grade || '?').toUpperCase()) + '</span>' +
          '</div>' +
          '<div class="deal-metrics">' +
            '<div class="deal-metric"><span class="metric-label">Est. Profit</span><span class="metric-value profit">' + currency(d.estimated_profit) + '</span></div>' +
            '<div class="deal-metric"><span class="metric-label">Ask Price</span><span class="metric-value price">' + askLabel + '</span></div>' +
            '<div class="deal-metric"><span class="metric-label">eBay Median</span><span class="metric-value">' + currency(d.ebay_median) + '</span></div>' +
            '<div class="deal-metric"><span class="metric-label">ROI</span><span class="metric-value">' + roi + '</span></div>' +
          '</div>' +
          '<div class="deal-footer">' +
            channelBadge +
            '<span class="deal-time">' + relativeTime(d.posted_at || d.scanned_at) + '</span>' +
          '</div>' +
          (d.url ? '<a class="deal-link" href="' + escapeHtml(d.url) + '" target="_blank" rel="noopener">View listing &rarr;</a>' : '') +
        '</div>' +
        '</div>';
    });

    container.innerHTML = html;
  }

  function renderEmpty(container) {
    container.innerHTML = '<div class="empty-state">' +
      '<div class="empty-icon">&#127860;</div>' +
      '<h3>No deals yet</h3>' +
      '<p>Apollo hasn\'t served anything up. Run the scanner to start finding deals.</p>' +
      '<code>node cli.js scan</code>' +
      '</div>';
  }

  // ---- INVENTORY PAGE ----
  function initInventoryPage() {
    var board = document.getElementById('kanban-board');
    if (!board) return;

    loadData(function (data) {
      if (!data) {
        renderInventoryEmpty(board);
        return;
      }

      var inventory = data.inventory || [];
      if (inventory.length === 0) {
        renderInventoryEmpty(board);
        return;
      }

      var columns = {
        targeted: [],
        'picked_up': [],
        photographed: [],
        listed: [],
        sold: []
      };

      inventory.forEach(function (item) {
        var status = (item.status || 'targeted').toLowerCase().replace(/\s+/g, '_');
        if (columns[status]) {
          columns[status].push(item);
        } else {
          columns.targeted.push(item);
        }
      });

      var colLabels = {
        targeted: 'Targeted',
        'picked_up': 'Picked Up',
        photographed: 'Photographed',
        listed: 'Listed',
        sold: 'Sold'
      };

      var html = '';
      Object.keys(columns).forEach(function (key) {
        var items = columns[key];
        html += '<div class="kanban-column">' +
          '<div class="kanban-header">' +
            '<h3>' + colLabels[key] + '</h3>' +
            '<span class="kanban-count">' + items.length + '</span>' +
          '</div>' +
          '<div class="kanban-items">';

        if (items.length === 0) {
          html += '<div class="kanban-empty">Nothing here yet</div>';
        } else {
          items.forEach(function (item) {
            html += '<div class="kanban-item">' +
              '<div class="item-title">' + escapeHtml(item.title || 'Untitled') + '</div>' +
              '<div class="item-meta">' +
                (item.buy_price ? '<span class="item-price">' + currency(item.buy_price) + '</span> paid' : '') +
                (item.sell_price ? ' &middot; listed at ' + currency(item.sell_price) : '') +
              '</div>' +
              '</div>';
          });
        }

        html += '</div></div>';
      });

      board.innerHTML = html;
    });
  }

  function renderInventoryEmpty(board) {
    board.innerHTML = '<div class="empty-state" style="grid-column:1/-1">' +
      '<div class="empty-icon">&#128230;</div>' +
      '<h3>Inventory is empty</h3>' +
      '<p>Grab a deal from the deals page and it\'ll show up here as you work through the pipeline.</p>' +
      '<code>node cli.js grab &lt;deal-id&gt;</code>' +
      '</div>';
  }

  // ---- PROFIT PAGE ----
  function initProfitPage() {
    var tableBody = document.getElementById('profit-table-body');
    if (!tableBody) return;

    loadData(function (data) {
      if (!data) {
        renderProfitEmpty(tableBody);
        return;
      }

      var listings = data.listings || [];
      var inventory = data.inventory || [];
      var allItems = listings.concat(inventory);

      if (allItems.length === 0) {
        renderProfitEmpty(tableBody);
        updateProfitMetrics(0, 0, 0, 0, 0);
        return;
      }

      var totalRevenue = 0;
      var totalCosts = 0;
      var soldCount = 0;
      var totalDays = 0;

      var html = '';
      allItems.forEach(function (item) {
        var revenue = item.sale_price || item.sell_price || 0;
        var cost = item.buy_price || item.cost || 0;
        var fees = item.fees || 0;
        var shipping = item.shipping_cost || 0;
        var net = revenue - cost - fees - shipping;
        var status = item.status || 'unknown';

        if (status === 'sold' && revenue > 0) {
          totalRevenue += revenue;
          totalCosts += cost + fees + shipping;
          soldCount++;
          if (item.days_to_sell) totalDays += item.days_to_sell;
        }

        var netClass = net >= 0 ? 'positive' : 'negative';

        html += '<tr>' +
          '<td>' + escapeHtml(item.title || 'Untitled') + '</td>' +
          '<td class="mono">' + currencyDecimal(cost) + '</td>' +
          '<td class="mono">' + (revenue > 0 ? currencyDecimal(revenue) : '&mdash;') + '</td>' +
          '<td class="mono">' + currencyDecimal(fees + shipping) + '</td>' +
          '<td class="mono ' + netClass + '">' + (revenue > 0 ? currencyDecimal(net) : '&mdash;') + '</td>' +
          '<td><span class="status-badge ' + status.replace(/\s+/g, '-') + '">' + escapeHtml(status) + '</span></td>' +
          '</tr>';
      });

      tableBody.innerHTML = html;

      var netProfit = totalRevenue - totalCosts;
      var avgProfit = soldCount > 0 ? netProfit / soldCount : 0;
      var roi = totalCosts > 0 ? ((netProfit / totalCosts) * 100) : 0;
      var avgDays = soldCount > 0 ? totalDays / soldCount : 0;

      updateProfitMetrics(totalRevenue, totalCosts, netProfit, avgProfit, roi, avgDays);
    });
  }

  function updateProfitMetrics(revenue, costs, net, avgProfit, roi, avgDays) {
    setText('metric-revenue', currencyDecimal(revenue));
    setText('metric-costs', currencyDecimal(costs));
    setText('metric-net', currencyDecimal(net));
    setText('metric-avg-profit', currencyDecimal(avgProfit));
    setText('metric-roi', (roi || 0).toFixed(1) + '%');
    setText('metric-avg-days', (avgDays || 0).toFixed(1) + ' days');
  }

  function renderProfitEmpty(tableBody) {
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:3rem;color:var(--text-muted);font-style:italic;">No sales data yet. Flip some items and track them here.</td></tr>';
  }

  // ---- Utility ----
  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ---- Init ----
  document.addEventListener('DOMContentLoaded', function () {
    initGate();
    initSettings();
    initPrefsPanel();
    initDealsPage();
    initInventoryPage();
    initProfitPage();
  });

})();
