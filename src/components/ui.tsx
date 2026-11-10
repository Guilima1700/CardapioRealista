"use client";
import { useEffect, useRef } from "react";
import { X, Flame, LoaderCircle, ArrowUpRight } from "lucide-react";
import Link from "next/link";
export function Brand({
  name = "Sua casa",
  small = false,
  logo = "",
  subtitle = "CARDÁPIO DIGITAL",
}: {
  name?: string;
  small?: boolean;
  logo?: string;
  subtitle?: string;
}) {
  return (
    <Link
      href="/"
      className={`brand ${small ? "small" : ""}`}
      aria-label={`${name}, início`}
    >
      {logo ? (
        <img src={logo} alt="" />
      ) : (
        <span className="brand-icon">
          <Flame size={small ? 21 : 26} strokeWidth={1.6} />
        </span>
      )}
      <span>
        {name}
        <small>{subtitle}</small>
      </span>
    </Link>
  );
}
export function Spinner() {
  return <LoaderCircle className="spin" size={20} />;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Flame size={36} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function Modal({
  children,
  onClose,
  label,
  wide = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  label: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const active = document.activeElement as HTMLElement;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const root = ref.current;
    const selector =
      'button:not(:disabled),[href],input,select,textarea,[tabindex="0"]';
    (root?.querySelector(selector) as HTMLElement)?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Escape first leaves the 3D fullscreen view, preserving the product dialog.
        if (document.fullscreenElement) {
          e.preventDefault();
          void document.exitFullscreen().catch(() => {});
          return;
        }
        closeRef.current();
      }
      if (e.key === "Tab") {
        const els = Array.from(
          root?.querySelectorAll<HTMLElement>(selector) || [],
        ).filter((x) => x.offsetParent !== null);
        const first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", key);
      active?.focus();
    };
  }, []);
  return (
    <div
      className="brasa-dialog-layer"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`brasa-dialog-panel ${wide ? "wide" : ""}`}
      >
        <button
          className="icon-button brasa-dialog-close"
          onClick={onClose}
          aria-label="Fechar"
        >
          <X size={20} />
        </button>
        {children}
      </div>
    </div>
  );
}
export function TextLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link className="text-link" href={href}>
      {children}
      <ArrowUpRight size={16} />
    </Link>
  );
}
