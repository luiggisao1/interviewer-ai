import React, { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Unlock,
} from "lucide-react";
import { api } from "../../api";
import type { AccessKeySummary, CreateAccessKeyResponse } from "../../types";

interface AdminPanelProps {
  onBack: () => void;
}

const ADMIN_SECRET_STORAGE_KEY = "interviewer_admin_secret";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getKeyStatus(item: AccessKeySummary): { label: string; badgeClass: string } {
  if (!item.is_active) {
    return {
      label: "Revoked",
      badgeClass: "bg-red-950/60 border-red-500/35 text-red-300",
    };
  }
  if (item.expires_at && new Date(item.expires_at).getTime() <= Date.now()) {
    return {
      label: "Expired",
      badgeClass: "bg-amber-950/60 border-amber-500/35 text-amber-300",
    };
  }
  if (item.max_uses !== null && item.uses_count >= item.max_uses) {
    return {
      label: "Limit Reached",
      badgeClass: "bg-amber-950/60 border-amber-500/35 text-amber-300",
    };
  }
  return {
    label: "Active",
    badgeClass: "bg-emerald-950/60 border-emerald-500/35 text-emerald-300",
  };
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBack }) => {
  const [secretInput, setSecretInput] = useState(
    () => window.sessionStorage.getItem(ADMIN_SECRET_STORAGE_KEY) || "",
  );
  const [adminSecret, setAdminSecret] = useState<string | null>(null);
  const [requireAccessKey, setRequireAccessKey] = useState(false);

  const [keys, setKeys] = useState<AccessKeySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [label, setLabel] = useState("");
  const [maxUsesInput, setMaxUsesInput] = useState("5");
  const [expiresDaysInput, setExpiresDaysInput] = useState("30");
  const [createdKey, setCreatedKey] = useState<CreateAccessKeyResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const loadKeys = useCallback(async (secret: string) => {
    setLoading(true);
    setError("");
    try {
      const [verifyRes, keysList] = await Promise.all([
        api.adminVerify(secret),
        api.adminListKeys(secret),
      ]);
      setRequireAccessKey(verifyRes.require_access_key);
      setKeys(keysList);
      setAdminSecret(secret);
      window.sessionStorage.setItem(ADMIN_SECRET_STORAGE_KEY, secret);
    } catch (err) {
      window.sessionStorage.removeItem(ADMIN_SECRET_STORAGE_KEY);
      setAdminSecret(null);
      setError(err instanceof Error ? err.message : "Failed to verify admin secret.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(ADMIN_SECRET_STORAGE_KEY);
    if (saved) {
      void loadKeys(saved);
    }
  }, [loadKeys]);

  async function handleUnlock(e: FormEvent) {
    e.preventDefault();
    if (!secretInput.trim()) {
      setError("Enter your passphrase to continue.");
      return;
    }
    await loadKeys(secretInput.trim());
  }

  function handleLock() {
    window.sessionStorage.removeItem(ADMIN_SECRET_STORAGE_KEY);
    setAdminSecret(null);
    setSecretInput("");
    setKeys([]);
    setCreatedKey(null);
    setError("");
  }

  async function handleCreateKey(e: FormEvent) {
    e.preventDefault();
    if (!adminSecret) return;
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setError("Enter a label (for example, the candidate's name).");
      return;
    }

    const parsedMaxUses = maxUsesInput.trim() === "" ? null : Number(maxUsesInput);
    const parsedExpiresDays = expiresDaysInput.trim() === "" ? null : Number(expiresDaysInput);

    if (parsedMaxUses !== null && (!Number.isInteger(parsedMaxUses) || parsedMaxUses < 1)) {
      setError("Max interviews must be a positive whole number or blank for unlimited.");
      return;
    }
    if (parsedExpiresDays !== null && (!Number.isInteger(parsedExpiresDays) || parsedExpiresDays < 1)) {
      setError("Expires in days must be a positive whole number or blank for no expiration.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const created = await api.adminCreateKey(adminSecret, {
        label: trimmedLabel,
        max_uses: parsedMaxUses,
        expires_in_days: parsedExpiresDays,
      });
      setCreatedKey(created);
      setCopied(false);
      setLabel("");
      const updatedList = await api.adminListKeys(adminSecret);
      setKeys(updatedList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create access key.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleKey(item: AccessKeySummary) {
    if (!adminSecret) return;
    setTogglingId(item.id);
    setError("");
    try {
      const updated = item.is_active
        ? await api.adminRevokeKey(adminSecret, item.id)
        : await api.adminActivateKey(adminSecret, item.id);
      setKeys((prev) => prev.map((k) => (k.id === updated.id ? updated : k)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update key status.");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleCopyRawKey() {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey.raw_key);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy automatically. Please select and copy the key manually.");
    }
  }

  if (!adminSecret) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#0E1626] border border-blue-500/20 rounded-[18px] p-6 shadow-2xl flex flex-col gap-5">
          <div className="flex items-start gap-3 pb-3 border-b border-white/10">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">Restricted Access</h1>
              <p className="text-xs text-slate-400 mt-1">
                Enter your passphrase to continue.
              </p>
            </div>
          </div>

          <form onSubmit={handleUnlock} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="admin-secret-input" className="text-xs font-semibold text-slate-200">
                Passphrase
              </label>
              <input
                id="admin-secret-input"
                type="password"
                autoComplete="current-password"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                placeholder="Enter passphrase..."
                className="bg-[#080D1A] border border-blue-500/20 rounded-[10px] px-3.5 py-2 h-[42px] text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono w-full"
              />
            </div>

            {error && (
              <div className="bg-red-500/15 border border-red-500/30 text-red-200 px-3.5 py-2 rounded-lg text-xs font-medium">
                {error}
              </div>
            )}

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={onBack}
                className="h-[42px] px-4 rounded-xl bg-[#080D1A] border border-white/10 hover:border-white/25 text-slate-300 hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 h-[42px] bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl inline-flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all cursor-pointer disabled:opacity-60"
              >
                <Unlock className="w-4 h-4" />
                <span>{loading ? "Verifying…" : "Continue"}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden w-full max-w-[1280px] mx-auto py-1">
      {/* Header */}
      <div className="bg-[#0E1626] border border-blue-500/15 rounded-[18px] p-4 md:p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
            <KeyRound className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg font-bold text-white tracking-tight">Access Key Management</h1>
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full border ${
                  requireAccessKey
                    ? "bg-emerald-950/60 border-emerald-500/35 text-emerald-300"
                    : "bg-amber-950/60 border-amber-500/35 text-amber-300"
                }`}
              >
                {requireAccessKey ? <ShieldCheck className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
                <span>
                  Access Key Gate: {requireAccessKey ? "ON" : "OFF"}
                </span>
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Issue invite keys so candidates can practice using your private backend Gemini/AI credits safely
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadKeys(adminSecret)}
            className="h-[36px] px-3 rounded-lg bg-[#080D1A] border border-blue-500/20 hover:border-blue-500/40 text-slate-300 hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-sky-400" : ""}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleLock}
            className="h-[36px] px-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Lock</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/15 border border-red-500/30 text-red-200 px-4 py-2.5 rounded-xl text-xs font-medium shrink-0">
          {error}
        </div>
      )}

      {/* One-time created key banner */}
      {createdKey && (
        <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-[18px] p-4 shadow-lg flex flex-col gap-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-300 uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>New Key Created for &ldquo;{createdKey.label}&rdquo; — Copy Now (Shown Once)</span>
            </div>
            <button
              type="button"
              onClick={() => setCreatedKey(null)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              Dismiss
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="flex-1 min-w-[240px] bg-[#080D1A] border border-emerald-500/30 rounded-xl px-3.5 py-2.5 text-sm font-mono text-emerald-200 select-all break-all">
              {createdKey.raw_key}
            </code>
            <button
              type="button"
              onClick={() => void handleCopyRawKey()}
              className="h-[42px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? "Copied!" : "Copy Key"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Grid: Create Key + Keys Table */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
        {/* Left: Create Key Form */}
        <form
          onSubmit={handleCreateKey}
          className="lg:col-span-4 bg-[#0E1626] border border-blue-500/15 rounded-[18px] p-5 flex flex-col gap-4 overflow-y-auto"
        >
          <div className="pb-2.5 border-b border-white/10">
            <h2 className="text-base font-bold text-white">Generate New Access Key</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Only the SHA-256 hash and prefix are stored in the database.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="key-label-input" className="text-xs font-semibold text-slate-200">
              Label / Person Name <span className="text-sky-400">*</span>
            </label>
            <input
              id="key-label-input"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Maria - Python Practice"
              maxLength={100}
              className="bg-[#080D1A] border border-blue-500/15 rounded-[10px] px-3.5 py-2 h-[42px] text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="key-max-uses" className="text-xs font-semibold text-slate-200">
                Max Interviews
              </label>
              <input
                id="key-max-uses"
                type="number"
                min={1}
                max={10000}
                value={maxUsesInput}
                onChange={(e) => setMaxUsesInput(e.target.value)}
                placeholder="Unlimited"
                className="bg-[#080D1A] border border-blue-500/15 rounded-[10px] px-3 py-2 h-[42px] text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="key-expires-days" className="text-xs font-semibold text-slate-200">
                Expires (Days)
              </label>
              <input
                id="key-expires-days"
                type="number"
                min={1}
                max={3650}
                value={expiresDaysInput}
                onChange={(e) => setExpiresDaysInput(e.target.value)}
                placeholder="Never"
                className="bg-[#080D1A] border border-blue-500/15 rounded-[10px] px-3 py-2 h-[42px] text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Leave Max Interviews or Expires blank for unlimited uses or no expiration date.
          </p>

          <button
            type="submit"
            disabled={submitting}
            className="mt-auto h-[44px] w-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl inline-flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all cursor-pointer disabled:opacity-60"
          >
            <Plus className="w-4 h-4" />
            <span>{submitting ? "Generating…" : "Generate Access Key"}</span>
          </button>
        </form>

        {/* Right: Existing Keys List */}
        <div className="lg:col-span-8 bg-[#0E1626] border border-blue-500/15 rounded-[18px] p-5 flex flex-col gap-3 min-h-0 overflow-y-auto">
          <div className="flex items-center justify-between pb-2.5 border-b border-white/10 shrink-0">
            <h2 className="text-base font-bold text-white">Issued Keys ({keys.length})</h2>
            <span className="text-xs text-slate-400">Stored as SHA-256 hashes</span>
          </div>

          {keys.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-8 text-slate-400 text-sm">
              <KeyRound className="w-7 h-7 text-slate-500" />
              <span>No access keys have been issued yet.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {keys.map((item) => {
                const status = getKeyStatus(item);
                return (
                  <div
                    key={item.id}
                    className="bg-[#080D1A] border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-white">{item.label}</span>
                        <code className="text-xs font-mono bg-white/5 border border-white/10 text-sky-300 px-2 py-0.5 rounded">
                          {item.key_prefix}
                        </code>
                        <span
                          className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full border ${status.badgeClass}`}
                        >
                          {status.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                        <span>
                          Sessions:{" "}
                          <strong className="text-slate-200 font-mono">
                            {item.uses_count} / {item.max_uses ?? "∞"}
                          </strong>
                        </span>
                        <span>
                          LLM calls: <strong className="text-slate-200 font-mono">{item.requests_used}</strong>
                        </span>
                        <span>Last used: {formatDate(item.last_used_at)}</span>
                        <span>Expires: {formatDate(item.expires_at)}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={togglingId === item.id}
                      onClick={() => void handleToggleKey(item)}
                      className={`shrink-0 h-[34px] px-3 rounded-lg text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-50 ${
                        item.is_active
                          ? "bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-300"
                          : "bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30 text-emerald-300"
                      }`}
                    >
                      {togglingId === item.id
                        ? "Updating…"
                        : item.is_active
                          ? "Revoke"
                          : "Re-activate"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
