'use client';

import React from 'react';
import Link from 'next/link';

export function LegalHeader() {
  return (
    <header
      style={{
        width: "100%",
        backgroundColor: "#0b0b0a",
        borderBottom: "1px solid #282825",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "16px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
        }}
      >
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            textDecoration: "none",
            cursor: "pointer",
          }}
        >
          <img
            src="/dot.png"
            alt="Allel"
            style={{
              width: "18px",
              height: "18px",
              objectFit: "contain",
              display: "inline-block",
              verticalAlign: "middle",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: "'Cabinet Grotesk', var(--font-plus-jakarta), sans-serif",
              fontSize: "18px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "#edede8",
              lineHeight: 1,
            }}
          >
            Allel
          </span>
        </Link>
      </div>
    </header>
  );
}

export function LegalFooter() {
  return (
    <footer
      style={{
        width: "100%",
        backgroundColor: "#0b0b0a",
        borderTop: "1px solid #282825",
        marginTop: "auto",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "48px 28px 36px 28px",
          boxSizing: "border-box",
        }}
      >
        {/* Main Footer Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "40px",
            paddingBottom: "40px",
            borderBottom: "1px solid #282825",
          }}
        >
          {/* Brand Column */}
          <div style={{ maxWidth: "320px" }}>
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                textDecoration: "none",
                marginBottom: "14px",
              }}
            >
              <img
                src="/dot.png"
                alt="Allel"
                style={{
                  width: "22px",
                  height: "22px",
                  objectFit: "contain",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: "'Cabinet Grotesk', var(--font-plus-jakarta), sans-serif",
                  fontSize: "22px",
                  fontWeight: 600,
                  letterSpacing: "-0.03em",
                  color: "#edede8",
                }}
              >
                Allel
              </span>
            </Link>
            <p
              style={{
                color: "#8b8b83",
                fontSize: "13px",
                lineHeight: "1.6",
                fontFamily: "Inter, sans-serif",
                margin: 0,
              }}
            >
              Allel AI — The autonomous revenue recovery system. Contact: kushagra@allel.co
            </p>
          </div>

          {/* Products Column */}
          <div>
            <p
              style={{
                fontFamily: "'Cabinet Grotesk', var(--font-plus-jakarta), sans-serif",
                fontSize: "14px",
                fontWeight: 600,
                color: "#edede8",
                marginBottom: "16px",
                letterSpacing: "0.02em",
              }}
            >
              Products
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <Link href="/pricing" style={{ color: "#8b8b83", fontSize: "13px", textDecoration: "none" }}>
                Pricing
              </Link>
              <Link href="/docs" style={{ color: "#8b8b83", fontSize: "13px", textDecoration: "none" }}>
                For SaaS founders
              </Link>
              <Link href="/#integrations" style={{ color: "#8b8b83", fontSize: "13px", textDecoration: "none" }}>
                Integrations
              </Link>
            </div>
          </div>

          {/* Company Column */}
          <div>
            <p
              style={{
                fontFamily: "'Cabinet Grotesk', var(--font-plus-jakarta), sans-serif",
                fontSize: "14px",
                fontWeight: 600,
                color: "#edede8",
                marginBottom: "16px",
                letterSpacing: "0.02em",
              }}
            >
              Company
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <Link href="/about" style={{ color: "#8b8b83", fontSize: "13px", textDecoration: "none" }}>
                About
              </Link>
              <a href="mailto:kushagara@allel.co" style={{ color: "#8b8b83", fontSize: "13px", textDecoration: "none" }}>
                kushagara@allel.co
              </a>
              <a href="https://x.com/kushagara12" target="_blank" rel="noopener noreferrer" style={{ color: "#8b8b83", fontSize: "13px", textDecoration: "none" }}>
                X (@kushagara12)
              </a>
              <a href="https://github.com/kushagara175" target="_blank" rel="noopener noreferrer" style={{ color: "#8b8b83", fontSize: "13px", textDecoration: "none" }}>
                GitHub (@kushagara175)
              </a>
            </div>
          </div>

          {/* Legal Column */}
          <div>
            <p
              style={{
                fontFamily: "'Cabinet Grotesk', var(--font-plus-jakarta), sans-serif",
                fontSize: "14px",
                fontWeight: 600,
                color: "#edede8",
                marginBottom: "16px",
                letterSpacing: "0.02em",
              }}
            >
              Legal
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <Link href="/privacy" style={{ color: "#8b8b83", fontSize: "13px", textDecoration: "none" }}>
                Privacy Policy
              </Link>
              <Link href="/terms" style={{ color: "#8b8b83", fontSize: "13px", textDecoration: "none" }}>
                Terms of Service
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom Legal Row */}
        <div
          style={{
            paddingTop: "24px",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            fontFamily: "Inter, sans-serif",
            fontSize: "12.5px",
            color: "#8b8b83",
          }}
        >
          <div>© 2026 Allel — allel.co</div>
          <div>Human-in-the-loop by default</div>
          <div style={{ display: "flex", gap: "20px" }}>
            <Link href="/privacy" style={{ color: "#8b8b83", textDecoration: "none" }}>
              Privacy
            </Link>
            <Link href="/terms" style={{ color: "#8b8b83", textDecoration: "none" }}>
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
