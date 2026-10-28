import React from "react";

interface MediaIconProps {
  channel: string;
  size?: number;
  className?: string;
}

export function MediaIcon({ channel, size = 16, className = "" }: MediaIconProps) {
  const norm = (channel || "").toUpperCase();

  if (norm.includes("FACEBOOK") || norm.includes("FB") || norm.includes("MESSENGER")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="12" fill="#1877F2" />
        <path
          d="M15.5 12H13V21H9.5V12H8V9H9.5V7C9.5 4.8 10.9 3.5 13.5 3.5C14.5 3.5 15.3 3.6 15.5 3.6V6.2H14.2C13.2 6.2 13 6.7 13 7.4V9H15.8L15.5 12Z"
          fill="white"
        />
      </svg>
    );
  }

  if (norm.includes("TIKTOK") || norm.includes("TT")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="12" fill="#010101" />
        <path
          d="M16.5 8.2C15.4 8.2 14.5 7.6 14 6.7V13.8C14 16.1 12.1 18 9.8 18C7.5 18 5.6 16.1 5.6 13.8C5.6 11.5 7.5 9.6 9.8 9.6C10.2 9.6 10.6 9.7 11 9.8V12C10.6 11.8 10.2 11.7 9.8 11.7C8.6 11.7 7.7 12.6 7.7 13.8C7.7 15 8.6 15.9 9.8 15.9C11 15.9 11.9 15 11.9 13.8V4H14.1C14.4 5.3 15.3 6.3 16.5 6.5V8.2Z"
          fill="#00F2FE"
        />
        <path
          d="M17 7.7C15.9 7.7 15 7.1 14.5 6.2V13.3C14.5 15.6 12.6 17.5 10.3 17.5C8 17.5 6.1 15.6 6.1 13.3C6.1 11 8 9.1 10.3 9.1C10.7 9.1 11.1 9.2 11.5 9.3V11.5C11.1 11.3 10.7 11.2 10.3 11.2C9.1 11.2 8.2 12.1 8.2 13.3C8.2 14.5 9.1 15.4 10.3 15.4C11.5 15.4 12.4 14.5 12.4 13.3V3.5H14.6C14.9 4.8 15.8 5.8 17 6V7.7Z"
          fill="#FE2C55"
        />
        <path
          d="M16.7 8C15.6 8 14.7 7.4 14.2 6.5V13.6C14.2 15.9 12.3 17.8 10 17.8C7.7 17.8 5.8 15.9 5.8 13.6C5.8 11.3 7.7 9.4 10 9.4C10.4 9.4 10.8 9.5 11.2 9.6V11.8C10.8 11.6 10.4 11.5 10 11.5C8.8 11.5 7.9 12.4 7.9 13.6C7.9 14.8 8.8 15.7 10 15.7C11.2 15.7 12.1 14.8 12.1 13.6V3.8H14.3C14.6 5.1 15.5 6.1 16.7 6.3V8Z"
          fill="white"
        />
      </svg>
    );
  }

  if (norm.includes("TELEGRAM") || norm.includes("TG")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="12" fill="#24A1DE" />
        <path
          d="M5.4 11.9L17.2 7.3C17.7 7.1 18.2 7.5 18 8L16 17.5C15.8 18.2 15 18.4 14.4 18L11.5 15.8L10.1 17.2C9.8 17.5 9.3 17.3 9.3 16.9L9.5 13.8L15.3 8.6C15.5 8.4 15.3 8.1 15 8.2L7.9 12.7L5.3 11.8C4.8 11.6 4.8 11 5.4 10.8V11.9Z"
          fill="white"
        />
      </svg>
    );
  }

  if (norm.includes("DIRECT") || norm.includes("STORE") || norm.includes("ផ្ទាល់")) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="12" fill="#10B981" />
        <path
          d="M7 9V17C7 17.6 7.4 18 8 18H16C16.6 18 17 17.6 17 17V9H7ZM10 11C10 11.6 9.6 12 9 12C8.4 12 8 11.6 8 11V10H10V11ZM16 11C16 11.6 15.6 12 15 12C14.4 12 14 11.6 14 11V10H16V11ZM17.5 6H6.5L6 8H18L17.5 6Z"
          fill="white"
        />
      </svg>
    );
  }

  // Fallback / OTHER
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="12" fill="#64748B" />
      <path
        d="M12 6C8.7 6 6 8.7 6 12C6 15.3 8.7 18 12 18C15.3 18 18 15.3 18 12C18 8.7 15.3 6 12 6ZM11.3 7.5C11.5 7.2 11.7 7 12 7C12.3 7 12.5 7.2 12.7 7.5C13.2 8.4 13.5 9.7 13.6 11.2H10.4C10.5 9.7 10.8 8.4 11.3 7.5ZM10.4 12.8H13.6C13.5 14.3 13.2 15.6 12.7 16.5C12.5 16.8 12.3 17 12 17C11.7 17 11.5 16.8 11.3 16.5C10.8 15.6 10.5 14.3 10.4 12.8ZM9.4 11.2H7.2C7.5 9.7 8.3 8.4 9.5 7.6C9.2 8.6 9.1 9.9 9.1 11.2H9.4ZM9.4 12.8H9.1C9.1 14.1 9.2 15.4 9.5 16.4C8.3 15.6 7.5 14.3 7.2 12.8H9.4ZM14.6 12.8H14.9C14.9 14.1 14.8 15.4 14.5 16.4C15.7 15.6 16.5 14.3 16.8 12.8H14.6ZM14.6 11.2H16.8C16.5 9.7 15.7 8.4 14.5 7.6C14.8 8.6 14.9 9.9 14.9 11.2H14.6Z"
        fill="white"
      />
    </svg>
  );
}

const channelNameMap: Record<string, { nameKh: string; nameEn: string; bg: string; color: string }> = {
  FACEBOOK: { nameKh: "ហ្វេសប៊ុក", nameEn: "Facebook", bg: "#eff6ff", color: "#1d4ed8" },
  TIKTOK: { nameKh: "ធីកតុក", nameEn: "TikTok", bg: "#f1f5f9", color: "#0f172a" },
  TELEGRAM: { nameKh: "តេលេក្រាម", nameEn: "Telegram", bg: "#f0f9ff", color: "#0369a1" },
  DIRECT: { nameKh: "ផ្ទាល់", nameEn: "Direct", bg: "#ecfdf5", color: "#047857" },
  OTHER: { nameKh: "ផ្សេងៗ", nameEn: "Other", bg: "#f8fafc", color: "#475569" },
};

export function MediaBadge({
  channel,
  lang = "kh",
  showLabel = true,
  className = "",
}: {
  channel: string;
  lang?: "kh" | "en";
  showLabel?: boolean;
  className?: string;
}) {
  const norm = (channel || "").toUpperCase();
  const info = channelNameMap[norm] || channelNameMap.OTHER;
  const label = lang === "kh" ? info.nameKh : info.nameEn;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: showLabel ? "2px 8px" : "2px",
        borderRadius: "12px",
        fontSize: "0.74rem",
        background: info.bg,
        color: info.color,
        border: `1px solid ${info.color}22`,
        verticalAlign: "middle",
        whiteSpace: "nowrap",
      }}
    >
      <MediaIcon channel={channel} size={14} />
      {showLabel && <span>{label}</span>}
    </span>
  );
}
