/* =========================================================
   IIMA HUB — event-widgets.js
   活動頁共用小工具：點雲背景 iframe、瀏覽數、表單 modal、驗證與送出
   後端：Firebase Realtime Database（REST API，不載 SDK）
   ---------------------------------------------------------
   設定沿用 public/data.json → data.widgets.firebase.databaseURL
   databaseURL 留空 = 瀏覽數與送出自動停用（表單仍可驗證，送出時提示未設定）。

   資料結構：
     /events/<slug>/views                 = 累計瀏覽數（原子遞增）
     /events/<slug>/counts/<form>         = 送出筆數（原子遞增，可公開顯示）
     /events/<slug>/<form>/<pushId>       = { ts, lang, page, answers:{qid: value} }
     /events/<slug>/_test_<form>/<pushId> = localhost 測試送出（不計入正式）

   頁面由 backend/eventgen.py 產生，於 </body> 前引用本檔；
   window.IIMA_EVENT = { slug, forms:{ registration:{open,success,closed_note,label,show_count}, feedback:{...} } }

   互動規格（2026-10-14）：
     - 「活動資訊」段落底部的按鈕 [data-open-form] → 開啟該表單 modal
     - modal 只有「送出成功」後才算完成；點背景 / × / Esc 一律先 popup「尚未送出」確認
     - 送出時有必填空白 → popup「尚有 N 題未填」→ 關閉後捲到第一個缺填題並 focus
     - 未開放的表單：按鈕 closed 樣式，點了 popup closed_note
   網址參數：
     ?form=feedback          載入後直接開啟回饋表 modal
     ?form=feedback&open=1   強制開放尚未開放的表單（結業時 QR Code 用）
   ========================================================= */
(function () {
  'use strict';

  var COOLDOWN_MS = 30000;
  var lastSubmit = 0;
  var CFG = window.IIMA_EVENT || { slug: 'event', forms: {} };
  var FORCE_OPEN = qs('open') === '1';
  var submitted = {};      // formId → true（本次已成功送出）

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  function isLocal() {
    return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  }
  function mode() {
    return document.body.classList.contains('mode-en') ? 'en'
      : document.body.classList.contains('mode-zh') ? 'zh' : 'bilingual';
  }
  function t(zh, en) {
    var m = mode();
    return m === 'en' ? en : m === 'zh' ? zh : (zh + ' / ' + en);
  }
  function qs(k) {
    try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; }
  }
  function formCfg(id) { return (CFG.forms || {})[id] || {}; }
  function storageKey(id) { return 'iima_event_' + CFG.slug + '_' + id; }

  ready(function () {
    initModals();
    initForms();
    fetch('../data.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var w = (d && d.data && d.data.widgets) || {};
        initPostBg(w);
        var db = ((w.firebase || {}).databaseURL || '').replace(/\/+$/, '');
        window.__iimaDb = db;
        if (!db) return;
        initViews(db);
        initCounts(db);
      })
      .catch(function () { initPostBg({}); });
  });

  /* ---------------- 小型提醒 popup ----------------
     popup({title:{zh,en}, text:{zh,en}, warn:bool, buttons:[{zh,en,primary,value}]}) → Promise<value> */

  function popup(opt) {
    return new Promise(function (resolve) {
      var wrap = document.createElement('div');
      wrap.className = 'ev-alert';
      var bd = document.createElement('div');
      bd.className = 'ev-alert-backdrop';
      var box = document.createElement('div');
      box.className = 'ev-alert-box' + (opt.warn ? ' warn' : '');
      box.setAttribute('role', 'alertdialog');
      if (opt.title) {
        var h = document.createElement('div');
        h.className = 'ev-alert-title';
        h.textContent = t(opt.title.zh, opt.title.en);
        box.appendChild(h);
      }
      var p = document.createElement('div');
      p.className = 'ev-alert-text';
      p.textContent = t(opt.text.zh, opt.text.en);
      box.appendChild(p);
      var acts = document.createElement('div');
      acts.className = 'ev-alert-actions';
      var buttons = opt.buttons || [{ zh: '知道了', en: 'OK', primary: true, value: true }];
      var first = null;
      buttons.forEach(function (b) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn' + (b.primary ? ' primary' : ' ghost');
        btn.textContent = t(b.zh, b.en);
        btn.addEventListener('click', function () { close(b.value); });
        acts.appendChild(btn);
        if (b.primary || !first) first = btn;
      });
      box.appendChild(acts);
      wrap.appendChild(bd);
      wrap.appendChild(box);
      document.body.appendChild(wrap);
      var prim = buttons.filter(function (b) { return b.primary; })[0] || buttons[0];
      function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); close(buttons[buttons.length - 1].value); }
        if (e.key === 'Enter') { e.preventDefault(); close(prim.value); }
      }
      document.addEventListener('keydown', onKey, true);
      // 點提醒框外面 = 取消（最後一顆按鈕的值）
      bd.addEventListener('click', function () { close(buttons[buttons.length - 1].value); });
      function close(v) {
        document.removeEventListener('keydown', onKey, true);
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        resolve(v);
      }
      setTimeout(function () { if (first) first.focus(); }, 30);
    });
  }

  /* ---------------- modal 開關 ---------------- */

  var openId = null;

  function modalOf(id) { return document.getElementById('modal-' + id); }

  function openModal(id) {
    var m = modalOf(id);
    if (!m) return;
    if (openId && openId !== id) closeModal(openId, true);
    m.removeAttribute('hidden');
    document.body.classList.add('ev-modal-open');
    openId = id;
    var panel = m.querySelector('.ev-modal-panel');
    if (panel) { panel.scrollTop = 0; }
    setTimeout(function () {
      var f = m.querySelector('input:not([type=hidden]):not(.hp), textarea, button.btn');
      if (f && !m.querySelector('.form-success')) f.focus({ preventScroll: true });
    }, 60);
  }

  function closeModal(id, silent) {
    var m = modalOf(id);
    if (!m) return;
    m.setAttribute('hidden', '');
    if (openId === id) openId = null;
    if (!openId) document.body.classList.remove('ev-modal-open');
    if (!silent) {
      var btn = document.querySelector('[data-open-form="' + id + '"]');
      if (btn) btn.focus({ preventScroll: true });
    }
  }

  /* 使用者想離開 modal（背景 / × / Esc）：尚未送出 → 先提醒 */
  function requestClose(id) {
    var m = modalOf(id);
    if (!m) return;
    if (submitted[id] || m.querySelector('.form-success')) { closeModal(id); return; }
    var label = formCfg(id).label || { zh: '表單', en: 'form' };
    popup({
      title: { zh: '還沒有送出', en: 'Not submitted yet' },
      text: {
        zh: '你的「' + (label.zh || '表單') + '」尚未送出，離開後已填的內容不會保存。要繼續填寫嗎？',
        en: 'Your ' + (label.en || 'form') + ' has not been submitted; anything you typed will be lost if you leave. Continue filling it in?'
      },
      buttons: [
        { zh: '繼續填寫', en: 'Keep editing', primary: true, value: 'stay' },
        { zh: '放棄離開', en: 'Leave', primary: false, value: 'leave' }
      ]
    }).then(function (v) { if (v === 'leave') closeModal(id); });
  }

  function initModals() {
    document.querySelectorAll('.ev-modal').forEach(function (m) {
      var id = m.getAttribute('data-form');
      m.querySelector('.ev-modal-backdrop').addEventListener('click', function () { requestClose(id); });
      m.querySelector('.ev-modal-close').addEventListener('click', function () { requestClose(id); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && openId && !document.querySelector('.ev-alert')) requestClose(openId);
    });
    // 活動資訊底部的按鈕
    document.querySelectorAll('[data-open-form]').forEach(function (btn) {
      var id = btn.getAttribute('data-open-form');
      btn.addEventListener('click', function () {
        var cfg = formCfg(id);
        if (!cfg.open && !FORCE_OPEN) {
          popup({
            title: cfg.label || { zh: '尚未開放', en: 'Not open yet' },
            text: cfg.closed_note && (cfg.closed_note.zh || cfg.closed_note.en)
              ? cfg.closed_note : { zh: '此表單尚未開放填寫。', en: 'This form is not open yet.' }
          });
          return;
        }
        openModal(id);
      });
    });
    // ?form=xxx → 直接開
    var want = qs('form') || (location.hash.indexOf('#form-') === 0 ? location.hash.slice(6) : '');
    if (want && modalOf(want)) {
      var c = formCfg(want);
      if (c.open || FORCE_OPEN) setTimeout(function () { openModal(want); }, 200);
    }
  }

  /* ---------------- 表單：開放狀態 / 驗證 / 送出 ---------------- */

  function initForms() {
    document.querySelectorAll('.ev-form').forEach(function (panel) {
      var id = panel.getAttribute('data-form');
      var form = panel.querySelector('form');
      if (!form) return;
      var open = panel.getAttribute('data-open') === '1' || FORCE_OPEN;
      initOtherSelects(form);
      if (FORCE_OPEN) {
        form.classList.remove('is-closed');
        var sbtn = form.querySelector('button[type="submit"]');
        if (sbtn) sbtn.removeAttribute('disabled');
        var note = panel.querySelector('.form-closed');
        if (note) note.setAttribute('hidden', '');
      }
      // 這個瀏覽器已填過 → 直接顯示成功畫面（可按「再填一次」）
      var done = null;
      try { done = localStorage.getItem(storageKey(id)); } catch (e) { /* ignore */ }
      if (done) { showSuccess(panel, id, true); markButtonDone(id); }

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!open) return;
        var msg = form.querySelector('.form-msg');
        msg.className = 'form-msg';
        if (form.querySelector('.hp') && form.querySelector('.hp').value) return;  // honeypot
        var bad = validate(form);
        if (bad.length) {
          msg.className = 'form-msg err';
          msg.textContent = t('還有 ' + bad.length + ' 題未完成', bad.length + ' item(s) still required');
          popup({
            warn: true,
            title: { zh: '有欄位還沒填', en: 'Some fields are missing' },
            text: {
              zh: '還有 ' + bad.length + ' 題必填欄位尚未完成，按「知道了」後會帶你到第一個未填的題目。',
              en: bad.length + ' required item(s) are still empty. Press OK to jump to the first one.'
            }
          }).then(function () { jumpTo(bad[0]); });
          return;
        }
        var answers = collect(form, id);
        var now = Date.now();
        if (now - lastSubmit < COOLDOWN_MS) {
          msg.className = 'form-msg err';
          msg.textContent = t('送出太頻繁，請稍候再試。', 'Please wait a moment before submitting again.');
          return;
        }
        var db = window.__iimaDb;
        if (!db) {
          msg.className = 'form-msg err';
          msg.textContent = t('尚未設定資料庫（data.json widgets.firebase.databaseURL）', 'Database not configured.');
          return;
        }
        lastSubmit = now;
        msg.textContent = t('送出中…', 'Submitting…');
        var node = (isLocal() ? '_test_' : '') + id;
        var url = db + '/events/' + encodeURIComponent(CFG.slug) + '/' + node + '.json';
        var payload = {
          ts: { '.sv': 'timestamp' },
          lang: mode(),
          page: location.pathname.split('/').pop(),
          answers: answers
        };
        form.querySelector('button[type="submit"]').setAttribute('disabled', '');
        fetch(url, { method: 'POST', body: JSON.stringify(payload) })
          .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          })
          .then(function (res) {
            submitted[id] = true;
            try { localStorage.setItem(storageKey(id), String(Date.now())); } catch (err) { /* ignore */ }
            if (!isLocal()) {
              fetch(db + '/events/' + encodeURIComponent(CFG.slug) + '/counts/' + id + '.json', {
                method: 'PUT', body: JSON.stringify({ '.sv': { 'increment': 1 } })
              }).catch(function () {});
            }
            showSuccess(panel, id, false, res && res.name);
            markButtonDone(id);
            var pnl = panel.closest('.ev-modal-panel');
            if (pnl) pnl.scrollTop = 0;
          })
          .catch(function (err) {
            lastSubmit = 0;
            form.querySelector('button[type="submit"]').removeAttribute('disabled');
            msg.className = 'form-msg err';
            msg.textContent = t('送出失敗，請稍後再試（' + err.message + '）', 'Submission failed, please try again (' + err.message + ')');
            popup({
              warn: true,
              title: { zh: '送出失敗', en: 'Submission failed' },
              text: { zh: '資料沒有送出（' + err.message + '），請檢查網路後再按一次送出。', en: 'Nothing was sent (' + err.message + '). Please check your connection and submit again.' }
            });
          });
      });

      // 即時清除錯誤標記
      form.addEventListener('change', function (e) {
        var q = e.target.closest ? e.target.closest('.q') : null;
        if (q && q.classList.contains('has-err')) {
          q.classList.remove('has-err');
          q.querySelectorAll('tr.err').forEach(function (tr) { tr.classList.remove('err'); });
        }
      });
    });
  }

  /* 選了「其他」時：純文字欄要有字；下拉要選到值，自填選項還要填字 */
  function otherOk(q) {
    var sel = q.querySelector('select.other-select');
    if (sel) {
      if (!sel.value) return false;
      var opt = sel.options[sel.selectedIndex];
      if (opt && opt.getAttribute('data-free') === '1') {
        var free = q.querySelector('.other-free');
        return !!(free && free.value.trim());
      }
      return true;
    }
    var ro = q.querySelector('.other-input');
    return !(ro && !ro.value.trim());
  }

  /* 捲到缺填的題目（在 modal 面板內）並 focus 第一個輸入元件 */
  function jumpTo(q) {
    q.scrollIntoView({ behavior: 'smooth', block: 'center' });
    q.classList.remove('flash');
    void q.offsetWidth;
    q.classList.add('flash');
    var tr = q.querySelector('tr.err');
    var target = (tr && tr.querySelector('input')) ||
      q.querySelector('input[type=text], input[type=email], input[type=tel], textarea, input[type=radio], input[type=checkbox]');
    if (target) setTimeout(function () { target.focus({ preventScroll: true }); }, 350);
  }

  function markButtonDone(id) {
    // 同一表單的按鈕可能有多顆（頁首 + 活動資訊底部）
    document.querySelectorAll('[data-open-form="' + id + '"]').forEach(function (btn) {
      btn.classList.add('done');
      if (!btn.querySelector('.done-mark')) {
        var s = document.createElement('span');
        s.className = 'done-mark';
        s.textContent = '✓';
        btn.appendChild(s);
      }
    });
  }

  function collect(form, formId) {
    var out = {};
    form.querySelectorAll('.q').forEach(function (q) {
      var qid = q.getAttribute('data-qid');
      var type = q.getAttribute('data-type');
      var name = formId + '.' + qid;
      if (type === 'short' || type === 'paragraph' || type === 'email' || type === 'tel') {
        var el = q.querySelector('[name="' + name + '"]');
        out[qid] = el ? el.value.trim().slice(0, 4000) : '';
      } else if (type === 'radio') {
        var r = q.querySelector('input[type="radio"][name="' + name + '"]:checked');
        out[qid] = r ? r.value : '';
        var ov = otherValue(q, name);
        if (ov) out[qid + '__other'] = ov;
      } else if (type === 'checkbox' || type === 'consent') {
        var arr = [];
        q.querySelectorAll('input[type="checkbox"][name="' + name + '"]:checked').forEach(function (c) { arr.push(c.value); });
        out[qid] = type === 'consent' ? (arr.length > 0) : arr;
        var cv = otherValue(q, name);
        if (cv) out[qid + '__other'] = cv;
      } else if (type === 'grid') {
        var g = {};
        q.querySelectorAll('tr[data-row]').forEach(function (tr) {
          var rid = tr.getAttribute('data-row');
          var c = tr.querySelector('input[type="radio"]:checked');
          if (c) g[rid] = Number(c.value);
        });
        out[qid] = g;
      }
    });
    return out;
  }

  /* 「其他」的值：純文字欄 → 文字；下拉選單 → 選項（自填選項時為「選項：自填內容」） */
  function otherValue(q, name) {
    var sel = q.querySelector('select[name="' + name + '__other"]');
    if (sel) {
      var v = sel.value.trim();
      if (!v) return '';
      var opt = sel.options[sel.selectedIndex];
      var free = q.querySelector('[name="' + name + '__other_text"]');
      if (opt && opt.getAttribute('data-free') === '1' && free && free.value.trim()) {
        return (v + '：' + free.value.trim()).slice(0, 300);
      }
      return v.slice(0, 300);
    }
    var ro = q.querySelector('[name="' + name + '__other"]');
    return ro && ro.value.trim() ? ro.value.trim().slice(0, 300) : '';
  }

  /* 下拉「其他」選到自填選項時才顯示文字欄 */
  function initOtherSelects(form) {
    form.querySelectorAll('select.other-select').forEach(function (sel) {
      var free = sel.parentNode.querySelector('.other-free');
      var radio = sel.closest('label') && sel.closest('label').querySelector('input[type=radio], input[type=checkbox]');
      function sync() {
        var opt = sel.options[sel.selectedIndex];
        var isFree = opt && opt.getAttribute('data-free') === '1';
        if (free) { free.hidden = !isFree; if (!isFree) free.value = ''; }
        if (radio && sel.value) radio.checked = true;   // 動到下拉就等於選了「其他」
      }
      sel.addEventListener('change', sync);
      sel.addEventListener('click', function (e) { e.stopPropagation(); });
      sync();
    });
  }

  function validate(form) {
    var bad = [];
    form.querySelectorAll('.q').forEach(function (q) {
      var required = q.getAttribute('data-required') === '1';
      var type = q.getAttribute('data-type');
      var ok = true;
      if (type === 'short' || type === 'paragraph' || type === 'email' || type === 'tel') {
        var el = q.querySelector('input, textarea');
        var v = el ? el.value.trim() : '';
        if (required && !v) ok = false;
        if (v && type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) ok = false;
      } else if (type === 'radio') {
        var r = q.querySelector('input[type="radio"]:checked');
        if (required && !r) ok = false;
        if (r && r.value === '__other__' && !otherOk(q)) ok = false;
      } else if (type === 'checkbox' || type === 'consent') {
        var n = q.querySelectorAll('input[type="checkbox"]:checked').length;
        if (required && n === 0) ok = false;
        var oc = q.querySelector('input[value="__other__"]:checked');
        if (oc && !otherOk(q)) ok = false;
      } else if (type === 'grid') {
        q.querySelectorAll('tr[data-row]').forEach(function (tr) {
          var c = tr.querySelector('input[type="radio"]:checked');
          tr.classList.toggle('err', required && !c);
          if (required && !c) ok = false;
        });
      }
      q.classList.toggle('has-err', !ok);
      if (!ok) bad.push(q);
    });
    return bad;
  }

  function showSuccess(panel, id, fromCache, pushId) {
    var form = panel.querySelector('form');
    if (!form) return;
    var old = panel.querySelector('.form-success');
    if (old) old.parentNode.removeChild(old);
    var cfg = formCfg(id);
    var s = cfg.success || { zh: '已送出，謝謝！', en: 'Submitted, thank you!' };
    var box = document.createElement('div');
    box.className = 'form-success';
    var p = document.createElement('div');
    p.className = 'pair';
    var zh = document.createElement('span'); zh.className = 'zh'; zh.textContent = s.zh || '';
    var en = document.createElement('span'); en.className = 'en'; en.textContent = s.en || '';
    p.appendChild(zh); p.appendChild(en);
    box.appendChild(p);
    if (fromCache) {
      var note = document.createElement('div');
      note.className = 'pair';
      note.style.cssText = 'margin-top:8px;font-size:.85rem;opacity:.75;';
      var nz = document.createElement('span'); nz.className = 'zh'; nz.textContent = '（這個瀏覽器已經送出過此表單）';
      var ne = document.createElement('span'); ne.className = 'en'; ne.textContent = '(This browser has already submitted this form.)';
      note.appendChild(nz); note.appendChild(ne);
      box.appendChild(note);
    } else if (pushId) {
      var idEl = document.createElement('div');
      idEl.style.cssText = 'margin-top:8px;font-family:Consolas,monospace;font-size:.75rem;opacity:.6;';
      idEl.textContent = 'ID: ' + pushId;
      box.appendChild(idEl);
    }
    var actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:12px;align-items:center;margin-top:16px;flex-wrap:wrap;';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn primary';
    closeBtn.textContent = t('關閉', 'Close');
    closeBtn.addEventListener('click', function () { closeModal(id); });
    actions.appendChild(closeBtn);
    var again = document.createElement('span');
    again.className = 'again';
    again.textContent = t('再填一次', 'Fill in again');
    again.style.marginTop = '0';
    again.addEventListener('click', function () {
      try { localStorage.removeItem(storageKey(id)); } catch (e) { /* ignore */ }
      submitted[id] = false;
      box.parentNode.removeChild(box);
      form.style.display = '';
      form.reset();
      var btn = form.querySelector('button[type="submit"]');
      if (btn) btn.removeAttribute('disabled');
    });
    actions.appendChild(again);
    box.appendChild(actions);
    form.style.display = 'none';
    form.parentNode.insertBefore(box, form);
  }

  /* ---------------- 瀏覽數 / 送出筆數 ---------------- */

  function initViews(db) {
    var url = db + '/events/' + encodeURIComponent(CFG.slug) + '/views.json';
    var req = isLocal()
      ? fetch(url)
      : fetch(url, { method: 'PUT', body: JSON.stringify({ '.sv': { 'increment': 1 } }) });
    req.then(function (r) { return r.ok ? r.json() : null; })
      .then(function (n) {
        if (typeof n !== 'number') return;
        var meta = document.getElementById('evMeta');
        if (!meta) return;
        var badge = document.createElement('span');
        badge.style.cssText = 'display:inline-flex;align-items:center;gap:5px;white-space:nowrap;';
        badge.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' +
          '<span class="pair inline"><span class="zh">' + n.toLocaleString('en-US') + ' 次瀏覽</span>' +
          '<span class="en">' + n.toLocaleString('en-US') + ' views</span></span>';
        meta.appendChild(badge);
      })
      .catch(function () {});
  }

  function initCounts(db) {
    document.querySelectorAll('[data-count-form]').forEach(function (el) {
      var id = el.getAttribute('data-count-form');
      fetch(db + '/events/' + encodeURIComponent(CFG.slug) + '/counts/' + id + '.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (n) {
          if (typeof n !== 'number') return;
          el.innerHTML = '<span class="pair inline"><span class="zh">目前已有 ' + n + ' 人送出</span>' +
            '<span class="en">' + n + ' submitted so far</span></span>';
        })
        .catch(function () {});
    });
  }

  /* ================================================================
     動態點雲背景：沿用 index 的場景（與 posts/post-widgets.js 相同作法）
     ================================================================ */

  function initPostBg(w) {
    if (w && w.postBg === false) return;

    var st = document.createElement('style');
    st.textContent =
      'html{background:#050505 !important;}' +
      'body{background:transparent !important;}' +
      '#iima-bg-frame{position:fixed;inset:0;width:100%;height:100%;z-index:-1;border:0;' +
      'pointer-events:none;display:block;background:#000;}' +
      '.container{background:rgba(253,252,251,.92);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);' +
      'border-radius:16px;box-shadow:0 12px 60px rgba(0,0,0,.55);margin-top:28px;margin-bottom:56px;}' +
      '.control-bar{background:rgba(253,252,251,.82) !important;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);}' +
      '@media (max-width:600px){.container{border-radius:0;margin-top:0;}}';
    document.head.appendChild(st);

    var frame = document.createElement('iframe');
    frame.id = 'iima-bg-frame';
    frame.src = '../?bg=1';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.opacity = '0';
    frame.style.transition = 'opacity 1.2s ease';
    document.body.insertBefore(frame, document.body.firstChild);

    var chip = document.createElement('div');
    chip.id = 'iima-bg-loading';
    chip.style.cssText =
      'position:fixed;left:16px;bottom:16px;z-index:90;pointer-events:none;' +
      'font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10px;' +
      'letter-spacing:.25em;color:#ff5f00;background:rgba(0,0,0,.7);' +
      'border:1px solid rgba(255,95,0,.4);padding:8px 12px;transition:opacity .5s;';
    chip.textContent = 'LOADING POINT CLOUD… 0%';
    document.body.appendChild(chip);

    var dismissed = false;
    function dismiss(showBg) {
      if (showBg) frame.style.opacity = '1';
      if (dismissed) return;
      dismissed = true;
      chip.style.opacity = '0';
      setTimeout(function () { if (chip.parentNode) chip.parentNode.removeChild(chip); }, 550);
    }
    setTimeout(function () { dismiss(false); }, 30000);
    frame.addEventListener('error', function () { dismiss(false); });

    window.addEventListener('message', function (e) {
      var d = e.data || {};
      if (d.type === 'iima-bg-progress') {
        var v = Math.max(0, Math.min(100, d.p || 0));
        if (!dismissed) chip.textContent = 'LOADING POINT CLOUD… ' + v + '%';
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
