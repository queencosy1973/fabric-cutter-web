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
    { key: 'cs2', label: 'CS2 / 2PL - New', shortLabel: '2 PL', yardsPerUnit: 3.20, piecesPerRoll: 15, cutWage: 10 },
    { key: 'cs3', label: 'CS3 / 3PL - New', shortLabel: '3 PL', yardsPerUnit: 4.33, piecesPerRoll: 11, cutWage: 10 },
    { key: 'arm', label: 'เฉพาะแขน (New)', shortLabel: 'แขน New', yardsPerUnit: 1.93, piecesPerRoll: 25, cutWage: 8 },
    { key: 'rs',  label: 'RS หัวกระดก', shortLabel: 'กระดก', yardsPerUnit: 6.26, piecesPerRoll: 7, cutWage: 20 },
    { key: 'ln3', label: 'LN3 กระดุม 19 เม็ด', shortLabel: 'กระดุม 19 เม็ด', yardsPerUnit: 6.21, piecesPerRoll: 8, cutWage: 20 },
    { key: 'ln5', label: 'LN กระดุม 5 เม็ด', shortLabel: 'กระดุม 5 เม็ด', yardsPerUnit: 6.17, piecesPerRoll: 8, cutWage: 20 },
    { key: 'rc',  label: 'PN Lit ปรับนอน', shortLabel: 'ปรับนอน', yardsPerUnit: 6.65, piecesPerRoll: 7, cutWage: 20 },
    { key: 'lmini', label: 'L Mini (รวม ซ้าย+ขวา)', shortLabel: 'L-mini', yardsPerUnit: 8.97, piecesPerRoll: 5, cutWage: 30, hasLR: true },
    { key: 'lbig',  label: 'L ใหญ่', shortLabel: 'L ใหญ่', yardsPerUnit: 11.00, piecesPerRoll: 4, cutWage: 30 }
  ];

  // Master Fabric Rows in Admin's Routine Table (mapped to Stock Movement fabricName)
  const ROUTINE_FABRICS = [
    { sku: 'PQ002C-06', color: 'ครีม', group: 'PVC หนัง', price: 32, stockName: 'ครีม-PQ002C-6' },
    { sku: 'PQ002C-12', color: 'น้ำตาล', group: 'PVC หนัง', price: 32, stockName: 'น้ำตาล-PQ002C-12' },
    { sku: 'PQ002C-19', color: 'ชา', group: 'PVC หนัง', price: 32, stockName: 'ชา-PQ002C-19' },
    { sku: 'PQ002C-17', color: 'ดำ', group: 'PVC หนัง', price: 30, stockName: 'ดำ-PQ002C-17' },
    { sku: 'PQ002C-46', color: 'เทา', group: 'PVC หนัง', price: 32, stockName: 'เทา-PQ002C-46' },
    { sku: 'PQ002C-48', color: 'มอค่า', group: 'PVC หนัง', price: 32, stockName: 'มอคค่า-PQ002C-48' },
    { sku: 'MJ 356-1A', color: 'LF ครีม', group: 'ลูกฟูก', price: 32, stockName: 'สีครีม-MJ356-1a' },
    { sku: 'MJ 356-2A', color: 'LF เขียว', group: 'ลูกฟูก', price: 53, stockName: 'สีเขียว-MJ356-2a' },
    { sku: 'MJ 356-3A', color: 'LF เทา', group: 'ลูกฟูก', price: 53, stockName: 'สีเทา-MJ356-3a' },
    { sku: 'MJ 356-4A', color: 'LF น้ำตาล', group: 'ลูกฟูก', price: 53, stockName: 'สีน้ำตาล-MJ356-4a' },
    { sku: '337-07', color: 'น้ำตาลทอง', group: 'Hollan', price: 53, stockName: 'สีน้ำตาล-MJ337-7' },
    { sku: '337-08', color: 'น้ำตาล', group: 'Hollan', price: 53, stockName: 'สีน้ำตาล-MJ337-7' },
    { sku: '337-14', color: 'เขียว', group: 'Hollan', price: 53, stockName: 'สีเขียว-MJ337-14' },
    { sku: '337-22', color: 'โรสโกลด์', group: 'Hollan', price: 53, stockName: 'สีโรสโกลด์-MJ337-22' },
    { sku: '337-23', color: 'แดง', group: 'Hollan', price: 53, stockName: 'สีแดงมะเหมี่ยว-MJ337-23' },
    { sku: '337-26', color: 'เทาอ่อน', group: 'Hollan', price: 53, stockName: 'สีเทา-MJ337-29' },
    { sku: '337-29', color: 'เทาควัน', group: 'Hollan', price: 53, stockName: 'สีเทา-MJ337-29' },
    { sku: '337-30', color: 'เทาอมเขียว', group: 'Hollan', price: 53, stockName: 'สีเทา-MJ337-29' },
    { sku: '337-31', color: 'น้ำเงิน', group: 'Hollan', price: 53, stockName: 'สีน้ำเงิน-MJ337-31' },
    { sku: '736B-01', color: 'ครีม (น้ำตาลทอง)', group: 'นาโน', price: 54, stockName: 'สีน้ำตาลทอง-736b-01' },
    { sku: '736B-02', color: 'เทาเข้ม', group: 'นาโน', price: 54, stockName: 'สีเทาเข้ม-736b-02' },
    { sku: '736B-04', color: 'ฟ้าเทา', group: 'นาโน', price: 54, stockName: 'สีฟ้าเทา-736b-04' }
  ];

  function createEmptyRow(fab) {
    return {
      sku: fab.sku,
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
          <td class="py-2.5 px-2 text-right text-amber-200">${this.fmt(totals.grandTotalExpectedRemnant, 2)}</td>
          <td colspan="2" class="py-2.5 px-2 text-center bg-indigo-950 text-indigo-200">
            รวมตัดทั้งหมด: <strong class="text-white text-sm">${this.fmt(totals.grandTotalUnits, 0)}</strong> ชุด
          </td>
        </tr>
        <tr class="bg-slate-100 text-slate-700 font-semibold text-xs border-t border-slate-300">
          <td colspan="2" class="py-2 px-3 sticky left-0 bg-slate-100 z-10">ราคาค่าแรงตัด / ตัว (บาท)</td>
          ${ROUTINE_MODELS.map(mod => `
            <td colspan="2" class="py-2 px-2 text-center border-l border-slate-300 text-slate-800">${mod.cutWage} ฿ / ตัว</td>
          `).join('')}
          <td colspan="3" class="py-2 px-2 text-right font-bold text-indigo-900">ราคารวมยอดสั่งตัด (ค่าแรงช่าง):</td>
          <td class="py-2 px-2 text-right font-extrabold text-indigo-700 text-sm bg-indigo-50">฿${this.fmt(totals.grandTotalCutWage, 2)}</td>
          <td colspan="6" class="py-2 px-3 text-[11px] text-slate-500">
            แยกตามกลุ่มผ้า: PVC ${this.fmt(totals.groupSummary['PVC หนัง'].yardsUsed, 1)} หลา | ลูกฟูก ${this.fmt(totals.groupSummary['ลูกฟูก'].yardsUsed, 1)} หลา | ฮอลแลนด์ ${this.fmt(totals.groupSummary['Hollan'].yardsUsed, 1)} หลา | นาโน ${this.fmt(totals.groupSummary['นาโน'].yardsUsed, 1)} หลา
          </td>
        </tr>
        <tr class="bg-indigo-50/90 text-indigo-950 font-bold text-xs border-t border-indigo-200">
          <td colspan="2" class="py-2 px-3 sticky left-0 bg-indigo-50 z-10">ราคารวมค่าแรงตัดแยกตามรุ่น (บาท)</td>
          ${ROUTINE_MODELS.map(mod => `
            <td colspan="2" class="py-2 px-2 text-center border-l border-indigo-200 text-indigo-900">฿${this.fmt(totals.modelWageTotals[mod.key], 0)}</td>
          `).join('')}
          <td colspan="10" class="py-2 px-3 text-xs text-rose-700 font-semibold">
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

    // Render Mode B: "ใบสั่งตัดนอก" (Outsource Production Order Sheet with L-Mini L/R Split)
    renderOutsourceOrderTable(round, totals) {
      const tbody = document.getElementById('admin-outsource-sheet-tbody');
      const tfoot = document.getElementById('admin-outsource-sheet-tfoot');
      if (!tbody || !tfoot) return;

      tbody.innerHTML = (round.rows || []).map((row, idx) => {
        const m = computeRowMetrics(row, round.formulaMode);
        const hasAny = m.totalUnits > 0 || row.orderRollsText || row.outsourceNote;
        return `
          <tr class="${hasAny ? 'bg-white hover:bg-fuchsia-50/30' : 'bg-slate-50/50 text-slate-400'} border-b border-slate-200 text-xs">
            <td class="py-2 px-3 font-semibold">${row.group}</td>
            <td class="py-2 px-3 font-bold text-slate-900">${row.sku}</td>
            <td class="py-2 px-3 font-semibold text-slate-800">${row.color}</td>
            <td class="py-1.5 px-2 text-center bg-amber-50/60">
              <input type="text" value="${row.orderRollsText || ''}" data-out-idx="${idx}" data-out-field="orderRollsText"
                placeholder="-" class="w-28 px-2 py-1 text-center font-bold text-amber-900 border border-amber-300 rounded bg-white text-xs">
            </td>
            <td class="py-2 px-2 text-center font-bold ${row.cs2 > 0 ? 'text-indigo-700 bg-indigo-50/50' : ''}">${row.cs2 || ''}</td>
            <td class="py-2 px-2 text-center font-bold ${row.cs3 > 0 ? 'text-indigo-700 bg-indigo-50/50' : ''}">${row.cs3 || ''}</td>
            <td class="py-2 px-2 text-center font-bold ${row.arm > 0 ? 'text-indigo-700 bg-indigo-50/50' : ''}">${row.arm || ''}</td>
            <td class="py-2 px-2 text-center font-bold ${row.rs > 0 ? 'text-indigo-700 bg-indigo-50/50' : ''}">${row.rs || ''}</td>
            <td class="py-2 px-2 text-center font-bold ${row.ln3 > 0 ? 'text-indigo-700 bg-indigo-50/50' : ''}">${row.ln3 || ''}</td>
            <td class="py-2 px-2 text-center font-bold ${row.ln5 > 0 ? 'text-indigo-700 bg-indigo-50/50' : ''}">${row.ln5 || ''}</td>
            <td class="py-2 px-2 text-center font-bold ${row.rc > 0 ? 'text-indigo-700 bg-indigo-50/50' : ''}">${row.rc || ''}</td>
            <td class="py-1.5 px-2 text-center bg-fuchsia-50/60 border-l border-fuchsia-200">
              <input type="number" min="0" value="${row.lminiL || ''}" data-out-idx="${idx}" data-out-field="lminiL"
                class="w-14 px-1 py-0.5 text-center font-bold text-fuchsia-900 border border-fuchsia-300 rounded bg-white">
            </td>
            <td class="py-1.5 px-2 text-center bg-fuchsia-50/60 border-r border-fuchsia-200">
              <input type="number" min="0" value="${row.lminiR || ''}" data-out-idx="${idx}" data-out-field="lminiR"
                class="w-14 px-1 py-0.5 text-center font-bold text-indigo-900 border border-indigo-300 rounded bg-white">
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
          <td colspan="3" class="py-3 px-3">รวมจำนวนตัดทุกรุ่น: <span class="text-amber-300 text-sm ml-1">${this.fmt(totals.grandTotalUnits, 0)} ชุด</span></td>
          <td class="py-3 px-2 text-center text-amber-300">≈ ${this.fmt(totals.grandTotalCalcRolls, 0)} ม้วน</td>
          <td class="py-3 px-2 text-center">${totals.modelQtyTotals.cs2 || 0}</td>
          <td class="py-3 px-2 text-center">${totals.modelQtyTotals.cs3 || 0}</td>
          <td class="py-3 px-2 text-center">${totals.modelQtyTotals.arm || 0}</td>
          <td class="py-3 px-2 text-center">${totals.modelQtyTotals.rs || 0}</td>
          <td class="py-3 px-2 text-center">${totals.modelQtyTotals.ln3 || 0}</td>
          <td class="py-3 px-2 text-center">${totals.modelQtyTotals.ln5 || 0}</td>
          <td class="py-3 px-2 text-center">${totals.modelQtyTotals.rc || 0}</td>
          <td class="py-3 px-2 text-center text-fuchsia-300 bg-fuchsia-950">${totals.totalLMiniL}</td>
          <td class="py-3 px-2 text-center text-indigo-300 bg-indigo-950">${totals.totalLMiniR}</td>
          <td class="py-3 px-3 text-amber-200">ค่าแรงตัดรวมรอบนี้: ฿${this.fmt(totals.grandTotalCutWage, 2)}</td>
        </tr>
      `;

      tbody.querySelectorAll('[data-out-idx]').forEach(el => {
        el.addEventListener('change', (e) => {
          const idx = Number(e.target.getAttribute('data-out-idx'));
          const field = e.target.getAttribute('data-out-field');
          const row = round.rows[idx];
          if (!row) return;
          if (field === 'lminiL' || field === 'lminiR') {
            row[field] = Number(e.target.value || 0);
            row.lmini = Number(row.lminiL || 0) + Number(row.lminiR || 0);
          } else {
            row[field] = e.target.value;
          }
          this.save();
          this.renderMatrixTab();
        });
      });
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
    // TAB C: PRE-ORDER DAILY MATRIX (LEGS & GEARS) + SPARE PARTS + BILLING
    // -----------------------------------------------------------------------
    renderPreOrderAndBillingTab() {
      const d = this.data;
      const poTbody = document.getElementById('preorder-daily-tbody');
      const spTbody = document.getElementById('spare-parts-tbody');
      const billTbody = document.getElementById('monthly-billing-tbody');
      if (!poTbody) return;

      let totalUnitsAll = 0;
      let totalYardsAll = 0;
      let totalLegsAll = 0;
      let totalGearsAll = 0;

      poTbody.innerHTML = (d.preOrderDailyRecords || []).map((rec) => {
        const entries = Object.entries(rec.colorBreakdown || {});
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

        const breakdownBadges = entries.map(([sku, q]) =>
          `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300 text-[11px] font-semibold">${sku}: <strong class="text-indigo-700">${q}</strong></span>`
        ).join(' ');

        return `
          <tr class="border-b border-slate-200 text-xs hover:bg-slate-50">
            <td class="py-2.5 px-3 font-semibold text-indigo-700 whitespace-nowrap">${rec.dateRange}</td>
            <td class="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">${rec.modelLabel}</td>
            <td class="py-2.5 px-3">
              <div class="flex flex-wrap gap-1">${breakdownBadges}</div>
            </td>
            <td class="py-2.5 px-3 text-center font-extrabold text-slate-900 bg-slate-50">${this.fmt(sumUnits, 0)} ตัว</td>
            <td class="py-2.5 px-3 text-right font-bold text-indigo-800">
              ${this.fmt(sumYards, 1)} หลา
              <div class="text-[10px] text-fuchsia-700">(${this.fmt(sumRolls, 1)} ม้วน)</div>
            </td>
            <td class="py-2.5 px-3 text-right bg-amber-50/60 font-semibold text-amber-900">
              ${this.fmt(sumLegs, 0)} ขา
              <div class="text-[10px] text-amber-700 font-bold">≈ ${this.fmt(sumLegBags, 2)} ถุง (÷500)</div>
            </td>
            <td class="py-2.5 px-3 text-right bg-emerald-50/60 font-semibold text-emerald-900">
              ${sumGears > 0 ? `${this.fmt(sumGears, 0)} คู่ <div class="text-[10px] text-emerald-700 font-bold">≈ ${this.fmt(sumGearBoxes, 1)} ลัง (÷15)</div>` : '-'}
            </td>
          </tr>
        `;
      }).join('');

      const poFoot = document.getElementById('preorder-daily-tfoot');
      if (poFoot) {
        poFoot.innerHTML = `
          <tr class="bg-slate-900 text-white font-bold text-xs">
            <td colspan="3" class="py-2.5 px-3">รวมยอด Pre-Order ทั้งหมด (คำนวณขาโซฟา 1" & เกียร์ปรับนอนอัตโนมัติ)</td>
            <td class="py-2.5 px-3 text-center text-amber-300 text-sm">${this.fmt(totalUnitsAll, 0)} ตัว</td>
            <td class="py-2.5 px-3 text-right text-emerald-300">${this.fmt(totalYardsAll, 1)} หลา (${this.fmt(totalYardsAll / 50, 1)} ม้วน)</td>
            <td class="py-2.5 px-3 text-right text-amber-300">${this.fmt(totalLegsAll, 0)} ขา (${this.fmt(totalLegsAll / 500, 2)} ถุง)</td>
            <td class="py-2.5 px-3 text-right text-emerald-300">${this.fmt(totalGearsAll, 0)} คู่ (${this.fmt(totalGearsAll / 15, 1)} ลัง)</td>
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

    // Export Active Round to Excel (.xlsx) matching Admin's Google Sheet layout
    exportActiveRoundToExcel() {
      if (typeof XLSX === 'undefined') {
        this.toast('ไม่พบไลบรารี XLSX สำหรับส่งออกไฟล์', '⚠️');
        return;
      }
      const round = this.getActiveRound();
      if (!round) return;
      const totals = computeRoundTotals(round);

      // Sheet 1: ใบเบิกผ้าคำนวณตัด
      const aoa1 = [
        ['เบอร์สี SKU', 'สี', 'กลุ่มผ้า', 'CS2 (3.2Y)', 'รวมหลา CS2', 'CS3 (4.33Y)', 'รวมหลา CS3', 'เฉพาะแขน (1.93Y)', 'รวมหลาแขน', 'RS หัวกระดก (6.26Y)', 'รวมหลา RS', 'LN3 กระดุม 19 เม็ด (6.21Y)', 'รวมหลา LN3', 'LN กระดุม 5 เม็ด (6.17Y)', 'รวมหลา LN5', 'PN ปรับนอน (6.65Y)', 'รวมหลา PN', 'L-Mini ซ้าย', 'L-Mini ขวา', 'รวมหลา L-Mini (8.97Y)', 'รวมเบิก (หลา)', 'จำนวนม้วน (÷50)', 'ราคา/หลา', 'รวมยอดค่าผ้า', 'หักผ้าที่มี / สั่งม้วน', 'จำนวนหลาที่ส่งจริง', 'ยอดยกมา (หลา)', 'จำนวนผ้าคงเหลือตามสูตร', 'คงเหลือจริง #ช่างนอก', 'หมายเหตุรีเช็ค']
      ];

      (round.rows || []).forEach(r => {
        const m = computeRowMetrics(r, round.formulaMode);
        aoa1.push([
          r.sku, r.color, r.group,
          r.cs2 || 0, m.modelYards.cs2,
          r.cs3 || 0, m.modelYards.cs3,
          r.arm || 0, m.modelYards.arm,
          r.rs || 0, m.modelYards.rs,
          r.ln3 || 0, m.modelYards.ln3,
          r.ln5 || 0, m.modelYards.ln5,
          r.rc || 0, m.modelYards.rc,
          r.lminiL || 0, r.lminiR || 0, m.modelYards.lmini,
          m.totalUsedYards, m.calcRolls, r.price, m.fabricCost,
          r.orderRollsText || '', r.sentYards || 0, r.carriedYards || 0,
          m.expectedRemnantYards, r.actualCutterRemnant || '', r.note || ''
        ]);
      });

      aoa1.push([
        'รวมจำนวนผลิต/ชุด', '', '',
        totals.modelQtyTotals.cs2, '',
        totals.modelQtyTotals.cs3, '',
        totals.modelQtyTotals.arm, '',
        totals.modelQtyTotals.rs, '',
        totals.modelQtyTotals.ln3, '',
        totals.modelQtyTotals.ln5, '',
        totals.modelQtyTotals.rc, '',
        totals.totalLMiniL, totals.totalLMiniR, '',
        totals.grandTotalUsedYards, totals.grandTotalCalcRolls, 'ราคารวมค่าผ้า:', totals.grandTotalFabricCost,
        'รวมค่าแรงตัด:', totals.grandTotalCutWage, 'รวมชุดทั้งหมด:', totals.grandTotalUnits, '', ''
      ]);

      // Sheet 2: ใบสั่งตัดนอก (แยก L-mini ซ้าย/ขวา)
      const aoa2 = [
        ['รุ่นกลุ่มผ้า', 'เบอร์สี SKU', 'สี', 'จำนวนการส่งไม้', '2 PL', '3 PL', 'แขน New', 'กระดก', 'กระดุม 19 เม็ด', 'กระดุม 5 เม็ด', 'ปรับนอน', 'L-mini ซ้าย', 'L-mini ขวา', 'หมายเหตุสั่งช่าง']
      ];
      (round.rows || []).forEach(r => {
        aoa2.push([
          r.group, r.sku, r.color, r.orderRollsText || '',
          r.cs2 || '', r.cs3 || '', r.arm || '', r.rs || '', r.ln3 || '', r.ln5 || '', r.rc || '',
          r.lminiL || '', r.lminiR || '', r.outsourceNote || ''
        ]);
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa1), 'ใบเบิกผ้า_คำนวณตัด');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa2), 'ใบสั่งตัดนอก');
      XLSX.writeFile(wb, `QueenCosy_ใบเบิกผ้าและสั่งตัดนอก_${round.calcDate || 'export'}.xlsx`);
      this.toast('ส่งออกไฟล์ Excel (ใบเบิกผ้า + ใบสั่งตัดนอก) สำเร็จ!');
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

      // Action buttons in Tab 1
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
