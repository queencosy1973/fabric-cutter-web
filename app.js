/**
 * Main Application Controller for Fabric Roll & Outsource Cutter Monitor (app.js)
 * Connects BOM (Yards) -> Roll Conversion (50 Yards = 1 Roll) -> Outsource Cutter Loop -> Stock Movement Sync
 */

(function () {
  'use strict';

  const store = window.FabricStore;
  const YARDS_PER_ROLL = store.YARDS_PER_ROLL; // 50

  // Custom override map for actual rolls to send per fabric in Tab 1
  let customRollsOverride = {};
  let stockSearchQuery = '';
  let stockSeriesFilter = 'ALL';
  let batchStatusFilter = 'ALL';
  let bomRefSearchQuery = '';

  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  function fmt(val, dec = 2) {
    const n = Number(val || 0);
    return n.toLocaleString('th-TH', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    });
  }

  function showToast(msg, icon = '✅') {
    const toast = $('toast');
    if (!toast) return;
    $('toast-icon').textContent = icon;
    $('toast-msg').textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3200);
  }

  function init() {
    if (window.location.protocol === 'file:') {
      if ($('link-stock-movement')) $('link-stock-movement').href = '../stock-movement-app/index.html';
      if ($('link-bom-planner')) $('link-bom-planner').href = '../bom-planner-web/index.html';
    }
    populateSkuDatalist();
    populateInboundFabricSelect();
    setupEventListeners();
    if (window.AdminRoutineController) {
      window.AdminRoutineController.init(store);
    }
    renderAll();

    store.subscribe(() => {
      renderAll();
    });

    store.onCloudStatusChange((status, message) => {
      const badge = $('sync-status-badge');
      const dot = $('sync-status-dot');
      const text = $('sync-status-text');
      if (!badge || !dot || !text) return;

      text.textContent = message;
      if (status === 'online') {
        badge.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-950/90 text-emerald-300 border border-emerald-700/60';
        dot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
      } else if (status === 'syncing' || status === 'connecting') {
        badge.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-950/90 text-indigo-300 border border-indigo-700/60';
        dot.className = 'w-2 h-2 rounded-full bg-indigo-400 animate-ping';
      } else {
        badge.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-950/90 text-amber-300 border border-amber-700/60';
        dot.className = 'w-2 h-2 rounded-full bg-amber-400';
      }
    });
  }

  function populateSkuDatalist() {
    const datalist = $('sku-fabric-datalist');
    if (!datalist) return;
    const skus = store.getAllFabricSkus();
    datalist.innerHTML = skus.map(item =>
      `<option value="${item.sku}">ใช้ผ้า ${item.fabricName} (${item.yardsPerUnit} หลา/ตัว | 1 ม้วนตัดได้ ~${item.piecesPerRoll} ตัว)</option>`
    ).join('');
  }

  function populateInboundFabricSelect() {
    const select = $('inbound-fabric-select');
    if (!select) return;
    const fabrics = store.getComputedFabricStocks();
    select.innerHTML = fabrics.map(f =>
      `<option value="${f.name}">${f.name} (คงเหลือคลัง: ${fmt(f.warehouseRolls, 2)} ม้วน = ${fmt(f.warehouseYards, 0)} หลา)</option>`
    ).join('');
  }

  function switchTab(tabId) {
    $$('.tab-btn').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    $$('.tab-pane').forEach(pane => {
      if (pane.id === tabId) {
        pane.classList.remove('hidden');
      } else {
        pane.classList.add('hidden');
      }
    });
  }

  function renderAll() {
    populateInboundFabricSelect();
    renderTopKpis();
    renderWeeklyPlanTab();
    renderReturnVerifyTab();
    renderFabricStockTab();
    renderCutterLedgerTab();
    if (window.AdminRoutineController) {
      window.AdminRoutineController.renderAll();
    }
  }
  window.switchFabricTab = switchTab;

  // =========================================================
  // TOP 4 KPI CARDS
  // =========================================================
  function renderTopKpis() {
    const fabrics = store.getComputedFabricStocks();
    const totalWhRolls = fabrics.reduce((s, f) => s + f.warehouseRolls, 0);
    const totalWhYards = fabrics.reduce((s, f) => s + f.warehouseYards, 0);
    const lowStockCount = fabrics.filter(f => f.status !== 'OK').length;

    $('kpi-warehouse-rolls').textContent = fmt(totalWhRolls, 2);
    $('kpi-warehouse-yards').textContent = fmt(totalWhYards, 0);

    const lowBadge = $('kpi-low-stock-badge');
    if (lowStockCount > 0) {
      lowBadge.textContent = `⚠️ ใกล้หมด/ขาด ${lowStockCount} สี`;
      lowBadge.className = 'text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700';
    } else {
      lowBadge.textContent = '✅ สต็อกพร้อมทุกสี';
      lowBadge.className = 'text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700';
    }

    // Weekly Plan KPIs
    const calc = store.calculateWeeklyRollRequirements(customRollsOverride);
    $('kpi-plan-skus-badge').textContent = `${store.state.weeklyPlan.length} รายการ (${calc.summary.totalUnitsPlanned} ตัว)`;
    $('kpi-plan-yards').textContent = fmt(calc.summary.totalGrossYards, 1);
    $('kpi-plan-rolls-send').textContent = fmt(calc.summary.totalActualRollsToSend, 0);
    $('kpi-plan-exact-rolls').textContent = fmt(calc.summary.totalGrossExactRolls, 2);

    // Cutter Remnant Balance KPIs
    const totalCutterYards = fabrics.reduce((s, f) => s + f.cutterYards, 0);
    const totalCutterRolls = totalCutterYards / YARDS_PER_ROLL;
    $('kpi-cutter-yards').textContent = fmt(totalCutterYards, 1);
    $('kpi-cutter-rolls').textContent = fmt(totalCutterRolls, 2);

    // Return Verification KPIs
    let plannedSets = 0;
    let returnedSets = 0;
    let openBatches = 0;
    store.state.cuttingBatches.forEach(b => {
      if (b.status !== 'COMPLETED') openBatches++;
      (b.skuItems || []).forEach(it => {
        plannedSets += it.plannedQty;
        returnedSets += it.returnedQty;
      });
    });
    const pendingSets = Math.max(0, plannedSets - returnedSets);

    $('kpi-returned-sets').textContent = fmt(returnedSets, 0);
    $('kpi-planned-sets').textContent = fmt(plannedSets, 0);
    $('kpi-pending-sets').textContent = fmt(pendingSets, 0);
    $('kpi-open-batches-badge').textContent = openBatches > 0 ? `⏳ ค้างส่ง ${openBatches} ใบสั่งตัด` : '✅ รับครบทุกใบงาน';
    $('nav-badge-pending').textContent = pendingSets;
  }

  // =========================================================
  // TAB 1: WEEKLY PLAN & ROLL DISPATCH CALCULATOR
  // =========================================================
  function renderWeeklyPlanTab() {
    const planTbody = $('weekly-plan-tbody');
    const calcTbody = $('roll-calc-tbody');

    if (store.state.weeklyPlan.length === 0) {
      planTbody.innerHTML = `
        <tr>
          <td colspan="9" class="py-8 text-center text-slate-400">
            ยังไม่มีรายการในแผนผลิตรายสัปดาห์ • สามารถเพิ่มรุ่นด้านบน, กดดึงแผนจาก BOM Planner, หรืออัปโหลดไฟล์ออเดอร์ Excel ได้เลยครับ
          </td>
        </tr>
      `;
    } else {
      planTbody.innerHTML = store.state.weeklyPlan.map(row => {
        const exactRolls = row.totalYards / YARDS_PER_ROLL;
        const seriesInfo = window.getFabricSeriesInfo(row.fabricName);
        return `
          <tr class="hover:bg-slate-50/80 transition">
            <td class="py-2.5 px-3 font-semibold text-indigo-700">${row.dayOfWeek}</td>
            <td class="py-2.5 px-3 font-bold text-slate-900">${row.sku}</td>
            <td class="py-2.5 px-3">
              <span class="px-2 py-0.5 rounded-md text-[11px] font-semibold ${seriesInfo.badgeClass}">
                ${row.fabricName}
              </span>
            </td>
            <td class="py-2.5 px-3 text-right font-medium text-slate-700">${fmt(row.yardsPerUnit, 2)} หลา</td>
            <td class="py-2.5 px-3 text-center">
              <input type="number" min="1" value="${row.quantity}" data-plan-qty-id="${row.id}"
                class="w-20 px-2 py-1 text-center font-bold border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500">
            </td>
            <td class="py-2.5 px-3 text-right font-bold text-indigo-700">${fmt(row.totalYards, 1)} หลา</td>
            <td class="py-2.5 px-3 text-right text-slate-600">${fmt(exactRolls, 2)} ม้วน</td>
            <td class="py-2.5 px-3 text-slate-500">${row.note || '-'}</td>
            <td class="py-2.5 px-3 text-center">
              <button data-remove-plan-id="${row.id}" class="text-rose-500 hover:text-rose-700 font-bold px-2 py-1 rounded hover:bg-rose-50">
                ✕
              </button>
            </td>
          </tr>
        `;
      }).join('');

      planTbody.querySelectorAll('[data-plan-qty-id]').forEach(inp => {
        inp.addEventListener('change', e => {
          const id = e.target.getAttribute('data-plan-qty-id');
          store.updateWeeklyPlanQuantity(id, e.target.value);
        });
      });

      planTbody.querySelectorAll('[data-remove-plan-id]').forEach(btn => {
        btn.addEventListener('click', e => {
          const id = e.currentTarget.getAttribute('data-remove-plan-id');
          store.removeWeeklyPlanItem(id);
        });
      });
    }

    // Render Roll Calculation Table
    const calc = store.calculateWeeklyRollRequirements(customRollsOverride);
    if (calc.items.length === 0) {
      calcTbody.innerHTML = `
        <tr>
          <td colspan="9" class="py-8 text-center text-slate-400">
            เพิ่มรายการผลิตด้านบนเพื่อคำนวณการแปลงหลาเป็นม้วน (50 หลา = 1 ม้วน)
          </td>
        </tr>
      `;
      return;
    }

    calcTbody.innerHTML = calc.items.map(item => {
      const isShortage = item.shortageRolls > 0;
      const stockBadge = isShortage
        ? `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 border border-rose-300">❌ ขาด ${fmt(item.shortageRolls, 1)} ม้วน (${fmt(item.shortageYards, 0)} หลา)</span>`
        : `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">✅ พอส่ง (เหลือ ${fmt(item.remainingWarehouseRolls, 1)} ม้วน)</span>`;

      const skuSummaryText = item.skusBreakdown.map(s => `${s.sku.replace(/^Qs-/, '')} (${s.quantity} ตัว)`).join(', ');

      return `
        <tr class="hover:bg-indigo-50/30 transition">
          <td class="py-3 px-3">
            <div class="font-bold text-slate-900 text-sm">${item.fabricName}</div>
            <div class="text-[11px] text-slate-500 mt-0.5 max-w-xs truncate" title="${skuSummaryText}">
              ${skuSummaryText}
            </div>
          </td>
          <td class="py-3 px-3 text-center font-bold text-slate-800">
            ${fmt(item.totalUnitsPlanned, 0)} ชุด
          </td>
          <td class="py-3 px-3 text-right">
            <div class="font-bold text-slate-900">${fmt(item.grossYards, 1)} หลา</div>
            <div class="text-[11px] text-slate-500">= ${fmt(item.grossExactRolls, 2)} ม้วน</div>
          </td>
          <td class="py-3 px-3 text-right bg-amber-50/60">
            <div class="font-bold text-amber-800">-${fmt(item.usedFromCutterYards, 1)} หลา</div>
            <div class="text-[11px] text-amber-600">(มีค้างที่ช่าง ${fmt(item.cutterAvailableYards, 1)} หลา)</div>
          </td>
          <td class="py-3 px-3 text-right">
            <div class="font-bold text-indigo-700">${fmt(item.netYardsNeeded, 1)} หลา</div>
            <div class="text-[11px] text-indigo-500">= ${fmt(item.netExactRolls, 2)} ม้วน (ปัดขึ้น ${item.suggestedWholeRolls} ม้วน)</div>
          </td>
          <td class="py-3 px-3 text-center bg-indigo-50/70">
            <div class="flex flex-col items-center gap-1">
              <div class="flex items-center gap-1">
                <input type="number" step="1" min="0" value="${item.actualRollsToSend}" data-override-roll-fabric="${item.fabricName}"
                  class="w-20 px-2 py-1.5 text-center font-bold text-sm text-indigo-900 bg-white border-2 border-indigo-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600">
                <span class="font-bold text-indigo-900">ม้วน</span>
              </div>
              <span class="text-[11px] font-semibold text-indigo-700">(${fmt(item.yardsToSend, 0)} หลา)</span>
            </div>
          </td>
          <td class="py-3 px-3 text-right">
            <div class="font-bold text-slate-800">${fmt(item.warehouseRolls, 2)} ม้วน</div>
            <div class="text-[11px] text-slate-500">(${fmt(item.warehouseYards, 0)} หลา)</div>
          </td>
          <td class="py-3 px-3 text-center">
            ${stockBadge}
            ${isShortage ? `
              <div class="mt-1">
                <button data-quick-in-fabric="${item.fabricName}" data-quick-in-rolls="${Math.ceil(item.shortageRolls)}"
                  class="text-[11px] font-semibold text-emerald-700 underline hover:text-emerald-900">
                  + รับผ้าเข้าด่วน ${Math.ceil(item.shortageRolls)} ม้วน
                </button>
              </div>
            ` : ''}
          </td>
          <td class="py-3 px-3 text-right bg-emerald-50/50">
            <div class="font-bold ${item.expectedNewCutterBalanceYards >= 0 ? 'text-emerald-800' : 'text-rose-600'}">
              ${fmt(item.expectedNewCutterBalanceYards, 1)} หลา
            </div>
            <div class="text-[11px] text-emerald-600">(${fmt(item.expectedNewCutterBalanceRolls, 2)} ม้วน)</div>
          </td>
        </tr>
      `;
    }).join('');

    calcTbody.querySelectorAll('[data-override-roll-fabric]').forEach(inp => {
      inp.addEventListener('change', e => {
        const fname = e.target.getAttribute('data-override-roll-fabric');
        customRollsOverride[fname] = Math.max(0, Number(e.target.value || 0));
        renderAll();
      });
    });

    calcTbody.querySelectorAll('[data-quick-in-fabric]').forEach(btn => {
      btn.addEventListener('click', e => {
        const fname = e.currentTarget.getAttribute('data-quick-in-fabric');
        const rolls = Number(e.currentTarget.getAttribute('data-quick-in-rolls') || 5);
        switchTab('tab-fabric-stock');
        $('inbound-fabric-select').value = fname;
        $('inbound-rolls-input').value = rolls;
        $('inbound-yards-input').value = rolls * YARDS_PER_ROLL;
        $('inbound-rolls-input').focus();
      });
    });
  }

  // =========================================================
  // TAB 2: CUT-PIECE RETURN VERIFICATION LOOP
  // =========================================================
  function renderReturnVerifyTab() {
    const container = $('cutting-batches-container');
    let batches = store.state.cuttingBatches || [];

    if (batchStatusFilter === 'PENDING') {
      batches = batches.filter(b => b.status !== 'COMPLETED');
    } else if (batchStatusFilter === 'COMPLETED') {
      batches = batches.filter(b => b.status === 'COMPLETED');
    }

    if (batches.length === 0) {
      container.innerHTML = `
        <div class="p-10 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-400 text-sm">
          ไม่พบใบสั่งตัดในสถานะที่เลือก
        </div>
      `;
      return;
    }

    container.innerHTML = batches.map(batch => {
      const totalPlannedSets = (batch.skuItems || []).reduce((s, i) => s + i.plannedQty, 0);
      const totalReturnedSets = (batch.skuItems || []).reduce((s, i) => s + i.returnedQty, 0);
      const pendingSets = Math.max(0, totalPlannedSets - totalReturnedSets);
      const pct = totalPlannedSets > 0 ? Math.round((totalReturnedSets / totalPlannedSets) * 100) : 0;

      let badgeHtml = `<span class="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">⏳ กำลังตัด / ส่งกลับบางส่วน (${pct}%)</span>`;
      if (batch.status === 'COMPLETED') {
        badgeHtml = `<span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">✅ ตรวจรับผ้าตัดกลับมาครบ 100% แล้ว</span>`;
      } else if (totalReturnedSets === 0) {
        badgeHtml = `<span class="px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">🚚 ส่งม้วนผ้าแล้ว รอช่างส่งงานตัดกลับ</span>`;
      }

      const rollsSummaryHtml = (batch.rollDispatches || []).map(rd => `
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs">
          <span class="font-bold text-slate-900">${rd.fabricName}:</span>
          <span class="text-indigo-700 font-semibold">ส่ง ${rd.rollsSent} ม้วน (${rd.yardsSent} หลา)</span>
          <span class="text-slate-400">|</span>
          <span class="text-slate-600">ใช้ตัดตามรุ่น ${rd.grossYardsNeeded} หลา</span>
          <span class="text-slate-400">|</span>
          <span class="text-amber-700 font-medium">เศษเหลือที่ช่าง ${rd.expectedRemnantYards} หลา</span>
        </div>
      `).join('');

      const rowsHtml = (batch.skuItems || []).map(item => {
        const rem = Math.max(0, item.plannedQty - item.returnedQty);
        const itemPct = item.plannedQty > 0 ? Math.round((item.returnedQty / item.plannedQty) * 100) : 0;
        const isDone = rem === 0;
        const totalYardsPlanned = item.plannedQty * item.yardsPerUnit;
        const totalYardsReturned = item.returnedQty * item.yardsPerUnit;

        return `
          <tr class="hover:bg-slate-50 transition">
            <td class="py-3 px-3">
              <div class="font-bold text-slate-900">${item.sku}</div>
              ${item.history && item.history.length > 0 ? `
                <div class="text-[11px] text-slate-400 mt-0.5">
                  ล่าสุด: ${item.history[0].date} — ${item.history[0].note}
                </div>
              ` : ''}
            </td>
            <td class="py-3 px-3 font-semibold text-indigo-700">${item.fabricName}</td>
            <td class="py-3 px-3 text-right">${fmt(item.yardsPerUnit, 2)} หลา/ชุด</td>
            <td class="py-3 px-3 text-center font-bold text-slate-800">
              ${item.plannedQty} ชุด
              <div class="text-[10px] font-normal text-slate-400">(${fmt(totalYardsPlanned, 1)} หลา)</div>
            </td>
            <td class="py-3 px-3 text-center font-bold text-emerald-700">
              ${item.returnedQty} ชุด
              <div class="text-[10px] font-normal text-emerald-600">(${fmt(totalYardsReturned, 1)} หลา)</div>
            </td>
            <td class="py-3 px-3 text-center font-bold ${rem > 0 ? 'text-rose-600' : 'text-slate-400'}">
              ${rem > 0 ? `ค้าง ${rem} ชุด` : 'ครบแล้ว'}
            </td>
            <td class="py-3 px-3 w-44">
              <div class="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div class="${isDone ? 'bg-emerald-500' : 'bg-indigo-600'} h-full transition-all" style="width:${itemPct}%"></div>
              </div>
              <div class="text-[10px] text-right text-slate-500 mt-0.5">${itemPct}% (${item.returnedQty}/${item.plannedQty})</div>
            </td>
            <td class="py-3 px-3 text-center">
              ${!isDone ? `
                <button data-open-return-batch="${batch.batchId}" data-open-return-item="${item.itemId}"
                  class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-2xs transition">
                  + รับผ้าตัดส่งกลับ
                </button>
              ` : `
                <span class="text-xs font-bold text-emerald-600">✅ ครบแล้ว</span>
              `}
            </td>
          </tr>
        `;
      }).join('');

      return `
        <div class="border-2 ${batch.status === 'COMPLETED' ? 'border-emerald-200 bg-emerald-50/10' : 'border-indigo-200 bg-white'} rounded-2xl p-5 space-y-4 shadow-xs">
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <div class="flex items-center gap-2.5 flex-wrap">
                <span class="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-bold text-xs">${batch.batchId}</span>
                <h3 class="text-base font-bold text-slate-900">${batch.weekLabel}</h3>
                ${badgeHtml}
              </div>
              <p class="text-xs text-slate-500 mt-1">
                👷 ผู้รับงานตัด: <strong>${batch.cutterName}</strong> • วันที่ส่งผ้า: ${batch.createdDate}
                ${batch.note ? ` • หมายเหตุ: ${batch.note}` : ''}
              </p>
            </div>
            <div class="flex items-center gap-2 flex-wrap no-print">
              ${pendingSets > 0 ? `
                <button data-receive-all-batch="${batch.batchId}" class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow transition">
                  ✅ รับครบทุกรุ่นในคลิกเดียว (อีก ${pendingSets} ชุด)
                </button>
              ` : ''}
              <button onclick="window.print()" class="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition">
                🖨️ พิมพ์ใบตรวจรับ
              </button>
            </div>
          </div>

          <div class="space-y-1.5">
            <div class="text-[11px] font-semibold text-slate-500 uppercase">สรุปม้วนผ้าที่เบิกส่งให้ช่างในใบงานนี้:</div>
            <div class="flex flex-wrap gap-2">
              ${rollsSummaryHtml}
            </div>
          </div>

          <div class="overflow-x-auto border border-slate-200 rounded-xl bg-white">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-slate-100 text-slate-600 text-[11px] uppercase border-b border-slate-200">
                  <th class="py-2.5 px-3">รุ่นสินค้าที่สั่งตัด (SKU)</th>
                  <th class="py-2.5 px-3">รหัสผ้า</th>
                  <th class="py-2.5 px-3 text-right">ใช้ผ้า/ชุด</th>
                  <th class="py-2.5 px-3 text-center">สั่งตัดทั้งหมด</th>
                  <th class="py-2.5 px-3 text-center">ช่างส่งกลับแล้ว</th>
                  <th class="py-2.5 px-3 text-center">ยอดค้างส่ง</th>
                  <th class="py-2.5 px-3">ความคืบหน้า</th>
                  <th class="py-2.5 px-3 text-center no-print">ตรวจรับงาน</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 text-xs">
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-open-return-batch]').forEach(btn => {
      btn.addEventListener('click', e => {
        const batchId = e.currentTarget.getAttribute('data-open-return-batch');
        const itemId = e.currentTarget.getAttribute('data-open-return-item');
        openReturnModal(batchId, itemId);
      });
    });

    container.querySelectorAll('[data-receive-all-batch]').forEach(btn => {
      btn.addEventListener('click', e => {
        const batchId = e.currentTarget.getAttribute('data-receive-all-batch');
        if (confirm(`ยืนยันตรวจรับชุดผ้าที่ตัดเสร็จครบทุกรุ่นในใบงาน ${batchId} ใช่หรือไม่?`)) {
          store.receiveAllRemainingInBatch(batchId);
          showToast(`ตรวจรับชุดผ้าใบงาน ${batchId} ครบ 100% เรียบร้อยแล้ว!`);
        }
      });
    });
  }

  // =========================================================
  // TAB 3: FABRIC STOCK & INBOUND MONITOR (SYNC STOCK MOVEMENT)
  // =========================================================
  function renderFabricStockTab() {
    const tbody = $('fabric-stock-tbody');
    const txTbody = $('fabric-tx-tbody');

    let fabrics = store.getComputedFabricStocks();

    if (stockSeriesFilter === 'LOW') {
      fabrics = fabrics.filter(f => f.status !== 'OK');
    } else if (stockSeriesFilter !== 'ALL') {
      fabrics = fabrics.filter(f => f.series === stockSeriesFilter);
    }

    if (stockSearchQuery) {
      fabrics = fabrics.filter(f => f.name.toLowerCase().includes(stockSearchQuery));
    }

    tbody.innerHTML = fabrics.map(f => {
      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-3 px-3 font-bold text-slate-900">${f.name}</td>
          <td class="py-3 px-3">
            <span class="px-2 py-0.5 rounded-md text-[10px] font-semibold ${f.seriesBadge}">${f.seriesLabel}</span>
          </td>
          <td class="py-3 px-3 text-right text-slate-600">
            ${fmt(f.initRolls + f.inRolls, 2)} ม้วน
          </td>
          <td class="py-3 px-3 text-right text-rose-600 font-medium">
            ${f.outRolls > 0 ? `-${fmt(f.outRolls, 2)} ม้วน` : '0.00 ม้วน'}
          </td>
          <td class="py-3 px-3 text-right bg-indigo-50/40 font-bold text-base text-indigo-900">
            ${fmt(f.warehouseRolls, 2)} ม้วน
          </td>
          <td class="py-3 px-3 text-right bg-indigo-50/40 font-semibold text-indigo-700">
            ${fmt(f.warehouseYards, 0)} หลา
          </td>
          <td class="py-3 px-3 text-right bg-amber-50/40">
            <span class="font-bold text-amber-800">${fmt(f.cutterYards, 1)} หลา</span>
            <span class="text-[11px] text-amber-600 block">(${fmt(f.cutterRolls, 2)} ม้วน)</span>
          </td>
          <td class="py-3 px-3 text-center">
            <span class="px-2.5 py-1 rounded-full text-[11px] font-semibold border ${f.statusBadge}">
              ${f.statusLabel}
            </span>
          </td>
          <td class="py-3 px-3 text-center">
            <div class="flex items-center justify-center gap-1.5">
              <button data-fill-inbound="${f.name}" class="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold text-[11px]">
                + รับเข้า
              </button>
              <button data-adjust-wh="${f.name}" data-current-rolls="${f.warehouseRolls}" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px]">
                ปรับยอด
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('[data-fill-inbound]').forEach(btn => {
      btn.addEventListener('click', e => {
        const fname = e.currentTarget.getAttribute('data-fill-inbound');
        $('inbound-fabric-select').value = fname;
        $('inbound-rolls-input').focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    tbody.querySelectorAll('[data-adjust-wh]').forEach(btn => {
      btn.addEventListener('click', e => {
        const fname = e.currentTarget.getAttribute('data-adjust-wh');
        const curRolls = Number(e.currentTarget.getAttribute('data-current-rolls') || 0);
        const input = prompt(
          `ปรับปรุงสต็อกผ้าในคลังสำหรับ "${fname}"\n` +
          `ปัจจุบันในคลังมี: ${curRolls} ม้วน (${curRolls * YARDS_PER_ROLL} หลา)\n\n` +
          `กรุณาระบุจำนวนม้วนที่นับได้จริงในคลัง (1 ม้วน = 50 หลา):`,
          curRolls
        );
        if (input === null) return;
        const newRolls = parseFloat(input);
        if (isNaN(newRolls) || newRolls < 0) {
          alert('กรุณาระบุตัวเลขที่ถูกต้อง');
          return;
        }
        const diff = Math.round((newRolls - curRolls) * 100) / 100;
        if (diff === 0) return;
        store.adjustWarehouseRolls({
          fabricName: fname,
          diffRolls: diff,
          note: `ตรวจนับจริงปรับจาก ${curRolls} เป็น ${newRolls} ม้วน`
        });
        showToast(`ปรับปรุงสต็อก ${fname} เป็น ${newRolls} ม้วน (${newRolls * YARDS_PER_ROLL} หลา) และซิงค์เข้า Stock Movement แล้ว`);
      });
    });

    // Render Recent Transactions
    const txs = store.getFabricTransactions();
    if (txs.length === 0) {
      txTbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-400">ยังไม่มีประวัติความเคลื่อนไหวของหมวดผ้าม้วน</td></tr>`;
    } else {
      txTbody.innerHTML = txs.slice(0, 40).map(t => {
        let badge = `<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">รับเข้า (IN)</span>`;
        let sign = '+';
        let color = 'text-emerald-700';
        if (t.txType === 'OUT') {
          badge = `<span class="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px]">ส่งช่างตัด (OUT)</span>`;
          sign = '-';
          color = 'text-rose-600';
        } else if (t.txType === 'ADJUST') {
          badge = `<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">ปรับสต็อก (ADJ)</span>`;
          sign = t.rolls > 0 ? '+' : '';
          color = 'text-amber-700';
        }
        return `
          <tr class="hover:bg-slate-50">
            <td class="py-2 px-3 font-mono text-[11px] text-slate-500">${t.id}</td>
            <td class="py-2 px-3 text-slate-600">${t.date}</td>
            <td class="py-2 px-3">${badge}</td>
            <td class="py-2 px-3 font-bold text-slate-900">${t.productName}</td>
            <td class="py-2 px-3 text-right font-bold ${color}">${sign}${fmt(t.rolls, 2)} ม้วน</td>
            <td class="py-2 px-3 text-right font-medium text-slate-600">${sign}${fmt(t.yards, 0)} หลา</td>
            <td class="py-2 px-3 text-slate-600">${t.detail}</td>
          </tr>
        `;
      }).join('');
    }
  }

  // =========================================================
  // TAB 4: CUTTER BALANCE LEDGER & MASTER FABRIC BOM
  // =========================================================
  function renderCutterLedgerTab() {
    const balTbody = $('cutter-balance-tbody');
    const ledgerList = $('cutter-ledger-list');
    const bomRefTbody = $('bom-fabric-ref-tbody');

    const fabrics = store.getComputedFabricStocks();
    // Sort those with active cutter balance or sent history to top
    const sortedFabrics = [...fabrics].sort((a, b) => {
      const cbA = store.state.cutterBalance[a.name]?.balanceYards || 0;
      const cbB = store.state.cutterBalance[b.name]?.balanceYards || 0;
      return cbB - cbA;
    });

    balTbody.innerHTML = sortedFabrics.map(f => {
      const cb = store.state.cutterBalance[f.name] || { balanceYards: 0, totalSentRolls: 0, totalSentYards: 0, totalUsedYards: 0 };
      const rollsEq = cb.balanceYards / YARDS_PER_ROLL;
      return `
        <tr class="hover:bg-slate-50">
          <td class="py-2.5 px-3 font-bold text-slate-900">${f.name}</td>
          <td class="py-2.5 px-3 text-right text-slate-700">
            ${fmt(cb.totalSentRolls, 1)} ม้วน
            <span class="text-[10px] text-slate-400 block">(${fmt(cb.totalSentYards, 0)} หลา)</span>
          </td>
          <td class="py-2.5 px-3 text-right text-slate-700">${fmt(cb.totalUsedYards, 1)} หลา</td>
          <td class="py-2.5 px-3 text-right bg-amber-50/60">
            <span class="font-bold text-amber-900">${fmt(cb.balanceYards, 1)} หลา</span>
            <span class="text-[10px] text-amber-700 block">(${fmt(rollsEq, 2)} ม้วน)</span>
          </td>
          <td class="py-2.5 px-3 text-center">
            <button data-open-adjust-cutter="${f.name}" data-current-cutter-yards="${cb.balanceYards}"
              class="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold text-[11px]">
              ⚖️ ปรับยอด/รับคืน
            </button>
          </td>
        </tr>
      `;
    }).join('');

    balTbody.querySelectorAll('[data-open-adjust-cutter]').forEach(btn => {
      btn.addEventListener('click', e => {
        const fname = e.currentTarget.getAttribute('data-open-adjust-cutter');
        const curYards = e.currentTarget.getAttribute('data-current-cutter-yards');
        openAdjustCutterModal(fname, curYards);
      });
    });

    // Cutter Ledger List
    const logs = store.state.cutterLedger || [];
    if (logs.length === 0) {
      ledgerList.innerHTML = `<div class="p-6 text-center text-slate-400 text-xs">ยังไม่มีประวัติความเคลื่อนไหวที่ช่างนอก</div>`;
    } else {
      ledgerList.innerHTML = logs.map(l => `
        <div class="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1 text-xs">
          <div class="flex items-center justify-between">
            <span class="font-bold text-slate-900">${l.fabricName}</span>
            <span class="text-[11px] text-slate-400">${l.date} • ${l.refBatch || ''}</span>
          </div>
          <p class="text-slate-600">${l.note}</p>
          <div class="text-[11px] font-semibold text-amber-700">
            ➔ ยอดผ้าสะสมคงเหลือที่ช่าง: ${fmt(l.netBalanceAfter, 1)} หลา (${fmt(l.netBalanceAfter / YARDS_PER_ROLL, 2)} ม้วน)
          </div>
        </div>
      `).join('');
    }

    // Master BOM Fabric Reference
    let allSkus = store.getAllFabricSkus();
    if (bomRefSearchQuery) {
      allSkus = allSkus.filter(s =>
        s.sku.toLowerCase().includes(bomRefSearchQuery) ||
        s.fabricName.toLowerCase().includes(bomRefSearchQuery)
      );
    }

    bomRefTbody.innerHTML = allSkus.map(s => {
      const rollFraction = s.yardsPerUnit / YARDS_PER_ROLL;
      const fullPiecesPerRoll = Math.floor(YARDS_PER_ROLL / s.yardsPerUnit);
      const leftoverYardsPerRoll = Math.round((YARDS_PER_ROLL - fullPiecesPerRoll * s.yardsPerUnit) * 100) / 100;
      return `
        <tr class="hover:bg-slate-50">
          <td class="py-2 px-3 font-semibold text-slate-900">${s.sku}</td>
          <td class="py-2 px-3 font-medium text-indigo-700">${s.fabricName}</td>
          <td class="py-2 px-3 text-right font-bold text-slate-800">${fmt(s.yardsPerUnit, 2)} หลา</td>
          <td class="py-2 px-3 text-right text-slate-500">${fmt(rollFraction, 3)} ม้วน/ตัว</td>
          <td class="py-2 px-3 text-right bg-indigo-50/40 font-semibold text-indigo-900">
            ตัดได้ ${fullPiecesPerRoll} ชุดเต็ม
            ${leftoverYardsPerRoll > 0 ? `<span class="text-[11px] text-amber-700">(เหลือเศษ ${leftoverYardsPerRoll} หลา/ม้วน)</span>` : ''}
          </td>
        </tr>
      `;
    }).join('');
  }

  // =========================================================
  // MODALS & INTERACTIONS
  // =========================================================
  function openDispatchModal() {
    if (store.state.weeklyPlan.length === 0) {
      alert('กรุณาเพิ่มรายการในแผนผลิตรายสัปดาห์ก่อนเปิดใบสั่งตัด');
      return;
    }

    const calc = store.calculateWeeklyRollRequirements(customRollsOverride);
    const todayStr = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    $('modal-dispatch-week-label').value = `ใบสั่งตัดผ้าช่างนอกประจำสัปดาห์ (${todayStr})`;
    $('modal-dispatch-note').value = '';

    $('modal-dispatch-summary-box').innerHTML = `
      <div class="font-bold text-indigo-900 mb-1">สรุปยอดเบิกม้วนผ้าส่งช่างนอกในรอบนี้:</div>
      <div>• จำนวนรุ่นที่สั่งตัด: <strong>${store.state.weeklyPlan.length} รายการ (รวม ${calc.summary.totalUnitsPlanned} ชุด)</strong></div>
      <div>• ยอดใช้ผ้าตาม BOM รวม: <strong>${fmt(calc.summary.totalGrossYards, 1)} หลา</strong> (หักเศษผ้าค้างที่ช่าง <strong>-${fmt(calc.summary.totalCutterDeductedYards, 1)} หลา</strong>)</div>
      <div>• จำนวนม้วนเต็มที่ตัดสต็อกส่งช่างจริง: <strong class="text-sm text-fuchsia-700">${calc.summary.totalActualRollsToSend} ม้วน (${fmt(calc.summary.totalYardsToSend, 0)} หลา)</strong></div>
      <div class="text-[11px] text-emerald-700 pt-1">✅ ระบบจะตัดสต็อกหมวด "ผ้าม้วน" ใน Stock Movement อัตโนมัติทันที</div>
    `;

    $('modal-dispatch-batch').classList.remove('hidden');
  }

  function openReturnModal(batchId, itemId) {
    const batch = store.state.cuttingBatches.find(b => b.batchId === batchId);
    if (!batch) return;
    const item = batch.skuItems.find(i => i.itemId === itemId);
    if (!item) return;

    const remaining = Math.max(1, item.plannedQty - item.returnedQty);
    $('return-modal-batch-id').value = batchId;
    $('return-modal-item-id').value = itemId;
    $('return-modal-sku-name').textContent = item.sku;
    $('return-modal-progress-text').textContent = `สั่งตัด ${item.plannedQty} ชุด | ส่งกลับแล้ว ${item.returnedQty} ชุด | ค้างส่งอีก ${remaining} ชุด`;
    $('return-modal-qty').value = remaining;
    $('return-modal-qty').max = remaining;
    $('return-modal-note').value = '';

    $('modal-return-piece').classList.remove('hidden');
  }

  function openAdjustCutterModal(fabricName, currentYards) {
    $('adjust-cutter-fabric-name').value = fabricName;
    $('adjust-cutter-title').textContent = fabricName;
    $('adjust-cutter-yards-input').value = Number(currentYards || 0);
    $('adjust-cutter-return-rolls').value = 0;
    $('adjust-cutter-note').value = '';
    $('modal-adjust-cutter').classList.remove('hidden');
  }

  // Excel Order Upload Handler
  function handleOrderExcelUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = window.XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

        let addedCount = 0;
        rows.forEach(r => {
          const rawSku = r['SKU'] || r['Seller SKU'] || r['รหัสสินค้า'] || r['รุ่นสินค้า'] || r['Master SKU'] || '';
          const prodName = r['Product Name'] || r['ชื่อสินค้า'] || '';
          const variation = r['Variation'] || r['ตัวเลือกสินค้า'] || r['สี'] || '';
          const rawQty = r['Quantity'] !== undefined ? r['Quantity'] : (r['จำนวน'] !== undefined ? r['จำนวน'] : (r['จำนวนผลิต'] !== undefined ? r['จำนวนผลิต'] : (r['ยอดผลิต'] !== undefined ? r['ยอดผลิต'] : 1)));
          const qty = Number(String(rawQty).replace(/,/g, '').trim());
          if (isNaN(qty) || qty <= 0) return; // Skip 0-quantity rows
          const day = r['วัน'] || r['Day'] || 'จันทร์';

          const mapped = window.SkuMapper ? window.SkuMapper.mapToMasterSku(rawSku, prodName, variation) : { matchedSku: rawSku };
          const targetSku = mapped.matchedSku || rawSku;
          if (targetSku) {
            const usages = store.getSkuFabricUsage(targetSku);
            if (usages.length > 0) {
              store.addWeeklyPlanItem({
                dayOfWeek: day,
                sku: targetSku,
                quantity: qty,
                note: `นำเข้าจากไฟล์ ${file.name}`
              });
              addedCount++;
            }
          }
        });

        if (addedCount > 0) {
          showToast(`นำเข้าแผนผลิตที่ใช้ผ้าสำเร็จ ${addedCount} รายการ!`);
        } else {
          alert('ไม่พบรุ่นสินค้าที่ตรงกับสูตรผ้าในไฟล์นี้ กรุณาตรวจสอบคอลัมน์ SKU / ชื่อสินค้า');
        }
      } catch (err) {
        alert('เกิดข้อผิดพลาดในการอ่านไฟล์ Excel: ' + err.message);
      }
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  }

  function setupEventListeners() {
    // Tab switching
    $$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
    });

    // Quick receive roll button in top banner
    $('btn-quick-receive-roll').addEventListener('click', () => {
      switchTab('tab-fabric-stock');
      $('inbound-rolls-input').focus();
    });

    // Reset demo data
    $('btn-reset-demo').addEventListener('click', () => {
      if (confirm('ต้องการรีเซ็ตข้อมูลตัวอย่างของระบบส่งผ้า-ตัดผ้าใหม่ใช่หรือไม่?')) {
        customRollsOverride = {};
        store.seedInitialCutterDemo();
        showToast('รีเซ็ตข้อมูลตัวอย่างเรียบร้อยแล้ว', '🔄');
      }
    });

    // Add item to weekly plan
    $('form-add-plan-item').addEventListener('submit', e => {
      e.preventDefault();
      try {
        const dayOfWeek = $('plan-input-day').value;
        const sku = $('plan-input-sku').value.trim();
        const quantity = Number($('plan-input-qty').value || 1);
        const note = $('plan-input-note').value.trim();

        store.addWeeklyPlanItem({ dayOfWeek, sku, quantity, note });
        $('plan-input-sku').value = '';
        $('plan-input-note').value = '';
        showToast(`เพิ่มรุ่น ${sku} (${quantity} ชุด) ลงในแผนสัปดาห์แล้ว`);
      } catch (err) {
        alert(err.message);
      }
    });

    // Pull from BOM Planner (Async Cloud + Local)
    $('btn-pull-bom-planner').addEventListener('click', async () => {
      const btn = $('btn-pull-bom-planner');
      const origHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '⏳ กำลังดึงแผนจาก Cloud...';
      try {
        const res = await store.importFromBomPlannerBatch();
        showToast(`☁️ ดึงแผนผลิต ${res.batchId} (${res.sourceLabel}) สำเร็จ (${res.importedCount} รายการผ้า)`);
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
    });

    // Force Cloud Sync Button
    if ($('btn-force-cloud-sync')) {
      $('btn-force-cloud-sync').addEventListener('click', async () => {
        const btn = $('btn-force-cloud-sync');
        btn.disabled = true;
        btn.textContent = '⏳ กำลังซิงค์...';
        try {
          const ok = await store.syncFromCloud(true);
          await store.pushCutterStateToCloud();
          await store.pushStockMovementToCloud();
          if (ok) {
            showToast('☁️ ซิงค์ข้อมูลกับฐานข้อมูลกลาง Supabase เรียบร้อยแล้ว!');
          } else {
            showToast('⚠️ บันทึกในเครื่องแล้ว (ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต)', '⚠️');
          }
        } finally {
          btn.disabled = false;
          btn.textContent = '☁️ ซิงค์ Cloud';
        }
      });
    }

    // Upload Order Excel
    $('file-upload-order-excel').addEventListener('change', handleOrderExcelUpload);

    // Clear weekly plan
    $('btn-clear-weekly-plan').addEventListener('click', () => {
      if (confirm('ต้องการล้างรายการในตารางแผนสัปดาห์นี้ทั้งหมดใช่หรือไม่?')) {
        customRollsOverride = {};
        store.clearWeeklyPlan();
        showToast('ล้างตารางแผนสัปดาห์นี้แล้ว', '🗑️');
      }
    });

    // Dispatch Modal events
    $('btn-open-dispatch-modal').addEventListener('click', openDispatchModal);
    $('btn-close-dispatch-modal').addEventListener('click', () => $('modal-dispatch-batch').classList.add('hidden'));
    $('btn-cancel-dispatch-modal').addEventListener('click', () => $('modal-dispatch-batch').classList.add('hidden'));

    $('btn-confirm-dispatch-submit').addEventListener('click', () => {
      try {
        const weekLabel = $('modal-dispatch-week-label').value.trim();
        const cutterName = $('modal-dispatch-cutter-name').value.trim();
        const note = $('modal-dispatch-note').value.trim();

        const batch = store.createCuttingBatchFromPlan({
          weekLabel,
          cutterName,
          note,
          customRollsOverride
        });
        customRollsOverride = {};
        $('modal-dispatch-batch').classList.add('hidden');
        switchTab('tab-return-verify');
        showToast(`เปิดใบสั่งตัด ${batch.batchId} & ตัดสต็อกม้วนผ้าใน Stock Movement สำเร็จ!`);
      } catch (err) {
        alert(err.message);
      }
    });

    // Return Piece Modal events
    $('btn-close-return-modal').addEventListener('click', () => $('modal-return-piece').classList.add('hidden'));
    $('btn-cancel-return-modal').addEventListener('click', () => $('modal-return-piece').classList.add('hidden'));
    $('btn-confirm-return-submit').addEventListener('click', () => {
      try {
        const batchId = $('return-modal-batch-id').value;
        const itemId = $('return-modal-item-id').value;
        const receiveQty = Number($('return-modal-qty').value || 0);
        const note = $('return-modal-note').value.trim();

        store.recordCutPieceReturn({ batchId, itemId, receiveQty, note });
        $('modal-return-piece').classList.add('hidden');
        showToast(`ตรวจรับชุดผ้าตัดส่งกลับ +${receiveQty} ชุด เรียบร้อยแล้ว!`);
      } catch (err) {
        alert(err.message);
      }
    });

    // Adjust Cutter Modal events
    $('btn-close-adjust-cutter').addEventListener('click', () => $('modal-adjust-cutter').classList.add('hidden'));
    $('btn-cancel-adjust-cutter').addEventListener('click', () => $('modal-adjust-cutter').classList.add('hidden'));
    $('btn-confirm-adjust-cutter').addEventListener('click', () => {
      try {
        const fabricName = $('adjust-cutter-fabric-name').value;
        const actualYardsAtCutter = Number($('adjust-cutter-yards-input').value || 0);
        const returnToWarehouseRolls = Number($('adjust-cutter-return-rolls').value || 0);
        const note = $('adjust-cutter-note').value.trim();

        store.adjustCutterBalance({
          fabricName,
          actualYardsAtCutter,
          returnToWarehouseRolls,
          note
        });
        $('modal-adjust-cutter').classList.add('hidden');
        showToast(`อัปเดตยอดเศษผ้า ${fabricName} ที่ช่างนอกเรียบร้อยแล้ว!`);
      } catch (err) {
        alert(err.message);
      }
    });

    // Inbound Rolls <-> Yards auto-conversion in Tab 3
    $('inbound-rolls-input').addEventListener('input', e => {
      const rolls = parseFloat(e.target.value) || 0;
      $('inbound-yards-input').value = Math.round(rolls * YARDS_PER_ROLL * 100) / 100;
    });
    $('inbound-yards-input').addEventListener('input', e => {
      const yards = parseFloat(e.target.value) || 0;
      $('inbound-rolls-input').value = Math.round((yards / YARDS_PER_ROLL) * 100) / 100;
    });

    // Submit Inbound New Fabric Rolls
    $('form-inbound-fabric').addEventListener('submit', e => {
      e.preventDefault();
      try {
        const fabricName = $('inbound-fabric-select').value;
        const rolls = parseFloat($('inbound-rolls-input').value);
        const supplier = $('inbound-supplier-input').value.trim();
        const note = $('inbound-note-input').value.trim();

        const tx = store.receiveFabricRolls({
          fabricName,
          rolls,
          supplier,
          note
        });
        $('inbound-note-input').value = '';
        showToast(`รับผ้า ${fabricName} เข้าคลัง +${rolls} ม้วน (${rolls * YARDS_PER_ROLL} หลา) ซิงค์เข้า Stock Movement (${tx.id}) สำเร็จ!`);
      } catch (err) {
        alert(err.message);
      }
    });

    // Filters
    $('filter-batch-status').addEventListener('change', e => {
      batchStatusFilter = e.target.value;
      renderReturnVerifyTab();
    });

    $('stock-search-input').addEventListener('input', e => {
      stockSearchQuery = e.target.value.toLowerCase().trim();
      renderFabricStockTab();
    });

    $('stock-series-filter').addEventListener('change', e => {
      stockSeriesFilter = e.target.value;
      renderFabricStockTab();
    });

    $('bom-ref-search').addEventListener('input', e => {
      bomRefSearchQuery = e.target.value.toLowerCase().trim();
      renderCutterLedgerTab();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
