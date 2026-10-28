"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowUpDown, Pencil, Trash2 } from "lucide-react";

type ActionKind = "edit" | "delete" | "manage";
const actionIcons = { edit: Pencil, delete: Trash2, manage: ArrowUpDown };

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  action: ActionKind;
  children: ReactNode;
};

export function ActionButton({ action, children, className = "", ...props }: Props) {
  const Icon = actionIcons[action];
  return <button {...props} type={props.type ?? "button"} className={`button action-button action-${action} ${className}`}>
    <Icon size={13} aria-hidden="true" />
    <span>{children}</span>
  </button>;
}
