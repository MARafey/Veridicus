"use client";

import { CSSProperties, ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  variant?: "default" | "elevated" | "subtle";
}

const variantClass = {
  default: "glass-card",
  elevated: "glass-card-elevated",
  subtle: "glass-card-subtle",
};

export default function GlassCard({ children, className = "", style, variant = "default" }: GlassCardProps) {
  return (
    <div className={`${variantClass[variant]} ${className}`} style={style}>
      {children}
    </div>
  );
}
