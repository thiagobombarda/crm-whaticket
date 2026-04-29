import React from "react";

export default function Title({ children }) {
  return (
    <h2
      style={{
        fontFamily: '"Fraunces", Georgia, serif',
        fontWeight: 700,
        fontSize: 26,
        color: "#0A0F1E",
        letterSpacing: "-0.5px",
        margin: 0,
        lineHeight: 1.2,
      }}
    >
      {children}
    </h2>
  );
}
