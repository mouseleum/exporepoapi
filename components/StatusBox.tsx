"use client";

import type { Status } from "@/lib/types";
import {
  isStaleDeploymentError,
  STALE_DEPLOYMENT_MESSAGE,
} from "@/lib/stale-deployment";

type StatusBoxProps = {
  status: Status;
};

export function StatusBox({ status }: StatusBoxProps) {
  if (status.kind === "idle") return null;

  const isError = status.kind === "error";
  const isLoading = status.kind === "loading";

  if (isError && isStaleDeploymentError(status.message)) {
    return (
      <div className="status-box stale-deploy" style={{ display: "block" }}>
        <div className="status-inner">
          <span>{STALE_DEPLOYMENT_MESSAGE}</span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`status-box${isError ? " error" : ""}`}
      style={{ display: "block" }}
    >
      {isLoading ? (
        <div className="status-inner">
          <div className="spinner" />
          <span>{status.message}</span>
        </div>
      ) : (
        status.message
      )}
    </div>
  );
}
