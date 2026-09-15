import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Clock, LogIn, LogOut, CheckCircle2, XCircle, Users, ClipboardList,
  BarChart3, KeyRound, Plus, Trash2, ArrowLeft, RefreshCw, Pencil,
  Check, X, ChevronDown, ChevronRight, ChevronLeft, ChevronUp, UserRound, Coffee, Settings,
  Home, Wifi, CalendarDays, DollarSign, Eye, Award, Grid3x3, Sun, Moon, AlertTriangle
} from "lucide-react";

/* ============================================================================
   ORBITAL X — team time clock & survey production tracker
   Single-file artifact. Data lives in a real Postgres database (Supabase),
   shared by everyone who opens this artifact, see the setup block below.
   ============================================================================ */

// The Orbital X mark, embedded as a data URI so the logo renders with zero
// external dependencies (no network fetch needed to show the brand).
const ORBIT_LOGO = `${import.meta.env.BASE_URL}logo.png`;/* ─── Connect your database ──────────────────────────────────────────────
   1. Create a project at https://supabase.com (no credit card needed).
   2. Open the SQL Editor in that project and run the setup script provided
      alongside this file.
   3. Go to Project Settings → API and copy the "Project URL" and the
      "anon public" key (this key is meant to be used in client-side code
      it's not a secret; real protection comes from what the app itself
      lets people do, same as the PIN screen already does).
   4. Paste both values in below. That's it,every device that opens this
      artifact will read and write the same live data.
   ────────────────────────────────────────────────────────────────────── */
// [CHANGED] Supabase credentials come from Vite environment variables.
// Never hard-code the Supabase key in this file.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const DB_CONFIGURED = /^https:\/\/.+\.supabase\.co\/?$/.test(SUPABASE_URL.trim()) && SUPABASE_ANON_KEY.trim().length > 20;
const SB_URL = SUPABASE_URL.trim().replace(/\/$/, "");
const SB_KEY = SUPABASE_ANON_KEY.trim();

// [ADDED] Realtime client — used only for live postgres_changes subscriptions.
// Every read/write in this file still goes through the plain-fetch REST
// helpers below (sbSelect/sbUpsert/sbDelete/callRpc); this client's only job
// is the WebSocket connection Realtime needs, so we don't hand-roll the
// Phoenix channel protocol ourselves.
const supabase = DB_CONFIGURED ? createClient(SB_URL, SB_KEY) : null;

const DEFAULT_BREAK_MINUTES = 30;
const DEFAULT_KES_RATE = 125; // approximate USD→KES rate; admin can adjust in Settings

// [ADDED] Who's signed in survives a page reload (and closing/reopening the
// browser) until they explicitly sign out, so a refresh — including the one
// a browser does automatically after it's been idle — doesn't drop someone
// mid-shift. localStorage (not sessionStorage) is what makes it survive a
// closed tab/browser, not just a reload.
const CURRENT_USER_STORAGE_KEY = "orbitalx_current_user_id";
function readStoredUserId() {
  try {
    return localStorage.getItem(CURRENT_USER_STORAGE_KEY) || null;
  } catch {
    // Storage can throw in private-browsing contexts or when blocked —
    // fall back to "nobody signed in" rather than crash the app.
    return null;
  }
}
function writeStoredUserId(id) {
  try {
    if (id) localStorage.setItem(CURRENT_USER_STORAGE_KEY, id);
    else localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
  } catch {
    // Ignore — worst case the session just won't survive a reload.
  }
}

/* ---------------------------------- Seed data ---------------------------------- */

const SEED_EMPLOYEES = [
  { id: "admin", name: "Admin", role: "admin", active: true },
  { id: "christine", name: "Christine", role: "tasker", active: true },
  { id: "kali", name: "Kali", role: "tasker", active: true },
  { id: "meshack", name: "Meshack", role: "tasker", active: true },
  { id: "denno", name: "Denno", role: "tasker", active: true },
];

// Historical totals migrated from each tasker's spreadsheet tracker.
// Stored as weekly aggregates (matching what those sheets already reported),
// clearly separated from live entries logged going forward inside Orbital X.
const IMPORTED_SURVEY_HISTORY = {
  christine: [
    { label: "Week 1", successful: 22, screenedOut: 44 },
    { label: "Week 2", successful: 7, screenedOut: 16 },
  ],
  kali: [
    { label: "Week 1", successful: 24, screenedOut: 18 },
    { label: "Week 2", successful: 16, screenedOut: 5 },
  ],
  meshack: [
    { label: "Week 1", successful: 9, screenedOut: 12 },
    { label: "Week 2", successful: 7, screenedOut: 9 },
  ],
  denno: [
    { label: "Week 1", successful: 21, screenedOut: 20 },
  ],
};

// Known earning sub-accounts (the identities daily $ production is logged
// against), migrated from the Daily/Weekly/Monthly Input tracker. This also
// seeds the initial "accounts" list,admin can add to or rename it from here.
const ACCOUNT_EARNING_NAMES = [
  "Handshake 1 (Lide)", "Handshake 2", "Handshake 3 (Sonic)", "Handshake A (Anfield)",
  "Survey Junkie (Sonic)", "Survey Junkie (Anfield)", "Survey Junkie (Creed)", "Survey Junkie (Lide)",
  "Attapoll 1 (Lide)", "Attapoll 2 (Creed)", "Eureka", "Survey Pop", "Outlier 1", "Moblab",
];

// Historical daily earnings, migrated exactly from the company spreadsheet
// (every non-zero day, March–September 2026), imported once on first boot.
const IMPORTED_ACCOUNT_EARNINGS = [{"accountName":"Attapoll 1 (Lide)","date":"2026-03-23","amount":3.21},{"accountName":"Attapoll 1 (Lide)","date":"2026-03-24","amount":5.31},{"accountName":"Attapoll 1 (Lide)","date":"2026-03-27","amount":14.27},{"accountName":"Attapoll 1 (Lide)","date":"2026-03-28","amount":5.73},{"accountName":"Attapoll 1 (Lide)","date":"2026-03-29","amount":6.24},{"accountName":"Attapoll 1 (Lide)","date":"2026-03-31","amount":13.87},{"accountName":"Attapoll 1 (Lide)","date":"2026-04-01","amount":9.94},{"accountName":"Eureka","date":"2026-04-01","amount":43.63},{"accountName":"Attapoll 1 (Lide)","date":"2026-04-02","amount":4.12},{"accountName":"Attapoll 1 (Lide)","date":"2026-04-03","amount":5.29},{"accountName":"Eureka","date":"2026-04-03","amount":20.18},{"accountName":"Attapoll 1 (Lide)","date":"2026-04-05","amount":6.59},{"accountName":"Attapoll 1 (Lide)","date":"2026-04-06","amount":10.03},{"accountName":"Eureka","date":"2026-04-06","amount":8.8},{"accountName":"Handshake 1 (Lide)","date":"2026-04-07","amount":98.0},{"accountName":"Eureka","date":"2026-04-07","amount":12.21},{"accountName":"Handshake 1 (Lide)","date":"2026-04-08","amount":128.0},{"accountName":"Attapoll 1 (Lide)","date":"2026-04-08","amount":8.18},{"accountName":"Handshake 1 (Lide)","date":"2026-04-09","amount":16.7},{"accountName":"Moblab","date":"2026-04-09","amount":0.14},{"accountName":"Attapoll 1 (Lide)","date":"2026-04-10","amount":27.74},{"accountName":"Eureka","date":"2026-04-10","amount":13.74},{"accountName":"Attapoll 1 (Lide)","date":"2026-04-11","amount":3.72},{"accountName":"Eureka","date":"2026-04-11","amount":5.0},{"accountName":"Survey Pop","date":"2026-04-11","amount":17.33},{"accountName":"Moblab","date":"2026-04-11","amount":0.14},{"accountName":"Survey Junkie (Sonic)","date":"2026-04-12","amount":2.64},{"accountName":"Survey Junkie (Sonic)","date":"2026-04-13","amount":3.04},{"accountName":"Survey Junkie (Sonic)","date":"2026-04-14","amount":2.13},{"accountName":"Survey Junkie (Sonic)","date":"2026-04-15","amount":7.46},{"accountName":"Survey Junkie (Sonic)","date":"2026-04-16","amount":0.2},{"accountName":"Attapoll 1 (Lide)","date":"2026-04-16","amount":22.31},{"accountName":"Survey Pop","date":"2026-04-16","amount":4.8},{"accountName":"Attapoll 1 (Lide)","date":"2026-04-17","amount":11.49},{"accountName":"Survey Junkie (Sonic)","date":"2026-04-18","amount":8.74},{"accountName":"Attapoll 1 (Lide)","date":"2026-04-18","amount":9.75},{"accountName":"Eureka","date":"2026-04-18","amount":4.96},{"accountName":"Moblab","date":"2026-04-18","amount":0.14},{"accountName":"Survey Junkie (Sonic)","date":"2026-04-19","amount":8.95},{"accountName":"Survey Junkie (Sonic)","date":"2026-04-20","amount":5.41},{"accountName":"Attapoll 1 (Lide)","date":"2026-04-20","amount":4.27},{"accountName":"Survey Junkie (Sonic)","date":"2026-04-21","amount":4.43},{"accountName":"Survey Junkie (Sonic)","date":"2026-04-22","amount":3.41},{"accountName":"Survey Junkie (Anfield)","date":"2026-04-22","amount":2.0},{"accountName":"Survey Junkie (Anfield)","date":"2026-04-23","amount":10.77},{"accountName":"Survey Junkie (Sonic)","date":"2026-04-24","amount":11.41},{"accountName":"Survey Junkie (Anfield)","date":"2026-04-24","amount":4.0},{"accountName":"Attapoll 1 (Lide)","date":"2026-04-24","amount":10.34},{"accountName":"Moblab","date":"2026-04-24","amount":0.14},{"accountName":"Survey Junkie (Sonic)","date":"2026-04-25","amount":6.95},{"accountName":"Eureka","date":"2026-04-25","amount":2.2},{"accountName":"Handshake 2","date":"2026-04-26","amount":180.0},{"accountName":"Survey Junkie (Sonic)","date":"2026-04-26","amount":4.58},{"accountName":"Survey Junkie (Anfield)","date":"2026-04-26","amount":0.3},{"accountName":"Attapoll 2 (Creed)","date":"2026-04-26","amount":12.94},{"accountName":"Handshake 2","date":"2026-04-27","amount":150.0},{"accountName":"Survey Junkie (Sonic)","date":"2026-04-27","amount":2.9},{"accountName":"Survey Junkie (Anfield)","date":"2026-04-27","amount":3.6},{"accountName":"Attapoll 2 (Creed)","date":"2026-04-27","amount":0.53},{"accountName":"Survey Junkie (Sonic)","date":"2026-04-28","amount":17.0},{"accountName":"Survey Junkie (Anfield)","date":"2026-04-28","amount":1.29},{"accountName":"Survey Junkie (Sonic)","date":"2026-04-29","amount":17.2},{"accountName":"Survey Junkie (Anfield)","date":"2026-04-29","amount":2.49},{"accountName":"Survey Junkie (Anfield)","date":"2026-04-30","amount":22.0},{"accountName":"Handshake 1 (Lide)","date":"2026-05-01","amount":150.0},{"accountName":"Survey Junkie (Sonic)","date":"2026-05-01","amount":10.0},{"accountName":"Survey Junkie (Anfield)","date":"2026-05-01","amount":2.16},{"accountName":"Survey Junkie (Sonic)","date":"2026-05-04","amount":7.7},{"accountName":"Survey Junkie (Sonic)","date":"2026-05-05","amount":9.8},{"accountName":"Survey Junkie (Sonic)","date":"2026-05-06","amount":5.6},{"accountName":"Survey Junkie (Anfield)","date":"2026-05-06","amount":5.8},{"accountName":"Survey Junkie (Sonic)","date":"2026-05-07","amount":8.2},{"accountName":"Handshake 1 (Lide)","date":"2026-05-08","amount":150.0},{"accountName":"Handshake 2","date":"2026-05-08","amount":90.0},{"accountName":"Survey Junkie (Sonic)","date":"2026-05-08","amount":7.7},{"accountName":"Survey Junkie (Sonic)","date":"2026-05-09","amount":15.0},{"accountName":"Survey Junkie (Anfield)","date":"2026-05-11","amount":7.0},{"accountName":"Eureka","date":"2026-05-11","amount":7.78},{"accountName":"Survey Junkie (Sonic)","date":"2026-05-13","amount":6.21},{"accountName":"Moblab","date":"2026-05-13","amount":4.92},{"accountName":"Handshake 1 (Lide)","date":"2026-05-14","amount":50.0},{"accountName":"Survey Junkie (Sonic)","date":"2026-05-14","amount":10.71},{"accountName":"Survey Junkie (Anfield)","date":"2026-05-14","amount":20.03},{"accountName":"Moblab","date":"2026-05-15","amount":0.2},{"accountName":"Handshake 1 (Lide)","date":"2026-05-16","amount":169.88},{"accountName":"Handshake 1 (Lide)","date":"2026-05-19","amount":136.0},{"accountName":"Handshake 1 (Lide)","date":"2026-05-20","amount":102.0},{"accountName":"Handshake 1 (Lide)","date":"2026-05-21","amount":170.0},{"accountName":"Handshake 1 (Lide)","date":"2026-05-22","amount":170.0},{"accountName":"Survey Junkie (Sonic)","date":"2026-05-22","amount":9.9},{"accountName":"Handshake 1 (Lide)","date":"2026-05-23","amount":102.0},{"accountName":"Survey Junkie (Sonic)","date":"2026-05-24","amount":4.14},{"accountName":"Handshake 1 (Lide)","date":"2026-05-25","amount":68.0},{"accountName":"Handshake 1 (Lide)","date":"2026-05-26","amount":127.5},{"accountName":"Handshake 1 (Lide)","date":"2026-05-27","amount":255.0},{"accountName":"Handshake 1 (Lide)","date":"2026-05-28","amount":238.0},{"accountName":"Handshake 1 (Lide)","date":"2026-05-29","amount":51.0},{"accountName":"Handshake 1 (Lide)","date":"2026-05-30","amount":51.0},{"accountName":"Handshake 1 (Lide)","date":"2026-05-31","amount":102.0},{"accountName":"Handshake 1 (Lide)","date":"2026-06-02","amount":102.0},{"accountName":"Handshake 1 (Lide)","date":"2026-06-03","amount":289.0},{"accountName":"Handshake 1 (Lide)","date":"2026-06-04","amount":306.0},{"accountName":"Handshake 1 (Lide)","date":"2026-06-05","amount":323.0},{"accountName":"Survey Junkie (Anfield)","date":"2026-06-05","amount":13.22},{"accountName":"Handshake 1 (Lide)","date":"2026-06-06","amount":119.0},{"accountName":"Survey Junkie (Anfield)","date":"2026-06-06","amount":11.6},{"accountName":"Survey Junkie (Anfield)","date":"2026-06-13","amount":100.32},{"accountName":"Survey Junkie (Anfield)","date":"2026-06-19","amount":75.05},{"accountName":"Survey Junkie (Anfield)","date":"2026-07-01","amount":33.35},{"accountName":"Survey Junkie (Sonic)","date":"2026-08-31","amount":4.34},{"accountName":"Survey Junkie (Lide)","date":"2026-08-31","amount":1.83},{"accountName":"Survey Junkie (Sonic)","date":"2026-09-01","amount":12.42},{"accountName":"Survey Junkie (Lide)","date":"2026-09-01","amount":2.7},{"accountName":"Survey Junkie (Sonic)","date":"2026-09-02","amount":8.97},{"accountName":"Survey Junkie (Creed)","date":"2026-09-02","amount":6.04},{"accountName":"Survey Junkie (Lide)","date":"2026-09-02","amount":2.81},{"accountName":"Survey Junkie (Sonic)","date":"2026-09-03","amount":8.82},{"accountName":"Survey Junkie (Anfield)","date":"2026-09-03","amount":10.07},{"accountName":"Survey Junkie (Creed)","date":"2026-09-03","amount":3.97},{"accountName":"Survey Junkie (Lide)","date":"2026-09-03","amount":2.88},{"accountName":"Survey Junkie (Sonic)","date":"2026-09-04","amount":9.22},{"accountName":"Survey Junkie (Anfield)","date":"2026-09-04","amount":5.11},{"accountName":"Survey Junkie (Creed)","date":"2026-09-04","amount":6.38},{"accountName":"Survey Junkie (Lide)","date":"2026-09-04","amount":2.58},{"accountName":"Survey Junkie (Sonic)","date":"2026-09-05","amount":2.69},{"accountName":"Survey Junkie (Anfield)","date":"2026-09-05","amount":4.39},{"accountName":"Survey Junkie (Creed)","date":"2026-09-05","amount":4.7},{"accountName":"Survey Junkie (Lide)","date":"2026-09-05","amount":4.11},{"accountName":"Handshake 3 (Sonic)","date":"2026-09-07","amount":221.0},{"accountName":"Survey Junkie (Anfield)","date":"2026-09-07","amount":0.76},{"accountName":"Survey Junkie (Creed)","date":"2026-09-07","amount":1.71},{"accountName":"Attapoll 1 (Lide)","date":"2026-09-07","amount":2.87},{"accountName":"Handshake 3 (Sonic)","date":"2026-09-08","amount":274.72},{"accountName":"Survey Junkie (Anfield)","date":"2026-09-08","amount":6.37},{"accountName":"Survey Junkie (Creed)","date":"2026-09-08","amount":6.7},{"accountName":"Attapoll 1 (Lide)","date":"2026-09-08","amount":4.36},{"accountName":"Handshake 3 (Sonic)","date":"2026-09-09","amount":178.5},{"accountName":"Survey Junkie (Anfield)","date":"2026-09-09","amount":5.5},{"accountName":"Survey Junkie (Creed)","date":"2026-09-09","amount":0.51},{"accountName":"Attapoll 1 (Lide)","date":"2026-09-09","amount":5.12},{"accountName":"Attapoll 2 (Creed)","date":"2026-09-09","amount":12.13}];

/* ---------------------------------- Supabase REST helpers ---------------------------------- */

function sbHeaders(extra) {
  return { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...extra };
}

async function sbSelect(table, query = "?select=*") {
  if (!DB_CONFIGURED) return null;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${table}${query}`, { headers: sbHeaders() });
    if (!res.ok) throw new Error(`select ${table} → ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn("Orbital X DB read failed:", table, e);
    return null;
  }
}

// Upsert always sends the FULL row. That matches how this app already keeps
// full objects in local state, and lets one function cover both "create"
// and "update" (insert, or overwrite on primary-key conflict).
async function sbUpsert(table, rows) {
  if (!DB_CONFIGURED) return false;
  const payload = Array.isArray(rows) ? rows : [rows];
  if (payload.length === 0) return true;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: sbHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`upsert ${table} → ${res.status}`);
    return true;
  } catch (e) {
    console.warn("Orbital X DB write failed:", table, e);
    return false;
  }
}

async function sbDelete(table, id) {
  if (!DB_CONFIGURED) return false;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: sbHeaders({ Prefer: "return=minimal" }),
    });
    if (!res.ok) throw new Error(`delete ${table} → ${res.status}`);
    return true;
  } catch (e) {
    console.warn("Orbital X DB delete failed:", table, e);
    return false;
  }
}

const BALANCE_BUCKET = "balance-screenshots";

function dataUriToBlob(dataUri) {
  const [header, base64] = String(dataUri || "").split(",");
  const mime = (header.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
  const bytes = atob(base64 || "");
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function uploadBalanceScreenshot(employeeId, dataUri, submissionId) {
  if (!DB_CONFIGURED || !dataUri) return null;
  const path = `${employeeId}/${new Date().toISOString().slice(0, 10)}/${submissionId}.jpg`;
  const blob = dataUriToBlob(dataUri);
  const res = await fetch(`${SB_URL}/storage/v1/object/${BALANCE_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": blob.type || "image/jpeg",
      "x-upsert": "false",
    },
    body: blob,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Screenshot upload failed (${res.status}): ${text}`);
  }
  return path;
}

async function createScreenshotSignedUrl(path, expiresIn = 3600) {
  if (!DB_CONFIGURED || !path) return null;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`${SB_URL}/storage/v1/object/sign/${BALANCE_BUCKET}/${encodedPath}`, {
    method: "POST",
    headers: sbHeaders(),
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const signed = data?.signedURL || data?.signedUrl || null;
  if (!signed) return null;
  return signed.startsWith("http") ? signed : `${SB_URL}${signed}`;
}

// [ADDED] RPC helper for PIN operations that must happen server-side.
// The browser never receives or stores plaintext PINs from the employees table.
async function callRpc(functionName, params = {}) {
  if (!DB_CONFIGURED) return { data: null, error: new Error("Supabase is not configured.") };
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: sbHeaders(),
      body: JSON.stringify(params),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      throw new Error(typeof data === "string" ? data : (data?.message || `RPC ${functionName} → ${res.status}`));
    }
    return { data, error: null };
  } catch (e) {
    console.warn("Orbital X RPC failed:", functionName, e);
    return { data: null, error: e };
  }
}

// [ADDED] Verify a PIN without exposing pin_hash to the browser.
async function verifyEmployeePin(employeeId, pin) {
  const { data, error } = await callRpc("verify_employee_pin", {
    p_employee_id: employeeId,
    p_pin: pin,
  });
  const employee = Array.isArray(data) ? data[0] || null : null;
  return { employee, error };
}

async function checkDbHealth(attempts = 3) {
  if (!DB_CONFIGURED) return false;
  for (let i = 0; i < attempts; i++) {
    const rows = await sbSelect("employees", "?select=id&limit=1");
    if (rows !== null) return true;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

// Local (camelCase) ⇄ database (snake_case) row mapping.
function sessionToRow(empId, s) {
  return { id: s.id, employee_id: empId, clock_in: s.clockIn, clock_out: s.clockOut || null, note: s.note || "", breaks: s.breaks || [], location: s.location || "onsite" };
}
function sessionFromRow(row) {
  return { id: row.id, clockIn: row.clock_in, clockOut: row.clock_out, note: row.note || "", breaks: row.breaks || [], location: row.location || "onsite" };
}
function surveyToRow(empId, e) {
  return { id: e.id, employee_id: empId, ts: e.ts, result: e.result };
}
function surveyFromRow(row) {
  return { id: row.id, ts: row.ts, result: row.result };
}
function shiftToRow(s) {
  return { id: s.id, employee_id: s.employeeId, date: s.date, shift_type: s.shiftType, start_time: s.startTime || "", end_time: s.endTime || "", notes: s.notes || "" };
}
function shiftFromRow(row) {
  return { id: row.id, employeeId: row.employee_id, date: row.date, shiftType: row.shift_type, startTime: row.start_time || "", endTime: row.end_time || "", notes: row.notes || "" };
}
function accountToRow(a) {
  return { id: a.id, name: a.name, sort_index: a.sortIndex || 0 };
}
function accountFromRow(row) {
  return { id: row.id, name: row.name, sortIndex: row.sort_index || 0 };
}
function earningToRow(e) {
  return { id: e.id, account_name: e.accountName, date: e.date, amount: e.amount };
}
function earningFromRow(row) {
  return { id: row.id, accountName: row.account_name, date: row.date, amount: row.amount };
}
function taskLogToRow(t) {
  return { id: t.id, employee_id: t.employeeId, date: t.date, grid: t.grid };
}
function taskLogFromRow(row) {
  return { id: row.id, employeeId: row.employee_id, date: row.date, grid: row.grid || emptyTaskGrid() };
}
function emptyTaskGrid() {
  return Array.from({ length: 10 }, () => Array(10).fill(false));
}

/* ---------------------------------- Helpers ---------------------------------- */

let _uidCounter = 0;
const uid = () => (++_uidCounter).toString(36) + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const genPin = () => String(Math.floor(1000 + Math.random() * 9000));

function sortEmployees(list) {
  return list.slice().sort((a, b) => {
    if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function endOfWeek(d) {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}
function weekLabel(d) {
  const s = startOfWeek(d), e = endOfWeek(d);
  const optsFull = { month: "short", day: "numeric" };
  const sameMonth = s.getMonth() === e.getMonth();
  const sStr = s.toLocaleDateString("en-US", optsFull);
  const eStr = sameMonth ? String(e.getDate()) : e.toLocaleDateString("en-US", optsFull);
  return `Week of ${sStr}–${eStr}, ${e.getFullYear()}`;
}
function isSameLocalDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function fmtHM(ms) {
  if (ms < 0) ms = 0;
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

// Breaks pause paid time: "net" = gross clocked span minus break time.
function breakMs(brk, nowMs) {
  const start = new Date(brk.start).getTime();
  const end = brk.end ? new Date(brk.end).getTime() : nowMs;
  return Math.max(0, end - start);
}
function sessionBreaksMs(session, nowMs) {
  return (session.breaks || []).reduce((sum, b) => sum + breakMs(b, nowMs), 0);
}
function sessionGrossMs(session, nowMs) {
  const start = new Date(session.clockIn).getTime();
  const end = session.clockOut ? new Date(session.clockOut).getTime() : nowMs;
  return Math.max(0, end - start);
}
function sessionNetMs(session, nowMs) {
  return Math.max(0, sessionGrossMs(session, nowMs) - sessionBreaksMs(session, nowMs));
}

// "adhered" = ended at or before the planned length (or still running and not
// yet over). "over" = ran longer than the length that was in effect when it started.
function breakAdherence(brk, nowMs) {
  const ms = breakMs(brk, nowMs);
  const plannedMs = Math.max(1, brk.plannedMinutes || DEFAULT_BREAK_MINUTES) * 60000;
  return ms > plannedMs ? "over" : "ok";
}

function localDateKey(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// new Date("YYYY-MM-DD") parses as UTC midnight, which can land on the
// previous local day in timezones behind UTC. Use this instead whenever a
// plain date-only string (not a full ISO timestamp) needs a Date object.
function parseDateKeyLocal(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function fmtDayHeading(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}
// Group a list of time-clock sessions into per-calendar-day buckets, newest day first.
function groupSessionsByDay(sessions) {
  const map = new Map();
  sessions.forEach((s) => {
    const key = localDateKey(s.clockIn);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  });
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, list]) => ({ dateKey: key, heading: fmtDayHeading(key), sessions: list }));
}

function balanceToRow(b) {
  return {
    id: b.id,
    employee_id: b.employeeId,
    submitted_at: b.submittedAt,
    manual_balance: b.balance,
    screenshot_path: b.screenshotPath || null,
    ocr_balance: b.ocrBalance != null ? b.ocrBalance : null,
    ocr_text: b.ocrText || null,
    ocr_status: b.ocrStatus || null,
    raw_value: b.rawValue != null ? b.rawValue : b.balance,
    was_points: !!b.wasPoints,
    description: b.description || null,
  };
}
function balanceFromRow(row) {
  const submittedAt = row.submitted_at || new Date().toISOString();
  return {
    id: row.id,
    employeeId: row.employee_id,
    date: localDateKey(submittedAt),
    balance: Number(row.manual_balance || 0),
    screenshotPath: row.screenshot_path || null,
    screenshot: null,
    submittedAt,
    rawValue: row.raw_value != null ? Number(row.raw_value) : Number(row.manual_balance || 0),
    wasPoints: !!row.was_points,
    ocrBalance: row.ocr_balance != null ? Number(row.ocr_balance) : null,
    ocrText: row.ocr_text || null,
    ocrStatus: row.ocr_status || null,
    description: row.description || "",
  };
}
// Earnings are cumulative within each calendar day: today's work is the
// latest reported balance minus the first reported balance for that day.
// Every submission remains in history, so multiple submissions on the same
// day never overwrite each other.
function sortedSubmissions(list) {
  return list.slice().sort((a, b) => {
    const at = new Date(a.submittedAt || 0).getTime();
    const bt = new Date(b.submittedAt || 0).getTime();
    return at - bt;
  });
}
function earningsByDate(submissions) {
  const groups = new Map();
  sortedSubmissions(submissions).forEach((s) => {
    const dateKey = s.date || localDateKey(s.submittedAt);
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey).push(s);
  });
  const map = new Map();
  groups.forEach((items, dateKey) => {
    if (items.length < 2) {
      map.set(dateKey, 0);
      return;
    }
    const first = Number(items[0].balance);
    const latest = Number(items[items.length - 1].balance);
    map.set(dateKey, latest - first);
  });
  return map;
}
function earningsForDay(submissions, dateKey) {
  const map = earningsByDate(submissions);
  return map.has(dateKey) ? map.get(dateKey) : null;
}
function earningsForWeek(submissions, nowMs) {
  const map = earningsByDate(submissions);
  const weekStartKey = localDateKey(startOfWeek(nowMs).toISOString());
  const weekEndKey = localDateKey(endOfWeek(nowMs).toISOString());
  let total = 0, any = false;
  map.forEach((amt, dateKey) => {
    if (dateKey >= weekStartKey && dateKey <= weekEndKey) { total += amt; any = true; }
  });
  return any ? total : 0;
}
function fmtMoney(n) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

// Pulls numbers out of OCR'd text (handles "$45.20", "1,234.56", "3200", etc).
export function extractNumbersFromText(text) {
  const matches = text.match(/\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?/g) || [];
  return matches.map((m) => parseFloat(m.replace(/,/g, ""))).filter((n) => !isNaN(n));
}

// Best-effort screenshot check: OCRs the attached image and looks for a number
// matching what the tasker typed. Never throws and never blocks submission,
// OCR misreads are common, so this is a helpful signal for admin review, not
// a gatekeeper. Loaded lazily so the OCR engine isn't in the main app bundle.
async function verifyBalanceScreenshot(dataUri, typedValue) {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    let text;
    try {
      const result = await worker.recognize(dataUri);
      text = result.data.text;
    } finally {
      await worker.terminate();
    }
    const found = extractNumbersFromText(text);
    const target = Math.round(typedValue * 100);
    const matchedValue = found.find((n) => Math.round(n * 100) === target) ?? null;
    return { status: matchedValue != null ? "match" : "mismatch", found, text, matchedValue };
  } catch (e) {
    console.warn("Screenshot verification unavailable:", e);
    return { status: "error", found: [] };
  }
}

// Tasker payout tiers: the tier a total falls into sets the rate for the
// WHOLE amount (a flat-rate bonus structure, not a marginal/graduated one,
// e.g. $150.01 earned pays 60% on all $150.01, not just the portion over $150).
// Bounds are treated as contiguous (no gap between $60 and $61, etc.) so a
// fractional amount like $60.50 still falls cleanly into the $61–$80 tier.
const CUT_TIERS = [
  { upTo: 60, rate: 0.35, label: "$0–$60" },
  { upTo: 80, rate: 0.40, label: "$61–$80" },
  { upTo: 100, rate: 0.45, label: "$81–$100" },
  { upTo: 149, rate: 0.50, label: "$101–$149" },
  { upTo: Infinity, rate: 0.60, label: "$150+" },
];
function cutTierFor(amount) {
  const a = Math.max(0, amount);
  for (const t of CUT_TIERS) {
    if (a <= t.upTo) return t;
  }
  return CUT_TIERS[CUT_TIERS.length - 1];
}
function cutAmountFor(amount) {
  const a = Math.max(0, amount);
  return a * cutTierFor(a).rate;
}
function fmtKES(usdAmount, rate) {
  const kes = usdAmount * rate;
  return `KSh ${kes.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/* -------------------------------- Small UI atoms -------------------------------- */



function OrbitMark({ size = 30 }) {
  return (
    <img
      src={ORBIT_LOGO}
      alt="Orbital X"
      width={size}
      height={Math.round(size * 0.779)}
      style={{ display: "block", objectFit: "contain" }}
    />
  );
}

function OrbitDial({ active, paused, fractionOfHour, primary, secondary }) {
  const r = 54, c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, fractionOfHour));
  const ringColor = paused ? "var(--amber-soft)" : active ? "var(--amber)" : "var(--line-strong)";
  return (
    <div className="orb-dial">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--line)" strokeWidth="8" />
        <circle
          cx="70" cy="70" r={r} fill="none"
          stroke={ringColor}
          strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - (active ? frac : 0))}
          transform="rotate(-90 70 70)"
          style={{ transition: "stroke-dashoffset 0.9s linear" }}
        />
        {active && !paused && (
          <circle
            cx={70 + r * Math.cos((frac * 2 * Math.PI) - Math.PI / 2)}
            cy={70 + r * Math.sin((frac * 2 * Math.PI) - Math.PI / 2)}
            r="5" fill="var(--amber)"
          />
        )}
      </svg>
      <div className="orb-dial-text">
        <div className="orb-dial-primary">{primary}</div>
        <div className="orb-dial-secondary">{secondary}</div>
      </div>
    </div>
  );
}

function StatTile({ label, value, tone }) {
  return (
    <div className={`orb-stat orb-stat-${tone || "neutral"}`}>
      <div className="orb-stat-value">{value}</div>
      <div className="orb-stat-label">{label}</div>
    </div>
  );
}

function PinDots({ length, value }) {
  return (
    <div className="orb-pindots">
      {Array.from({ length }).map((_, i) => (
        <span key={i} className={`orb-pindot ${i < value.length ? "filled" : ""}`} />
      ))}
    </div>
  );
}

function Modal({ title, onClose, children, width }) {
  return (
    <div className="orb-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="orb-modal" style={width ? { maxWidth: width } : undefined}>
        <div className="orb-modal-head">
          <h3>{title}</h3>
          <button className="orb-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="orb-modal-body">{children}</div>
      </div>
    </div>
  );
}

function PinField({ value, onChange, autoFocus }) {
  return (
    <input
      className="orb-input orb-input-pin"
      type="text"
      inputMode="numeric"
      maxLength={4}
      autoFocus={autoFocus}
      value={value}
      placeholder="4 digits"
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
    />
  );
}

/* ---------------------------------- Login screen ---------------------------------- */

function LoginScreen({ employees, onLogin, dbOk, onRetryDb, checkingDb }) {
  const [pickedId, setPickedId] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const active = employees.filter((e) => e.active);
  const picked = active.find((e) => e.id === pickedId);

  useEffect(() => {
    if (pickedId && inputRef.current) inputRef.current.focus();
  }, [pickedId]);

  async function submit() {
    if (!picked || pin.length !== 4 || busy) return;
    setBusy(true);
    setError("");

    // [CHANGED] PIN is verified through the Supabase RPC, not against
    // a plaintext `employee.pin` value in browser state.
    const { employee, error: verifyError } = await verifyEmployeePin(picked.id, pin);

    if (verifyError) {
      setError("Unable to verify your PIN right now. Please try again.");
      setShake(true);
      setTimeout(() => setShake(false), 420);
    } else if (!employee) {
      setError("That PIN doesn't match. Try again.");
      setShake(true);
      setPin("");
      setTimeout(() => setShake(false), 420);
    } else {
      onLogin(employee.id);
    }
    setBusy(false);
  }

  return (
    <div className="orb-login">
      <div className="orb-login-rings" aria-hidden="true">
        <svg viewBox="0 0 600 600" width="600" height="600">
          <ellipse cx="300" cy="300" rx="260" ry="110" stroke="#F0A93E" strokeOpacity="0.16" strokeWidth="1.5" fill="none" transform="rotate(-18 300 300)" />
          <ellipse cx="300" cy="300" rx="190" ry="78" stroke="#F0A93E" strokeOpacity="0.22" strokeWidth="1.5" fill="none" transform="rotate(-18 300 300)" />
          <ellipse cx="300" cy="300" rx="120" ry="48" stroke="#F0A93E" strokeOpacity="0.3" strokeWidth="1.5" fill="none" transform="rotate(-18 300 300)" />
        </svg>
      </div>

      <div className="orb-login-card">
        <div className="orb-brand">
          <OrbitMark size={34} />
          <span className="orb-wordmark">Orbital X</span>
        </div>
        <div className="orb-tagline">Intelligence in Motion</div>
        <p className="orb-login-sub">Clock in, log your work, done.</p>

        {!DB_CONFIGURED && (
          <div className="orb-banner orb-banner-warn">
            <div>Not connected to a database yet, so nothing will be saved. Using temporary demo data for now.</div>
          </div>
        )}
        {DB_CONFIGURED && !dbOk && (
          <div className="orb-banner orb-banner-warn">
            <div>Can't reach the database right now, so nothing will be saved this session.</div>
            <button className="orb-link-btn orb-link-btn-warn" onClick={onRetryDb} disabled={checkingDb}>
              <RefreshCw size={13} /> {checkingDb ? "Checking…" : "Retry"}
            </button>
          </div>
        )}

        {!picked ? (
          <div className="orb-employee-grid">
            {active.map((e) => (
              <button key={e.id} className="orb-employee-tile" onClick={() => { setPickedId(e.id); setPin(""); setError(""); }}>
                <span className="orb-avatar">{e.name.slice(0, 1).toUpperCase()}</span>
                <span>{e.name}</span>
                {e.role === "admin" && <span className="orb-badge orb-badge-admin">Admin</span>}
              </button>
            ))}
          </div>
        ) : (
          <div className={`orb-pin-panel ${shake ? "orb-shake" : ""}`}>
            <button className="orb-link-btn orb-back" onClick={() => { setPickedId(null); setPin(""); setError(""); }}>
              <ArrowLeft size={14} /> Not {picked.name}?
            </button>
            <div className="orb-pin-who">
              <span className="orb-avatar">{picked.name.slice(0, 1).toUpperCase()}</span>
              <span>{picked.name}</span>
            </div>
            <label className="orb-field-label" htmlFor="pin-input">Enter your 4-digit PIN</label>
            <input
              id="pin-input"
              ref={inputRef}
              className="orb-pin-input"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(ev) => {
                const v = ev.target.value.replace(/\D/g, "").slice(0, 4);
                setPin(v);
                setError("");
              }}
              onKeyDown={(ev) => { if (ev.key === "Enter" && pin.length === 4) submit(); }}
            />
            <PinDots length={4} value={pin} />
            {error && <div className="orb-error-text">{error}</div>}
            <button className="orb-btn orb-btn-primary orb-btn-block" disabled={pin.length !== 4 || busy} onClick={submit}>
              <LogIn size={16} /> {busy ? "Checking…" : "Sign in"}
            </button>
            <div className="orb-hint">Forgot your PIN? Ask your admin to reset it.</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- Header ---------------------------------- */

function Header({ user, onSignOut, onOpenChangePin, dbOk, onRetryDb, checkingDb }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return (
    <header className="orb-header">
      <div className="orb-brand">
        <OrbitMark size={24} />
        <span className="orb-wordmark orb-wordmark-sm">Orbital X</span>
        {!dbOk && (
          <button className="orb-header-storage-warn" onClick={onRetryDb} disabled={checkingDb} title="Changes aren't being saved. Tap to retry.">
            <RefreshCw size={12} /> {checkingDb ? "Checking…" : "Not saving — retry"}
          </button>
        )}
      </div>
      <div className="orb-header-right">
        <span className="orb-header-clock">
          {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
        <span className="orb-header-user">
          <UserRound size={15} /> {user.name}
          {user.role === "admin" && <span className="orb-badge orb-badge-admin">Admin</span>}
        </span>
        <button className="orb-btn orb-btn-ghost orb-btn-sm" onClick={onOpenChangePin}>
          <KeyRound size={14} /> PIN
        </button>
        <button className="orb-btn orb-btn-ghost orb-btn-sm" onClick={onSignOut}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </header>
  );
}

function ChangePinModal({ user, onClose, onSave }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!/^\d{4}$/.test(current)) { setMsg("Enter your current 4-digit PIN."); return; }
    if (!/^\d{4}$/.test(next)) { setMsg("New PIN must be exactly 4 digits."); return; }
    if (next !== confirm) { setMsg("New PIN and confirmation don't match."); return; }

    setBusy(true);
    setMsg("");
    const { employee, error: verifyError } = await verifyEmployeePin(user.id, current);
    if (verifyError) {
      setMsg("Unable to verify your current PIN.");
      setBusy(false);
      return;
    }
    if (!employee) {
      setMsg("Current PIN is incorrect.");
      setBusy(false);
      return;
    }

    const { data, error } = await callRpc("change_employee_pin", {
      p_employee_id: user.id,
      p_new_pin: next,
    });

    if (error || data !== true) {
      setMsg(error?.message || "Unable to change PIN.");
      setBusy(false);
      return;
    }

    await onSave?.();
    setBusy(false);
    onClose();
  }

  return (
    <Modal title="Change your PIN" onClose={onClose} width={360}>
      <div className="orb-form-col">
        <label className="orb-field-label">Current PIN</label>
        <input className="orb-input" type="password" inputMode="numeric" maxLength={4} value={current}
          onChange={(e) => setCurrent(e.target.value.replace(/\D/g, "").slice(0, 4))} />
        <label className="orb-field-label">New PIN</label>
        <input className="orb-input" type="password" inputMode="numeric" maxLength={4} value={next}
          onChange={(e) => setNext(e.target.value.replace(/\D/g, "").slice(0, 4))} />
        <label className="orb-field-label">Confirm new PIN</label>
        <input className="orb-input" type="password" inputMode="numeric" maxLength={4} value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))} />
        {msg && <div className="orb-error-text">{msg}</div>}
        <button className="orb-btn orb-btn-primary orb-btn-block" disabled={busy} onClick={submit}>
          {busy ? "Saving…" : "Save new PIN"}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------------------------- Tasker: Time Clock ---------------------------------- */

function BreakTimer({ breakInfo, now, onEndBreak }) {
  const elapsedMs = breakMs(breakInfo, now);
  const plannedMs = Math.max(1, breakInfo.plannedMinutes) * 60000;
  const overMs = Math.max(0, elapsedMs - plannedMs);
  const donePct = Math.min(100, (elapsedMs / plannedMs) * 100);
  return (
    <div className="orb-break-timer">
      <div className="orb-break-timer-head">
        <Coffee size={16} /> On break — {fmtHM(elapsedMs)} of {breakInfo.plannedMinutes}m
        {overMs > 0 ? (
          <span className="orb-badge orb-badge-rose-solid">+{fmtHM(overMs)} over</span>
        ) : (
          <span className="orb-badge orb-badge-teal-solid">On track</span>
        )}
      </div>
      <div className="orb-progress-track">
        <div className={`orb-progress-fill ${overMs > 0 ? "over" : ""}`} style={{ width: `${donePct}%` }} />
      </div>
      <button className="orb-btn orb-btn-teal orb-btn-lg orb-btn-block" onClick={onEndBreak}>
        <Check size={16} /> End break
      </button>
    </div>
  );
}

function BreakChip({ b, i, now }) {
  const adherence = b.end ? breakAdherence(b, now) : null;
  const dotClass = !b.end ? "orb-dot-amber" : adherence === "over" ? "orb-dot-rose" : "orb-dot-teal";
  return (
    <span className="orb-break-chip">
      <span className={`orb-dot ${dotClass}`} />
      Break {i + 1}: {fmtTime(b.start)}{b.end ? `–${fmtTime(b.end)}` : " (in progress)"} · {fmtHM(breakMs(b, now))}
      {b.end && (adherence === "over"
        ? <span className="orb-badge orb-badge-rose-solid orb-badge-tiny">Over</span>
        : <span className="orb-badge orb-badge-teal-solid orb-badge-tiny">On time</span>)}
    </span>
  );
}

function LocationToggle({ value, onChange, disabled }) {
  return (
    <div className={`orb-loc-toggle ${disabled ? "disabled" : ""}`}>
      <button
        type="button"
        className={value === "onsite" ? "active" : ""}
        disabled={disabled}
        onClick={() => onChange("onsite")}
      >
        <Home size={14} /> On-site
      </button>
      <button
        type="button"
        className={value === "remote" ? "active" : ""}
        disabled={disabled}
        onClick={() => onChange("remote")}
      >
        <Wifi size={14} /> Remote
      </button>
    </div>
  );
}

// Downscales an uploaded image client-side (max ~700px wide, JPEG) before it's
// stored, so a phone screenshot doesn't balloon the database with a multi-MB file.
function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read that image."));
      img.onload = () => {
        const maxW = 700;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function BalanceSubmitCard({ submissions, onSubmit, readOnly, kesRate }) {
  const now = Date.now();
  const todayKey = localDateKey(new Date(now).toISOString());
  const todaySubmission = sortedSubmissions(submissions).filter((s) => s.date === todayKey).slice(-1)[0] || null;
  const todayEarned = earningsForDay(submissions, todayKey);
  const weekEarned = earningsForWeek(submissions, now);
  const sorted = sortedSubmissions(submissions).slice().reverse();

  const [balance, setBalance] = useState("");
  const [isPoints, setIsPoints] = useState(false);
  const [screenshot, setScreenshot] = useState(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ocrState, setOcrState] = useState("idle"); // idle | checking | match | mismatch | error
  const [ocrFound, setOcrFound] = useState([]);
  const [ocrText, setOcrText] = useState("");
  const [ocrBalance, setOcrBalance] = useState(null);
  const [description, setDescription] = useState("");

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setError("");
    setBusy(true);
    setOcrState("idle");
    try {
      const dataUri = await compressImageFile(file);
      setScreenshot(dataUri);
      setFileName(file.name);
    } catch (err) {
      setError("Couldn't read that image — try a different file.");
    }
    setBusy(false);
  }

  async function runVerify() {
    const n = parseFloat(balance);
    if (!screenshot || isNaN(n)) return;
    setOcrState("checking");
    const result = await verifyBalanceScreenshot(screenshot, n);
    setOcrFound(result.found);
    setOcrState(result.status);
    setOcrText(result.text || "");
    setOcrBalance(result.status === "match" ? (result.matchedValue ?? n) : null);
  }

  async function submit() {
    const n = parseFloat(balance);
    if (isNaN(n) || n < 0) { setError("Enter the balance shown in your screenshot."); return; }
    const finalBalance = isPoints ? n / 100 : n;
    setBusy(true);
    setError("");
    try {
      const result = await onSubmit({
        date: todayKey,
        balance: finalBalance,
        screenshot,
        rawValue: n,
        wasPoints: isPoints,
        ocrStatus: ocrState === "idle" ? null : ocrState,
        ocrBalance,
        ocrText,
        description: description.trim(),
      });
      if (!result?.ok) throw new Error(result?.error || "Could not save this submission.");
      setBalance(""); setScreenshot(null); setFileName(""); setError(""); setIsPoints(false); setOcrState("idle"); setOcrFound([]); setOcrText(""); setOcrBalance(null); setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this submission.");
    } finally {
      setBusy(false);
    }
  }

  const parsedBalance = parseFloat(balance);
  const canVerify = !!screenshot && !isNaN(parsedBalance) && !readOnly;

  return (
    <div className="orb-panel orb-earnings-card">
      <div className="orb-subhead" style={{ marginTop: 0 }}>Earnings</div>
      <div className="orb-stat-row">
        <StatTile label="Today" value={todayEarned === null ? "—" : fmtMoney(todayEarned)} tone="amber" />
        <StatTile label="This week" value={fmtMoney(weekEarned)} tone="neutral" />
      </div>

      <div className="orb-subhead">Your cut</div>
      <div className="orb-table-wrap">
      <table className="orb-table orb-cut-table">
        <thead><tr><th></th><th>Earned</th><th>Tier</th><th>Your cut</th></tr></thead>
        <tbody>
          <tr>
            <td>Today</td>
            <td className="orb-num">{todayEarned === null ? "—" : fmtMoney(todayEarned)}</td>
            <td>{todayEarned === null ? "—" : `${Math.round(cutTierFor(todayEarned).rate * 100)}%`}</td>
            <td className="orb-num">
              {todayEarned === null ? "—" : (
                <>{fmtMoney(cutAmountFor(todayEarned))} <span className="orb-kes">{fmtKES(cutAmountFor(todayEarned), kesRate)}</span></>
              )}
            </td>
          </tr>
          <tr>
            <td>This week</td>
            <td className="orb-num">{fmtMoney(weekEarned)}</td>
            <td>{`${Math.round(cutTierFor(weekEarned).rate * 100)}%`}</td>
            <td className="orb-num">
              {fmtMoney(cutAmountFor(weekEarned))} <span className="orb-kes">{fmtKES(cutAmountFor(weekEarned), kesRate)}</span>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
      <div className="orb-hint">
        Payout tiers: {CUT_TIERS.map((t) => `${t.label} → ${Math.round(t.rate * 100)}%`).join(" · ")}. Based on the total earned for that period, the tier applies to the whole amount.
      </div>

      {!readOnly && (
        <>
          <div className="orb-hint">
            Submit a screenshot of your account balance and today's total, once a day, after your shift. We'll work out what you earned from the change since your last submission.
          </div>

          <div className="orb-earnings-form">
            <label className="orb-btn orb-btn-ghost-dark orb-btn-sm orb-file-btn">
              <input type="file" accept="image/*" onChange={handleFile} hidden />
              {fileName ? "Change screenshot" : "Attach screenshot"}
            </label>
            {fileName && <span className="orb-file-name">{fileName}</span>}
            <input
              className="orb-input orb-input-narrow"
              type="number" step="0.01" min="0"
              placeholder={isPoints ? "Balance (points)" : "Balance ($)"}
              value={balance}
              onChange={(e) => { setBalance(e.target.value); setOcrState("idle"); }}
            />
            <input
              className="orb-input orb-input-narrow"
              type="text" maxLength={60}
              placeholder="Description (e.g. Attapoll, Survey Junkie)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <button className="orb-btn orb-btn-primary orb-btn-sm" disabled={busy} onClick={submit}>
              {todaySubmission ? "Update today" : "Submit"}
            </button>
          </div>

          <label className="orb-points-toggle">
            <input type="checkbox" checked={isPoints} onChange={(e) => { setIsPoints(e.target.checked); setOcrState("idle"); }} />
            This account pays in points, not dollars (like Survey Junkie) — divide by 100
          </label>
          {isPoints && !isNaN(parsedBalance) && (
            <div className="orb-hint">{balance} points → {fmtMoney(parsedBalance / 100)}</div>
          )}

          {screenshot && (
            <div className="orb-verify-row">
              <img src={screenshot} alt="Balance screenshot preview" className="orb-screenshot-preview" />
              <div className="orb-verify-controls">
                <button className="orb-btn orb-btn-ghost-dark orb-btn-sm" disabled={!canVerify || ocrState === "checking"} onClick={runVerify}>
                  {ocrState === "checking" ? "Checking screenshot…" : "Verify screenshot matches"}
                </button>
                {ocrState === "match" && (
                  <span className="orb-badge orb-badge-teal-solid">Matches your screenshot</span>
                )}
                {ocrState === "mismatch" && (
                  <span className="orb-badge orb-badge-rose-solid">
                    Didn't find {balance} in the screenshot{ocrFound.length ? ` — saw ${ocrFound.slice(0, 3).join(", ")}` : ""}. Double-check before submitting.
                  </span>
                )}
                {ocrState === "error" && (
                  <span className="orb-badge orb-badge-muted">Couldn't check automatically, submit as normal</span>
                )}
              </div>
            </div>
          )}
          {error && <div className="orb-error-text">{error}</div>}
        </>
      )}

      {sorted.length > 0 && sorted[sorted.length - 1]?.screenshot && (
        <div className="orb-balance-latest-screenshot">
          <div className="orb-subhead">
            Latest screenshot
            {sorted[sorted.length - 1]?.description && (
              <span className="orb-hist-note"> — {sorted[sorted.length - 1].description}</span>
            )}
          </div>
          <img src={sorted[sorted.length - 1].screenshot} alt="Latest saved balance screenshot" className="orb-screenshot-preview" />
        </div>
      )}
      {sorted.length > 0 && (
        <div className="orb-balance-history">
          {sorted.slice(0, 7).map((s) => {
            const earned = earningsForDay(submissions, s.date);
            return (
              <div key={s.id} className="orb-balance-row">
                <span>
                  {fmtDayHeading(s.date)}
                  {s.description && <span className="orb-hist-note"> — {s.description}</span>}
                </span>
                <span className="orb-num">
                  {fmtMoney(s.balance)} balance
                  {s.wasPoints && <span className="orb-hist-note"> ({s.rawValue} pts ÷ 100)</span>}
                </span>
                <span className="orb-num">{earned === null ? "baseline" : fmtMoney(earned)}</span>
                {s.ocrStatus === "match" && <CheckCircle2 size={13} className="orb-verify-icon-ok" />}
                {s.ocrStatus === "mismatch" && <AlertTriangle size={13} className="orb-verify-icon-warn" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TimeClockTab({ sessions, breakMinutes, onClockIn, onClockOut, onStartBreak, onEndBreak, balanceSubmissions, onSubmitBalance, readOnly, kesRate }) {
  const [note, setNote] = useState("");
  const [location, setLocation] = useState("onsite");
  const [tick, setTick] = useState(Date.now());
  const openSession = sessions.find((s) => !s.clockOut);
  const openBreak = openSession ? (openSession.breaks || []).find((b) => !b.end) : null;

  useEffect(() => {
    if (!openSession) return;
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [openSession]);

  const now = tick;
  const todaySessions = sessions.filter((s) => isSameLocalDay(s.clockIn, now));
  const todayMs = todaySessions.reduce((sum, s) => sum + sessionNetMs(s, now), 0);
  const weekStart = startOfWeek(now).getTime(), weekEnd = endOfWeek(now).getTime();
  const weekSessions = sessions.filter((s) => { const t = new Date(s.clockIn).getTime(); return t >= weekStart && t <= weekEnd; });
  const weekMs = weekSessions.reduce((sum, s) => sum + sessionNetMs(s, now), 0);

  const netElapsedMs = openSession ? sessionNetMs(openSession, now) : 0;
  const fractionOfHour = (netElapsedMs % 3600000) / 3600000;
  const elapsedLabel = openSession
    ? `${Math.floor(netElapsedMs / 3600000)}:${String(Math.floor((netElapsedMs % 3600000) / 60000)).padStart(2, "0")}:${String(Math.floor((netElapsedMs % 60000) / 1000)).padStart(2, "0")}`
    : "—";

  let secondary = "Not clocked in";
  if (openSession && openBreak) secondary = "On break";
  else if (openSession) secondary = `On since ${fmtTime(openSession.clockIn)}`;

  const breaksTaken = openSession ? (openSession.breaks || []).length : 0;
  const breaksRemaining = Math.max(0, 2 - breaksTaken);

  return (
    <div className="orb-panel">
      <div className="orb-clock-top">
        <OrbitDial active={!!openSession} paused={!!openBreak} fractionOfHour={fractionOfHour} primary={elapsedLabel} secondary={secondary} />
        <div className="orb-clock-actions">
          {readOnly ? (
            openSession ? (
              <div className="orb-current-loc">
                {openSession.location === "remote" ? <Wifi size={13} /> : <Home size={13} />}
                Working {openSession.location === "remote" ? "remote" : "on-site"}{openBreak ? " · on break" : ""}
              </div>
            ) : (
              <div className="orb-hint">Not currently clocked in.</div>
            )
          ) : !openSession ? (
            <>
              <button className="orb-btn orb-btn-primary orb-btn-lg" onClick={() => onClockIn(location)}>
                <LogIn size={18} /> Clock in
              </button>
              <div>
                <label className="orb-field-label">Working from</label>
                <LocationToggle value={location} onChange={setLocation} />
              </div>
            </>
          ) : openBreak ? (
            <BreakTimer breakInfo={openBreak} now={now} onEndBreak={onEndBreak} />
          ) : (
            <>
              <button className="orb-btn orb-btn-danger orb-btn-lg" onClick={() => { onClockOut(note); setNote(""); }}>
                <LogOut size={18} /> Clock out
              </button>
              <div className="orb-current-loc">
                {openSession.location === "remote" ? <Wifi size={13} /> : <Home size={13} />}
                Working {openSession.location === "remote" ? "remote" : "on-site"}
              </div>
              <div className="orb-note-field">
                <label className="orb-field-label">Note (optional)</label>
                <input className="orb-input" placeholder="What are you working on?" value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="orb-hint">Saved to the session when you clock out.</div>
              </div>
            </>
          )}
        </div>
      </div>

      {openSession && (
        <div className="orb-breaks-bar">
          <div className="orb-breaks-status">
            <Coffee size={14} /> Breaks: {breaksTaken} of 2 taken · {breakMinutes} min each
          </div>
          {!readOnly && !openBreak && breaksRemaining > 0 && (
            <button className="orb-btn orb-btn-ghost-dark orb-btn-sm" onClick={onStartBreak}>
              <Coffee size={13} /> Start break
            </button>
          )}
          {breaksTaken > 0 && (
            <div className="orb-break-history">
              {openSession.breaks.map((b, i) => <BreakChip key={b.id} b={b} i={i} now={now} />)}
            </div>
          )}
        </div>
      )}

      <div className="orb-stat-row">
        <StatTile label="Today" value={fmtHM(todayMs)} tone="amber" />
        <StatTile label="This week" value={fmtHM(weekMs)} tone="neutral" />
        <StatTile label="Sessions today" value={todaySessions.length} tone="neutral" />
      </div>

      <div className="orb-subhead">Today's sessions</div>
      {todaySessions.length === 0 ? (
        <div className="orb-empty">No sessions yet today. Clock in when you start working.</div>
      ) : (
        <div className="orb-table-wrap">
        <table className="orb-table">
          <thead><tr><th>In</th><th>Out</th><th>Where</th><th>Breaks</th><th>Worked</th><th>Note</th></tr></thead>
          <tbody>
            {todaySessions.slice().reverse().map((s) => (
              <tr key={s.id}>
                <td>{fmtTime(s.clockIn)}</td>
                <td>{s.clockOut ? fmtTime(s.clockOut) : <span className="orb-badge orb-badge-live">In progress</span>}</td>
                <td>{s.location === "remote" ? "Remote" : "On-site"}</td>
                <td className="orb-num">
                  {(s.breaks || []).length ? (
                    <span className={(s.breaks || []).some((b) => b.end && breakAdherence(b, now) === "over") ? "orb-text-rose" : "orb-text-teal"}>
                      {s.breaks.length} · {fmtHM(sessionBreaksMs(s, now))}
                    </span>
                  ) : "—"}
                </td>
                <td className="orb-num">{fmtHM(sessionNetMs(s, now))}</td>
                <td className="orb-note-cell">{s.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <BalanceSubmitCard submissions={balanceSubmissions} onSubmit={onSubmitBalance} readOnly={readOnly} kesRate={kesRate} />
    </div>
  );
}

/* ---------------------------------- Tasker: Survey Log ---------------------------------- */

function SurveyLogTab({ liveEntries, importedWeeks, onLog, onDeleteEntry, readOnly }) {
  const now = Date.now();
  const weekStart = startOfWeek(now).getTime(), weekEnd = endOfWeek(now).getTime();
  const currentWeekEntries = liveEntries
    .filter((e) => { const t = new Date(e.ts).getTime(); return t >= weekStart && t <= weekEnd; })
    .sort((a, b) => new Date(b.ts) - new Date(a.ts));

  const successful = currentWeekEntries.filter((e) => e.result === "successful").length;
  const screenedOut = currentWeekEntries.filter((e) => e.result === "screened_out").length;
  const total = successful + screenedOut;

  const pastLiveWeeks = useMemo(() => {
    const map = new Map();
    liveEntries.forEach((e) => {
      const t = new Date(e.ts).getTime();
      if (t >= weekStart) return;
      const key = startOfWeek(e.ts).getTime();
      if (!map.has(key)) map.set(key, { sortKey: key, label: weekLabel(e.ts), successful: 0, screenedOut: 0 });
      const g = map.get(key);
      if (e.result === "successful") g.successful++; else g.screenedOut++;
    });
    return Array.from(map.values());
  }, [liveEntries, weekStart]);

  const historyRows = [
    ...pastLiveWeeks,
    ...importedWeeks.map((w, i) => ({ sortKey: i, label: `${w.label} (imported)`, successful: w.successful, screenedOut: w.screenedOut })),
  ].sort((a, b) => b.sortKey - a.sortKey);

  return (
    <div className="orb-panel">
      <div className="orb-subhead">{weekLabel(now)}</div>
      <div className="orb-stat-row">
        <StatTile label="Total logged" value={total} tone="neutral" />
        <StatTile label="Successful" value={successful} tone="teal" />
        <StatTile label="Screened out" value={screenedOut} tone="rose" />
        <StatTile label="Success rate" value={`${pct(successful, total)}%`} tone="amber" />
      </div>

      {!readOnly && (
        <div className="orb-log-buttons">
          <button className="orb-btn orb-btn-teal orb-btn-lg" onClick={() => onLog("successful")}>
            <CheckCircle2 size={18} /> Log successful
          </button>
          <button className="orb-btn orb-btn-rose orb-btn-lg" onClick={() => onLog("screened_out")}>
            <XCircle size={18} /> Log screened out
          </button>
        </div>
      )}

      <div className="orb-subhead">This week's entries</div>
      {currentWeekEntries.length === 0 ? (
        <div className="orb-empty">No surveys logged yet this week.</div>
      ) : (
        <div className="orb-entry-list">
          {currentWeekEntries.map((e) => (
            <div key={e.id} className="orb-entry-row">
              <span className={`orb-dot ${e.result === "successful" ? "orb-dot-teal" : "orb-dot-rose"}`} />
              <span className="orb-entry-result">{e.result === "successful" ? "Successful" : "Screened out"}</span>
              <span className="orb-entry-time">{fmtTime(e.ts)}</span>
              {!readOnly && (
                <button className="orb-icon-btn orb-icon-btn-danger" onClick={() => onDeleteEntry(e.id)} aria-label="Remove entry">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="orb-subhead">Past weeks</div>
      {historyRows.length === 0 ? (
        <div className="orb-empty">No earlier weeks on record yet.</div>
      ) : (
        <div className="orb-table-wrap">
        <table className="orb-table">
          <thead><tr><th>Week</th><th>Total</th><th>Successful</th><th>Screened out</th><th>Rate</th></tr></thead>
          <tbody>
            {historyRows.map((w, i) => (
              <tr key={i}>
                <td>{w.label}</td>
                <td className="orb-num">{w.successful + w.screenedOut}</td>
                <td className="orb-num">{w.successful}</td>
                <td className="orb-num">{w.screenedOut}</td>
                <td className="orb-num">{pct(w.successful, w.successful + w.screenedOut)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Tasker: My History ---------------------------------- */

function MyHistoryTab({ sessions }) {
  const now = Date.now();
  const weeklyMap = useMemo(() => {
    const map = new Map();
    sessions.forEach((s) => {
      const key = startOfWeek(s.clockIn).getTime();
      if (!map.has(key)) map.set(key, { sortKey: key, label: weekLabel(s.clockIn), ms: 0, breakMs: 0 });
      const g = map.get(key);
      g.ms += sessionNetMs(s, now);
      g.breakMs += sessionBreaksMs(s, now);
    });
    return Array.from(map.values()).sort((a, b) => b.sortKey - a.sortKey);
  }, [sessions]);

  const dayGroups = useMemo(() => groupSessionsByDay(sessions), [sessions]);

  return (
    <div className="orb-panel">
      <div className="orb-subhead">Weekly totals</div>
      {weeklyMap.length === 0 ? (
        <div className="orb-empty">No sessions recorded yet.</div>
      ) : (
        <div className="orb-table-wrap">
        <table className="orb-table">
          <thead><tr><th>Week</th><th>Worked</th><th>Break time</th></tr></thead>
          <tbody>
            {weeklyMap.map((w, i) => (
              <tr key={i}><td>{w.label}</td><td className="orb-num">{fmtHM(w.ms)}</td><td className="orb-num">{fmtHM(w.breakMs)}</td></tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <div className="orb-subhead">Day by day</div>
      {dayGroups.length === 0 ? (
        <div className="orb-empty">Nothing logged yet.</div>
      ) : (
        <div className="orb-day-groups">
          {dayGroups.map((day) => {
            const dayNet = day.sessions.reduce((sum, s) => sum + sessionNetMs(s, now), 0);
            const dayBreaks = day.sessions.flatMap((s) => s.breaks || []);
            return (
              <div key={day.dateKey} className="orb-day-card">
                <div className="orb-day-card-head">
                  <span>{day.heading}</span>
                  <span className="orb-num">{fmtHM(dayNet)} worked</span>
                </div>
                <div className="orb-table-wrap">
                <table className="orb-table">
                  <thead><tr><th>In</th><th>Out</th><th>Where</th><th>Worked</th><th>Note</th></tr></thead>
                  <tbody>
                    {day.sessions.map((s) => (
                      <tr key={s.id}>
                        <td>{fmtTime(s.clockIn)}</td>
                        <td>{s.clockOut ? fmtTime(s.clockOut) : <span className="orb-badge orb-badge-live">In progress</span>}</td>
                        <td>{s.location === "remote" ? "Remote" : "On-site"}</td>
                        <td className="orb-num">{fmtHM(sessionNetMs(s, now))}</td>
                        <td className="orb-note-cell">{s.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                {dayBreaks.length > 0 && (
                  <div className="orb-break-history orb-day-breaks">
                    {dayBreaks.map((b, i) => <BreakChip key={b.id} b={b} i={i} now={now} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Tasker view shell ---------------------------------- */

function ShiftRow({ shift }) {
  const isNight = shift.shiftType === "night";
  return (
    <div className={`orb-shift-row ${isNight ? "night" : "day"}`}>
      {isNight ? <Moon size={15} /> : <Sun size={15} />}
      <span className="orb-shift-date">{fmtDayHeading(shift.date)}</span>
      <span className="orb-badge orb-badge-tiny orb-shift-badge">{isNight ? "Night shift" : "Day shift"}</span>
      {(shift.startTime || shift.endTime) && (
        <span className="orb-shift-time">{shift.startTime || "—"}{"–"}{shift.endTime || "—"}</span>
      )}
      {shift.notes && <span className="orb-shift-notes">{shift.notes}</span>}
    </div>
  );
}

function ScheduleTab({ shifts }) {
  const todayKey = localDateKey(new Date().toISOString());
  const upcoming = shifts.filter((s) => s.date >= todayKey).sort((a, b) => (a.date < b.date ? -1 : 1));
  const past = shifts.filter((s) => s.date < todayKey).sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="orb-panel">
      <div className="orb-subhead">Upcoming shifts</div>
      {upcoming.length === 0 ? (
        <div className="orb-empty">No upcoming shifts scheduled yet. Check back or ask your admin.</div>
      ) : (
        <div className="orb-shift-list">
          {upcoming.map((s) => <ShiftRow key={s.id} shift={s} />)}
        </div>
      )}

      <div className="orb-subhead">Past shifts</div>
      {past.length === 0 ? (
        <div className="orb-empty">No past shifts on record.</div>
      ) : (
        <div className="orb-shift-list">
          {past.slice(0, 20).map((s) => <ShiftRow key={s.id} shift={s} />)}
        </div>
      )}
    </div>
  );
}

const HOUR_LABELS = Array.from({ length: 10 }, (_, i) => `Hour ${i + 1}`);
const TASK_LABELS = Array.from({ length: 10 }, (_, i) => `Task ${i + 1}`);
const WEEKDAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function weekDatesForOffset(now, offset) {
  const start = startOfWeek(now);
  start.setDate(start.getDate() + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return localDateKey(d.toISOString());
  });
}

function TaskLogTab({ taskLogs, onToggleCell, onDuplicateWeeks, readOnly }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const dates = useMemo(() => weekDatesForOffset(Date.now(), weekOffset), [weekOffset]);
  const todayKey = localDateKey(new Date().toISOString());
  const [selectedDate, setSelectedDate] = useState(dates[0]);
  const [copyCount, setCopyCount] = useState(4);
  const [confirmCopy, setConfirmCopy] = useState(false);

  useEffect(() => {
    // Keep the selected day valid (same weekday index) when the week changes.
    const idx = Math.max(0, dates.findIndex((d) => d === selectedDate));
    setSelectedDate(dates[Math.min(6, Math.max(0, idx === -1 ? 0 : idx))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  const grid = (taskLogs.find((t) => t.date === selectedDate) || {}).grid || emptyTaskGrid();
  const filledCount = grid.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  const weekLabelText = `Week ${weekOffset + 1}${weekOffset === 0 ? " (this week)" : ""}`;

  function submitDuplicate() {
    onDuplicateWeeks(weekOffset, copyCount);
    setConfirmCopy(false);
  }

  return (
    <div className="orb-panel">
      <div className="orb-hint">
        Mark which task/account you worked on during each hour, {WEEKDAY_LABELS[0]}–{WEEKDAY_LABELS[6]}.
      </div>

      <div className="orb-week-nav">
        <button className="orb-icon-btn" disabled={weekOffset === 0} onClick={() => setWeekOffset((w) => Math.max(0, w - 1))} aria-label="Previous week">
          <ChevronLeft size={16} />
        </button>
        <span className="orb-week-label">{weekLabelText}</span>
        <button className="orb-icon-btn" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Next week">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="orb-segment orb-day-picker">
        {dates.map((d, i) => (
          <button key={d} className={selectedDate === d ? "active" : ""} onClick={() => setSelectedDate(d)}>
            {WEEKDAY_LABELS[i].slice(0, 3)}{d === todayKey ? " •" : ""}
          </button>
        ))}
      </div>
      <div className="orb-subhead">{fmtDayHeading(selectedDate)} — {filledCount} of 100 marked</div>
      <div className="orb-task-grid-wrap">
        <table className="orb-task-grid">
          <thead>
            <tr>
              <th></th>
              {TASK_LABELS.map((t, ti) => <th key={ti}>{`T${ti + 1}`}</th>)}
            </tr>
          </thead>
          <tbody>
            {HOUR_LABELS.map((h, hi) => (
              <tr key={hi}>
                <th>{`H${hi + 1}`}</th>
                {TASK_LABELS.map((t, ti) => (
                  <td key={ti}>
                    <input
                      type="checkbox"
                      disabled={readOnly}
                      checked={!!(grid[hi] && grid[hi][ti])}
                      onChange={() => onToggleCell(selectedDate, hi, ti)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <div className="orb-duplicate-card">
          <div className="orb-subhead" style={{ marginTop: 0 }}>Copy this week forward</div>
          {!confirmCopy ? (
            <div className="orb-duplicate-row">
              <span>Duplicate {weekLabelText}'s grid to the next</span>
              <input
                className="orb-input orb-input-narrow"
                type="number" min="1" max="12"
                value={copyCount}
                onChange={(e) => setCopyCount(Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 1)))}
              />
              <span>week(s)</span>
              <button className="orb-btn orb-btn-ghost-dark orb-btn-sm" onClick={() => setConfirmCopy(true)}>Duplicate</button>
            </div>
          ) : (
            <div className="orb-duplicate-row">
              <span className="orb-text-rose">This replaces anything already entered in week{copyCount > 1 ? "s" : ""} {weekOffset + 2}{copyCount > 1 ? `–${weekOffset + 1 + copyCount}` : ""}. Continue?</span>
              <button className="orb-btn orb-btn-primary orb-btn-sm" onClick={submitDuplicate}>Yes, duplicate</button>
              <button className="orb-btn orb-btn-ghost-dark orb-btn-sm" onClick={() => setConfirmCopy(false)}>Cancel</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Tasker view shell ---------------------------------- */

function TaskerView({ user, sessions, surveys, shifts, taskLogs, breakMinutes, balanceSubmissions, onClockIn, onClockOut, onStartBreak, onEndBreak, onLogSurvey, onDeleteSurvey, onToggleTaskCell, onSubmitBalance, onDuplicateTaskWeeks, readOnly, kesRate }) {
  const [tab, setTab] = useState("clock");
  const importedWeeks = IMPORTED_SURVEY_HISTORY[user.id] || [];
  return (
    <div className="orb-body">
      <div className="orb-tabs">
        <button className={`orb-tab ${tab === "clock" ? "active" : ""}`} onClick={() => setTab("clock")}>
          <Clock size={15} /> Time clock
        </button>
        <button className={`orb-tab ${tab === "surveys" ? "active" : ""}`} onClick={() => setTab("surveys")}>
          <ClipboardList size={15} /> Survey log
        </button>
        <button className={`orb-tab ${tab === "tasklog" ? "active" : ""}`} onClick={() => setTab("tasklog")}>
          <Grid3x3 size={15} /> Task log
        </button>
        <button className={`orb-tab ${tab === "schedule" ? "active" : ""}`} onClick={() => setTab("schedule")}>
          <CalendarDays size={15} /> My schedule
        </button>
        <button className={`orb-tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
          <BarChart3 size={15} /> My history
        </button>
      </div>
      {tab === "clock" && (
        <TimeClockTab
          sessions={sessions}
          breakMinutes={breakMinutes}
          onClockIn={onClockIn}
          onClockOut={onClockOut}
          onStartBreak={onStartBreak}
          onEndBreak={onEndBreak}
          balanceSubmissions={balanceSubmissions}
          onSubmitBalance={onSubmitBalance}
          readOnly={readOnly}
          kesRate={kesRate}
        />
      )}
      {tab === "surveys" && (
        <SurveyLogTab liveEntries={surveys} importedWeeks={importedWeeks} onLog={onLogSurvey} onDeleteEntry={onDeleteSurvey} readOnly={readOnly} />
      )}
      {tab === "tasklog" && (
        <TaskLogTab taskLogs={taskLogs} onToggleCell={onToggleTaskCell} onDuplicateWeeks={onDuplicateTaskWeeks} readOnly={readOnly} />
      )}
      {tab === "schedule" && <ScheduleTab shifts={shifts} />}
      {tab === "history" && <MyHistoryTab sessions={sessions} />}
    </div>
  );

}

/* ---------------------------------- Admin: Overview ---------------------------------- */

function OverviewTab({ employees, timeLogs, surveys, balanceSubmissions }) {
  const now = Date.now();
  const weekStart = startOfWeek(now).getTime(), weekEnd = endOfWeek(now).getTime();
  const taskers = employees.filter((e) => e.role !== "admin");
  const todayKey = localDateKey(new Date(now).toISOString());

  let todayHours = 0, weekHours = 0, todaySurveys = 0, weekSurveys = 0, todaySuccess = 0, weekSuccess = 0;
  let teamEarnedToday = 0, teamEarnedWeek = 0;
  taskers.forEach((emp) => {
    const sessions = timeLogs[emp.id] || [];
    sessions.forEach((s) => {
      const ms = sessionNetMs(s, now);
      if (isSameLocalDay(s.clockIn, now)) todayHours += ms;
      const t = new Date(s.clockIn).getTime();
      if (t >= weekStart && t <= weekEnd) weekHours += ms;
    });
    const entries = surveys[emp.id] || [];
    entries.forEach((e) => {
      const t = new Date(e.ts).getTime();
      if (isSameLocalDay(e.ts, now)) { todaySurveys++; if (e.result === "successful") todaySuccess++; }
      if (t >= weekStart && t <= weekEnd) { weekSurveys++; if (e.result === "successful") weekSuccess++; }
    });
    const subs = balanceSubmissions[emp.id] || [];
    const earnedToday = earningsForDay(subs, todayKey);
    if (earnedToday) teamEarnedToday += earnedToday;
    teamEarnedWeek += earningsForWeek(subs, now);
  });

  return (
    <div className="orb-panel">
      <div className="orb-stat-row">
        <StatTile label="Team hours today" value={fmtHM(todayHours)} tone="amber" />
        <StatTile label="Team hours this week" value={fmtHM(weekHours)} tone="neutral" />
        <StatTile label="Surveys today" value={todaySurveys} tone="neutral" />
        <StatTile label="Surveys this week" value={weekSurveys} tone="neutral" />
      </div>
      <div className="orb-stat-row">
        <StatTile label="Success rate today" value={`${pct(todaySuccess, todaySurveys)}%`} tone="teal" />
        <StatTile label="Success rate this week" value={`${pct(weekSuccess, weekSurveys)}%`} tone="teal" />
        <StatTile label="Team earned today" value={fmtMoney(teamEarnedToday)} tone="amber" />
        <StatTile label="Team earned this week" value={fmtMoney(teamEarnedWeek)} tone="amber" />
      </div>

      <div className="orb-subhead">Team status right now</div>
      <div className="orb-roster">
        {taskers.length === 0 && <div className="orb-empty">No taskers yet, add your team under Employees.</div>}
        {taskers.map((emp) => {
          const sessions = timeLogs[emp.id] || [];
          const open = sessions.find((s) => !s.clockOut);
          const onBreak = open && (open.breaks || []).some((b) => !b.end);
          const subs = balanceSubmissions[emp.id] || [];
          const earnedToday = earningsForDay(subs, todayKey);
          const earnedWeek = earningsForWeek(subs, now);
          return (
            <div key={emp.id} className="orb-roster-row">
              <span className={`orb-dot ${onBreak ? "orb-dot-amber" : open ? "orb-dot-teal" : "orb-dot-muted"}`} />
              <span className="orb-avatar orb-avatar-sm">{emp.name.slice(0, 1).toUpperCase()}</span>
              <span className="orb-roster-name">{emp.name}</span>
              {!emp.active && <span className="orb-badge orb-badge-muted">Inactive</span>}
              <span className="orb-roster-status">
                {onBreak ? "On break" : open ? `Clocked in since ${fmtTime(open.clockIn)}` : "Not clocked in"}
              </span>
              <span className="orb-roster-earnings">
                {earnedToday === null ? "No update today" : `${fmtMoney(earnedToday)} today`} · {fmtMoney(earnedWeek)} wk
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------- Admin: Employees ---------------------------------- */

function EmployeesTab({ employees, onAdd, onSetPin, onToggleActive, onDelete, onChangeRole }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("tasker");
  const [pin, setPin] = useState(genPin());
  const [addMsg, setAddMsg] = useState("");
  const [confirmId, setConfirmId] = useState(null);
  const [pinEditId, setPinEditId] = useState(null);
  const [pinDraft, setPinDraft] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [deleteTyped, setDeleteTyped] = useState("");

  function submitAdd() {
    if (!name.trim() || !/^\d{4}$/.test(pin)) return;
    onAdd(name.trim(), role, pin);
    setAddMsg(`Added ${name.trim()}. Give them their new PIN separately.`);
    setName("");
    setRole("tasker");
    setPin(genPin());
    setTimeout(() => setAddMsg(""), 4000);
  }

  function startPinEdit(emp) {
    setPinEditId(emp.id);
    setPinDraft("");
    setPinMsg("");
  }

  async function savePinEdit(emp) {
    if (!/^\d{4}$/.test(pinDraft)) {
      setPinMsg("PIN must be exactly 4 digits.");
      return;
    }
    setPinMsg("Saving…");
    const ok = await onSetPin(emp.id, pinDraft);
    if (ok !== false) {
      setPinMsg("PIN changed successfully.");
      setTimeout(() => {
        setPinEditId(null);
        setPinMsg("");
      }, 900);
    } else {
      setPinMsg("PIN could not be changed. Check the database/RPC permissions.");
    }
  }

  const adminCount = employees.filter((e) => e.role === "admin" && e.active).length;

  return (
    <div className="orb-panel">
      <div className="orb-subhead">Add a team member</div>
      <div className="orb-add-row orb-add-row-pin">
        <input className="orb-input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="orb-input" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="tasker">Tasker</option>
          <option value="admin">Admin</option>
        </select>
        <PinField value={pin} onChange={setPin} />
        <button className="orb-icon-btn" title="Generate a new PIN" onClick={() => setPin(genPin())}><RefreshCw size={14} /></button>
        <button className="orb-btn orb-btn-primary" disabled={!name.trim() || !/^\d{4}$/.test(pin)} onClick={submitAdd}><Plus size={15} /> Add</button>
      </div>
      <div className="orb-hint">New employee PIN: set it here or generate one, then give it to the employee. The PIN is not stored in browser employee data.</div>
      {addMsg && <div className="orb-banner orb-banner-info" style={{ marginTop: 10 }}>{addMsg}</div>}

      <div className="orb-subhead">Existing employees</div>
      <div className="orb-hint">Use the controls below to manage an existing employee. <strong>Change PIN</strong> changes their sign-in PIN without displaying or storing the PIN in the employee table.</div>
      <div className="orb-table-wrap">
      <table className="orb-table">
        <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {employees.map((e) => {
            const isLastAdmin = e.role === "admin" && e.active && adminCount <= 1;
            return (
              <React.Fragment key={e.id}>
                <tr>
                  <td>
                    <div style={{ fontWeight: 600 }}>{e.name}</div>
                    <div className="orb-hint" style={{ marginTop: 2 }}>ID: {e.id}</div>
                  </td>
                  <td>
                    <select
                      className="orb-input"
                      value={e.role}
                      onChange={(event) => onChangeRole(e.id, event.target.value)}
                      style={{ minWidth: 110 }}
                    >
                      <option value="tasker">Tasker</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    <span className={`orb-badge ${e.active ? "orb-badge-live" : "orb-badge-muted"}`}>
                      {e.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="orb-row-actions">
                    <button className="orb-btn orb-btn-primary orb-btn-sm" onClick={() => startPinEdit(e)}>
                      <KeyRound size={13} /> Change PIN
                    </button>
                    {confirmId === e.id ? (
                      <>
                        <button className="orb-btn orb-btn-ghost orb-btn-sm" onClick={() => { onToggleActive(e.id); setConfirmId(null); }}>
                          <Check size={13} /> Confirm
                        </button>
                        <button className="orb-btn orb-btn-ghost orb-btn-sm" onClick={() => setConfirmId(null)}>
                          <X size={13} /> Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className="orb-btn orb-btn-ghost orb-btn-sm"
                        disabled={isLastAdmin}
                        title={isLastAdmin ? "At least one active admin is required" : ""}
                        onClick={() => setConfirmId(e.id)}
                      >
                        {e.active ? "Deactivate" : "Reactivate"}
                      </button>
                    )}
                    {e.role !== "admin" && (
                      <button
                        className="orb-btn orb-btn-danger orb-btn-sm"
                        onClick={() => { setDeleteId(e.id); setDeleteTyped(""); }}
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    )}
                  </td>
                </tr>
                {pinEditId === e.id && (
                  <tr className="orb-edit-row">
                    <td colSpan={4}>
                      <div className="orb-pin-edit-row">
                        <strong>Change sign-in PIN for {e.name}</strong>
                        <PinField value={pinDraft} onChange={setPinDraft} autoFocus />
                        <button className="orb-icon-btn" title="Generate a new PIN" onClick={() => setPinDraft(genPin())}><RefreshCw size={14} /></button>
                        <button className="orb-btn orb-btn-primary orb-btn-sm" disabled={!/^\d{4}$/.test(pinDraft) || pinMsg === "Saving…"} onClick={() => savePinEdit(e)}>
                          <Check size={13} /> Save PIN
                        </button>
                        <button className="orb-btn orb-btn-ghost orb-btn-sm" onClick={() => { setPinEditId(null); setPinMsg(""); }}>
                          <X size={13} /> Cancel
                        </button>
                      </div>
                      {pinMsg && <div className="orb-hint">{pinMsg}</div>}
                    </td>
                  </tr>
                )}
                {deleteId === e.id && (
                  <tr className="orb-edit-row orb-delete-row">
                    <td colSpan={4}>
                      <div className="orb-error-text" style={{ margin: "0 0 8px" }}>
                        This permanently deletes {e.name} and all of their time logs, breaks, survey history, earnings, shifts, and task logs. This cannot be undone.
                      </div>
                      <div className="orb-pin-edit-row">
                        <span>Type <strong>{e.name}</strong> to confirm:</span>
                        <input className="orb-input" value={deleteTyped} onChange={(ev) => setDeleteTyped(ev.target.value)} autoFocus />
                        <button
                          className="orb-btn orb-btn-danger orb-btn-sm"
                          disabled={deleteTyped.trim() !== e.name}
                          onClick={() => { onDelete(e.id); setDeleteId(null); setDeleteTyped(""); }}
                        >
                          <Trash2 size={13} /> Delete permanently
                        </button>
                        <button className="orb-btn orb-btn-ghost orb-btn-sm" onClick={() => { setDeleteId(null); setDeleteTyped(""); }}>
                          <X size={13} /> Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/* ---------------------------------- Admin: Time Logs ---------------------------------- */

function TimeLogsTab({ employees, timeLogs, onSaveSession, onDeleteSession }) {
  const [empFilter, setEmpFilter] = useState("all");
  const [range, setRange] = useState("week");
  const [editing, setEditing] = useState(null);
  const [editIn, setEditIn] = useState("");
  const [editOut, setEditOut] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editError, setEditError] = useState("");

  const now = Date.now();
  const weekStart = startOfWeek(now).getTime();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

  const rows = [];
  employees.forEach((emp) => {
    if (empFilter !== "all" && empFilter !== emp.id) return;
    (timeLogs[emp.id] || []).forEach((s) => {
      const t = new Date(s.clockIn).getTime();
      if (range === "week" && t < weekStart) return;
      if (range === "month" && t < monthStart) return;
      rows.push({ ...s, empId: emp.id, empName: emp.name });
    });
  });
  rows.sort((a, b) => new Date(b.clockIn) - new Date(a.clockIn));
  const totalMs = rows.reduce((sum, r) => sum + sessionNetMs(r, now), 0);

  function toLocalInput(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function startEdit(r) {
    setEditing(r.id);
    setEditIn(toLocalInput(r.clockIn));
    setEditOut(toLocalInput(r.clockOut));
    setEditNote(r.note || "");
    setEditError("");
  }
  function saveEdit(r) {
    const clockIn = editIn ? new Date(editIn).toISOString() : r.clockIn;
    const clockOut = editOut ? new Date(editOut).toISOString() : null;
    if (clockOut && new Date(clockOut) <= new Date(clockIn)) {
      setEditError("Clock out must be after clock in.");
      return;
    }
    onSaveSession(r.empId, r.id, { clockIn, clockOut, note: editNote });
    setEditing(null);
    setEditError("");
  }

  return (
    <div className="orb-panel">
      <div className="orb-filter-row">
        <select className="orb-input" value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
          <option value="all">All employees</option>
          {employees.filter((e) => e.role !== "admin").map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <div className="orb-segment">
          <button className={range === "week" ? "active" : ""} onClick={() => setRange("week")}>This week</button>
          <button className={range === "month" ? "active" : ""} onClick={() => setRange("month")}>This month</button>
          <button className={range === "all" ? "active" : ""} onClick={() => setRange("all")}>All time</button>
        </div>
      </div>

      <div className="orb-stat-row">
        <StatTile label="Sessions shown" value={rows.length} tone="neutral" />
        <StatTile label="Hours shown" value={fmtHM(totalMs)} tone="amber" />
      </div>

      {rows.length === 0 ? (
        <div className="orb-empty">No sessions in this range.</div>
      ) : (
        <div className="orb-table-wrap">
        <table className="orb-table">
          <thead><tr><th>Employee</th><th>Date</th><th>In</th><th>Out</th><th>Where</th><th>Breaks</th><th>Worked</th><th>Note</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              editing === r.id ? (
                <React.Fragment key={r.id}>
                <tr className="orb-edit-row">
                  <td>{r.empName}</td>
                  <td colSpan={2}>
                    <input className="orb-input orb-input-sm" type="datetime-local" value={editIn} onChange={(e) => setEditIn(e.target.value)} />
                  </td>
                  <td>
                    <input className="orb-input orb-input-sm" type="datetime-local" value={editOut} onChange={(e) => setEditOut(e.target.value)} />
                  </td>
                  <td>{r.location === "remote" ? "Remote" : "On-site"}</td>
                  <td className="orb-num">{(r.breaks || []).length ? `${r.breaks.length} · ${fmtHM(sessionBreaksMs(r, now))}` : "—"}</td>
                  <td colSpan={2}>
                    <input className="orb-input orb-input-sm" placeholder="Note" value={editNote} onChange={(e) => setEditNote(e.target.value)} />
                  </td>
                  <td className="orb-row-actions">
                    <button className="orb-icon-btn" onClick={() => saveEdit(r)} aria-label="Save"><Check size={14} /></button>
                    <button className="orb-icon-btn" onClick={() => { setEditing(null); setEditError(""); }} aria-label="Cancel"><X size={14} /></button>
                  </td>
                </tr>
                {editError && (
                  <tr>
                    <td colSpan={9}><div className="orb-error-text" style={{ textAlign: "left" }}>{editError}</div></td>
                  </tr>
                )}
                </React.Fragment>
              ) : (
                <tr key={r.id}>
                  <td>{r.empName}</td>
                  <td>{fmtDate(r.clockIn)}</td>
                  <td>{fmtTime(r.clockIn)}</td>
                  <td>{r.clockOut ? fmtTime(r.clockOut) : <span className="orb-badge orb-badge-live">In progress</span>}</td>
                  <td>{r.location === "remote" ? "Remote" : "On-site"}</td>
                  <td className="orb-num">
                    {(r.breaks || []).length ? (
                      <span className={(r.breaks || []).some((b) => b.end && breakAdherence(b, now) === "over") ? "orb-text-rose" : "orb-text-teal"}>
                        {r.breaks.length} · {fmtHM(sessionBreaksMs(r, now))}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="orb-num">{fmtHM(sessionNetMs(r, now))}</td>
                  <td className="orb-note-cell">{r.note || "—"}</td>
                  <td className="orb-row-actions">
                    <button className="orb-icon-btn" onClick={() => startEdit(r)} aria-label="Edit"><Pencil size={14} /></button>
                    <button className="orb-icon-btn orb-icon-btn-danger" onClick={() => onDeleteSession(r.empId, r.id)} aria-label="Delete"><Trash2 size={14} /></button>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Admin: Survey Reports ---------------------------------- */

function SurveyReportsTab({ employees, surveys }) {
  const [empFilter, setEmpFilter] = useState("all");
  const taskers = employees.filter((e) => e.role !== "admin");

  const rows = [];
  taskers.forEach((emp) => {
    if (empFilter !== "all" && empFilter !== emp.id) return;
    const liveEntries = surveys[emp.id] || [];
    const map = new Map();
    liveEntries.forEach((e) => {
      const key = startOfWeek(e.ts).getTime();
      if (!map.has(key)) map.set(key, { sortKey: key, label: weekLabel(e.ts), successful: 0, screenedOut: 0 });
      const g = map.get(key);
      if (e.result === "successful") g.successful++; else g.screenedOut++;
    });
    Array.from(map.values()).forEach((w) => rows.push({ ...w, empName: emp.name, empId: emp.id, imported: false }));
    (IMPORTED_SURVEY_HISTORY[emp.id] || []).forEach((w, i) => {
      rows.push({ sortKey: i, label: w.label, successful: w.successful, screenedOut: w.screenedOut, empName: emp.name, empId: emp.id, imported: true });
    });
  });
  rows.sort((a, b) => (a.empName === b.empName ? b.sortKey - a.sortKey : a.empName.localeCompare(b.empName)));

  const totalSuccess = rows.reduce((s, r) => s + r.successful, 0);
  const totalScreened = rows.reduce((s, r) => s + r.screenedOut, 0);

  return (
    <div className="orb-panel">
      <div className="orb-filter-row">
        <select className="orb-input" value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
          <option value="all">All taskers</option>
          {taskers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      <div className="orb-stat-row">
        <StatTile label="Total (shown rows)" value={totalSuccess + totalScreened} tone="neutral" />
        <StatTile label="Successful" value={totalSuccess} tone="teal" />
        <StatTile label="Screened out" value={totalScreened} tone="rose" />
        <StatTile label="Success rate" value={`${pct(totalSuccess, totalSuccess + totalScreened)}%`} tone="amber" />
      </div>

      {rows.length === 0 ? (
        <div className="orb-empty">No survey activity on record yet.</div>
      ) : (
        <div className="orb-table-wrap">
        <table className="orb-table">
          <thead><tr><th>Tasker</th><th>Week</th><th>Total</th><th>Successful</th><th>Screened out</th><th>Rate</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.empName}</td>
                <td>{r.label}{r.imported && <span className="orb-badge orb-badge-muted" style={{ marginLeft: 6 }}>Imported</span>}</td>
                <td className="orb-num">{r.successful + r.screenedOut}</td>
                <td className="orb-num">{r.successful}</td>
                <td className="orb-num">{r.screenedOut}</td>
                <td className="orb-num">{pct(r.successful, r.successful + r.screenedOut)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Admin: Settings ---------------------------------- */

function SettingsTab({ breakMinutes, onSaveBreakMinutes, kesRate, onSaveKesRate }) {
  const [val, setVal] = useState(String(breakMinutes));
  const [saved, setSaved] = useState(false);
  useEffect(() => { setVal(String(breakMinutes)); }, [breakMinutes]);

  function submit() {
    const n = parseInt(val, 10);
    if (!n || n < 1 || n > 180) return;
    onSaveBreakMinutes(n);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const [kesVal, setKesVal] = useState(String(kesRate));
  const [kesSaved, setKesSaved] = useState(false);
  useEffect(() => { setKesVal(String(kesRate)); }, [kesRate]);

  function submitKes() {
    const n = parseFloat(kesVal);
    if (!n || n <= 0) return;
    onSaveKesRate(n);
    setKesSaved(true);
    setTimeout(() => setKesSaved(false), 2500);
  }

  return (
    <div className="orb-panel">
      <div className="orb-subhead">Breaks</div>
      <div className="orb-settings-card">
        <label className="orb-field-label">Break length (minutes)</label>
        <div className="orb-settings-row">
          <input className="orb-input orb-input-narrow" type="number" min="1" max="180" value={val} onChange={(e) => setVal(e.target.value)} />
          <button className="orb-btn orb-btn-primary orb-btn-sm" onClick={submit}>Save</button>
          {saved && <span className="orb-badge orb-badge-live">Saved</span>}
        </div>
        <div className="orb-hint">
          Every shift includes 2 breaks at this length. This changes the length for new breaks going forward,
          breaks already taken keep whatever length was in effect when they started.
        </div>
      </div>

      <div className="orb-subhead">Currency</div>
      <div className="orb-settings-card">
        <label className="orb-field-label">USD → KES exchange rate</label>
        <div className="orb-settings-row">
          <span>1 USD =</span>
          <input className="orb-input orb-input-narrow" type="number" step="0.01" min="0.01" value={kesVal} onChange={(e) => setKesVal(e.target.value)} />
          <span>KSh</span>
          <button className="orb-btn orb-btn-primary orb-btn-sm" onClick={submitKes}>Save</button>
          {kesSaved && <span className="orb-badge orb-badge-live">Saved</span>}
        </div>
        <div className="orb-hint">
          Used to show each tasker's payout cut in Kenyan Shillings alongside dollars. Exchange rates move,
          update this occasionally to keep the KES figures close to current.
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- Admin: Schedule ---------------------------------- */

function AdminScheduleTab({ employees, shifts, onAddShift, onDeleteShift, onEditShift }) {
  const taskers = employees.filter((e) => e.role !== "admin");
  const [empId, setEmpId] = useState(taskers[0]?.id || "");
  const [date, setDate] = useState(localDateKey(new Date().toISOString()));
  const [shiftType, setShiftType] = useState("day");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [empFilter, setEmpFilter] = useState("all");

  function submit() {
    if (!empId || !date) return;
    onAddShift({ employeeId: empId, date, shiftType, startTime, endTime, notes });
    setNotes("");
  }

  const allShifts = [];
  taskers.forEach((emp) => {
    if (empFilter !== "all" && empFilter !== emp.id) return;
    (shifts[emp.id] || []).forEach((s) => allShifts.push({ ...s, empName: emp.name }));
  });
  allShifts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const todayKey = localDateKey(new Date().toISOString());
  const upcoming = allShifts.filter((s) => s.date >= todayKey);
  const past = allShifts.filter((s) => s.date < todayKey).reverse();

  return (
    <div className="orb-panel">
      <div className="orb-subhead">Plan a shift</div>
      <div className="orb-schedule-form">
        <select className="orb-input" value={empId} onChange={(e) => setEmpId(e.target.value)}>
          {taskers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <input className="orb-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="orb-segment">
          <button className={shiftType === "day" ? "active" : ""} onClick={() => setShiftType("day")}><Sun size={13} /> Day</button>
          <button className={shiftType === "night" ? "active" : ""} onClick={() => setShiftType("night")}><Moon size={13} /> Night</button>
        </div>
        <input className="orb-input orb-input-narrow" placeholder="Start (e.g. 08:00)" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        <input className="orb-input orb-input-narrow" placeholder="End (e.g. 16:00)" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        <input className="orb-input" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button className="orb-btn orb-btn-primary" onClick={submit}><Plus size={15} /> Add shift</button>
      </div>

      <div className="orb-filter-row">
        <select className="orb-input" value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
          <option value="all">All taskers</option>
          {taskers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      <div className="orb-subhead">Upcoming</div>
      {upcoming.length === 0 ? (
        <div className="orb-empty">No upcoming shifts scheduled.</div>
      ) : (
        <div className="orb-shift-list">
          {upcoming.map((s) => (
            <div key={s.id} className={`orb-shift-row ${s.shiftType === "night" ? "night" : "day"}`}>
              <div className="orb-shift-type-toggle">
                <button
                  className={s.shiftType !== "night" ? "active" : ""}
                  title="Set to day shift"
                  onClick={() => s.shiftType !== "day" && onEditShift(s.employeeId, s.id, { shiftType: "day" })}
                >
                  <Sun size={13} />
                </button>
                <button
                  className={s.shiftType === "night" ? "active" : ""}
                  title="Set to night shift"
                  onClick={() => s.shiftType !== "night" && onEditShift(s.employeeId, s.id, { shiftType: "night" })}
                >
                  <Moon size={13} />
                </button>
              </div>
              <span className="orb-shift-date">{fmtDayHeading(s.date)}</span>
              <span className="orb-badge orb-badge-tiny orb-shift-badge">{s.empName}</span>
              {(s.startTime || s.endTime) && <span className="orb-shift-time">{s.startTime || "—"}{"–"}{s.endTime || "—"}</span>}
              {s.notes && <span className="orb-shift-notes">{s.notes}</span>}
              <button className="orb-icon-btn orb-icon-btn-danger" onClick={() => onDeleteShift(s.employeeId, s.id)} aria-label="Remove shift"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="orb-subhead">Past</div>
      {past.length === 0 ? (
        <div className="orb-empty">No past shifts on record.</div>
      ) : (
        <div className="orb-shift-list">
          {past.slice(0, 20).map((s) => (
            <div key={s.id} className={`orb-shift-row ${s.shiftType === "night" ? "night" : "day"}`}>
              {s.shiftType === "night" ? <Moon size={15} /> : <Sun size={15} />}
              <span className="orb-shift-date">{fmtDayHeading(s.date)}</span>
              <span className="orb-badge orb-badge-tiny orb-shift-badge">{s.empName}</span>
              {(s.startTime || s.endTime) && <span className="orb-shift-time">{s.startTime || "—"}{"–"}{s.endTime || "—"}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Admin: Accounts ---------------------------------- */

function monthLabel(dateStr) {
  const [y, m] = dateStr.slice(0, 7).split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function AdminAccountsTab({ accounts, earnings, onAddEarning, onDeleteEarning, onAddAccount, onRenameAccount, onDeleteAccount, onReorderAccount }) {
  const now = Date.now();
  const todayKey = localDateKey(new Date(now).toISOString());
  const monthPrefix = todayKey.slice(0, 7);
  const sortedAccounts = useMemo(() => accounts.slice().sort((a, b) => a.sortIndex - b.sortIndex), [accounts]);
  const accountNames = useMemo(() => sortedAccounts.map((a) => a.name), [sortedAccounts]);

  const [accountName, setAccountName] = useState(accountNames[0] || "");
  useEffect(() => {
    if (!accountNames.includes(accountName)) setAccountName(accountNames[0] || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountNames]);

  const [date, setDate] = useState(todayKey);
  const [amount, setAmount] = useState("");
  const [view, setView] = useState("byAccount");
  const [entryFilter, setEntryFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");

  const [newAccountName, setNewAccountName] = useState("");
  const [addAccountMsg, setAddAccountMsg] = useState("");
  const [renameId, setRenameId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameMsg, setRenameMsg] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  function submit() {
    const n = parseFloat(amount);
    if (!accountName || isNaN(n)) return;
    onAddEarning({ accountName, date, amount: n });
    setAmount("");
  }

  function submitNewAccount() {
    const trimmed = newAccountName.trim();
    if (!trimmed) return;
    if (accountNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
      setAddAccountMsg("An account with that name already exists.");
      return;
    }
    onAddAccount(trimmed);
    setNewAccountName("");
    setAddAccountMsg("");
  }

  function startRename(a) {
    setRenameId(a.id);
    setRenameDraft(a.name);
    setRenameMsg("");
  }
  function saveRename(a) {
    const trimmed = renameDraft.trim();
    if (!trimmed) { setRenameMsg("Name can't be empty."); return; }
    if (trimmed !== a.name && accountNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
      setRenameMsg("Another account already has that name.");
      return;
    }
    onRenameAccount(a.id, a.name, trimmed);
    setRenameId(null);
    setRenameMsg("");
  }

  // Reset the period filter whenever the account filter or view changes, so
  // a stale week/month selection can't linger after switching accounts.
  useEffect(() => { setPeriodFilter("all"); }, [entryFilter, view]);

  const byAccount = useMemo(() => {
    const map = new Map();
    accountNames.forEach((n) => map.set(n, { today: 0, week: 0, month: 0, allTime: 0 }));
    const weekStartKey = localDateKey(startOfWeek(now).toISOString());
    const weekEndKey = localDateKey(endOfWeek(now).toISOString());
    earnings.forEach((e) => {
      if (!map.has(e.accountName)) map.set(e.accountName, { today: 0, week: 0, month: 0, allTime: 0 });
      const g = map.get(e.accountName);
      g.allTime += e.amount;
      if (e.date === todayKey) g.today += e.amount;
      if (e.date >= weekStartKey && e.date <= weekEndKey) g.week += e.amount;
      if (e.date.slice(0, 7) === monthPrefix) g.month += e.amount;
    });
    return map;
  }, [earnings, accountNames, now, todayKey, monthPrefix]);

  const totals = Array.from(byAccount.values()).reduce((acc, g) => ({
    today: acc.today + g.today, week: acc.week + g.week, month: acc.month + g.month, allTime: acc.allTime + g.allTime,
  }), { today: 0, week: 0, month: 0, allTime: 0 });

  const allAccountNames = useMemo(() => {
    const names = new Set(accountNames);
    earnings.forEach((e) => names.add(e.accountName));
    return Array.from(names);
  }, [earnings, accountNames]);

  const dailyRows = useMemo(() => {
    return earnings
      .filter((e) => entryFilter === "all" || e.accountName === entryFilter)
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [earnings, entryFilter]);

  const weeklyRowsAll = useMemo(() => {
    const map = new Map();
    earnings.forEach((e) => {
      if (entryFilter !== "all" && e.accountName !== entryFilter) return;
      const localDate = parseDateKeyLocal(e.date);
      const sortKey = startOfWeek(localDate).getTime();
      const key = `${e.accountName}__${sortKey}`;
      if (!map.has(key)) map.set(key, { accountName: e.accountName, sortKey, label: weekLabel(localDate), total: 0 });
      map.get(key).total += e.amount;
    });
    return Array.from(map.values()).sort((a, b) => (a.accountName === b.accountName ? b.sortKey - a.sortKey : a.accountName.localeCompare(b.accountName)));
  }, [earnings, entryFilter]);

  const weekOptions = useMemo(() => {
    const map = new Map();
    weeklyRowsAll.forEach((r) => { if (!map.has(r.sortKey)) map.set(r.sortKey, r.label); });
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [weeklyRowsAll]);
  const weeklyRows = useMemo(() => {
    if (periodFilter === "all") return weeklyRowsAll;
    return weeklyRowsAll.filter((r) => String(r.sortKey) === periodFilter);
  }, [weeklyRowsAll, periodFilter]);

  const monthlyRowsAll = useMemo(() => {
    const map = new Map();
    earnings.forEach((e) => {
      if (entryFilter !== "all" && e.accountName !== entryFilter) return;
      const monthKey = e.date.slice(0, 7);
      const key = `${e.accountName}__${monthKey}`;
      if (!map.has(key)) map.set(key, { accountName: e.accountName, sortKey: monthKey, label: monthLabel(e.date), total: 0 });
      map.get(key).total += e.amount;
    });
    return Array.from(map.values()).sort((a, b) => (a.accountName === b.accountName ? (a.sortKey < b.sortKey ? 1 : -1) : a.accountName.localeCompare(b.accountName)));
  }, [earnings, entryFilter]);

  const monthOptions = useMemo(() => {
    const map = new Map();
    monthlyRowsAll.forEach((r) => { if (!map.has(r.sortKey)) map.set(r.sortKey, r.label); });
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [monthlyRowsAll]);
  const monthlyRows = useMemo(() => {
    if (periodFilter === "all") return monthlyRowsAll;
    return monthlyRowsAll.filter((r) => r.sortKey === periodFilter);
  }, [monthlyRowsAll, periodFilter]);

  return (
    <div className="orb-panel">
      <div className="orb-subhead" style={{ marginTop: 0 }}>Log an account's earnings</div>
      <div className="orb-add-row orb-earnings-add-row">
        <select className="orb-input" value={accountName} onChange={(e) => setAccountName(e.target.value)}>
          {accountNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <input className="orb-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input className="orb-input orb-input-narrow" type="number" step="0.01" placeholder="Amount ($)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="orb-btn orb-btn-primary" onClick={submit}><Plus size={15} /> Add</button>
      </div>

      <div className="orb-stat-row">
        <StatTile label="Earned today" value={fmtMoney(totals.today)} tone="amber" />
        <StatTile label="Earned this week" value={fmtMoney(totals.week)} tone="neutral" />
        <StatTile label="Earned this month" value={fmtMoney(totals.month)} tone="neutral" />
        <StatTile label="All time" value={fmtMoney(totals.allTime)} tone="teal" />
      </div>

      <div className="orb-filter-row">
        <div className="orb-segment">
          <button className={view === "byAccount" ? "active" : ""} onClick={() => setView("byAccount")}>By account</button>
          <button className={view === "daily" ? "active" : ""} onClick={() => setView("daily")}>Daily entries</button>
          <button className={view === "weekly" ? "active" : ""} onClick={() => setView("weekly")}>Weekly entries</button>
          <button className={view === "monthly" ? "active" : ""} onClick={() => setView("monthly")}>Monthly entries</button>
        </div>
        {view !== "byAccount" && (
          <select className="orb-input" value={entryFilter} onChange={(e) => setEntryFilter(e.target.value)}>
            <option value="all">All accounts</option>
            {allAccountNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
        {view === "weekly" && (
          <select className="orb-input" value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)}>
            <option value="all">All weeks</option>
            {weekOptions.map(([key, label]) => <option key={key} value={String(key)}>{label}</option>)}
          </select>
        )}
        {view === "monthly" && (
          <select className="orb-input" value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)}>
            <option value="all">All months</option>
            {monthOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        )}
      </div>

      {view === "byAccount" && (
        <div className="orb-table-wrap">
        <table className="orb-table">
          <thead><tr><th>Account</th><th>Today</th><th>This week</th><th>This month</th><th>All time</th></tr></thead>
          <tbody>
            {Array.from(byAccount.entries()).map(([name, g], i) => (
              <tr key={`${name}-${i}`}>
                <td>{name}</td>
                <td className="orb-num">{fmtMoney(g.today)}</td>
                <td className="orb-num">{fmtMoney(g.week)}</td>
                <td className="orb-num">{fmtMoney(g.month)}</td>
                <td className="orb-num">{fmtMoney(g.allTime)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {view === "daily" && (
        dailyRows.length === 0 ? <div className="orb-empty">No daily entries yet.</div> : (
          <div className="orb-table-wrap">
          <table className="orb-table">
            <thead><tr><th>Date</th><th>Account</th><th>Amount</th><th></th></tr></thead>
            <tbody>
              {dailyRows.map((e) => (
                <tr key={e.id}>
                  <td>{fmtDate(parseDateKeyLocal(e.date))}</td>
                  <td>{e.accountName}</td>
                  <td className="orb-num">{fmtMoney(e.amount)}</td>
                  <td className="orb-row-actions">
                    <button className="orb-icon-btn orb-icon-btn-danger" onClick={() => onDeleteEarning(e.id)} aria-label="Delete entry"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )
      )}

      {view === "weekly" && (
        weeklyRows.length === 0 ? <div className="orb-empty">No weekly entries yet.</div> : (
          <div className="orb-table-wrap">
          <table className="orb-table">
            <thead><tr><th>Account</th><th>Week</th><th>Total</th></tr></thead>
            <tbody>
              {weeklyRows.map((r, i) => (
                <tr key={i}>
                  <td>{r.accountName}</td>
                  <td>{r.label}</td>
                  <td className="orb-num">{fmtMoney(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )
      )}

      {view === "monthly" && (
        monthlyRows.length === 0 ? <div className="orb-empty">No monthly entries yet.</div> : (
          <div className="orb-table-wrap">
          <table className="orb-table">
            <thead><tr><th>Account</th><th>Month</th><th>Total</th></tr></thead>
            <tbody>
              {monthlyRows.map((r, i) => (
                <tr key={i}>
                  <td>{r.accountName}</td>
                  <td>{r.label}</td>
                  <td className="orb-num">{fmtMoney(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )
      )}

      <div className="orb-subhead">Accounts</div>
      <div className="orb-add-row">
        <input className="orb-input" placeholder="New account name" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} />
        <button className="orb-btn orb-btn-primary" onClick={submitNewAccount}><Plus size={15} /> Add account</button>
      </div>
      {addAccountMsg && <div className="orb-error-text">{addAccountMsg}</div>}

      <div className="orb-table-wrap">
      <table className="orb-table">
        <thead><tr><th></th><th>Account</th><th></th></tr></thead>
        <tbody>
          {sortedAccounts.map((a, i) => (
            <React.Fragment key={a.id}>
              <tr>
                <td className="orb-reorder-cell">
                  <button className="orb-icon-btn" disabled={i === 0} onClick={() => onReorderAccount(a.id, "up")} aria-label="Move up">
                    <ChevronUp size={14} />
                  </button>
                  <button className="orb-icon-btn" disabled={i === sortedAccounts.length - 1} onClick={() => onReorderAccount(a.id, "down")} aria-label="Move down">
                    <ChevronDown size={14} />
                  </button>
                </td>
                <td>{a.name}</td>
                <td className="orb-row-actions">
                  <button className="orb-btn orb-btn-ghost-dark orb-btn-sm" onClick={() => startRename(a)}>
                    <Pencil size={13} /> Rename
                  </button>
                  {confirmDeleteId === a.id ? (
                    <>
                      <button className="orb-btn orb-btn-danger orb-btn-sm" onClick={() => { onDeleteAccount(a.id); setConfirmDeleteId(null); }}>
                        <Check size={13} /> Confirm delete
                      </button>
                      <button className="orb-btn orb-btn-ghost-dark orb-btn-sm" onClick={() => setConfirmDeleteId(null)}>
                        <X size={13} /> Cancel
                      </button>
                    </>
                  ) : (
                    <button className="orb-btn orb-btn-ghost-dark orb-btn-sm" onClick={() => setConfirmDeleteId(a.id)}>
                      <Trash2 size={13} /> Delete
                    </button>
                  )}
                </td>
              </tr>
              {renameId === a.id && (
                <tr className="orb-edit-row">
                  <td colSpan={3}>
                    <div className="orb-pin-edit-row">
                      <input className="orb-input" value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} />
                      <button className="orb-btn orb-btn-primary orb-btn-sm" onClick={() => saveRename(a)}><Check size={13} /> Save</button>
                      <button className="orb-btn orb-btn-ghost-dark orb-btn-sm" onClick={() => { setRenameId(null); setRenameMsg(""); }}><X size={13} /> Cancel</button>
                    </div>
                    {renameMsg && <div className="orb-error-text">{renameMsg}</div>}
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/* ---------------------------------- Admin: Evaluations ---------------------------------- */

function performanceTier(rate) {
  if (rate >= 0.9) return { label: "Excellent", tone: "teal" };
  if (rate >= 0.75) return { label: "Good", tone: "amber" };
  return { label: "Needs Improvement", tone: "rose" };
}

function AdminEvaluationsTab({ employees, timeLogs, surveys }) {
  const now = Date.now();
  const weekStart = startOfWeek(now).getTime(), weekEnd = endOfWeek(now).getTime();
  const taskers = employees.filter((e) => e.role !== "admin");

  const rows = taskers.map((emp) => {
    const sessions = (timeLogs[emp.id] || []).filter((s) => { const t = new Date(s.clockIn).getTime(); return t >= weekStart && t <= weekEnd; });
    const hours = sessions.reduce((sum, s) => sum + sessionNetMs(s, now), 0) / 3600000;
    const entries = (surveys[emp.id] || []).filter((e) => { const t = new Date(e.ts).getTime(); return t >= weekStart && t <= weekEnd; });
    const completed = entries.length;
    const successful = entries.filter((e) => e.result === "successful").length;
    const rate = completed > 0 ? successful / completed : 0;
    const perHour = hours > 0 ? completed / hours : 0;
    return { name: emp.name, hours, completed, successful, rate, perHour };
  });

  const totalHours = rows.reduce((s, r) => s + r.hours, 0);
  const totalCompleted = rows.reduce((s, r) => s + r.completed, 0);
  const totalSuccessful = rows.reduce((s, r) => s + r.successful, 0);
  const avgRate = totalCompleted > 0 ? totalSuccessful / totalCompleted : 0;

  return (
    <div className="orb-panel">
      <div className="orb-hint">{weekLabel(now)} — resets automatically each week.</div>
      <div className="orb-stat-row">
        <StatTile label="Total taskers" value={taskers.length} tone="neutral" />
        <StatTile label="Total hours logged" value={totalHours.toFixed(1)} tone="amber" />
        <StatTile label="Total surveys completed" value={totalCompleted} tone="neutral" />
        <StatTile label="Avg success rate" value={`${pct(totalSuccessful, totalCompleted)}%`} tone="teal" />
      </div>

      {rows.length === 0 ? (
        <div className="orb-empty">No taskers yet.</div>
      ) : (
        <div className="orb-table-wrap">
        <table className="orb-table">
          <thead><tr><th>Tasker</th><th>Hours logged</th><th>Surveys completed</th><th>Successful</th><th>Success rate</th><th>Surveys/hour</th><th>Performance</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const tier = performanceTier(r.rate);
              return (
                <tr key={i}>
                  <td>{r.name}</td>
                  <td className="orb-num">{r.hours.toFixed(1)}</td>
                  <td className="orb-num">{r.completed}</td>
                  <td className="orb-num">{r.successful}</td>
                  <td className="orb-num">{pct(r.successful, r.completed)}%</td>
                  <td className="orb-num">{r.perHour.toFixed(2)}</td>
                  <td><span className={`orb-badge orb-badge-${tier.tone}-solid`}>{tier.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Admin: Tasker detail (view-as) ---------------------------------- */

function AdminTaskerViewTab({ employees, timeLogs, surveys, shifts, taskLogs, balanceSubmissions, breakMinutes, kesRate }) {
  const taskers = employees.filter((e) => e.role !== "admin");
  const [empId, setEmpId] = useState(taskers[0]?.id || "");
  const emp = taskers.find((e) => e.id === empId);
  const now = Date.now();

  if (!emp) return <div className="orb-panel"><div className="orb-empty">Add a tasker first.</div></div>;

  const sessions = timeLogs[emp.id] || [];
  const openSession = sessions.find((s) => !s.clockOut);
  const openBreak = openSession && (openSession.breaks || []).find((b) => !b.end);
  const todayMs = sessions.filter((s) => isSameLocalDay(s.clockIn, now)).reduce((sum, s) => sum + sessionNetMs(s, now), 0);
  const weekStart = startOfWeek(now).getTime(), weekEnd = endOfWeek(now).getTime();
  const weekMs = sessions.filter((s) => { const t = new Date(s.clockIn).getTime(); return t >= weekStart && t <= weekEnd; }).reduce((sum, s) => sum + sessionNetMs(s, now), 0);

  const entries = surveys[emp.id] || [];
  const weekEntries = entries.filter((e) => { const t = new Date(e.ts).getTime(); return t >= weekStart && t <= weekEnd; });
  const weekSuccess = weekEntries.filter((e) => e.result === "successful").length;

  const subs = balanceSubmissions[emp.id] || [];
  const earnedWeek = earningsForWeek(subs, now);

  const noop = () => {};

  return (
    <div className="orb-panel">
      <div className="orb-subhead" style={{ marginTop: 0 }}>Viewing</div>
      <div className="orb-filter-row">
        <select className="orb-input" value={empId} onChange={(e) => setEmpId(e.target.value)}>
          {taskers.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <span className="orb-badge orb-badge-muted">Read-only</span>
      </div>

      <div className="orb-stat-row">
        <StatTile label="Status" value={openBreak ? "On break" : openSession ? "Clocked in" : "Clocked out"} tone={openBreak ? "amber" : openSession ? "teal" : "neutral"} />
        <StatTile label="Today" value={fmtHM(todayMs)} tone="amber" />
        <StatTile label="This week" value={fmtHM(weekMs)} tone="neutral" />
        <StatTile label="Success rate (wk)" value={`${pct(weekSuccess, weekEntries.length)}%`} tone="teal" />
        <StatTile label="Earned this week" value={fmtMoney(earnedWeek)} tone="amber" />
      </div>

      <div className="orb-subhead">{emp.name}'s dashboard</div>
      <div className="orb-embedded-tasker">
        <TaskerView
          user={emp}
          sessions={sessions}
          surveys={entries}
          shifts={shifts[emp.id] || []}
          taskLogs={taskLogs[emp.id] || []}
          balanceSubmissions={subs}
          breakMinutes={breakMinutes}
          onClockIn={noop}
          onClockOut={noop}
          onStartBreak={noop}
          onEndBreak={noop}
          onLogSurvey={noop}
          onDeleteSurvey={noop}
          onToggleTaskCell={noop}
          onSubmitBalance={noop}
          onDuplicateTaskWeeks={noop}
          readOnly
          kesRate={kesRate}
        />
      </div>
    </div>
  );
}



function AdminView({ user, employees, timeLogs, surveys, shifts, taskLogs, accounts, accountEarnings, balanceSubmissions, breakMinutes, kesRate, actions }) {
  const [tab, setTab] = useState("overview");

  const nav = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "myclock", label: "My time clock", icon: Clock },
    { key: "employees", label: "Employees", icon: Users },
    { key: "timelogs", label: "Time logs", icon: Clock },
    { key: "schedule", label: "Schedule", icon: CalendarDays },
    { key: "reports", label: "Survey reports", icon: ClipboardList },
    { key: "evaluations", label: "Evaluations", icon: Award },
    { key: "accounts", label: "Accounts", icon: DollarSign },
    { key: "taskerview", label: "Tasker view", icon: Eye },
    { key: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="orb-admin">
      <nav className="orb-sidebar">
        {nav.map((n) => (
          <button key={n.key} className={`orb-sidebar-btn ${tab === n.key ? "active" : ""}`} onClick={() => setTab(n.key)}>
            <n.icon size={16} /> {n.label}
          </button>
        ))}
      </nav>
      <div className="orb-body">
        {tab === "overview" && <OverviewTab employees={employees} timeLogs={timeLogs} surveys={surveys} balanceSubmissions={balanceSubmissions} />}
        {tab === "myclock" && (
          <TimeClockTab
            sessions={timeLogs[user.id] || []}
            breakMinutes={breakMinutes}
            onClockIn={(loc) => actions.clockIn(user.id, loc)}
            onClockOut={(note) => actions.clockOut(user.id, note)}
            onStartBreak={() => actions.startBreak(user.id)}
            onEndBreak={() => actions.endBreak(user.id)}
            balanceSubmissions={balanceSubmissions[user.id] || []}
            onSubmitBalance={(payload) => actions.submitBalance(user.id, payload)}
            kesRate={kesRate}
          />
        )}
        {tab === "employees" && (
          <EmployeesTab
            employees={employees}
            onAdd={actions.addEmployee}
            onSetPin={actions.setPin}
            onToggleActive={actions.toggleActive}
            onDelete={actions.deleteEmployee}
            onChangeRole={actions.changeRole}
          />
        )}
        {tab === "timelogs" && (
          <TimeLogsTab employees={employees} timeLogs={timeLogs} onSaveSession={actions.editSession} onDeleteSession={actions.deleteSession} />
        )}
        {tab === "schedule" && (
          <AdminScheduleTab employees={employees} shifts={shifts} onAddShift={actions.addShift} onDeleteShift={actions.deleteShift} onEditShift={actions.editShift} />
        )}
        {tab === "reports" && <SurveyReportsTab employees={employees} surveys={surveys} />}
        {tab === "evaluations" && <AdminEvaluationsTab employees={employees} timeLogs={timeLogs} surveys={surveys} />}
        {tab === "accounts" && (
          <AdminAccountsTab accounts={accounts} earnings={accountEarnings} onAddEarning={actions.addEarning} onDeleteEarning={actions.deleteEarning} onAddAccount={actions.addAccount} onRenameAccount={actions.renameAccount} onDeleteAccount={actions.deleteAccount} onReorderAccount={actions.reorderAccount} />
        )}
        {tab === "taskerview" && (
          <AdminTaskerViewTab employees={employees} timeLogs={timeLogs} surveys={surveys} shifts={shifts} taskLogs={taskLogs} balanceSubmissions={balanceSubmissions} breakMinutes={breakMinutes} kesRate={kesRate} />
        )}
        {tab === "settings" && <SettingsTab breakMinutes={breakMinutes} onSaveBreakMinutes={actions.updateBreakMinutes} kesRate={kesRate} onSaveKesRate={actions.updateKesRate} />}
      </div>
    </div>
  );
}

/* ---------------------------------- Root App ---------------------------------- */

export default function App() {
  const [loading, setLoading] = useState(true);
  const [dbOk, setDbOk] = useState(true);
  const [checkingDb, setCheckingDb] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [timeLogs, setTimeLogs] = useState({});
  const [surveys, setSurveys] = useState({});
  const [shifts, setShifts] = useState({});
  const [taskLogs, setTaskLogs] = useState({});
  const [balanceSubmissions, setBalanceSubmissions] = useState({});
  const [accounts, setAccounts] = useState([]);
  const [accountEarnings, setAccountEarnings] = useState([]);
  const [breakMinutes, setBreakMinutes] = useState(DEFAULT_BREAK_MINUTES);
  const [kesRate, setKesRate] = useState(DEFAULT_KES_RATE);
  // [CHANGED] Initialize from whatever was last stored, so a page reload
  // (or the tab/browser being closed and reopened) resumes signed in
  // instead of dropping back to the login screen. The lazy initializer runs
  // once, synchronously, before the first render.
  const [currentUserId, setCurrentUserId] = useState(readStoredUserId);
  const [showChangePin, setShowChangePin] = useState(false);

  const loadAll = useCallback(async (isRetry) => {
    if (isRetry) setCheckingDb(true);

    if (!DB_CONFIGURED) {
      setDbOk(false);
      setEmployees(sortEmployees(SEED_EMPLOYEES));
      setTimeLogs({});
      setSurveys({});
      setShifts({});
      setTaskLogs({});
      setBalanceSubmissions({});
      setAccounts(ACCOUNT_EARNING_NAMES.map((name, i) => ({ id: uid(), name, sortIndex: i })));
      setAccountEarnings(IMPORTED_ACCOUNT_EARNINGS.map((e) => ({ id: uid(), ...e })));
      setBreakMinutes(DEFAULT_BREAK_MINUTES);
      setKesRate(DEFAULT_KES_RATE);
      setLoading(false);
      if (isRetry) setCheckingDb(false);
      return;
    }

    const healthy = await checkDbHealth();
    setDbOk(healthy);

    let empList;
    if (healthy) {
      let empRows = await sbSelect("employees", "?select=id,name,role,active");
      if (empRows && empRows.length === 0) {
        // [CHANGED] Do not seed plaintext PINs into the employees table.
        // The database should already contain the initial users and hashed PINs.
        empRows = SEED_EMPLOYEES;
      }
      empList = sortEmployees(empRows || SEED_EMPLOYEES);
    } else {
      empList = sortEmployees(SEED_EMPLOYEES);
    }

    const timeLogRows = healthy ? await sbSelect("time_logs", "?select=*") : [];
    const surveyRows = healthy ? await sbSelect("survey_entries", "?select=*") : [];
    const shiftRows = healthy ? await sbSelect("shifts", "?select=*") : [];
    const taskLogRows = healthy ? await sbSelect("task_logs", "?select=*") : [];
    const balanceRows = healthy ? await sbSelect("balance_submissions", "?select=*") : [];
    let settingsRows = healthy ? await sbSelect("settings", "?select=*&id=eq.global") : [];
    if (healthy && (!settingsRows || settingsRows.length === 0)) {
      await sbUpsert("settings", [{ id: "global", break_minutes: DEFAULT_BREAK_MINUTES, kes_rate: DEFAULT_KES_RATE }]);
      settingsRows = [{ id: "global", break_minutes: DEFAULT_BREAK_MINUTES, kes_rate: DEFAULT_KES_RATE }];
    }

    let accountRows = healthy ? await sbSelect("accounts", "?select=*") : [];
    let earningRows = healthy ? await sbSelect("account_earnings", "?select=*") : [];
    if (healthy && accountRows && accountRows.length === 0) {
      const seedAccounts = ACCOUNT_EARNING_NAMES.map((name, i) => ({ id: uid(), name, sortIndex: i }));
      const seedEarnings = IMPORTED_ACCOUNT_EARNINGS.map((e) => ({ id: uid(), ...e }));
      await sbUpsert("accounts", seedAccounts.map(accountToRow));
      await sbUpsert("account_earnings", seedEarnings.map(earningToRow));
      accountRows = seedAccounts.map(accountToRow);
      earningRows = seedEarnings.map(earningToRow);
    }

    const logsByEmp = {};
    empList.forEach((e) => { logsByEmp[e.id] = []; });
    (timeLogRows || []).forEach((row) => {
      if (!logsByEmp[row.employee_id]) logsByEmp[row.employee_id] = [];
      logsByEmp[row.employee_id].push(sessionFromRow(row));
    });
    Object.values(logsByEmp).forEach((arr) => arr.sort((a, b) => new Date(a.clockIn) - new Date(b.clockIn)));

    const survByEmp = {};
    empList.forEach((e) => { survByEmp[e.id] = []; });
    (surveyRows || []).forEach((row) => {
      if (!survByEmp[row.employee_id]) survByEmp[row.employee_id] = [];
      survByEmp[row.employee_id].push(surveyFromRow(row));
    });

    const shiftsByEmp = {};
    empList.forEach((e) => { shiftsByEmp[e.id] = []; });
    (shiftRows || []).forEach((row) => {
      const s = shiftFromRow(row);
      if (!shiftsByEmp[s.employeeId]) shiftsByEmp[s.employeeId] = [];
      shiftsByEmp[s.employeeId].push(s);
    });

    const taskLogsByEmp = {};
    empList.forEach((e) => { taskLogsByEmp[e.id] = []; });
    (taskLogRows || []).forEach((row) => {
      const t = taskLogFromRow(row);
      if (!taskLogsByEmp[t.employeeId]) taskLogsByEmp[t.employeeId] = [];
      taskLogsByEmp[t.employeeId].push(t);
    });

    const balanceByEmp = {};
    empList.forEach((e) => { balanceByEmp[e.id] = []; });
    (balanceRows || []).forEach((row) => {
      const b = balanceFromRow(row);
      if (!balanceByEmp[b.employeeId]) balanceByEmp[b.employeeId] = [];
      balanceByEmp[b.employeeId].push(b);
    });

    // Private bucket objects need short-lived signed URLs for display.
    await Promise.all(Object.values(balanceByEmp).flat().map(async (b) => {
      if (!b.screenshotPath) return;
      b.screenshot = await createScreenshotSignedUrl(b.screenshotPath);
    }));

    setEmployees(empList);
    setTimeLogs(logsByEmp);
    setSurveys(survByEmp);
    setShifts(shiftsByEmp);
    setTaskLogs(taskLogsByEmp);
    setBalanceSubmissions(balanceByEmp);
    setAccounts((accountRows || []).map(accountFromRow));
    setAccountEarnings((earningRows || []).map(earningFromRow));
    setBreakMinutes((settingsRows && settingsRows[0] && settingsRows[0].break_minutes) || DEFAULT_BREAK_MINUTES);
    setKesRate((settingsRows && settingsRows[0] && settingsRows[0].kes_rate) || DEFAULT_KES_RATE);
    setLoading(false);
    if (isRetry) setCheckingDb(false);
  }, []);

  useEffect(() => { loadAll(false); }, [loadAll]);

  // [ADDED] Keep localStorage in sync whenever who's signed in changes —
  // covers logging in, signing out, and the auto sign-out below.
  useEffect(() => {
    writeStoredUserId(currentUserId);
  }, [currentUserId]);

  // [ADDED] The stored id might point at an employee who no longer exists
  // (deleted from another device while this one was closed). Wait until
  // loadAll() has finished fetching the current employee list, then drop
  // back to the login screen if the restored session doesn't check out —
  // same as the existing auto sign-out in deleteEmployee() below.
  useEffect(() => {
    if (loading) return;
    if (currentUserId && !employees.some((e) => e.id === currentUserId)) {
      setCurrentUserId(null);
    }
  }, [loading, employees, currentUserId]);

  // [ADDED] Live updates for balance_submissions: instead of the tasker or
  // admin having to refresh the page, a new row inserted anywhere (by any
  // device signed in as any employee) streams in over this one subscription
  // and is merged into the same `balanceSubmissions` state that loadAll()
  // populates. Every screen that shows earnings (the tasker's own Earnings
  // card, the admin Overview tally, admin Tasker View) derives its numbers
  // from that state at render time, so they update automatically — no
  // separate "recalculate" step is needed once the row lands in state.
  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel("balance_submissions_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "balance_submissions" },
        (payload) => {
          const record = balanceFromRow(payload.new);
          setBalanceSubmissions((prev) => {
            const existing = prev[record.employeeId] || [];
            // Skip rows we already have — most often our own optimistic
            // insert from submitBalance(), echoed back by Realtime a moment
            // later. Without this check the submitter would see their own
            // entry twice.
            if (existing.some((s) => s.id === record.id)) return prev;
            return { ...prev, [record.employeeId]: [...existing, record] };
          });
          // The row lists a storage path, not a viewable URL — fetch the
          // signed URL the same way loadAll() does, then patch it in once
          // it resolves so the screenshot preview isn't left blank.
          if (record.screenshotPath) {
            createScreenshotSignedUrl(record.screenshotPath).then((url) => {
              if (!url) return;
              setBalanceSubmissions((prev) => {
                const list = prev[record.employeeId] || [];
                const idx = list.findIndex((s) => s.id === record.id);
                if (idx === -1) return prev;
                const updated = list.slice();
                updated[idx] = { ...updated[idx], screenshot: url };
                return { ...prev, [record.employeeId]: updated };
              });
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const retryDbBeforeLogin = useCallback(() => { loadAll(true); }, [loadAll]);

  // Once signed in, a reconnect should push whatever accumulated locally
  // during the outage (upsert = safe to repeat) rather than re-fetching,
  // which would silently discard unsaved clock-ins/entries.
  const retryDbAfterLogin = useCallback(async () => {
    setCheckingDb(true);
    const healthy = await checkDbHealth();
    setDbOk(healthy);
    if (healthy) {
      await sbUpsert("employees", employees);
      const allSessions = employees.flatMap((e) => (timeLogs[e.id] || []).map((s) => sessionToRow(e.id, s)));
      const allSurveys = employees.flatMap((e) => (surveys[e.id] || []).map((s) => surveyToRow(e.id, s)));
      const allShifts = employees.flatMap((e) => (shifts[e.id] || []).map(shiftToRow));
      const allTaskLogs = employees.flatMap((e) => (taskLogs[e.id] || []).map(taskLogToRow));
      const allBalances = employees.flatMap((e) => (balanceSubmissions[e.id] || []).map(balanceToRow));
      await sbUpsert("time_logs", allSessions);
      await sbUpsert("survey_entries", allSurveys);
      await sbUpsert("shifts", allShifts);
      await sbUpsert("task_logs", allTaskLogs);
      await sbUpsert("balance_submissions", allBalances);
      await sbUpsert("accounts", accounts.map(accountToRow));
      await sbUpsert("account_earnings", accountEarnings.map(earningToRow));
      await sbUpsert("settings", [{ id: "global", break_minutes: breakMinutes, kes_rate: kesRate }]);
    }
    setCheckingDb(false);
  }, [employees, timeLogs, surveys, shifts, taskLogs, balanceSubmissions, accounts, accountEarnings, breakMinutes, kesRate]);

  const persist = useCallback(async (promise) => {
    const ok = await promise;
    if (!ok) setDbOk(false);
    return ok;
  }, []);

  const currentUser = employees.find((e) => e.id === currentUserId) || null;

  const persistEmployees = useCallback(async (next) => {
    setEmployees(next);
    await persist(sbUpsert("employees", next));
  }, [persist]);

  const clockIn = useCallback((empId, location) => {
    setTimeLogs((prev) => {
      const sessions = prev[empId] || [];
      if (sessions.some((s) => !s.clockOut)) return prev;
      const newSession = { id: uid(), clockIn: new Date().toISOString(), clockOut: null, note: "", breaks: [], location: location || "onsite" };
      persist(sbUpsert("time_logs", [sessionToRow(empId, newSession)]));
      return { ...prev, [empId]: [...sessions, newSession] };
    });
  }, [persist]);

  const clockOut = useCallback((empId, note) => {
    setTimeLogs((prev) => {
      const sessions = prev[empId] || [];
      const idx = sessions.findIndex((s) => !s.clockOut);
      if (idx === -1) return prev;
      const updatedSession = { ...sessions[idx], clockOut: new Date().toISOString(), note: note || "" };
      const updated = sessions.slice();
      updated[idx] = updatedSession;
      persist(sbUpsert("time_logs", [sessionToRow(empId, updatedSession)]));
      return { ...prev, [empId]: updated };
    });
  }, [persist]);

  const startBreak = useCallback((empId) => {
    setTimeLogs((prev) => {
      const sessions = prev[empId] || [];
      const idx = sessions.findIndex((s) => !s.clockOut);
      if (idx === -1) return prev;
      const session = sessions[idx];
      const breaks = session.breaks || [];
      if (breaks.length >= 2 || breaks.some((b) => !b.end)) return prev;
      const newBreak = { id: uid(), start: new Date().toISOString(), end: null, plannedMinutes: breakMinutes };
      const updatedSession = { ...session, breaks: [...breaks, newBreak] };
      const updated = sessions.slice();
      updated[idx] = updatedSession;
      persist(sbUpsert("time_logs", [sessionToRow(empId, updatedSession)]));
      return { ...prev, [empId]: updated };
    });
  }, [persist, breakMinutes]);

  const endBreak = useCallback((empId) => {
    setTimeLogs((prev) => {
      const sessions = prev[empId] || [];
      const idx = sessions.findIndex((s) => !s.clockOut);
      if (idx === -1) return prev;
      const session = sessions[idx];
      const breaks = session.breaks || [];
      const bIdx = breaks.findIndex((b) => !b.end);
      if (bIdx === -1) return prev;
      const updatedBreaks = breaks.slice();
      updatedBreaks[bIdx] = { ...updatedBreaks[bIdx], end: new Date().toISOString() };
      const updatedSession = { ...session, breaks: updatedBreaks };
      const updated = sessions.slice();
      updated[idx] = updatedSession;
      persist(sbUpsert("time_logs", [sessionToRow(empId, updatedSession)]));
      return { ...prev, [empId]: updated };
    });
  }, [persist]);

  const editSession = useCallback((empId, sessionId, updates) => {
    setTimeLogs((prev) => {
      const sessions = prev[empId] || [];
      const idx = sessions.findIndex((s) => s.id === sessionId);
      if (idx === -1) return prev;
      const updatedSession = { ...sessions[idx], ...updates };
      const updated = sessions.slice();
      updated[idx] = updatedSession;
      persist(sbUpsert("time_logs", [sessionToRow(empId, updatedSession)]));
      return { ...prev, [empId]: updated };
    });
  }, [persist]);

  const deleteSession = useCallback((empId, sessionId) => {
    setTimeLogs((prev) => {
      const sessions = prev[empId] || [];
      const updated = sessions.filter((s) => s.id !== sessionId);
      persist(sbDelete("time_logs", sessionId));
      return { ...prev, [empId]: updated };
    });
  }, [persist]);

  const logSurvey = useCallback((empId, result) => {
    setSurveys((prev) => {
      const entries = prev[empId] || [];
      const newEntry = { id: uid(), ts: new Date().toISOString(), result };
      persist(sbUpsert("survey_entries", [surveyToRow(empId, newEntry)]));
      return { ...prev, [empId]: [...entries, newEntry] };
    });
  }, [persist]);

  const deleteSurvey = useCallback((empId, entryId) => {
    setSurveys((prev) => {
      const entries = prev[empId] || [];
      const updated = entries.filter((e) => e.id !== entryId);
      persist(sbDelete("survey_entries", entryId));
      return { ...prev, [empId]: updated };
    });
  }, [persist]);

  // [CHANGED] New employees are created through a server-side RPC that hashes
  // the PIN before it is stored. The plaintext PIN exists only in this form
  // long enough to send it to Supabase.
  const addEmployee = useCallback(async (name, role, pinInput) => {
    const finalPin = /^\d{4}$/.test(pinInput || "") ? pinInput : genPin();
    const id = uid();
    if (!name.trim()) return null;
    if (role !== "admin" && role !== "tasker") return null;

    const { data, error } = await callRpc("create_employee_with_pin", {
      p_id: id,
      p_name: name.trim(),
      p_role: role,
      p_pin: finalPin,
    });

    if (error || data !== true) {
      alert(error?.message || "Unable to add employee.");
      return null;
    }

    const newEmp = { id, name: name.trim(), role, active: true };
    setEmployees((prev) => sortEmployees([...prev, newEmp]));
    return newEmp;
  }, []);

  // [CHANGED] Existing-user PIN changes update pin_hash through the admin RPC.
  // No plaintext PIN is written to the employees table.
  const setPin = useCallback(async (id, newPin) => {
    if (!/^\d{4}$/.test(newPin || "")) {
      alert("PIN must be exactly 4 digits.");
      return false;
    }

    const { data, error } = await callRpc("admin_change_employee_pin", {
      p_employee_id: id,
      p_new_pin: newPin,
    });

    if (error || data !== true) {
      alert(error?.message || "Unable to change PIN.");
      return false;
    }
    return true;
  }, []);

  const toggleActive = useCallback((id) => {
    setEmployees((prev) => {
      const updated = prev.map((e) => (e.id === id ? { ...e, active: !e.active } : e));
      const changed = updated.find((e) => e.id === id);
      persist(sbUpsert("employees", [changed]));
      return updated;
    });
  }, [persist]);

  // [ADDED] Admin can change any employee's role between Admin and Tasker.
  const changeRole = useCallback((id, newRole) => {
    if (newRole !== "admin" && newRole !== "tasker") return;

    const target = employees.find((e) => e.id === id);
    if (!target) return;

    // Never allow the last active admin to be demoted.
    if (target.role === "admin" && target.active && newRole === "tasker") {
      const activeAdminCount = employees.filter((e) => e.role === "admin" && e.active).length;
      if (activeAdminCount <= 1) {
        alert("At least one active admin is required.");
        return;
      }
    }

    const updated = employees.map((e) => e.id === id ? { ...e, role: newRole } : e);
    setEmployees(updated);
    persist(sbUpsert("employees", [updated.find((e) => e.id === id)]));
  }, [employees, persist]);

  const deleteEmployee = useCallback((id) => {
    const target = employees.find((e) => e.id === id);
    if (!target || target.role === "admin") return;
    setEmployees((prev) => prev.filter((e) => e.id !== id));
    persist(sbDelete("employees", id));
    setTimeLogs((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setSurveys((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setShifts((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setTaskLogs((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setBalanceSubmissions((prev) => { const next = { ...prev }; delete next[id]; return next; });
    if (currentUserId === id) setCurrentUserId(null);
  }, [persist, currentUserId, employees]);

  // [CHANGED] Employees change their own PIN through server-side verification.
  const changeOwnPin = useCallback(async () => {
    // The modal performs the current-PIN verification and RPC update.
  }, []);

  const updateBreakMinutes = useCallback((n) => {
    setBreakMinutes(n);
    persist(sbUpsert("settings", [{ id: "global", break_minutes: n }]));
  }, [persist]);

  const updateKesRate = useCallback((n) => {
    setKesRate(n);
    persist(sbUpsert("settings", [{ id: "global", kes_rate: n }]));
  }, [persist]);

  const addShift = useCallback((shift) => {
    const newShift = { id: uid(), ...shift };
    setShifts((prev) => {
      const list = prev[shift.employeeId] || [];
      persist(sbUpsert("shifts", [shiftToRow(newShift)]));
      return { ...prev, [shift.employeeId]: [...list, newShift] };
    });
  }, [persist]);

  const deleteShift = useCallback((empId, shiftId) => {
    setShifts((prev) => {
      const list = prev[empId] || [];
      persist(sbDelete("shifts", shiftId));
      return { ...prev, [empId]: list.filter((s) => s.id !== shiftId) };
    });
  }, [persist]);

  const editShift = useCallback((empId, shiftId, updates) => {
    setShifts((prev) => {
      const list = prev[empId] || [];
      const idx = list.findIndex((s) => s.id === shiftId);
      if (idx === -1) return prev;
      const updatedShift = { ...list[idx], ...updates };
      const updatedList = list.slice();
      updatedList[idx] = updatedShift;
      persist(sbUpsert("shifts", [shiftToRow(updatedShift)]));
      return { ...prev, [empId]: updatedList };
    });
  }, [persist]);

  const toggleTaskCell = useCallback((empId, date, hourIdx, taskIdx) => {
    setTaskLogs((prev) => {
      const list = prev[empId] || [];
      const idx = list.findIndex((t) => t.date === date);
      let updatedLog;
      let updatedList;
      if (idx === -1) {
        const grid = emptyTaskGrid();
        grid[hourIdx][taskIdx] = true;
        updatedLog = { id: `${empId}_${date}`, employeeId: empId, date, grid };
        updatedList = [...list, updatedLog];
      } else {
        const grid = list[idx].grid.map((row) => row.slice());
        grid[hourIdx][taskIdx] = !grid[hourIdx][taskIdx];
        updatedLog = { ...list[idx], grid };
        updatedList = list.slice();
        updatedList[idx] = updatedLog;
      }
      persist(sbUpsert("task_logs", [taskLogToRow(updatedLog)]));
      return { ...prev, [empId]: updatedList };
    });
  }, [persist]);

  const duplicateTaskWeeks = useCallback((empId, sourceWeekOffset, weekCount) => {
    setTaskLogs((prev) => {
      const list = prev[empId] || [];
      const sourceDates = weekDatesForOffset(Date.now(), sourceWeekOffset);
      const sourceGrids = sourceDates.map((d) => {
        const found = list.find((t) => t.date === d);
        return found ? found.grid : emptyTaskGrid();
      });
      let updatedList = list.slice();
      const newRows = [];
      for (let w = 1; w <= weekCount; w++) {
        const targetDates = weekDatesForOffset(Date.now(), sourceWeekOffset + w);
        targetDates.forEach((targetDate, i) => {
          const grid = sourceGrids[i].map((row) => row.slice());
          const rec = { id: `${empId}_${targetDate}`, employeeId: empId, date: targetDate, grid };
          const idx = updatedList.findIndex((t) => t.date === targetDate);
          if (idx === -1) updatedList.push(rec); else updatedList[idx] = rec;
          newRows.push(rec);
        });
      }
      persist(sbUpsert("task_logs", newRows.map(taskLogToRow)));
      return { ...prev, [empId]: updatedList };
    });
  }, [persist]);

  const submitBalance = useCallback(async (empId, { date, balance, screenshot, rawValue, wasPoints, ocrStatus, ocrBalance, ocrText, description }) => {
    const submittedAt = new Date().toISOString();
    const recordId = uid();
    let screenshotPath = null;

    try {
      if (screenshot) screenshotPath = await uploadBalanceScreenshot(empId, screenshot, recordId);

      const record = {
        id: recordId,
        employeeId: empId,
        date: date || localDateKey(submittedAt),
        balance: Number(balance),
        screenshotPath,
        screenshot: screenshot || null,
        submittedAt,
        rawValue: rawValue != null ? Number(rawValue) : Number(balance),
        wasPoints: !!wasPoints,
        ocrBalance: ocrBalance != null ? Number(ocrBalance) : null,
        ocrText: ocrText || null,
        ocrStatus: ocrStatus || null,
        description: description || "",
      };

      const saved = await sbUpsert("balance_submissions", [balanceToRow(record)]);
      if (!saved) throw new Error("Balance record could not be saved.");

      setBalanceSubmissions((prev) => ({
        ...prev,
        [empId]: [...(prev[empId] || []), record],
      }));
      return { ok: true, record };
    } catch (e) {
      console.error("Balance submission failed:", e);
      return { ok: false, error: e instanceof Error ? e.message : "Could not save the balance submission." };
    }
  }, []);

  const addEarning = useCallback((earning) => {
    const newEarning = { id: uid(), ...earning };
    setAccountEarnings((prev) => {
      persist(sbUpsert("account_earnings", [earningToRow(newEarning)]));
      return [...prev, newEarning];
    });
  }, [persist]);

  const deleteEarning = useCallback((earningId) => {
    setAccountEarnings((prev) => {
      persist(sbDelete("account_earnings", earningId));
      return prev.filter((e) => e.id !== earningId);
    });
  }, [persist]);

  const addAccount = useCallback((name) => {
    setAccounts((prev) => {
      const newAccount = { id: uid(), name, sortIndex: prev.length };
      persist(sbUpsert("accounts", [accountToRow(newAccount)]));
      return [...prev, newAccount];
    });
  }, [persist]);

  const renameAccount = useCallback((accountId, oldName, newName) => {
    setAccounts((prev) => {
      const updated = prev.map((a) => (a.id === accountId ? { ...a, name: newName } : a));
      const changed = updated.find((a) => a.id === accountId);
      persist(sbUpsert("accounts", [accountToRow(changed)]));
      return updated;
    });
    // Cascade the rename so historical earnings stay attributed correctly.
    setAccountEarnings((prev) => {
      const changed = [];
      const updated = prev.map((e) => {
        if (e.accountName !== oldName) return e;
        const renamed = { ...e, accountName: newName };
        changed.push(renamed);
        return renamed;
      });
      if (changed.length > 0) persist(sbUpsert("account_earnings", changed.map(earningToRow)));
      return updated;
    });
  }, [persist]);

  const deleteAccount = useCallback((accountId) => {
    // Removes the account from the manageable list only, historical earnings
    // already logged under its name are left untouched and still reportable.
    setAccounts((prev) => {
      persist(sbDelete("accounts", accountId));
      return prev.filter((a) => a.id !== accountId);
    });
  }, [persist]);

  const reorderAccount = useCallback((accountId, direction) => {
    setAccounts((prev) => {
      const sorted = prev.slice().sort((a, b) => a.sortIndex - b.sortIndex);
      const idx = sorted.findIndex((a) => a.id === accountId);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx === -1 || swapIdx < 0 || swapIdx >= sorted.length) return prev;
      const a = sorted[idx], b = sorted[swapIdx];
      const aNew = { ...a, sortIndex: b.sortIndex };
      const bNew = { ...b, sortIndex: a.sortIndex };
      persist(sbUpsert("accounts", [aNew, bNew].map(accountToRow)));
      return prev.map((acc) => (acc.id === aNew.id ? aNew : acc.id === bNew.id ? bNew : acc));
    });
  }, [persist]);

  return (
    <div className="orb-app">
      <style>{CSS}</style>
      {loading ? (
        <div className="orb-loading">
          <OrbitMark size={32} />
          <span>Loading Orbital X…</span>
        </div>
      ) : !currentUser ? (
        <LoginScreen
          employees={employees}
          onLogin={setCurrentUserId}
          dbOk={dbOk}
          onRetryDb={retryDbBeforeLogin}
          checkingDb={checkingDb}
        />
      ) : (
        <div className="orb-shell">
          <Header
            user={currentUser}
            onSignOut={() => setCurrentUserId(null)}
            onOpenChangePin={() => setShowChangePin(true)}
            dbOk={dbOk}
            onRetryDb={retryDbAfterLogin}
            checkingDb={checkingDb}
          />
          {currentUser.role === "admin" ? (
            <AdminView
              user={currentUser}
              employees={employees}
              timeLogs={timeLogs}
              surveys={surveys}
              shifts={shifts}
              taskLogs={taskLogs}
              accounts={accounts}
              accountEarnings={accountEarnings}
              balanceSubmissions={balanceSubmissions}
              breakMinutes={breakMinutes}
              kesRate={kesRate}
              actions={{
                addEmployee, setPin, toggleActive, changeRole, deleteEmployee, editSession, deleteSession, updateBreakMinutes, updateKesRate,
                clockIn, clockOut, startBreak, endBreak, submitBalance,
                addShift, deleteShift, editShift, addEarning, deleteEarning, addAccount, renameAccount, deleteAccount, reorderAccount,
              }}
            />
          ) : (
            <TaskerView
              user={currentUser}
              sessions={timeLogs[currentUser.id] || []}
              surveys={surveys[currentUser.id] || []}
              shifts={shifts[currentUser.id] || []}
              taskLogs={taskLogs[currentUser.id] || []}
              balanceSubmissions={balanceSubmissions[currentUser.id] || []}
              breakMinutes={breakMinutes}
              kesRate={kesRate}
              onClockIn={(location) => clockIn(currentUser.id, location)}
              onClockOut={(note) => clockOut(currentUser.id, note)}
              onStartBreak={() => startBreak(currentUser.id)}
              onEndBreak={() => endBreak(currentUser.id)}
              onLogSurvey={(result) => logSurvey(currentUser.id, result)}
              onDeleteSurvey={(id) => deleteSurvey(currentUser.id, id)}
              onToggleTaskCell={(date, hourIdx, taskIdx) => toggleTaskCell(currentUser.id, date, hourIdx, taskIdx)}
              onSubmitBalance={(payload) => submitBalance(currentUser.id, payload)}
              onDuplicateTaskWeeks={(weekOffset, count) => duplicateTaskWeeks(currentUser.id, weekOffset, count)}
            />
          )}
          {showChangePin && (
            <ChangePinModal user={currentUser} onClose={() => setShowChangePin(false)} onSave={changeOwnPin} />
          )}
        </div>
      )}
    </div>
  );
}

/*
 * ============================================================================
 * MERGE NOTES
 * ============================================================================
 * [ADDED FROM orbital-ai V2]
 * - My time clock for admins
 * - richer break tracking/adherence
 * - on-site/remote clock-in
 * - screenshot balance submission + OCR verification
 * - earnings / payout calculations and KES conversion
 * - task grid and duplicate-week tools
 * - employee schedules
 * - survey reports and evaluations
 * - account management and historical earnings
 * - admin Tasker View (read-only)
 * - delete/deactivate employee management
 *
 * [CHANGED]
 * - Existing employee PIN action is explicitly "Change PIN"
 * - PINs are no longer read from or written to employees.pin
 * - Login and self-service PIN changes use Supabase RPCs
 * - New employee creation uses create_employee_with_pin
 * - Admin PIN reset uses admin_change_employee_pin
 * - Employee list selects only id/name/role/active
 * - Admin Employees supports role changes while protecting the last active admin
 * - Added a Realtime subscription (via @supabase/supabase-js) on
 *   balance_submissions so earnings update live without a page refresh
 *
 * [REMOVED / REPLACED]
 * - Plaintext seed PINs from browser code
 * - Direct browser comparison against employee.pin
 * - Direct browser upsert of PIN values
 * - V2's plaintext PIN-based PIN change implementation
 *
 * The old plaintext `pin` database column can be removed only after verifying
 * every employee has a non-null pin_hash and no application code references `pin`.
 * ============================================================================
 */
/* ---------------------------------- Styles ---------------------------------- */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');

.orb-app {
  --navy: #10182E;
  --navy-2: #1A2547;
  --navy-3: #24315C;
  --amber: #F0A93E;
  --brand-blue: #1BB2EB;
  --amber-soft: #FBE7C4;
  --teal: #2E9E85;
  --teal-soft: #DCF0EA;
  --rose: #D2564E;
  --rose-soft: #FAE1DE;
  --paper: #F4F6F9;
  --paper-2: #E9EDF3;
  --ink: #171B26;
  --ink-soft: #5A6178;
  --line: #DCE2ED;
  --line-strong: #C5CDDC;
  font-family: 'Inter', -apple-system, sans-serif;
  color: var(--ink);
  min-height: 100vh;
  width: 100%;
  /* [ADDED] Belt-and-suspenders: a handful of rows below (tabs, tables)
     used to be wide enough on a real mobile viewport to push the whole
     page wider than the screen — visible as a dark sliver of unpainted
     space down the right edge (this only ever showed up in a real mobile
     viewport; "Request desktop site" masks it by rendering at a wider,
     zoomed-out canvas where nothing needs to wrap). Those specific rows
     now scroll or wrap internally instead of overflowing (see .orb-tabs
     and .orb-table-wrap below); this just makes sure nothing else can do
     the same thing to the page as a whole. */
  overflow-x: hidden;
  background: var(--paper);
  font-variant-numeric: tabular-nums;
}
.orb-app * { box-sizing: border-box; }
.orb-app h1, .orb-app h2, .orb-app h3, .orb-wordmark { font-family: 'Space Grotesk', 'Inter', sans-serif; }

.orb-loading { min-height: 100vh; display: flex; align-items: center; justify-content: center; gap: 10px; color: var(--ink-soft); }

/* ---- Login ---- */
.orb-login { min-height: 100vh; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; padding: 24px; background: radial-gradient(circle at 50% 30%, #16204006 0%, var(--paper) 70%); }
.orb-login-rings { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.orb-login-card { position: relative; width: 100%; max-width: 420px; background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 32px; box-shadow: 0 20px 50px -25px rgba(16,24,46,0.25); }
.orb-brand { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.orb-wordmark { font-weight: 700; font-size: 22px; letter-spacing: -0.01em; color: var(--navy); }
.orb-wordmark-sm { font-size: 17px; color: #fff; }
.orb-tagline { color: var(--brand-blue); font-size: 10.5px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; margin: 2px 0 0 44px; }
.orb-login-sub { color: var(--ink-soft); margin: 6px 0 22px; font-size: 14.5px; }

.orb-employee-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.orb-employee-tile { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 18px 10px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); cursor: pointer; font-family: inherit; font-size: 14.5px; font-weight: 600; color: var(--ink); position: relative; transition: border-color .15s, transform .1s; }
.orb-employee-tile:hover { border-color: var(--amber); transform: translateY(-1px); }
.orb-avatar { width: 40px; height: 40px; border-radius: 50%; background: var(--navy); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px; }
.orb-avatar-sm { width: 26px; height: 26px; font-size: 12px; }

.orb-pin-panel { display: flex; flex-direction: column; gap: 6px; }
.orb-pin-who { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 16px; margin: 4px 0 14px; }
.orb-back { align-self: flex-start; display: flex; align-items: center; gap: 4px; margin-bottom: 10px; }
.orb-field-label { font-size: 12.5px; color: var(--ink-soft); font-weight: 600; margin-bottom: 4px; }
.orb-pin-input { width: 100%; font-size: 22px; letter-spacing: 8px; text-align: center; padding: 12px; border-radius: 10px; border: 1px solid var(--line-strong); background: var(--paper); color: var(--ink); }
.orb-pin-input:focus { outline: 2px solid var(--amber); outline-offset: 1px; }
.orb-pindots { display: flex; gap: 8px; justify-content: center; margin: 10px 0 4px; }
.orb-pindot { width: 9px; height: 9px; border-radius: 50%; background: var(--line-strong); }
.orb-pindot.filled { background: var(--amber); }
.orb-error-text { color: var(--rose); font-size: 13px; text-align: center; margin: 4px 0; }
.orb-hint { color: var(--ink-soft); font-size: 12.5px; margin-top: 10px; }
.orb-shake { animation: orb-shake .4s; }
@keyframes orb-shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }

.orb-banner { border-radius: 10px; padding: 12px 14px; font-size: 13.5px; margin-bottom: 16px; }
.orb-banner-info { background: var(--amber-soft); color: #6B4A16; }
.orb-banner-warn { background: var(--rose-soft); color: #7A2E28; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.orb-link-btn { background: none; border: none; color: var(--navy); font-weight: 600; font-size: 13px; text-decoration: underline; cursor: pointer; padding: 0; margin-top: 8px; font-family: inherit; }
.orb-link-btn-warn { color: #7A2E28; margin-top: 0; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px; }
.orb-header-storage-warn { display: inline-flex; align-items: center; gap: 5px; background: var(--rose); color: #fff; border: none; border-radius: 999px; padding: 4px 10px; font-size: 11.5px; font-weight: 600; font-family: inherit; cursor: pointer; }
.orb-header-storage-warn:disabled { opacity: 0.7; cursor: default; }
.orb-welcome-pin { font-weight: 700; letter-spacing: 1px; }

/* ---- Header / shell ---- */
.orb-shell { min-height: 100vh; display: flex; flex-direction: column; }
.orb-header { background: var(--navy); color: #fff; padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; position: sticky; top: 0; z-index: 10; }
.orb-header-right { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.orb-header-clock { font-size: 12.5px; color: #B9C2DA; }
.orb-header-user { display: flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 600; }

.orb-body { flex: 1; padding: 20px; max-width: 1040px; width: 100%; margin: 0 auto; }
.orb-embedded-tasker { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--paper); }
.orb-embedded-tasker .orb-body { padding: 16px; max-width: none; margin: 0; }
.orb-embedded-tasker .orb-tabs { padding: 0 2px; }
.orb-panel { display: flex; flex-direction: column; gap: 6px; }

/* ---- Buttons ---- */
.orb-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border-radius: 9px; padding: 9px 16px; font-family: inherit; font-weight: 600; font-size: 13.5px; cursor: pointer; border: 1px solid transparent; transition: filter .12s, transform .06s; }
.orb-btn:active { transform: scale(0.98); }
.orb-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.orb-btn-primary { background: var(--amber); color: #3A2600; }
.orb-btn-primary:hover:not(:disabled) { filter: brightness(1.05); }
.orb-btn-teal { background: var(--teal); color: #fff; }
.orb-btn-rose { background: var(--rose); color: #fff; }
.orb-btn-danger { background: #fff; color: var(--rose); border-color: var(--rose); }
.orb-btn-ghost { background: transparent; color: #fff; border-color: rgba(255,255,255,0.35); }
.orb-btn-ghost:hover { background: rgba(255,255,255,0.08); }
.orb-btn-ghost-dark { background: transparent; color: var(--navy); border-color: var(--line-strong); }
.orb-btn-ghost-dark:hover { background: var(--paper-2); }
.orb-btn-lg { padding: 13px 22px; font-size: 14.5px; }
.orb-btn-sm { padding: 6px 10px; font-size: 12.5px; }
.orb-btn-block { width: 100%; margin-top: 4px; }
.orb-icon-btn { background: none; border: none; color: var(--ink-soft); cursor: pointer; padding: 5px; border-radius: 6px; display: inline-flex; }
.orb-icon-btn:hover { background: var(--paper-2); color: var(--ink); }
.orb-icon-btn-danger:hover { background: var(--rose-soft); color: var(--rose); }

/* ---- Tabs / sidebar ---- */
/* [CHANGED] On a narrow phone, "Time clock / Survey log / Task log / My
   schedule / My history" doesn't fit in one row. It used to just overflow
   the row's box, which (via .orb-app's fix above) is now clipped instead
   of pushing the page wider — so make the row scroll horizontally on its
   own instead, with the tabs themselves staying full-size and readable
   (flex-shrink: 0) rather than getting squeezed. */
.orb-tabs { display: flex; gap: 4px; margin-bottom: 18px; border-bottom: 1px solid var(--line); overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
.orb-tabs::-webkit-scrollbar { display: none; }
.orb-tabs .orb-tab { flex-shrink: 0; }
.orb-tab { display: flex; align-items: center; gap: 6px; padding: 10px 14px; background: none; border: none; border-bottom: 2px solid transparent; font-family: inherit; font-weight: 600; font-size: 13.5px; color: var(--ink-soft); cursor: pointer; }
.orb-tab.active { color: var(--navy); border-bottom-color: var(--amber); }

.orb-admin { display: flex; flex: 1; max-width: 1200px; width: 100%; margin: 0 auto; }
.orb-sidebar { width: 190px; background: var(--navy-2); padding: 18px 10px; display: flex; flex-direction: column; gap: 3px; flex-shrink: 0; }
.orb-sidebar-btn { display: flex; align-items: center; gap: 9px; padding: 10px 12px; border-radius: 8px; background: none; border: none; color: #CBD3E8; font-family: inherit; font-weight: 600; font-size: 13.5px; cursor: pointer; text-align: left; }
.orb-sidebar-btn:hover { background: rgba(255,255,255,0.06); }
.orb-sidebar-btn.active { background: var(--amber); color: #3A2600; }

/* ---- Stats / dial ---- */
.orb-stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin: 12px 0 18px; }
.orb-stat { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; background: #fff; }
.orb-stat-value { font-family: 'Space Grotesk', sans-serif; font-size: 24px; font-weight: 700; }
.orb-stat-label { font-size: 12.5px; color: var(--ink-soft); margin-top: 2px; }
.orb-stat-amber .orb-stat-value { color: #A66A12; }
.orb-stat-teal .orb-stat-value { color: var(--teal); }
.orb-stat-rose .orb-stat-value { color: var(--rose); }

.orb-clock-top { display: flex; gap: 28px; align-items: center; flex-wrap: wrap; background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 22px; margin-bottom: 6px; }
.orb-dial { position: relative; width: 140px; height: 140px; flex-shrink: 0; }
.orb-dial-text { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.orb-dial-primary { font-family: 'Space Grotesk', sans-serif; font-size: 19px; font-weight: 700; }
.orb-dial-secondary { font-size: 11px; color: var(--ink-soft); margin-top: 3px; max-width: 100px; }
.orb-clock-actions { display: flex; flex-direction: column; gap: 12px; flex: 1; min-width: 240px; }
.orb-note-field { display: flex; flex-direction: column; }

.orb-log-buttons { display: flex; gap: 10px; margin: 4px 0 22px; flex-wrap: wrap; }

/* ---- Breaks ---- */
.orb-breaks-bar { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin: 6px 0 18px; display: flex; flex-direction: column; gap: 8px; }
.orb-breaks-status { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--navy); }
.orb-break-history { display: flex; flex-direction: column; gap: 3px; }
.orb-break-chip { font-size: 12px; color: var(--ink-soft); }
.orb-break-timer { display: flex; flex-direction: column; gap: 8px; }
.orb-break-timer-head { display: flex; align-items: center; gap: 7px; font-weight: 700; font-size: 14px; color: var(--navy); flex-wrap: wrap; }
.orb-progress-track { height: 8px; border-radius: 999px; background: var(--paper-2); overflow: hidden; }
.orb-progress-fill { height: 100%; background: var(--amber); border-radius: 999px; transition: width 1s linear; }
.orb-progress-fill.over { background: var(--rose); }
.orb-badge-rose-solid { background: var(--rose); color: #fff; }

/* ---- Tables / lists ---- */
.orb-subhead { font-weight: 700; font-size: 14.5px; margin: 22px 0 8px; color: var(--navy); }
.orb-empty { color: var(--ink-soft); font-size: 13.5px; padding: 16px; background: #fff; border: 1px dashed var(--line-strong); border-radius: 10px; text-align: center; }
/* [CHANGED] Several of these tables (Today's sessions: In/Out/Where/Breaks/
   Worked/Note, and similar admin tables) don't fit their columns in a phone
   width either. Each <table className="orb-table"> is wrapped in a plain
   <div className="orb-table-wrap"> that scrolls horizontally instead of
   forcing the page to grow. (Earlier this used display:block directly on
   the table, but that broke the table's own column layout — the table's
   border/background box stayed full width while the actual rows shrank to
   fit their content, leaving a big blank strip beside the data on desktop.
   Scrolling now lives on the wrapper div instead, so the table itself keeps
   its normal table layout and columns line up correctly at every width.) */
.orb-table-wrap { max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.orb-table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--line); border-radius: 10px; font-size: 13.5px; }
.orb-table th { text-align: left; background: var(--paper-2); color: var(--ink-soft); font-weight: 600; padding: 9px 12px; font-size: 12px; }
.orb-table td { padding: 9px 12px; border-top: 1px solid var(--line); }
.orb-num { font-variant-numeric: tabular-nums; }
.orb-note-cell { color: var(--ink-soft); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.orb-entry-list { display: flex; flex-direction: column; gap: 6px; }
.orb-entry-row { display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; font-size: 13.5px; }
.orb-entry-result { font-weight: 600; }
.orb-entry-time { color: var(--ink-soft); margin-left: auto; font-size: 12.5px; }

.orb-roster { display: flex; flex-direction: column; gap: 6px; }
.orb-roster-row { display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 9px 12px; font-size: 13.5px; }
.orb-roster-name { font-weight: 600; }
.orb-roster-status { margin-left: auto; color: var(--ink-soft); font-size: 12.5px; }

/* ---- Badges / dots ---- */
.orb-badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
.orb-badge-admin { background: var(--navy-3); color: #fff; margin-left: 6px; }
.orb-badge-live { background: var(--teal-soft); color: var(--teal); }
.orb-badge-muted { background: var(--paper-2); color: var(--ink-soft); }
.orb-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.orb-dot-teal { background: var(--teal); }
.orb-dot-rose { background: var(--rose); }
.orb-dot-amber { background: var(--amber); }
.orb-dot-muted { background: var(--line-strong); }

/* ---- Forms / inputs ---- */
.orb-input { border: 1px solid var(--line-strong); border-radius: 8px; padding: 9px 11px; font-family: inherit; font-size: 13.5px; background: #fff; color: var(--ink); width: 100%; }
.orb-input:focus { outline: 2px solid var(--amber); outline-offset: 1px; }
.orb-input-sm { padding: 6px 8px; font-size: 12.5px; }
.orb-input-pin { width: 90px; text-align: center; letter-spacing: 3px; font-weight: 700; flex: none; }
.orb-input-narrow { width: 90px; flex: none; }
.orb-form-col { display: flex; flex-direction: column; gap: 10px; }
.orb-add-row { display: grid; grid-template-columns: 2fr 1fr auto; gap: 8px; margin-bottom: 8px; align-items: center; }
.orb-add-row-pin { grid-template-columns: 2fr 1fr auto auto auto; }
.orb-pin-edit-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; }
.orb-filter-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 4px; }
.orb-filter-row .orb-input { width: auto; min-width: 170px; }
.orb-segment { display: flex; border: 1px solid var(--line-strong); border-radius: 8px; overflow: hidden; }
.orb-segment button { padding: 8px 12px; background: #fff; border: none; border-right: 1px solid var(--line-strong); font-family: inherit; font-size: 12.5px; font-weight: 600; color: var(--ink-soft); cursor: pointer; }
.orb-segment button:last-child { border-right: none; }
.orb-segment button.active { background: var(--navy); color: #fff; }
.orb-row-actions { display: flex; gap: 4px; align-items: center; white-space: nowrap; flex-wrap: wrap; }
.orb-reorder-cell { display: flex; gap: 2px; width: 1%; white-space: nowrap; }
.orb-edit-row td { background: var(--paper-2); }
.orb-settings-card { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 16px; max-width: 420px; }
.orb-settings-row { display: flex; align-items: center; gap: 10px; margin-top: 4px; }

/* ---- Modal ---- */
.orb-modal-overlay { position: fixed; inset: 0; background: rgba(16,24,46,0.45); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
.orb-modal { background: #fff; border-radius: 14px; width: 100%; max-width: 440px; padding: 20px; }
.orb-modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.orb-modal-head h3 { margin: 0; font-size: 16px; }

/* ---- Location toggle ---- */
.orb-loc-toggle { display: flex; border: 1px solid var(--line-strong); border-radius: 8px; overflow: hidden; width: fit-content; margin-top: 4px; }
.orb-loc-toggle button { display: flex; align-items: center; gap: 5px; padding: 7px 12px; background: #fff; border: none; border-right: 1px solid var(--line-strong); font-family: inherit; font-size: 12.5px; font-weight: 600; color: var(--ink-soft); cursor: pointer; }
.orb-loc-toggle button:last-child { border-right: none; }
.orb-loc-toggle button.active { background: var(--navy); color: #fff; }
.orb-loc-toggle.disabled button { opacity: 0.5; cursor: not-allowed; }
.orb-current-loc { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--ink-soft); font-weight: 600; }

/* ---- Badge/text color utilities ---- */
.orb-badge-teal-solid { background: var(--teal); color: #fff; }
.orb-badge-amber-solid { background: var(--amber); color: #3A2600; }
.orb-badge-tiny { font-size: 9.5px; padding: 1px 6px; margin-left: 4px; }
.orb-text-rose { color: var(--rose); font-weight: 600; }
.orb-text-teal { color: var(--teal); font-weight: 600; }

/* ---- Day-grouped history ---- */
.orb-day-groups { display: flex; flex-direction: column; gap: 12px; }
.orb-day-card { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; }
.orb-day-card-head { display: flex; justify-content: space-between; font-weight: 700; font-size: 13.5px; color: var(--navy); margin-bottom: 8px; }
.orb-day-breaks { margin-top: 8px; }

/* ---- Shift schedule ---- */
.orb-shift-list { display: flex; flex-direction: column; gap: 6px; }
.orb-shift-row { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid var(--line); border-left: 3px solid var(--line-strong); border-radius: 8px; padding: 9px 12px; font-size: 13px; flex-wrap: wrap; }
.orb-shift-row.day { border-left-color: var(--amber); }
.orb-shift-row.night { border-left-color: var(--navy-3); }
.orb-shift-date { font-weight: 600; }
.orb-shift-badge { margin: 0; }
.orb-shift-type-toggle { display: flex; border: 1px solid var(--line-strong); border-radius: 6px; overflow: hidden; flex-shrink: 0; }
.orb-shift-type-toggle button { display: flex; align-items: center; padding: 4px 7px; background: #fff; border: none; border-right: 1px solid var(--line-strong); cursor: pointer; color: var(--ink-soft); }
.orb-shift-type-toggle button:last-child { border-right: none; }
.orb-shift-type-toggle button.active { background: var(--navy); color: #fff; }
.orb-shift-time { color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.orb-shift-notes { color: var(--ink-soft); font-style: italic; }
.orb-schedule-form { display: grid; grid-template-columns: 1fr 1fr auto auto auto 1.4fr auto; gap: 8px; margin-bottom: 16px; align-items: center; }

/* ---- Task log grid ---- */
.orb-day-picker { margin-bottom: 10px; overflow-x: auto; }
.orb-task-grid-wrap { overflow-x: auto; }
.orb-task-grid { border-collapse: collapse; font-size: 11.5px; background: #fff; }
.orb-task-grid th, .orb-task-grid td { border: 1px solid var(--line); padding: 4px 6px; text-align: center; }
.orb-task-grid th { background: var(--paper-2); color: var(--ink-soft); font-weight: 600; }
.orb-task-grid td input[type="checkbox"] { width: 15px; height: 15px; cursor: pointer; }

/* ---- Earnings / balance submission ---- */
.orb-earnings-card { margin-top: 22px; border-top: 1px dashed var(--line-strong); padding-top: 18px; }
.orb-cut-table td:first-child { font-weight: 600; }
.orb-kes { color: var(--ink-soft); font-size: 12px; display: block; }
.orb-earnings-form { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
.orb-earnings-add-row { grid-template-columns: 1.6fr 1fr 1fr auto; }
.orb-file-btn { cursor: pointer; }
.orb-file-name { font-size: 12px; color: var(--ink-soft); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.orb-screenshot-preview { max-width: 160px; max-height: 160px; border-radius: 8px; border: 1px solid var(--line); margin: 6px 0; display: block; }
.orb-points-toggle { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--ink-soft); margin: 8px 0 0; cursor: pointer; }
.orb-points-toggle input { width: 15px; height: 15px; }
.orb-verify-row { display: flex; gap: 12px; align-items: flex-start; margin-top: 10px; flex-wrap: wrap; }
.orb-verify-controls { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.orb-hist-note { color: var(--ink-soft); font-weight: 400; }
.orb-verify-icon-ok { color: var(--teal); flex-shrink: 0; }
.orb-verify-icon-warn { color: var(--rose); flex-shrink: 0; }
.orb-balance-history { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; }
.orb-balance-row { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; background: #fff; border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; }
.orb-roster-earnings { color: var(--ink-soft); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }

/* ---- Responsive ---- */
@media (max-width: 720px) {
  .orb-admin { flex-direction: column; }
  .orb-sidebar { width: 100%; flex-direction: row; overflow-x: auto; padding: 10px; }
  .orb-sidebar-btn { flex-shrink: 0; }
  .orb-body { padding: 14px; }
  .orb-clock-top { flex-direction: column; align-items: center; text-align: center; }
  .orb-header { padding: 10px 14px; }
  .orb-add-row, .orb-add-row-pin, .orb-earnings-add-row { grid-template-columns: 1fr; }
  .orb-employee-grid { grid-template-columns: 1fr 1fr; }
  .orb-schedule-form { grid-template-columns: 1fr 1fr; }
  .orb-roster-row { flex-wrap: wrap; }
  .orb-roster-earnings { margin-left: 34px; }
}
`;