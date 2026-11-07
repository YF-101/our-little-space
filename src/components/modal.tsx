"use client";
import { useEffect, useId, useRef } from "react";
import Icon from "./icon";
export default function Modal({
  title,
  children,
  close,
  wide = false,
  busy = false,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    d?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
      onClick={(e) => {
        if (!busy && e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          disabled={busy}
          onClick={close}
          aria-label="关闭弹窗"
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
