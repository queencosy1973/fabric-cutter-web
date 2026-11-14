/**
 * Fabric Outsource & Roll Monitor Store (fabric-store.js)
 * Connects Master BOM (Yards) <-> Roll Conversion (50 Yards = 1 Roll)
 * Two-way Sync with Stock Movement App (STOCK_APP_DATA_V4) & BOM Planner Web (qc_stock_on_hand_v2)
 */

(function (window) {
  'use strict';

  const YARDS_PER_ROLL = 50;
  const STOCK_MOVEMENT_KEY = 'STOCK_APP_DATA_V4';
  const BOM_CUSTOM_KEY = 'qc_master_bom_custom_v2';
  const BOM_STOCK_YARDS_KEY = 'qc_stock_on_hand_v2';
  const BOM_BATCHES_KEY = 'qc_production_batches_v1';
  const FABRIC_CUTTER_STATE_KEY = 'qc_fabric_cutter_state_v1';

  // Central Supabase Cloud Configuration (Shared across all QueenCosy Systems & Devices)
  const SUPABASE_URL = 'https://yercmidyvfetvbbrewlf.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllcmNtaWR5dmZldHZiYnJld2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MTA4MzUsImV4cCI6MjEwNDE4NjgzNX0.7tGbXNoogdLh6UQOJBJe9MABmY7W5J1aixPLJSXGSGk';
  const CLOUD_FABRIC_STATE_ID = 'QC_FABRIC_CUTTER_STATE_V1';
  const CLOUD_STOCK_MOVEMENT_ID = 'QC_STOCK_MOVEMENT_DATA_V4';
  const TABLE_PRODUCTION_BATCHES = 'production_batches';
  const TABLE_BOM_MATERIAL_PRICES = 'bom_calc_material_prices';

  // Default prices per yard (THB) from BOM Planner -> per roll = * 50
  const DEFAULT_YARD_PRICES = {
    'ดำ-PQ002C-17': 70,
    'ขาว-PQ002C-1': 70,
    'เทา-PQ002C-46': 70,
    'น้ำตาล-PQ002C-12': 70,
    'ชา-PQ002C-19': 70,
    'ครีม-PQ002C-6': 70,
    'มอคค่า-PQ002C-48': 70,
    'สีน้ำตาล-MJ337-7': 85,
    'สีเขียว-MJ337-14': 85,
    'สีแดงมะเหมี่ยว-MJ337-23': 85,
    'สีเทา-MJ337-29': 85,
    'สีน้ำเงิน-MJ337-31': 85,
    'สีโรสโกลด์-MJ337-22': 85,
    'สีน้ำตาล-MJ350-13': 85,
    'สีเขียว-MJ350-6': 85,
    'สีฟ้าเข้มMJ350-9': 85,
    'สีครีมทอง-MJ350-4': 85,
    'สีเทาอ่อน-MJ350-18': 85,
    'สีเทาเข้ม-MJ350-20': 85,
    'สีครีม-MJ350-1': 85,
    'สีน้ำตาลอ่อน-MJ350-11': 85,
    'น้ำตาลเข้ม-MJ350-14': 85,
    'สีครีม-MJ356-1a': 90,
    'สีเขียว-MJ356-2a': 90,
    'สีเทา-MJ356-3a': 90,
    'สีน้ำตาล-MJ356-4a': 90,
    'สีน้ำตาลทอง-736b-01': 90,
    'สีฟ้าเทา-736b-04': 90,
    'สีเทาเข้ม-736b-02': 90
  };

  // Initial seed rolls for BOM fabrics if creating fresh stock
  const DEFAULT_INITIAL_ROLLS = {
    'ดำ-PQ002C-17': 12,
    'ขาว-PQ002C-1': 8,
    'เทา-PQ002C-46': 10,
    'น้ำตาล-PQ002C-12': 9,
    'ชา-PQ002C-19': 6,
    'ครีม-PQ002C-6': 8,
    'มอคค่า-PQ002C-48': 7,
    'สีน้ำตาล-MJ337-7': 6,
    'สีเขียว-MJ337-14': 4,
    'สีแดงมะเหมี่ยว-MJ337-23': 3,
    'สีเทา-MJ337-29': 8,
    'สีน้ำเงิน-MJ337-31': 4,
    'สีโรสโกลด์-MJ337-22': 4,
    'สีน้ำตาล-MJ350-13': 5,
    'สีเขียว-MJ350-6': 3,
    'สีฟ้าเข้มMJ350-9': 3,
    'สีครีมทอง-MJ350-4': 5,
    'สีเทาอ่อน-MJ350-18': 6,
    'สีเทาเข้ม-MJ350-20': 6,
    'สีครีม-MJ350-1': 5,
    'สีน้ำตาลอ่อน-MJ350-11': 4,
    'น้ำตาลเข้ม-MJ350-14': 4,
    'สีครีม-MJ356-1a': 4,
    'สีเขียว-MJ356-2a': 3,
    'สีเทา-MJ356-3a': 5,
    'สีน้ำตาล-MJ356-4a': 4,
    'สีน้ำตาลทอง-736b-01': 3,
    'สีฟ้าเทา-736b-04': 3,
    'สีเทาเข้ม-736b-02': 4
  };

  function getFabricSeriesInfo(fabricName) {
    const name = String(fabricName || '');
    if (name.includes('PQ002C') || name.includes('PD130') || name.includes('PD9006')) {
      return { series: 'PQ002C', label: 'หนัง PVC (PQ002C)', badgeClass: 'bg-slate-800 text-white' };
    }
    if (name.includes('MJ337') || name.includes('HL337') || name.includes('337')) {
      return { series: 'MJ337', label: 'ผ้าฮอลแลนด์ (337)', badgeClass: 'bg-indigo-100 text-indigo-800 border border-indigo-200' };
    }
    if (name.includes('MJ350') || name.includes('350')) {
      return { series: 'MJ350', label: 'ผ้าโพลี (MJ350)', badgeClass: 'bg-sky-100 text-sky-800 border border-sky-200' };
    }
    if (name.includes('MJ356') || name.includes('MJ 356') || name.includes('CSF356') || name.includes('356')) {
      return { series: 'MJ356', label: 'ผ้าลูกฟูก (356)', badgeClass: 'bg-amber-100 text-amber-800 border border-amber-200' };
    }
    if (name.includes('736b') || name.includes('736B')) {
      return { series: '736B', label: 'ผ้านาโน (736B)', badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-200' };
    }
    return { series: 'OTHER', label: 'ผ้า/หนังอื่นๆ', badgeClass: 'bg-purple-100 text-purple-800 border border-purple-200' };
  }

  // Maps BOM/Routine fabric names to Admin's real Stock Movement product names (stored in 'หลา')
  const BOM_TO_STOCK_ALIASES = {
    'ขาว-pq002c-1': ['PQ002C-01 (ขาว)'],
    'ครีม-pq002c-6': ['PQ002C-06 (ครีม)'],
    'น้ำตาล-pq002c-12': ['PQ002C-12 (น้ำตาล)'],
    'ดำ-pq002c-17': ['PD130 (ดำ) TD', 'PQ002C-17 (ดำ)'],
    'ชา-pq002c-19': ['PQ002C-19 (ชา)'],
    'เทา-pq002c-46': ['PQ002C-46 (เทา)', 'PQ002C-28 (เทาอ่อน) แทน 46'],
    'มอคค่า-pq002c-48': ['PD9006 (มอคค่า) TD', 'PQ002C-48 (มอคค่า)'],
    'สีครีม-mj356-1a': ['MJ 356-1A (ลูกฟูกครีม)', 'CSF356-1A (ลูกฟูกครีม)'],
    'สีเขียว-mj356-2a': ['CSF356-3A (ลูกฟูกเขียว)', 'MJ 356-2A (ลูกฟูกเขียว)'],
    'สีเทา-mj356-3a': ['MJ 356-3A (ลูกฟูกเทา)', 'CSF356-2A (ลูกฟูกเทา)'],
    'สีน้ำตาล-mj356-4a': ['356-04B ร่อนใหญ่ (น้ำตาล)', 'MJ 356-4A (ลูกฟูกน้ำตาล)', 'CSF356-4A (ลูกฟูกน้ำตาล)'],
    'สีน้ำตาล-mj337-7': ['MJ337-07 (น้ำตาลทอง)', 'HL337-07 (น้ำตาลทอง)', 'MJ337-08 (น้ำตาล)'],
    'สีเขียว-mj337-14': ['MJ337-14 (เขียว)', 'HL337-14 (เขียว)'],
    'สีโรสโกลด์-mj337-22': ['MJ337-22 (โรสโกลด์)', 'HL337-22 (โรสโกลด์)'],
    'สีแดงมะเหมี่ยว-mj337-23': ['MJ337-23 (แดงไวน์)', 'HL337-23 (แดงไวน์)'],
    'สีเทา-mj337-29': ['MJ337-29 (เทาควัน)', 'HL337-29 (เทาควัน)', 'MJ337-26 (เทาอ่อน)', 'MJ337-30 (เทาอมเขียว)'],
    'สีน้ำเงิน-mj337-31': ['MJ337-31 (น้ำเงิน)', 'HL337-31 (น้ำเงิน)'],
    'สีน้ำตาลทอง-736b-01': ['MJ736B-1 (นาโนน้ำตาลทอง)', 'PKD736B-1 (นาโนน้ำตาลทอง)'],
    'สีเทาเข้ม-736b-02': ['MJ736B-2 (นาโนเทา)', 'PKD736B-2 (นาโนเทา)'],
    'สีฟ้าเทา-736b-04': ['MJ736B-4 (นาโนฟ้า)', 'PKD736B-4 (นาโนฟ้า)']
  };

  class FabricCutterStore {
    constructor() {
      this.YARDS_PER_ROLL = YARDS_PER_ROLL;
      this.masterBom = null;
      this.stockData = null; // Mirrors STOCK_APP_DATA_V4
      this.state = {
        weeklyPlan: [],       // Current active weekly plan rows
        cutterBalance: {},    // { [fabricName]: { balanceYards, totalSentRolls, totalSentYards, totalUsedYards } }
        cuttingBatches: [],   // History & active cutting batches sent to outsource cutter
        cutterLedger: []      // Detailed movement log at the cutter
      };
      this.listeners = [];
      this.statusListeners = [];
      this.channel = null;
      this.supabase = null;
      this.cloudStatus = 'connecting'; // 'online' | 'syncing' | 'offline' | 'connecting'
      this.cloudMessage = 'กำลังเชื่อมต่อ Supabase Cloud...';
      this.lastCloudSync = null;
      this.deviceId = 'QC-FAB-' + Math.random().toString(36).slice(2, 9);
      this.isApplyingRemote = false;
      this.hasInitialCloudSynced = false;
      this._pushCutterTimer = null;
      this._pushStockTimer = null;

      this.initBroadcastChannel();
      this.init();
      this.initSupabaseCloud();
    }

    onCloudStatusChange(fn) {
      if (typeof fn === 'function') {
        this.statusListeners.push(fn);
        fn(this.cloudStatus, this.cloudMessage, this.lastCloudSync);
      }
    }

    setCloudStatus(status, message) {
      this.cloudStatus = status;
      this.cloudMessage = message;
      if (status === 'online') {
        this.lastCloudSync = new Date();
      }
      this.statusListeners.forEach(fn => {
        try { fn(this.cloudStatus, this.cloudMessage, this.lastCloudSync); } catch (e) {}
      });
    }

    async initSupabaseCloud() {
      if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        this.setCloudStatus('offline', 'ออฟไลน์ (LocalStorage)');
        return;
      }
      try {
        this.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: false },
          realtime: { params: { eventsPerSecond: 10 } }
        });

        await this.syncFromCloud(true);
        this.setupSupabaseRealtime();
      } catch (err) {
        console.warn('[FabricStore] Supabase init notice:', err);
        this.setCloudStatus('offline', 'ออฟไลน์ (สำรองในเครื่อง)');
      }
    }

    setupSupabaseRealtime() {
      if (!this.supabase) return;
      try {
        const rtChannel = this.supabase.channel('qc-fabric-cutter-realtime');
        rtChannel.on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: TABLE_PRODUCTION_BATCHES
        }, (payload) => {
          const rec = payload.new || payload.old;
          if (!rec || !rec.batch_id) return;

          if (rec.batch_id === CLOUD_FABRIC_STATE_ID && payload.new && payload.new.items_json) {
            const data = payload.new.items_json;
            if (data.updatedByDevice === this.deviceId) return; // Ignore own echo
            this.applyRemoteCutterState(data);
          } else if (rec.batch_id === CLOUD_STOCK_MOVEMENT_ID && payload.new && payload.new.items_json) {
            const data = payload.new.items_json;
            if (data.updatedByDevice === this.deviceId) return;
            this.applyRemoteStockData(data);
          }
        });

        rtChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.setCloudStatus('online', 'ซิงค์สดทุกอุปกรณ์ (Supabase Cloud)');
          }
        });
      } catch (e) {
        console.warn('[FabricStore] Realtime setup notice:', e);
      }
    }

    mergeAdminRoutineStates(localAR, remoteAR) {
      if (!remoteAR) return localAR || null;
      if (!localAR) return remoteAR;

      // Union rounds by id, keeping newer updatedAt (or preserving user-added rounds)
      const localRounds = Array.isArray(localAR.rounds) ? localAR.rounds : [];
      const remoteRounds = Array.isArray(remoteAR.rounds) ? remoteAR.rounds : [];
      const roundMap = new Map();

      remoteRounds.forEach(r => { if (r && r.id) roundMap.set(r.id, r); });
      localRounds.forEach(lr => {
        if (!lr || !lr.id) return;
        const rr = roundMap.get(lr.id);
        if (!rr) {
          roundMap.set(lr.id, lr);
        } else {
          const lTime = lr.updatedAt ? new Date(lr.updatedAt).getTime() : 0;
          const rTime = rr.updatedAt ? new Date(rr.updatedAt).getTime() : 0;
          if (lTime > rTime) {
            roundMap.set(lr.id, lr);
          }
        }
      });

      const mergedRounds = Array.from(roundMap.values());
      const lRootTime = localAR.updatedAt ? new Date(localAR.updatedAt).getTime() : 0;
      const rRootTime = remoteAR.updatedAt ? new Date(remoteAR.updatedAt).getTime() : 0;
      const preferLocal = lRootTime > rRootTime;
      const primary = preferLocal ? localAR : remoteAR;
      const secondary = preferLocal ? remoteAR : localAR;

      return {
        ...secondary,
        ...primary,
        rounds: mergedRounds,
        activeRoundId: primary.activeRoundId || secondary.activeRoundId || (mergedRounds[0] && mergedRounds[0].id),
        cutSewStockStandard: primary.cutSewStockStandard || secondary.cutSewStockStandard || [],
        cutSewStockLMini: primary.cutSewStockLMini || secondary.cutSewStockLMini || [],
        preOrderDailyRecords: primary.preOrderDailyRecords || secondary.preOrderDailyRecords || [],
        woodFrameStock: primary.woodFrameStock || secondary.woodFrameStock || [],
        sparePartsOrders: primary.sparePartsOrders || secondary.sparePartsOrders || [],
        csBsLuStockMatrix: primary.csBsLuStockMatrix || secondary.csBsLuStockMatrix || []
      };
    }

    mergeStockMovementData(localStock, remoteStock) {
      if (!remoteStock || !Array.isArray(remoteStock.products)) return localStock;
      if (!localStock || !Array.isArray(localStock.products)) return remoteStock;

      const prodMap = new Map();
      (localStock.products || []).forEach(p => { if (p && p.id) prodMap.set(p.id, p); });
      (remoteStock.products || []).forEach(p => { if (p && p.id) prodMap.set(p.id, p); });

      const mergeTx = (arrA, arrB) => {
        const map = new Map();
        const keyOf = (tx) => tx.id ? `${tx.id}_${tx.date || ''}_${tx.productId || tx.productName || ''}_${tx.quantity || 0}` : `${tx.date}_${tx.productId || tx.productName}_${tx.quantity}_${tx.note || tx.dailyUsage || ''}`;
        (arrA || []).forEach(tx => { if (tx) map.set(keyOf(tx), tx); });
        (arrB || []).forEach(tx => { if (tx) map.set(keyOf(tx), tx); });
        return Array.from(map.values());
      };

      return {
        categories: remoteStock.categories || localStock.categories || ['กลุ่มไม้', 'กลุ่มฟองน้ำ', 'ฮาร์ดแวร์และวัสดุประกอบ', 'บรรจุภัณฑ์และพลาสติก', 'ผ้าม้วน', 'วัสดุทั่วไป'],
        products: Array.from(prodMap.values()),
        inbound: mergeTx(localStock.inbound, remoteStock.inbound),
        outbound: mergeTx(localStock.outbound, remoteStock.outbound),
        adjustments: mergeTx(localStock.adjustments, remoteStock.adjustments)
      };
    }

    applyRemoteCutterState(remoteState) {
      if (!remoteState) return;
      this.isApplyingRemote = true;
      try {
        const mergedAdminRoutine = this.mergeAdminRoutineStates(this.state.adminRoutine, remoteState.adminRoutine);
        this.state = {
          ...this.state,
          ...remoteState,
          weeklyPlan: Array.isArray(remoteState.weeklyPlan) ? remoteState.weeklyPlan : this.state.weeklyPlan,
          cutterBalance: remoteState.cutterBalance || this.state.cutterBalance,
          cuttingBatches: Array.isArray(remoteState.cuttingBatches) ? remoteState.cuttingBatches : this.state.cuttingBatches,
          cutterLedger: Array.isArray(remoteState.cutterLedger) ? remoteState.cutterLedger : this.state.cutterLedger,
          adminRoutine: mergedAdminRoutine
        };
        this.ensureCutterBalanceEntries();
        localStorage.setItem(FABRIC_CUTTER_STATE_KEY, JSON.stringify(this.state));
        localStorage.setItem(FABRIC_CUTTER_STATE_KEY + '_backup', JSON.stringify(this.state));
        this.setCloudStatus('online', 'อัปเดตข้อมูลล่าสุดจากคลาวด์แล้ว');
        this.notify();
      } finally {
        this.isApplyingRemote = false;
      }
    }

    applyRemoteStockData(remoteStock) {
      if (!remoteStock || !Array.isArray(remoteStock.products)) return;
      this.isApplyingRemote = true;
      try {
        this.stockData = this.mergeStockMovementData(this.stockData, remoteStock);
        this.ensureBomFabricsInStockMovement();
        localStorage.setItem(STOCK_MOVEMENT_KEY, JSON.stringify(this.stockData));
        localStorage.setItem(STOCK_MOVEMENT_KEY + '_backup', JSON.stringify(this.stockData));
        this.syncToBomPlannerYards();
        this.setCloudStatus('online', 'ซิงค์สต็อกผ้าจากคลาวด์แล้ว');
        this.notify();
      } finally {
        this.isApplyingRemote = false;
      }
    }

    async syncFromCloud(initialBootstrap = false) {
      if (!this.supabase) return false;
      this.setCloudStatus('syncing', 'กำลังดึงข้อมูลจาก Supabase...');
      try {
        const { data, error } = await this.supabase
          .from(TABLE_PRODUCTION_BATCHES)
          .select('batch_id, items_json, updated_at')
          .in('batch_id', [CLOUD_FABRIC_STATE_ID, CLOUD_STOCK_MOVEMENT_ID]);

        if (error) throw error;

        const map = {};
        (data || []).forEach(r => { map[r.batch_id] = r; });

        // 1. Stock Movement Cloud Sync (Always pull & union-merge, NEVER blindly overwrite existing cloud stock from bootstrap!)
        if (map[CLOUD_STOCK_MOVEMENT_ID] && map[CLOUD_STOCK_MOVEMENT_ID].items_json && Array.isArray(map[CLOUD_STOCK_MOVEMENT_ID].items_json.products)) {
          this.applyRemoteStockData(map[CLOUD_STOCK_MOVEMENT_ID].items_json);
        }

        // 2. Fabric Cutter State Cloud Sync
        if (map[CLOUD_FABRIC_STATE_ID] && map[CLOUD_FABRIC_STATE_ID].items_json) {
          this.applyRemoteCutterState(map[CLOUD_FABRIC_STATE_ID].items_json);
        }

        this.hasInitialCloudSynced = true;
        this.setCloudStatus('online', 'ซิงค์สดทุกอุปกรณ์ (Supabase Cloud)');
        return true;
      } catch (err) {
        console.warn('[FabricStore] syncFromCloud error:', err);
        this.hasInitialCloudSynced = true;
        this.setCloudStatus('offline', 'ออฟไลน์ (ใช้ข้อมูลในเครื่อง)');
        return false;
      }
    }

    async pushCutterStateToCloud() {
      if (!this.supabase || this.isApplyingRemote || !this.hasInitialCloudSynced) return false;
      this.setCloudStatus('syncing', 'กำลังบันทึกขึ้น Cloud...');
      try {
        // Pull latest remote state first to union-merge rounds so no user data from another tab/device is ever overwritten
        const { data: existingRows } = await this.supabase
          .from(TABLE_PRODUCTION_BATCHES)
          .select('items_json')
          .eq('batch_id', CLOUD_FABRIC_STATE_ID)
          .limit(1);

        if (Array.isArray(existingRows) && existingRows[0] && existingRows[0].items_json) {
          const remoteState = existingRows[0].items_json;
          this.state.adminRoutine = this.mergeAdminRoutineStates(this.state.adminRoutine, remoteState.adminRoutine);
        }

        const nowIso = new Date().toISOString();
        const itemsJsonPayload = {
          ...this.state,
          updatedByDevice: this.deviceId,
          updatedAt: nowIso
        };

        const payload = {
          batch_id: CLOUD_FABRIC_STATE_ID,
          batch_name: 'QueenCosy Fabric Roll & Outsource Cutter State',
          source: 'QC_FABRIC_CUTTER',
          status: 'COMPLETED',
          total_skus: (this.state.weeklyPlan || []).length,
          total_units: (this.state.cuttingBatches || []).length,
          total_material_cost: 0,
          items_json: itemsJsonPayload,
          updated_at: nowIso,
          notes: 'Synced from fabric-cutter-web'
        };

        const backupPayload = {
          ...payload,
          batch_id: 'QC_FABRIC_CUTTER_BACKUP_V1',
          batch_name: 'QueenCosy Fabric Cutter Auto-Backup V1',
          notes: 'Auto-backup from fabric-cutter-web'
        };

        const { error } = await this.supabase
          .from(TABLE_PRODUCTION_BATCHES)
          .upsert([payload, backupPayload], { onConflict: 'batch_id' });

        if (error) throw error;
        localStorage.setItem(FABRIC_CUTTER_STATE_KEY + '_backup', JSON.stringify(this.state));
        this.setCloudStatus('online', 'บันทึกและสำรองข้อมูลขึ้น Cloud สำเร็จ');
        return true;
      } catch (err) {
        console.warn('[FabricStore] pushCutterStateToCloud error:', err);
        this.setCloudStatus('offline', 'บันทึกในเครื่องแล้ว (รอซิงค์ Cloud)');
        return false;
      }
    }

    async pushStockMovementToCloud() {
      if (!this.supabase || this.isApplyingRemote || !this.stockData || !this.hasInitialCloudSynced) return false;
      this.setCloudStatus('syncing', 'กำลังซิงค์สต็อกขึ้น Cloud...');
      try {
        // Always fetch & union-merge remote stock movement first so we NEVER overwrite movements added in stock-movement-app!
        const { data: existingRows } = await this.supabase
          .from(TABLE_PRODUCTION_BATCHES)
          .select('items_json')
          .eq('batch_id', CLOUD_STOCK_MOVEMENT_ID)
          .limit(1);

        if (Array.isArray(existingRows) && existingRows[0] && existingRows[0].items_json) {
          this.stockData = this.mergeStockMovementData(this.stockData, existingRows[0].items_json);
          localStorage.setItem(STOCK_MOVEMENT_KEY, JSON.stringify(this.stockData));
        }

        const nowIso = new Date().toISOString();
        const payload = {
          batch_id: CLOUD_STOCK_MOVEMENT_ID,
          batch_name: 'QueenCosy Stock Movement Master Data V4',
          source: 'QC_STOCK_MOVEMENT',
          status: 'COMPLETED',
          total_skus: (this.stockData.products || []).length,
          total_units: (this.stockData.inbound || []).length + (this.stockData.outbound || []).length,
          total_material_cost: 0,
          items_json: {
            ...this.stockData,
            updatedByDevice: this.deviceId,
            updatedAt: nowIso
          },
          updated_at: nowIso,
          notes: 'Synced from fabric-cutter-web & stock-movement-app'
        };

        const { error } = await this.supabase
          .from(TABLE_PRODUCTION_BATCHES)
          .upsert(payload, { onConflict: 'batch_id' });

        if (error) throw error;

        // Also sync computed fabric yard stocks to bom_calc_material_prices for BOM Planner & BOM Calculator
        await this.pushFabricYardsToBomCloud();

        this.setCloudStatus('online', 'ซิงค์สต็อกผ้าขึ้น Supabase สำเร็จ');
        return true;
      } catch (err) {
        console.warn('[FabricStore] pushStockMovementToCloud error:', err);
        this.setCloudStatus('offline', 'บันทึกในเครื่องแล้ว (รอซิงค์ Cloud)');
        return false;
      }
    }

    async pushFabricYardsToBomCloud() {
      if (!this.supabase) return false;
      try {
        const computed = this.getComputedFabricStocks();
        const records = computed.map(fab => ({
          material_name: fab.name,
          category: 'fabric',
          unit: 'หลา',
          unit_price: Number(fab.unitPriceYard || DEFAULT_YARD_PRICES[fab.name] || 75),
          current_stock: Math.round(fab.warehouseYards * 100) / 100,
          updated_at: new Date().toISOString(),
          updated_by: 'FabricCutterMonitor'
        }));

        if (records.length > 0) {
          await this.supabase
            .from(TABLE_BOM_MATERIAL_PRICES)
            .upsert(records, { onConflict: 'material_name' });
        }
        return true;
      } catch (e) {
        console.warn('[FabricStore] pushFabricYardsToBomCloud notice:', e);
        return false;
      }
    }

    initBroadcastChannel() {
      try {
        if ('BroadcastChannel' in window) {
          this.channel = new BroadcastChannel('qc_stock_sync_channel');
          this.channel.onmessage = (event) => {
            if (event.data && event.data.type === 'STOCK_UPDATED') {
              this.loadStockMovementData(false);
              this.notify();
            }
          };
        }
        window.addEventListener('storage', (e) => {
          if (e.key === STOCK_MOVEMENT_KEY || e.key === FABRIC_CUTTER_STATE_KEY || e.key === BOM_CUSTOM_KEY) {
            this.loadMasterBom();
            this.loadStockMovementData(false);
            this.loadCutterState();
            this.notify();
          }
        });
      } catch (err) {
        console.warn('BroadcastChannel setup notice:', err);
      }
    }

    init() {
      this.loadMasterBom();
      this.loadStockMovementData(true);
      this.loadCutterState();
    }

    // 1. Load Master BOM (from custom localStorage or MASTER_BOM_DATA)
    loadMasterBom() {
      const baseBom = (typeof MASTER_BOM_DATA !== 'undefined') ? MASTER_BOM_DATA : window.MASTER_BOM_DATA;
      const savedBom = localStorage.getItem(BOM_CUSTOM_KEY);
      if (savedBom) {
        try {
          this.masterBom = JSON.parse(savedBom);
        } catch (e) {
          this.masterBom = baseBom ? JSON.parse(JSON.stringify(baseBom)) : { materials: [], skus: [] };
        }
      } else if (baseBom) {
        this.masterBom = JSON.parse(JSON.stringify(baseBom));
      } else {
        this.masterBom = { materials: [], skus: [] };
      }

      if (window.SkuMapper && this.masterBom) {
        window.SkuMapper.initSkuIndex(this.masterBom);
      }
    }

    // Get all fabric materials from Master BOM
    getBomFabricMaterials() {
      if (!this.masterBom || !this.masterBom.materials) return [];
      return this.masterBom.materials.filter(m => m.category === 'fabric');
    }

    // Get SKU -> Fabric usage map: returns { fabricName, yardsPerUnit } for a SKU
    getSkuFabricUsage(skuName) {
      if (!this.masterBom || !this.masterBom.skus || !skuName) return [];
      const clean = skuName.trim().toLowerCase();
      const found = this.masterBom.skus.find(s => s.sku.trim().toLowerCase() === clean);
      if (!found || !found.materials) return [];

      const fabricNames = new Set(this.getBomFabricMaterials().map(m => m.name));
      const usages = [];
      for (const [matName, qty] of Object.entries(found.materials)) {
        if (fabricNames.has(matName) && Number(qty) > 0) {
          usages.push({
            fabricName: matName,
            yardsPerUnit: Number(qty)
          });
        }
      }
      return usages;
    }

    // Get all SKUs that use any fabric
    getAllFabricSkus() {
      if (!this.masterBom || !this.masterBom.skus) return [];
      const fabricNames = new Set(this.getBomFabricMaterials().map(m => m.name));
      const result = [];
      this.masterBom.skus.forEach(item => {
        if (!item.materials) return;
        for (const [matName, qty] of Object.entries(item.materials)) {
          if (fabricNames.has(matName) && Number(qty) > 0) {
            result.push({
              sku: item.sku,
              fabricName: matName,
              yardsPerUnit: Number(qty),
              piecesPerRoll: Math.floor((YARDS_PER_ROLL / Number(qty)) * 10) / 10
            });
          }
        }
      });
      return result;
    }

    // 2. Load & Ensure BOM Fabrics in Stock Movement App (STOCK_APP_DATA_V4)
    loadStockMovementData(ensureRegistered = true) {
      try {
        const saved = localStorage.getItem(STOCK_MOVEMENT_KEY);
        if (saved) {
          this.stockData = JSON.parse(saved);
        } else if (window.INITIAL_INVENTORY_DATA) {
          this.stockData = {
            categories: ['กลุ่มไม้', 'กลุ่มฟองน้ำ', 'ฮาร์ดแวร์และวัสดุประกอบ', 'บรรจุภัณฑ์และพลาสติก', 'ผ้าม้วน', 'วัสดุทั่วไป'],
            ...JSON.parse(JSON.stringify(window.INITIAL_INVENTORY_DATA))
          };
        } else {
          this.stockData = {
            categories: ['กลุ่มไม้', 'กลุ่มฟองน้ำ', 'ฮาร์ดแวร์และวัสดุประกอบ', 'บรรจุภัณฑ์และพลาสติก', 'ผ้าม้วน', 'วัสดุทั่วไป'],
            products: [],
            inbound: [],
            outbound: [],
            adjustments: []
          };
        }
      } catch (e) {
        console.error('Error loading STOCK_APP_DATA_V4:', e);
        this.stockData = { categories: ['ผ้าม้วน'], products: [], inbound: [], outbound: [], adjustments: [] };
      }

      if (!this.stockData.categories) {
        this.stockData.categories = ['กลุ่มไม้', 'กลุ่มฟองน้ำ', 'ฮาร์ดแวร์และวัสดุประกอบ', 'บรรจุภัณฑ์และพลาสติก', 'ผ้าม้วน', 'วัสดุทั่วไป'];
      }
      if (!this.stockData.categories.includes('ผ้าม้วน')) {
        this.stockData.categories.push('ผ้าม้วน');
      }

      if (ensureRegistered) {
        this.ensureBomFabricsInStockMovement();
      }
    }

    // Never inject FAB-* ('ม้วน') items into Stock Movement!
    // Stock Movement manages all fabric items strictly in 'หลา' (PROD-071..PROD-109, PROD-119).
    // All Roll (ม้วน = 50 หลา) conversions happen ONLY inside fabric-cutter-web.
    ensureBomFabricsInStockMovement() {
      let modified = false;
      if (!this.stockData.products) this.stockData.products = [];

      const beforeLen = this.stockData.products.length;
      this.stockData.products = this.stockData.products.filter(p => {
        const idStr = String(p.id || '');
        const noteStr = String(p.note || '');
        if (idStr.startsWith('FAB-')) return false;
        if (noteStr.includes('ซิงค์จากสูตร BOM') || noteStr.includes('ซิงค์อัตโนมัติจากสูตร Master BOM')) return false;
        return true;
      });
      if (this.stockData.products.length !== beforeLen) {
        modified = true;
      }

      // If products list has no fabric items yet (e.g. old 64-item seed), merge fabric items from INITIAL_INVENTORY_DATA
      const hasRealFabrics = this.stockData.products.some(p => p.category === 'ผ้าม้วน' || String(p.name || '').includes('PQ002C'));
      if (!hasRealFabrics && window.INITIAL_INVENTORY_DATA && Array.isArray(window.INITIAL_INVENTORY_DATA.products)) {
        const existingIds = new Set(this.stockData.products.map(p => p.id));
        window.INITIAL_INVENTORY_DATA.products.forEach(sp => {
          if (!existingIds.has(sp.id)) {
            this.stockData.products.push(JSON.parse(JSON.stringify(sp)));
            modified = true;
          }
        });
      }

      this.stockData.products.forEach(p => {
        const name = String(p.name || '');
        if (name.includes('PQ002C') || name.includes('MJ337') || name.includes('MJ 356') || name.includes('CSF356') || name.includes('HL337') || name.includes('PKD736B') || name.includes('MJ736B') || name.includes('PD130') || name.includes('PD9006') || name.includes('356-04B')) {
          if (p.category !== 'ผ้าม้วน') {
            p.category = 'ผ้าม้วน';
            modified = true;
          }
          if (p.unit !== 'หลา') {
            p.unit = 'หลา';
            modified = true;
          }
        }
      });

      if (modified) {
        this.saveStockMovementData(false);
      } else {
        this.syncToBomPlannerYards();
      }
    }

    findMatchingStockProduct(fabricName) {
      if (!this.stockData || !Array.isArray(this.stockData.products)) return null;
      const clean = String(fabricName || '').trim().toLowerCase();
      // 1. Direct match by id or name
      let prod = this.stockData.products.find(
        p => String(p.id || '').toLowerCase() === clean || String(p.name || '').trim().toLowerCase() === clean
      );
      if (prod) return prod;

      // 2. Match via BOM_TO_STOCK_ALIASES
      const aliases = BOM_TO_STOCK_ALIASES[clean];
      if (aliases && aliases.length > 0) {
        for (const aliasName of aliases) {
          const found = this.stockData.products.find(
            p => String(p.name || '').trim().toLowerCase() === aliasName.trim().toLowerCase()
          );
          if (found) return found;
        }
      }

      // 3. Substring code match (e.g. PQ002C-06, 337-29, 736B-01)
      const codeMatch = clean.match(/(pq002c-\d+|337-\d+|356-\d+[a-z]?|736b-0?\d+)/i);
      if (codeMatch) {
        const token = codeMatch[1].toLowerCase().replace('736b-0', '736b-');
        prod = this.stockData.products.find(p => String(p.name || '').toLowerCase().includes(token));
        if (prod) return prod;
      }
      return null;
    }

    saveStockMovementData(broadcast = true) {
      try {
        localStorage.setItem(STOCK_MOVEMENT_KEY, JSON.stringify(this.stockData));
        this.syncToBomPlannerYards();
        if (broadcast && this.channel) {
          this.channel.postMessage({ type: 'STOCK_UPDATED', timestamp: Date.now() });
        }
        if (broadcast && !this.isApplyingRemote) {
          clearTimeout(this._pushStockTimer);
          this._pushStockTimer = setTimeout(() => {
            this.pushStockMovementToCloud();
          }, 300);
        }
      } catch (e) {
        console.error('Error saving STOCK_APP_DATA_V4:', e);
      }
    }

    // Keep BOM Planner's qc_stock_on_hand_v2 synced in Yards (rolls * 50)
    syncToBomPlannerYards() {
      try {
        const savedStock = localStorage.getItem(BOM_STOCK_YARDS_KEY);
        let parsedStock = {};
        if (savedStock) {
          try { parsedStock = JSON.parse(savedStock); } catch (e) {}
        }

        const computed = this.getComputedFabricStocks();
        computed.forEach(fab => {
          const existing = parsedStock[fab.name] || { wastePercent: 0 };
          // Total available yards in warehouse
          parsedStock[fab.name] = {
            currentStock: Math.round(fab.warehouseYards * 100) / 100,
            wastePercent: existing.wastePercent || 0
          };
        });

        localStorage.setItem(BOM_STOCK_YARDS_KEY, JSON.stringify(parsedStock));
      } catch (e) {
        console.warn('Could not sync yards to BOM Planner:', e);
      }
    }

    // 3. Load & Save Fabric Cutter State (Weekly Plan, Cutter Balance, Cutting Batches)
    loadCutterState() {
      try {
        const saved = localStorage.getItem(FABRIC_CUTTER_STATE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          this.state = {
            ...parsed,
            weeklyPlan: parsed.weeklyPlan || [],
            cutterBalance: parsed.cutterBalance || {},
            cuttingBatches: parsed.cuttingBatches || [],
            cutterLedger: parsed.cutterLedger || [],
            adminRoutine: parsed.adminRoutine || null
          };
        } else {
          this.seedInitialCutterDemo();
        }
      } catch (e) {
        console.error('Error loading cutter state:', e);
        this.seedInitialCutterDemo();
      }
      this.ensureCutterBalanceEntries();
    }

    ensureCutterBalanceEntries() {
      const bomFabrics = this.getBomFabricMaterials();
      bomFabrics.forEach(mat => {
        if (!this.state.cutterBalance[mat.name]) {
          this.state.cutterBalance[mat.name] = {
            balanceYards: 0,
            totalSentRolls: 0,
            totalSentYards: 0,
            totalUsedYards: 0,
            lastUpdated: new Date().toISOString()
          };
        }
      });
    }

    saveCutterState(pushCloud = true) {
      try {
        localStorage.setItem(FABRIC_CUTTER_STATE_KEY, JSON.stringify(this.state));
        if (pushCloud) {
          localStorage.setItem(FABRIC_CUTTER_STATE_KEY + '_backup', JSON.stringify(this.state));
        }
        this.notify();
        if (pushCloud && !this.isApplyingRemote && this.hasInitialCloudSynced) {
          clearTimeout(this._pushCutterTimer);
          this._pushCutterTimer = setTimeout(() => {
            this.pushCutterStateToCloud();
          }, 300);
        }
      } catch (e) {
        console.error('Error saving cutter state:', e);
      }
    }

    // Seed realistic initial data so admin immediately sees how the loop works
    seedInitialCutterDemo() {
      const today = new Date().toISOString().split('T')[0];
      this.state = {
        weeklyPlan: [
          { id: 'WP-01', dayOfWeek: 'จันทร์', date: today, sku: 'Qs-โซฟา2ที่นั่งท้าวแขน-bs2-ดำ-PQ002C-17', quantity: 12, fabricName: 'ดำ-PQ002C-17', yardsPerUnit: 5, totalYards: 60, note: 'ออเดอร์จันทร์' },
          { id: 'WP-02', dayOfWeek: 'อังคาร', date: today, sku: 'Qs-โซฟา3ที่นั่งท้าวแขน-bs3-ดำ-PQ002C-17', quantity: 10, fabricName: 'ดำ-PQ002C-17', yardsPerUnit: 6, totalYards: 60, note: 'ออเดอร์อังคาร' },
          { id: 'WP-03', dayOfWeek: 'พุธ', date: today, sku: 'Qs-โซฟาเบดปรับนอน-rc-เทา-PQ002C-46', quantity: 10, fabricName: 'เทา-PQ002C-46', yardsPerUnit: 7, totalYards: 70, note: 'ออเดอร์พุธ' },
          { id: 'WP-04', dayOfWeek: 'พฤหัสบดี', date: today, sku: 'Qs-โซฟา2ที่นั่งท้าวแขน-bs2-เทา-337-29', quantity: 8, fabricName: 'สีเทา-MJ337-29', yardsPerUnit: 5, totalYards: 40, note: 'ผ้าฮอลแลนด์เทา' },
          { id: 'WP-05', dayOfWeek: 'ศุกร์', date: today, sku: 'Qs-โซฟา3ที่นั่งท้าวแขน-bs3-น้ำตาล-PQ002C-12', quantity: 9, fabricName: 'น้ำตาล-PQ002C-12', yardsPerUnit: 6, totalYards: 54, note: 'ออเดอร์ศุกร์' },
          { id: 'WP-06', dayOfWeek: 'เสาร์', date: today, sku: 'Qs-เก้าอี้สตูล-cu-ดำ-PQ002C-17', quantity: 15, fabricName: 'ดำ-PQ002C-17', yardsPerUnit: 1, totalYards: 15, note: 'สตูลเสริม' }
        ],
        cutterBalance: {
          'ดำ-PQ002C-17': {
            balanceYards: 15, // เศษผ้าสัปดาห์ก่อนค้างที่ช่าง 15 หลา (0.30 ม้วน)
            totalSentRolls: 4,
            totalSentYards: 200,
            totalUsedYards: 185,
            lastUpdated: today
          },
          'เทา-PQ002C-46': {
            balanceYards: 20, // เศษผ้าสัปดาห์ก่อนค้างที่ช่าง 20 หลา (0.40 ม้วน)
            totalSentRolls: 3,
            totalSentYards: 150,
            totalUsedYards: 130,
            lastUpdated: today
          }
        },
        cuttingBatches: [
          {
            batchId: 'CUT-W01-PREV',
            weekLabel: 'สัปดาห์ก่อน (ตัวอย่างงานส่งตัด)',
            cutterName: 'ทีมช่างตัดนอก - ช่างเอก',
            createdDate: today,
            status: 'PARTIAL',
            note: 'ส่งม้วนผ้าให้ช่างนอกตัดตามรุ่น รอตรวจรับชุดผ้าที่ตัดเสร็จกลับมา',
            rollDispatches: [
              {
                fabricName: 'ดำ-PQ002C-17',
                grossYardsNeeded: 185,
                prevCutterBalanceYards: 0,
                netYardsNeeded: 185,
                rollsSent: 4,
                yardsSent: 200,
                expectedRemnantYards: 15
              },
              {
                fabricName: 'เทา-PQ002C-46',
                grossYardsNeeded: 130,
                prevCutterBalanceYards: 0,
                netYardsNeeded: 130,
                rollsSent: 3,
                yardsSent: 150,
                expectedRemnantYards: 20
              }
            ],
            skuItems: [
              {
                itemId: 'ITEM-1',
                sku: 'Qs-โซฟา2ที่นั่งท้าวแขน-bs2-ดำ-PQ002C-17',
                fabricName: 'ดำ-PQ002C-17',
                yardsPerUnit: 5,
                plannedQty: 25,
                returnedQty: 25,
                history: [{ date: today, qty: 25, note: 'ช่างส่งผ้าตัดกลับมาครบ 25 ชุด' }]
              },
              {
                itemId: 'ITEM-2',
                sku: 'Qs-โซฟา3ที่นั่งท้าวแขน-bs3-ดำ-PQ002C-17',
                fabricName: 'ดำ-PQ002C-17',
                yardsPerUnit: 6,
                plannedQty: 10,
                returnedQty: 6,
                history: [{ date: today, qty: 6, note: 'ส่งรอบแรก 6 ชุด (ค้างอีก 4 ชุด)' }]
              },
              {
                itemId: 'ITEM-3',
                sku: 'Qs-โซฟา2ที่นั่งท้าวแขน-bs2-เทา-PQ002C-46',
                fabricName: 'เทา-PQ002C-46',
                yardsPerUnit: 5,
                plannedQty: 26,
                returnedQty: 26,
                history: [{ date: today, qty: 26, note: 'ตรวจรับครบ 26 ชุด' }]
              }
            ]
          }
        ],
        cutterLedger: [
          {
            id: 'CL-001',
            date: today,
            fabricName: 'ดำ-PQ002C-17',
            type: 'DISPATCH_ROLL',
            rolls: 4,
            yardsChange: +200,
            usedYards: -185,
            netBalanceAfter: 15,
            refBatch: 'CUT-W01-PREV',
            note: 'เบิกส่ง 4 ม้วน (200 หลา) ใช้ตัดตามแผน 185 หลา เหลือเศษสะสมที่ช่าง 15 หลา'
          },
          {
            id: 'CL-002',
            date: today,
            fabricName: 'เทา-PQ002C-46',
            type: 'DISPATCH_ROLL',
            rolls: 3,
            yardsChange: +150,
            usedYards: -130,
            netBalanceAfter: 20,
            refBatch: 'CUT-W01-PREV',
            note: 'เบิกส่ง 3 ม้วน (150 หลา) ใช้ตัดตามแผน 130 หลา เหลือเศษสะสมที่ช่าง 20 หลา'
          }
        ]
      };
      this.ensureCutterBalanceEntries();
      this.saveCutterState(false);
    }

    // =========================================================
    // COMPUTED STOCK (Reads 'หลา' from STOCK_APP_DATA_V4 and converts ÷50 to 'ม้วน' ONLY inside fabric-cutter-web)
    // =========================================================
    getComputedFabricStocks() {
      this.loadStockMovementData(false);
      const products = this.stockData.products || [];
      const inbound = this.stockData.inbound || [];
      const outbound = this.stockData.outbound || [];
      const adjustments = this.stockData.adjustments || [];

      const inMap = {};
      const outMap = {};
      const adjMap = {};

      inbound.forEach(item => {
        const pid = item.productId || item.productName;
        const pname = item.productName;
        const qty = Number(item.quantity || 0);
        inMap[pid] = (inMap[pid] || 0) + qty;
        if (pname && pname !== pid) inMap[pname] = (inMap[pname] || 0) + qty;
      });

      outbound.forEach(item => {
        const pid = item.productId || item.productName;
        const pname = item.productName;
        const qty = Number(item.quantity || 0);
        outMap[pid] = (outMap[pid] || 0) + qty;
        if (pname && pname !== pid) outMap[pname] = (outMap[pname] || 0) + qty;
      });

      adjustments.forEach(item => {
        const pid = item.productId || item.productName;
        const pname = item.productName;
        const qty = Number(item.quantity || 0);
        adjMap[pid] = (adjMap[pid] || 0) + qty;
        if (pname && pname !== pid) adjMap[pname] = (adjMap[pname] || 0) + qty;
      });

      const bomFabricSet = new Set(this.getBomFabricMaterials().map(m => m.name.trim().toLowerCase()));

      // Filter products that are in 'ผ้าม้วน' or in BOM fabrics (excluding any legacy FAB- items)
      const fabricProducts = products.filter(p =>
        !String(p.id || '').startsWith('FAB-') &&
        (p.category === 'ผ้าม้วน' || bomFabricSet.has((p.name || '').trim().toLowerCase()))
      );

      return fabricProducts.map(p => {
        const pid = p.id;
        const pname = p.name;
        const isYardUnit = (p.unit || 'หลา') === 'หลา';

        const rawInit = Number(p.initialStock || 0);
        const rawIn = inMap[pid] !== undefined ? inMap[pid] : (inMap[pname] || 0);
        const rawOut = outMap[pid] !== undefined ? outMap[pid] : (outMap[pname] || 0);
        const rawAdj = adjMap[pid] !== undefined ? adjMap[pid] : (adjMap[pname] || 0);
        const rawNet = rawInit + rawIn - rawOut + rawAdj;

        // Convert 'หลา' from Stock Movement -> 'ม้วน' (÷ 50) inside fabric-cutter-web
        const initRolls = isYardUnit ? Math.round((rawInit / YARDS_PER_ROLL) * 100) / 100 : rawInit;
        const inRolls = isYardUnit ? Math.round((rawIn / YARDS_PER_ROLL) * 100) / 100 : rawIn;
        const outRolls = isYardUnit ? Math.round((rawOut / YARDS_PER_ROLL) * 100) / 100 : rawOut;
        const adjRolls = isYardUnit ? Math.round((rawAdj / YARDS_PER_ROLL) * 100) / 100 : rawAdj;

        const warehouseYards = isYardUnit ? Math.round(rawNet * 100) / 100 : Math.round(rawNet * YARDS_PER_ROLL * 100) / 100;
        const warehouseRolls = Math.round((warehouseYards / YARDS_PER_ROLL) * 100) / 100;

        // Look up cutter balance by exact product name or mapped BOM name
        let cutterInfo = this.state.cutterBalance[pname];
        if (!cutterInfo) {
          for (const [bomKey, aliases] of Object.entries(BOM_TO_STOCK_ALIASES)) {
            if (aliases.some(a => a.toLowerCase() === pname.trim().toLowerCase())) {
              const matchedKey = Object.keys(this.state.cutterBalance).find(k => k.toLowerCase() === bomKey);
              if (matchedKey) {
                cutterInfo = this.state.cutterBalance[matchedKey];
                break;
              }
            }
          }
        }
        cutterInfo = cutterInfo || { balanceYards: 0, totalSentRolls: 0, totalSentYards: 0, totalUsedYards: 0 };

        const cutterYards = Math.round((Number(cutterInfo.balanceYards) || 0) * 100) / 100;
        const cutterRolls = Math.round((cutterYards / YARDS_PER_ROLL) * 100) / 100;

        const totalCompanyYards = Math.round((warehouseYards + cutterYards) * 100) / 100;
        const totalCompanyRolls = Math.round((totalCompanyYards / YARDS_PER_ROLL) * 100) / 100;

        const rawMinAlert = Number(p.minAlert || 100);
        const minAlertRolls = isYardUnit ? Math.max(1, Math.round((rawMinAlert / YARDS_PER_ROLL) * 10) / 10) : rawMinAlert;

        const rawPrice = Number(p.unitPrice || 50);
        const unitPriceYard = isYardUnit ? rawPrice : Math.round((rawPrice / YARDS_PER_ROLL) * 100) / 100;
        const unitPriceRoll = isYardUnit ? Math.round(rawPrice * YARDS_PER_ROLL * 100) / 100 : rawPrice;

        const seriesInfo = getFabricSeriesInfo(pname);

        let status = 'OK';
        let statusLabel = 'พร้อมส่งตัด';
        let statusBadge = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        if (warehouseRolls <= 0) {
          status = 'OUT';
          statusLabel = 'หมดสต็อก (ต้องสั่งด่วน)';
          statusBadge = 'bg-rose-100 text-rose-800 border-rose-300';
        } else if (warehouseRolls <= minAlertRolls) {
          status = 'LOW';
          statusLabel = 'สต็อกต่ำ (ควรสั่งเพิ่ม)';
          statusBadge = 'bg-amber-100 text-amber-800 border-amber-300';
        }

        return {
          id: pid,
          name: pname,
          series: seriesInfo.series,
          seriesLabel: seriesInfo.label,
          seriesBadge: seriesInfo.badgeClass,
          unit: 'ม้วน (แปลงจากหลา ÷50)',
          stockUnitInMovement: p.unit || 'หลา',
          initRolls,
          inRolls,
          outRolls,
          adjRolls,
          warehouseRolls,
          warehouseYards,
          cutterYards,
          cutterRolls,
          totalCompanyRolls,
          totalCompanyYards,
          minAlertRolls,
          unitPriceRoll,
          unitPriceYard,
          warehouseValue: Math.round(warehouseYards * unitPriceYard * 100) / 100,
          status,
          statusLabel,
          statusBadge
        };
      });
    }

    // Get recent stock transactions for fabrics only (converting Stock Movement 'หลา' -> 'ม้วน' for display)
    getFabricTransactions() {
      this.loadStockMovementData(false);
      const computed = this.getComputedFabricStocks();
      const fabricNames = new Set(computed.map(f => f.name));
      const fabricIds = new Set(computed.map(f => f.id));

      const txs = [];
      (this.stockData.inbound || []).forEach(item => {
        if (fabricIds.has(item.productId) || fabricNames.has(item.productName)) {
          const rawQty = Number(item.quantity || 0);
          const isRollTx = item.unit === 'ม้วน';
          const yards = isRollTx ? Math.round(rawQty * YARDS_PER_ROLL * 100) / 100 : Math.round(rawQty * 100) / 100;
          const rolls = isRollTx ? rawQty : Math.round((rawQty / YARDS_PER_ROLL) * 100) / 100;
          txs.push({
            ...item,
            txType: 'IN',
            rolls,
            yards,
            detail: `รับผ้าเข้าคลัง (Supplier: ${item.supplier || '-'}) ${item.note ? '• ' + item.note : ''}`
          });
        }
      });

      (this.stockData.outbound || []).forEach(item => {
        if (fabricIds.has(item.productId) || fabricNames.has(item.productName)) {
          const rawQty = Number(item.quantity || 0);
          const isRollTx = item.unit === 'ม้วน';
          const yards = isRollTx ? Math.round(rawQty * YARDS_PER_ROLL * 100) / 100 : Math.round(rawQty * 100) / 100;
          const rolls = isRollTx ? rawQty : Math.round((rawQty / YARDS_PER_ROLL) * 100) / 100;
          txs.push({
            ...item,
            txType: 'OUT',
            rolls,
            yards,
            detail: `เบิกจ่ายผ้า • ${item.dailyUsage || '-'}`
          });
        }
      });

      (this.stockData.adjustments || []).forEach(item => {
        if (fabricIds.has(item.productId) || fabricNames.has(item.productName)) {
          const rawQty = Number(item.quantity || 0);
          const isRollTx = item.unit === 'ม้วน';
          const yards = isRollTx ? Math.round(rawQty * YARDS_PER_ROLL * 100) / 100 : Math.round(rawQty * 100) / 100;
          const rolls = isRollTx ? rawQty : Math.round((rawQty / YARDS_PER_ROLL) * 100) / 100;
          txs.push({
            ...item,
            txType: 'ADJUST',
            rolls,
            yards,
            detail: `ปรับปรุงสต็อก • ${item.note || '-'}`
          });
        }
      });

      return txs.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    // =========================================================
    // STOCK MOVEMENT SYNC ACTIONS (Records in 'หลา' into STOCK_APP_DATA_V4!)
    // =========================================================

    // Receive new fabric rolls into warehouse -> converts rolls * 50 into 'หลา' for STOCK_APP_DATA_V4
    receiveFabricRolls({ fabricName, rolls, yardsInput, unitPriceRoll, supplier, date, note }) {
      this.loadStockMovementData(false);
      const prod = this.findMatchingStockProduct(fabricName);
      if (!prod) throw new Error(`ไม่พบรหัสผ้า ${fabricName} ในระบบ Stock Movement`);

      const rollQty = rolls !== undefined && rolls !== null && rolls !== ''
        ? Number(rolls)
        : Math.round((Number(yardsInput || 0) / YARDS_PER_ROLL) * 100) / 100;

      if (rollQty <= 0) throw new Error('จำนวนม้วนที่รับเข้าต้องมากกว่า 0');

      const yardsTotal = yardsInput !== undefined && yardsInput !== null && yardsInput !== '' && Number(yardsInput) > 0
        ? Math.round(Number(yardsInput) * 100) / 100
        : Math.round(rollQty * YARDS_PER_ROLL * 100) / 100;

      // In Stock Movement, unitPrice is per 'หลา' (e.g. 32 - 54 THB/yard)
      const pricePerYard = unitPriceRoll !== undefined && unitPriceRoll !== ''
        ? (Number(unitPriceRoll) > 200 ? Math.round((Number(unitPriceRoll) / YARDS_PER_ROLL) * 100) / 100 : Number(unitPriceRoll))
        : Number(prod.unitPrice || 50);

      const newId = 'IN-' + String((this.stockData.inbound || []).length + 1).padStart(4, '0');

      const entry = {
        id: newId,
        productId: prod.id,
        productName: prod.name,
        quantity: yardsTotal,
        unit: 'หลา',
        unitPrice: pricePerYard,
        totalValue: Math.round(yardsTotal * pricePerYard * 100) / 100,
        date: date || new Date().toISOString().split('T')[0],
        supplier: supplier || 'โรงงานผ้า/ซัพพลายเออร์',
        note: `${rollQty} ม้วน${note ? ' ' + note : ''}`,
        type: 'IN'
      };

      if (!this.stockData.inbound) this.stockData.inbound = [];
      this.stockData.inbound.unshift(entry);
      this.saveStockMovementData(true);
      this.notify();
      return entry;
    }

    // Dispatch rolls to external cutter -> deducts in 'หลา' from STOCK_APP_DATA_V4 outbound
    dispatchRollsToOutsource({ fabricName, rollsToSend, batchId, cutterName, date }) {
      this.loadStockMovementData(false);
      const prod = this.findMatchingStockProduct(fabricName);
      if (!prod) return null;

      const rollQty = Number(rollsToSend || 0);
      if (rollQty <= 0) return null;

      const newId = 'OUT-' + String((this.stockData.outbound || []).length + 1).padStart(4, '0');
      const yardsSent = Math.round(rollQty * YARDS_PER_ROLL * 100) / 100;

      const entry = {
        id: newId,
        productId: prod.id,
        productName: prod.name,
        quantity: yardsSent,
        unit: 'หลา',
        date: date || new Date().toISOString().split('T')[0],
        dailyUsage: `${rollQty} ม้วน ส่งช่างตัด (${cutterName || 'ช่างตัดนอก'} • ${batchId})`,
        type: 'OUT'
      };

      if (!this.stockData.outbound) this.stockData.outbound = [];
      this.stockData.outbound.unshift(entry);
      this.saveStockMovementData(true);
      return entry;
    }

    // Adjust warehouse stock in rolls -> syncs in 'หลา' to STOCK_APP_DATA_V4 adjustments
    adjustWarehouseRolls({ fabricName, diffRolls, date, note }) {
      this.loadStockMovementData(false);
      const prod = this.findMatchingStockProduct(fabricName);
      if (!prod) throw new Error(`ไม่พบรหัสผ้า ${fabricName}`);

      const qty = Number(diffRolls || 0);
      if (qty === 0) return null;

      const newId = 'ADJ-' + String((this.stockData.adjustments || []).length + 1).padStart(4, '0');
      const yardsDiff = Math.round(qty * YARDS_PER_ROLL * 100) / 100;

      const entry = {
        id: newId,
        productId: prod.id,
        productName: prod.name,
        quantity: yardsDiff,
        unit: 'หลา',
        date: date || new Date().toISOString().split('T')[0],
        note: `ปรับสต็อกผ้า ${qty > 0 ? '+' : ''}${qty} ม้วน (${yardsDiff > 0 ? '+' : ''}${yardsDiff} หลา) ${note ? '• ' + note : ''}`,
        type: 'ADJUST'
      };

      if (!this.stockData.adjustments) this.stockData.adjustments = [];
      this.stockData.adjustments.unshift(entry);
      this.saveStockMovementData(true);
      this.notify();
      return entry;
    }

    // =========================================================
    // WEEKLY PLAN & ROLL DISPATCH CALCULATOR
    // =========================================================

    addWeeklyPlanItem({ dayOfWeek, date, sku, quantity, note }) {
      const qty = Number(quantity || 0);
      if (!sku || qty <= 0) throw new Error('กรุณาระบุรุ่นสินค้า (SKU) และจำนวนที่มากกว่า 0');

      const usages = this.getSkuFabricUsage(sku);
      if (usages.length === 0) {
        throw new Error(`รุ่น "${sku}" ไม่มีส่วนประกอบของผ้า/หนังในสูตร Master BOM`);
      }

      const added = [];
      usages.forEach(u => {
        const totalYards = Math.round(qty * u.yardsPerUnit * 100) / 100;
        const row = {
          id: 'WP-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          dayOfWeek: dayOfWeek || 'จันทร์',
          date: date || new Date().toISOString().split('T')[0],
          sku: sku,
          quantity: qty,
          fabricName: u.fabricName,
          yardsPerUnit: u.yardsPerUnit,
          totalYards: totalYards,
          note: note || ''
        };
        this.state.weeklyPlan.push(row);
        added.push(row);
      });

      this.saveCutterState();
      return added;
    }

    updateWeeklyPlanQuantity(id, newQty) {
      const item = this.state.weeklyPlan.find(r => r.id === id);
      if (!item) return;
      const q = Math.max(1, Number(newQty || 1));
      item.quantity = q;
      item.totalYards = Math.round(q * item.yardsPerUnit * 100) / 100;
      this.saveCutterState();
    }

    removeWeeklyPlanItem(id) {
      this.state.weeklyPlan = this.state.weeklyPlan.filter(r => r.id !== id);
      this.saveCutterState();
    }

    clearWeeklyPlan() {
      this.state.weeklyPlan = [];
      this.saveCutterState();
    }

    // Pull latest batch from BOM Planner (Supabase Cloud + LocalStorage fallback)
    async importFromBomPlannerBatch() {
      let latest = null;
      let sourceLabel = 'LocalStorage';

      // 1. Try fetching latest BOM_PLANNER batch from Central Supabase first
      if (this.supabase) {
        try {
          const { data, error } = await this.supabase
            .from(TABLE_PRODUCTION_BATCHES)
            .select('*')
            .eq('source', 'BOM_PLANNER')
            .order('created_at', { ascending: false })
            .limit(10);

          if (!error && Array.isArray(data) && data.length > 0) {
            latest = data[0];
            sourceLabel = 'Supabase Cloud';
            try {
              localStorage.setItem(BOM_BATCHES_KEY, JSON.stringify(data));
            } catch (e) {}
          }
        } catch (err) {
          console.warn('[FabricStore] Could not fetch BOM_PLANNER batches from Supabase:', err);
        }
      }

      // 2. Fallback to LocalStorage if not found on Cloud
      if (!latest) {
        const raw = localStorage.getItem(BOM_BATCHES_KEY);
        if (!raw) {
          throw new Error('ไม่พบแผนผลิตที่ส่งมาจากระบบ BOM Planner บน Supabase Cloud หรือในเครื่องนี้ (สามารถกด "ส่งแผนเข้าไลน์ผลิต" จากหน้า BOM Planner หรืออัปโหลดไฟล์ออเดอร์ Excel ได้ทันที)');
        }
        const batches = JSON.parse(raw);
        if (!Array.isArray(batches) || batches.length === 0) {
          throw new Error('ยังไม่มีชุดแผนผลิตในประวัติ BOM Planner');
        }
        latest = batches[0];
      }

      const itemsJson = latest.items_json || [];
      if (itemsJson.length === 0) {
        throw new Error('ชุดแผนผลิตล่าสุดไม่มีรายการสินค้า');
      }

      // Group items by SKU + date
      const grouped = new Map();
      itemsJson.forEach(it => {
        const qtyVal = Number(it.qty !== undefined ? it.qty : it.quantity);
        if (isNaN(qtyVal) || qtyVal <= 0) return;
        const sku = it.sku;
        const d = it.date || latest.created_at?.split('T')[0] || new Date().toISOString().split('T')[0];
        const key = `${sku}__${d}`;
        grouped.set(key, (grouped.get(key) || 0) + qtyVal);
      });

      const dayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
      let importedCount = 0;

      grouped.forEach((qty, key) => {
        const [sku, dateStr] = key.split('__');
        const usages = this.getSkuFabricUsage(sku);
        if (usages.length > 0) {
          const dt = new Date(dateStr);
          const dayName = !isNaN(dt) ? dayNames[dt.getDay()] : 'จันทร์';
          usages.forEach(u => {
            this.state.weeklyPlan.push({
              id: 'WP-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
              dayOfWeek: dayName,
              date: dateStr,
              sku,
              quantity: qty,
              fabricName: u.fabricName,
              yardsPerUnit: u.yardsPerUnit,
              totalYards: Math.round(qty * u.yardsPerUnit * 100) / 100,
              note: `ดึงจาก ${latest.batch_id} (${sourceLabel})`
            });
            importedCount++;
          });
        }
      });

      this.saveCutterState();
      return { batchId: latest.batch_id, batchName: latest.batch_name, importedCount, sourceLabel };
    }

    // Calculate Weekly Fabric Requirements & Roll Conversion (50 Yards = 1 Roll)
    calculateWeeklyRollRequirements(customRollsOverride = {}) {
      const fabricStocks = this.getComputedFabricStocks();
      const stockMap = new Map(fabricStocks.map(f => [f.name, f]));

      // Group weeklyPlan by fabricName
      const byFabric = new Map();
      this.state.weeklyPlan.forEach(row => {
        if (!byFabric.has(row.fabricName)) {
          byFabric.set(row.fabricName, {
            fabricName: row.fabricName,
            grossYardsNeeded: 0,
            totalUnitsPlanned: 0,
            skusBreakdown: []
          });
        }
        const entry = byFabric.get(row.fabricName);
        entry.grossYardsNeeded = Math.round((entry.grossYardsNeeded + row.totalYards) * 100) / 100;
        entry.totalUnitsPlanned += row.quantity;
        entry.skusBreakdown.push(row);
      });

      const results = [];
      let totalGrossYards = 0;
      let totalCutterDeductedYards = 0;
      let totalNetYards = 0;
      let totalSuggestedRolls = 0;
      let totalActualRollsToSend = 0;
      let shortageFabricsCount = 0;

      byFabric.forEach(group => {
        const fname = group.fabricName;
        let stockInfo = stockMap.get(fname);
        if (!stockInfo) {
          // Sum across aliased Stock Movement products (e.g. 'ดำ-PQ002C-17' -> 'PD130 (ดำ) TD' + 'PQ002C-17 (ดำ)')
          const aliases = BOM_TO_STOCK_ALIASES[String(fname || '').trim().toLowerCase()] || [];
          const matchedItems = fabricStocks.filter(f =>
            aliases.some(a => a.toLowerCase() === f.name.trim().toLowerCase())
          );
          if (matchedItems.length > 0) {
            const sumYards = matchedItems.reduce((s, x) => s + x.warehouseYards, 0);
            stockInfo = {
              warehouseYards: Math.round(sumYards * 100) / 100,
              warehouseRolls: Math.round((sumYards / YARDS_PER_ROLL) * 100) / 100,
              cutterYards: matchedItems[0].cutterYards,
              cutterRolls: matchedItems[0].cutterRolls,
              unitPriceRoll: matchedItems[0].unitPriceRoll,
              unitPriceYard: matchedItems[0].unitPriceYard
            };
          } else {
            stockInfo = {
              warehouseRolls: 0,
              warehouseYards: 0,
              cutterYards: 0,
              cutterRolls: 0,
              unitPriceRoll: 2500,
              unitPriceYard: 50
            };
          }
        }

        const grossYards = group.grossYardsNeeded;
        const grossExactRolls = Math.round((grossYards / YARDS_PER_ROLL) * 100) / 100;

        // Remnant fabric currently at the external cutter
        const cutterAvailableYards = Math.max(0, Number(this.state.cutterBalance[fname]?.balanceYards || 0));
        const usedFromCutterYards = Math.min(grossYards, cutterAvailableYards);
        const netYardsNeeded = Math.max(0, Math.round((grossYards - usedFromCutterYards) * 100) / 100);
        const netExactRolls = Math.round((netYardsNeeded / YARDS_PER_ROLL) * 100) / 100;

        // Whole rolls needed (50 yards per roll)
        const suggestedWholeRolls = netYardsNeeded > 0 ? Math.ceil(netYardsNeeded / YARDS_PER_ROLL) : 0;
        const actualRollsToSend = customRollsOverride[fname] !== undefined
          ? Math.max(0, Number(customRollsOverride[fname]))
          : suggestedWholeRolls;

        const yardsToSend = Math.round(actualRollsToSend * YARDS_PER_ROLL * 100) / 100;

        // Expected new remnant at cutter after this week's cut = cutterAvailableYards + yardsToSend - grossYards
        const expectedNewCutterBalanceYards = Math.round((cutterAvailableYards + yardsToSend - grossYards) * 100) / 100;
        const expectedNewCutterBalanceRolls = Math.round((expectedNewCutterBalanceYards / YARDS_PER_ROLL) * 100) / 100;

        const warehouseRolls = stockInfo.warehouseRolls;
        const warehouseYards = stockInfo.warehouseYards;
        const remainingWarehouseRolls = Math.round((warehouseRolls - actualRollsToSend) * 100) / 100;
        const shortageRolls = remainingWarehouseRolls < 0 ? Math.abs(remainingWarehouseRolls) : 0;
        const shortageYards = Math.round(shortageRolls * YARDS_PER_ROLL * 100) / 100;

        if (shortageRolls > 0) shortageFabricsCount++;

        totalGrossYards += grossYards;
        totalCutterDeductedYards += usedFromCutterYards;
        totalNetYards += netYardsNeeded;
        totalSuggestedRolls += suggestedWholeRolls;
        totalActualRollsToSend += actualRollsToSend;

        const seriesInfo = getFabricSeriesInfo(fname);

        results.push({
          fabricName: fname,
          seriesLabel: seriesInfo.label,
          seriesBadge: seriesInfo.badgeClass,
          totalUnitsPlanned: group.totalUnitsPlanned,
          skusBreakdown: group.skusBreakdown,
          grossYards,
          grossExactRolls,
          cutterAvailableYards,
          cutterAvailableRolls: Math.round((cutterAvailableYards / YARDS_PER_ROLL) * 100) / 100,
          usedFromCutterYards,
          netYardsNeeded,
          netExactRolls,
          suggestedWholeRolls,
          actualRollsToSend,
          yardsToSend,
          warehouseRolls,
          warehouseYards,
          remainingWarehouseRolls,
          shortageRolls,
          shortageYards,
          expectedNewCutterBalanceYards,
          expectedNewCutterBalanceRolls
        });
      });

      return {
        items: results,
        summary: {
          totalFabricsUsed: results.length,
          totalUnitsPlanned: this.state.weeklyPlan.reduce((s, r) => s + r.quantity, 0),
          totalGrossYards: Math.round(totalGrossYards * 100) / 100,
          totalGrossExactRolls: Math.round((totalGrossYards / YARDS_PER_ROLL) * 100) / 100,
          totalCutterDeductedYards: Math.round(totalCutterDeductedYards * 100) / 100,
          totalNetYards: Math.round(totalNetYards * 100) / 100,
          totalSuggestedRolls,
          totalActualRollsToSend,
          totalYardsToSend: Math.round(totalActualRollsToSend * YARDS_PER_ROLL * 100) / 100,
          shortageFabricsCount
        }
      };
    }

    // Create a Weekly Cutting Batch, Deduct Rolls from Stock Movement, and Update Cutter Balance
    createCuttingBatchFromPlan({ weekLabel, cutterName, note, customRollsOverride = {} }) {
      if (this.state.weeklyPlan.length === 0) {
        throw new Error('ยังไม่มีรายการในแผนผลิตรายสัปดาห์');
      }

      const calc = this.calculateWeeklyRollRequirements(customRollsOverride);
      const today = new Date().toISOString().split('T')[0];
      const rand = Math.floor(100 + Math.random() * 900);
      const batchId = `CUT-${today.replace(/-/g, '').slice(2)}-${rand}`;

      const rollDispatches = [];
      calc.items.forEach(item => {
        // 1. Deduct rolls from Stock Movement App (STOCK_APP_DATA_V4)
        let stockOutTx = null;
        if (item.actualRollsToSend > 0) {
          stockOutTx = this.dispatchRollsToOutsource({
            fabricName: item.fabricName,
            rollsToSend: item.actualRollsToSend,
            batchId,
            cutterName: cutterName || 'ทีมช่างตัดนอก',
            date: today
          });
        }

        // 2. Update Cutter Remnant Balance
        const prevBal = Number(this.state.cutterBalance[item.fabricName]?.balanceYards || 0);
        const newBal = Math.round((prevBal + item.yardsToSend - item.grossYards) * 100) / 100;

        if (!this.state.cutterBalance[item.fabricName]) {
          this.state.cutterBalance[item.fabricName] = {
            balanceYards: 0,
            totalSentRolls: 0,
            totalSentYards: 0,
            totalUsedYards: 0,
            lastUpdated: today
          };
        }
        const cb = this.state.cutterBalance[item.fabricName];
        cb.balanceYards = newBal;
        cb.totalSentRolls = Math.round((cb.totalSentRolls + item.actualRollsToSend) * 100) / 100;
        cb.totalSentYards = Math.round((cb.totalSentYards + item.yardsToSend) * 100) / 100;
        cb.totalUsedYards = Math.round((cb.totalUsedYards + item.grossYards) * 100) / 100;
        cb.lastUpdated = today;

        // 3. Record Cutter Ledger
        this.state.cutterLedger.unshift({
          id: 'CL-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          date: today,
          fabricName: item.fabricName,
          type: 'DISPATCH_ROLL',
          rolls: item.actualRollsToSend,
          yardsChange: item.yardsToSend,
          usedYards: -item.grossYards,
          netBalanceAfter: newBal,
          refBatch: batchId,
          note: `ส่งผ้า ${item.actualRollsToSend} ม้วน (${item.yardsToSend} หลา) • แผนตัดใช้ ${item.grossYards} หลา • คงเหลือสะสมที่ช่าง ${newBal} หลา`
        });

        rollDispatches.push({
          fabricName: item.fabricName,
          grossYardsNeeded: item.grossYards,
          prevCutterBalanceYards: prevBal,
          netYardsNeeded: item.netYardsNeeded,
          rollsSent: item.actualRollsToSend,
          yardsSent: item.yardsToSend,
          expectedRemnantYards: newBal,
          stockOutId: stockOutTx ? stockOutTx.id : null
        });
      });

      // Group SKU items for return verification
      const skuMap = new Map();
      this.state.weeklyPlan.forEach(row => {
        const key = `${row.sku}__${row.fabricName}`;
        if (!skuMap.has(key)) {
          skuMap.set(key, {
            itemId: 'ITEM-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
            sku: row.sku,
            fabricName: row.fabricName,
            yardsPerUnit: row.yardsPerUnit,
            plannedQty: 0,
            returnedQty: 0,
            history: []
          });
        }
        const entry = skuMap.get(key);
        entry.plannedQty += row.quantity;
      });

      const newBatch = {
        batchId,
        weekLabel: weekLabel || `แผนส่งตัดประจำสัปดาห์ (${today})`,
        cutterName: cutterName || 'ทีมช่างตัดนอก',
        createdDate: today,
        status: 'OPEN',
        note: note || '',
        rollDispatches,
        skuItems: Array.from(skuMap.values())
      };

      this.state.cuttingBatches.unshift(newBatch);
      this.state.weeklyPlan = []; // Clear current plan after dispatching
      this.saveCutterState();
      return newBatch;
    }

    // =========================================================
    // CUT-PIECE RETURN VERIFICATION LOOP
    // =========================================================

    recordCutPieceReturn({ batchId, itemId, receiveQty, date, note }) {
      const batch = this.state.cuttingBatches.find(b => b.batchId === batchId);
      if (!batch) throw new Error('ไม่พบใบสั่งตัด');

      const item = batch.skuItems.find(i => i.itemId === itemId);
      if (!item) throw new Error('ไม่พบรุ่นสินค้าในใบสั่งตัด');

      const qty = Number(receiveQty || 0);
      if (qty <= 0) throw new Error('จำนวนชุดที่รับเข้าต้องมากกว่า 0');

      item.returnedQty = Math.min(item.plannedQty, item.returnedQty + qty);
      if (!item.history) item.history = [];
      item.history.unshift({
        date: date || new Date().toISOString().split('T')[0],
        qty,
        note: note || `ตรวจรับผ้าตัดส่งกลับ +${qty} ชุด`
      });

      this.recomputeBatchStatus(batch);
      this.saveCutterState();
      return batch;
    }

    receiveAllRemainingInBatch(batchId) {
      const batch = this.state.cuttingBatches.find(b => b.batchId === batchId);
      if (!batch) throw new Error('ไม่พบใบสั่งตัด');

      const today = new Date().toISOString().split('T')[0];
      batch.skuItems.forEach(item => {
        const remaining = item.plannedQty - item.returnedQty;
        if (remaining > 0) {
          item.returnedQty = item.plannedQty;
          if (!item.history) item.history = [];
          item.history.unshift({
            date: today,
            qty: remaining,
            note: `ตรวจรับครบตามจำนวนสั่งตัด (+${remaining} ชุด)`
          });
        }
      });

      this.recomputeBatchStatus(batch);
      this.saveCutterState();
      return batch;
    }

    recomputeBatchStatus(batch) {
      let totalPlanned = 0;
      let totalReturned = 0;
      batch.skuItems.forEach(i => {
        totalPlanned += i.plannedQty;
        totalReturned += i.returnedQty;
      });
      if (totalReturned === 0) {
        batch.status = 'OPEN';
      } else if (totalReturned >= totalPlanned) {
        batch.status = 'COMPLETED';
      } else {
        batch.status = 'PARTIAL';
      }
    }

    // Manually adjust cutter remnant balance (e.g. physical count at cutter or fabric loss/return)
    adjustCutterBalance({ fabricName, actualYardsAtCutter, returnToWarehouseRolls = 0, note }) {
      const today = new Date().toISOString().split('T')[0];
      if (!this.state.cutterBalance[fabricName]) {
        this.state.cutterBalance[fabricName] = {
          balanceYards: 0,
          totalSentRolls: 0,
          totalSentYards: 0,
          totalUsedYards: 0,
          lastUpdated: today
        };
      }

      const cb = this.state.cutterBalance[fabricName];
      const oldYards = cb.balanceYards;
      const newYards = Math.round(Number(actualYardsAtCutter || 0) * 100) / 100;
      const diffYards = Math.round((newYards - oldYards) * 100) / 100;

      cb.balanceYards = newYards;
      cb.lastUpdated = today;

      if (Number(returnToWarehouseRolls) > 0) {
        this.receiveFabricRolls({
          fabricName,
          rolls: Number(returnToWarehouseRolls),
          supplier: 'รับคืนม้วนผ้าจากช่างตัดนอก',
          date: today,
          note: note || 'ช่างนอกส่งคืนม้วนผ้ากลับคลัง'
        });
      }

      this.state.cutterLedger.unshift({
        id: 'CL-' + Date.now(),
        date: today,
        fabricName,
        type: 'ADJUST_BALANCE',
        rolls: Math.round((diffYards / YARDS_PER_ROLL) * 100) / 100,
        yardsChange: diffYards,
        usedYards: 0,
        netBalanceAfter: newYards,
        refBatch: 'RECONCILE',
        note: `ปรับยอดผ้าค้างที่ช่าง จาก ${oldYards} หลา ➔ เป็น ${newYards} หลา (${note || 'ตรวจนับจริงที่ช่าง'})`
      });

      this.saveCutterState();
    }

    subscribe(fn) {
      this.listeners.push(fn);
    }

    notify() {
      this.listeners.forEach(fn => fn(this));
    }
  }

  window.FabricStore = new FabricCutterStore();
  window.getFabricSeriesInfo = getFabricSeriesInfo;
})(window);
