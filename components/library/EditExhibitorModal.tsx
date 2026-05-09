"use client";

import { useEffect, useState } from "react";
import type { LibraryExhibitor } from "@/lib/library/queries";
import { formatRevenueUsd } from "@/lib/library/format";
import { parseRevenueShorthand } from "@/lib/library/manual-edit";

type Props = {
  exhibitor: LibraryExhibitor;
  onCancel: () => void;
  onSave: (input: {
    employees: number | null;
    annual_revenue: number | null;
    industry: string | null;
  }) => Promise<void>;
};

function formatRevenueInput(n: number | null): string {
  return formatRevenueUsd(n)?.replace(/^\$/, "") ?? "";
}

export function EditExhibitorModal({ exhibitor, onCancel, onSave }: Props) {
  const [employees, setEmployees] = useState<string>(
    exhibitor.employees != null ? String(exhibitor.employees) : "",
  );
  const [revenue, setRevenue] = useState<string>(
    formatRevenueInput(exhibitor.annual_revenue),
  );
  const [industry, setIndustry] = useState<string>(exhibitor.industry ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let employeesNum: number | null = null;
    if (employees.trim() !== "") {
      const n = Number(employees.replace(/[,_\s]/g, ""));
      if (!Number.isInteger(n) || n < 0) {
        setError("Employees must be a non-negative integer.");
        return;
      }
      employeesNum = n;
    }

    let revenueNum: number | null = null;
    if (revenue.trim() !== "") {
      const parsed = parseRevenueShorthand(revenue);
      if (parsed === null) {
        setError("Revenue: try formats like 50M, 1.2B, 500K, or a raw number.");
        return;
      }
      revenueNum = parsed;
    }

    const industryClean = industry.trim() || null;

    setBusy(true);
    try {
      await onSave({
        employees: employeesNum,
        annual_revenue: revenueNum,
        industry: industryClean,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="modal-card">
        <div className="modal-header">
          <h3>Edit company info</h3>
          <p className="modal-subtitle">{exhibitor.raw_name}</p>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <label className="modal-field">
            <span>Employees</span>
            <input
              type="text"
              inputMode="numeric"
              value={employees}
              onChange={(e) => setEmployees(e.target.value)}
              placeholder="e.g. 85"
              disabled={busy}
              autoFocus
            />
          </label>
          <label className="modal-field">
            <span>Annual revenue (USD)</span>
            <input
              type="text"
              value={revenue}
              onChange={(e) => setRevenue(e.target.value)}
              placeholder="e.g. 50M, 1.2B, 500K"
              disabled={busy}
            />
          </label>
          <label className="modal-field">
            <span>Industry</span>
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Plastics"
              disabled={busy}
            />
          </label>
          {error && <div className="modal-error">{error}</div>}
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
