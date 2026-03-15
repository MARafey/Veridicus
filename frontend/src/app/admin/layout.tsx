"use client";

import { usePathname, useRouter } from "next/navigation";
import { CloudUploadOutlined, TeamOutlined, DeleteFilled, FileSearchOutlined, GithubOutlined } from "@ant-design/icons";

const NAV_ITEMS = [
  {
    label: "Candidate Reports",
    href: "/admin/candidate-reports",
    icon: <FileSearchOutlined />,
    danger: false,
  },
  {
    label: "Upload Knowledge",
    href: "/admin/upload-knowledge",
    icon: <CloudUploadOutlined />,
    danger: false,
  },
  {
    label: "Manage Assessments",
    href: "/admin/manage-assessments",
    icon: <TeamOutlined />,
    danger: false,
  },
  {
    label: "GitHub Re-verify",
    href: "/admin/github-verification",
    icon: <GithubOutlined />,
    danger: false,
  },
  {
    label: "Danger Zone",
    href: "/admin/danger-zone",
    icon: <DeleteFilled />,
    danger: true,
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* ── Sidebar ── */}
      <aside
        style={{
          width: 228,
          flexShrink: 0,
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          background: "rgba(255,255,255,0.80)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRight: "1px solid rgba(255,255,255,0.45)",
          boxShadow: "2px 0 16px rgba(15,42,110,0.06)",
          display: "flex",
          flexDirection: "column",
          padding: "32px 0 24px",
          zIndex: 20,
        }}
      >
        {/* Logo / title */}
        <div style={{ padding: "0 20px 28px" }}>
          <span
            className="mono"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#2563eb",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              display: "block",
              marginBottom: 4,
            }}
          >
            Veridicus
          </span>
          <span
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: "var(--text-primary)",
            }}
          >
            Admin Panel
          </span>
        </div>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: "rgba(37,99,235,0.1)",
            margin: "0 16px 16px",
          }}
        />

        {/* Nav items */}
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, padding: "0 12px" }}>
          {NAV_ITEMS.map(({ label, href, icon, danger }) => {
            const active = pathname === href;
            const activeColor = danger ? "#dc2626" : "#1d4ed8";
            const activeBg = danger ? "rgba(220,38,38,0.08)" : "rgba(37,99,235,0.10)";
            const hoverBg = danger ? "rgba(220,38,38,0.04)" : "rgba(37,99,235,0.05)";
            return (
              <button
                key={href}
                onClick={() => router.push(href)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: active ? 700 : 500,
                  color: active ? activeColor : danger ? "rgba(220,38,38,0.7)" : "var(--text-body)",
                  background: active ? activeBg : "transparent",
                  textAlign: "left",
                  transition: "background 0.15s, color 0.15s",
                  width: "100%",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = hoverBg;
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = "transparent";
                }}
              >
                <span style={{ fontSize: 15, opacity: active ? 1 : 0.6 }}>{icon}</span>
                {label}
              </button>
            );
          })}
        </nav>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: "rgba(37,99,235,0.1)",
            margin: "16px 16px 16px",
          }}
        />

        {/* Back to dashboard */}
        <div style={{ padding: "0 12px" }}>
          <button
            onClick={() => router.push("/")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-muted)",
              background: "transparent",
              width: "100%",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-body)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            ← Dashboard
          </button>
        </div>

        {/* Footer note */}
        <p
          className="mono"
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            textAlign: "center",
            margin: "12px 16px 0",
            lineHeight: 1.5,
          }}
        >
          Admin access only
        </p>
      </aside>

      {/* ── Main content ── */}
      <main style={{ marginLeft: 228, flex: 1, minHeight: "100vh" }}>
        {children}
      </main>
    </div>
  );
}
