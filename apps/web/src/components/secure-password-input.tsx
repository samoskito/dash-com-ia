"use client";

import { useState } from "react";

export function SecurePasswordInput({
  label,
  name,
  autoComplete = "new-password",
  required = true
}: {
  label: string;
  name: string;
  autoComplete?: string;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label>
      {label}
      <span className="password-field">
        <input
          type={visible ? "text" : "password"}
          name={name}
          autoComplete={autoComplete}
          minLength={8}
          required={required}
        />
        <button
          type="button"
          className="password-toggle"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          <span className="password-toggle-icon" aria-hidden="true" />
        </button>
      </span>
    </label>
  );
}
