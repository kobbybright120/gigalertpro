import React from "react";

export default function Logo({ className = "w-6 h-6", title = "GigAlertPro" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={title}
      width="64"
      height="64"
    >
      <defs>
        <linearGradient id="gLogo" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#00f0b5" />
          <stop offset="1" stopColor="#00d4ff" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#gLogo)" />
      <path
        d="M41 21 L29 35 L35 35 L25 50 L40 36 L33 36 Z"
        fill="#020617"
        fillRule="evenodd"
      />
    </svg>
  );
}
