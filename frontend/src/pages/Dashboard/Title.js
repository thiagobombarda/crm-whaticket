import React from "react";

const Title = ({ children }) => (
  <p
    style={{
      fontFamily: '"DM Sans", system-ui, sans-serif',
      fontWeight: 600,
      fontSize: 14,
      color: "#9BA3B0",
      letterSpacing: "0.4px",
      margin: "0 0 12px",
    }}
  >
    {children}
  </p>
);

export default Title;
