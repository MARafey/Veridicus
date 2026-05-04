import type { ThemeConfig } from "antd";

const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: "#2563eb",
    colorBgContainer: "rgba(255,255,255,0.75)",
    colorBorder: "rgba(59,130,246,0.2)",
    colorText: "#0c1b4d",
    colorTextSecondary: "#1e3a8a",
    colorTextPlaceholder: "#93c5fd",
    colorBgElevated: "rgba(255,255,255,0.92)",
    colorBgLayout: "#f0f7ff",
    borderRadius: 16,
    fontFamily: "'Satoshi', -apple-system, sans-serif",
    fontSize: 15,
    fontWeightStrong: 700,
    lineHeight: 1.6,
    colorSuccess: "#16a34a",
    colorWarning: "#d97706",
    colorError: "#dc2626",
  },
  components: {
    Card: {
      colorBgContainer: "rgba(255,255,255,0.75)",
      colorBorderSecondary: "rgba(59,130,246,0.15)",
      borderRadiusLG: 20,
    },
    Button: {
      colorPrimary: "#2563eb",
      borderRadius: 12,
      fontWeight: 700,
      controlHeightLG: 52,
    },
    Input: {
      colorBgContainer: "rgba(255,255,255,0.8)",
      activeBorderColor: "#2563eb",
      activeShadow: "0 0 0 3px rgba(37,99,235,0.12)",
      borderRadius: 12,
    },
    Steps: {
      colorPrimary: "#2563eb",
      colorText: "#0c1b4d",
      colorTextDescription: "#64748b",
    },
    Alert: {
      borderRadius: 16,
      colorInfoBg: "rgba(219,234,254,0.6)",
      colorInfoBorder: "rgba(59,130,246,0.3)",
    },
    Form: {
      labelColor: "#1e3a8a",
      labelFontSize: 13,
    },
  },
};

export default antdTheme;
