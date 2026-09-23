"use client";
import { useEffect, useRef } from "react";
import { X, LoaderCircle } from "lucide-react";
const statusLabels = {
  in_service: "In service",
  available: "Available",
  adopted: "Adopted",
  unavailable: "Unavailable",
  active: "Active",
  expired: "Expired",
  cancelled: "Cancelled",
  retired: "Retired",
} as const;
export type BadgeStatus = keyof typeof statusLabels;
export function statusLabel(status: BadgeStatus) {
  return statusLabels[status];
}
export function Badge({ status }: { status: BadgeStatus }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="status-dot" />
      {statusLabel(status)}
    </span>
  );
}
export function Loading({ label = "Loading records…" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle size={20} className="spin" />
      {label}
    </div>
  );
}
export function Alert({
  children,
  success = false,
}: {
  children: React.ReactNode;
  success?: boolean;
}) {
  return (
    <div
      className={`alert ${success ? "alert-success" : "alert-error"}`}
      role={success ? "status" : "alert"}
    >
      {children}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={onClose}
      aria-label={title}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
