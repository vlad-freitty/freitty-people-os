"use client";

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useId, useState, type ReactNode } from "react";
import { Button, IconTile } from "./ui";

const sizes = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-3xl" };

/** Dialog: a bottom sheet on a phone, a centred panel from `sm`. Esc and the backdrop close it. */
export function Modal({
  title,
  subtitle,
  icon,
  size = "md",
  onClose,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: IconSvgElement;
  size?: keyof typeof sizes;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("common");
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-paper shadow-xl sm:rounded-3xl ${sizes[size]}`}>
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          {icon && <IconTile icon={icon} />}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg leading-tight font-bold text-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm text-ink-mute">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={t("close")} className="rounded-full p-1.5 text-ink-mute hover:bg-cream-deep hover:text-ink">
            <HugeiconsIcon icon={Cancel01Icon} size={20} />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>
  );
}

const CloseContext = createContext<(() => void) | null>(null);

/** Forms inside a ModalButton call this after a successful save to close the dialog. */
export function useModalClose() {
  return useContext(CloseContext);
}

/** A button that opens a dialog; usable from server pages (children are plain nodes, not a render prop). */
export function ModalButton({
  label,
  icon,
  variant = "primary",
  className = "",
  title,
  subtitle,
  modalIcon,
  size,
  iconOnly = false,
  children,
}: {
  label: string;
  icon?: IconSvgElement;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  modalIcon?: IconSvgElement;
  size?: keyof typeof sizes;
  iconOnly?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      {iconOnly && icon ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={label}
          title={label}
          className={`inline-flex size-9 items-center justify-center rounded-full border border-line-strong bg-paper text-ink-soft transition hover:bg-cream hover:text-ink ${className}`}
        >
          <HugeiconsIcon icon={icon} size={17} />
        </button>
      ) : (
        <Button type="button" variant={variant} className={className} onClick={() => setOpen(true)}>
          {icon && <HugeiconsIcon icon={icon} size={18} />}
          {label}
        </Button>
      )}
      {open && (
        <Modal title={title} subtitle={subtitle} icon={modalIcon ?? icon} size={size} onClose={close}>
          <CloseContext.Provider value={close}>{children}</CloseContext.Provider>
        </Modal>
      )}
    </>
  );
}
