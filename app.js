/* ===========================================================
   科研备忘录 · Research Memo — Application Logic
   =========================================================== */

(() => {
  'use strict';

  // ──────────── Constants ────────────
  const STORAGE_KEY = 'research_memos_v2';
  const SYNC_TOKEN_KEY = 'research_memo_sync_token';
  const SYNC_GIST_KEY = 'research_memo_gist_id';
  const SYNC_LAST_KEY = 'research_memo_last_sync';
  const GIST_FILENAME = 'research_memos.json';
  const GIST_API = 'https://api.github.com/gists';
  const CATEGORY_LABELS = {
    idea: '\uD83D\uDCA1 灵感想法',
    experiment: '\uD83E\uDDEA 实验记录',
    literature: '\uD83D\uDCD6 文献笔记',
    todo: '\u2705 待办事项',
    meeting: '\uD83D\uDCCB 会议纪要'
  };
  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

  // ──────────── State ────────────
  let memos = [];
  let currentFilter = { type: 'category', value: 'all' };
  let currentSort = 'newest';
  let editingId = null;
  let viewMode = 'grid';
  let isSyncing = false;

  // ──────────── DOM Refs ────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const sidebar = $('#sidebar');
  const sidebarToggle = $('#sidebarToggle');
  const sidebarClose = $('#sidebarClose');
  const searchInput = $('#searchInput');
  const categoryList = $('#categoryList');
  const priorityList = $('#priorityList');
  const memoGrid = $('#memoGrid');
  const emptyState = $('#emptyState');
  const topbarTitle = $('#topbarTitle');

  const modalOverlay = $('#modalOverlay');
  const modalTitle = $('#modalTitle');
  const memoTitleInput = $('#memoTitleInput');
  const memoCategorySelect = $('#memoCategorySelect');
  const memoPrioritySelect = $('#memoPrioritySelect');
  const memoStatusSelect = $('#memoStatusSelect');
  const memoTagsInput = $('#memoTagsInput');
  const memoContentInput = $('#memoContentInput');
  const btnSave = $('#btnSave');
  const btnDelete = $('#btnDelete');
  const btnCancel = $('#btnCancel');
  const modalClose = $('#modalClose');

  const detailOverlay = $('#detailOverlay');
  const detailTitle = $('#detailTitle');
  const detailMeta = $('#detailMeta');
  const detailBody = $('#detailBody');
  const detailEdit = $('#detailEdit');
  const detailClose = $('#detailClose');

  const confirmOverlay = $('#confirmOverlay');
  const confirmCancel = $('#confirmCancel');
  const confirmDelete = $('#confirmDelete');

  const sortMenu = $('#sortMenu');
  const btnSort = $('#btnSort');
  const toastContainer = $('#toastContainer');

  // Sync DOM
  const btnSync = $('#btnSync');
  const syncIcon = $('#syncIcon');
  const syncLabel = $('#syncLabel');
  const syncSettingsOverlay = $('#syncSettingsOverlay');
  const syncTokenInput = $('#syncTokenInput');
  const syncGistIdInput = $('#syncGistIdInput');
  const syncStatusCard = $('#syncStatusCard');
  const syncStatusText = $('#syncStatusText');
  const lastSyncTimeEl = $('#lastSyncTime');
  const displayGistId = $('#displayGistId');

  // ──────────── Storage ────────────
  function loadMemos() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      memos = raw ? JSON.parse(raw) : [];
    } catch { memos = []; }
  }

  function saveMemos() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memos));
  }

  function uuid() {
    return 'xxxx-xxxx-xxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
  }

  // ──────────── Date Formatting ────────────
  function formatDate(ts) {
    const d = new Date(ts);
    const diff = Date.now() - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return y + '-' + m + '-' + day + ' ' + h + ':' + min;
  }

  function formatFullDate(ts) {
    return new Date(ts).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }

  // ──────────── Markdown ────────────
  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function stripMarkdown(text) {
    if (!text) return '';
    return text.replace(/[#*~`>\[\]()|-]/g, '').replace(/\n/g, ' ').trim();
  }

  function renderMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);
    html = html.replace(/```([\s\S]*?)```/g, (_, code) => '<pre><code>' + code.trim() + '</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/^---$/gm, '<hr>');
    html = html.replace(/^- \[x\] (.+)$/gm, '<div class="task-item"><span class="task-checkbox checked"></span><del>$1</del></div>');
    html = html.replace(/^- \[ \] (.+)$/gm, '<div class="task-item"><span class="task-checkbox"></span>$1</div>');
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    html = html.replace(/^(\|.+\|)\n(\|[\s:-]+\|)\n((?:\|.+\|\n?)+)/gm, (_, header, sep, body) => {
      const ths = header.split('|').filter(Boolean).map(c => '<th>' + c.trim() + '</th>').join('');
      const rows = body.trim().split('\n').map(row => {
        const tds = row.split('|').filter(Boolean).map(c => '<td>' + c.trim() + '</td>').join('');
        return '<tr>' + tds + '</tr>';
      }).join('');
      return '<table><thead><tr>' + ths + '</tr></thead><tbody>' + rows + '</tbody></table>';
    });
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    html = '<p>' + html + '</p>';
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p>\s*(<h[123]>)/g, '$1');
    html = html.replace(/(<\/h[123]>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<pre>)/g, '$1');
    html = html.replace(/(<\/pre>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<table>)/g, '$1');
    html = html.replace(/(<\/table>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<blockquote>)/g, '$1');
    html = html.replace(/(<\/blockquote>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<hr>)/g, '$1');
    html = html.replace(/(<hr>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<div)/g, '$1');
    html = html.replace(/(<\/div>)\s*<\/p>/g, '$1');
    return html;
  }

  // ──────────── Filter & Sort ────────────
  function getFilteredMemos() {
    let result = [...memos];
    const q = searchInput.value.trim().toLowerCase();
    if (q) {
      result = result.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.content.toLowerCase().includes(q) ||
        (m.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    if (currentFilter.type === 'category' && currentFilter.value !== 'all') {
      result = result.filter(m => m.category === currentFilter.value);
    }
    if (currentFilter.type === 'priority') {
      result = result.filter(m => m.priority === currentFilter.value);
    }
    switch (currentSort) {
      case 'newest': result.sort((a, b) => b.updatedAt - a.updatedAt); break;
      case 'oldest': result.sort((a, b) => a.updatedAt - b.updatedAt); break;
      case 'priority': result.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]); break;
      case 'alpha': result.sort((a, b) => a.title.localeCompare(b.title, 'zh')); break;
    }
    return result;
  }

  // ──────────── Rendering ────────────
  function renderMemos() {
    const filtered = getFilteredMemos();
    if (filtered.length === 0) {
      emptyState.classList.add('visible');
      memoGrid.style.display = 'none';
    } else {
      emptyState.classList.remove('visible');
      memoGrid.style.display = '';
      memoGrid.innerHTML = filtered.map((m, i) => createCardHtml(m, i)).join('');
    }
    updateCounts();
  }

  function createCardHtml(memo, index) {
    const preview = stripMarkdown(memo.content).slice(0, 200);
    const tagsHtml = (memo.tags || []).slice(0, 4)
      .map(t => '<span class="memo-tag">' + escapeHtml(t) + '</span>').join('');
    return '<article class="memo-card ' + (memo.status === 'completed' ? 'completed' : '') + '"'
      + ' data-id="' + memo.id + '"'
      + ' data-category="' + memo.category + '"'
      + ' style="animation-delay: ' + (index * 0.04) + 's"'
      + ' onclick="window.__openDetail(\'' + memo.id + '\')">'
      + '<div class="memo-card-header">'
      + '<h3 class="memo-card-title">' + escapeHtml(memo.title || '无标题') + '</h3>'
      + '<span class="memo-card-priority ' + memo.priority + '"></span>'
      + '</div>'
      + '<div class="memo-card-content">' + preview + '</div>'
      + (tagsHtml ? '<div class="memo-card-tags">' + tagsHtml + '</div>' : '')
      + '<div class="memo-card-footer">'
      + '<span class="memo-card-category ' + memo.category + '">' + (CATEGORY_LABELS[memo.category] || memo.category) + '</span>'
      + '<span class="memo-card-date">' + formatDate(memo.updatedAt) + '</span>'
      + '</div></article>';
  }

  function updateCounts() {
    const count = (cat) => memos.filter(m => m.category === cat).length;
    $('#countAll').textContent = memos.length;
    $('#countIdea').textContent = count('idea');
    $('#countExperiment').textContent = count('experiment');
    $('#countLiterature').textContent = count('literature');
    $('#countTodo').textContent = count('todo');
    $('#countMeeting').textContent = count('meeting');
  }

  // ──────────── Edit Modal ────────────
  function openEditModal(id) {
    editingId = id || null;
    if (editingId) {
      const memo = memos.find(m => m.id === editingId);
      if (!memo) return;
      modalTitle.textContent = '编辑备忘';
      memoTitleInput.value = memo.title;
      memoCategorySelect.value = memo.category;
      memoPrioritySelect.value = memo.priority;
      memoStatusSelect.value = memo.status || 'active';
      memoTagsInput.value = (memo.tags || []).join(', ');
      memoContentInput.value = memo.content;
      btnDelete.style.display = 'inline-flex';
    } else {
      modalTitle.textContent = '新建备忘';
      memoTitleInput.value = '';
      memoCategorySelect.value = 'idea';
      memoPrioritySelect.value = 'medium';
      memoStatusSelect.value = 'active';
      memoTagsInput.value = '';
      memoContentInput.value = '';
      btnDelete.style.display = 'none';
    }
    modalOverlay.classList.add('open');
    setTimeout(() => memoTitleInput.focus(), 100);
  }

  function closeEditModal() {
    modalOverlay.classList.remove('open');
    editingId = null;
  }

  function saveMemo() {
    const title = memoTitleInput.value.trim();
    if (!title) { toast('请输入标题', 'error'); memoTitleInput.focus(); return; }
    const now = Date.now();
    const tags = memoTagsInput.value.split(/[,，]/).map(t => t.trim()).filter(Boolean);
    if (editingId) {
      const memo = memos.find(m => m.id === editingId);
      if (memo) {
        Object.assign(memo, {
          title, category: memoCategorySelect.value, priority: memoPrioritySelect.value,
          status: memoStatusSelect.value, tags, content: memoContentInput.value, updatedAt: now
        });
        toast('备忘已更新', 'success');
      }
    } else {
      memos.unshift({
        id: uuid(), title, category: memoCategorySelect.value, priority: memoPrioritySelect.value,
        status: memoStatusSelect.value, tags, content: memoContentInput.value, createdAt: now, updatedAt: now
      });
      toast('备忘已创建', 'success');
    }
    saveMemos(); renderMemos(); closeEditModal();
  }

  // ──────────── Detail Modal ────────────
  function openDetail(id) {
    const memo = memos.find(m => m.id === id);
    if (!memo) return;
    detailTitle.textContent = memo.title || '无标题';
    const statusLabel = memo.status === 'completed' ? '\u2705 已完成' : memo.status === 'archived' ? '\uD83D\uDCE6 已归档' : '\uD83D\uDD04 进行中';
    const prioLabel = memo.priority === 'high' ? '高' : memo.priority === 'medium' ? '中' : '低';
    detailMeta.innerHTML = '<span class="detail-meta-item"><span class="memo-card-category ' + memo.category + '">' + CATEGORY_LABELS[memo.category] + '</span></span>'
      + '<span class="detail-meta-item">优先级：<span class="priority-badge ' + memo.priority + '">' + prioLabel + '</span></span>'
      + '<span class="detail-meta-item">状态：' + statusLabel + '</span>'
      + '<span class="detail-meta-item">创建：' + formatFullDate(memo.createdAt) + '</span>'
      + '<span class="detail-meta-item">更新：' + formatFullDate(memo.updatedAt) + '</span>'
      + ((memo.tags || []).length ? '<span class="detail-meta-item">' + memo.tags.map(t => '<span class="memo-tag">' + escapeHtml(t) + '</span>').join(' ') + '</span>' : '');
    detailBody.innerHTML = renderMarkdown(memo.content);
    detailOverlay.classList.add('open');
    detailEdit.onclick = () => { detailOverlay.classList.remove('open'); openEditModal(id); };
  }
  window.__openDetail = openDetail;

  // ──────────── Confirm Delete ────────────
  let deleteCallback = null;
  function askDelete(id) {
    confirmOverlay.classList.add('open');
    deleteCallback = () => {
      memos = memos.filter(m => m.id !== id);
      saveMemos(); renderMemos();
      confirmOverlay.classList.remove('open');
      closeEditModal();
      detailOverlay.classList.remove('open');
      toast('备忘已删除', 'success');
    };
  }

  // ──────────── Toast ────────────
  function toast(msg, type) {
    type = type || 'success';
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = '<span class="toast-icon">' + (type === 'success' ? '\u2705' : '\u274C') + '</span>' + msg;
    toastContainer.appendChild(el);
    setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 300); }, 2500);
  }

  // ──────────── Editor Toolbar ────────────
  function handleToolbar(e) {
    const btn = e.target.closest('[data-md]');
    if (!btn) return;
    const action = btn.dataset.md;
    const ta = memoContentInput;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const sel = ta.value.substring(start, end);
    let insert = '', cursorOffset = 0;
    switch (action) {
      case '**': case '*': case '~~':
        insert = action + (sel || '文本') + action;
        cursorOffset = sel ? insert.length : action.length; break;
      case 'heading': insert = '\n## ' + (sel || '标题'); cursorOffset = sel ? insert.length : 4; break;
      case 'ul': insert = '\n- ' + (sel || '列表项'); cursorOffset = sel ? insert.length : 3; break;
      case 'ol': insert = '\n1. ' + (sel || '列表项'); cursorOffset = sel ? insert.length : 4; break;
      case 'task': insert = '\n- [ ] ' + (sel || '任务'); cursorOffset = sel ? insert.length : 7; break;
      case 'code': insert = '`' + (sel || '代码') + '`'; cursorOffset = sel ? insert.length : 1; break;
      case 'codeblock': insert = '\n```\n' + (sel || '代码') + '\n```\n'; cursorOffset = sel ? insert.length : 5; break;
      case 'link': insert = '[' + (sel || '链接文本') + '](https://)'; cursorOffset = insert.length - 1; break;
      case 'table': insert = '\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n'; cursorOffset = insert.length; break;
    }
    ta.value = ta.value.substring(0, start) + insert + ta.value.substring(end);
    ta.focus(); ta.setSelectionRange(start + cursorOffset, start + cursorOffset);
  }

  // ──────────── Export / Import ────────────
  function exportData() {
    const blob = new Blob([JSON.stringify(memos, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'research_memos_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click(); URL.revokeObjectURL(url);
    toast('数据已导出', 'success');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data)) throw new Error();
        const existingIds = new Set(memos.map(m => m.id));
        const newMemos = data.filter(m => !existingIds.has(m.id));
        memos = [...memos, ...newMemos];
        saveMemos(); renderMemos();
        toast('已导入 ' + newMemos.length + ' 条备忘 (共 ' + data.length + ' 条)', 'success');
      } catch { toast('导入失败：文件格式不正确', 'error'); }
    };
    reader.readAsText(file);
  }

  // ──────────── GitHub Gist Sync ────────────
  function getSyncToken() { return localStorage.getItem(SYNC_TOKEN_KEY) || ''; }
  function getSyncGistId() { return localStorage.getItem(SYNC_GIST_KEY) || ''; }

  function setSyncingState(syncing) {
    isSyncing = syncing;
    btnSync.disabled = syncing;
    if (syncing) {
      btnSync.classList.add('syncing');
      syncIcon.textContent = '\uD83D\uDD04';
      syncLabel.textContent = '同步中\u2026';
    } else {
      btnSync.classList.remove('syncing');
      syncIcon.textContent = '\u2601\uFE0F';
      syncLabel.textContent = '云端同步';
    }
  }

  function mergeMemos(local, remote) {
    const merged = new Map();
    for (const m of local) merged.set(m.id, m);
    for (const m of remote) {
      const existing = merged.get(m.id);
      if (!existing || m.updatedAt > existing.updatedAt) {
        merged.set(m.id, m);
      }
    }
    return Array.from(merged.values());
  }

  async function createGist(token, data) {
    const resp = await fetch(GIST_API, {
      method: 'POST',
      headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json' },
      body: JSON.stringify({
        description: '科研备忘录 · Research Memo Data',
        public: false,
        files: { [GIST_FILENAME]: { content: JSON.stringify(data, null, 2) } }
      })
    });
    if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.message || 'HTTP ' + resp.status); }
    return resp.json();
  }

  async function updateGist(token, gistId, data) {
    const resp = await fetch(GIST_API + '/' + gistId, {
      method: 'PATCH',
      headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json' },
      body: JSON.stringify({ files: { [GIST_FILENAME]: { content: JSON.stringify(data, null, 2) } } })
    });
    if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.message || 'HTTP ' + resp.status); }
    return resp.json();
  }

  async function fetchGist(token, gistId) {
    const resp = await fetch(GIST_API + '/' + gistId, {
      headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!resp.ok) { if (resp.status === 404) return null; const err = await resp.json().catch(() => ({})); throw new Error(err.message || 'HTTP ' + resp.status); }
    return resp.json();
  }

  async function performSync() {
    const token = getSyncToken();
    if (!token) { toast('请先在同步设置中配置 Token', 'error'); openSyncSettings(); return; }
    if (isSyncing) return;
    setSyncingState(true);
    try {
      let gistId = getSyncGistId();
      let remoteMemos = [];
      if (gistId) {
        const gist = await fetchGist(token, gistId);
        if (gist && gist.files && gist.files[GIST_FILENAME]) {
          try { remoteMemos = JSON.parse(gist.files[GIST_FILENAME].content); if (!Array.isArray(remoteMemos)) remoteMemos = []; } catch { remoteMemos = []; }
        } else if (!gist) { gistId = ''; }
      }
      const merged = mergeMemos(memos, remoteMemos);
      memos = merged; saveMemos(); renderMemos();
      if (gistId) {
        await updateGist(token, gistId, merged);
      } else {
        const newGist = await createGist(token, merged);
        gistId = newGist.id;
        localStorage.setItem(SYNC_GIST_KEY, gistId);
      }
      localStorage.setItem(SYNC_LAST_KEY, Date.now().toString());
      toast('同步成功！共 ' + merged.length + ' 条备忘', 'success');
      updateSyncStatus();
    } catch (err) {
      console.error('[Sync] Error:', err);
      if (err.message && (err.message.includes('Bad credentials') || err.message.includes('401'))) {
        toast('Token 无效或已过期，请更新', 'error');
      } else {
        toast('同步失败：' + (err.message || '未知错误'), 'error');
      }
    } finally { setSyncingState(false); }
  }

  function openSyncSettings() {
    syncTokenInput.value = getSyncToken();
    syncGistIdInput.value = getSyncGistId();
    updateSyncStatus();
    syncSettingsOverlay.classList.add('open');
  }

  function closeSyncSettings() { syncSettingsOverlay.classList.remove('open'); }

  function saveSyncSettingsFn() {
    const token = syncTokenInput.value.trim();
    const gistId = syncGistIdInput.value.trim();
    if (!token) { toast('请输入 Token', 'error'); syncTokenInput.focus(); return; }
    localStorage.setItem(SYNC_TOKEN_KEY, token);
    if (gistId) { localStorage.setItem(SYNC_GIST_KEY, gistId); } else { localStorage.removeItem(SYNC_GIST_KEY); }
    toast('同步设置已保存', 'success');
    updateSyncStatus(); closeSyncSettings();
  }

  function updateSyncStatus() {
    const token = getSyncToken();
    const gistId = getSyncGistId();
    const lastSync = localStorage.getItem(SYNC_LAST_KEY);
    if (token) {
      syncStatusCard.style.display = 'block';
      syncStatusText.textContent = '\u2705 已配置';
      displayGistId.textContent = gistId ? gistId.slice(0, 12) + '\u2026' : '首次同步时自动创建';
      lastSyncTimeEl.textContent = lastSync ? formatFullDate(parseInt(lastSync)) : '从未';
    } else { syncStatusCard.style.display = 'none'; }
  }

  // ──────────── Event Binding ────────────
  function bindEvents() {
    sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    sidebarClose.addEventListener('click', () => sidebar.classList.remove('open'));
    $('#btnNewMemo').addEventListener('click', () => openEditModal());
    $('#btnNewMemoEmpty').addEventListener('click', () => openEditModal());

    categoryList.addEventListener('click', (e) => {
      const item = e.target.closest('.nav-item'); if (!item) return;
      $$('.nav-item.active').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      const cat = item.dataset.category;
      currentFilter = { type: 'category', value: cat };
      topbarTitle.textContent = cat === 'all' ? '全部备忘' : (CATEGORY_LABELS[cat] || cat);
      renderMemos(); sidebar.classList.remove('open');
    });

    priorityList.addEventListener('click', (e) => {
      const item = e.target.closest('.nav-item'); if (!item) return;
      $$('.nav-item.active').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      currentFilter = { type: 'priority', value: item.dataset.priority };
      topbarTitle.textContent = (item.dataset.priority === 'high' ? '高' : item.dataset.priority === 'medium' ? '中' : '低') + '优先级';
      renderMemos(); sidebar.classList.remove('open');
    });

    searchInput.addEventListener('input', debounce(renderMemos, 200));

    btnSort.addEventListener('click', (e) => { e.stopPropagation(); sortMenu.classList.toggle('open'); });
    sortMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sort]'); if (!btn) return;
      currentSort = btn.dataset.sort; sortMenu.classList.remove('open'); renderMemos();
    });
    document.addEventListener('click', () => sortMenu.classList.remove('open'));

    $('#btnGridView').addEventListener('click', () => {
      viewMode = 'grid'; memoGrid.classList.remove('list-view');
      $('#btnGridView').classList.add('active'); $('#btnListView').classList.remove('active');
    });
    $('#btnListView').addEventListener('click', () => {
      viewMode = 'list'; memoGrid.classList.add('list-view');
      $('#btnListView').classList.add('active'); $('#btnGridView').classList.remove('active');
    });

    btnSave.addEventListener('click', saveMemo);
    btnCancel.addEventListener('click', closeEditModal);
    modalClose.addEventListener('click', closeEditModal);
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeEditModal(); });

    btnDelete.addEventListener('click', () => { if (editingId) askDelete(editingId); });
    confirmCancel.addEventListener('click', () => confirmOverlay.classList.remove('open'));
    confirmDelete.addEventListener('click', () => { if (deleteCallback) deleteCallback(); });
    confirmOverlay.addEventListener('click', (e) => { if (e.target === confirmOverlay) confirmOverlay.classList.remove('open'); });

    detailClose.addEventListener('click', () => detailOverlay.classList.remove('open'));
    detailOverlay.addEventListener('click', (e) => { if (e.target === detailOverlay) detailOverlay.classList.remove('open'); });

    document.querySelector('.editor-toolbar').addEventListener('click', handleToolbar);

    $('#btnExport').addEventListener('click', exportData);
    $('#btnImport').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', (e) => { if (e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; } });

    // Sync events
    btnSync.addEventListener('click', performSync);
    $('#btnSyncSettings').addEventListener('click', openSyncSettings);
    $('#syncSettingsSave').addEventListener('click', saveSyncSettingsFn);
    $('#syncSettingsCancel').addEventListener('click', closeSyncSettings);
    $('#syncSettingsClose').addEventListener('click', closeSyncSettings);
    syncSettingsOverlay.addEventListener('click', (e) => { if (e.target === syncSettingsOverlay) closeSyncSettings(); });
    $('#toggleTokenVisibility').addEventListener('click', () => {
      syncTokenInput.type = syncTokenInput.type === 'password' ? 'text' : 'password';
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); openEditModal(); }
      if (e.key === 'Escape') {
        if (syncSettingsOverlay.classList.contains('open')) closeSyncSettings();
        else if (confirmOverlay.classList.contains('open')) confirmOverlay.classList.remove('open');
        else if (modalOverlay.classList.contains('open')) closeEditModal();
        else if (detailOverlay.classList.contains('open')) detailOverlay.classList.remove('open');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && modalOverlay.classList.contains('open')) { e.preventDefault(); saveMemo(); }
    });
  }

  function debounce(fn, ms) {
    let timer;
    return function() { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, arguments), ms); };
  }

  // ──────────── Demo Data ────────────
  function seedDemoData() {
    if (memos.length > 0) return;
    const now = Date.now();
    memos = [
      { id: uuid(), title: '蛋白质折叠模型优化思路', category: 'idea', priority: 'high', status: 'active', tags: ['深度学习', 'AlphaFold', '结构预测'], content: '# 优化方向\n\n## 模型结构\n- 引入 **SE(3)-Transformer** 改进等变性\n- 增加侧链建模的独立分支\n- 尝试 diffusion model 生成构象\n\n## 训练策略\n1. 使用对比学习预训练\n2. 多任务学习结合功能预测\n3. 数据增强：随机旋转 + 噪声扰动\n\n## 待验证\n- [ ] 在 CASP15 数据集测试 GDT-TS\n- [ ] 对比 ESMFold 结果\n- [x] 完成文献调研', createdAt: now - 86400000, updatedAt: now - 3600000 },
      { id: uuid(), title: 'PCR 实验条件优化', category: 'experiment', priority: 'medium', status: 'active', tags: ['分子克隆', 'PCR'], content: '## 实验目标\n扩增目标基因片段 (1.2kb)\n\n## 最优条件\n| 参数 | 值 |\n| --- | --- |\n| 退火温度 | 58\u00B0C |\n| 延伸时间 | 90s |\n| 循环数 | 32 |\n| 模板量 | 50ng |\n\n## 结果\n琼脂糖凝胶电泳结果显示 **单一条带**，大小正确。\n\n> 注意：Mg\u00B2\u207A 浓度从 1.5mM 调整到 2.0mM 后效果显著改善', createdAt: now - 172800000, updatedAt: now - 86400000 },
      { id: uuid(), title: 'Attention Is All You Need 笔记', category: 'literature', priority: 'medium', status: 'completed', tags: ['Transformer', 'NLP', '注意力机制'], content: '# Attention Is All You Need\n\n**Authors**: Vaswani et al. (2017)\n**DOI**: 10.48550/arXiv.1706.03762\n\n## 核心贡献\n- 提出了纯注意力架构 Transformer\n- 摒弃 RNN/CNN，完全基于 Self-Attention\n- 引入 Multi-Head Attention 和 Positional Encoding\n\n## 关键公式\n`Attention(Q,K,V) = softmax(QK^T / sqrt(d_k)) V`\n\n## 对我们工作的启发\n可以考虑将 cross-attention 应用到蛋白质-配体相互作用预测中', createdAt: now - 259200000, updatedAt: now - 259200000 },
      { id: uuid(), title: '本周科研待办', category: 'todo', priority: 'high', status: 'active', tags: ['周计划'], content: '- [x] 完成文献综述初稿\n- [ ] 跑模型消融实验\n- [ ] 准备组会 PPT\n- [ ] 修改论文 Introduction 部分\n- [ ] 联系合作者讨论数据共享', createdAt: now - 43200000, updatedAt: now - 7200000 },
      { id: uuid(), title: '课题组组会纪要 (6/12)', category: 'meeting', priority: 'low', status: 'active', tags: ['组会', '进展汇报'], content: '## 参会人员\n导师、全体研究生\n\n## 主要内容\n1. 张三汇报了分子动力学模拟进展\n2. 李四展示了新的实验结果\n3. 导师建议优先完成 **对比实验**\n\n## 分配任务\n- 我负责补充 baseline 实验\n- 下周五前提交实验报告\n\n---\n*下次组会：6/19（周四）*', createdAt: now - 345600000, updatedAt: now - 345600000 }
    ];
    saveMemos();
  }

  // ──────────── Init ────────────
  function init() {
    loadMemos(); seedDemoData(); bindEvents(); renderMemos(); updateSyncStatus();
  }

  init();
})();
