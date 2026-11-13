/**
 * QueenCosy Admin Routine Workspace Module (admin-routine.js)
 * Integrates the 3 Real-World Admin Google Sheets into Fabric Roll & Outsource Cutter Monitor:
 *  1) ใบเบิกผ้า ช่างตัด 69 (Cutting Matrix, Khun Boon Formula, Roll/Yard Dispatch, Cutter Remnant Recheck, Cutting Labor Cost)
 *  2) สั่งตัดนอก (Outsource Production Order Sheet with L-Mini Left/Right split, Extra Spare Parts Cutting, Monthly Cutter Billing, Table Remnant 10/8)
 *  3) ตรวจสอบการทำงานช่างเดือน 11.69 (ผ้าจับชุดตัด-เย็บ: Unsewn + Sewn Cut-Fabric Stock minus Pre-Order -> Auto Shortage Detection, Low Stock CS/BS/LU Matrix, Wood Frame Stock & Upholsterer Roster)
 *
 * Synced in real time across all devices via window.FabricStore (Supabase Cloud: QC_FABRIC_CUTTER_STATE_V1)
 */

(function (window) {
  'use strict';

  // =========================================================================
  // 1. MASTER DEFINITIONS FOR ADMIN ROUTINE MATRIX
  // =========================================================================

  // Columns in Admin's "ใบเบิกผ้า ช่างตัด 69" & "สั่งตัดนอก"
  const ROUTINE_MODELS = [
    { key: 'cs2', label: 'CS2 / 2PL - New', shortLabel: '2 PL', yardsPerUnit: 3.20, yards: 3.20, legs: 6, gear: 0, piecesPerRoll: 15, cutWage: 10 },
    { key: 'cs3', label: 'CS3 / 3PL - New', shortLabel: '3 PL', yardsPerUnit: 4.33, yards: 4.33, legs: 6, gear: 0, piecesPerRoll: 11, cutWage: 10 },
    { key: 'arm', label: 'เฉพาะแขน (New)', shortLabel: 'แขน New', yardsPerUnit: 1.93, yards: 1.93, legs: 0, gear: 0, piecesPerRoll: 25, cutWage: 8 },
    { key: 'rs',  label: 'RS หัวกระดก', shortLabel: 'กระดก', yardsPerUnit: 6.26, yards: 6.26, legs: 6, gear: 1, piecesPerRoll: 7, cutWage: 20 },
    { key: 'ln3', label: 'LN3 กระดุม 19 เม็ด', shortLabel: 'กระดุม 19 เม็ด', yardsPerUnit: 6.21, yards: 6.21, legs: 6, gear: 0, piecesPerRoll: 8, cutWage: 20 },
    { key: 'ln5', label: 'LN กระดุม 5 เม็ด', shortLabel: 'กระดุม 5 เม็ด', yardsPerUnit: 6.17, yards: 6.17, legs: 6, gear: 0, piecesPerRoll: 8, cutWage: 20 },
    { key: 'rc',  label: 'PN Lit ปรับนอน', shortLabel: 'ปรับนอน', yardsPerUnit: 6.65, yards: 6.65, legs: 6, gear: 1, piecesPerRoll: 7, cutWage: 20 },
    { key: 'lmini', label: 'L Mini (รวม ซ้าย+ขวา)', shortLabel: 'L-mini', yardsPerUnit: 8.97, yards: 8.97, legs: 8, gear: 0, piecesPerRoll: 5, cutWage: 30, hasLR: true },
    { key: 'lbig',  label: 'L ใหญ่', shortLabel: 'L ใหญ่', yardsPerUnit: 11.00, yards: 11.00, legs: 10, gear: 0, piecesPerRoll: 4, cutWage: 30 }
  ];

  // Master Fabric Rows in Admin's Routine Table (mapped to Stock Movement fabricName)
  const ROUTINE_FABRICS = [
    { sku: 'PQ002C-06', shortCode: 'PQ002C-6', aliases: ['pq002c-06', 'pq002c-6', 'pq002c-1', 'pq002c-01', 'c-06', 'c-6', 'หนังครีม', 'ครีมเรียบ'], color: 'ครีม', group: 'PVC หนัง', price: 32, stockName: 'ครีม-PQ002C-6' },
    { sku: 'PQ002C-12', shortCode: 'PQ002C-12', aliases: ['pq002c-12', 'c-12', 'หนังน้ำตาล', 'น้ำตาลเรียบ'], color: 'น้ำตาล', group: 'PVC หนัง', price: 32, stockName: 'น้ำตาล-PQ002C-12' },
    { sku: 'PQ002C-19', shortCode: 'PQ002C-19', aliases: ['pq002c-19', 'c-19', 'หนังชา', 'ชาเรียบ'], color: 'ชา', group: 'PVC หนัง', price: 32, stockName: 'ชา-PQ002C-19' },
    { sku: 'PQ002C-17', shortCode: 'PQ002C-17', aliases: ['pq002c-17', 'c-17', 'หนังดำ', 'ดำเรียบ'], color: 'ดำ', group: 'PVC หนัง', price: 30, stockName: 'ดำ-PQ002C-17' },
    { sku: 'PQ002C-46', shortCode: 'PQ002C-46', aliases: ['pq002c-46', 'pq002c-28', 'c-46', 'c-28', 'หนังเทา', 'เทาเรียบ'], color: 'เทา', group: 'PVC หนัง', price: 32, stockName: 'เทา-PQ002C-46' },
    { sku: 'PQ002C-48', shortCode: 'PQ002C-48', aliases: ['pq002c-48', 'c-48', 'หนังมอคค่า', 'มอคค่าเรียบ', 'มอคค่า'], color: 'มอค่า', group: 'PVC หนัง', price: 32, stockName: 'มอคค่า-PQ002C-48' },
    { sku: 'MJ 356-1A', shortCode: '356-1A', aliases: ['mj356-1a', 'mj 356-1a', '356-1a', 'pkd 356-1a', 'mj350-4', '350-04', '350-4', 'lf ครีม', 'ลูกฟูกสีครีม', 'ครีมลูกฟูก'], color: 'LF ครีม', group: 'ลูกฟูก', price: 32, stockName: 'สีครีม-MJ356-1a' },
    { sku: 'MJ 356-2A', shortCode: '356-2A', aliases: ['mj356-2a', 'mj 356-2a', '356-2a', 'pkd 356-2a', 'lf เขียว', 'ลูกฟูกสีเขียว', 'เขียวลูกฟูก'], color: 'LF เขียว', group: 'ลูกฟูก', price: 53, stockName: 'สีเขียว-MJ356-2a' },
    { sku: 'MJ 356-3A', shortCode: '356-3A', aliases: ['mj356-3a', 'mj 356-3a', '356-3a', 'pkd 356-3a', 'lf เทา', 'ลูกฟูกสีเทา', 'ลูกฟูกเทา'], color: 'LF เทา', group: 'ลูกฟูก', price: 53, stockName: 'สีเทา-MJ356-3a' },
    { sku: 'MJ 356-4A', shortCode: '356-4A', aliases: ['mj356-4a', 'mj 356-4a', '356-4a', 'pkd 356-4a', 'lf น้ำตาล', 'lf  น้ำตาล', 'ลูกฟูกสีน้ำตาล'], color: 'LF น้ำตาล', group: 'ลูกฟูก', price: 53, stockName: 'สีน้ำตาล-MJ356-4a' },
    { sku: '337-07', shortCode: '337-7', aliases: ['337-07', '337-7', 'mj337-7', 'mj337-07', 'ฮอลแลนด์น้ำตาล', 'น้ำตาลฮอลแลนด์'], color: 'น้ำตาลทอง', group: 'Hollan', price: 53, stockName: 'สีน้ำตาล-MJ337-7' },
    { sku: '337-08', shortCode: '337-8', aliases: ['337-08', '337-8', 'mj337-8'], color: 'น้ำตาล', group: 'Hollan', price: 53, stockName: 'สีน้ำตาล-MJ337-7' },
    { sku: '337-14', shortCode: '337-14', aliases: ['337-14', 'mj337-14', 'ฮอลแลนด์เขียว', 'ฮอลแลนด์สีเขียว'], color: 'เขียว', group: 'Hollan', price: 53, stockName: 'สีเขียว-MJ337-14' },
    { sku: '337-22', shortCode: '337-22', aliases: ['337-22', 'mj337-22', 'โรสโกลด์', 'ฮอลแลนด์โรสโกลด์'], color: 'โรสโกลด์', group: 'Hollan', price: 53, stockName: 'สีโรสโกลด์-MJ337-22' },
    { sku: '337-23', shortCode: '337-23', aliases: ['337-23', 'mj337-23', 'ฮอลแลนด์แดง', 'ฮอลแลนด์สีแดง'], color: 'แดง', group: 'Hollan', price: 53, stockName: 'สีแดงมะเหมี่ยว-MJ337-23' },
    { sku: '337-26', shortCode: '337-26', aliases: ['337-26', '337-28', '337-25', 'เทาอ่อน'], color: 'เทาอ่อน', group: 'Hollan', price: 53, stockName: 'สีเทา-MJ337-29' },
    { sku: '337-29', shortCode: '337-29', aliases: ['337-29', 'mj337-29', 'เทาควัน', 'ฮอลแลนด์เทา', 'เทาฮอลแลนด์'], color: 'เทาควัน', group: 'Hollan', price: 53, stockName: 'สีเทา-MJ337-29' },
    { sku: '337-30', shortCode: '337-30', aliases: ['337-30', 'เทาอมเขียว'], color: 'เทาอมเขียว', group: 'Hollan', price: 53, stockName: 'สีเทา-MJ337-29' },
    { sku: '337-31', shortCode: '337-31', aliases: ['337-31', 'mj337-31', 'ฮอลแลนด์น้ำเงิน', 'น้ำเงินฮอลแลนด์'], color: 'น้ำเงิน', group: 'Hollan', price: 53, stockName: 'สีน้ำเงิน-MJ337-31' },
    { sku: '736B-01', shortCode: '736-01', aliases: ['736b-01', '736-01', 'pkd 739b-01', 'นาโนน้ำตาลทอง'], color: 'ครีม (น้ำตาลทอง)', group: 'นาโน', price: 54, stockName: 'สีน้ำตาลทอง-736b-01' },
    { sku: '736B-02', shortCode: '736-02', aliases: ['736b-02', '736-02', '736b-0', 'pkd 739b-02', 'นาโนเทาเข้ม', 'เทาเข้ม'], color: 'เทาเข้ม', group: 'นาโน', price: 54, stockName: 'สีเทาเข้ม-736b-02' },
    { sku: '736B-04', shortCode: '736-04', aliases: ['736b-04', '736-04', 'mj350-9', '350-09', 'ฟ้าเทา'], color: 'ฟ้าเทา', group: 'นาโน', price: 54, stockName: 'สีฟ้าเทา-736b-04' }
  ];

  function createEmptyRow(fab) {
    return {
      sku: fab.sku,
      shortCode: fab.shortCode || fab.sku,
      color: fab.color,
      group: fab.group,
      price: fab.price,
      stockName: fab.stockName,
      cs2: 0, cs3: 0, arm: 0, rs: 0, ln3: 0, ln5: 0, rc: 0, lminiL: 0, lminiR: 0, lmini: 0, lbig: 0,
      orderRollsText: '',
      sentYards: 0,
      carriedYards: 0,
      actualCutterRemnant: '0.00',
      note: '',
      outsourceNote: ''
    };
  }

  function buildRoundRows(overrides) {
    return ROUTINE_FABRICS.map(fab => {
      const base = createEmptyRow(fab);
      const ov = overrides[fab.sku];
      if (!ov) return base;
      const merged = { ...base, ...ov };
      if ((merged.lminiL || merged.lminiR) && !ov.lmini) {
        merged.lmini = Number(merged.lminiL || 0) + Number(merged.lminiR || 0);
      } else if (merged.lmini && !merged.lminiL && !merged.lminiR) {
        merged.lminiR = merged.lmini;
      }
      return merged;
    });
  }

  // =========================================================================
  // 2. INITIAL REAL ADMIN DATA FROM THE 3 GOOGLE SHEETS
  // =========================================================================
  function getInitialAdminRoutineData() {
    // Round 3 (Nov 69) - Standard & Khun Boon Formula (09/11/69, ส่งผ้า 13/11/69)
    const round3Overrides = {
      'PQ002C-06': { cs3: 50, arm: 50, orderRollsText: '7 ม้วน', sentYards: 1050, carriedYards: 0, actualCutterRemnant: '0.00', note: 'ไม่ตรง' },
      'PQ002C-12': { rs: 40, ln3: 5, rc: 50, lminiL: 3, lminiR: 0, lmini: 3, orderRollsText: '13 ม้วน', sentYards: 1350, carriedYards: 0, actualCutterRemnant: '0.00', note: 'ไม่ตรง' },
      'PQ002C-19': { orderRollsText: '25 ม้วน', sentYards: 0, carriedYards: 0, actualCutterRemnant: '', note: 'ไม่ตรง' },
      'PQ002C-17': { ln3: 5, rc: 15, lminiL: 1, lminiR: 0, lmini: 1, orderRollsText: '3 ม้วน TODA', sentYards: 900, carriedYards: 50, actualCutterRemnant: '0.00', note: 'ไม่ตรง' },
      'PQ002C-46': { rc: 30, lminiL: 0, lminiR: 2, lmini: 2, orderRollsText: '5 ม้วน', sentYards: 1200, carriedYards: 0, actualCutterRemnant: '0.00', note: 'ไม่ตรง' },
      'PQ002C-48': { rs: 15, rc: 20, lminiL: 0, lminiR: 1, lmini: 1, orderRollsText: '5 ม้วน TODA', sentYards: 1150, carriedYards: 0, actualCutterRemnant: '0.00', note: 'ไม่ตรง' },
      'MJ 356-1A': { rc: 5, lminiL: 2, lminiR: 0, lmini: 2, orderRollsText: 'ใช้ผ้าที่มี', sentYards: 152.6, carriedYards: 60.4, actualCutterRemnant: '60.4+เศษกลาง', note: 'น้อยกว่า' },
      'MJ 356-2A': { orderRollsText: '', sentYards: 62.4, carriedYards: 0, actualCutterRemnant: 'เศษกลาง', note: 'มากกว่า' },
      'MJ 356-3A': { lminiL: 0, lminiR: 1, lmini: 1, orderRollsText: 'ใช้ผ้าที่มี', sentYards: 241.0, carriedYards: 29.0, actualCutterRemnant: '29+เศษ', note: 'น้อยกว่า' },
      'MJ 356-4A': { lminiL: 1, lminiR: 0, lmini: 1, orderRollsText: 'ใช้ผ้าที่มี', sentYards: 234.0, carriedYards: 47.2, actualCutterRemnant: '47.2+เศษ', note: 'น้อยกว่า' },
      '337-07': { lminiL: 1, lminiR: 0, lmini: 1, orderRollsText: 'ใช้ผ้าที่มี', sentYards: 347.3, carriedYards: 56.7, actualCutterRemnant: '56.7+เศษ', note: 'น้อยกว่า' },
      '337-14': { sentYards: 58.7, carriedYards: 0, actualCutterRemnant: 'เศษกลาง', note: 'ประมาณ' },
      '337-22': { ln3: 10, orderRollsText: 'ใช้ผ้าที่มี', sentYards: 698.6, carriedYards: 103.9, actualCutterRemnant: '103.90', note: 'น้อยกว่า' },
      '337-23': { cs3: 30, arm: 30, orderRollsText: '', sentYards: 71.4, carriedYards: 0, actualCutterRemnant: '0.00', note: 'ซับส่ง 1 ม้วน' },
      '337-29': { ln3: 10, lminiL: 1, lminiR: 3, lmini: 4, orderRollsText: '2 ม้วน MJ', sentYards: 890.2, carriedYards: 56.8, actualCutterRemnant: '0.00', note: 'ไม่ตรง' },
      '337-31': { sentYards: 359.4, carriedYards: 0, actualCutterRemnant: 'เศษกลาง', note: 'ประมาณ', outsourceNote: 'สั่งตัดนอก LN3=3, L-mini ขวา=1' },
      '736B-01': { ln5: 20, orderRollsText: '2 ม้วน MJ', sentYards: 639.0, carriedYards: 59.2, actualCutterRemnant: '59.20', note: 'มากกว่า' },
      '736B-02': { ln5: 30, rc: 5, lminiL: 0, lminiR: 5, lmini: 5, orderRollsText: '5 ม้วน MJ', sentYards: 539.7, carriedYards: 48.34, actualCutterRemnant: 'เศษกลาง', note: 'ประมาณ' },
      '736B-04': { lminiL: 0, lminiR: 13, lmini: 13, orderRollsText: '2 ม้วน MJ', sentYards: 0, carriedYards: 0, actualCutterRemnant: '0.00', note: 'ประมาณ' }
    };

    // Round 2 (Nov 69) - 30/10/69 (ส่งผ้า 01-05/11/69, รวม 2,692 ชุด)
    const round2Overrides = {
      'PQ002C-06': { cs3: 100, arm: 160, rs: 20, rc: 20, lminiL: 0, lminiR: 1, lmini: 1, orderRollsText: '21 ม้วน', sentYards: 1050, carriedYards: 0, actualCutterRemnant: '0.00', note: 'ไม่ตรง' },
      'PQ002C-12': { cs3: 100, arm: 185, rs: 40, ln3: 20, rc: 30, lminiL: 3, lminiR: 2, lmini: 5, orderRollsText: '27 ม้วน', sentYards: 1350, carriedYards: 0, actualCutterRemnant: '0.00', note: 'ไม่ตรง' },
      'PQ002C-19': { orderRollsText: '25 ม้วน', sentYards: 0, carriedYards: 0, actualCutterRemnant: '', note: 'ไม่ตรง' },
      'PQ002C-17': { cs3: 100, arm: 180, rs: 20, lminiL: 0, lminiR: 2, lmini: 2, orderRollsText: '18 ม้วน TODA', sentYards: 900, carriedYards: 50, actualCutterRemnant: '0.00', note: 'ไม่ตรง' },
      'PQ002C-46': { cs3: 100, arm: 120, rs: 40, rc: 30, lminiL: 1, lminiR: 3, lmini: 4, orderRollsText: '24 ม้วน', sentYards: 1200, carriedYards: 0, actualCutterRemnant: '0.00', note: 'ไม่ตรง' },
      'PQ002C-48': { cs3: 100, arm: 185, rs: 20, rc: 30, lminiL: 1, lminiR: 2, lmini: 3, orderRollsText: '24 ม้วน TODA', sentYards: 1150, carriedYards: 0, actualCutterRemnant: '0.00', note: 'ไม่ตรง' },
      'MJ 356-1A': { lminiL: 7, lminiR: 5, lmini: 12, orderRollsText: '3 ม้วน MJ', sentYards: 152.6, carriedYards: 60, actualCutterRemnant: '60.4+เศษกลาง', note: 'น้อยกว่า' },
      'MJ 356-2A': { lminiL: 2, lminiR: 4, lmini: 6, orderRollsText: '1 ม้วน PKD', sentYards: 62.4, carriedYards: 0, actualCutterRemnant: 'เศษกลาง', note: 'มากกว่า' },
      'MJ 356-3A': { lminiL: 9, lminiR: 12, lmini: 21, orderRollsText: '4 ม้วน MJ', sentYards: 241.0, carriedYards: 0, actualCutterRemnant: '29+เศษ', note: 'น้อยกว่า' },
      'MJ 356-4A': { lminiL: 8, lminiR: 10, lmini: 18, orderRollsText: '4 ม้วน MJ ใหญ่', sentYards: 234.0, carriedYards: 0, actualCutterRemnant: '47.2+เศษ', note: 'น้อยกว่า' },
      '337-07': { cs3: 40, arm: 40, lminiL: 0, lminiR: 1, lmini: 1, orderRollsText: '6 ม้วน MJ', sentYards: 347.3, carriedYards: 0, actualCutterRemnant: '56.7+เศษ', note: 'น้อยกว่า' },
      '337-14': { lminiL: 0, lminiR: 1, lmini: 1, orderRollsText: '1 ม้วน MJ', sentYards: 58.7, carriedYards: 0, actualCutterRemnant: 'เศษกลาง', note: 'ประมาณ' },
      '337-22': { cs3: 80, arm: 145, lminiL: 0, lminiR: 1, lmini: 1, orderRollsText: '13 ม้วน MJ', sentYards: 698.6, carriedYards: 55.5, actualCutterRemnant: '103.90', note: 'น้อยกว่า' },
      '337-23': { cs3: 20, arm: 78, lminiL: 0, lminiR: 1, lmini: 1, orderRollsText: '5 ม้วน MJ', sentYards: 71.4, carriedYards: 0, actualCutterRemnant: '0.00', note: 'ซับส่ง 1 ม้วน' },
      '337-29': { cs3: 100, arm: 150, rc: 20, lminiL: 1, lminiR: 1, lmini: 2, orderRollsText: '18 ม้วน MJ', sentYards: 890.2, carriedYards: 56.8, actualCutterRemnant: '0.00', note: 'ไม่ตรง', outsourceNote: 'L-mini ใช้ 337-29 ถ้าผ้าเหลือตัดรุ่นอื่นได้เลยค่ะ' },
      '337-31': { cs3: 40, arm: 80, orderRollsText: '7 ม้วน MJ', sentYards: 359.4, carriedYards: 0, actualCutterRemnant: 'เศษกลาง', note: 'ประมาณ' },
      '736B-01': { rs: 20, ln5: 70, lminiL: 7, lminiR: 5, lmini: 12, orderRollsText: '12 ม้วน MJ', sentYards: 639.0, carriedYards: 59.2, actualCutterRemnant: '59.20', note: 'มากกว่า', outsourceNote: 'มีของเก่า ซับ PKD 1 ม้วน + ครึ่ง' },
      '736B-02': { ln5: 55, lminiL: 10, lminiR: 14, lmini: 24, orderRollsText: '10 ม้วน MJ', sentYards: 539.7, carriedYards: 48.34, actualCutterRemnant: 'เศษกลาง', note: 'ประมาณ', outsourceNote: 'มีของเก่า ซับ PKD 1 ม้วน + ครึ่ง' },
      '736B-04': { ln5: 30, lminiL: 6, lminiR: 4, lmini: 10, orderRollsText: '5 ม้วน MJ', sentYards: 295.2, carriedYards: 40.0, actualCutterRemnant: 'เศษกลาง', note: 'ประมาณ', outsourceNote: 'ซับ PKD 1 ม้วน' }
    };

    // Round 1 (Nov 69) - 24/10/69 (ส่งผ้า 26-28/10/69, รวม 636 ชุด)
    const round1Overrides = {
      'PQ002C-06': { rs: 20, ln3: 10, rc: 5, lminiL: 4, lminiR: 3, lmini: 7, orderRollsText: '6 ม้วน', sentYards: 300, carriedYards: 0, actualCutterRemnant: '0.00', note: 'ตรง' },
      'PQ002C-12': { cs3: 40, rs: 45, rc: 20, lminiL: 3, lminiR: 7, lmini: 10, orderRollsText: '13 ม้วน', sentYards: 650, carriedYards: 50, actualCutterRemnant: '0.00', note: 'ตรง' },
      'PQ002C-19': { orderRollsText: '1 ม้วน', sentYards: 0, carriedYards: 0, actualCutterRemnant: '0.00', note: '' },
      'PQ002C-17': { lminiL: 2, lminiR: 1, lmini: 3, orderRollsText: 'ใช้ผ้าที่มี', sentYards: 0, carriedYards: 50, actualCutterRemnant: '50.00', note: 'ใช้ผ้าที่มี' },
      'PQ002C-46': { arm: 40, ln3: 5, rc: 30, lminiL: 2, lminiR: 2, lmini: 4, orderRollsText: '7 ม้วน', sentYards: 350, carriedYards: 0, actualCutterRemnant: '0.00', note: 'ตรง' },
      'PQ002C-48': { rs: 30, rc: 25, lminiL: 1, lminiR: 2, lmini: 3, orderRollsText: '8 ม้วน MJ', sentYards: 400, carriedYards: 0, actualCutterRemnant: '0.00', note: 'ตรง' },
      'MJ 356-1A': { sentYards: 0, carriedYards: 60, actualCutterRemnant: '60+เศษ', note: 'ยกไปรอบถัดไป' },
      'MJ 356-2A': { lminiL: 4, lminiR: 6, lmini: 10, orderRollsText: '2 ม้วน PKD', sentYards: 118.1, carriedYards: 0, actualCutterRemnant: 'เศษกลาง', note: 'ประมาณ' },
      'MJ 356-3A': { lminiL: 7, lminiR: 12, lmini: 19, orderRollsText: '4 ม้วน MJ', sentYards: 219.0, carriedYards: 0, actualCutterRemnant: 'เศษกลาง', note: 'ประมาณ' },
      '337-22': { ln3: 5, orderRollsText: 'ใช้ผ้าที่มี', sentYards: 0, carriedYards: 55.5, actualCutterRemnant: '55.50', note: 'ใช้ผ้าที่มี' },
      '337-29': { rc: 10, lminiL: 2, lminiR: 1, lmini: 3, orderRollsText: '1 ม้วน MJ 25', sentYards: 58.4, carriedYards: 56.8, actualCutterRemnant: '56.80', note: 'L-mini ใช้ 337-25 ถ้าผ้าเหลือต่อกระดุมใช้ 337-29' },
      '736B-01': { ln5: 80, lminiL: 9, lminiR: 9, lmini: 18, orderRollsText: '12 ม้วน PKD', sentYards: 720.9, carriedYards: 59.2, actualCutterRemnant: '59.2+เศษกลาง', note: 'ประมาณ' },
      '736B-02': { rs: 20, ln3: 10, ln5: 90, lminiL: 16, lminiR: 12, lmini: 28, orderRollsText: '18 ม้วน PKD+MJ', sentYards: 1011.69, carriedYards: 109.47, actualCutterRemnant: '48.34+เศษกลาง', note: 'ซับ PKD 3 ม้วน + MJ 15 ม้วน' },
      '736B-04': { ln5: 20, lminiL: 11, lminiR: 15, lmini: 26, orderRollsText: '6 ม้วน PKD', sentYards: 337.48, carriedYards: 55.7, actualCutterRemnant: '40.00', note: 'ซับ PKD 1 ม้วน + MJ 5 ม้วน' }
    };

    const rounds = [
      {
        id: 'ROUND-NOV69-3',
        name: 'พ.ย รอบที่ 3 (09/11/69 • ยอด Pre #13-21 พ.ย)',
        calcDate: '2026-11-09',
        sendDate: '2026-11-13',
        preOrderRange: 'ยอด Pre วันที่ #13-21 พ.ย. 69',
        cutterTeam: 'ร้านตัดดอนเมือง / ช่าง P\'บุญ',
        formulaMode: 'STANDARD', // STANDARD (รวมหลา÷50) or BOON (แยกม้วนตามรุ่น)
        extraNote: 'ตัดอะไหล่ที่ขาด L-mini เพิ่ม (ไม่มีค่าใช้จ่าย): 1) 356-1A ลูกฟูกครีมอ่อน (ที่นั่ง 2 ที่) ฝั่งขวา  2) 356-1A ลูกฟูกครีมอ่อน (ที่นั่งเบด เข้ามุม) ฝั่งซ้าย',
        rows: buildRoundRows(round3Overrides)
      },
      {
        id: 'ROUND-NOV69-3-BOON',
        name: 'พ.ย รอบที่ 3 (สูตรคุณบุญ • แยกม้วนตามรุ่น)',
        calcDate: '2026-11-07',
        sendDate: '2026-11-13',
        preOrderRange: 'ยอด Pre วันที่ #13-21 พ.ย. 69 (คำนวณม้วนแยกตามรุ่น)',
        cutterTeam: 'ช่าง P\'บุญ (สูตรคำนวณม้วนแยกรุ่น)',
        formulaMode: 'BOON',
        extraNote: 'คำนวณจำนวนม้วนแยกตามสัดส่วนรุ่น (1:15, 1:11, 1:25, 1:7, 1:8, 1:5) พร้อมรวมยอดหลาส่งจริงจากรอบ 2',
        rows: buildRoundRows(round3Overrides)
      },
      {
        id: 'ROUND-NOV69-2',
        name: 'พ.ย รอบที่ 2 (30/10/69 • ยอด Pre #8-12 พ.ย • 2,692 ชุด)',
        calcDate: '2026-10-30',
        sendDate: '2026-11-01',
        preOrderRange: 'ยอด Pre วันที่ #8-12 พ.ย. 69 (ส่งผ้า 1-5/11/69)',
        cutterTeam: 'ร้านตัดดอนเมือง / ช่างนอก',
        formulaMode: 'STANDARD',
        extraNote: '*แขนขอตัดเพิ่มเพื่อให้บาลานซ์กับตัว CS3/BS3/LU3',
        rows: buildRoundRows(round2Overrides)
      },
      {
        id: 'ROUND-NOV69-1',
        name: 'พ.ย รอบที่ 1 (24/10/69 • ยอด Pre #1-7 พ.ย • 636 ชุด)',
        calcDate: '2026-10-24',
        sendDate: '2026-10-26',
        preOrderRange: 'ยอด Pre วันที่ #1-7 พ.ย. 69 (ส่งผ้า 26-28/10/69)',
        cutterTeam: 'ร้านตัดดอนเมือง / ช่างนอก',
        formulaMode: 'STANDARD',
        extraNote: 'ตัดรอบที่ 1 เดือน พ.ย. 69 (ครบทุกชุด)',
        rows: buildRoundRows(round1Overrides)
      }
    ];

    // Sheet 3: "ผ้าจับชุดตัด-เย็บ" (Cut-Fabric Stock: Unsewn + Sewn minus Pre-Order 7-21 Nov)
    const cutSewStockStandard = [
      // กระดุม 19 เม็ด LN3
      { id: 'CS-LN3-01', modelKey: 'ln3', modelName: 'กระดุม 19 เม็ด (LN3)', fabricType: 'PVC', sku: 'PQ002C-01', color: 'ขาว', unsewn: 0, sewn: 3, preOrder: 2 },
      { id: 'CS-LN3-02', modelKey: 'ln3', modelName: 'กระดุม 19 เม็ด (LN3)', fabricType: 'PVC', sku: 'PQ002C-06', color: 'ครีม', unsewn: 0, sewn: 10, preOrder: 14 },
      { id: 'CS-LN3-03', modelKey: 'ln3', modelName: 'กระดุม 19 เม็ด (LN3)', fabricType: 'PVC', sku: 'PQ002C-12', color: 'น้ำตาล', unsewn: 20, sewn: 6, preOrder: 26 },
      { id: 'CS-LN3-04', modelKey: 'ln3', modelName: 'กระดุม 19 เม็ด (LN3)', fabricType: 'PVC', sku: 'PQ002C-17', color: 'ดำ', unsewn: 0, sewn: 11, preOrder: 10 },
      { id: 'CS-LN3-05', modelKey: 'ln3', modelName: 'กระดุม 19 เม็ด (LN3)', fabricType: 'PVC', sku: 'PQ002C-19', color: 'ชา', unsewn: 0, sewn: 2, preOrder: 3 },
      { id: 'CS-LN3-06', modelKey: 'ln3', modelName: 'กระดุม 19 เม็ด (LN3)', fabricType: 'PVC', sku: 'PQ002C-46', color: 'เทา', unsewn: 0, sewn: 12, preOrder: 10 },
      { id: 'CS-LN3-07', modelKey: 'ln3', modelName: 'กระดุม 19 เม็ด (LN3)', fabricType: 'PVC', sku: 'PQ002C-48', color: 'มอคค่า', unsewn: 0, sewn: 32, preOrder: 10 },
      { id: 'CS-LN3-08', modelKey: 'ln3', modelName: 'กระดุม 19 เม็ด (LN3)', fabricType: 'Hollan', sku: '337-07', color: 'น้ำตาลทอง', unsewn: 6, sewn: 7, preOrder: 4 },
      { id: 'CS-LN3-09', modelKey: 'ln3', modelName: 'กระดุม 19 เม็ด (LN3)', fabricType: 'Hollan', sku: '337-14', color: 'เขียว', unsewn: 0, sewn: 10, preOrder: 1 },
      { id: 'CS-LN3-10', modelKey: 'ln3', modelName: 'กระดุม 19 เม็ด (LN3)', fabricType: 'Hollan', sku: '337-22', color: 'โรสโกลด์', unsewn: 0, sewn: 7, preOrder: 22 },
      { id: 'CS-LN3-11', modelKey: 'ln3', modelName: 'กระดุม 19 เม็ด (LN3)', fabricType: 'Hollan', sku: '337-23', color: 'แดงไวน์', unsewn: 0, sewn: 4, preOrder: 6 },
      { id: 'CS-LN3-12', modelKey: 'ln3', modelName: 'กระดุม 19 เม็ด (LN3)', fabricType: 'Hollan', sku: '337-29', color: 'เทาควัน', unsewn: 9, sewn: 7, preOrder: 26 },
      { id: 'CS-LN3-13', modelKey: 'ln3', modelName: 'กระดุม 19 เม็ด (LN3)', fabricType: 'Hollan', sku: '337-31', color: 'น้ำเงิน', unsewn: 0, sewn: 5, preOrder: 8 },
      { id: 'CS-LN3-14', modelKey: 'ln3', modelName: 'กระดุม 19 เม็ด (LN3)', fabricType: 'นาโน', sku: '736B-01', color: 'น้ำตาลทอง', unsewn: 0, sewn: 3, preOrder: 10 },
      { id: 'CS-LN3-15', modelKey: 'ln3', modelName: 'กระดุม 19 เม็ด (LN3)', fabricType: 'นาโน', sku: '736B-02', color: 'เทาเข้ม', unsewn: 13, sewn: 4, preOrder: 0 },
      { id: 'CS-LN3-16', modelKey: 'ln3', modelName: 'กระดุม 19 เม็ด (LN3)', fabricType: 'นาโน', sku: '736B-04', color: 'ฟ้าเทา', unsewn: 4, sewn: 2, preOrder: 0 },
      // กระดุม 5 เม็ด LN5
      { id: 'CS-LN5-01', modelKey: 'ln5', modelName: 'กระดุม 5 เม็ด (LN5)', fabricType: 'นาโน', sku: '736B-01', color: 'น้ำตาลทอง', unsewn: 62, sewn: 8, preOrder: 93 },
      { id: 'CS-LN5-02', modelKey: 'ln5', modelName: 'กระดุม 5 เม็ด (LN5)', fabricType: 'นาโน', sku: '736B-02', color: 'เทาเข้ม', unsewn: 37, sewn: 17, preOrder: 100 },
      { id: 'CS-LN5-03', modelKey: 'ln5', modelName: 'กระดุม 5 เม็ด (LN5)', fabricType: 'นาโน', sku: '736B-04', color: 'ฟ้าเทา', unsewn: 20, sewn: 10, preOrder: 32 },
      // ปรับนอน RC / PN-Lif
      { id: 'CS-RC-01', modelKey: 'rc', modelName: 'ปรับนอน (RC / PN-Lif)', fabricType: 'PVC', sku: 'PQ002C-06', color: 'ครีม', unsewn: 15, sewn: 11, preOrder: 23 },
      { id: 'CS-RC-02', modelKey: 'rc', modelName: 'ปรับนอน (RC / PN-Lif)', fabricType: 'PVC', sku: 'PQ002C-12', color: 'น้ำตาล', unsewn: 0, sewn: 0, preOrder: 47 },
      { id: 'CS-RC-03', modelKey: 'rc', modelName: 'ปรับนอน (RC / PN-Lif)', fabricType: 'PVC', sku: 'PQ002C-17', color: 'ดำ', unsewn: 15, sewn: 7, preOrder: 39 },
      { id: 'CS-RC-04', modelKey: 'rc', modelName: 'ปรับนอน (RC / PN-Lif)', fabricType: 'PVC', sku: 'PQ002C-19', color: 'ชา', unsewn: 0, sewn: 4, preOrder: 12 },
      { id: 'CS-RC-05', modelKey: 'rc', modelName: 'ปรับนอน (RC / PN-Lif)', fabricType: 'PVC', sku: 'PQ002C-46', color: 'เทา', unsewn: 26, sewn: 10, preOrder: 69 },
      { id: 'CS-RC-06', modelKey: 'rc', modelName: 'ปรับนอน (RC / PN-Lif)', fabricType: 'PVC', sku: 'PQ002C-48', color: 'มอคค่า', unsewn: 20, sewn: 16, preOrder: 55 },
      { id: 'CS-RC-07', modelKey: 'rc', modelName: 'ปรับนอน (RC / PN-Lif)', fabricType: 'Hollan', sku: '337-07', color: 'น้ำตาลทอง', unsewn: 0, sewn: 19, preOrder: 6 },
      { id: 'CS-RC-08', modelKey: 'rc', modelName: 'ปรับนอน (RC / PN-Lif)', fabricType: 'Hollan', sku: '337-14', color: 'เขียว', unsewn: 0, sewn: 11, preOrder: 2 },
      { id: 'CS-RC-09', modelKey: 'rc', modelName: 'ปรับนอน (RC / PN-Lif)', fabricType: 'Hollan', sku: '337-22', color: 'โรสโกลด์', unsewn: 0, sewn: 9, preOrder: 2 },
      { id: 'CS-RC-10', modelKey: 'rc', modelName: 'ปรับนอน (RC / PN-Lif)', fabricType: 'Hollan', sku: '337-23', color: 'แดงไวน์', unsewn: 0, sewn: 12, preOrder: 5 },
      { id: 'CS-RC-11', modelKey: 'rc', modelName: 'ปรับนอน (RC / PN-Lif)', fabricType: 'Hollan', sku: '337-29', color: 'เทาควัน', unsewn: 23, sewn: 1, preOrder: 15 },
      { id: 'CS-RC-12', modelKey: 'rc', modelName: 'ปรับนอน (RC / PN-Lif)', fabricType: 'Hollan', sku: '337-31', color: 'น้ำเงิน', unsewn: 0, sewn: 13, preOrder: 6 },
      { id: 'CS-RC-13', modelKey: 'rc', modelName: 'ปรับนอน (RC / PN-Lif)', fabricType: 'ลูกฟูก', sku: 'MJ 356-1A', color: 'LF ครีม', unsewn: 0, sewn: 6, preOrder: 9 },
      { id: 'CS-RC-14', modelKey: 'rc', modelName: 'ปรับนอน (RC / PN-Lif)', fabricType: 'ลูกฟูก', sku: 'MJ 356-3A', color: 'LF เทา', unsewn: 0, sewn: 8, preOrder: 10 },
      { id: 'CS-RC-15', modelKey: 'rc', modelName: 'ปรับนอน (RC / PN-Lif)', fabricType: 'นาโน', sku: '736B-01', color: 'น้ำตาลทอง', unsewn: 0, sewn: 13, preOrder: 9 },
      { id: 'CS-RC-16', modelKey: 'rc', modelName: 'ปรับนอน (RC / PN-Lif)', fabricType: 'นาโน', sku: '736B-02', color: 'เทาเข้ม', unsewn: 0, sewn: 8, preOrder: 16 },
      { id: 'CS-RC-17', modelKey: 'rc', modelName: 'ปรับนอน (RC / PN-Lif)', fabricType: 'นาโน', sku: '736B-04', color: 'ฟ้าเทา', unsewn: 0, sewn: 14, preOrder: 8 },
      // หัวกระดก RS
      { id: 'CS-RS-01', modelKey: 'rs', modelName: 'หัวกระดก (RS)', fabricType: 'PVC', sku: 'PQ002C-06', color: 'ครีม', unsewn: 18, sewn: 18, preOrder: 32 },
      { id: 'CS-RS-02', modelKey: 'rs', modelName: 'หัวกระดก (RS)', fabricType: 'PVC', sku: 'PQ002C-12', color: 'น้ำตาล', unsewn: 26, sewn: 20, preOrder: 95 },
      { id: 'CS-RS-03', modelKey: 'rs', modelName: 'หัวกระดก (RS)', fabricType: 'PVC', sku: 'PQ002C-17', color: 'ดำ', unsewn: 5, sewn: 15, preOrder: 19 },
      { id: 'CS-RS-04', modelKey: 'rs', modelName: 'หัวกระดก (RS)', fabricType: 'PVC', sku: 'PQ002C-19', color: 'ชา', unsewn: 0, sewn: 0, preOrder: 1 },
      { id: 'CS-RS-05', modelKey: 'rs', modelName: 'หัวกระดก (RS)', fabricType: 'PVC', sku: 'PQ002C-46', color: 'เทา', unsewn: 31, sewn: 14, preOrder: 36 },
      { id: 'CS-RS-06', modelKey: 'rs', modelName: 'หัวกระดก (RS)', fabricType: 'PVC', sku: 'PQ002C-48', color: 'มอคค่า', unsewn: 16, sewn: 9, preOrder: 48 },
      { id: 'CS-RS-07', modelKey: 'rs', modelName: 'หัวกระดก (RS)', fabricType: 'Hollan', sku: '337-22', color: 'โรสโกลด์', unsewn: 0, sewn: 29, preOrder: 1 },
      { id: 'CS-RS-08', modelKey: 'rs', modelName: 'หัวกระดก (RS)', fabricType: 'Hollan', sku: '337-23', color: 'แดงไวน์', unsewn: 0, sewn: 24, preOrder: 0 },
      { id: 'CS-RS-09', modelKey: 'rs', modelName: 'หัวกระดก (RS)', fabricType: 'Hollan', sku: '337-29', color: 'เทาควัน', unsewn: 9, sewn: 1, preOrder: 4 },
      { id: 'CS-RS-10', modelKey: 'rs', modelName: 'หัวกระดก (RS)', fabricType: 'นาโน', sku: '736B-01', color: 'น้ำตาลทอง', unsewn: 16, sewn: 13, preOrder: 10 },
      { id: 'CS-RS-11', modelKey: 'rs', modelName: 'หัวกระดก (RS)', fabricType: 'นาโน', sku: '736B-02', color: 'เทาเข้ม', unsewn: 16, sewn: 3, preOrder: 12 },
      // 3PL (Cs3 / Bs3 / Lu3)
      { id: 'CS-3PL-01', modelKey: 'cs3', modelName: '3PL (Cs3/Bs3/Lu3 เฉพาะตัว)', fabricType: 'PVC', sku: 'PQ002C-06', color: 'ครีม', unsewn: 50, sewn: 23, preOrder: 0 },
      { id: 'CS-3PL-02', modelKey: 'cs3', modelName: '3PL (Cs3/Bs3/Lu3 เฉพาะตัว)', fabricType: 'PVC', sku: 'PQ002C-12', color: 'น้ำตาล', unsewn: 100, sewn: 37, preOrder: 0 },
      { id: 'CS-3PL-03', modelKey: 'cs3', modelName: '3PL (Cs3/Bs3/Lu3 เฉพาะตัว)', fabricType: 'PVC', sku: 'PQ002C-17', color: 'ดำ', unsewn: 100, sewn: 3, preOrder: 0 },
      { id: 'CS-3PL-04', modelKey: 'cs3', modelName: '3PL (Cs3/Bs3/Lu3 เฉพาะตัว)', fabricType: 'PVC', sku: 'PQ002C-46', color: 'เทา', unsewn: 54, sewn: 34, preOrder: 0 },
      { id: 'CS-3PL-05', modelKey: 'cs3', modelName: '3PL (Cs3/Bs3/Lu3 เฉพาะตัว)', fabricType: 'PVC', sku: 'PQ002C-48', color: 'มอคค่า', unsewn: 100, sewn: 6, preOrder: 0 },
      { id: 'CS-3PL-06', modelKey: 'cs3', modelName: '3PL (Cs3/Bs3/Lu3 เฉพาะตัว)', fabricType: 'Hollan', sku: '337-23', color: 'แดงไวน์', unsewn: 0, sewn: 0, preOrder: 30 },
      // เฉพาะแขน (3ll)
      { id: 'CS-ARM-01', modelKey: 'arm', modelName: 'เฉพาะแขน (3ll - New)', fabricType: 'PVC', sku: 'PQ002C-06', color: 'ครีม', unsewn: 106, sewn: 16, preOrder: 0 },
      { id: 'CS-ARM-02', modelKey: 'arm', modelName: 'เฉพาะแขน (3ll - New)', fabricType: 'PVC', sku: 'PQ002C-12', color: 'น้ำตาล', unsewn: 163, sewn: 7, preOrder: 0 },
      { id: 'CS-ARM-03', modelKey: 'arm', modelName: 'เฉพาะแขน (3ll - New)', fabricType: 'PVC', sku: 'PQ002C-17', color: 'ดำ', unsewn: 180, sewn: 29, preOrder: 0 },
      { id: 'CS-ARM-04', modelKey: 'arm', modelName: 'เฉพาะแขน (3ll - New)', fabricType: 'PVC', sku: 'PQ002C-46', color: 'เทา', unsewn: 119, sewn: 9, preOrder: 0 },
      { id: 'CS-ARM-05', modelKey: 'arm', modelName: 'เฉพาะแขน (3ll - New)', fabricType: 'PVC', sku: 'PQ002C-48', color: 'มอคค่า', unsewn: 174, sewn: 9, preOrder: 0 },
      { id: 'CS-ARM-06', modelKey: 'arm', modelName: 'เฉพาะแขน (3ll - New)', fabricType: 'Hollan', sku: '337-23', color: 'แดงไวน์', unsewn: 15, sewn: 10, preOrder: 55 }
    ];

    // Sheet 3 Right Side: L-Mini Cut-Fabric Stock (Unsewn L/R + Sewn L/R minus Order L/R)
    const cutSewStockLMini = [
      { id: 'LM-01', fabricType: 'PVC', sku: 'PQ002C-06', color: 'ครีม', unsewnL: 0, unsewnR: 1, sewnL: 6, sewnR: 1, orderL: 0, orderR: 0 },
      { id: 'LM-02', fabricType: 'PVC', sku: 'PQ002C-12', color: 'น้ำตาล', unsewnL: 3, unsewnR: 2, sewnL: 0, sewnR: 3, orderL: 6, orderR: 5 },
      { id: 'LM-03', fabricType: 'PVC', sku: 'PQ002C-17', color: 'ดำ', unsewnL: 0, unsewnR: 2, sewnL: 1, sewnR: 1, orderL: 2, orderR: 3 },
      { id: 'LM-04', fabricType: 'PVC', sku: 'PQ002C-46', color: 'เทา', unsewnL: 1, unsewnR: 3, sewnL: 3, sewnR: 2, orderL: 4, orderR: 7 },
      { id: 'LM-05', fabricType: 'PVC', sku: 'PQ002C-48', color: 'มอคค่า', unsewnL: 1, unsewnR: 2, sewnL: 2, sewnR: 2, orderL: 3, orderR: 5 },
      { id: 'LM-06', fabricType: 'Hollan', sku: '337-07', color: 'น้ำตาลทอง', unsewnL: 0, unsewnR: 0, sewnL: 2, sewnR: 0, orderL: 3, orderR: 0 },
      { id: 'LM-07', fabricType: 'Hollan', sku: '337-14', color: 'เขียว', unsewnL: 0, unsewnR: 1, sewnL: 0, sewnR: 0, orderL: 0, orderR: 1 },
      { id: 'LM-08', fabricType: 'Hollan', sku: '337-22', color: 'โรสโกลด์', unsewnL: 1, unsewnR: 0, sewnL: 1, sewnR: 1, orderL: 2, orderR: 1 },
      { id: 'LM-09', fabricType: 'Hollan', sku: '337-23', color: 'แดงไวน์', unsewnL: 1, unsewnR: 0, sewnL: 0, sewnR: 1, orderL: 1, orderR: 1 },
      { id: 'LM-10', fabricType: 'Hollan', sku: '337-29', color: 'เทาควัน', unsewnL: 1, unsewnR: 1, sewnL: 4, sewnR: 0, orderL: 6, orderR: 4 },
      { id: 'LM-11', fabricType: 'Hollan', sku: '337-31', color: 'น้ำเงิน', unsewnL: 0, unsewnR: 0, sewnL: 5, sewnR: 4, orderL: 5, orderR: 5 },
      { id: 'LM-12', fabricType: 'ลูกฟูก', sku: 'MJ 356-1A', color: 'LF ครีม', unsewnL: 4, unsewnR: 5, sewnL: 4, sewnR: 18, orderL: 10, orderR: 23 },
      { id: 'LM-13', fabricType: 'ลูกฟูก', sku: 'MJ 356-2A', color: 'LF เขียว', unsewnL: 2, unsewnR: 4, sewnL: 6, sewnR: 5, orderL: 8, orderR: 9 },
      { id: 'LM-14', fabricType: 'ลูกฟูก', sku: 'MJ 356-3A', color: 'LF เทา', unsewnL: 9, unsewnR: 12, sewnL: 8, sewnR: 7, orderL: 17, orderR: 20 },
      { id: 'LM-15', fabricType: 'ลูกฟูก', sku: 'MJ 356-4A', color: 'LF น้ำตาล', unsewnL: 0, unsewnR: 10, sewnL: 7, sewnR: 3, orderL: 8, orderR: 13 },
      { id: 'LM-16', fabricType: 'นาโน', sku: '736B-01', color: 'น้ำตาลทอง', unsewnL: 7, unsewnR: 5, sewnL: 3, sewnR: 7, orderL: 10, orderR: 12 },
      { id: 'LM-17', fabricType: 'นาโน', sku: '736B-02', color: 'เทาเข้ม', unsewnL: 23, unsewnR: 14, sewnL: 14, sewnR: 12, orderL: 37, orderR: 31 },
      { id: 'LM-18', fabricType: 'นาโน', sku: '736B-04', color: 'ฟ้าอมเทา', unsewnL: 6, unsewnR: 1, sewnL: 8, sewnR: 1, orderL: 14, orderR: 15 }
    ];

    // Sheet 2: "ตัดอะไหล่ชิ้นส่วนเพิ่ม" (Spare parts cutting from existing fabric at cutter)
    const sparePartsOrders = [
      { id: 'SP-01', model: '3PL', partName: 'หลังพิง #2', color: 'หนังมอคค่า (PQ002C-48)', reqQty: 2, cutDoneQty: 2, status: 'ตัดครบแล้ว' },
      { id: 'SP-02', model: 'กระดุม 5 เม็ด', partName: 'หลังพิง #1', color: 'นาโนเทา (736B-02)', reqQty: 1, cutDoneQty: 1, status: 'ตัดครบแล้ว' },
      { id: 'SP-03', model: 'กระดุม 19 เม็ด', partName: 'หลังพิง (ตาราง) #1', color: 'หนังมอคค่า (PQ002C-48)', reqQty: 1, cutDoneQty: 1, status: 'ตัดครบแล้ว' },
      { id: 'SP-04', model: 'กระดุม 19 เม็ด', partName: 'หลังพิง (ตาราง) #1', color: '337-14 (เขียว)', reqQty: 1, cutDoneQty: 1, status: 'ตัดครบแล้ว' },
      { id: 'SP-05', model: 'ปรับนอน', partName: 'นั่ง #2 + หลังพิง (ตาราง) #1 + ปิดหลัง #9', color: 'หนังมอคค่า (PQ002C-48)', reqQty: 5, cutDoneQty: 5, status: 'ตัดครบแล้ว' },
      { id: 'SP-06', model: 'หัวกระดก', partName: 'หลังพิง (ตาราง) #1*', color: 'หนังมอคค่า (PQ002C-48)', reqQty: 1, cutDoneQty: 1, status: 'ตัดครบแล้ว' },
      { id: 'SP-07', model: 'หัวกระดก', partName: 'ปิดหลัง (กระโปรงหลัง) #7', color: 'หนังดำ (PQ002C-17)', reqQty: 1, cutDoneQty: 1, status: 'ตัดครบแล้ว' },
      { id: 'SP-08', model: 'แขน New', partName: 'ตัดแค่ 3 ชิ้นส่วน (1-ข้าง) #1,3,5', color: 'หนังครีม / หนังมอคค่า', reqQty: 2, cutDoneQty: 2, status: 'ตัดครบแล้ว' },
      { id: 'SP-09', model: 'L-mini', partName: 'ที่นั่ง 2 ที่ #18 (ฝั่งขวา)', color: '356-1A ลูกฟูกครีมอ่อน / หนังครีม / 337-07 / 337-29', reqQty: 4, cutDoneQty: 2, status: 'รอตัดส่งพร้อมรอบ 3' },
      { id: 'SP-10', model: 'L-mini', partName: 'ที่นั่งเบดยาว เข้ามุม #1 (ฝั่งซ้าย)', color: '356-1A ลูกฟูกครีมอ่อน / ลูกฟูกน้ำตาลซ้าย', reqQty: 2, cutDoneQty: 1, status: 'รอตัดส่งพร้อมรอบ 3' },
      { id: 'SP-11', model: 'L-mini', partName: 'หลังพิงเบด #12 + หลังพิง #17', color: 'นาโนฟ้า / 337-29 เทา / ลูกฟูกครีมอ่อน', reqQty: 4, cutDoneQty: 4, status: 'ตัดครบแล้ว' },
      { id: 'SP-12', model: 'L-mini', partName: 'กระโปรงสั้น #4 + กระโปรงยาว #5 + กล่องที่นั่ง #19', color: '337-29 (เทา) / ลูกฟูกครีม', reqQty: 5, cutDoneQty: 5, status: 'ตัดครบแล้ว' }
    ];

    // Sheet 3: Wood Frame Stock & Upholsterer Roster ("สรุปสต็อกโครงเหลือ" & "ชื่อรุ่น / ชื่อคนงาน")
    const woodFrameStock = [
      { model: 'สตูล เหลี่ยม', woodDone: 117, upholsterUsed: 0, remaining: 117, upholsterers: 'ทีมสตูล', note: 'พร้อมเบิกหุ้ม' },
      { model: '2 PL (CS2 / BS2 / LU2)', woodDone: 117, upholsterUsed: 0, remaining: 117, upholsterers: 'เอ (เจ๊สี่), พู, หรวย, วิน, ชา, มิ้น/ชัด', note: 'พร้อมเบิกหุ้ม' },
      { model: '3 PL (CS3 / BS3 / LU3)', woodDone: 304, upholsterUsed: 0, remaining: 304, upholsterers: 'เอ (เจ๊สี่), พู, หรวย, วิน, ชา, มิ้น/ชัด', note: 'พร้อมเบิกหุ้ม' },
      { model: 'กระดุม 19 เม็ด / กระดุม 5 เม็ด', woodDone: 280, upholsterUsed: 0, remaining: 280, upholsterers: 'ใบมอญ, วิน (ลุงวิน), ไซ, ศิริชัย, แทนไท, ชา, ตู่จวย', note: 'พร้อมเบิกหุ้ม' },
      { model: 'หัวกระดก (RS)', woodDone: 197, upholsterUsed: 0, remaining: 197, upholsterers: 'นาย, หรวย, ตะไบ, โทน, แทนไท', note: 'ไม่รวมช่างนอกเอาไป' },
      { model: 'ปรับนอน (RC / PN-Lif)', woodDone: 208, upholsterUsed: 0, remaining: 208, upholsterers: 'หรวย, วิน, ศิริชัย (ลุงชัย), แทนไท, อาโป', note: 'ไม่รวมช่างนอกเอาไป' },
      { model: 'L-mini (ซ้าย-ขวา)', woodDone: 228, upholsterUsed: 0, remaining: 228, upholsterers: 'ตะไบ, โทน, ตู่มิธ, ไซ', note: 'พร้อมเบิกหุ้ม' }
    ];

    // Sheet 1: Daily Pre-Order Summary by Model (แยกPre-Order ตัด พ.ย / ต.ค)
    const preOrderDailyRecords = [
      { id: 'PO-01', dateRange: '01-06 พ.ย. 69 (รอบ 1)', modelKey: 'ln3', modelLabel: 'กระดุม 19 เม็ด (LN3)', yardsPerUnit: 6.21, legsPerUnit: 6, gearPerUnit: 0, colorBreakdown: { 'PQ002C-06': 10, 'PQ002C-46': 5, '337-22': 5, '736B-02': 10 } },
      { id: 'PO-02', dateRange: '01-06 พ.ย. 69 (รอบ 1)', modelKey: 'ln5', modelLabel: 'กระดุม 5 เม็ด (LN5)', yardsPerUnit: 6.17, legsPerUnit: 6, gearPerUnit: 0, colorBreakdown: { '736B-01': 80, '736B-02': 90, '736B-04': 20 } },
      { id: 'PO-03', dateRange: '01-06 พ.ย. 69 (รอบ 1)', modelKey: 'rc',  modelLabel: 'ปรับนอน (RC)', yardsPerUnit: 6.65, legsPerUnit: 6, gearPerUnit: 1, colorBreakdown: { 'PQ002C-06': 5, 'PQ002C-12': 20, 'PQ002C-46': 30, 'PQ002C-48': 25, '337-29': 10 } },
      { id: 'PO-04', dateRange: '01-06 พ.ย. 69 (รอบ 1)', modelKey: 'rs',  modelLabel: 'หัวกระดก (RS)', yardsPerUnit: 6.26, legsPerUnit: 6, gearPerUnit: 1, colorBreakdown: { 'PQ002C-06': 20, 'PQ002C-12': 45, 'PQ002C-48': 30, '736B-02': 20 } },
      { id: 'PO-05', dateRange: '07-12 พ.ย. 69 (รอบ 2)', modelKey: 'cs3', modelLabel: '3PL / BS3 / LU3', yardsPerUnit: 6.26, legsPerUnit: 6, gearPerUnit: 0, colorBreakdown: { 'PQ002C-06': 100, 'PQ002C-12': 100, 'PQ002C-17': 100, 'PQ002C-46': 100, 'PQ002C-48': 100, '337-07': 40, '337-22': 80, '337-23': 20, '337-29': 100, '337-31': 40 } },
      { id: 'PO-06', dateRange: '07-12 พ.ย. 69 (รอบ 2)', modelKey: 'ln5', modelLabel: 'กระดุม 5 เม็ด (LN5)', yardsPerUnit: 6.17, legsPerUnit: 6, gearPerUnit: 0, colorBreakdown: { '736B-01': 70, '736B-02': 55, '736B-04': 30 } },
      { id: 'PO-07', dateRange: '07-12 พ.ย. 69 (รอบ 2)', modelKey: 'rc',  modelLabel: 'ปรับนอน (RC)', yardsPerUnit: 6.65, legsPerUnit: 6, gearPerUnit: 1, colorBreakdown: { 'PQ002C-06': 20, 'PQ002C-12': 30, 'PQ002C-46': 30, 'PQ002C-48': 30, '337-29': 20 } },
      { id: 'PO-08', dateRange: '07-12 พ.ย. 69 (รอบ 2)', modelKey: 'rs',  modelLabel: 'หัวกระดก (RS)', yardsPerUnit: 6.26, legsPerUnit: 6, gearPerUnit: 1, colorBreakdown: { 'PQ002C-06': 20, 'PQ002C-12': 40, 'PQ002C-17': 20, 'PQ002C-46': 40, 'PQ002C-48': 20, '736B-01': 20 } },
      { id: 'PO-09', dateRange: '13-21 พ.ย. 69 (รอบ 3)', modelKey: 'cs3', modelLabel: '3PL / BS3 / LU3', yardsPerUnit: 6.26, legsPerUnit: 6, gearPerUnit: 0, colorBreakdown: { 'PQ002C-06': 50, '337-23': 30 } },
      { id: 'PO-10', dateRange: '13-21 พ.ย. 69 (รอบ 3)', modelKey: 'rs',  modelLabel: 'หัวกระดก (RS)', yardsPerUnit: 6.26, legsPerUnit: 6, gearPerUnit: 1, colorBreakdown: { 'PQ002C-12': 40, 'PQ002C-48': 15 } },
      { id: 'PO-11', dateRange: '13-21 พ.ย. 69 (รอบ 3)', modelKey: 'ln3', modelLabel: 'กระดุม 19 เม็ด (LN3)', yardsPerUnit: 6.21, legsPerUnit: 6, gearPerUnit: 0, colorBreakdown: { 'PQ002C-12': 5, 'PQ002C-17': 5, '337-22': 10, '337-29': 10 } },
      { id: 'PO-12', dateRange: '13-21 พ.ย. 69 (รอบ 3)', modelKey: 'ln5', modelLabel: 'กระดุม 5 เม็ด (LN5)', yardsPerUnit: 6.17, legsPerUnit: 6, gearPerUnit: 0, colorBreakdown: { '736B-01': 20, '736B-02': 30 } },
      { id: 'PO-13', dateRange: '13-21 พ.ย. 69 (รอบ 3)', modelKey: 'rc',  modelLabel: 'ปรับนอน (RC)', yardsPerUnit: 6.65, legsPerUnit: 6, gearPerUnit: 1, colorBreakdown: { 'PQ002C-12': 50, 'PQ002C-17': 15, 'PQ002C-46': 30, 'PQ002C-48': 20, 'MJ 356-1A': 5, '736B-02': 5 } }
    ];

    // Sheet 3: Low Stock CS / BS / LU Matrix ("STOCK ผ้าคงเหลือน้อย")
    const csBsLuStockMatrix = [
      { model: 'Cs2 (เฉพาะตัว)', 'ครีม 06': 40, 'น้ำตาล 12': 50, 'ดำ 17': 50, 'เทา 46': 34, 'มอคค่า 48': 61, 'H-น้ำตาล 07': 27, 'H-เขียว 14': 32, 'H-โรส 22': 37, 'H-แดง 23': 49, 'H-เทา 29': 39, 'H-น้ำเงิน 31': 51 },
      { model: 'Cs3 (เฉพาะตัว)', 'ครีม 06': 96, 'น้ำตาล 12': 159, 'ดำ 17': 117, 'เทา 46': 100, 'มอคค่า 48': 117, 'H-น้ำตาล 07': 39, 'H-เขียว 14': 30, 'H-โรส 22': 117, 'H-แดง 23': 4, 'H-เทา 29': 143, 'H-น้ำเงิน 31': 10 },
      { model: 'Bs2-3 / Lu2-3 (รวมแขน)', 'ครีม 06': 146, 'น้ำตาล 12': 188, 'ดำ 17': 209, 'เทา 46': 144, 'มอคค่า 48': 194, 'H-น้ำตาล 07': 63, 'H-เขียว 14': 15, 'H-โรส 22': 63, 'H-แดง 23': 28, 'H-เทา 29': 237, 'H-น้ำเงิน 31': 93 }
    ];

    return {
      activeRoundId: 'ROUND-NOV69-3',
      viewMode: 'MATRIX', // 'MATRIX' (ใบเบิกผ้า ช่างตัด 69) or 'OUTSOURCE' (ใบสั่งตัดนอก แยกซ้าย-ขวา)
      rounds,
      cutSewStockStandard,
      cutSewStockLMini,
      sparePartsOrders,
      woodFrameStock,
      preOrderDailyRecords,
      csBsLuStockMatrix
    };
  }

  // =========================================================================
  // 3. CALCULATION HELPERS FOR ADMIN ROUTINE MATRIX
  // =========================================================================
  function parseCutterRemnantNumeric(val) {
    if (val === undefined || val === null || val === '') return 0;
    const match = String(val).match(/-?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 0;
  }

  function computeRowMetrics(row, formulaMode = 'STANDARD') {
    const lminiTotal = Number(row.lminiL || 0) + Number(row.lminiR || 0) || Number(row.lmini || 0);
    const modelYards = {};
    const modelRollsBoon = {};
    let totalUsedYards = 0;
    let totalBoonRolls = 0;
    let totalUnits = 0;

    ROUTINE_MODELS.forEach(m => {
      const qty = m.key === 'lmini' ? lminiTotal : Number(row[m.key] || 0);
      const y = Math.round(qty * m.yardsPerUnit * 100) / 100;
      modelYards[m.key] = y;
      totalUsedYards += y;
      totalUnits += qty;

      // Khun Boon formula: rolls per model = qty / piecesPerRoll
      const rBoon = qty > 0 ? (qty / m.piecesPerRoll) : 0;
      modelRollsBoon[m.key] = rBoon;
      totalBoonRolls += rBoon;
    });

    totalUsedYards = Math.round(totalUsedYards * 100) / 100;
    const calcRolls = formulaMode === 'BOON'
      ? Math.round(totalBoonRolls * 10) / 10
      : Math.round((totalUsedYards / 50) * 10) / 10;

    const fabricCost = Math.round(totalUsedYards * Number(row.price || 0) * 100) / 100;
    const sentYards = Number(row.sentYards || 0);
    const carriedYards = Number(row.carriedYards || 0);
    const expectedRemnantYards = Math.round((sentYards + carriedYards - totalUsedYards) * 100) / 100;
    const actualCutterNumeric = Math.round(parseCutterRemnantNumeric(row.actualCutterRemnant) * 100) / 100;
    // สูตรตามที่แอดมินแจ้ง: ผ้าคงเหลือต่างกัน = จำนวนหลาผ้าคงเหลือตามสูตร - คงเหลือ/หลา #ช่างนอก
    const diffRemnantYards = Math.round((expectedRemnantYards - actualCutterNumeric) * 100) / 100;

    return {
      lminiTotal,
      modelYards,
      modelRollsBoon,
      totalUsedYards,
      calcRolls,
      fabricCost,
      sentYards,
      carriedYards,
      expectedRemnantYards,
      actualCutterNumeric,
      diffRemnantYards,
      totalUnits
    };
  }

  function computeRoundTotals(round) {
    const mode = round.formulaMode || 'STANDARD';
    const modelQtyTotals = {};
    const modelWageTotals = {};
    ROUTINE_MODELS.forEach(m => {
      modelQtyTotals[m.key] = 0;
      modelWageTotals[m.key] = 0;
    });

    let grandTotalUnits = 0;
    let grandTotalUsedYards = 0;
    let grandTotalCalcRolls = 0;
    let grandTotalFabricCost = 0;
    let grandTotalSentYards = 0;
    let grandTotalCarriedYards = 0;
    let grandTotalExpectedRemnant = 0;
    let grandTotalActualCutterRemnant = 0;
    let grandTotalDiffRemnant = 0;
    let grandTotalCutWage = 0;
    let totalLMiniL = 0;
    let totalLMiniR = 0;

    const groupSummary = {
      'PVC หนัง': { yardsUsed: 0, yardsSent: 0, cost: 0 },
      'ลูกฟูก': { yardsUsed: 0, yardsSent: 0, cost: 0 },
      'Hollan': { yardsUsed: 0, yardsSent: 0, cost: 0 },
      'นาโน': { yardsUsed: 0, yardsSent: 0, cost: 0 }
    };

    (round.rows || []).forEach(row => {
      const m = computeRowMetrics(row, mode);
      grandTotalUnits += m.totalUnits;
      grandTotalUsedYards += m.totalUsedYards;
      grandTotalCalcRolls += m.calcRolls;
      grandTotalFabricCost += m.fabricCost;
      grandTotalSentYards += m.sentYards;
      grandTotalCarriedYards += m.carriedYards;
      grandTotalExpectedRemnant += m.expectedRemnantYards;
      grandTotalActualCutterRemnant += m.actualCutterNumeric;
      grandTotalDiffRemnant += m.diffRemnantYards;

      totalLMiniL += Number(row.lminiL || 0);
      totalLMiniR += Number(row.lminiR || 0);

      ROUTINE_MODELS.forEach(mod => {
        const qty = mod.key === 'lmini' ? m.lminiTotal : Number(row[mod.key] || 0);
        modelQtyTotals[mod.key] += qty;
      });

      if (groupSummary[row.group]) {
        groupSummary[row.group].yardsUsed += m.totalUsedYards;
        groupSummary[row.group].yardsSent += m.sentYards;
        groupSummary[row.group].cost += m.fabricCost;
      }
    });

    ROUTINE_MODELS.forEach(mod => {
      modelWageTotals[mod.key] = modelQtyTotals[mod.key] * mod.cutWage;
      grandTotalCutWage += modelWageTotals[mod.key];
    });

    return {
      modelQtyTotals,
      modelWageTotals,
      grandTotalUnits,
      grandTotalUsedYards,
      grandTotalCalcRolls,
      grandTotalFabricCost,
      grandTotalSentYards,
      grandTotalCarriedYards,
      grandTotalExpectedRemnant,
      grandTotalActualCutterRemnant,
      grandTotalDiffRemnant,
      grandTotalCutWage,
      totalLMiniL,
      totalLMiniR,
      groupSummary
    };
  }

  // =========================================================================
  // 4. UI CONTROLLER & RENDERING
  // =========================================================================
  const AdminRoutineController = {
    store: null,
    cutSewFilterModel: 'ALL',
    cutSewOnlyShortage: false,

    init(fabricStore) {
      this.store = fabricStore;
      this.ensureState();
      this.bindEvents();
      this.renderAll();
    },

    ensureState() {
      if (!this.store.state.adminRoutine || !Array.isArray(this.store.state.adminRoutine.rounds)) {
        this.store.state.adminRoutine = getInitialAdminRoutineData();
        this.store.saveCutterState();
      }
    },

    get data() {
      this.ensureState();
      return this.store.state.adminRoutine;
    },

    getActiveRound() {
      const d = this.data;
      return d.rounds.find(r => r.id === d.activeRoundId) || d.rounds[0];
    },

    save() {
      this.store.saveCutterState();
    },

    fmt(n, dec = 2) {
      const val = Number(n || 0);
      return val.toLocaleString('th-TH', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    },

    toast(msg, icon = '✅') {
      const t = document.getElementById('toast');
      if (!t) return;
      document.getElementById('toast-icon').textContent = icon;
      document.getElementById('toast-msg').textContent = msg;
      t.classList.remove('hidden');
      setTimeout(() => t.classList.add('hidden'), 3200);
    },

    renderAll() {
      if (!document.getElementById('admin-routine-round-select')) return;
      this.renderMatrixTab();
      this.renderCutSewStockTab();
      this.renderPreOrderAndBillingTab();
    },

    // -----------------------------------------------------------------------
    // TAB A: ADMIN ROUTINE CUTTING MATRIX & OUTSOURCE ORDER SHEET
    // -----------------------------------------------------------------------
    renderMatrixTab() {
      const d = this.data;
      const round = this.getActiveRound();
      if (!round) return;

      // Populate Round Selector
      const sel = document.getElementById('admin-routine-round-select');
      if (sel) {
        sel.innerHTML = d.rounds.map(r =>
          `<option value="${r.id}" ${r.id === round.id ? 'selected' : ''}>${r.name}</option>`
        ).join('');
      }

      // Populate Round Header Metadata
      const metaTitle = document.getElementById('routine-round-meta-title');
      if (metaTitle) metaTitle.value = round.name || '';
      const metaSendDate = document.getElementById('routine-round-send-date');
      if (metaSendDate) metaSendDate.value = round.sendDate || '';
      const metaFormula = document.getElementById('routine-formula-mode');
      if (metaFormula) metaFormula.value = round.formulaMode || 'STANDARD';
      const metaExtraNote = document.getElementById('routine-extra-spare-note');
      if (metaExtraNote) metaExtraNote.value = round.extraNote || '';

      // View mode buttons
      const btnMatrixView = document.getElementById('btn-view-mode-matrix');
      const btnOutsourceView = document.getElementById('btn-view-mode-outsource');
      const matrixWrap = document.getElementById('routine-matrix-view-wrap');
      const outsourceWrap = document.getElementById('routine-outsource-view-wrap');

      if (d.viewMode === 'OUTSOURCE') {
        btnMatrixView?.classList.remove('bg-indigo-600', 'text-white');
        btnMatrixView?.classList.add('bg-slate-100', 'text-slate-700');
        btnOutsourceView?.classList.add('bg-fuchsia-600', 'text-white');
        btnOutsourceView?.classList.remove('bg-slate-100', 'text-slate-700');
        matrixWrap?.classList.add('hidden');
        outsourceWrap?.classList.remove('hidden');
      } else {
        btnMatrixView?.classList.add('bg-indigo-600', 'text-white');
        btnMatrixView?.classList.remove('bg-slate-100', 'text-slate-700');
        btnOutsourceView?.classList.remove('bg-fuchsia-600', 'text-white');
        btnOutsourceView?.classList.add('bg-slate-100', 'text-slate-700');
        matrixWrap?.classList.remove('hidden');
        outsourceWrap?.classList.add('hidden');
      }

      const totals = computeRoundTotals(round);

      // Update Summary KPI Strip inside Routine Tab
      const elTotalSets = document.getElementById('routine-kpi-total-sets');
      if (elTotalSets) elTotalSets.textContent = `${this.fmt(totals.grandTotalUnits, 0)} ชุด`;
      const elTotalYards = document.getElementById('routine-kpi-total-yards');
      if (elTotalYards) elTotalYards.textContent = `${this.fmt(totals.grandTotalUsedYards, 2)} หลา (${this.fmt(totals.grandTotalCalcRolls, 1)} ม้วน)`;
      const elFabricCost = document.getElementById('routine-kpi-fabric-cost');
      if (elFabricCost) elFabricCost.textContent = `฿${this.fmt(totals.grandTotalFabricCost, 2)}`;
      const elCutWage = document.getElementById('routine-kpi-cut-wage');
      if (elCutWage) elCutWage.textContent = `฿${this.fmt(totals.grandTotalCutWage, 2)}`;

      this.renderFullAdminMatrixTable(round, totals);
      this.renderOutsourceOrderTable(round, totals);
    },

    renderFullAdminMatrixTable(round, totals) {
      const tbody = document.getElementById('admin-routine-matrix-tbody');
      const tfoot = document.getElementById('admin-routine-matrix-tfoot');
      if (!tbody || !tfoot) return;

      const mode = round.formulaMode || 'STANDARD';

      tbody.innerHTML = (round.rows || []).map((row, idx) => {
        const m = computeRowMetrics(row, mode);
        const remClass = m.expectedRemnantYards < 0
          ? 'text-rose-600 font-bold bg-rose-50'
          : (m.expectedRemnantYards > 0 ? 'text-emerald-700 font-bold bg-emerald-50/50' : 'text-slate-500');

        const noteBadgeColor = row.note === 'ไม่ตรง'
          ? 'bg-rose-100 text-rose-800 border-rose-300'
          : (row.note === 'น้อยกว่า' ? 'bg-amber-100 text-amber-800 border-amber-300'
          : (row.note === 'มากกว่า' ? 'bg-sky-100 text-sky-800 border-sky-300'
          : (row.note.includes('ซับ') ? 'bg-purple-100 text-purple-800 border-purple-300' : 'bg-slate-100 text-slate-700 border-slate-300')));

        return `
          <tr class="hover:bg-indigo-50/40 transition border-b border-slate-200">
            <td class="py-1.5 px-2 font-bold text-slate-900 whitespace-nowrap sticky left-0 bg-white z-10 border-r border-slate-200">
              <div class="text-[11px]">${row.sku}</div>
              <div class="text-[10px] font-normal text-slate-500">${row.group}</div>
            </td>
            <td class="py-1.5 px-2 font-semibold text-slate-800 whitespace-nowrap sticky left-[92px] bg-white z-10 border-r border-slate-300">
              ${row.color}
            </td>

            ${ROUTINE_MODELS.map(mod => {
              if (mod.key === 'lmini') {
                return `
                  <td class="py-1 px-1.5 text-center bg-fuchsia-50/30 border-l border-slate-200">
                    <div class="flex items-center justify-center gap-0.5" title="ซ้าย L + ขวา R = ${m.lminiTotal} ชุด">
                      <input type="number" min="0" value="${row.lminiL || ''}" placeholder="L" data-r-idx="${idx}" data-r-field="lminiL"
                        class="w-10 px-1 py-0.5 text-center text-[11px] font-bold border border-fuchsia-300 rounded bg-white text-fuchsia-900" title="L-Mini ฝั่งซ้าย">
                      <input type="number" min="0" value="${row.lminiR || ''}" placeholder="R" data-r-idx="${idx}" data-r-field="lminiR"
                        class="w-10 px-1 py-0.5 text-center text-[11px] font-bold border border-indigo-300 rounded bg-white text-indigo-900" title="L-Mini ฝั่งขวา">
                    </div>
                  </td>
                  <td class="py-1 px-1.5 text-right text-[11px] ${m.modelYards.lmini > 0 ? 'font-bold text-fuchsia-800 bg-fuchsia-50/60' : 'text-slate-300'}">
                    ${m.modelYards.lmini > 0 ? this.fmt(m.modelYards.lmini, 2) : '0'}
                    ${mode === 'BOON' && m.modelRollsBoon.lmini > 0 ? `<div class="text-[9px] text-fuchsia-600">(${this.fmt(m.modelRollsBoon.lmini, 1)} ม.)</div>` : ''}
                  </td>
                `;
              }
              const val = Number(row[mod.key] || 0);
              const yVal = m.modelYards[mod.key];
              return `
                <td class="py-1 px-1 text-center border-l border-slate-200">
                  <input type="number" min="0" value="${val || ''}" placeholder="-" data-r-idx="${idx}" data-r-field="${mod.key}"
                    class="w-12 px-1 py-0.5 text-center text-[11px] font-bold border ${val > 0 ? 'border-indigo-500 bg-indigo-50 text-indigo-950' : 'border-slate-200 bg-white text-slate-600'} rounded focus:ring-1 focus:ring-indigo-500">
                </td>
                <td class="py-1 px-1.5 text-right text-[11px] ${yVal > 0 ? 'font-bold text-slate-900 bg-slate-50' : 'text-slate-300'}">
                  ${yVal > 0 ? this.fmt(yVal, 2) : '0'}
                  ${mode === 'BOON' && m.modelRollsBoon[mod.key] > 0 ? `<div class="text-[9px] text-indigo-600">(${this.fmt(m.modelRollsBoon[mod.key], 1)} ม.)</div>` : ''}
                </td>
              `;
            }).join('')}

            <!-- รวมเบิกหลา -->
            <td class="py-1.5 px-2 text-right font-bold text-indigo-900 bg-indigo-50/80 border-l-2 border-indigo-300">
              ${this.fmt(m.totalUsedYards, 2)}
            </td>
            <!-- จำนวนไม้ที่สั่ง / ม้วน -->
            <td class="py-1.5 px-2 text-center font-bold text-fuchsia-800 bg-fuchsia-50/70">
              ${this.fmt(m.calcRolls, 1)}
            </td>
            <!-- ราคา/หลา -->
            <td class="py-1 px-1.5 text-center">
              <input type="number" step="1" value="${row.price}" data-r-idx="${idx}" data-r-field="price"
                class="w-12 px-1 py-0.5 text-center text-[11px] font-semibold border border-slate-200 rounded bg-slate-50">
            </td>
            <!-- รวมยอดค่าผ้า -->
            <td class="py-1.5 px-2 text-right font-semibold text-slate-800">
              ${this.fmt(m.fabricCost, 2)}
            </td>
            <!-- หักผ้าที่มี สั่ง + เผื่อผ้าให้ช่างตัด -->
            <td class="py-1 px-1.5 bg-amber-50/50 border-l border-amber-200">
              <input type="text" value="${row.orderRollsText || ''}" placeholder="เช่น 7 ม้วน / ใช้ผ้าที่มี" data-r-idx="${idx}" data-r-field="orderRollsText"
                class="w-28 px-1.5 py-0.5 text-[11px] font-bold text-amber-950 border border-amber-300 rounded bg-white">
            </td>
            <!-- จำนวนหลาที่ส่งจริง -->
            <td class="py-1 px-1.5 bg-emerald-50/40">
              <input type="number" step="0.01" value="${row.sentYards || ''}" placeholder="0.00" data-r-idx="${idx}" data-r-field="sentYards"
                class="w-20 px-1.5 py-0.5 text-right text-[11px] font-bold text-emerald-900 border border-emerald-300 rounded bg-white">
            </td>
            <!-- ยอดยกมา คงเหลือ / หลา -->
            <td class="py-1 px-1.5 bg-slate-50">
              <input type="number" step="0.01" value="${row.carriedYards || ''}" placeholder="0.00" data-r-idx="${idx}" data-r-field="carriedYards"
                class="w-18 px-1.5 py-0.5 text-right text-[11px] font-semibold text-slate-700 border border-slate-300 rounded bg-white">
            </td>
            <!-- จำนวนผ้า/หลา คงเหลือ (ตามสูตร) -->
            <td class="py-1.5 px-2 text-right text-[11px] ${remClass}">
              ${m.expectedRemnantYards < 0 ? `(${this.fmt(Math.abs(m.expectedRemnantYards), 2)})` : this.fmt(m.expectedRemnantYards, 2)}
            </td>
            <!-- คงเหลือ / หลา #ช่างนอก -->
            <td class="py-1 px-1.5 bg-amber-50/70">
              <input type="text" value="${row.actualCutterRemnant || ''}" placeholder="เช่น 60.4+เศษ" data-r-idx="${idx}" data-r-field="actualCutterRemnant"
                class="w-24 px-1.5 py-0.5 text-right text-[11px] font-bold text-amber-900 border border-amber-400 rounded bg-white">
            </td>
            <!-- ผ้าคงเหลือต่างกัน (= จำนวนผ้า/หลา คงเหลือตามสูตร - คงเหลือ/หลา #ช่างนอก) -->
            <td class="py-1.5 px-2 text-right text-[11px] font-extrabold border-x border-rose-200 ${Math.abs(m.diffRemnantYards) < 0.01 ? 'text-emerald-700 bg-emerald-50/60' : (m.diffRemnantYards > 0 ? 'text-rose-700 bg-rose-50/80' : 'text-sky-700 bg-sky-50/80')}" title="สูตร: ${this.fmt(m.expectedRemnantYards, 2)} (ตามสูตร) - ${this.fmt(m.actualCutterNumeric, 2)} (#ช่างนอก) = ${this.fmt(m.diffRemnantYards, 2)} หลา">
              ${m.diffRemnantYards < 0 ? `-${this.fmt(Math.abs(m.diffRemnantYards), 2)}` : this.fmt(m.diffRemnantYards, 2)}
            </td>
            <!-- หมายเหตุ รีเช็ค -->
            <td class="py-1 px-1.5">
              <select data-r-idx="${idx}" data-r-field="note" class="px-1.5 py-0.5 text-[11px] font-bold rounded border ${noteBadgeColor}">
                <option value="" ${!row.note ? 'selected' : ''}>-</option>
                <option value="ตรง" ${row.note === 'ตรง' ? 'selected' : ''}>✅ ตรง</option>
                <option value="ไม่ตรง" ${row.note === 'ไม่ตรง' ? 'selected' : ''}>❌ ไม่ตรง</option>
                <option value="น้อยกว่า" ${row.note === 'น้อยกว่า' ? 'selected' : ''}>⚠️ น้อยกว่า</option>
                <option value="มากกว่า" ${row.note === 'มากกว่า' ? 'selected' : ''}>📈 มากกว่า</option>
                <option value="ประมาณ" ${row.note === 'ประมาณ' ? 'selected' : ''}>≈ ประมาณ</option>
                <option value="ซับส่ง 1 ม้วน" ${row.note === 'ซับส่ง 1 ม้วน' ? 'selected' : ''}>📦 ซับส่ง 1 ม้วน</option>
                <option value="ใช้ผ้าที่มี" ${row.note === 'ใช้ผ้าที่มี' ? 'selected' : ''}>♻️ ใช้ผ้าที่มี</option>
              </select>
            </td>
          </tr>
        `;
      }).join('');

      // Render 3 Bottom Summary Rows: รวมจำนวนผลิต/ชุด, ราคาตัด/ตัว, ราคารวมตัด
      tfoot.innerHTML = `
        <tr class="bg-slate-900 text-white font-bold text-xs border-t-2 border-slate-700">
          <td colspan="2" class="py-2.5 px-3 sticky left-0 bg-slate-900 z-10">รวมจำนวนผลิต / ชุด</td>
          ${ROUTINE_MODELS.map(mod => `
            <td class="py-2.5 px-2 text-center text-amber-300 text-sm border-l border-slate-700">${this.fmt(totals.modelQtyTotals[mod.key], 0)}</td>
            <td class="py-2.5 px-1 text-right text-[10px] text-slate-400">ชุด</td>
          `).join('')}
          <td class="py-2.5 px-2 text-right text-emerald-300">${this.fmt(totals.grandTotalUsedYards, 2)} หลา</td>
          <td class="py-2.5 px-2 text-center text-fuchsia-300">${this.fmt(totals.grandTotalCalcRolls, 1)} ม้วน</td>
          <td class="py-2.5 px-2 text-right text-slate-300">ราคารวมสั่งผ้า:</td>
          <td class="py-2.5 px-2 text-right text-amber-300 text-sm">฿${this.fmt(totals.grandTotalFabricCost, 2)}</td>
          <td class="py-2.5 px-2 text-center text-slate-300">ส่งจริงรวม:</td>
          <td class="py-2.5 px-2 text-right text-emerald-300">${this.fmt(totals.grandTotalSentYards, 2)} หลา</td>
          <td class="py-2.5 px-2 text-right text-slate-300">${this.fmt(totals.grandTotalCarriedYards, 2)}</td>
          <td class="py-2.5 px-2 text-right text-amber-200" title="รวมคงเหลือตามสูตร">${this.fmt(totals.grandTotalExpectedRemnant, 2)}</td>
          <td class="py-2.5 px-2 text-right text-amber-300" title="รวมคงเหลือ #ช่างนอก">${this.fmt(totals.grandTotalActualCutterRemnant, 2)}</td>
          <td class="py-2.5 px-2 text-right text-rose-300 bg-rose-950/80 border-x border-rose-700" title="รวมผลต่างผ้าคงเหลือ (ตามสูตร - #ช่างนอก)">${this.fmt(totals.grandTotalDiffRemnant, 2)}</td>
          <td class="py-2.5 px-2 text-center bg-indigo-950 text-indigo-200">
            รวมตัด: <strong class="text-white text-sm">${this.fmt(totals.grandTotalUnits, 0)}</strong> ชุด
          </td>
        </tr>
        <tr class="bg-slate-100 text-slate-700 font-semibold text-xs border-t border-slate-300">
          <td colspan="2" class="py-2 px-3 sticky left-0 bg-slate-100 z-10">ราคาค่าแรงตัด / ตัว (บาท)</td>
          ${ROUTINE_MODELS.map(mod => `
            <td colspan="2" class="py-2 px-2 text-center border-l border-slate-300 text-slate-800">${mod.cutWage} ฿ / ตัว</td>
          `).join('')}
          <td colspan="3" class="py-2 px-2 text-right font-bold text-indigo-900">ราคารวมยอดสั่งตัด (ค่าแรงช่าง):</td>
          <td class="py-2 px-2 text-right font-extrabold text-indigo-700 text-sm bg-indigo-50">฿${this.fmt(totals.grandTotalCutWage, 2)}</td>
          <td colspan="7" class="py-2 px-3 text-[11px] text-slate-500">
            แยกตามกลุ่มผ้า: PVC ${this.fmt(totals.groupSummary['PVC หนัง'].yardsUsed, 1)} หลา | ลูกฟูก ${this.fmt(totals.groupSummary['ลูกฟูก'].yardsUsed, 1)} หลา | ฮอลแลนด์ ${this.fmt(totals.groupSummary['Hollan'].yardsUsed, 1)} หลา | นาโน ${this.fmt(totals.groupSummary['นาโน'].yardsUsed, 1)} หลา
          </td>
        </tr>
        <tr class="bg-indigo-50/90 text-indigo-950 font-bold text-xs border-t border-indigo-200">
          <td colspan="2" class="py-2 px-3 sticky left-0 bg-indigo-50 z-10">ราคารวมค่าแรงตัดแยกตามรุ่น (บาท)</td>
          ${ROUTINE_MODELS.map(mod => `
            <td colspan="2" class="py-2 px-2 text-center border-l border-indigo-200 text-indigo-900">฿${this.fmt(totals.modelWageTotals[mod.key], 0)}</td>
          `).join('')}
          <td colspan="11" class="py-2 px-3 text-xs text-rose-700 font-semibold">
            📌 ${round.extraNote || '-'}
          </td>
        </tr>
      `;

      // Bind inline input changes
      tbody.querySelectorAll('[data-r-idx]').forEach(el => {
        el.addEventListener('change', (e) => {
          const idx = Number(e.target.getAttribute('data-r-idx'));
          const field = e.target.getAttribute('data-r-field');
          const row = round.rows[idx];
          if (!row) return;

          if (['orderRollsText', 'actualCutterRemnant', 'note', 'outsourceNote'].includes(field)) {
            row[field] = e.target.value;
            // Auto-fill sentYards if user types e.g. "7 ม้วน" and sentYards is 0
            if (field === 'orderRollsText') {
              const match = String(e.target.value).match(/(\d+(\.\d+)?)\s*ม้วน/);
              if (match && !row.sentYards) {
                row.sentYards = Number(match[1]) * 50;
              }
            }
          } else {
            row[field] = Number(e.target.value || 0);
            if (field === 'lminiL' || field === 'lminiR') {
              row.lmini = Number(row.lminiL || 0) + Number(row.lminiR || 0);
            }
          }
          this.save();
          this.renderMatrixTab();
        });
      });
    },

    // Render Mode B: "ใบสั่งตัดนอก" (Outsource Production Order Sheet with Full 2-Way Sync with View 1)
    renderOutsourceOrderTable(round, totals) {
      const tbody = document.getElementById('admin-outsource-sheet-tbody');
      const tfoot = document.getElementById('admin-outsource-sheet-tfoot');
      if (!tbody || !tfoot) return;

      const stdModels = ['cs2', 'cs3', 'arm', 'rs', 'ln3', 'ln5', 'rc'];

      tbody.innerHTML = (round.rows || []).map((row, idx) => {
        const m = computeRowMetrics(row, round.formulaMode);
        const hasAny = m.totalUnits > 0 || row.orderRollsText || row.outsourceNote;
        const groupColor =
          row.group === 'PVC หนัง' ? 'bg-amber-50/40' :
          row.group === 'ลูกฟูก' ? 'bg-emerald-50/40' :
          row.group === 'Hollan' ? 'bg-sky-50/40' : 'bg-purple-50/40';

        const stdCells = stdModels.map(key => {
          const val = Number(row[key] || 0);
          return `
            <td class="py-1.5 px-1.5 text-center ${val > 0 ? 'bg-indigo-50/70' : ''}">
              <input type="number" min="0" value="${val > 0 ? val : ''}" data-out-idx="${idx}" data-out-field="${key}"
                placeholder="-"
                class="w-12 px-1 py-0.5 text-center font-bold ${val > 0 ? 'text-indigo-900 border-indigo-400 bg-white shadow-2xs' : 'text-slate-500 border-slate-200 bg-slate-50/60'} border rounded text-xs focus:ring-1 focus:ring-indigo-500">
            </td>
          `;
        }).join('');

        const lminiLVal = Number(row.lminiL || 0);
        const lminiRVal = Number(row.lminiR || 0);
        const lbigVal = Number(row.lbig || 0);

        return `
          <tr class="${hasAny ? 'bg-white hover:bg-fuchsia-50/30' : groupColor} border-b border-slate-200 text-xs transition-colors">
            <td class="py-2 px-3 font-semibold text-slate-700 whitespace-nowrap">${row.group}</td>
            <td class="py-2 px-3 font-bold text-slate-900 whitespace-nowrap">${row.sku}</td>
            <td class="py-2 px-3 font-semibold text-slate-800 whitespace-nowrap">${row.color}</td>
            <td class="py-1.5 px-2 text-center bg-amber-50/60 border-x border-amber-200">
              <input type="text" value="${row.orderRollsText || ''}" data-out-idx="${idx}" data-out-field="orderRollsText"
                placeholder="${m.calcRolls > 0 ? `สูตร ${this.fmt(m.calcRolls, 1)} ม้วน` : '-'}"
                class="w-32 px-2 py-1 text-center font-bold text-amber-900 border border-amber-300 rounded bg-white text-xs">
              ${m.calcRolls > 0 ? `<div class="text-[10px] text-amber-700 font-semibold mt-0.5">คำนวณ: ${this.fmt(m.calcRolls, 1)} ม้วน (${this.fmt(m.totalUsedYards, 1)} หลา)</div>` : ''}
            </td>
            ${stdCells}
            <td class="py-1.5 px-1.5 text-center bg-fuchsia-50/60 border-l border-fuchsia-200">
              <input type="number" min="0" value="${lminiLVal > 0 ? lminiLVal : ''}" data-out-idx="${idx}" data-out-field="lminiL"
                placeholder="-"
                class="w-12 px-1 py-0.5 text-center font-bold ${lminiLVal > 0 ? 'text-fuchsia-900 border-fuchsia-400 bg-white' : 'text-slate-400 border-fuchsia-200 bg-white/70'} border rounded text-xs">
            </td>
            <td class="py-1.5 px-1.5 text-center bg-fuchsia-50/60 border-r border-fuchsia-200">
              <input type="number" min="0" value="${lminiRVal > 0 ? lminiRVal : ''}" data-out-idx="${idx}" data-out-field="lminiR"
                placeholder="-"
                class="w-12 px-1 py-0.5 text-center font-bold ${lminiRVal > 0 ? 'text-indigo-900 border-indigo-400 bg-white' : 'text-slate-400 border-indigo-200 bg-white/70'} border rounded text-xs">
            </td>
            <td class="py-1.5 px-1.5 text-center ${lbigVal > 0 ? 'bg-indigo-50/70' : ''}">
              <input type="number" min="0" value="${lbigVal > 0 ? lbigVal : ''}" data-out-idx="${idx}" data-out-field="lbig"
                placeholder="-"
                class="w-12 px-1 py-0.5 text-center font-bold ${lbigVal > 0 ? 'text-indigo-900 border-indigo-400 bg-white' : 'text-slate-500 border-slate-200 bg-slate-50/60'} border rounded text-xs">
            </td>
            <td class="py-2 px-2 text-center font-extrabold text-sm ${m.totalUnits > 0 ? 'text-emerald-800 bg-emerald-50/80' : 'text-slate-400 bg-slate-50'} border-x border-emerald-200">
              ${m.totalUnits > 0 ? `${m.totalUnits}` : '-'}
            </td>
            <td class="py-1.5 px-2">
              <input type="text" value="${row.outsourceNote || ''}" data-out-idx="${idx}" data-out-field="outsourceNote"
                placeholder="เช่น L-mini ใช้ 337-29 / ซับ PKD 1 ม้วน"
                class="w-full min-w-[180px] px-2 py-1 text-xs border border-slate-200 rounded bg-white text-slate-700">
            </td>
          </tr>
        `;
      }).join('');

      tfoot.innerHTML = `
        <tr class="bg-slate-900 text-white font-bold text-xs">
          <td colspan="3" class="py-3 px-3">รวมจำนวนตัดทุกรุ่น (ซิงค์มุมมองที่ 1): <span class="text-amber-300 text-sm ml-1">${this.fmt(totals.grandTotalUnits, 0)} ชุด</span></td>
          <td class="py-3 px-2 text-center text-amber-300">≈ ${this.fmt(totals.grandTotalCalcRolls, 1)} ม้วน (${this.fmt(totals.grandTotalUsedYards, 1)} หลา)</td>
          <td class="py-3 px-2 text-center">${totals.modelQtyTotals.cs2 || 0}</td>
          <td class="py-3 px-2 text-center">${totals.modelQtyTotals.cs3 || 0}</td>
          <td class="py-3 px-2 text-center">${totals.modelQtyTotals.arm || 0}</td>
          <td class="py-3 px-2 text-center">${totals.modelQtyTotals.rs || 0}</td>
          <td class="py-3 px-2 text-center">${totals.modelQtyTotals.ln3 || 0}</td>
          <td class="py-3 px-2 text-center">${totals.modelQtyTotals.ln5 || 0}</td>
          <td class="py-3 px-2 text-center">${totals.modelQtyTotals.rc || 0}</td>
          <td class="py-3 px-2 text-center text-fuchsia-300 bg-fuchsia-950">${totals.totalLMiniL}</td>
          <td class="py-3 px-2 text-center text-indigo-300 bg-indigo-950">${totals.totalLMiniR}</td>
          <td class="py-3 px-2 text-center">${totals.modelQtyTotals.lbig || 0}</td>
          <td class="py-3 px-2 text-center text-emerald-300 bg-emerald-950 text-sm">${this.fmt(totals.grandTotalUnits, 0)}</td>
          <td class="py-3 px-3 text-amber-200">ค่าแรงตัดรวมรอบนี้: ฿${this.fmt(totals.grandTotalCutWage, 2)}</td>
        </tr>
      `;

      tbody.querySelectorAll('[data-out-idx]').forEach(el => {
        el.addEventListener('change', (e) => {
          const idx = Number(e.target.getAttribute('data-out-idx'));
          const field = e.target.getAttribute('data-out-field');
          const row = round.rows[idx];
          if (!row) return;
          if (field === 'orderRollsText' || field === 'outsourceNote') {
            row[field] = e.target.value;
            if (field === 'orderRollsText') {
              const mRoll = String(e.target.value).match(/(\d+(?:\.\d+)?)\s*ม้วน/);
              if (mRoll && (!row.sentYards || Number(row.sentYards) === 0)) {
                row.sentYards = Number(mRoll[1]) * 50;
              }
            }
          } else {
            row[field] = Number(e.target.value || 0);
            if (field === 'lminiL' || field === 'lminiR') {
              row.lmini = Number(row.lminiL || 0) + Number(row.lminiR || 0);
            }
          }
          this.save();
          this.renderMatrixTab();
        });
      });
    },

    autoFillOutsourceRolls() {
      const round = this.getActiveRound();
      if (!round) return;
      let updated = 0;
      (round.rows || []).forEach(row => {
        const m = computeRowMetrics(row, round.formulaMode);
        if (m.calcRolls > 0) {
          const roundedRolls = Math.ceil(m.calcRolls);
          row.orderRollsText = `${roundedRolls} ม้วน`;
          if (!row.sentYards || Number(row.sentYards) === 0) {
            row.sentYards = roundedRolls * 50;
          }
          updated++;
        }
      });
      this.save();
      this.renderMatrixTab();
      this.toast(`ดึงจำนวนม้วนตามสูตรใส่ช่องส่งไม้เรียบร้อย (${updated} สีผ้า)!`);
    },

    // -----------------------------------------------------------------------
    // TAB B: CUT & SEW STOCK ("ผ้าจับชุดตัด-เย็บ") & WOOD FRAME / UPHOLSTERERS
    // -----------------------------------------------------------------------
    renderCutSewStockTab() {
      const d = this.data;
      const stdTbody = document.getElementById('cut-sew-standard-tbody');
      const lminiTbody = document.getElementById('cut-sew-lmini-tbody');
      const csBsTbody = document.getElementById('cs-bs-lu-matrix-tbody');
      const frameTbody = document.getElementById('wood-frame-stock-tbody');
      if (!stdTbody || !lminiTbody) return;

      // 1. Standard Models Cut-Sew Stock Table
      let stdRows = d.cutSewStockStandard || [];
      if (this.cutSewFilterModel !== 'ALL') {
        stdRows = stdRows.filter(r => r.modelKey === this.cutSewFilterModel);
      }
      if (this.cutSewOnlyShortage) {
        stdRows = stdRows.filter(r => (Number(r.unsewn || 0) + Number(r.sewn || 0) - Number(r.preOrder || 0)) < 0);
      }

      let totalShortageUnits = 0;
      let totalShortageSkus = 0;
      (d.cutSewStockStandard || []).forEach(r => {
        const net = Number(r.unsewn || 0) + Number(r.sewn || 0) - Number(r.preOrder || 0);
        if (net < 0) {
          totalShortageUnits += Math.abs(net);
          totalShortageSkus++;
        }
      });

      const badgeShortage = document.getElementById('cut-sew-shortage-summary');
      if (badgeShortage) {
        badgeShortage.textContent = `ติดลบต้องสั่งตัดเพิ่ม ${totalShortageSkus} รายการ (รวมขาด ${totalShortageUnits} ชุด)`;
      }

      stdTbody.innerHTML = stdRows.map(row => {
        const totalStock = Number(row.unsewn || 0) + Number(row.sewn || 0);
        const netAfterOrder = totalStock - Number(row.preOrder || 0);
        const isShortage = netAfterOrder < 0;

        return `
          <tr class="${isShortage ? 'bg-rose-50/70 hover:bg-rose-100/60' : 'hover:bg-slate-50'} border-b border-slate-200 text-xs">
            <td class="py-2 px-3 font-bold text-slate-900">${row.modelName}</td>
            <td class="py-2 px-2 text-slate-600">${row.fabricType}</td>
            <td class="py-2 px-2 font-semibold text-indigo-900">${row.sku}</td>
            <td class="py-2 px-2 font-medium text-slate-800">${row.color}</td>
            <td class="py-1.5 px-2 text-center bg-amber-50/50">
              <input type="number" min="0" value="${row.unsewn}" data-cs-id="${row.id}" data-cs-field="unsewn"
                class="w-16 px-1.5 py-1 text-center font-bold text-amber-900 border border-amber-300 rounded bg-white">
            </td>
            <td class="py-1.5 px-2 text-center bg-emerald-50/50">
              <input type="number" min="0" value="${row.sewn}" data-cs-id="${row.id}" data-cs-field="sewn"
                class="w-16 px-1.5 py-1 text-center font-bold text-emerald-900 border border-emerald-300 rounded bg-white">
            </td>
            <td class="py-2 px-3 text-center font-extrabold text-slate-900 bg-slate-100">${totalStock}</td>
            <td class="py-1.5 px-2 text-center bg-indigo-50/50">
              <input type="number" min="0" value="${row.preOrder}" data-cs-id="${row.id}" data-cs-field="preOrder"
                class="w-16 px-1.5 py-1 text-center font-bold text-indigo-900 border border-indigo-300 rounded bg-white">
            </td>
            <td class="py-2 px-3 text-center font-extrabold text-sm ${isShortage ? 'text-rose-700 bg-rose-100' : 'text-emerald-700 bg-emerald-50'}">
              ${netAfterOrder > 0 ? `+${netAfterOrder}` : netAfterOrder}
            </td>
            <td class="py-2 px-2 text-center">
              ${isShortage ? `
                <button data-send-shortage-id="${row.id}" class="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold shadow-2xs transition">
                  ➕ สั่งตัดเพิ่ม ${Math.abs(netAfterOrder)} ชุด
                </button>
              ` : `<span class="text-[11px] text-emerald-600 font-semibold">✅ พอส่ง</span>`}
            </td>
          </tr>
        `;
      }).join('');

      stdTbody.querySelectorAll('[data-cs-id]').forEach(inp => {
        inp.addEventListener('change', (e) => {
          const id = e.target.getAttribute('data-cs-id');
          const field = e.target.getAttribute('data-cs-field');
          const target = (d.cutSewStockStandard || []).find(x => x.id === id);
          if (target) {
            target[field] = Number(e.target.value || 0);
            this.save();
            this.renderCutSewStockTab();
          }
        });
      });

      stdTbody.querySelectorAll('[data-send-shortage-id]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.currentTarget.getAttribute('data-send-shortage-id');
          const target = (d.cutSewStockStandard || []).find(x => x.id === id);
          if (!target) return;
          const shortage = Math.abs(Number(target.unsewn || 0) + Number(target.sewn || 0) - Number(target.preOrder || 0));
          if (shortage <= 0) return;
          this.pushShortageItemToActiveRound(target.sku, target.modelKey, shortage);
        });
      });

      // 2. L-Mini Cut-Sew Stock Table (Split Left / Right)
      lminiTbody.innerHTML = (d.cutSewStockLMini || []).map(row => {
        const totalL = Number(row.unsewnL || 0) + Number(row.sewnL || 0);
        const totalR = Number(row.unsewnR || 0) + Number(row.sewnR || 0);
        const totalAll = totalL + totalR;
        const netL = totalL - Number(row.orderL || 0);
        const netR = totalR - Number(row.orderR || 0);
        const hasShortage = netL < 0 || netR < 0;

        return `
          <tr class="${hasShortage ? 'bg-rose-50/70' : 'hover:bg-slate-50'} border-b border-slate-200 text-xs">
            <td class="py-2 px-2 font-semibold text-slate-600">${row.fabricType}</td>
            <td class="py-2 px-2 font-bold text-slate-900">${row.sku}</td>
            <td class="py-2 px-2 font-semibold text-slate-800">${row.color}</td>
            <td class="py-1 px-1.5 text-center bg-amber-50/40">
              <input type="number" min="0" value="${row.unsewnL}" data-lm-id="${row.id}" data-lm-field="unsewnL"
                class="w-12 px-1 py-0.5 text-center font-bold border border-amber-300 rounded bg-white">
            </td>
            <td class="py-1 px-1.5 text-center bg-amber-50/40">
              <input type="number" min="0" value="${row.unsewnR}" data-lm-id="${row.id}" data-lm-field="unsewnR"
                class="w-12 px-1 py-0.5 text-center font-bold border border-amber-300 rounded bg-white">
            </td>
            <td class="py-1 px-1.5 text-center bg-emerald-50/40">
              <input type="number" min="0" value="${row.sewnL}" data-lm-id="${row.id}" data-lm-field="sewnL"
                class="w-12 px-1 py-0.5 text-center font-bold border border-emerald-300 rounded bg-white">
            </td>
            <td class="py-1 px-1.5 text-center bg-emerald-50/40">
              <input type="number" min="0" value="${row.sewnR}" data-lm-id="${row.id}" data-lm-field="sewnR"
                class="w-12 px-1 py-0.5 text-center font-bold border border-emerald-300 rounded bg-white">
            </td>
            <td class="py-2 px-2 text-center font-extrabold bg-slate-100">${totalAll} <span class="text-[10px] font-normal text-slate-500">(L:${totalL}/R:${totalR})</span></td>
            <td class="py-1 px-1.5 text-center bg-indigo-50/40">
              <input type="number" min="0" value="${row.orderL}" data-lm-id="${row.id}" data-lm-field="orderL"
                class="w-12 px-1 py-0.5 text-center font-bold border border-indigo-300 rounded bg-white">
            </td>
            <td class="py-1 px-1.5 text-center bg-indigo-50/40">
              <input type="number" min="0" value="${row.orderR}" data-lm-id="${row.id}" data-lm-field="orderR"
                class="w-12 px-1 py-0.5 text-center font-bold border border-indigo-300 rounded bg-white">
            </td>
            <td class="py-2 px-2 text-center font-extrabold ${netL < 0 ? 'text-rose-700 bg-rose-100' : 'text-emerald-700'}">${netL}</td>
            <td class="py-2 px-2 text-center font-extrabold ${netR < 0 ? 'text-rose-700 bg-rose-100' : 'text-emerald-700'}">${netR}</td>
          </tr>
        `;
      }).join('');

      lminiTbody.querySelectorAll('[data-lm-id]').forEach(inp => {
        inp.addEventListener('change', (e) => {
          const id = e.target.getAttribute('data-lm-id');
          const field = e.target.getAttribute('data-lm-field');
          const target = (d.cutSewStockLMini || []).find(x => x.id === id);
          if (target) {
            target[field] = Number(e.target.value || 0);
            this.save();
            this.renderCutSewStockTab();
          }
        });
      });

      // 3. Low Stock CS / BS / LU Matrix
      if (csBsTbody) {
        const cols = ['ครีม 06', 'น้ำตาล 12', 'ดำ 17', 'เทา 46', 'มอคค่า 48', 'H-น้ำตาล 07', 'H-เขียว 14', 'H-โรส 22', 'H-แดง 23', 'H-เทา 29', 'H-น้ำเงิน 31'];
        csBsTbody.innerHTML = (d.csBsLuStockMatrix || []).map(row => `
          <tr class="border-b border-slate-200 text-xs hover:bg-slate-50">
            <td class="py-2.5 px-3 font-bold text-slate-900 bg-slate-50">${row.model}</td>
            ${cols.map(c => {
              const v = Number(row[c] || 0);
              const cls = v <= 15 ? 'bg-rose-100 text-rose-800 font-extrabold' : (v <= 35 ? 'bg-amber-50 text-amber-800 font-bold' : 'text-slate-800 font-semibold');
              return `<td class="py-2.5 px-2 text-center ${cls}">${v}</td>`;
            }).join('')}
          </tr>
        `).join('');
      }

      // 4. Wood Frame Stock & Upholsterers Roster
      if (frameTbody) {
        frameTbody.innerHTML = (d.woodFrameStock || []).map((row, idx) => {
          const rem = Number(row.woodDone || 0) - Number(row.upholsterUsed || 0);
          return `
            <tr class="border-b border-slate-200 text-xs hover:bg-slate-50">
              <td class="py-2.5 px-3 font-bold text-slate-900">${row.model}</td>
              <td class="py-1.5 px-2 text-center">
                <input type="number" min="0" value="${row.woodDone}" data-wf-idx="${idx}" data-wf-field="woodDone"
                  class="w-20 px-2 py-1 text-center font-bold text-indigo-900 border border-indigo-300 rounded bg-white">
              </td>
              <td class="py-1.5 px-2 text-center">
                <input type="number" min="0" value="${row.upholsterUsed}" data-wf-idx="${idx}" data-wf-field="upholsterUsed"
                  class="w-20 px-2 py-1 text-center font-bold text-amber-900 border border-amber-300 rounded bg-white">
              </td>
              <td class="py-2.5 px-3 text-center font-extrabold text-sm text-emerald-700 bg-emerald-50">${rem} โครง</td>
              <td class="py-2.5 px-3 text-slate-700 font-medium">${row.upholsterers}</td>
              <td class="py-2.5 px-3 text-slate-500">${row.note}</td>
            </tr>
          `;
        }).join('');

        frameTbody.querySelectorAll('[data-wf-idx]').forEach(inp => {
          inp.addEventListener('change', (e) => {
            const idx = Number(e.target.getAttribute('data-wf-idx'));
            const field = e.target.getAttribute('data-wf-field');
            const target = d.woodFrameStock[idx];
            if (target) {
              target[field] = Number(e.target.value || 0);
              target.remaining = Number(target.woodDone || 0) - Number(target.upholsterUsed || 0);
              this.save();
              this.renderCutSewStockTab();
            }
          });
        });
      }
    },

    // Push a single shortage or all shortages from Cut-Sew Stock to Active Cutting Round
    pushShortageItemToActiveRound(sku, modelKey, qtyToAdd) {
      const round = this.getActiveRound();
      if (!round) return;
      const targetRow = (round.rows || []).find(r => r.sku.toLowerCase() === sku.toLowerCase());
      if (!targetRow) {
        this.toast(`ไม่พบรหัสผ้า ${sku} ในตารางเบิกผ้า`, '⚠️');
        return;
      }
      targetRow[modelKey] = Number(targetRow[modelKey] || 0) + Number(qtyToAdd || 0);
      this.save();
      this.renderAll();
      this.toast(`ส่งยอดสั่งตัด ${sku} (${modelKey.toUpperCase()} +${qtyToAdd} ชุด) เข้า "${round.name}" เรียบร้อย!`);
    },

    pushAllShortagesToActiveRound() {
      const d = this.data;
      const round = this.getActiveRound();
      if (!round) return;
      let count = 0;

      (d.cutSewStockStandard || []).forEach(item => {
        const net = Number(item.unsewn || 0) + Number(item.sewn || 0) - Number(item.preOrder || 0);
        if (net < 0) {
          const need = Math.abs(net);
          const row = round.rows.find(r => r.sku.toLowerCase() === item.sku.toLowerCase());
          if (row) {
            row[item.modelKey] = need;
            count++;
          }
        }
      });

      (d.cutSewStockLMini || []).forEach(item => {
        const netL = Number(item.unsewnL || 0) + Number(item.sewnL || 0) - Number(item.orderL || 0);
        const netR = Number(item.unsewnR || 0) + Number(item.sewnR || 0) - Number(item.orderR || 0);
        if (netL < 0 || netR < 0) {
          const row = round.rows.find(r => r.sku.toLowerCase() === item.sku.toLowerCase());
          if (row) {
            if (netL < 0) row.lminiL = Math.abs(netL);
            if (netR < 0) row.lminiR = Math.abs(netR);
            row.lmini = Number(row.lminiL || 0) + Number(row.lminiR || 0);
            count++;
          }
        }
      });

      this.save();
      this.renderAll();
      if (typeof window.switchFabricTab === 'function') {
        window.switchFabricTab('tab-admin-routine');
      }
      this.toast(`ดึงยอดที่ติดลบทั้งหมด (${count} รายการ) เข้าตารางคำนวณตัดผ้า "${round.name}" สำเร็จ!`);
    },

    // -----------------------------------------------------------------------
    // TAB C: PRE-ORDER DAILY MATRIX (LEGS & GEARS) + UPLOAD + SPARE PARTS + BILLING
    // -----------------------------------------------------------------------
    renderPreOrderAndBillingTab() {
      const d = this.data;
      const poTbody = document.getElementById('preorder-daily-tbody');
      const spTbody = document.getElementById('spare-parts-tbody');
      const billTbody = document.getElementById('monthly-billing-tbody');
      if (!poTbody) return;

      // Populate manual SKU selector if empty
      const skuSelect = document.getElementById('po-manual-sku');
      if (skuSelect && skuSelect.options.length === 0) {
        skuSelect.innerHTML = ROUTINE_FABRICS.map(f =>
          `<option value="${f.sku}">${f.sku} (${f.color} - ${f.group})</option>`
        ).join('');
      }

      let totalUnitsAll = 0;
      let totalYardsAll = 0;
      let totalLegsAll = 0;
      let totalGearsAll = 0;

      const records = d.preOrderDailyRecords || [];
      if (records.length === 0) {
        poTbody.innerHTML = `
          <tr>
            <td colspan="8" class="py-8 text-center text-slate-400 text-xs">
              ยังไม่มีรายการ Pre-Order • ลากไฟล์ Excel (.xlsx / .csv) มาวางในกล่องด้านบน หรือเพิ่มรายการด่วนได้เลยครับ
            </td>
          </tr>
        `;
      } else {
        poTbody.innerHTML = records.map((rec, rIdx) => {
          const entries = Object.entries(rec.colorBreakdown || {}).filter(([, q]) => Number(q || 0) > 0);
          const sumUnits = entries.reduce((s, [, q]) => s + Number(q || 0), 0);
          const sumYards = sumUnits * Number(rec.yardsPerUnit || 0);
          const sumRolls = sumYards / 50;
          const sumLegs = sumUnits * Number(rec.legsPerUnit || 6);
          const sumLegBags = sumLegs / 500; // 500 legs per bag
          const sumGears = sumUnits * Number(rec.gearPerUnit || 0);
          const sumGearBoxes = sumGears / 15; // 15 pairs per box

          totalUnitsAll += sumUnits;
          totalYardsAll += sumYards;
          totalLegsAll += sumLegs;
          totalGearsAll += sumGears;

          const breakdownBadges = entries.map(([sku, q]) => {
            const fab = ROUTINE_FABRICS.find(f => f.sku.toLowerCase() === sku.toLowerCase() || f.shortCode.toLowerCase() === sku.toLowerCase());
            const colorHint = fab ? ` (${fab.color})` : '';
            const lrInfo = rec.lminiLR && rec.lminiLR[sku]
              ? ` <span class="text-[10px] text-fuchsia-700 font-bold">[L:${rec.lminiLR[sku].L || 0}/R:${rec.lminiLR[sku].R || 0}]</span>`
              : '';
            return `
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-indigo-50 text-slate-800 border border-slate-300 text-[11px] font-semibold">
                <span>${sku}${colorHint}:</span>
                <input type="number" min="0" value="${q}" data-po-rec-idx="${rIdx}" data-po-sku="${sku}"
                  class="w-11 px-1 py-0 text-center font-extrabold text-indigo-700 bg-white border border-indigo-200 rounded text-[11px]">
                ${lrInfo}
              </span>
            `;
          }).join(' ');

          return `
            <tr class="border-b border-slate-200 text-xs hover:bg-slate-50">
              <td class="py-2.5 px-3 font-semibold text-indigo-700 whitespace-nowrap">
                <input type="text" value="${rec.dateRange || ''}" data-po-date-idx="${rIdx}"
                  class="w-28 px-1.5 py-0.5 text-xs font-semibold text-indigo-700 bg-indigo-50/50 border border-indigo-200 rounded">
              </td>
              <td class="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">${rec.modelLabel}</td>
              <td class="py-2 px-3">
                <div class="flex flex-wrap gap-1.5 items-center">${breakdownBadges || '<span class="text-slate-400">-</span>'}</div>
              </td>
              <td class="py-2.5 px-3 text-center font-extrabold text-slate-900 bg-slate-50">${this.fmt(sumUnits, 0)} ตัว</td>
              <td class="py-2.5 px-3 text-right font-bold text-indigo-800 whitespace-nowrap">
                ${this.fmt(sumYards, 1)} หลา
                <div class="text-[10px] text-fuchsia-700">(${this.fmt(sumRolls, 1)} ม้วน)</div>
              </td>
              <td class="py-2.5 px-3 text-right bg-amber-50/60 font-semibold text-amber-900 whitespace-nowrap">
                ${this.fmt(sumLegs, 0)} ขา
                <div class="text-[10px] text-amber-700 font-bold">≈ ${this.fmt(sumLegBags, 2)} ถุง (÷500)</div>
              </td>
              <td class="py-2.5 px-3 text-right bg-emerald-50/60 font-semibold text-emerald-900 whitespace-nowrap">
                ${sumGears > 0 ? `${this.fmt(sumGears, 0)} คู่ <div class="text-[10px] text-emerald-700 font-bold">≈ ${this.fmt(sumGearBoxes, 1)} ลัง (÷15)</div>` : '-'}
              </td>
              <td class="py-2.5 px-2 text-center">
                <button type="button" data-po-del-idx="${rIdx}" title="ลบแถวนี้"
                  class="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-[11px] font-bold transition">
                  🗑️
                </button>
              </td>
            </tr>
          `;
        }).join('');
      }

      poTbody.querySelectorAll('[data-po-rec-idx]').forEach(inp => {
        inp.addEventListener('change', (e) => {
          const rIdx = Number(e.target.getAttribute('data-po-rec-idx'));
          const sku = e.target.getAttribute('data-po-sku');
          const val = Number(e.target.value || 0);
          const rec = d.preOrderDailyRecords[rIdx];
          if (!rec || !rec.colorBreakdown) return;
          if (val <= 0) {
            delete rec.colorBreakdown[sku];
          } else {
            rec.colorBreakdown[sku] = val;
          }
          this.save();
          this.renderPreOrderAndBillingTab();
        });
      });

      poTbody.querySelectorAll('[data-po-date-idx]').forEach(inp => {
        inp.addEventListener('change', (e) => {
          const rIdx = Number(e.target.getAttribute('data-po-date-idx'));
          if (d.preOrderDailyRecords[rIdx]) {
            d.preOrderDailyRecords[rIdx].dateRange = e.target.value;
            this.save();
          }
        });
      });

      poTbody.querySelectorAll('[data-po-del-idx]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const rIdx = Number(e.currentTarget.getAttribute('data-po-del-idx'));
          d.preOrderDailyRecords.splice(rIdx, 1);
          this.save();
          this.renderPreOrderAndBillingTab();
          this.toast('ลบแถวรายการ Pre-Order เรียบร้อย');
        });
      });

      const poFoot = document.getElementById('preorder-daily-tfoot');
      if (poFoot) {
        poFoot.innerHTML = `
          <tr class="bg-slate-900 text-white font-bold text-xs">
            <td colspan="3" class="py-2.5 px-3">รวมยอด Pre-Order ทั้งหมด (คำนวณขาโซฟา 1" & เกียร์ปรับนอนอัตโนมัติ)</td>
            <td class="py-2.5 px-3 text-center text-amber-300 text-sm">${this.fmt(totalUnitsAll, 0)} ตัว</td>
            <td class="py-2.5 px-3 text-right text-emerald-300">${this.fmt(totalYardsAll, 1)} หลา (${this.fmt(totalYardsAll / 50, 1)} ม้วน)</td>
            <td class="py-2.5 px-3 text-right text-amber-300">${this.fmt(totalLegsAll, 0)} ขา (${this.fmt(totalLegsAll / 500, 2)} ถุง)</td>
            <td class="py-2.5 px-3 text-right text-emerald-300">${this.fmt(totalGearsAll, 0)} คู่ (${this.fmt(totalGearsAll / 15, 1)} ลัง)</td>
            <td class="py-2.5 px-2"></td>
          </tr>
        `;
      }

      // 2. Spare Parts Cutting Table ("ตัดอะไหล่ชิ้นส่วนเพิ่ม")
      if (spTbody) {
        spTbody.innerHTML = (d.sparePartsOrders || []).map((sp, idx) => `
          <tr class="border-b border-slate-200 text-xs hover:bg-slate-50">
            <td class="py-2 px-3 font-bold text-slate-900">${sp.model}</td>
            <td class="py-2 px-3 font-semibold text-indigo-900">${sp.partName}</td>
            <td class="py-2 px-3 text-slate-700">${sp.color}</td>
            <td class="py-2 px-2 text-center font-bold">${sp.reqQty} ชิ้น</td>
            <td class="py-1.5 px-2 text-center">
              <input type="number" min="0" value="${sp.cutDoneQty}" data-sp-idx="${idx}"
                class="w-16 px-1.5 py-0.5 text-center font-bold text-emerald-800 border border-emerald-300 rounded bg-white">
            </td>
            <td class="py-2 px-3 text-center">
              <span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${sp.cutDoneQty >= sp.reqQty ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                ${sp.cutDoneQty >= sp.reqQty ? '✅ ตัดครบแล้ว' : '⏳ รอตัดส่งพร้อมรอบถัดไป'}
              </span>
            </td>
          </tr>
        `).join('');

        spTbody.querySelectorAll('[data-sp-idx]').forEach(inp => {
          inp.addEventListener('change', (e) => {
            const idx = Number(e.target.getAttribute('data-sp-idx'));
            if (d.sparePartsOrders[idx]) {
              d.sparePartsOrders[idx].cutDoneQty = Number(e.target.value || 0);
              this.save();
              this.renderPreOrderAndBillingTab();
            }
          });
        });
      }

      // 3. Monthly Cutter Billing & Fabric Summary across all Rounds ("รวมยอดสั่งตัดผ้า พ.ย 69")
      if (billTbody) {
        billTbody.innerHTML = d.rounds.filter(r => r.formulaMode !== 'BOON').map(r => {
          const t = computeRoundTotals(r);
          return `
            <tr class="border-b border-slate-200 text-xs hover:bg-slate-50">
              <td class="py-2.5 px-3 font-bold text-slate-900">${r.name}</td>
              <td class="py-2.5 px-3 text-slate-600">${r.sendDate || '-'}</td>
              <td class="py-2.5 px-2 text-center font-bold text-indigo-800">${this.fmt(t.grandTotalUnits, 0)} ชุด</td>
              <td class="py-2.5 px-3 text-right font-extrabold text-emerald-700 bg-emerald-50/60">฿${this.fmt(t.grandTotalCutWage, 2)}</td>
              <td class="py-2.5 px-3 text-right font-semibold text-slate-700">${this.fmt(t.groupSummary['PVC หนัง'].yardsSent, 1)} หลา</td>
              <td class="py-2.5 px-3 text-right font-semibold text-slate-700">${this.fmt(t.groupSummary['ลูกฟูก'].yardsSent, 1)} หลา</td>
              <td class="py-2.5 px-3 text-right font-semibold text-slate-700">${this.fmt(t.groupSummary['Hollan'].yardsSent, 1)} หลา</td>
              <td class="py-2.5 px-3 text-right font-semibold text-slate-700">${this.fmt(t.groupSummary['นาโน'].yardsSent, 1)} หลา</td>
              <td class="py-2.5 px-3 text-right font-bold text-amber-900 bg-amber-50/60">฿${this.fmt(t.grandTotalFabricCost, 2)}</td>
            </tr>
          `;
        }).join('');
      }
    },

    // Helper: Match a string header or cell to a ROUTINE_FABRICS entry
    matchFabricFromText(rawText) {
      if (rawText === null || rawText === undefined) return null;
      const s = String(rawText).trim().toLowerCase();
      if (!s) return null;

      // 1. Check explicit aliases & SKU / shortCode substrings first (most specific)
      for (const f of ROUTINE_FABRICS) {
        if (s === f.sku.toLowerCase() || s.includes(f.sku.toLowerCase())) return f;
        if (f.shortCode && (s === f.shortCode.toLowerCase() || s.includes(f.shortCode.toLowerCase()))) return f;
        if (Array.isArray(f.aliases)) {
          for (const al of f.aliases) {
            if (s === al || s.includes(al)) return f;
          }
        }
      }

      // 2. Exact color column headers (used in "แยกPre-Order ตัด พ.ย" row 1: ขาว, ครีม, น้ำตาล, ชา, ดำ, เทา, มอคค่า)
      const exactColorMap = {
        'ขาว': 'PQ002C-06',
        'ครีม': 'PQ002C-06',
        'น้ำตาล': 'PQ002C-12',
        'สีน้ำตาล': 'PQ002C-12',
        'ชา': 'PQ002C-19',
        'ดำ': 'PQ002C-17',
        'สีดำ': 'PQ002C-17',
        'เทา': 'PQ002C-46',
        'สีเทา': 'PQ002C-46',
        'มอคค่า': 'PQ002C-48',
        'มอค่า': 'PQ002C-48'
      };
      if (exactColorMap[s]) {
        return ROUTINE_FABRICS.find(x => x.sku === exactColorMap[s]) || null;
      }

      // 3. Exact color property match
      for (const f of ROUTINE_FABRICS) {
        if (s === (f.color || '').toLowerCase()) return f;
      }
      return null;
    },

    // Helper: Match a string header or cell (including Shopee/TikTok Qs-... SKUs) to a model key + optional L/R side
    matchModelFromText(rawText) {
      if (rawText === null || rawText === undefined) return null;
      const s = String(rawText).trim().toLowerCase();
      if (!s) return null;

      // Detect L/R side helper
      const detectSide = (txt) => {
        if (txt.includes('แอลขวา') || txt.includes('ขวา') || /\(r\)|\br\b/i.test(txt)) return 'R';
        if (txt.includes('แอลซ้าย') || txt.includes('ซ้าย') || /\(l\)|\bl\b/i.test(txt)) return 'L';
        return 'L';
      };

      // 1. L-Mini (including Shopee/TikTok Mnn(L/R), Mncf(L/R), Mnh(L/R), Mn(L/R), ตัวแอลมินิมอล)
      if (
        s.includes('l-mini') || s.includes('l mini') || s.includes('lmini') ||
        s.includes('แอลมินิ') || s.includes('ตัวแอล') ||
        /mnn\(|mncf\(|mnh\(|-mn\(/i.test(s)
      ) {
        return { key: 'lmini', side: detectSide(s) };
      }

      // 2. L ใหญ่
      if (s.includes('l ใหญ่') || s.includes('l-ใหญ่') || s.includes('lbig') || s.includes('แอลใหญ่')) {
        return { key: 'lbig' };
      }

      // 3. RC / PN ปรับนอน (including Shopee/TikTok -rch-, -rcs-, -rcn-, -rcw-, -rcii-, โซฟาเบดปรับนอน)
      if (
        s.includes('ปรับนอน') || s.includes('pn lit') ||
        /-rch|-rcs|-rcn|-rcw|-rcii/i.test(s) ||
        /\brc\b|\bpn\b/i.test(s)
      ) {
        return { key: 'rc' };
      }

      // 4. RS หัวกระดก (including Shopee/TikTok -rss-, -rsh-, -rsn-, -rsw-, -rsii-, โซฟาเบดหัวกระดก)
      if (
        s.includes('หัวกระดก') || s.includes('กระดก') ||
        /-rss|-rsh|-rsn|-rsw|-rsii/i.test(s) ||
        /\brs\b/i.test(s)
      ) {
        return { key: 'rs' };
      }

      // 5. LN3 กระดุม 19 เม็ด / กระดุมวางแก้ว (including Shopee/TikTok -ln3-)
      if (
        s.includes('19 เม็ด') || s.includes('กระดุมวางแก้ว') ||
        s.includes('ln3') || s.includes('ln 3')
      ) {
        return { key: 'ln3' };
      }

      // 6. LN5 กระดุม 5 เม็ด / เบาะกระดุมเล็ก LZ (including Shopee/TikTok -lz-, -ln5-)
      if (
        s.includes('5 เม็ด') || s.includes('กระดุมเล็ก') ||
        s.includes('-lz-') || s.includes('ln5') || s.includes('ln 5') || /\bln\b/i.test(s)
      ) {
        return { key: 'ln5' };
      }

      // 7. CS2 / BS2 (2 ที่นั่ง)
      if (
        s.includes('cs2') || s.includes('2pl') || s.includes('2 pl') || s.includes('2ll') ||
        s.includes('bs2') || s.includes('2ที่นั่ง') || s.includes('2 ที่นั่ง')
      ) {
        return { key: 'cs2' };
      }

      // 8. CS3 / BS3 / LU3 (3 ที่นั่ง)
      if (
        s.includes('cs3') || s.includes('3pl') || s.includes('3 pl') || s.includes('3ll') ||
        s.includes('bs3') || s.includes('lu3') || s.includes('3ที่นั่ง') || s.includes('3 ที่นั่ง')
      ) {
        return { key: 'cs3' };
      }

      // 9. เฉพาะแขน (only when not part of ท้าวแขน / มีแขน)
      if (
        s.includes('เฉพาะแขน') || s.includes('แขน new') ||
        (s.includes('แขน') && !s.includes('ท้าวแขน') && !s.includes('มีแขน'))
      ) {
        return { key: 'arm' };
      }

      return null;
    },

    getModelMeta(modelKey) {
      const m = ROUTINE_MODELS.find(x => x.key === modelKey) || ROUTINE_MODELS[0];
      const labelMap = {
        cs2: 'CS2 / BS2 2 ที่นั่ง (3.20 หลา)',
        cs3: 'CS3 / BS3 / LU3 3 ที่นั่ง (4.33 หลา)',
        arm: 'เฉพาะแขน New (1.93 หลา)',
        rs: 'RS หัวกระดก (6.26 หลา)',
        ln3: 'LN3 กระดุม 19 เม็ด (6.21 หลา)',
        ln5: 'LN5 / LZ กระดุม 5 เม็ด (6.17 หลา)',
        rc: 'RC / PN ปรับนอน (6.65 หลา)',
        lmini: 'L-Mini แอลมินิมอล (8.97 หลา)',
        lbig: 'L ใหญ่ (11.00 หลา)'
      };
      return {
        modelKey: m.key,
        modelLabel: labelMap[m.key] || `${m.label} (${m.yardsPerUnit || m.yards} หลา)`,
        yardsPerUnit: Number(m.yardsPerUnit || m.yards || 4.33),
        legsPerUnit: Number(m.legs !== undefined ? m.legs : 6),
        gearPerUnit: Number(m.gear !== undefined ? m.gear : 0)
      };
    },

    // Parse CSV text into 2D array of rows (handles quoted fields with commas cleanly)
    parseCsvTextToRows(text) {
      const rows = [];
      const lines = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        const cells = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
              cur += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (ch === ',' && !inQuotes) {
            cells.push(cur.trim());
            cur = '';
          } else {
            cur += ch;
          }
        }
        cells.push(cur.trim());
        rows.push(cells);
      }
      return rows;
    },

    // Parse a 2D array of rows from one sheet/CSV into aggByModel and return total units parsed in this sheet
    parseSheetRowsIntoAgg(rows, aggByModel) {
      if (!rows || rows.length < 1) return 0;
      let sheetUnits = 0;

      const addItem = (modelKey, sku, qty, side) => {
        const num = Number(qty || 0);
        if (!modelKey || !sku || isNaN(num) || num <= 0) return;
        if (!aggByModel[modelKey]) {
          aggByModel[modelKey] = { colorBreakdown: {}, lminiLR: {} };
        }
        aggByModel[modelKey].colorBreakdown[sku] = (aggByModel[modelKey].colorBreakdown[sku] || 0) + num;
        if (modelKey === 'lmini') {
          if (!aggByModel[modelKey].lminiLR[sku]) aggByModel[modelKey].lminiLR[sku] = { L: 0, R: 0 };
          if (side === 'R') aggByModel[modelKey].lminiLR[sku].R += num;
          else aggByModel[modelKey].lminiLR[sku].L += num;
        }
        sheetUnits += num;
      };

      // -------------------------------------------------------------------
      // 1. Check if this sheet is a Shopee / TikTok / E-Commerce Order List
      //    (contains "Qs-" SKUs or "หมายเลขคำสั่งซื้อ" / "เลขอ้างอิง SKU")
      // -------------------------------------------------------------------
      let ecomRowCount = 0;
      for (let r = 0; r < Math.min(25, rows.length); r++) {
        const lineStr = (rows[r] || []).join(' ');
        if (/qs-|หมายเลขคำสั่งซื้อ|เลขอ้างอิง sku|สินค้าพรีออเดอร์/i.test(lineStr)) {
          ecomRowCount++;
        }
      }

      if (ecomRowCount >= 1) {
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r] || [];
          if (row.length < 2) continue;
          const firstCell = String(row[0] || '').trim();
          if (firstCell.includes('หมายเลขคำสั่งซื้อ') || firstCell.toLowerCase() === 'order id') continue;

          // Find which cell holds the SKU (e.g. Col 3 in Shopee, Col 1 in TikTok)
          let skuCol = -1;
          for (let c = 0; c < row.length; c++) {
            const cellStr = String(row[c] || '').trim();
            if (/^qs-/i.test(cellStr) || (this.matchModelFromText(cellStr) && this.matchFabricFromText(cellStr))) {
              skuCol = c;
              break;
            }
          }
          if (skuCol < 0) continue;

          const skuText = String(row[skuCol] || '');
          const optText = String(row[skuCol + 1] || '');
          const combinedText = `${skuText} ${optText}`;

          const mInfo = this.matchModelFromText(combinedText);
          const fab = this.matchFabricFromText(combinedText) || this.matchFabricFromText(skuText) || this.matchFabricFromText(optText);
          if (!mInfo || !fab) continue;

          // Extract quantity:
          // In Shopee: row[3]=SKU, row[4]=ชื่อตัวเลือก, row[5]=จำนวน
          // In TikTok: row[1]=SKU, row[2]=ชื่อตัวเลือก, row[3]=จำนวน
          let qty = 0;
          const candidateCols = [skuCol + 2, skuCol + 1];
          for (const cIdx of candidateCols) {
            if (cIdx < row.length) {
              const rawCell = String(row[cIdx] ?? '').trim();
              if (/^\d+(\.\d+)?$/.test(rawCell)) {
                const v = Number(rawCell);
                if (v > 0 && v <= 500) {
                  qty = v;
                  break;
                }
              }
            }
          }
          if (qty <= 0) {
            // Fallback: find any cell after skuCol that is a pure small number (not a date or tracking number)
            for (let c = skuCol + 1; c < row.length; c++) {
              const rawCell = String(row[c] ?? '').trim();
              if (/^\d+$/.test(rawCell)) {
                const v = Number(rawCell);
                if (v > 0 && v <= 500) {
                  qty = v;
                  break;
                }
              }
            }
          }
          if (qty <= 0) qty = 1;

          addItem(mInfo.key, fab.sku, qty, mInfo.side);
        }
        if (sheetUnits > 0) return sheetUnits;
      }

      // -------------------------------------------------------------------
      // 2. Check for Header Row (Matrix or Transposed Matrix)
      // -------------------------------------------------------------------
      let headerRowIdx = -1;
      let colModels = {};  // colIdx -> { key, side }
      let colFabrics = {}; // colIdx -> fab

      for (let r = 0; r < Math.min(12, rows.length); r++) {
        const rowCells = rows[r] || [];
        const tempModels = {};
        const tempFabrics = {};
        rowCells.forEach((cellVal, cIdx) => {
          const sCell = String(cellVal || '').trim();
          if (!sCell) return;
          // Ignore summary/yardage/roll columns when matching models
          if (
            !sCell.includes('รวม') &&
            !sCell.includes('ม้วน') &&
            !sCell.includes('ส่งไม้') &&
            !sCell.includes('ราคา') &&
            !sCell.includes('คงเหลือ') &&
            !sCell.includes('หมายเหตุ')
          ) {
            const mMatch = this.matchModelFromText(sCell);
            if (mMatch) tempModels[cIdx] = mMatch;
          }
          const fMatch = this.matchFabricFromText(sCell);
          if (fMatch) tempFabrics[cIdx] = fMatch;
        });

        if (Object.keys(tempModels).length >= 2) {
          headerRowIdx = r;
          colModels = tempModels;
          // Check next 2 rows for L-Mini ซ้าย/ขวา or "รวมหลา" subheaders
          for (let subR = r + 1; subR <= Math.min(r + 2, rows.length - 1); subR++) {
            (rows[subR] || []).forEach((subCell, cIdx) => {
              const sText = String(subCell || '').trim().toLowerCase();
              if (!sText) return;
              if (sText.includes('รวมหลา') || sText === 'รวม' || sText.includes('ม้วน')) {
                delete colModels[cIdx];
              } else if (sText.includes('ขวา') || sText === 'r' || sText.includes('(r)')) {
                colModels[cIdx] = { key: 'lmini', side: 'R' };
              } else if (sText.includes('ซ้าย') || sText === 'l' || sText.includes('(l)')) {
                colModels[cIdx] = { key: 'lmini', side: 'L' };
              }
            });
          }
          break;
        }

        if (Object.keys(tempFabrics).length >= 4) {
          headerRowIdx = r;
          colFabrics = tempFabrics;
          break;
        }
      }

      // CASE A: Standard Cutting / Outsource / Pre-Order Template Matrix (Rows = Fabrics, Cols = Models)
      if (headerRowIdx >= 0 && Object.keys(colModels).length >= 2) {
        for (let r = headerRowIdx + 1; r < rows.length; r++) {
          const row = rows[r] || [];
          const firstCellsText = row.slice(0, 4).join(' ');
          if (firstCellsText.includes('รวมจำนวน') || firstCellsText.includes('ราคาค่าแรง') || firstCellsText.includes('ราคาตัด')) break;

          let fab = null;
          for (let c = 0; c < Math.min(4, row.length); c++) {
            const cellStr = String(row[c] || '').trim();
            if (!cellStr || cellStr === 'PVC หนัง' || cellStr === 'ลูกฟูก' || cellStr === 'Hollan' || cellStr === 'นาโน') continue;
            fab = this.matchFabricFromText(cellStr);
            if (fab) break;
          }
          if (!fab) continue;

          Object.entries(colModels).forEach(([cIdxStr, mInfo]) => {
            const cIdx = Number(cIdxStr);
            const rawVal = String(row[cIdx] ?? '').trim();
            if (!rawVal) return;
            const qty = parseFloat(rawVal.replace(/,/g, ''));
            if (!isNaN(qty) && qty > 0 && qty < 10000) {
              addItem(mInfo.key, fab.sku, qty, mInfo.side);
            }
          });
        }
        return sheetUnits;
      }

      // CASE B: Transposed / Sectioned Pre-Order Sheet (like "แยกPre-Order ตัด พ.ย" where Row 1 = Colors, and sections below = "รุ่น กระดุม 19 เม็ด", daily rows, etc.)
      if (headerRowIdx >= 0 && Object.keys(colFabrics).length >= 4) {
        let currentSectionModel = null;
        for (let r = headerRowIdx + 1; r < rows.length; r++) {
          const row = rows[r] || [];
          const firstCell = String(row[0] ?? '').trim();
          const secondCell = String(row[1] ?? '').trim();

          // Skip summary/formula rows in "แยกPre-Order" so we don't double-count daily rows + total row
          if (
            firstCell === 'รวม' ||
            firstCell.includes('ใช้หลา') ||
            firstCell.includes('การสั่ง/ม้วน') ||
            firstCell.includes('รวมยอด')
          ) {
            continue;
          }

          // Check if this row starts a new model section (e.g., "รุ่น กระดุม 19 เม็ด", "รุ่น ปรับนอน RC")
          const rowTextJoined = row.slice(0, 8).join(' ');
          const isSectionHeader = firstCell.startsWith('รุ่น') || (rowTextJoined.includes('ใช้') && rowTextJoined.includes('หลา'));
          const rowModelMatch = this.matchModelFromText(firstCell) || (firstCell.startsWith('รุ่น') ? this.matchModelFromText(`${firstCell} ${secondCell}`) : null);
          if (rowModelMatch) {
            currentSectionModel = rowModelMatch;
            if (!isSectionHeader) {
              // Single-row transposed matrix (row is the model data itself)
              Object.entries(colFabrics).forEach(([cIdxStr, fab]) => {
                const cIdx = Number(cIdxStr);
                const rawVal = String(row[cIdx] ?? '').trim();
                if (/^\d+(\.\d+)?$/.test(rawVal)) {
                  const qty = Number(rawVal);
                  if (qty > 0 && qty < 5000) {
                    addItem(currentSectionModel.key, fab.sku, qty, currentSectionModel.side);
                  }
                }
              });
            }
            continue;
          }

          // Otherwise, if we are inside a model section (e.g., daily rows 1/11, 2/11, ...), sum the fabric columns
          if (currentSectionModel) {
            Object.entries(colFabrics).forEach(([cIdxStr, fab]) => {
              const cIdx = Number(cIdxStr);
              const rawVal = String(row[cIdx] ?? '').trim();
              if (/^\d+(\.\d+)?$/.test(rawVal)) {
                const qty = Number(rawVal);
                if (qty > 0 && qty < 5000) {
                  addItem(currentSectionModel.key, fab.sku, qty, currentSectionModel.side);
                }
              }
            });
          }
        }
        return sheetUnits;
      }

      return sheetUnits;
    },

    // Handle uploaded or dropped Excel/CSV files in Tab 3
    handlePreOrderFilesUpload(fileList) {
      if (!fileList || fileList.length === 0) return;
      if (typeof XLSX === 'undefined') {
        this.toast('ไม่พบไลบรารี XLSX สำหรับอ่านไฟล์', '⚠️');
        return;
      }

      const dateLabel = (document.getElementById('preorder-upload-date-label')?.value || '').trim() ||
        `อัปโหลด ${new Date().toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}`;
      const uploadMode = document.getElementById('preorder-upload-mode')?.value || 'REPLACE';
      const statusEl = document.getElementById('preorder-upload-status');

      const aggByModel = {};
      const files = Array.from(fileList);
      let processedFiles = 0;
      let totalParsedUnits = 0;
      const importedSheetNames = [];

      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target.result);
            const isZip = data.length >= 2 && data[0] === 0x50 && data[1] === 0x4B;
            const isOle = data.length >= 2 && data[0] === 0xD0 && data[1] === 0xCF;
            const isCsvOrTxt = /\.(csv|txt)$/i.test(file.name || '') || (!isZip && !isOle);

            if (isCsvOrTxt) {
              // Decode UTF-8 directly (with Windows-874 Thai fallback) so Thai characters in CSV are never garbled
              let textContent = new TextDecoder('utf-8').decode(data);
              if (textContent.includes('\uFFFD')) {
                try {
                  textContent = new TextDecoder('windows-874').decode(data);
                } catch (_) {}
              }
              const csvRows = this.parseCsvTextToRows(textContent);
              const u = this.parseSheetRowsIntoAgg(csvRows, aggByModel);
              if (u > 0) {
                totalParsedUnits += u;
                importedSheetNames.push(file.name);
              }
            } else {
              const wb = XLSX.read(data, { type: 'array' });
              const sheetNames = wb.SheetNames || [];

              // If multi-sheet workbook (like "ใบเบิกผ้า ช่างตัด 69.xlsx" with 40 sheets):
              // Prioritize active Pre-Order sheet or latest round sheet rather than summing 40 historical sheets
              let targetSheets = sheetNames;
              if (sheetNames.length > 3) {
                const preOrderSheet = sheetNames.find(sn => /แยก\s*pre-?order/i.test(sn));
                const roundSheets = sheetNames.filter(sn => !sn.includes('ฟอร์ม') && !sn.includes('สูตรคุณบุญ'));
                if (preOrderSheet) {
                  targetSheets = [preOrderSheet, ...roundSheets];
                } else {
                  targetSheets = roundSheets.length > 0 ? roundSheets : sheetNames;
                }
              }

              for (const sheetName of targetSheets) {
                const sheet = wb.Sheets[sheetName];
                if (!sheet) continue;
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                const u = this.parseSheetRowsIntoAgg(rows, aggByModel);
                if (u > 0) {
                  totalParsedUnits += u;
                  importedSheetNames.push(`${file.name} [${sheetName}]`);
                  // If this is a multi-sheet historical workbook (>3 sheets), stop after importing the first valid main sheet
                  if (sheetNames.length > 3) break;
                }
              }
            }
          } catch (err) {
            console.error('PreOrder upload parse error:', err);
          } finally {
            processedFiles++;
            if (processedFiles === files.length) {
              const labelNames = importedSheetNames.length > 0 ? importedSheetNames.join(', ') : files.map(f => f.name).join(', ');
              this.finalizePreOrderUpload(aggByModel, dateLabel, uploadMode, totalParsedUnits, labelNames, statusEl);
            }
          }
        };
        reader.readAsArrayBuffer(file);
      });
    },

    finalizePreOrderUpload(aggByModel, dateLabel, uploadMode, totalParsedUnits, fileNames, statusEl) {
      const modelKeys = Object.keys(aggByModel);
      if (modelKeys.length === 0 || totalParsedUnits === 0) {
        this.toast('ไม่พบข้อมูลรุ่นโซฟาหรือรหัสสีผ้าในไฟล์ที่อัปโหลด กรุณาตรวจสอบหัวตารางหรือใช้เทมเพรส Pre-Order', '⚠️');
        if (statusEl) {
          statusEl.className = 'mt-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold';
          statusEl.textContent = `❌ ไม่พบข้อมูลที่ตรงกับรหัสผ้า/รุ่นโซฟาในไฟล์ "${fileNames}" (แนะนำกดปุ่ม "📄 ดาวน์โหลดเทมเพรส Pre-Order" เพื่อดูรูปแบบตาราง)`;
          statusEl.classList.remove('hidden');
        }
        return;
      }

      if (uploadMode === 'REPLACE') {
        this.data.preOrderDailyRecords = [];
      }

      const orderModels = ['cs2', 'cs3', 'arm', 'rs', 'ln3', 'ln5', 'rc', 'lmini', 'lbig'];
      orderModels.forEach(mKey => {
        if (!aggByModel[mKey]) return;
        const meta = this.getModelMeta(mKey);
        const existing = this.data.preOrderDailyRecords.find(r => r.dateRange === dateLabel && r.modelKey === mKey);
        if (existing && uploadMode === 'APPEND') {
          Object.entries(aggByModel[mKey].colorBreakdown).forEach(([sku, q]) => {
            existing.colorBreakdown[sku] = Number(existing.colorBreakdown[sku] || 0) + Number(q || 0);
          });
          existing.lminiLR = existing.lminiLR || {};
          Object.entries(aggByModel[mKey].lminiLR || {}).forEach(([sku, lr]) => {
            if (!existing.lminiLR[sku]) existing.lminiLR[sku] = { L: 0, R: 0 };
            existing.lminiLR[sku].L += Number(lr.L || 0);
            existing.lminiLR[sku].R += Number(lr.R || 0);
          });
        } else {
          this.data.preOrderDailyRecords.push({
            dateRange: dateLabel,
            modelKey: meta.modelKey,
            modelLabel: meta.modelLabel,
            yardsPerUnit: meta.yardsPerUnit,
            legsPerUnit: meta.legsPerUnit,
            gearPerUnit: meta.gearPerUnit,
            colorBreakdown: aggByModel[mKey].colorBreakdown,
            lminiLR: aggByModel[mKey].lminiLR
          });
        }
      });

      this.save();
      this.renderPreOrderAndBillingTab();

      if (statusEl) {
        statusEl.className = 'mt-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center justify-between';
        statusEl.innerHTML = `
          <span>✅ อัปโหลดไฟล์ <strong>${fileNames}</strong> สำเร็จ! ดึงยอดรวม <strong>${this.fmt(totalParsedUnits, 0)} ชุด</strong> (${modelKeys.length} รุ่น) คำนวณหลา/ขา/เกียร์เรียบร้อย</span>
          <span class="text-[11px] text-indigo-700 font-bold">กดปุ่ม "🚀 ส่งยอด Pre-Order นี้ไปตั้งต้นใบเบิกผ้า (Tab 1 & Tab 2)" ได้ทันที</span>
        `;
        statusEl.classList.remove('hidden');
      }
      this.toast(`อัปโหลด Pre-Order สำเร็จ (${this.fmt(totalParsedUnits, 0)} ชุด)!`);
    },

    // Push current Tab 3 Pre-Order records directly into Tab 1 (Active Cutting Round) & Tab 2 (Cut-Sew Stock preOrder)
    pushPreOrderRecordsToTab1AndTab2() {
      const records = this.data.preOrderDailyRecords || [];
      if (records.length === 0) {
        this.toast('ยังไม่มีข้อมูล Pre-Order ในตารางที่จะส่งไป Tab 1', '⚠️');
        return;
      }
      const round = this.getActiveRound();
      if (!round) return;

      // Reset current round model quantities first so it cleanly reflects the Pre-Order
      const modelKeys = ['cs2', 'cs3', 'arm', 'rs', 'ln3', 'ln5', 'rc', 'lmini', 'lminiL', 'lminiR', 'lbig'];
      (round.rows || []).forEach(r => {
        modelKeys.forEach(k => { r[k] = 0; });
      });

      let totalPushed = 0;
      records.forEach(rec => {
        const mKey = rec.modelKey || (this.matchModelFromText(rec.modelLabel)?.key) || 'cs3';
        Object.entries(rec.colorBreakdown || {}).forEach(([rawSku, qty]) => {
          const num = Number(qty || 0);
          if (num <= 0) return;
          const fab = this.matchFabricFromText(rawSku);
          const sku = fab ? fab.sku : rawSku;
          const row = (round.rows || []).find(r => r.sku.toLowerCase() === sku.toLowerCase() || r.shortCode.toLowerCase() === sku.toLowerCase());
          if (row) {
            if (mKey === 'lmini') {
              const lr = rec.lminiLR && rec.lminiLR[rawSku];
              if (lr && (lr.L > 0 || lr.R > 0)) {
                row.lminiL = Number(row.lminiL || 0) + Number(lr.L || 0);
                row.lminiR = Number(row.lminiR || 0) + Number(lr.R || 0);
              } else {
                const halfL = Math.ceil(num / 2);
                const halfR = num - halfL;
                row.lminiL = Number(row.lminiL || 0) + halfL;
                row.lminiR = Number(row.lminiR || 0) + halfR;
              }
              row.lmini = Number(row.lminiL || 0) + Number(row.lminiR || 0);
            } else {
              row[mKey] = Number(row[mKey] || 0) + num;
            }
            totalPushed += num;
          }

          // Also sync to Tab 2 Cut-Sew Stock preOrder if matching row exists
          if (mKey === 'lmini') {
            const lmRow = (this.data.cutSewStockLMini || []).find(x => x.sku.toLowerCase() === sku.toLowerCase());
            if (lmRow) {
              const lr = rec.lminiLR && rec.lminiLR[rawSku];
              if (lr && (lr.L > 0 || lr.R > 0)) {
                lmRow.orderL = Number(lr.L || 0);
                lmRow.orderR = Number(lr.R || 0);
              } else {
                lmRow.orderL = Math.ceil(num / 2);
                lmRow.orderR = num - lmRow.orderL;
              }
            }
          } else {
            const stdRow = (this.data.cutSewStockStandard || []).find(x => x.modelKey === mKey && x.sku.toLowerCase() === sku.toLowerCase());
            if (stdRow) {
              stdRow.preOrder = num;
            }
          }
        });
      });

      this.save();
      this.renderAll();
      if (typeof window.switchFabricTab === 'function') {
        window.switchFabricTab('tab-admin-routine');
      }
      this.toast(`ส่งยอด Pre-Order รวม ${this.fmt(totalPushed, 0)} ชุด เข้าใบเบิกผ้า & ใบสั่งตัดนอก (Tab 1) เรียบร้อย!`);
    },

    // Download clean styled Pre-Order Excel template for Admin to fill & drag-drop
    downloadPreOrderTemplateExcel() {
      if (typeof XLSX === 'undefined') {
        this.toast('ไม่พบไลบรารี XLSX', '⚠️');
        return;
      }

      const borderThin = {
        top: { style: 'thin', color: { rgb: 'CBD5E1' } },
        bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
        left: { style: 'thin', color: { rgb: 'CBD5E1' } },
        right: { style: 'thin', color: { rgb: 'CBD5E1' } }
      };

      const headers = [
        'กลุ่มผ้า', 'เบอร์สี SKU', 'สีผ้า',
        '2 PL (CS2)', '3 PL (CS3)', 'เฉพาะแขน New', 'กระดก (RS)',
        'กระดุม 19 เม็ด (LN3)', 'กระดุม 5 เม็ด (LN5)', 'ปรับนอน (RC)',
        'L-mini ซ้าย (L)', 'L-mini ขวา (R)', 'L ใหญ่', 'รวมชุดสั่งตัด'
      ];

      const aoa = [
        ['เทมเพรสอัปโหลดยอด Pre-Order แยกรุ่นแยกสี (QueenCosy) — กรอกเฉพาะจำนวนชุด แล้วลากไฟล์นี้วางใน Tab 3 ได้เลย', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        headers
      ];

      ROUTINE_FABRICS.forEach((f, idx) => {
        const rNum = idx + 3;
        aoa.push([
          f.group, f.sku, f.color,
          '', '', '', '', '', '', '', '', '', '',
          { t: 'n', f: `SUM(D${rNum}:M${rNum})`, v: 0 }
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 13 } }];
      ws['!cols'] = [
        { wch: 12 }, { wch: 16 }, { wch: 14 },
        { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 12 },
        { wch: 17 }, { wch: 17 }, { wch: 13 },
        { wch: 15 }, { wch: 15 }, { wch: 11 }, { wch: 14 }
      ];

      // Style Title Row
      for (let c = 0; c <= 13; c++) {
        const ref = XLSX.utils.encode_cell({ r: 0, c });
        if (!ws[ref]) ws[ref] = { t: 's', v: '' };
        ws[ref].s = {
          fill: { fgColor: { rgb: '1E1B4B' } },
          font: { name: 'Tahoma', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
          alignment: { horizontal: 'left', vertical: 'center' }
        };
      }

      // Style Header Row
      for (let c = 0; c <= 13; c++) {
        const ref = XLSX.utils.encode_cell({ r: 1, c });
        if (!ws[ref]) continue;
        const bg = (c === 10 || c === 11) ? '701A75' : (c === 13 ? '065F46' : '0F172A');
        ws[ref].s = {
          fill: { fgColor: { rgb: bg } },
          font: { name: 'Tahoma', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: borderThin
        };
      }

      // Style Data Rows by Fabric Group
      ROUTINE_FABRICS.forEach((f, idx) => {
        const r = idx + 2;
        const rowBg =
          f.group === 'PVC หนัง' ? 'FFFBEB' :
          f.group === 'ลูกฟูก' ? 'ECFDF5' :
          f.group === 'Hollan' ? 'F0F9FF' : 'FAF5FF';
        for (let c = 0; c <= 13; c++) {
          const ref = XLSX.utils.encode_cell({ r, c });
          if (!ws[ref]) ws[ref] = { t: 's', v: '' };
          ws[ref].s = {
            fill: { fgColor: { rgb: (c === 10 || c === 11) ? 'FDF4FF' : (c === 13 ? 'D1FAE5' : rowBg) } },
            font: { name: 'Tahoma', sz: 10, bold: c <= 2 || c === 13, color: { rgb: '0F172A' } },
            alignment: { horizontal: c <= 2 ? 'left' : 'center', vertical: 'center' },
            border: borderThin
          };
        }
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'PreOrder_Template');
      XLSX.writeFile(wb, 'QueenCosy_เทมเพรสอัปโหลด_PreOrder.xlsx');
      this.toast('ดาวน์โหลดเทมเพรส Pre-Order สำเร็จ!');
    },

    // Export Tab 3 Pre-Order Report & Monthly Billing to Styled Excel
    exportPreOrderReportExcel() {
      if (typeof XLSX === 'undefined') {
        this.toast('ไม่พบไลบรารี XLSX', '⚠️');
        return;
      }
      const d = this.data;
      const borderThin = {
        top: { style: 'thin', color: { rgb: 'CBD5E1' } },
        bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
        left: { style: 'thin', color: { rgb: 'CBD5E1' } },
        right: { style: 'thin', color: { rgb: 'CBD5E1' } }
      };

      const aoa = [
        ['สรุปยอด Pre-Order รายวัน & คำนวณขาโซฟา 1" / เกียร์ปรับนอนอัตโนมัติ (QueenCosy)', '', '', '', '', '', '', '', ''],
        ['รอบวันที่ Pre-Order', 'รุ่นโซฟา (หลา/ตัว)', 'รายละเอียดสีผ้าที่สั่ง (SKU: จำนวน)', 'รวมจำนวน (ตัว)', 'รวมใช้ผ้า (หลา)', 'จำนวนม้วน (÷50)', 'ขาโซฟา 1" (ขา)', 'จำนวนถุงขา (÷500)', 'เกียร์ปรับนอน (คู่ / ลัง ÷15)']
      ];

      let totalUnits = 0, totalYards = 0, totalLegs = 0, totalGears = 0;
      (d.preOrderDailyRecords || []).forEach(rec => {
        const entries = Object.entries(rec.colorBreakdown || {}).filter(([, q]) => Number(q || 0) > 0);
        const sumUnits = entries.reduce((s, [, q]) => s + Number(q || 0), 0);
        const sumYards = sumUnits * Number(rec.yardsPerUnit || 0);
        const sumLegs = sumUnits * Number(rec.legsPerUnit || 6);
        const sumGears = sumUnits * Number(rec.gearPerUnit || 0);
        totalUnits += sumUnits;
        totalYards += sumYards;
        totalLegs += sumLegs;
        totalGears += sumGears;

        const breakdownText = entries.map(([sku, q]) => `${sku}: ${q}`).join(', ');
        aoa.push([
          rec.dateRange,
          rec.modelLabel,
          breakdownText,
          sumUnits,
          Math.round(sumYards * 100) / 100,
          Math.round((sumYards / 50) * 100) / 100,
          sumLegs,
          Math.round((sumLegs / 500) * 100) / 100,
          sumGears > 0 ? `${sumGears} คู่ (${(sumGears / 15).toFixed(1)} ลัง)` : '-'
        ]);
      });

      aoa.push([
        'รวมทั้งหมด', '', '',
        totalUnits,
        Math.round(totalYards * 100) / 100,
        Math.round((totalYards / 50) * 100) / 100,
        totalLegs,
        Math.round((totalLegs / 500) * 100) / 100,
        `${totalGears} คู่ (${(totalGears / 15).toFixed(1)} ลัง)`
      ]);

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
      ws['!cols'] = [
        { wch: 20 }, { wch: 26 }, { wch: 45 }, { wch: 14 },
        { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 16 }, { wch: 22 }
      ];

      const totalRows = aoa.length;
      for (let r = 0; r < totalRows; r++) {
        for (let c = 0; c <= 8; c++) {
          const ref = XLSX.utils.encode_cell({ r, c });
          if (!ws[ref]) continue;
          if (r === 0) {
            ws[ref].s = {
              fill: { fgColor: { rgb: '1E1B4B' } },
              font: { name: 'Tahoma', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
              alignment: { horizontal: 'left', vertical: 'center' }
            };
          } else if (r === 1) {
            ws[ref].s = {
              fill: { fgColor: { rgb: '0F172A' } },
              font: { name: 'Tahoma', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
              alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
              border: borderThin
            };
          } else if (r === totalRows - 1) {
            ws[ref].s = {
              fill: { fgColor: { rgb: '0F172A' } },
              font: { name: 'Tahoma', sz: 10, bold: true, color: { rgb: 'FDE047' } },
              alignment: { horizontal: c <= 2 ? 'left' : 'center', vertical: 'center' },
              border: borderThin
            };
          } else {
            ws[ref].s = {
              fill: { fgColor: { rgb: c >= 6 && c <= 7 ? 'FFFBEB' : (c === 8 ? 'ECFDF5' : 'FFFFFF') } },
              font: { name: 'Tahoma', sz: 10, bold: c === 1 || c === 3, color: { rgb: '0F172A' } },
              alignment: { horizontal: c <= 2 ? 'left' : 'center', vertical: 'center', wrapText: c === 2 },
              border: borderThin
            };
          }
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'สรุป_PreOrder_ขา_เกียร์');
      XLSX.writeFile(wb, `QueenCosy_รีพอร์ต_PreOrder_ขาเกียร์_${new Date().toISOString().split('T')[0]}.xlsx`);
      this.toast('ส่งออกรีพอร์ต Pre-Order (.xlsx) สำเร็จ!');
    },

    // -----------------------------------------------------------------------
    // SYNC ACTIVE ADMIN ROUND -> STOCK MOVEMENT & CUTTER REMNANT LEDGER
    // -----------------------------------------------------------------------
    syncActiveRoundToStockAndCutter() {
      const round = this.getActiveRound();
      if (!round) return;
      let syncedCount = 0;

      (round.rows || []).forEach(row => {
        const m = computeRowMetrics(row, round.formulaMode);
        if (!row.stockName) return;

        // Update Cutter Remnant Balance in main store based on actualCutterRemnant or expectedRemnantYards
        const parsedActual = parseFloat(String(row.actualCutterRemnant || '').replace(/[^0-9.-]/g, ''));
        const remnantYards = (!isNaN(parsedActual) && parsedActual > 0)
          ? parsedActual
          : Math.max(0, m.expectedRemnantYards);

        if (this.store.state.cutterBalance[row.stockName]) {
          this.store.state.cutterBalance[row.stockName].balanceYards = Math.round(remnantYards * 100) / 100;
          this.store.state.cutterBalance[row.stockName].lastUpdated = new Date().toISOString();
          syncedCount++;
        }
      });

      this.store.saveCutterState();
      this.toast(`ซิงค์ยอดผ้าคงเหลือช่างนอก (${syncedCount} สี) จาก "${round.name}" เข้าสู่ระบบกลาง & Supabase Cloud เรียบร้อย!`);
    },

    // Create a new cutting round carrying over actual cutter remnants from current round
    createNewRoundFromCurrent() {
      const d = this.data;
      const prevRound = this.getActiveRound();
      const todayStr = new Date().toISOString().split('T')[0];
      const newId = 'ROUND-' + Date.now().toString(36).toUpperCase();

      const newRows = ROUTINE_FABRICS.map(fab => {
        const prevRow = (prevRound?.rows || []).find(r => r.sku === fab.sku);
        let carried = 0;
        if (prevRow) {
          const parsedActual = parseFloat(String(prevRow.actualCutterRemnant || '').replace(/[^0-9.-]/g, ''));
          if (!isNaN(parsedActual) && parsedActual > 0) {
            carried = parsedActual;
          } else {
            const m = computeRowMetrics(prevRow, prevRound.formulaMode);
            if (m.expectedRemnantYards > 0) carried = m.expectedRemnantYards;
          }
        }
        return {
          ...createEmptyRow(fab),
          carriedYards: Math.round(carried * 100) / 100
        };
      });

      const newRound = {
        id: newId,
        name: `รอบตัดผ้าใหม่ (${todayStr} • ยกยอดคงเหลือจากรอบก่อน)`,
        calcDate: todayStr,
        sendDate: todayStr,
        preOrderRange: 'ระบุช่วงวันที่ Pre-Order',
        cutterTeam: 'ร้านตัดดอนเมือง / ช่าง P\'บุญ',
        formulaMode: 'STANDARD',
        extraNote: '',
        rows: newRows
      };

      d.rounds.unshift(newRound);
      d.activeRoundId = newId;
      this.save();
      this.renderAll();
      this.toast('สร้างรอบตัดผ้าใหม่ พร้อมดึงยอดผ้าคงเหลือยกมาจากรอบก่อนหน้าเรียบร้อย!');
    },

    // -----------------------------------------------------------------------
    // STYLED EXCEL EXPORT MATCHING THE WEB SYSTEM UI (Sheet 1 & Sheet 2 Synced)
    // -----------------------------------------------------------------------
    exportActiveRoundToExcel() {
      if (typeof XLSX === 'undefined') {
        this.toast('ไม่พบไลบรารี XLSX สำหรับส่งออกไฟล์', '⚠️');
        return;
      }
      const round = this.getActiveRound();
      if (!round) return;
      const totals = computeRoundTotals(round);
      const isBoon = round.formulaMode === 'BOON';

      const borderThin = {
        top: { style: 'thin', color: { rgb: 'CBD5E1' } },
        bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
        left: { style: 'thin', color: { rgb: 'CBD5E1' } },
        right: { style: 'thin', color: { rgb: 'CBD5E1' } }
      };
      const borderMediumBottom = {
        top: { style: 'thin', color: { rgb: '94A3B8' } },
        bottom: { style: 'medium', color: { rgb: '0F172A' } },
        left: { style: 'thin', color: { rgb: '94A3B8' } },
        right: { style: 'thin', color: { rgb: '94A3B8' } }
      };

      // =====================================================================
      // SHEET 1: 1_ใบเบิกผ้า_ช่างตัด (Exact 2-Row Merged Header + Colors + Formulas)
      // =====================================================================
      // Columns (0 to 32 = 33 columns):
      // 0: เบอร์สี SKU, 1: สีผ้า, 2: กลุ่มผ้า
      // 3: CS2 ตัว, 4: CS2 หลา
      // 5: CS3 ตัว, 6: CS3 หลา
      // 7: แขน ตัว, 8: แขน หลา
      // 9: RS ตัว, 10: RS หลา
      // 11: LN3 ตัว, 12: LN3 หลา
      // 13: LN5 ตัว, 14: LN5 หลา
      // 15: RC ตัว, 16: RC หลา
      // 17: L-Mini ซ้าย L, 18: L-Mini ขวา R, 19: L-Mini หลา
      // 20: L ใหญ่ ตัว, 21: L ใหญ่ หลา
      // 22: รวมเบิก (หลา), 23: จำนวนไม้ที่สั่ง/ม้วน (÷50), 24: ราคา/หลา, 25: รวมยอดค่าผ้า (฿)
      // 26: หักผ้าที่มี / สั่ง+เผื่อผ้าให้ช่างตัด, 27: จำนวนหลาที่ส่งจริง, 28: ยอดยกมา คงเหลือ/หลา
      // 29: จำนวนผ้า/หลา คงเหลือตามสูตร, 30: คงเหลือ/หลา #ช่างนอก, 31: ผ้าคงเหลือต่างกัน (หลา), 32: หมายเหตุ รีเช็ค

      const titleRow1 = new Array(33).fill('');
      titleRow1[0] = `📋 ใบเบิกผ้า & คำนวณตัดผ้าโซฟา QueenCosy — ${round.name || ''} | วันที่ส่งผ้า: ${round.sendDate || '-'} | สูตร: ${isBoon ? "P'บุญ (CS2=3.75, CS3=5.21, LN5=6.21)" : 'มาตรฐานโรงงาน'}`;

      const hdrRow1 = [
        'เบอร์สี SKU', 'สีผ้า', 'กลุ่มผ้า',
        `CS2 2 ที่นั่ง (${isBoon ? '3.75' : '3.20'} หลา)`, '',
        `CS3 3 ที่นั่ง (${isBoon ? '5.21' : '4.33'} หลา)`, '',
        'เฉพาะแขน (1.93 หลา)', '',
        'RS หัวกระดก (6.26 หลา)', '',
        'LN3 กระดุม 19 เม็ด (6.21 หลา)', '',
        `LN กระดุม 5 เม็ด (${isBoon ? '6.21' : '6.17'} หลา)`, '',
        'RC/PN ปรับนอน (6.65 หลา)', '',
        'L-Mini แอลมินิ (8.97 หลา)', '', '',
        'L ใหญ่ (11.00 หลา)', '',
        'รวมเบิก (หลา)', 'จำนวนไม้ที่สั่ง/ม้วน (÷50)', 'ราคา/หลา', 'รวมยอดค่าผ้า (฿)',
        'หักผ้าที่มี / สั่ง+เผื่อผ้าให้ช่างตัด', 'จำนวนหลาที่ส่งจริง', 'ยอดยกมา คงเหลือ/หลา',
        'จำนวนผ้า/หลา คงเหลือตามสูตร', 'คงเหลือ/หลา #ช่างนอก', 'ผ้าคงเหลือต่างกัน (หลา)\n(ตามสูตร - #ช่างนอก)', 'หมายเหตุ รีเช็ค'
      ];

      const hdrRow2 = [
        '', '', '',
        'ตัว', 'รวมหลา',
        'ตัว', 'รวมหลา',
        'ตัว', 'รวมหลา',
        'ตัว', 'รวมหลา',
        'ตัว', 'รวมหลา',
        'ตัว', 'รวมหลา',
        'ตัว', 'รวมหลา',
        'ซ้าย L', 'ขวา R', 'รวมหลา',
        'ตัว', 'รวมหลา',
        '', '', '', '', '', '', '', '', '', '', ''
      ];

      const aoa1 = [titleRow1, hdrRow1, hdrRow2];

      const yCs2 = isBoon ? 3.75 : 3.20;
      const yCs3 = isBoon ? 5.21 : 4.33;
      const yArm = 1.93;
      const yRs = 6.26;
      const yLn3 = 6.21;
      const yLn5 = isBoon ? 6.21 : 6.17;
      const yRc = 6.65;
      const yLmini = 8.97;
      const yLbig = 11.00;

      const rows = round.rows || [];
      rows.forEach((r, idx) => {
        const excelRow = idx + 4; // 1-based Excel row (rows 1=title, 2=hdr1, 3=hdr2, 4..25=data)
        const m = computeRowMetrics(r, round.formulaMode);
        const actualNum = parseFloat(String(r.actualCutterRemnant || '').replace(/[^0-9.-]/g, ''));
        const actualCellVal = !isNaN(actualNum) ? actualNum : (r.actualCutterRemnant || 0);

        aoa1.push([
          r.sku,
          r.color,
          r.group,
          Number(r.cs2 || 0), { t: 'n', f: `D${excelRow}*${yCs2}`, v: m.modelYards.cs2 },
          Number(r.cs3 || 0), { t: 'n', f: `F${excelRow}*${yCs3}`, v: m.modelYards.cs3 },
          Number(r.arm || 0), { t: 'n', f: `H${excelRow}*${yArm}`, v: m.modelYards.arm },
          Number(r.rs || 0),  { t: 'n', f: `J${excelRow}*${yRs}`,  v: m.modelYards.rs },
          Number(r.ln3 || 0), { t: 'n', f: `L${excelRow}*${yLn3}`, v: m.modelYards.ln3 },
          Number(r.ln5 || 0), { t: 'n', f: `N${excelRow}*${yLn5}`, v: m.modelYards.ln5 },
          Number(r.rc || 0),  { t: 'n', f: `P${excelRow}*${yRc}`,  v: m.modelYards.rc },
          Number(r.lminiL || 0), Number(r.lminiR || 0), { t: 'n', f: `(R${excelRow}+S${excelRow})*${yLmini}`, v: m.modelYards.lmini },
          Number(r.lbig || 0), { t: 'n', f: `U${excelRow}*${yLbig}`, v: m.modelYards.lbig },
          { t: 'n', f: `E${excelRow}+G${excelRow}+I${excelRow}+K${excelRow}+M${excelRow}+O${excelRow}+Q${excelRow}+T${excelRow}+V${excelRow}`, v: m.totalUsedYards },
          { t: 'n', f: `W${excelRow}/50`, v: m.calcRolls },
          Number(r.price || 0),
          { t: 'n', f: `W${excelRow}*Y${excelRow}`, v: m.fabricCost },
          r.orderRollsText || '',
          Number(r.sentYards || 0),
          Number(r.carriedYards || 0),
          { t: 'n', f: `(AB${excelRow}+AC${excelRow})-W${excelRow}`, v: m.expectedRemnantYards },
          actualCellVal,
          { t: 'n', f: `AD${excelRow}-N(AE${excelRow})`, v: m.diffRemnantYards },
          r.note || ''
        ]);
      });

      const firstDataRow = 4;
      const lastDataRow = 3 + rows.length;
      const sumRow1 = lastDataRow + 1;
      const wageRateRow = lastDataRow + 2;
      const wageSumRow = lastDataRow + 3;

      // Footer Row 1: รวมจำนวนผลิต / ชุด
      aoa1.push([
        `รวมจำนวนผลิต / ชุด (รวม ${totals.grandTotalUnits} ชุด)`, '', '',
        { t: 'n', f: `SUM(D${firstDataRow}:D${lastDataRow})`, v: totals.modelQtyTotals.cs2 },
        { t: 'n', f: `SUM(E${firstDataRow}:E${lastDataRow})`, v: totals.modelYardsTotals.cs2 },
        { t: 'n', f: `SUM(F${firstDataRow}:F${lastDataRow})`, v: totals.modelQtyTotals.cs3 },
        { t: 'n', f: `SUM(G${firstDataRow}:G${lastDataRow})`, v: totals.modelYardsTotals.cs3 },
        { t: 'n', f: `SUM(H${firstDataRow}:H${lastDataRow})`, v: totals.modelQtyTotals.arm },
        { t: 'n', f: `SUM(I${firstDataRow}:I${lastDataRow})`, v: totals.modelYardsTotals.arm },
        { t: 'n', f: `SUM(J${firstDataRow}:J${lastDataRow})`, v: totals.modelQtyTotals.rs },
        { t: 'n', f: `SUM(K${firstDataRow}:K${lastDataRow})`, v: totals.modelYardsTotals.rs },
        { t: 'n', f: `SUM(L${firstDataRow}:L${lastDataRow})`, v: totals.modelQtyTotals.ln3 },
        { t: 'n', f: `SUM(M${firstDataRow}:M${lastDataRow})`, v: totals.modelYardsTotals.ln3 },
        { t: 'n', f: `SUM(N${firstDataRow}:N${lastDataRow})`, v: totals.modelQtyTotals.ln5 },
        { t: 'n', f: `SUM(O${firstDataRow}:O${lastDataRow})`, v: totals.modelYardsTotals.ln5 },
        { t: 'n', f: `SUM(P${firstDataRow}:P${lastDataRow})`, v: totals.modelQtyTotals.rc },
        { t: 'n', f: `SUM(Q${firstDataRow}:Q${lastDataRow})`, v: totals.modelYardsTotals.rc },
        { t: 'n', f: `SUM(R${firstDataRow}:R${lastDataRow})`, v: totals.totalLMiniL },
        { t: 'n', f: `SUM(S${firstDataRow}:S${lastDataRow})`, v: totals.totalLMiniR },
        { t: 'n', f: `SUM(T${firstDataRow}:T${lastDataRow})`, v: totals.modelYardsTotals.lmini },
        { t: 'n', f: `SUM(U${firstDataRow}:U${lastDataRow})`, v: totals.modelQtyTotals.lbig },
        { t: 'n', f: `SUM(V${firstDataRow}:V${lastDataRow})`, v: totals.modelYardsTotals.lbig },
        { t: 'n', f: `SUM(W${firstDataRow}:W${lastDataRow})`, v: totals.grandTotalUsedYards },
        { t: 'n', f: `SUM(X${firstDataRow}:X${lastDataRow})`, v: totals.grandTotalCalcRolls },
        'รวมค่าผ้า:',
        { t: 'n', f: `SUM(Z${firstDataRow}:Z${lastDataRow})`, v: totals.grandTotalFabricCost },
        'ส่งจริง/ยกมา:',
        { t: 'n', f: `SUM(AB${firstDataRow}:AB${lastDataRow})`, v: totals.grandTotalSentYards },
        { t: 'n', f: `SUM(AC${firstDataRow}:AC${lastDataRow})`, v: totals.grandTotalCarriedYards },
        { t: 'n', f: `SUM(AD${firstDataRow}:AD${lastDataRow})`, v: totals.grandTotalExpectedRemnant },
        { t: 'n', f: `SUM(AE${firstDataRow}:AE${lastDataRow})`, v: totals.grandTotalActualCutterRemnant },
        { t: 'n', f: `SUM(AF${firstDataRow}:AF${lastDataRow})`, v: totals.grandTotalDiffRemnant },
        ''
      ]);

      // Footer Row 2: ราคาค่าแรงตัด / ตัว (บาท)
      aoa1.push([
        'ราคาค่าแรงตัด / ตัว (บาท)', '', '',
        45, '', 55, '', 20, '', 70, '', 80, '', 70, '', 70, '', 90, 90, '', 100, '',
        '', '', '', '', '', '', '', '', '', '', ''
      ]);

      // Footer Row 3: ราคารวมค่าแรงตัดแยกตามรุ่น (บาท)
      aoa1.push([
        'ราคารวมค่าแรงตัดแยกตามรุ่น (บาท)', '', '',
        { t: 'n', f: `D${sumRow1}*D${wageRateRow}`, v: totals.modelCutWageTotals.cs2 }, '',
        { t: 'n', f: `F${sumRow1}*F${wageRateRow}`, v: totals.modelCutWageTotals.cs3 }, '',
        { t: 'n', f: `H${sumRow1}*H${wageRateRow}`, v: totals.modelCutWageTotals.arm }, '',
        { t: 'n', f: `J${sumRow1}*J${wageRateRow}`, v: totals.modelCutWageTotals.rs }, '',
        { t: 'n', f: `L${sumRow1}*L${wageRateRow}`, v: totals.modelCutWageTotals.ln3 }, '',
        { t: 'n', f: `N${sumRow1}*N${wageRateRow}`, v: totals.modelCutWageTotals.ln5 }, '',
        { t: 'n', f: `P${sumRow1}*P${wageRateRow}`, v: totals.modelCutWageTotals.rc }, '',
        { t: 'n', f: `(R${sumRow1}+S${sumRow1})*R${wageRateRow}`, v: totals.modelCutWageTotals.lmini }, '', '',
        { t: 'n', f: `U${sumRow1}*U${wageRateRow}`, v: totals.modelCutWageTotals.lbig }, '',
        'รวมค่าแรงตัดทั้งสิ้น:',
        { t: 'n', f: `D${wageSumRow}+F${wageSumRow}+H${wageSumRow}+J${wageSumRow}+L${wageSumRow}+N${wageSumRow}+P${wageSumRow}+R${wageSumRow}+U${wageSumRow}`, v: totals.grandTotalCutWage },
        '', '', '', '', '', '', '', '', ''
      ]);

      const ws1 = XLSX.utils.aoa_to_sheet(aoa1);

      // Merged cells for Sheet 1 matching the web system's 2-row table header
      ws1['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 32 } }, // Title banner
        { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } },  // เบอร์สี SKU
        { s: { r: 1, c: 1 }, e: { r: 2, c: 1 } },  // สีผ้า
        { s: { r: 1, c: 2 }, e: { r: 2, c: 2 } },  // กลุ่มผ้า
        { s: { r: 1, c: 3 }, e: { r: 1, c: 4 } },  // CS2
        { s: { r: 1, c: 5 }, e: { r: 1, c: 6 } },  // CS3
        { s: { r: 1, c: 7 }, e: { r: 1, c: 8 } },  // แขน
        { s: { r: 1, c: 9 }, e: { r: 1, c: 10 } }, // RS
        { s: { r: 1, c: 11 }, e: { r: 1, c: 12 } }, // LN3
        { s: { r: 1, c: 13 }, e: { r: 1, c: 14 } }, // LN5
        { s: { r: 1, c: 15 }, e: { r: 1, c: 16 } }, // RC
        { s: { r: 1, c: 17 }, e: { r: 1, c: 19 } }, // L-Mini (ซ้าย L, ขวา R, รวมหลา)
        { s: { r: 1, c: 20 }, e: { r: 1, c: 21 } }, // L ใหญ่
        { s: { r: 1, c: 22 }, e: { r: 2, c: 22 } }, // รวมเบิก (หลา)
        { s: { r: 1, c: 23 }, e: { r: 2, c: 23 } }, // จำนวนไม้ที่สั่ง/ม้วน
        { s: { r: 1, c: 24 }, e: { r: 2, c: 24 } }, // ราคา/หลา
        { s: { r: 1, c: 25 }, e: { r: 2, c: 25 } }, // รวมยอดค่าผ้า
        { s: { r: 1, c: 26 }, e: { r: 2, c: 26 } }, // หักผ้าที่มี / สั่งม้วน
        { s: { r: 1, c: 27 }, e: { r: 2, c: 27 } }, // จำนวนหลาที่ส่งจริง
        { s: { r: 1, c: 28 }, e: { r: 2, c: 28 } }, // ยอดยกมา
        { s: { r: 1, c: 29 }, e: { r: 2, c: 29 } }, // คงเหลือตามสูตร
        { s: { r: 1, c: 30 }, e: { r: 2, c: 30 } }, // คงเหลือ #ช่างนอก
        { s: { r: 1, c: 31 }, e: { r: 2, c: 31 } }, // ผ้าคงเหลือต่างกัน
        { s: { r: 1, c: 32 }, e: { r: 2, c: 32 } }, // หมายเหตุ
        { s: { r: sumRow1 - 1, c: 0 }, e: { r: sumRow1 - 1, c: 2 } },
        { s: { r: wageRateRow - 1, c: 0 }, e: { r: wageRateRow - 1, c: 2 } },
        { s: { r: wageSumRow - 1, c: 0 }, e: { r: wageSumRow - 1, c: 2 } }
      ];

      ws1['!cols'] = [
        { wch: 15 }, { wch: 13 }, { wch: 11 },
        { wch: 7 }, { wch: 9 },
        { wch: 7 }, { wch: 9 },
        { wch: 7 }, { wch: 9 },
        { wch: 7 }, { wch: 9 },
        { wch: 7 }, { wch: 9 },
        { wch: 7 }, { wch: 9 },
        { wch: 7 }, { wch: 9 },
        { wch: 7 }, { wch: 7 }, { wch: 9 },
        { wch: 7 }, { wch: 9 },
        { wch: 13 }, { wch: 14 }, { wch: 10 }, { wch: 15 },
        { wch: 22 }, { wch: 15 }, { wch: 15 }, { wch: 16 },
        { wch: 16 }, { wch: 18 }, { wch: 16 }
      ];

      // Apply visual styles to Sheet 1
      const totalSheet1Rows = aoa1.length;
      for (let r = 0; r < totalSheet1Rows; r++) {
        for (let c = 0; c <= 32; c++) {
          const ref = XLSX.utils.encode_cell({ r, c });
          if (!ws1[ref]) ws1[ref] = { t: 's', v: '' };

          if (r === 0) {
            ws1[ref].s = {
              fill: { fgColor: { rgb: '1E1B4B' } },
              font: { name: 'Tahoma', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
              alignment: { horizontal: 'left', vertical: 'center' }
            };
          } else if (r === 1 || r === 2) {
            let hdrBg = '0F172A';
            let hdrFg = 'FFFFFF';
            if (c >= 3 && c <= 16) hdrBg = '1E1B4B';
            else if (c >= 17 && c <= 19) { hdrBg = '4A044E'; hdrFg = 'F5D0FE'; }
            else if (c >= 20 && c <= 21) hdrBg = '1E1B4B';
            else if (c === 22) { hdrBg = '312E81'; hdrFg = 'FDE047'; }
            else if (c === 23) { hdrBg = '701A75'; hdrFg = 'F5D0FE'; }
            else if (c === 26 || c === 30) { hdrBg = '78350F'; hdrFg = 'FDE68A'; }
            else if (c === 27 || c === 29) { hdrBg = '064E3B'; hdrFg = 'A7F3D0'; }
            else if (c === 31) { hdrBg = '881337'; hdrFg = 'FECDD3'; }

            ws1[ref].s = {
              fill: { fgColor: { rgb: hdrBg } },
              font: { name: 'Tahoma', sz: 9, bold: true, color: { rgb: hdrFg } },
              alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
              border: borderMediumBottom
            };
          } else if (r >= 3 && r < 3 + rows.length) {
            const rowObj = rows[r - 3];
            const m = computeRowMetrics(rowObj, round.formulaMode);
            const groupRgb =
              rowObj.group === 'PVC หนัง' ? 'FFFBEB' :
              rowObj.group === 'ลูกฟูก' ? 'ECFDF5' :
              rowObj.group === 'Hollan' ? 'F0F9FF' : 'FAF5FF';

            let cellBg = groupRgb;
            let fontColor = '0F172A';
            let isBold = false;
            let numFmt = undefined;
            let align = 'center';

            if (c <= 2) {
              align = c === 2 ? 'center' : 'left';
              isBold = c === 0 || c === 1;
            } else if ([3, 5, 7, 9, 11, 13, 15, 17, 18, 20].includes(c)) {
              const val = Number(ws1[ref].v || 0);
              cellBg = val > 0 ? (c === 17 || c === 18 ? 'FDF4FF' : 'EEF2FF') : 'FFFFFF';
              fontColor = val > 0 ? (c === 17 || c === 18 ? '86198F' : '312E81') : '94A3B8';
              isBold = val > 0;
              numFmt = '#,##0';
            } else if ([4, 6, 8, 10, 12, 14, 16, 19, 21].includes(c)) {
              cellBg = 'F8FAFC';
              fontColor = '475569';
              numFmt = '#,##0.00';
              align = 'right';
            } else if (c === 22) {
              cellBg = 'EEF2FF';
              fontColor = '1E1B4B';
              isBold = true;
              numFmt = '#,##0.00';
              align = 'right';
            } else if (c === 23) {
              cellBg = 'FDF4FF';
              fontColor = '86198F';
              isBold = true;
              numFmt = '#,##0.0';
              align = 'right';
            } else if (c === 24) {
              numFmt = '#,##0';
              align = 'right';
            } else if (c === 25) {
              numFmt = '#,##0.00';
              align = 'right';
              isBold = true;
            } else if (c === 26) {
              cellBg = 'FFFBEB';
              fontColor = '92400E';
              isBold = true;
            } else if (c === 27) {
              cellBg = 'ECFDF5';
              fontColor = '065F46';
              isBold = true;
              numFmt = '#,##0.00';
              align = 'right';
            } else if (c === 28) {
              numFmt = '#,##0.00';
              align = 'right';
            } else if (c === 29) {
              cellBg = m.expectedRemnantYards < 0 ? 'FFE4E6' : 'ECFDF5';
              fontColor = m.expectedRemnantYards < 0 ? 'BE123C' : '047857';
              isBold = true;
              numFmt = '#,##0.00';
              align = 'right';
            } else if (c === 30) {
              cellBg = 'FFFBEB';
              fontColor = '92400E';
              isBold = true;
              align = 'right';
            } else if (c === 31) {
              cellBg = Math.abs(m.diffRemnantYards) > 0.05 ? 'FFF1F2' : 'F8FAFC';
              fontColor = m.diffRemnantYards > 0.05 ? 'BE123C' : (m.diffRemnantYards < -0.05 ? '1D4ED8' : '475569');
              isBold = true;
              numFmt = '#,##0.00';
              align = 'right';
            }

            ws1[ref].s = {
              fill: { fgColor: { rgb: cellBg } },
              font: { name: 'Tahoma', sz: 9.5, bold: isBold, color: { rgb: fontColor } },
              alignment: { horizontal: align, vertical: 'center' },
              border: borderThin,
              ...(numFmt ? { numFmt } : {})
            };
          } else {
            // Footer rows
            const isSumRow = r === sumRow1 - 1;
            const isWageRate = r === wageRateRow - 1;
            const bgRgb = isSumRow ? '0F172A' : (isWageRate ? 'FFFBEB' : 'ECFDF5');
            const fgRgb = isSumRow ? 'FDE047' : (isWageRate ? '92400E' : '065F46');
            ws1[ref].s = {
              fill: { fgColor: { rgb: bgRgb } },
              font: { name: 'Tahoma', sz: 9.5, bold: true, color: { rgb: fgRgb } },
              alignment: { horizontal: c <= 2 ? 'left' : 'center', vertical: 'center' },
              border: borderThin,
              numFmt: '#,##0.##'
            };
          }
        }
      }

      // =====================================================================
      // SHEET 2: 2_ใบสั่งตัดนอก (Visual Match to View 2 + Formula Synced to Sheet 1)
      // =====================================================================
      // Columns (0 to 15 = 16 columns):
      // 0: กลุ่มผ้า, 1: เบอร์สี SKU, 2: สี, 3: จำนวนการส่งไม้ (ม้วน / ใช้ผ้าที่มี)
      // 4: 2 PL, 5: 3 PL, 6: แขน New, 7: กระดก, 8: กระดุม 19 เม็ด, 9: กระดุม 5 เม็ด, 10: ปรับนอน
      // 11: L-mini ซ้าย (L), 12: L-mini ขวา (R), 13: L ใหญ่, 14: รวมชุดสั่งตัด, 15: หมายเหตุสั่งช่างนอก

      const s1Name = '1_ใบเบิกผ้า_ช่างตัด';
      const titleRow2 = new Array(16).fill('');
      titleRow2[0] = `✂️ ใบสั่งผลิตส่งช่างตัดนอก (แยก L-mini ซ้าย/ขวา • ซิงค์ยอดสั่งตัดอัตโนมัติกับชีท 1) — ${round.name || ''} | วันที่ส่งผ้า: ${round.sendDate || '-'}`;

      const outHdr1 = [
        'กลุ่มผ้า', 'เบอร์สี SKU', 'สีผ้า', 'จำนวนการส่งไม้\n(ม้วน / ใช้ผ้าที่มี)',
        '2 PL', '3 PL', 'แขน New', 'กระดก', 'กระดุม 19 เม็ด', 'กระดุม 5 เม็ด', 'ปรับนอน',
        'L-Mini (แยกซ้าย-ขวา)', '', 'L ใหญ่', 'รวมชุดสั่งตัด', 'หมายเหตุสั่งช่างนอก'
      ];
      const outHdr2 = [
        '', '', '', '',
        'Order', 'Order', 'Order', 'Order', 'Order', 'Order', 'Order',
        'ซ้าย (L)', 'ขวา (R)', 'Order', 'รวม (ชุด)', ''
      ];

      const aoa2 = [titleRow2, outHdr1, outHdr2];

      rows.forEach((r, idx) => {
        const s1Row = idx + 4; // matching row in Sheet 1
        const s2Row = idx + 4; // current row in Sheet 2
        const m = computeRowMetrics(r, round.formulaMode);
        aoa2.push([
          r.group,
          r.sku,
          r.color,
          { t: 's', f: `'${s1Name}'!AA${s1Row}`, v: r.orderRollsText || '' },
          { t: 'n', f: `'${s1Name}'!D${s1Row}`, v: Number(r.cs2 || 0) },
          { t: 'n', f: `'${s1Name}'!F${s1Row}`, v: Number(r.cs3 || 0) },
          { t: 'n', f: `'${s1Name}'!H${s1Row}`, v: Number(r.arm || 0) },
          { t: 'n', f: `'${s1Name}'!J${s1Row}`, v: Number(r.rs || 0) },
          { t: 'n', f: `'${s1Name}'!L${s1Row}`, v: Number(r.ln3 || 0) },
          { t: 'n', f: `'${s1Name}'!N${s1Row}`, v: Number(r.ln5 || 0) },
          { t: 'n', f: `'${s1Name}'!P${s1Row}`, v: Number(r.rc || 0) },
          { t: 'n', f: `'${s1Name}'!R${s1Row}`, v: Number(r.lminiL || 0) },
          { t: 'n', f: `'${s1Name}'!S${s1Row}`, v: Number(r.lminiR || 0) },
          { t: 'n', f: `'${s1Name}'!U${s1Row}`, v: Number(r.lbig || 0) },
          { t: 'n', f: `SUM(E${s2Row}:N${s2Row})`, v: m.totalUnits },
          r.outsourceNote || ''
        ]);
      });

      aoa2.push([
        `รวมจำนวนตัดทุกรุ่น (ชุด)`, '', '',
        `≈ ${this.fmt(totals.grandTotalCalcRolls, 1)} ม้วน`,
        { t: 'n', f: `SUM(E${firstDataRow}:E${lastDataRow})`, v: totals.modelQtyTotals.cs2 },
        { t: 'n', f: `SUM(F${firstDataRow}:F${lastDataRow})`, v: totals.modelQtyTotals.cs3 },
        { t: 'n', f: `SUM(G${firstDataRow}:G${lastDataRow})`, v: totals.modelQtyTotals.arm },
        { t: 'n', f: `SUM(H${firstDataRow}:H${lastDataRow})`, v: totals.modelQtyTotals.rs },
        { t: 'n', f: `SUM(I${firstDataRow}:I${lastDataRow})`, v: totals.modelQtyTotals.ln3 },
        { t: 'n', f: `SUM(J${firstDataRow}:J${lastDataRow})`, v: totals.modelQtyTotals.ln5 },
        { t: 'n', f: `SUM(K${firstDataRow}:K${lastDataRow})`, v: totals.modelQtyTotals.rc },
        { t: 'n', f: `SUM(L${firstDataRow}:L${lastDataRow})`, v: totals.totalLMiniL },
        { t: 'n', f: `SUM(M${firstDataRow}:M${lastDataRow})`, v: totals.totalLMiniR },
        { t: 'n', f: `SUM(N${firstDataRow}:N${lastDataRow})`, v: totals.modelQtyTotals.lbig },
        { t: 'n', f: `SUM(O${firstDataRow}:O${lastDataRow})`, v: totals.grandTotalUnits },
        `ค่าแรงตัดรวม: ฿${this.fmt(totals.grandTotalCutWage, 2)}`
      ]);

      const ws2 = XLSX.utils.aoa_to_sheet(aoa2);
      ws2['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 15 } },
        { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } },
        { s: { r: 1, c: 1 }, e: { r: 2, c: 1 } },
        { s: { r: 1, c: 2 }, e: { r: 2, c: 2 } },
        { s: { r: 1, c: 3 }, e: { r: 2, c: 3 } },
        { s: { r: 1, c: 11 }, e: { r: 1, c: 12 } }, // L-Mini header span
        { s: { r: 1, c: 15 }, e: { r: 2, c: 15 } },
        { s: { r: sumRow1 - 1, c: 0 }, e: { r: sumRow1 - 1, c: 2 } }
      ];

      ws2['!cols'] = [
        { wch: 12 }, { wch: 15 }, { wch: 13 }, { wch: 20 },
        { wch: 9 }, { wch: 9 }, { wch: 10 }, { wch: 9 }, { wch: 14 }, { wch: 14 }, { wch: 10 },
        { wch: 11 }, { wch: 11 }, { wch: 9 }, { wch: 13 }, { wch: 28 }
      ];

      const totalSheet2Rows = aoa2.length;
      for (let r = 0; r < totalSheet2Rows; r++) {
        for (let c = 0; c <= 15; c++) {
          const ref = XLSX.utils.encode_cell({ r, c });
          if (!ws2[ref]) ws2[ref] = { t: 's', v: '' };

          if (r === 0) {
            ws2[ref].s = {
              fill: { fgColor: { rgb: '4A044E' } },
              font: { name: 'Tahoma', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
              alignment: { horizontal: 'left', vertical: 'center' }
            };
          } else if (r === 1 || r === 2) {
            const bg = c === 3 ? '78350F' : ((c === 11 || c === 12) ? '701A75' : (c === 14 ? '064E3B' : '0F172A'));
            ws2[ref].s = {
              fill: { fgColor: { rgb: bg } },
              font: { name: 'Tahoma', sz: 9.5, bold: true, color: { rgb: 'FFFFFF' } },
              alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
              border: borderMediumBottom
            };
          } else if (r >= 3 && r < 3 + rows.length) {
            const rowObj = rows[r - 3];
            const groupRgb =
              rowObj.group === 'PVC หนัง' ? 'FFFBEB' :
              rowObj.group === 'ลูกฟูก' ? 'ECFDF5' :
              rowObj.group === 'Hollan' ? 'F0F9FF' : 'FAF5FF';
            const val = Number(ws2[ref].v || 0);
            let bg = groupRgb;
            let fg = '0F172A';
            let bold = c <= 2;

            if (c === 3) {
              bg = 'FFFBEB';
              fg = '92400E';
              bold = true;
            } else if (c >= 4 && c <= 13) {
              bg = val > 0 ? ((c === 11 || c === 12) ? 'FDF4FF' : 'EEF2FF') : 'FFFFFF';
              fg = val > 0 ? ((c === 11 || c === 12) ? '86198F' : '312E81') : 'CBD5E1';
              bold = val > 0;
            } else if (c === 14) {
              bg = val > 0 ? 'D1FAE5' : 'F8FAFC';
              fg = val > 0 ? '065F46' : '94A3B8';
              bold = true;
            }

            ws2[ref].s = {
              fill: { fgColor: { rgb: bg } },
              font: { name: 'Tahoma', sz: 10, bold, color: { rgb: fg } },
              alignment: { horizontal: c <= 2 || c === 15 ? 'left' : 'center', vertical: 'center' },
              border: borderThin,
              ...(c >= 4 && c <= 14 ? { numFmt: '#,##0;-#,##0;""' } : {})
            };
          } else {
            ws2[ref].s = {
              fill: { fgColor: { rgb: '0F172A' } },
              font: { name: 'Tahoma', sz: 10, bold: true, color: { rgb: 'FDE047' } },
              alignment: { horizontal: c <= 2 ? 'left' : 'center', vertical: 'center' },
              border: borderThin
            };
          }
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws1, s1Name);
      XLSX.utils.book_append_sheet(wb, ws2, '2_ใบสั่งตัดนอก');
      XLSX.writeFile(wb, `QueenCosy_ใบเบิกผ้าและสั่งตัดนอก_${round.calcDate || 'export'}.xlsx`);
      this.toast('ส่งออกไฟล์ Excel แบบตารางสีเหมือนหน้าระบบ (ซิงค์ชีท 1 & ชีท 2) สำเร็จ!');
    },

    bindEvents() {
      // Round selector
      document.getElementById('admin-routine-round-select')?.addEventListener('change', (e) => {
        this.data.activeRoundId = e.target.value;
        this.save();
        this.renderMatrixTab();
      });

      // Round metadata edits
      document.getElementById('routine-round-meta-title')?.addEventListener('change', (e) => {
        const r = this.getActiveRound();
        if (r) { r.name = e.target.value; this.save(); this.renderMatrixTab(); }
      });
      document.getElementById('routine-round-send-date')?.addEventListener('change', (e) => {
        const r = this.getActiveRound();
        if (r) { r.sendDate = e.target.value; this.save(); this.renderPreOrderAndBillingTab(); }
      });
      document.getElementById('routine-formula-mode')?.addEventListener('change', (e) => {
        const r = this.getActiveRound();
        if (r) { r.formulaMode = e.target.value; this.save(); this.renderMatrixTab(); }
      });
      document.getElementById('routine-extra-spare-note')?.addEventListener('change', (e) => {
        const r = this.getActiveRound();
        if (r) { r.extraNote = e.target.value; this.save(); this.renderMatrixTab(); }
      });

      // View mode switchers
      document.getElementById('btn-view-mode-matrix')?.addEventListener('click', () => {
        this.data.viewMode = 'MATRIX';
        this.save();
        this.renderMatrixTab();
      });
      document.getElementById('btn-view-mode-outsource')?.addEventListener('click', () => {
        this.data.viewMode = 'OUTSOURCE';
        this.save();
        this.renderMatrixTab();
      });

      // Action buttons in Tab 1 & View 2
      document.getElementById('btn-routine-new-round')?.addEventListener('click', () => {
        this.createNewRoundFromCurrent();
      });
      document.getElementById('btn-routine-pull-shortages')?.addEventListener('click', () => {
        this.pushAllShortagesToActiveRound();
      });
      document.getElementById('btn-routine-sync-stock')?.addEventListener('click', () => {
        this.syncActiveRoundToStockAndCutter();
      });
      document.getElementById('btn-routine-export-excel')?.addEventListener('click', () => {
        this.exportActiveRoundToExcel();
      });
      document.getElementById('btn-outsource-export-excel')?.addEventListener('click', () => {
        this.exportActiveRoundToExcel();
      });
      document.getElementById('btn-outsource-autofill-rolls')?.addEventListener('click', () => {
        this.autoFillOutsourceRolls();
      });

      // Filters in Cut-Sew Stock Tab (Tab 2)
      document.getElementById('filter-cut-sew-model')?.addEventListener('change', (e) => {
        this.cutSewFilterModel = e.target.value;
        this.renderCutSewStockTab();
      });
      document.getElementById('chk-cut-sew-only-shortage')?.addEventListener('change', (e) => {
        this.cutSewOnlyShortage = e.target.checked;
        this.renderCutSewStockTab();
      });
      document.getElementById('btn-push-all-shortages-tab2')?.addEventListener('click', () => {
        this.pushAllShortagesToActiveRound();
      });

      // Tab 3: Pre-Order Drag & Drop / File Input / Template / Export / Push / Manual Add
      const dropzone = document.getElementById('preorder-dropzone');
      const fileInput = document.getElementById('preorder-file-input');
      if (dropzone && fileInput) {
        dropzone.addEventListener('click', (e) => {
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'LABEL') return;
          fileInput.click();
        });
        dropzone.addEventListener('dragover', (e) => {
          e.preventDefault();
          dropzone.classList.add('border-indigo-600', 'bg-indigo-100/70');
        });
        dropzone.addEventListener('dragleave', () => {
          dropzone.classList.remove('border-indigo-600', 'bg-indigo-100/70');
        });
        dropzone.addEventListener('drop', (e) => {
          e.preventDefault();
          dropzone.classList.remove('border-indigo-600', 'bg-indigo-100/70');
          if (e.dataTransfer?.files?.length) {
            this.handlePreOrderFilesUpload(e.dataTransfer.files);
          }
        });
        fileInput.addEventListener('change', (e) => {
          if (e.target.files?.length) {
            this.handlePreOrderFilesUpload(e.target.files);
            e.target.value = '';
          }
        });
      }

      document.getElementById('btn-preorder-download-template')?.addEventListener('click', () => {
        this.downloadPreOrderTemplateExcel();
      });
      document.getElementById('btn-preorder-push-to-tab1')?.addEventListener('click', () => {
        this.pushPreOrderRecordsToTab1AndTab2();
      });
      document.getElementById('btn-preorder-export-excel')?.addEventListener('click', () => {
        this.exportPreOrderReportExcel();
      });
      document.getElementById('btn-preorder-clear-all')?.addEventListener('click', () => {
        this.data.preOrderDailyRecords = [];
        this.save();
        this.renderPreOrderAndBillingTab();
        this.toast('ล้างตาราง Pre-Order เรียบร้อย พร้อมรับไฟล์อัปโหลดชุดใหม่!');
      });

      document.getElementById('form-add-preorder-manual')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const modelKey = document.getElementById('po-manual-model')?.value || 'cs3';
        const sku = document.getElementById('po-manual-sku')?.value || 'PQ002C-06';
        const qty = Number(document.getElementById('po-manual-qty')?.value || 1);
        const lr = document.getElementById('po-manual-lr')?.value || 'NONE';
        const dateLabel = (document.getElementById('preorder-upload-date-label')?.value || '').trim() || 'เพิ่มรายการด่วน';
        if (qty <= 0) return;

        const meta = this.getModelMeta(modelKey);
        let rec = (this.data.preOrderDailyRecords || []).find(r => r.dateRange === dateLabel && (r.modelKey === modelKey || r.modelLabel === meta.modelLabel));
        if (!rec) {
          rec = {
            dateRange: dateLabel,
            modelKey: meta.modelKey,
            modelLabel: meta.modelLabel,
            yardsPerUnit: meta.yardsPerUnit,
            legsPerUnit: meta.legsPerUnit,
            gearPerUnit: meta.gearPerUnit,
            colorBreakdown: {},
            lminiLR: {}
          };
          this.data.preOrderDailyRecords.unshift(rec);
        }
        rec.colorBreakdown[sku] = Number(rec.colorBreakdown[sku] || 0) + qty;
        if (modelKey === 'lmini') {
          rec.lminiLR = rec.lminiLR || {};
          if (!rec.lminiLR[sku]) rec.lminiLR[sku] = { L: 0, R: 0 };
          if (lr === 'R') rec.lminiLR[sku].R += qty;
          else rec.lminiLR[sku].L += qty;
        }
        this.save();
        this.renderPreOrderAndBillingTab();
        this.toast(`เพิ่ม Pre-Order ${meta.modelLabel} (${sku} +${qty} ตัว) เรียบร้อย!`);
      });

      // Add new Spare Part form in Tab 3
      document.getElementById('form-add-spare-part')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const model = document.getElementById('sp-input-model')?.value.trim();
        const partName = document.getElementById('sp-input-part')?.value.trim();
        const color = document.getElementById('sp-input-color')?.value.trim();
        const reqQty = Number(document.getElementById('sp-input-qty')?.value || 1);
        if (!model || !partName) return;

        this.data.sparePartsOrders.unshift({
          id: 'SP-' + Date.now().toString(36).toUpperCase(),
          model,
          partName,
          color: color || '-',
          reqQty,
          cutDoneQty: 0,
          status: 'รอตัดส่งพร้อมรอบถัดไป'
        });
        this.save();
        this.renderPreOrderAndBillingTab();
        e.target.reset();
        this.toast('เพิ่มรายการสั่งตัดอะไหล่ชิ้นส่วนเพิ่มเรียบร้อย!');
      });
    }
  };

  window.AdminRoutineController = AdminRoutineController;
})(window);
