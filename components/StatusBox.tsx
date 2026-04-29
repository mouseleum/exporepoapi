import type { Status } from "@/lib/types";

type StatusBoxProps = {
  status: Status;
};

export function StatusBox({ status }: StatusBoxProps) {
  if (status.kind === "idle") return null;

  const isError = status.kind === "error";
  const isLoading = status.kind === "loading";

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
