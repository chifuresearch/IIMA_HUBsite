/* =========================================================
   IIMA HUB — post-widgets.js
   文章頁共用小工具：瀏覽數 + 匿名留言
   後端：Firebase Realtime Database（REST API，不載 SDK）
   ---------------------------------------------------------
   設定集中在 public/data.json → data.widgets：
     {
       "firebase": {
         "databaseURL": "https://你的專案-default-rtdb.asia-southeast1.firebasedatabase.app"
       }
     }
   databaseURL 留空 = 全部功能自動停用（不會報錯）。
   安全規則見專案根目錄 WIDGETS_SETUP.md。

   資料結構：
     /views/<postKey>            = 累計瀏覽數（原子遞增 {".sv":{"increment":1}}）
     /comments/<postKey>/<push>  = { n: 暱稱, t: 內容, ts: 伺服器時間 }

   每篇文章 HTML 於 </body> 前引用：
     <script src="post-widgets.js" defer></script>
   ========================================================= */
(function () {
  'use strict';

  var MAX_NAME = 30;
  var MAX_TEXT = 1000;
  var COOLDOWN_MS = 30000; // 送出後 30 秒內不得再送（前端節流）
  var lastSubmit = 0;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /* 由網址取出本篇的資料庫 key（與 BlogSection.tsx 的 postKey 邏輯一致）：
     取路徑最後一段 → 解碼 → 去掉 .html → 替換 RTDB 禁用字元 . # $ [ ] /  */
  function postKey() {
    var seg = location.pathname.split('/').filter(Boolean).pop() || 'index';
    try { seg = decodeURIComponent(seg); } catch (e) { /* keep raw */ }
    return seg.replace(/\.html?$/i, '').replace(/[.#$\[\]\/\x00-\x1f]/g, '_');
  }

  function isLocal() {
    return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  }

  ready(function () {
    fetch('../data.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var w = (d && d.data && d.data.widgets) || {};
        initPostBg(w);
        var fb = w.firebase || {};
        var db = (fb.databaseURL || '').replace(/\/+$/, '');
        if (!db) return;
        var key = postKey();
        initViews(db, key);
        initComments(db, key);
      })
      .catch(function () { initPostBg({}); /* data.json 不可用仍給預設背景 */ });
  });

  /* ---------------- 瀏覽數 ---------------- */

  function initViews(db, key) {
    var url = db + '/views/' + encodeURIComponent(key) + '.json';
    var req;
    if (isLocal()) {
      // 本機開發只讀不計，避免汙染統計
      req = fetch(url);
    } else {
      // PUT 原子遞增，回應即為遞增後的數字
      req = fetch(url, {
        method: 'PUT',
        body: JSON.stringify({ '.sv': { 'increment': 1 } })
      });
    }
    req
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (n) {
        if (typeof n === 'number') renderViews(n);
      })
      .catch(function () { /* 服務不可用 */ });
  }

  function renderViews(count) {
    var badge = document.createElement('span');
    badge.id = 'iima-views';
    badge.style.cssText =
      'display:inline-flex;align-items:center;gap:5px;font-size:.85rem;' +
      'letter-spacing:.05em;color:var(--accent,var(--accent-color,#8b7355));white-space:nowrap;';
    badge.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>' +
      '<circle cx="12" cy="12" r="3"></circle></svg>' +
      '<span>' + count.toLocaleString('en-US') + ' 次瀏覽</span>';

    // 插入點依版型而異：agent 模板有 .meta；手工文章有 .container > header
    var meta = document.querySelector('.meta');
    if (meta) {
      var sep = document.createElement('span');
      sep.textContent = ' · ';
      meta.appendChild(sep);
      meta.appendChild(badge);
      return;
    }
    var header = document.querySelector('.container header, header');
    if (header) {
      var box = document.createElement('div');
      box.style.cssText = 'margin-top:18px;display:flex;justify-content:center;';
      box.appendChild(badge);
      header.appendChild(box);
      return;
    }
    var h1 = document.querySelector('h1');
    if (h1 && h1.parentNode) h1.parentNode.insertBefore(badge, h1.nextSibling);
  }

  /* ---------------- 留言 ---------------- */

  function initComments(db, key) {
    var host =
      document.querySelector('.container') ||
      document.querySelector('.wrap') ||
      document.body;

    var accent = 'var(--accent,var(--accent-color,#8b7355))';
    var sec = document.createElement('section');
    sec.id = 'iima-comments';
    sec.style.cssText =
      'max-width:800px;margin:70px auto 0;padding:30px 0 0;' +
      'border-top:2px solid rgba(0,0,0,.07);';

    sec.innerHTML =
      '<h3 style="font-size:1.3rem;margin:0 0 8px;color:' + accent + ';">留言 / Comments</h3>' +
      '<p style="font-size:.85rem;color:#94a3b8;margin:0 0 20px;">匿名留言，毋需帳號。請理性發言。</p>' +
      '<form id="iima-cform" style="margin-bottom:30px;">' +
      '  <input id="iima-cname" type="text" maxlength="' + MAX_NAME + '" placeholder="暱稱（可留白＝匿名）"' +
      '    style="display:block;width:100%;box-sizing:border-box;padding:10px 14px;margin-bottom:10px;' +
      '    border:1px solid rgba(0,0,0,.15);border-radius:8px;font:inherit;font-size:.9rem;background:#fff;">' +
      '  <textarea id="iima-ctext" maxlength="' + MAX_TEXT + '" rows="4" placeholder="寫點什麼…" required' +
      '    style="display:block;width:100%;box-sizing:border-box;padding:10px 14px;margin-bottom:10px;' +
      '    border:1px solid rgba(0,0,0,.15);border-radius:8px;font:inherit;font-size:.95rem;' +
      '    background:#fff;resize:vertical;"></textarea>' +
      '  <div style="display:flex;align-items:center;gap:14px;">' +
      '    <button type="submit" style="padding:9px 26px;border:none;border-radius:8px;cursor:pointer;' +
      '      font:inherit;font-size:.9rem;font-weight:700;color:#fff;background:' + accent + ';">送出</button>' +
      '    <span id="iima-cmsg" style="font-size:.82rem;color:#94a3b8;"></span>' +
      '  </div>' +
      '</form>' +
      '<div id="iima-clist"></div>';

    host.appendChild(sec);

    var listEl = sec.querySelector('#iima-clist');
    var msgEl = sec.querySelector('#iima-cmsg');
    var url = db + '/comments/' + encodeURIComponent(key) + '.json';

    loadComments(url, listEl);

    sec.querySelector('#iima-cform').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = sec.querySelector('#iima-cname').value.trim().slice(0, MAX_NAME);
      var text = sec.querySelector('#iima-ctext').value.trim().slice(0, MAX_TEXT);
      if (!text) return;
      var now = Date.now();
      if (now - lastSubmit < COOLDOWN_MS) {
        msgEl.textContent = '送出太頻繁，請稍候再試。';
        return;
      }
      lastSubmit = now;
      msgEl.textContent = '送出中…';
      fetch(url, {
        method: 'POST',
        body: JSON.stringify({
          n: name || '匿名',
          t: text,
          ts: { '.sv': 'timestamp' }
        })
      })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          sec.querySelector('#iima-ctext').value = '';
          msgEl.textContent = '已送出，謝謝留言！';
          loadComments(url, listEl);
        })
        .catch(function () {
          msgEl.textContent = '送出失敗，請稍後再試。';
        });
    });
  }

  function loadComments(url, listEl) {
    fetch(url, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (obj) {
        listEl.textContent = '';
        if (!obj) {
          var empty = document.createElement('p');
          empty.textContent = '目前還沒有留言，來搶頭香。';
          empty.style.cssText = 'font-size:.9rem;color:#94a3b8;';
          listEl.appendChild(empty);
          return;
        }
        var items = Object.keys(obj).map(function (k) { return obj[k]; });
        items.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
        items.forEach(function (c) { listEl.appendChild(renderComment(c)); });
      })
      .catch(function () { /* 服務不可用 */ });
  }

  function renderComment(c) {
    // 全部用 textContent 塞值，杜絕 HTML 注入
    var item = document.createElement('div');
    item.style.cssText =
      'padding:14px 16px;margin-bottom:12px;background:rgba(0,0,0,.03);' +
      'border-radius:10px;border:1px solid rgba(0,0,0,.05);';

    var head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:baseline;gap:10px;margin-bottom:6px;';

    var who = document.createElement('strong');
    who.textContent = String(c.n || '匿名').slice(0, MAX_NAME);
    who.style.cssText = 'font-size:.9rem;color:var(--accent,var(--accent-color,#8b7355));';

    var when = document.createElement('span');
    if (typeof c.ts === 'number') {
      var d = new Date(c.ts);
      when.textContent =
        d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0') + ' ' +
        String(d.getHours()).padStart(2, '0') + ':' +
        String(d.getMinutes()).padStart(2, '0');
    }
    when.style.cssText = 'font-size:.75rem;color:#94a3b8;';

    head.appendChild(who);
    head.appendChild(when);

    var body = document.createElement('div');
    body.textContent = String(c.t || '').slice(0, MAX_TEXT);
    body.style.cssText =
      'font-size:.95rem;line-height:1.7;white-space:pre-wrap;word-break:break-word;';

    item.appendChild(head);
    item.appendChild(body);
    return item;
  }

  /* ================================================================
     動態點雲背景：直接沿用 index 的場景
     - 以固定 iframe 嵌入 ../?bg=1（App 的純背景模式）：同一個模型、
       同樣的 shader 與 gear 設定；模型檔走瀏覽器快取
     - 非阻塞載入：內容立即可讀，角落小徽章顯示背景載入進度，
       場景就緒後（iframe 回報 iima-bg-ready）背景淡入
     - 內文容器加毛玻璃 pane 保持可讀性
     - data.json widgets.postBg === false 可整體停用
     ================================================================ */

  function initPostBg(w) {
    if (w && w.postBg === false) return;

    /* ---- 版面：背景轉暗 + 內文毛玻璃 pane ---- */
    var st = document.createElement('style');
    st.textContent =
      'html{background:#050505 !important;}' +
      'body{background:transparent !important;}' +
      '#iima-bg-frame{position:fixed;inset:0;width:100%;height:100%;z-index:-1;border:0;' +
      'pointer-events:none;display:block;background:#000;}' +
      '.container,.wrap{background:rgba(253,252,251,.9);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);' +
      'border-radius:16px;box-shadow:0 12px 60px rgba(0,0,0,.55);margin-top:28px;margin-bottom:56px;}' +
      '.control-bar{background:rgba(253,252,251,.82) !important;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);}' +
      '@media (max-width:600px){.container,.wrap{border-radius:0;margin-top:0;}}';
    document.head.appendChild(st);

    var frame = document.createElement('iframe');
    frame.id = 'iima-bg-frame';
    frame.src = '../?bg=1';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.opacity = '0';
    frame.style.transition = 'opacity 1.2s ease';
    document.body.insertBefore(frame, document.body.firstChild);

    /* ---- 非阻塞載入指示：內容立即可讀，角落小徽章顯示背景載入進度 ---- */
    var chip = document.createElement('div');
    chip.id = 'iima-bg-loading';
    chip.style.cssText =
      'position:fixed;left:16px;bottom:16px;z-index:90;pointer-events:none;' +
      'font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10px;' +
      'letter-spacing:.25em;color:#ff5f00;background:rgba(0,0,0,.7);' +
      'border:1px solid rgba(255,95,0,.4);padding:8px 12px;transition:opacity .5s;';
    chip.textContent = 'LOADING POINT CLOUD\u2026 0%';
    document.body.appendChild(chip);

    var dismissed = false;
    function dismiss(showBg) {
      if (showBg) frame.style.opacity = '1';
      if (dismissed) return;
      dismissed = true;
      chip.style.opacity = '0';
      setTimeout(function () { if (chip.parentNode) chip.parentNode.removeChild(chip); }, 550);
    }
    // 安全網：逾時就收掉徽章（背景屆時若已可看也一併淡入交給 ready 訊息）
    setTimeout(function () { dismiss(false); }, 30000);
    frame.addEventListener('error', function () { dismiss(false); });

    /* ---- 與 iframe 場景通訊 ---- */
    window.addEventListener('message', function (e) {
      var d = e.data || {};
      if (d.type === 'iima-bg-progress') {
        var v = Math.max(0, Math.min(100, d.p || 0));
        if (!dismissed) chip.textContent = 'LOADING POINT CLOUD\u2026 ' + v + '%';
      } else if (d.type === 'iima-bg-ready') {
        dismiss(true);
      }
    });

    function send(msg) {
      try { if (frame.contentWindow) frame.contentWindow.postMessage(msg, '*'); } catch (err) { /* ignore */ }
    }
    function onScroll() {
      var mx = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      send({ type: 'iima-scroll', p: Math.min(1, Math.max(0, window.scrollY / mx)) });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('mousemove', function (e) {
      send({ type: 'iima-mouse', x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
    }, { passive: true });
    frame.addEventListener('load', onScroll);
  }
})();
