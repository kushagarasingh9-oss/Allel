'use client';

import React from 'react';

export default function LandingPage() {
  return (
    <div className="landing-page-wrapper">
      <iframe
        src="/landing.html"
        style={{
          width: '100vw',
          height: '100vh',
          border: 'none',
          margin: 0,
          padding: 0,
        }}
        title="Allel Landing Page"
      />
    </div>
  );
}
