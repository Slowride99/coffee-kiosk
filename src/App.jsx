import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;600&display=swap');`;

// Category display config — maps DB category names to UI config
const CATEGORY_CONFIG = {
  bread:      { label: "Bread",       emoji: "🍞", maxSelect: 1,    required: true  },
  condiment:  { label: "Condiments",  emoji: "🫙", maxSelect: null, required: false },
  meat:       { label: "Meat",        emoji: "🥩", maxSelect: null, required: false },
  cheese:     { label: "Cheese",      emoji: "🧀", maxSelect: null, required: false },
  veggie:     { label: "Veggies",     emoji: "🥬", maxSelect: null, required: false },
  other:      { label: "Other",       emoji: "🍎", maxSelect: 2,    required: false },
  dressing:   { label: "Dressing",    emoji: "🫗", maxSelect: null, required: false },
};

const CATEGORY_ORDER = ["bread", "condiment", "meat", "cheese", "veggie", "other", "dressing"];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function calcUpcharge(selections, menuItems) {
  return Object.entries(selections).reduce((total, [, ids]) => {
    return total + ids.reduce((sum, id) => {
      const item = menuItems.find(m => m.id === id);
      return sum + (item?.upcharge || 0);
    }, 0);
  }, 0);
}

function getLabelById(id, menuItems) {
  return menuItems.find(m => m.id === id)?.label || id;
}

function buildSummaryLine(order, menuItems) {
  const parts = [];
  const breadIds = order.selections?.bread || [];
  const meatIds = order.selections?.meat || [];
  if (breadIds.length) parts.push(breadIds.map(id => getLabelById(id, menuItems)).join(", "));
  if (meatIds.length) parts.push(meatIds.map(id => getLabelById(id, menuItems)).join(", "));
  else if (order.order_type) parts.push(order.order_type.charAt(0).toUpperCase() + order.order_type.slice(1));
  if (order.toasted) parts.push("Toasted");
  return parts.join(" · ") || order.order_type || "No details";
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const secs = Math.floor((new Date() - new Date(dateStr)) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

async function getNextQueuePosition() {
  const today = new Date().toISOString().split("T")[0];
  const { count } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .gte("created_at", today + "T00:00:00");
  return (count || 0) + 1;
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const css = `
${FONTS}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #1c1409; --bg2: #241c0e; --bg3: #2e2310;
  --card: #2e2310; --card-hover: #3a2d14; --card-selected: #8b5e1a;
  --accent: #d4922a; --accent2: #e8b84b;
  --text: #f5ead8; --text-muted: #a89070; --text-dim: #6e5a40;
  --green: #5a8a4a; --green-light: #7ab86a;
  --border: #3d2e18; --red: #c0392b;
  --reg-bg: #0e1a0e; --reg-bg2: #132013; --reg-bg3: #192619;
  --reg-card: #1a2e1a; --reg-card-hover: #213821;
  --reg-accent: #5aaa3a; --reg-accent2: #7ed44a; --reg-border: #263d26;
  --kit-bg: #0d0d12; --kit-bg2: #13131a; --kit-bg3: #1a1a24;
  --kit-card: #16161f; --kit-accent: #5b8fff; --kit-accent2: #7aabff;
  --kit-border: #252535; --kit-done: #3aaa6a; --kit-done2: #5acc8a;
  --kit-text: #e8eaf6; --kit-muted: #8890b0; --kit-dim: #44465a;
}
body { background: var(--bg); color: var(--text); font-family: 'DM Sans', sans-serif; width: 100%; }
html, body, #root { height: 100%; width: 100%; }
.app-shell { display: flex; flex-direction: column; height: 100vh; width: 100vw; overflow: hidden; }
.demo-bar { background: #111; border-bottom: 1px solid #1e1e1e; padding: 7px 16px; font-size: 11px; color: #555; text-align: center; flex-shrink: 0; letter-spacing: 0.5px; }
.screen-tabs { display: flex; background: #090909; border-bottom: 1px solid #1a1a1a; flex-shrink: 0; }
.screen-tab { flex: 1; padding: 13px 8px; border: none; background: transparent; color: #444; font-size: 12px; font-weight: 700; font-family: 'DM Sans', sans-serif; cursor: pointer; letter-spacing: 1.2px; text-transform: uppercase; border-bottom: 3px solid transparent; transition: all 0.15s; }
.screen-tab:hover { color: #888; }
.screen-tab.active-kiosk { color: var(--accent2); border-bottom-color: var(--accent2); }
.screen-tab.active-register { color: var(--reg-accent2); border-bottom-color: var(--reg-accent2); }
.screen-tab.active-kitchen { color: var(--kit-accent2); border-bottom-color: var(--kit-accent2); }
.tab-badge { display: inline-flex; align-items: center; justify-content: center; background: var(--red); color: #fff; font-size: 10px; font-weight: 800; width: 17px; height: 17px; border-radius: 50%; margin-left: 5px; }
.screen-content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.loading-screen { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 16px; gap: 12px; }
.spinner { width: 20px; height: 20px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── KIOSK ── */
.kiosk { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg); }
.welcome-screen { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px; gap: 28px; background: radial-gradient(ellipse at 50% 30%, #2e1f08 0%, var(--bg) 70%); }
.welcome-logo h1 { font-family: 'Playfair Display', serif; font-size: 46px; font-weight: 900; color: var(--accent2); letter-spacing: -1px; text-align: center; }
.welcome-logo p { color: var(--text-muted); font-size: 13px; margin-top: 6px; letter-spacing: 2px; text-transform: uppercase; text-align: center; }
.name-input-wrap { width: 100%; max-width: 420px; }
.name-input-wrap label { display: block; color: var(--text-muted); font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 8px; }
.name-input { width: 100%; padding: 15px 16px; font-size: 20px; font-family: 'DM Sans', sans-serif; background: var(--bg3); border: 2px solid var(--border); border-radius: 10px; color: var(--text); outline: none; transition: border-color 0.2s; }
.name-input:focus { border-color: var(--accent); }
.name-input::placeholder { color: var(--text-dim); }
.toggle-row { display: flex; gap: 10px; width: 100%; max-width: 420px; }
.toggle-btn { flex: 1; padding: 13px; border-radius: 10px; border: 2px solid var(--border); background: var(--card); color: var(--text-muted); font-size: 15px; font-family: 'DM Sans', sans-serif; font-weight: 600; cursor: pointer; transition: all 0.15s; }
.toggle-btn:hover { border-color: var(--accent); color: var(--text); }
.toggle-btn.active { background: var(--card-selected); border-color: var(--accent2); color: var(--accent2); }
.start-btn { width: 100%; max-width: 420px; padding: 17px; border-radius: 12px; border: none; background: var(--accent); color: #1a0f00; font-size: 17px; font-weight: 700; font-family: 'DM Sans', sans-serif; cursor: pointer; transition: all 0.15s; }
.start-btn:hover:not(:disabled) { background: var(--accent2); }
.start-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.type-screen { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 28px; gap: 24px; background: radial-gradient(ellipse at 50% 20%, #1e1a08 0%, var(--bg) 70%); }
.type-cards { display: flex; gap: 12px; width: 100%; max-width: 520px; }
.type-card { flex: 1; padding: 26px 12px; border-radius: 12px; border: 2px solid var(--border); background: var(--card); text-align: center; cursor: pointer; transition: all 0.15s; }
.type-card:hover { border-color: var(--accent); background: var(--card-hover); }
.type-card.active { border-color: var(--accent2); background: var(--card-selected); }
.type-emoji { font-size: 36px; display: block; margin-bottom: 8px; }
.type-label { font-size: 16px; font-weight: 700; }
.toast-row { display: flex; gap: 10px; align-items: center; }
.toast-label { color: var(--text-muted); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-right: 6px; }
.step-layout { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.step-header { padding: 16px 22px 12px; background: var(--bg2); border-bottom: 1px solid var(--border); flex-shrink: 0; }
.step-header-top { display: flex; align-items: center; justify-content: space-between; }
.step-title { font-family: 'Playfair Display', serif; font-size: 26px; font-weight: 700; color: var(--accent2); }
.step-hint { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.customer-tag { font-size: 12px; color: var(--text-muted); background: var(--bg3); padding: 5px 12px; border-radius: 20px; border: 1px solid var(--border); }
.progress-bar { display: flex; gap: 4px; padding: 10px 22px 0; background: var(--bg2); flex-shrink: 0; }
.progress-dot { height: 4px; flex: 1; border-radius: 2px; background: var(--border); transition: background 0.3s; }
.progress-dot.done { background: var(--accent); }
.progress-dot.active { background: var(--accent2); }
.options-scroll { flex: 1; overflow-y: auto; padding: 16px 22px; }
.options-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
.option-tile { padding: 15px 12px; border-radius: 10px; border: 2px solid var(--border); background: var(--card); cursor: pointer; transition: all 0.12s; position: relative; text-align: center; }
.option-tile:hover { border-color: var(--accent); background: var(--card-hover); transform: translateY(-1px); }
.option-tile.selected { border-color: var(--accent2); background: var(--card-selected); }
.option-tile.disabled-max { opacity: 0.3; cursor: not-allowed; pointer-events: none; }
.option-label { font-size: 14px; font-weight: 600; }
.upcharge-badge { position: absolute; top: -7px; right: -7px; background: var(--green); color: #fff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 8px; }
.check-mark { position: absolute; top: 6px; left: 8px; font-size: 11px; color: var(--accent2); }
.step-footer { padding: 12px 22px; background: var(--bg2); border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.selection-pills { display: flex; flex-wrap: wrap; gap: 5px; max-width: 400px; }
.pill { background: var(--bg3); border: 1px solid var(--border); color: var(--text-muted); font-size: 11px; padding: 3px 8px; border-radius: 7px; }
.pill.upcharge { border-color: var(--green); color: var(--green-light); }
.no-selection { color: var(--text-dim); font-size: 11px; font-style: italic; }
.nav-btns { display: flex; gap: 8px; flex-shrink: 0; margin-left: 10px; }
.btn-back { padding: 9px 18px; border-radius: 8px; border: 2px solid var(--border); background: transparent; color: var(--text-muted); font-size: 13px; font-weight: 600; font-family: 'DM Sans', sans-serif; cursor: pointer; transition: all 0.12s; }
.btn-back:hover { border-color: var(--accent); color: var(--text); }
.btn-next { padding: 9px 20px; border-radius: 8px; border: none; background: var(--accent); color: #1a0f00; font-size: 13px; font-weight: 700; font-family: 'DM Sans', sans-serif; cursor: pointer; transition: all 0.12s; }
.btn-next:hover { background: var(--accent2); }
.btn-next.final { background: var(--green); color: #fff; }
.summary-screen { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.summary-header { padding: 18px 22px 12px; background: var(--bg2); border-bottom: 1px solid var(--border); flex-shrink: 0; }
.summary-header h2 { font-family: 'Playfair Display', serif; font-size: 24px; color: var(--accent2); }
.summary-header p { color: var(--text-muted); font-size: 12px; margin-top: 2px; }
.summary-scroll { flex: 1; overflow-y: auto; padding: 16px 22px; }
.summary-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
.meta-badge { padding: 6px 12px; border-radius: 7px; background: var(--bg3); border: 1px solid var(--border); font-size: 12px; font-weight: 600; }
.summary-section { margin-bottom: 12px; }
.summary-section-label { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text-dim); margin-bottom: 5px; font-weight: 600; }
.summary-items { display: flex; flex-wrap: wrap; gap: 5px; }
.summary-item { padding: 4px 10px; border-radius: 6px; background: var(--card); border: 1px solid var(--border); font-size: 12px; display: flex; align-items: center; gap: 4px; }
.upcharge-text { font-size: 11px; color: var(--green-light); font-weight: 600; }
.summary-empty { font-size: 11px; color: var(--text-dim); font-style: italic; }
.upcharge-total { margin-top: 18px; padding: 14px 16px; border-radius: 10px; background: var(--bg3); border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
.upcharge-total span { font-size: 13px; color: var(--text-muted); }
.upcharge-total strong { font-size: 18px; color: var(--accent2); }
.summary-footer { padding: 12px 22px; background: var(--bg2); border-top: 1px solid var(--border); display: flex; gap: 10px; flex-shrink: 0; }
.btn-submit { flex: 1; padding: 14px; border-radius: 10px; border: none; background: var(--green); color: #fff; font-size: 16px; font-weight: 700; font-family: 'DM Sans', sans-serif; cursor: pointer; }
.btn-submit:hover:not(:disabled) { background: var(--green-light); }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-edit { padding: 14px 18px; border-radius: 10px; border: 2px solid var(--border); background: transparent; color: var(--text-muted); font-size: 14px; font-weight: 600; font-family: 'DM Sans', sans-serif; cursor: pointer; }
.confirm-screen { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 28px; gap: 18px; text-align: center; background: radial-gradient(ellipse at 50% 40%, #0d2010 0%, var(--bg) 70%); }
.confirm-check { width: 76px; height: 76px; border-radius: 50%; background: var(--green); display: flex; align-items: center; justify-content: center; font-size: 36px; animation: pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
@keyframes pop { 0% { transform: scale(0); } 100% { transform: scale(1); } }
.confirm-name { font-family: 'Playfair Display', serif; font-size: 34px; color: var(--accent2); }
.confirm-queue { font-size: 58px; font-weight: 900; color: var(--accent2); line-height: 1; font-family: 'Playfair Display', serif; }
.confirm-label { color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 3px; }
.confirm-sub { color: var(--text-muted); font-size: 14px; max-width: 300px; line-height: 1.5; }
.confirm-reset-bar { width: 100%; max-width: 320px; height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
.confirm-reset-fill { height: 100%; background: var(--accent); border-radius: 2px; animation: drain 12s linear forwards; }
@keyframes drain { from { width: 100%; } to { width: 0%; } }
.confirm-note { color: var(--text-dim); font-size: 11px; }
.error-msg { color: #e87a4a; font-size: 13px; text-align: center; }

/* ── REGISTER ── */
.register { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--reg-bg); }
.register-header { padding: 16px 22px; background: var(--reg-bg2); border-bottom: 1px solid var(--reg-border); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.register-header h2 { font-family: 'Playfair Display', serif; font-size: 24px; color: var(--reg-accent2); }
.register-header-meta { display: flex; gap: 20px; }
.reg-stat .stat-num { font-size: 22px; font-weight: 800; color: var(--reg-accent2); line-height: 1; text-align: right; }
.reg-stat .stat-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); text-align: right; }
.register-scroll { flex: 1; overflow-y: auto; padding: 18px 22px; }
.empty-queue { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--text-dim); padding: 60px 28px; text-align: center; }
.empty-queue .empty-icon { font-size: 44px; opacity: 0.3; }
.empty-queue p { font-size: 15px; }
.empty-queue small { font-size: 12px; }
.order-card { background: var(--reg-card); border: 2px solid var(--reg-border); border-radius: 12px; margin-bottom: 12px; overflow: hidden; animation: slideIn 0.25s ease; }
@keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
.order-card-header { padding: 12px 16px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--reg-border); cursor: pointer; }
.order-card-header:hover { background: var(--reg-card-hover); }
.order-num { width: 42px; height: 42px; border-radius: 9px; background: var(--reg-bg3); display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 800; color: var(--reg-accent2); flex-shrink: 0; border: 1px solid var(--reg-border); }
.order-card-info { flex: 1; min-width: 0; }
.order-card-name { font-size: 19px; font-weight: 700; line-height: 1; }
.order-card-summary { font-size: 12px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.order-card-meta { display: flex; gap: 6px; align-items: center; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
.order-badge { padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 700; background: var(--reg-bg3); border: 1px solid var(--reg-border); color: var(--text-muted); }
.order-badge.here { border-color: #3a5a7a; color: #7ab8d4; background: #0e1e2e; }
.order-badge.go { border-color: #7a5a2a; color: var(--accent2); background: #2a1e0a; }
.order-badge.toasted { border-color: #7a4a2a; color: #e8904a; background: #2a150a; }
.upcharge-tag { font-size: 11px; font-weight: 700; color: var(--green-light); background: #0e2010; border: 1px solid #2a4a2a; padding: 3px 8px; border-radius: 5px; }
.order-time { font-size: 10px; color: var(--text-dim); }
.order-detail { padding: 14px 16px; }
.detail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; margin-bottom: 14px; }
.detail-section-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-dim); margin-bottom: 4px; font-weight: 600; }
.detail-items { display: flex; flex-wrap: wrap; gap: 4px; }
.detail-chip { padding: 3px 8px; border-radius: 5px; background: var(--reg-bg3); border: 1px solid var(--reg-border); font-size: 11px; color: var(--text-muted); }
.detail-chip.upcharge { border-color: var(--green); color: var(--green-light); }
.mark-paid-btn { width: 100%; padding: 13px; border-radius: 10px; border: none; background: var(--reg-accent); color: #0a1a0a; font-size: 15px; font-weight: 800; font-family: 'DM Sans', sans-serif; cursor: pointer; transition: all 0.12s; }
.mark-paid-btn:hover { background: var(--reg-accent2); transform: translateY(-1px); }
.mark-paid-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

/* ── KITCHEN ── */
.kitchen { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--kit-bg); color: var(--kit-text); }
.kitchen-header { padding: 16px 24px; background: var(--kit-bg2); border-bottom: 1px solid var(--kit-border); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.kitchen-header-left h2 { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 700; color: var(--kit-accent2); }
.kitchen-header-left p { font-size: 11px; color: var(--kit-muted); margin-top: 2px; letter-spacing: 0.5px; }
.kitchen-stats { display: flex; gap: 20px; }
.kit-stat .stat-num { font-size: 24px; font-weight: 900; color: var(--kit-accent2); line-height: 1; text-align: right; }
.kit-stat .stat-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: var(--kit-muted); text-align: right; }
.kit-stat.done-stat .stat-num { color: var(--kit-done2); }
.kitchen-scroll { flex: 1; overflow-y: auto; padding: 18px 20px; }
.kitchen-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; padding: 60px 28px; }
.kitchen-empty .empty-icon { font-size: 52px; opacity: 0.2; }
.kitchen-empty p { font-size: 18px; color: var(--kit-muted); }
.kitchen-empty small { font-size: 13px; color: var(--kit-dim); }
.kitchen-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; align-items: start; }
.kitchen-ticket { background: var(--kit-card); border: 2px solid var(--kit-border); border-radius: 14px; overflow: hidden; animation: ticketIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.1); transition: border-color 0.2s; }
.kitchen-ticket:hover { border-color: #3a3a58; }
.kitchen-ticket.urgent { border-color: #884422; }
@keyframes ticketIn { from { opacity: 0; transform: scale(0.95) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
.ticket-done-flash { animation: flashDone 0.38s ease forwards; }
@keyframes flashDone { 0% { opacity: 1; } 60% { opacity: 0.3; transform: scale(1.01); } 100% { opacity: 0; transform: scale(0.96); } }
.ticket-header { padding: 14px 16px 12px; background: var(--kit-bg3); border-bottom: 1px solid var(--kit-border); display: flex; align-items: center; justify-content: space-between; }
.ticket-num-name { display: flex; align-items: center; gap: 10px; }
.ticket-num { width: 38px; height: 38px; border-radius: 8px; background: var(--kit-accent); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 900; flex-shrink: 0; }
.ticket-name { font-size: 22px; font-weight: 800; color: var(--kit-text); line-height: 1; font-family: 'Playfair Display', serif; }
.ticket-header-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.ticket-meta-row { display: flex; gap: 5px; }
.ticket-badge { padding: 3px 8px; border-radius: 5px; font-size: 10px; font-weight: 700; background: var(--kit-bg); border: 1px solid var(--kit-border); color: var(--kit-muted); }
.ticket-badge.here { border-color: #2a4a6a; color: #7ab8d4; background: #0a1520; }
.ticket-badge.go { border-color: #5a4010; color: #d4922a; background: #1a1005; }
.ticket-badge.toasted { border-color: #6a3010; color: #e8904a; background: #1a0e05; }
.ticket-badge.type-badge { border-color: #3a3a5a; color: var(--kit-accent2); background: #10101a; }
.ticket-time { font-size: 10px; color: var(--kit-dim); }
.ticket-time.urgent-time { color: #e87a4a; font-weight: 700; }
.ticket-body { padding: 12px 16px 14px; }
.ticket-row { display: flex; gap: 6px; align-items: flex-start; padding: 6px 0; border-bottom: 1px solid var(--kit-border); }
.ticket-row:last-child { border-bottom: none; }
.ticket-row-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--kit-dim); font-weight: 700; width: 68px; flex-shrink: 0; padding-top: 2px; }
.ticket-row-items { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; }
.ticket-item { font-size: 13px; font-weight: 600; color: var(--kit-text); background: var(--kit-bg3); border: 1px solid var(--kit-border); padding: 3px 9px; border-radius: 5px; }
.ticket-item.highlight { color: var(--kit-accent2); border-color: #2a3a5a; background: #0e1220; }
.ticket-item.upcharge { color: var(--kit-done2); border-color: #1a3a22; background: #0a1a0e; }
.ticket-footer { padding: 12px 16px; border-top: 1px solid var(--kit-border); }
.done-btn { width: 100%; padding: 13px; border-radius: 10px; border: none; background: var(--kit-done); color: #fff; font-size: 16px; font-weight: 800; font-family: 'DM Sans', sans-serif; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; gap: 8px; letter-spacing: 0.3px; }
.done-btn:hover { background: var(--kit-done2); transform: translateY(-1px); }
.done-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.kitchen-completed-bar { padding: 8px 20px; background: var(--kit-bg2); border-top: 1px solid var(--kit-border); display: flex; align-items: center; gap: 12px; flex-shrink: 0; overflow: hidden; }
.completed-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--kit-dim); font-weight: 700; flex-shrink: 0; }
.completed-items { display: flex; gap: 8px; overflow: hidden; }
.completed-chip { padding: 4px 12px; border-radius: 6px; background: #0d2010; border: 1px solid #1e4020; font-size: 12px; color: var(--kit-done2); font-weight: 600; white-space: nowrap; }
.completed-empty { font-size: 12px; color: var(--kit-dim); font-style: italic; }
`;

// ─── OPTION TILE ──────────────────────────────────────────────────────────────
function OptionTile({ item, selected, onToggle, disabled }) {
  return (
    <div className={`option-tile ${selected ? "selected" : ""} ${disabled ? "disabled-max" : ""}`}
      onClick={() => !disabled && onToggle(item.id)}>
      {selected && <span className="check-mark">✓</span>}
      {item.upcharge > 0 && <span className="upcharge-badge">+${item.upcharge.toFixed(2)}</span>}
      <div className="option-label">{item.label}</div>
    </div>
  );
}

// ─── STEP SCREEN ─────────────────────────────────────────────────────────────
function StepScreen({ categoryKey, items, config, selections, onToggle, onBack, onNext, customerName, stepIndex, totalSteps }) {
  const selected = selections[categoryKey] || [];
  const atMax = config.maxSelect && selected.length >= config.maxSelect;
  const isLast = stepIndex === totalSteps - 1;

  return (
    <div className="step-layout">
      <div className="step-header">
        <div className="step-header-top">
          <div>
            <div className="step-title">{config.emoji} {config.label}</div>
            <div className="step-hint">
              {config.maxSelect === 1 ? "Choose one" : config.maxSelect ? `Choose up to ${config.maxSelect}` : "Choose any — or skip"}
            </div>
          </div>
          <div className="customer-tag">👤 {customerName}</div>
        </div>
      </div>
      <div className="progress-bar">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div key={i} className={`progress-dot ${i < stepIndex ? "done" : i === stepIndex ? "active" : ""}`} />
        ))}
      </div>
      <div className="options-scroll">
        <div className="options-grid">
          {items.map(item => (
            <OptionTile key={item.id} item={item}
              selected={selected.includes(item.id)}
              onToggle={(id) => onToggle(categoryKey, id, config.maxSelect)}
              disabled={atMax && !selected.includes(item.id)} />
          ))}
        </div>
      </div>
      <div className="step-footer">
        <div style={{ flex: 1 }}>
          {selected.length === 0 ? <span className="no-selection">Nothing selected</span> : (
            <div className="selection-pills">
              {selected.map(id => {
                const it = items.find(i => i.id === id);
                return <span key={id} className={`pill ${it?.upcharge > 0 ? "upcharge" : ""}`}>{it?.label}{it?.upcharge > 0 ? ` +$${it.upcharge.toFixed(2)}` : ""}</span>;
              })}
            </div>
          )}
        </div>
        <div className="nav-btns">
          <button className="btn-back" onClick={onBack}>← Back</button>
          <button className={`btn-next ${isLast ? "final" : ""}`} onClick={onNext}>
            {isLast ? "Review →" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── KIOSK ────────────────────────────────────────────────────────────────────
function Kiosk({ menuItems }) {
  const [step, setStep] = useState("welcome");
  const [name, setName] = useState("");
  const [hereOrGo, setHereOrGo] = useState("here");
  const [orderType, setOrderType] = useState("combo");
  const [toasted, setToasted] = useState(false);
  const [selections, setSelections] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [queueNum, setQueueNum] = useState(null);

  // Group menu items by category, in order
  const menuByCategory = CATEGORY_ORDER.reduce((acc, cat) => {
    acc[cat] = menuItems.filter(m => m.category === cat && m.active).sort((a, b) => a.sort_order - b.sort_order);
    return acc;
  }, {});

  const categorySteps = CATEGORY_ORDER.filter(cat => menuByCategory[cat]?.length > 0);
  const currentStepIndex = categorySteps.indexOf(step);

  const toggle = (category, id, maxSelect) => {
    setSelections(prev => {
      const cur = prev[category] || [];
      if (maxSelect === 1) return { ...prev, [category]: cur.includes(id) ? [] : [id] };
      if (cur.includes(id)) return { ...prev, [category]: cur.filter(x => x !== id) };
      if (maxSelect && cur.length >= maxSelect) return prev;
      return { ...prev, [category]: [...cur, id] };
    });
  };

  const goNext = () => {
    if (step === "welcome") { setStep("type"); return; }
    if (step === "type") { setStep(categorySteps[0]); return; }
    if (currentStepIndex >= 0 && currentStepIndex < categorySteps.length - 1) {
      setStep(categorySteps[currentStepIndex + 1]); return;
    }
    if (currentStepIndex === categorySteps.length - 1) { setStep("summary"); return; }
    if (step === "summary") handleSubmit();
  };

  const goBack = () => {
    if (step === "type") { setStep("welcome"); return; }
    if (currentStepIndex === 0) { setStep("type"); return; }
    if (currentStepIndex > 0) { setStep(categorySteps[currentStepIndex - 1]); return; }
    if (step === "summary") { setStep(categorySteps[categorySteps.length - 1]); return; }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const queuePosition = await getNextQueuePosition();
      const upchargeTotal = calcUpcharge(selections, menuItems);

      // Insert order
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert({
          customer_name: name.trim(),
          order_type: orderType,
          here_or_go: hereOrGo,
          toasted,
          upcharge_total: upchargeTotal,
          status: "pending",
          queue_position: queuePosition,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Build order_selections rows
      const selectionRows = [];
      Object.entries(selections).forEach(([category, ids]) => {
        ids.forEach(id => {
          const item = menuItems.find(m => m.id === id);
          if (item) {
            selectionRows.push({
              order_id: orderData.id,
              menu_item_id: id,
              category,
              label: item.label,
              upcharge: item.upcharge || 0,
            });
          }
        });
      });

      if (selectionRows.length > 0) {
        const { error: selError } = await supabase.from("order_selections").insert(selectionRows);
        if (selError) throw selError;
      }

      setQueueNum(queuePosition);
      setStep("confirm");
    } catch (err) {
      console.error(err);
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = useCallback(() => {
    setStep("welcome"); setName(""); setHereOrGo("here");
    setOrderType("combo"); setToasted(false); setSelections({});
    setQueueNum(null); setSubmitError(null);
  }, []);

  useEffect(() => {
    if (step === "confirm") { const t = setTimeout(reset, 12000); return () => clearTimeout(t); }
  }, [step, reset]);

  const upcharge = calcUpcharge(selections, menuItems);

  return (
    <div className="kiosk">
      {step === "welcome" && (
        <div className="welcome-screen">
          <div className="welcome-logo"><h1>Build Your Order</h1><p>Sandwiches · Salads · Soups</p></div>
          <div className="name-input-wrap">
            <label>Your name</label>
            <input className="name-input" placeholder="First name..." value={name}
              onChange={e => setName(e.target.value)} maxLength={30} />
          </div>
          <div className="toggle-row">
            <button className={`toggle-btn ${hereOrGo === "here" ? "active" : ""}`} onClick={() => setHereOrGo("here")}>🪑 For Here</button>
            <button className={`toggle-btn ${hereOrGo === "go" ? "active" : ""}`} onClick={() => setHereOrGo("go")}>🛍 To Go</button>
          </div>
          <button className="start-btn" disabled={!name.trim()} onClick={goNext}>Start Building →</button>
        </div>
      )}

      {step === "type" && (
        <div className="type-screen">
          <div className="welcome-logo"><h1 style={{ fontSize: 32 }}>What are you having?</h1></div>
          <div className="type-cards">
            {[{ id: "combo", label: "Combo", emoji: "🥪" }, { id: "salad", label: "Salad", emoji: "🥗" }, { id: "soup", label: "Soup", emoji: "🍲" }].map(t => (
              <div key={t.id} className={`type-card ${orderType === t.id ? "active" : ""}`} onClick={() => setOrderType(t.id)}>
                <span className="type-emoji">{t.emoji}</span><div className="type-label">{t.label}</div>
              </div>
            ))}
          </div>
          <div className="toast-row">
            <span className="toast-label">Toasted?</span>
            <button className={`toggle-btn ${toasted ? "active" : ""}`} style={{ minWidth: 76 }} onClick={() => setToasted(true)}>Yes</button>
            <button className={`toggle-btn ${!toasted ? "active" : ""}`} style={{ minWidth: 76 }} onClick={() => setToasted(false)}>No</button>
          </div>
          <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 420 }}>
            <button className="btn-back" style={{ padding: "13px 20px" }} onClick={goBack}>← Back</button>
            <button className="start-btn" style={{ flex: 1 }} onClick={goNext}>Continue →</button>
          </div>
        </div>
      )}

      {categorySteps.includes(step) && (
        <StepScreen
          categoryKey={step}
          items={menuByCategory[step] || []}
          config={CATEGORY_CONFIG[step]}
          selections={selections}
          onToggle={toggle}
          onBack={goBack}
          onNext={goNext}
          customerName={name}
          stepIndex={currentStepIndex}
          totalSteps={categorySteps.length}
        />
      )}

      {step === "summary" && (
        <div className="summary-screen">
          <div className="summary-header"><h2>Review Your Order</h2><p>Make sure everything looks right</p></div>
          <div className="summary-scroll">
            <div className="summary-meta">
              <div className="meta-badge">👤 {name}</div>
              <div className="meta-badge">{hereOrGo === "here" ? "🪑 For Here" : "🛍 To Go"}</div>
              <div className="meta-badge">{orderType === "combo" ? "🥪" : orderType === "salad" ? "🥗" : "🍲"} {orderType.charAt(0).toUpperCase() + orderType.slice(1)}</div>
              <div className="meta-badge">{toasted ? "🔥 Toasted" : "❄️ Not Toasted"}</div>
            </div>
            {CATEGORY_ORDER.map(cat => {
              const config = CATEGORY_CONFIG[cat];
              const sel = selections[cat] || [];
              const items = menuByCategory[cat] || [];
              return (
                <div key={cat} className="summary-section">
                  <div className="summary-section-label">{config.emoji} {config.label}</div>
                  {sel.length === 0 ? <span className="summary-empty">None</span> : (
                    <div className="summary-items">
                      {sel.map(id => { const it = items.find(i => i.id === id); return <div key={id} className="summary-item">{it?.label}{it?.upcharge > 0 && <span className="upcharge-text">+${it.upcharge.toFixed(2)}</span>}</div>; })}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="upcharge-total"><span>Upcharges</span><strong>{upcharge > 0 ? `+$${upcharge.toFixed(2)}` : "None"}</strong></div>
            {submitError && <p className="error-msg" style={{ marginTop: 12 }}>{submitError}</p>}
          </div>
          <div className="summary-footer">
            <button className="btn-edit" onClick={goBack} disabled={submitting}>← Edit</button>
            <button className="btn-submit" onClick={goNext} disabled={submitting}>
              {submitting ? "Submitting..." : "✓ Submit Order"}
            </button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div className="confirm-screen">
          <div className="confirm-check">✓</div>
          <div><div className="confirm-label">Order placed for</div><div className="confirm-name">{name}</div></div>
          <div><div className="confirm-label">Queue number</div><div className="confirm-queue">#{queueNum}</div></div>
          <div className="confirm-sub">Head to the register when your name is called!</div>
          {upcharge > 0 && <div style={{ color: "var(--green-light)", fontSize: 12, fontWeight: 600 }}>Upcharge: +${upcharge.toFixed(2)} — payable at register</div>}
          <div className="confirm-reset-bar"><div className="confirm-reset-fill" /></div>
          <div className="confirm-note">Screen resets in 12 seconds</div>
        </div>
      )}
    </div>
  );
}

// ─── ORDER CARD (Register) ────────────────────────────────────────────────────
function OrderCard({ order, menuItems, onMarkPaid }) {
  const [expanded, setExpanded] = useState(false);
  const [marking, setMarking] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // Build selections grouped by category from order_selections
  const byCategory = CATEGORY_ORDER.reduce((acc, cat) => {
    const items = (order.order_selections || []).filter(s => s.category === cat);
    if (items.length) acc[cat] = items;
    return acc;
  }, {});

  const upchargeTotal = (order.order_selections || []).reduce((sum, s) => sum + (s.upcharge || 0), 0);

  const handleMarkPaid = async () => {
    setMarking(true);
    await onMarkPaid(order.id);
    setMarking(false);
  };

  return (
    <div className="order-card">
      <div className="order-card-header" onClick={() => setExpanded(e => !e)}>
        <div className="order-num">#{order.queue_position}</div>
        <div className="order-card-info">
          <div className="order-card-name">{order.customer_name}</div>
          <div className="order-card-summary">{buildSummaryLine({ ...order, selections: Object.fromEntries(CATEGORY_ORDER.map(cat => [cat, (order.order_selections || []).filter(s => s.category === cat).map(s => s.menu_item_id)])) }, menuItems)}</div>
        </div>
        <div className="order-card-meta">
          <span className={`order-badge ${order.here_or_go}`}>{order.here_or_go === "here" ? "🪑 Here" : "🛍 Go"}</span>
          {order.toasted && <span className="order-badge toasted">🔥 Toast</span>}
          {upchargeTotal > 0 && <span className="upcharge-tag">+${upchargeTotal.toFixed(2)}</span>}
          <span className="order-time">{timeAgo(order.created_at)}</span>
          <span style={{ color: "var(--text-dim)", fontSize: 14 }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>
      {expanded && (
        <div className="order-detail">
          <div className="detail-grid">
            {Object.entries(byCategory).map(([cat, items]) => (
              <div key={cat}>
                <div className="detail-section-label">{CATEGORY_CONFIG[cat]?.emoji} {CATEGORY_CONFIG[cat]?.label}</div>
                <div className="detail-items">
                  {items.map(s => <span key={s.id} className={`detail-chip ${s.upcharge > 0 ? "upcharge" : ""}`}>{s.label}</span>)}
                </div>
              </div>
            ))}
          </div>
          <button className="mark-paid-btn" onClick={handleMarkPaid} disabled={marking}>
            {marking ? "Updating..." : "✓ Mark Paid — Send to Kitchen"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── REGISTER ─────────────────────────────────────────────────────────────────
function Register({ orders, menuItems, onMarkPaid }) {
  const pending = orders.filter(o => o.status === "pending").sort((a, b) => a.queue_position - b.queue_position);
  const inKitchen = orders.filter(o => o.status === "paid").length;

  return (
    <div className="register">
      <div className="register-header">
        <div>
          <h2>Register Queue</h2>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>Oldest first — tap to expand</div>
        </div>
        <div className="register-header-meta">
          <div className="reg-stat"><div className="stat-num">{pending.length}</div><div className="stat-label">Pending</div></div>
          <div className="reg-stat"><div className="stat-num">{inKitchen}</div><div className="stat-label">In Kitchen</div></div>
        </div>
      </div>
      <div className="register-scroll">
        {pending.length === 0 ? (
          <div className="empty-queue"><div className="empty-icon">🎉</div><p>Queue is clear</p><small>Kiosk orders appear here in real time</small></div>
        ) : pending.map(o => <OrderCard key={o.id} order={o} menuItems={menuItems} onMarkPaid={onMarkPaid} />)}
      </div>
    </div>
  );
}

// ─── KITCHEN TICKET ───────────────────────────────────────────────────────────
function KitchenTicket({ order, onDone }) {
  const [finishing, setFinishing] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const waitMins = order.paid_at ? Math.floor((new Date() - new Date(order.paid_at)) / 60000) : 0;
  const isUrgent = waitMins >= 8;

  const handleDone = async () => {
    setFinishing(true);
    setTimeout(() => onDone(order.id), 380);
  };

  const rows = CATEGORY_ORDER.map(cat => {
    const items = (order.order_selections || []).filter(s => s.category === cat);
    if (!items.length) return null;
    return { cat, items };
  }).filter(Boolean);

  return (
    <div className={`kitchen-ticket ${isUrgent ? "urgent" : ""} ${finishing ? "ticket-done-flash" : ""}`}>
      <div className="ticket-header">
        <div className="ticket-num-name">
          <div className="ticket-num">#{order.queue_position}</div>
          <div className="ticket-name">{order.customer_name}</div>
        </div>
        <div className="ticket-header-right">
          <div className="ticket-meta-row">
            <span className={`ticket-badge ${order.here_or_go}`}>{order.here_or_go === "here" ? "🪑 Here" : "🛍 Go"}</span>
            {order.toasted && <span className="ticket-badge toasted">🔥 Toast</span>}
            <span className="ticket-badge type-badge">{order.order_type === "combo" ? "🥪" : order.order_type === "salad" ? "🥗" : "🍲"} {order.order_type}</span>
          </div>
          <div className={`ticket-time ${isUrgent ? "urgent-time" : ""}`}>
            {isUrgent ? `⚠️ ${waitMins}m waiting` : waitMins > 0 ? `${waitMins}m` : "just now"}
          </div>
        </div>
      </div>
      <div className="ticket-body">
        {rows.map(({ cat, items }) => (
          <div key={cat} className="ticket-row">
            <div className="ticket-row-label">{CATEGORY_CONFIG[cat]?.label}</div>
            <div className="ticket-row-items">
              {items.map(s => (
                <span key={s.id} className={`ticket-item ${cat === "bread" || cat === "meat" ? "highlight" : ""} ${s.upcharge > 0 ? "upcharge" : ""}`}>
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="ticket-footer">
        <button className="done-btn" onClick={handleDone} disabled={finishing}>✓ Done</button>
      </div>
    </div>
  );
}

// ─── KITCHEN ──────────────────────────────────────────────────────────────────
function Kitchen({ orders, onDone }) {
  const making = orders.filter(o => o.status === "paid").sort((a, b) => new Date(a.paid_at) - new Date(b.paid_at));
  const completed = orders.filter(o => o.status === "done").slice(-5).reverse();

  return (
    <div className="kitchen">
      <div className="kitchen-header">
        <div className="kitchen-header-left">
          <h2>Kitchen Display</h2>
          <p>Paid orders only · Oldest left to right · Tap Done when ready</p>
        </div>
        <div className="kitchen-stats">
          <div className="kit-stat"><div className="stat-num">{making.length}</div><div className="stat-label">Making</div></div>
          <div className="kit-stat done-stat"><div className="stat-num">{orders.filter(o => o.status === "done").length}</div><div className="stat-label">Done Today</div></div>
        </div>
      </div>
      <div className="kitchen-scroll">
        {making.length === 0 ? (
          <div className="kitchen-empty">
            <div className="empty-icon">👨‍🍳</div>
            <p>No orders in queue</p>
            <small>Orders appear here after register marks them paid</small>
          </div>
        ) : (
          <div className="kitchen-grid">
            {making.map(order => <KitchenTicket key={order.id} order={order} onDone={onDone} />)}
          </div>
        )}
      </div>
      <div className="kitchen-completed-bar">
        <div className="completed-label">Completed</div>
        {completed.length === 0
          ? <span className="completed-empty">None yet</span>
          : <div className="completed-items">{completed.map(o => <span key={o.id} className="completed-chip">✓ {o.customer_name} #{o.queue_position}</span>)}</div>
        }
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState("kiosk");
  const [menuItems, setMenuItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load menu items once on mount
  useEffect(() => {
    supabase
      .from("menu_items")
      .select("*")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => {
        if (data) setMenuItems(data);
        setLoading(false);
      });
  }, []);

  // Load today's orders + subscribe to real-time changes
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];

    // Initial fetch — include order_selections for each order
    supabase
      .from("orders")
      .select("*, order_selections(*)")
      .gte("created_at", today + "T00:00:00")
      .order("queue_position")
      .then(({ data }) => { if (data) setOrders(data); });

    // Real-time subscription on orders table
    const channel = supabase
      .channel("orders-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, async (payload) => {
        // On any change, refetch the affected order with its selections
        if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
          const { data } = await supabase
            .from("orders")
            .select("*, order_selections(*)")
            .eq("id", payload.new.id)
            .single();
          if (data) {
            setOrders(prev => {
              const exists = prev.find(o => o.id === data.id);
              if (exists) return prev.map(o => o.id === data.id ? data : o);
              return [...prev, data];
            });
          }
        }
        if (payload.eventType === "DELETE") {
          setOrders(prev => prev.filter(o => o.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const handleMarkPaid = async (id) => {
    const { error } = await supabase
      .from("orders")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", id);
    if (error) console.error("Mark paid error:", error);
  };

  const handleDone = async (id) => {
    const { error } = await supabase
      .from("orders")
      .update({ status: "done", done_at: new Date().toISOString() })
      .eq("id", id);
    if (error) console.error("Mark done error:", error);
  };

  const pendingCount = orders.filter(o => o.status === "pending").length;
  const kitchenCount = orders.filter(o => o.status === "paid").length;

  if (loading) {
    return (
      <>
        <style>{css}</style>
        <div className="app-shell">
          <div className="loading-screen"><div className="spinner" /> Loading menu...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{css}</style>
      <div className="app-shell">
        <div className="demo-bar">
          All three screens share live Supabase data — open on separate devices for real use.
        </div>
        <div className="screen-tabs">
          <button className={`screen-tab ${activeTab === "kiosk" ? "active-kiosk" : ""}`} onClick={() => setActiveTab("kiosk")}>☕ Kiosk</button>
          <button className={`screen-tab ${activeTab === "register" ? "active-register" : ""}`} onClick={() => setActiveTab("register")}>
            🖥 Register {pendingCount > 0 && <span className="tab-badge">{pendingCount}</span>}
          </button>
          <button className={`screen-tab ${activeTab === "kitchen" ? "active-kitchen" : ""}`} onClick={() => setActiveTab("kitchen")}>
            👨‍🍳 Kitchen {kitchenCount > 0 && <span className="tab-badge">{kitchenCount}</span>}
          </button>
        </div>
        <div className="screen-content">
          {activeTab === "kiosk" && <Kiosk menuItems={menuItems} />}
          {activeTab === "register" && <Register orders={orders} menuItems={menuItems} onMarkPaid={handleMarkPaid} />}
          {activeTab === "kitchen" && <Kitchen orders={orders} onDone={handleDone} />}
        </div>
      </div>
    </>
  );
}