import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

function extractFramerParts(html) {
  const styles = [...html.matchAll(/<style[\s\S]*?<\/style>/g)].map(m => m[0]).join('\n');
  const mainMatch = html.match(/<div id="main"[\s\S]*?<\/div>(?=\s*<div id="template-overlay">|\s*<script>|\s*<div id="svg-templates")/);
  let main = mainMatch ? mainMatch[0] : '';
  const svgMatch = html.match(/<div id="svg-templates"[\s\S]*?<\/div>/);
  const svg = svgMatch ? svgMatch[0] : '';
  return { styles, main, svg };
}

// 1. PRICING PAGE
function buildPricing() {
  const html = fs.readFileSync(path.join(ROOT, 'platform/scripts/framer_pricing_live.html'), 'utf8');
  let { styles, main, svg } = extractFramerParts(html);

  const faqAnswers = {
    'How long does setup take?': 'Connecting your first tools takes a few minutes each — OAuth, pick the workspace, done. Agents start producing briefs the next morning.',
    'Is there a limit on integrations?': 'No. Every plan connects all 12+ live integrations. Plans differ by how many agents operate across them.',
    'Where does my data live?': 'Data stays in your connected tools. Allel reads what it needs per workflow and logs every action in an inspectable audit trail.'
  };

  for (const [q, a] of Object.entries(faqAnswers)) {
    const qSnippet = '>' + q + '</p>';
    const idx = main.indexOf(qSnippet);
    if (idx !== -1) {
      const svgEnd = main.indexOf('</svg></div>', idx);
      if (svgEnd !== -1) {
        const insertionPoint = svgEnd + '</svg></div>'.length;
        const answerHtml = '<div class="framer-1xwllun allel-faq-answer" data-framer-component-type="RichTextContainer" style="transform:none;display:none;margin-top:12px;"><p class="framer-text framer-styles-preset-1kqzx7y" data-styles-preset="T2GmYkvPK" dir="auto">' + a + '</p></div>';
        main = main.slice(0, insertionPoint) + answerHtml + main.slice(insertionPoint);
      }
    }
  }

  const legalRowIdx = main.indexOf('data-framer-name="Legal Row"');
  if (legalRowIdx !== -1) {
    const legalRowClosing = main.indexOf('</div></footer>', legalRowIdx);
    if (legalRowClosing !== -1) {
      const legalLinks = '<div class="framer-legal-links" style="display:flex;gap:16px;align-items:center;"><a href="/privacy" class="framer-text framer-styles-preset-qeu7lu" style="--framer-text-color:var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35);text-decoration:none;">Privacy</a><a href="/terms" class="framer-text framer-styles-preset-qeu7lu" style="--framer-text-color:var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35);text-decoration:none;">Terms</a></div>';
      main = main.slice(0, legalRowClosing) + legalLinks + main.slice(legalRowClosing);
    }
  }

  const rawHtml = main + '\n' + svg;

  const content = `'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/foundation/database/client';

const FRAMER_STYLES = ` + JSON.stringify(styles) + `;

const RAW_PRICING_HTML = ` + JSON.stringify(rawHtml) + `;

const OVERRIDE_CSS = \`
  [data-framer-appear-id] {
    opacity: 1 !important;
    transform: none !important;
  }
  body, html {
    background-color: #0b0b0a !important;
  }
  a, button, [data-framer-name="Logo"], [data-framer-name="Links"] a {
    cursor: pointer !important;
  }
  .landing-page-container [data-framer-name="Logo"] {
    display: inline-flex !important;
    align-items: center !important;
    text-decoration: none !important;
  }
  .landing-page-container [data-framer-name="Logo"] .framer-j9tvgv {
    display: none !important;
  }
  .allel-nav-brand-logo {
    display: inline-block !important;
    width: 17px !important;
    height: 17px !important;
    object-fit: contain !important;
    margin-right: 8px !important;
    flex-shrink: 0 !important;
    background: transparent !important;
  }
  .framer-kQGri {
    cursor: pointer !important;
  }
  .framer-1xj9bt3 {
    cursor: pointer !important;
  }
  .allel-faq-answer {
    line-height: 1.5em !important;
  }
\`;

export default function PricingPage() {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);

  useEffect(() => {
    setMounted(true);
    const supabase = createClient();

    supabase.auth.getUser().then((res: { data: { user: { id: string; email?: string | null } | null } }) => {
      if (res.data?.user) {
        setUser({ id: res.data.user.id, email: res.data.user.email ?? undefined });
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event: unknown, session: { user?: { id: string; email?: string | null } } | null) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email ?? undefined });
      } else {
        setUser(null);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const setupInteractions = () => {
      const isAuthenticated = !!user;
      const targetDestination = isAuthenticated ? '/dashboard' : '/auth/login';

      // 1. Ensure Logo in Navbar
      const navLogo = document.querySelector('[data-framer-name="Logo"]');
      if (navLogo) {
        let img = navLogo.querySelector('.allel-nav-brand-logo') as HTMLImageElement | null;
        if (!img) {
          img = document.createElement('img');
          img.src = '/dot.png';
          img.alt = 'Allel';
          img.className = 'allel-nav-brand-logo';
          img.style.cssText = 'width: 17px; height: 17px; margin-right: 8px; object-fit: contain; display: inline-block; vertical-align: middle; flex-shrink: 0; background: transparent;';
          const textContainer = navLogo.querySelector('.framer-gdhgkz');
          if (textContainer) {
            navLogo.insertBefore(img, textContainer);
          } else {
            navLogo.prepend(img);
          }
        } else if (img.getAttribute('src') !== '/dot.png') {
          img.setAttribute('src', '/dot.png');
        }
      }

      // 2. Ensure Logo in Footer Brand
      const footerBrand = document.querySelector('[data-framer-name="Brand"]');
      if (footerBrand) {
        let img = footerBrand.querySelector('.allel-footer-brand-logo') as HTMLImageElement | null;
        if (!img) {
          img = document.createElement('img');
          img.src = '/dot.png';
          img.alt = 'Allel';
          img.className = 'allel-footer-brand-logo';
          img.style.cssText = 'width: 20px; height: 20px; margin-right: 8px; object-fit: contain; flex-shrink: 0; background: transparent;';
          const brandText = footerBrand.querySelector('.framer-1vurpbe');
          if (brandText && !brandText.closest('.allel-footer-brand-header')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'allel-footer-brand-header';
            wrapper.style.cssText = 'display: flex; align-items: center; gap: 10px; margin-bottom: 8px;';
            brandText.parentNode?.insertBefore(wrapper, brandText);
            wrapper.appendChild(img);
            wrapper.appendChild(brandText);
          }
        } else if (img.getAttribute('src') !== '/dot.png') {
          img.setAttribute('src', '/dot.png');
        }
      }

      // 3. Wire CTAs
      const ctaButtons = document.querySelectorAll('a[href="/dashboard"], a[href="./dashboard"], a[data-framer-name="Primary"], a[data-framer-name="Secondary"], a[data-framer-name="Ghost"]');
      ctaButtons.forEach((btn) => {
        const text = btn.textContent?.trim().toLowerCase();
        if (text === 'talk to us') {
          btn.setAttribute('href', 'mailto:kushagra@allel.co');
        } else if (text === 'start with starter' || text === 'get started') {
          btn.setAttribute('href', targetDestination);
        } else if (text === 'join the waitlist') {
          btn.setAttribute('href', '/#waitlist');
        }
      });

      // 4. Wire FAQ Accordion Toggles
      const faqItems = document.querySelectorAll('.framer-kQGri');
      faqItems.forEach((item) => {
        if (!item.getAttribute('data-accordion-attached')) {
          item.setAttribute('data-accordion-attached', 'true');
          item.addEventListener('click', () => {
            const answer = item.querySelector('.allel-faq-answer') as HTMLElement | null;
            const existingOpenAnswer = item.querySelector('.framer-1xwllun:not(.allel-faq-answer)') as HTMLElement | null;

            if (answer) {
              const isCurrentlyHidden = answer.style.display === 'none';
              answer.style.display = isCurrentlyHidden ? 'block' : 'none';
              if (isCurrentlyHidden) {
                item.setAttribute('data-framer-name', 'Open');
              } else {
                item.setAttribute('data-framer-name', 'Closed');
              }
            } else if (existingOpenAnswer) {
              const isCurrentlyHidden = existingOpenAnswer.style.display === 'none';
              existingOpenAnswer.style.display = isCurrentlyHidden ? 'block' : 'none';
              if (isCurrentlyHidden) {
                item.setAttribute('data-framer-name', 'Open');
              } else {
                item.setAttribute('data-framer-name', 'Closed');
              }
            }
          });
        }
      });

      // 5. Document-wide navigation click interception
      if (!document.body.getAttribute('data-pricing-nav-hooked')) {
        document.body.setAttribute('data-pricing-nav-hooked', 'true');

        document.addEventListener('click', (e) => {
          const anchor = (e.target as HTMLElement)?.closest('a');
          if (!anchor) return;

          const rawHref = anchor.getAttribute('href');
          if (!rawHref) return;

          const href = rawHref.trim();

          if (href === '/' || href === './') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/';
            return;
          }

          if (href === '/pricing' || href === './pricing') {
            e.preventDefault();
            e.stopPropagation();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }

          if (href === '/docs' || href === './docs') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/docs';
            return;
          }

          if (href === '/about' || href === './about') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/about';
            return;
          }

          if (href === '/privacy' || href === './privacy') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/privacy';
            return;
          }

          if (href === '/terms' || href === './terms') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/terms';
            return;
          }

          if (href === '/#waitlist' || href === './#waitlist') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/#waitlist';
            return;
          }

          if (href === '/#integrations' || href === './#integrations') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/#integrations';
            return;
          }

          if (href === '/dashboard' || href === './dashboard') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = targetDestination;
            return;
          }
        }, true);
      }
    };

    setupInteractions();
    const interval = setInterval(setupInteractions, 500);
    return () => clearInterval(interval);
  }, [mounted, user]);

  if (!mounted) {
    return (
      <div style={{ background: '#0b0b0a', minHeight: '100vh' }} />
    );
  }

  return (
    <>
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: FRAMER_STYLES }} />
      <style dangerouslySetInnerHTML={{ __html: OVERRIDE_CSS }} />
      <div
        className="landing-page-container"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: RAW_PRICING_HTML }}
      />
    </>
  );
}
`;

  fs.writeFileSync(path.join(ROOT, 'platform/src/app/pricing/page.tsx'), content);
  console.log('Successfully built platform/src/app/pricing/page.tsx');
}

// 2. DOCS PAGE
function buildDocs() {
  const html = fs.readFileSync(path.join(ROOT, 'platform/scripts/framer_docs_live.html'), 'utf8');
  let { styles, main, svg } = extractFramerParts(html);

  // Add legal links to footer
  const legalRowIdx = main.indexOf('data-framer-name="Legal Row"');
  if (legalRowIdx !== -1) {
    const legalRowClosing = main.indexOf('</div></footer>', legalRowIdx);
    if (legalRowClosing !== -1) {
      const legalLinks = '<div class="framer-legal-links" style="display:flex;gap:16px;align-items:center;"><a href="/privacy" class="framer-text framer-styles-preset-qeu7lu" style="--framer-text-color:var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35);text-decoration:none;">Privacy</a><a href="/terms" class="framer-text framer-styles-preset-qeu7lu" style="--framer-text-color:var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35);text-decoration:none;">Terms</a></div>';
      main = main.slice(0, legalRowClosing) + legalLinks + main.slice(legalRowClosing);
    }
  }

  const rawHtml = main + '\n' + svg;

  const content = `'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/foundation/database/client';

const FRAMER_STYLES = ` + JSON.stringify(styles) + `;

const RAW_DOCS_HTML = ` + JSON.stringify(rawHtml) + `;

const OVERRIDE_CSS = \`
  [data-framer-appear-id] {
    opacity: 1 !important;
    transform: none !important;
  }
  body, html {
    background-color: #0b0b0a !important;
  }
  a, button, [data-framer-name="Logo"], [data-framer-name="Links"] a {
    cursor: pointer !important;
  }
  .landing-page-container [data-framer-name="Logo"] {
    display: inline-flex !important;
    align-items: center !important;
    text-decoration: none !important;
  }
  .landing-page-container [data-framer-name="Logo"] .framer-j9tvgv {
    display: none !important;
  }
  .allel-nav-brand-logo {
    display: inline-block !important;
    width: 17px !important;
    height: 17px !important;
    object-fit: contain !important;
    margin-right: 8px !important;
    flex-shrink: 0 !important;
    background: transparent !important;
  }
\`;

export default function DocsPage() {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);

  useEffect(() => {
    setMounted(true);
    const supabase = createClient();

    supabase.auth.getUser().then((res: { data: { user: { id: string; email?: string | null } | null } }) => {
      if (res.data?.user) {
        setUser({ id: res.data.user.id, email: res.data.user.email ?? undefined });
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event: unknown, session: { user?: { id: string; email?: string | null } } | null) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email ?? undefined });
      } else {
        setUser(null);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const setupInteractions = () => {
      const isAuthenticated = !!user;
      const targetDestination = isAuthenticated ? '/dashboard' : '/auth/login';

      // 1. Ensure Logo in Navbar
      const navLogo = document.querySelector('[data-framer-name="Logo"]');
      if (navLogo) {
        let img = navLogo.querySelector('.allel-nav-brand-logo') as HTMLImageElement | null;
        if (!img) {
          img = document.createElement('img');
          img.src = '/dot.png';
          img.alt = 'Allel';
          img.className = 'allel-nav-brand-logo';
          img.style.cssText = 'width: 17px; height: 17px; margin-right: 8px; object-fit: contain; display: inline-block; vertical-align: middle; flex-shrink: 0; background: transparent;';
          const textContainer = navLogo.querySelector('.framer-gdhgkz');
          if (textContainer) {
            navLogo.insertBefore(img, textContainer);
          } else {
            navLogo.prepend(img);
          }
        } else if (img.getAttribute('src') !== '/dot.png') {
          img.setAttribute('src', '/dot.png');
        }
      }

      // 2. Ensure Logo in Footer Brand
      const footerBrand = document.querySelector('[data-framer-name="Brand"]');
      if (footerBrand) {
        let img = footerBrand.querySelector('.allel-footer-brand-logo') as HTMLImageElement | null;
        if (!img) {
          img = document.createElement('img');
          img.src = '/dot.png';
          img.alt = 'Allel';
          img.className = 'allel-footer-brand-logo';
          img.style.cssText = 'width: 20px; height: 20px; margin-right: 8px; object-fit: contain; flex-shrink: 0; background: transparent;';
          const brandText = footerBrand.querySelector('.framer-1vurpbe');
          if (brandText && !brandText.closest('.allel-footer-brand-header')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'allel-footer-brand-header';
            wrapper.style.cssText = 'display: flex; align-items: center; gap: 10px; margin-bottom: 8px;';
            brandText.parentNode?.insertBefore(wrapper, brandText);
            wrapper.appendChild(img);
            wrapper.appendChild(brandText);
          }
        } else if (img.getAttribute('src') !== '/dot.png') {
          img.setAttribute('src', '/dot.png');
        }
      }

      // 3. Wire CTAs
      const ctaButtons = document.querySelectorAll('a[href="/dashboard"], a[href="./dashboard"], a[data-framer-name="Primary"]');
      ctaButtons.forEach((btn) => {
        btn.setAttribute('href', targetDestination);
      });

      // 4. Document-wide navigation click interception
      if (!document.body.getAttribute('data-docs-nav-hooked')) {
        document.body.setAttribute('data-docs-nav-hooked', 'true');

        document.addEventListener('click', (e) => {
          const anchor = (e.target as HTMLElement)?.closest('a');
          if (!anchor) return;

          const rawHref = anchor.getAttribute('href');
          if (!rawHref) return;

          const href = rawHref.trim();

          if (href === '/' || href === './') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/';
            return;
          }

          if (href === '/pricing' || href === './pricing') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/pricing';
            return;
          }

          if (href === '/docs' || href === './docs') {
            e.preventDefault();
            e.stopPropagation();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }

          if (href.startsWith('./docs/') || href.startsWith('/docs/')) {
            e.preventDefault();
            e.stopPropagation();
            const target = href.startsWith('./docs/') ? href.slice(1) : href;
            window.location.href = target;
            return;
          }

          if (href === '/about' || href === './about') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/about';
            return;
          }

          if (href === '/privacy' || href === './privacy') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/privacy';
            return;
          }

          if (href === '/terms' || href === './terms') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/terms';
            return;
          }

          if (href === '/#waitlist' || href === './#waitlist') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/#waitlist';
            return;
          }

          if (href === '/#integrations' || href === './#integrations') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/#integrations';
            return;
          }

          if (href === '/dashboard' || href === './dashboard') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = targetDestination;
            return;
          }
        }, true);
      }
    };

    setupInteractions();
    const interval = setInterval(setupInteractions, 500);
    return () => clearInterval(interval);
  }, [mounted, user]);

  if (!mounted) {
    return (
      <div style={{ background: '#0b0b0a', minHeight: '100vh' }} />
    );
  }

  return (
    <>
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: FRAMER_STYLES }} />
      <style dangerouslySetInnerHTML={{ __html: OVERRIDE_CSS }} />
      <div
        className="landing-page-container"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: RAW_DOCS_HTML }}
      />
    </>
  );
}
`;

  fs.writeFileSync(path.join(ROOT, 'platform/src/app/docs/page.tsx'), content);
  console.log('Successfully built platform/src/app/docs/page.tsx');
}

// 3. ABOUT PAGE
function buildAbout() {
  const html = fs.readFileSync(path.join(ROOT, 'platform/scripts/framer_about_live.html'), 'utf8');
  let { styles, main, svg } = extractFramerParts(html);

  // Add legal links to footer
  const legalRowIdx = main.indexOf('data-framer-name="Legal Row"');
  if (legalRowIdx !== -1) {
    const legalRowClosing = main.indexOf('</div></footer>', legalRowIdx);
    if (legalRowClosing !== -1) {
      const legalLinks = '<div class="framer-legal-links" style="display:flex;gap:16px;align-items:center;"><a href="/privacy" class="framer-text framer-styles-preset-qeu7lu" style="--framer-text-color:var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35);text-decoration:none;">Privacy</a><a href="/terms" class="framer-text framer-styles-preset-qeu7lu" style="--framer-text-color:var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35);text-decoration:none;">Terms</a></div>';
      main = main.slice(0, legalRowClosing) + legalLinks + main.slice(legalRowClosing);
    }
  }

  const rawHtml = main + '\n' + svg;

  const content = `'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/foundation/database/client';

const FRAMER_STYLES = ` + JSON.stringify(styles) + `;

const RAW_ABOUT_HTML = ` + JSON.stringify(rawHtml) + `;

const OVERRIDE_CSS = \`
  [data-framer-appear-id] {
    opacity: 1 !important;
    transform: none !important;
  }
  body, html {
    background-color: #0b0b0a !important;
  }
  a, button, [data-framer-name="Logo"], [data-framer-name="Links"] a {
    cursor: pointer !important;
  }
  .landing-page-container [data-framer-name="Logo"] {
    display: inline-flex !important;
    align-items: center !important;
    text-decoration: none !important;
  }
  .landing-page-container [data-framer-name="Logo"] .framer-j9tvgv {
    display: none !important;
  }
  .allel-nav-brand-logo {
    display: inline-block !important;
    width: 17px !important;
    height: 17px !important;
    object-fit: contain !important;
    margin-right: 8px !important;
    flex-shrink: 0 !important;
    background: transparent !important;
  }
\`;

export default function AboutPage() {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);

  useEffect(() => {
    setMounted(true);
    const supabase = createClient();

    supabase.auth.getUser().then((res: { data: { user: { id: string; email?: string | null } | null } }) => {
      if (res.data?.user) {
        setUser({ id: res.data.user.id, email: res.data.user.email ?? undefined });
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event: unknown, session: { user?: { id: string; email?: string | null } } | null) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email ?? undefined });
      } else {
        setUser(null);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const setupInteractions = () => {
      const isAuthenticated = !!user;
      const targetDestination = isAuthenticated ? '/dashboard' : '/auth/login';

      // 1. Ensure Logo in Navbar
      const navLogo = document.querySelector('[data-framer-name="Logo"]');
      if (navLogo) {
        let img = navLogo.querySelector('.allel-nav-brand-logo') as HTMLImageElement | null;
        if (!img) {
          img = document.createElement('img');
          img.src = '/dot.png';
          img.alt = 'Allel';
          img.className = 'allel-nav-brand-logo';
          img.style.cssText = 'width: 17px; height: 17px; margin-right: 8px; object-fit: contain; display: inline-block; vertical-align: middle; flex-shrink: 0; background: transparent;';
          const textContainer = navLogo.querySelector('.framer-gdhgkz');
          if (textContainer) {
            navLogo.insertBefore(img, textContainer);
          } else {
            navLogo.prepend(img);
          }
        } else if (img.getAttribute('src') !== '/dot.png') {
          img.setAttribute('src', '/dot.png');
        }
      }

      // 2. Ensure Logo in Footer Brand
      const footerBrand = document.querySelector('[data-framer-name="Brand"]');
      if (footerBrand) {
        let img = footerBrand.querySelector('.allel-footer-brand-logo') as HTMLImageElement | null;
        if (!img) {
          img = document.createElement('img');
          img.src = '/dot.png';
          img.alt = 'Allel';
          img.className = 'allel-footer-brand-logo';
          img.style.cssText = 'width: 20px; height: 20px; margin-right: 8px; object-fit: contain; flex-shrink: 0; background: transparent;';
          const brandText = footerBrand.querySelector('.framer-1vurpbe');
          if (brandText && !brandText.closest('.allel-footer-brand-header')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'allel-footer-brand-header';
            wrapper.style.cssText = 'display: flex; align-items: center; gap: 10px; margin-bottom: 8px;';
            brandText.parentNode?.insertBefore(wrapper, brandText);
            wrapper.appendChild(img);
            wrapper.appendChild(brandText);
          }
        } else if (img.getAttribute('src') !== '/dot.png') {
          img.setAttribute('src', '/dot.png');
        }
      }

      // 3. Wire CTAs
      const ctaButtons = document.querySelectorAll('a[href="/dashboard"], a[href="./dashboard"], a[data-framer-name="Primary"]');
      ctaButtons.forEach((btn) => {
        btn.setAttribute('href', targetDestination);
      });

      // 4. Document-wide navigation click interception
      if (!document.body.getAttribute('data-about-nav-hooked')) {
        document.body.setAttribute('data-about-nav-hooked', 'true');

        document.addEventListener('click', (e) => {
          const anchor = (e.target as HTMLElement)?.closest('a');
          if (!anchor) return;

          const rawHref = anchor.getAttribute('href');
          if (!rawHref) return;

          const href = rawHref.trim();

          if (href === '/' || href === './') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/';
            return;
          }

          if (href === '/pricing' || href === './pricing') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/pricing';
            return;
          }

          if (href === '/docs' || href === './docs') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/docs';
            return;
          }

          if (href === '/about' || href === './about') {
            e.preventDefault();
            e.stopPropagation();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }

          if (href === '/privacy' || href === './privacy') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/privacy';
            return;
          }

          if (href === '/terms' || href === './terms') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/terms';
            return;
          }

          if (href === '/#waitlist' || href === './#waitlist') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/#waitlist';
            return;
          }

          if (href === '/#integrations' || href === './#integrations') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/#integrations';
            return;
          }

          if (href === '/dashboard' || href === './dashboard') {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = targetDestination;
            return;
          }
        }, true);
      }
    };

    setupInteractions();
    const interval = setInterval(setupInteractions, 500);
    return () => clearInterval(interval);
  }, [mounted, user]);

  if (!mounted) {
    return (
      <div style={{ background: '#0b0b0a', minHeight: '100vh' }} />
    );
  }

  return (
    <>
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: FRAMER_STYLES }} />
      <style dangerouslySetInnerHTML={{ __html: OVERRIDE_CSS }} />
      <div
        className="landing-page-container"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: RAW_ABOUT_HTML }}
      />
    </>
  );
}
`;

  fs.writeFileSync(path.join(ROOT, 'platform/src/app/about/page.tsx'), content);
  console.log('Successfully built platform/src/app/about/page.tsx');
}

// 4. DOC DETAILS [slug]
function buildDocDetails() {
  const slugs = [
    'quickstart',
    'connecting-your-stack',
    'the-daily-loop',
    'webhook-automation',
    'meet-the-agents',
    'approvals-and-audit'
  ];

  const docMap = {};
  for (const slug of slugs) {
    const filePath = path.join(ROOT, `platform/scripts/docs/${slug}.html`);
    if (fs.existsSync(filePath)) {
      const html = fs.readFileSync(filePath, 'utf8');
      const parts = extractFramerParts(html);
      docMap[slug] = parts;
    }
  }

  const dir = path.join(ROOT, 'platform/src/app/docs/[slug]');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const content = `'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/foundation/database/client';

const DOC_PAGES: Record<string, { styles: string; main: string; svg: string }> = ${JSON.stringify(docMap)};

const OVERRIDE_CSS = \`
  [data-framer-appear-id] {
    opacity: 1 !important;
    transform: none !important;
  }
  body, html {
    background-color: #0b0b0a !important;
  }
  a, button, [data-framer-name="Logo"], [data-framer-name="Links"] a {
    cursor: pointer !important;
  }
  .landing-page-container [data-framer-name="Logo"] {
    display: inline-flex !important;
    align-items: center !important;
    text-decoration: none !important;
  }
  .landing-page-container [data-framer-name="Logo"] .framer-j9tvgv {
    display: none !important;
  }
  .allel-nav-brand-logo {
    display: inline-block !important;
    width: 17px !important;
    height: 17px !important;
    object-fit: contain !important;
    margin-right: 8px !important;
    flex-shrink: 0 !important;
    background: transparent !important;
  }
\`;

export default function DocDetailPage() {
  const params = useParams();
  const slug = (params?.slug as string) || 'quickstart';
  const pageData = DOC_PAGES[slug] || DOC_PAGES['quickstart'];

  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);

  useEffect(() => {
    setMounted(true);
    const supabase = createClient();

    supabase.auth.getUser().then((res: { data: { user: { id: string; email?: string | null } | null } }) => {
      if (res.data?.user) {
        setUser({ id: res.data.user.id, email: res.data.user.email ?? undefined });
      }
    });
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const setupInteractions = () => {
      const isAuthenticated = !!user;
      const targetDestination = isAuthenticated ? '/dashboard' : '/auth/login';

      const navLogo = document.querySelector('[data-framer-name="Logo"]');
      if (navLogo) {
        let img = navLogo.querySelector('.allel-nav-brand-logo') as HTMLImageElement | null;
        if (!img) {
          img = document.createElement('img');
          img.src = '/dot.png';
          img.alt = 'Allel';
          img.className = 'allel-nav-brand-logo';
          img.style.cssText = 'width: 17px; height: 17px; margin-right: 8px; object-fit: contain; display: inline-block; vertical-align: middle; flex-shrink: 0; background: transparent;';
          const textContainer = navLogo.querySelector('.framer-gdhgkz');
          if (textContainer) {
            navLogo.insertBefore(img, textContainer);
          } else {
            navLogo.prepend(img);
          }
        }
      }

      const ctaButtons = document.querySelectorAll('a[href="/dashboard"], a[href="./dashboard"], a[data-framer-name="Primary"]');
      ctaButtons.forEach((btn) => {
        btn.setAttribute('href', targetDestination);
      });

      if (!document.body.getAttribute('data-doc-slug-nav-hooked')) {
        document.body.setAttribute('data-doc-slug-nav-hooked', 'true');

        document.addEventListener('click', (e) => {
          const anchor = (e.target as HTMLElement)?.closest('a');
          if (!anchor) return;
          const rawHref = anchor.getAttribute('href');
          if (!rawHref) return;
          const href = rawHref.trim();

          if (href === '/' || href === './' || href === '../') {
            e.preventDefault();
            window.location.href = '/';
            return;
          }
          if (href === '/pricing' || href === '../pricing' || href === './pricing') {
            e.preventDefault();
            window.location.href = '/pricing';
            return;
          }
          if (href === '/docs' || href === '../docs' || href === './docs') {
            e.preventDefault();
            window.location.href = '/docs';
            return;
          }
          if (href === '/about' || href === '../about' || href === './about') {
            e.preventDefault();
            window.location.href = '/about';
            return;
          }
          if (href === '/privacy' || href === '../privacy') {
            e.preventDefault();
            window.location.href = '/privacy';
            return;
          }
          if (href === '/terms' || href === '../terms') {
            e.preventDefault();
            window.location.href = '/terms';
            return;
          }
          if (href.startsWith('../docs/') || href.startsWith('/docs/') || href.startsWith('./')) {
            e.preventDefault();
            const target = href.startsWith('../docs/') ? href.slice(2) : (href.startsWith('./') ? '/docs/' + href.slice(2) : href);
            window.location.href = target;
            return;
          }
          if (href === '/dashboard' || href === '../dashboard') {
            e.preventDefault();
            window.location.href = targetDestination;
            return;
          }
        }, true);
      }
    };

    setupInteractions();
    const interval = setInterval(setupInteractions, 500);
    return () => clearInterval(interval);
  }, [mounted, user, slug]);

  if (!mounted || !pageData) {
    return <div style={{ background: '#0b0b0a', minHeight: '100vh' }} />;
  }

  const rawHtml = [pageData.main, pageData.svg].join(String.fromCharCode(10));

  return (
    <>
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: pageData.styles }} />
      <style dangerouslySetInnerHTML={{ __html: OVERRIDE_CSS }} />
      <div
        className="landing-page-container"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: rawHtml }}
      />
    </>
  );
}
`;

  fs.writeFileSync(path.join(dir, 'page.tsx'), content);
  console.log('Successfully built platform/src/app/docs/[slug]/page.tsx');
}

function buildPrivacy() {
  const html = fs.readFileSync(path.join(ROOT, 'platform/scripts/framer_pricing_live.html'), 'utf8');
  let { styles } = extractFramerParts(html);

  const navMatch = html.match(/<nav class="framer-18q8gw8"[\s\S]*?<\/nav>/);
  const navHtml = navMatch ? navMatch[0] : '';

  let footerMatch = html.match(/<footer class="framer-14gx74k"[\s\S]*?<\/footer>/);
  let footerHtml = footerMatch ? footerMatch[0] : '';

  // Add legal links into the footer if not already there
  const legalRowIdx = footerHtml.indexOf('data-framer-name="Legal Row"');
  if (legalRowIdx !== -1) {
    const legalRowClosing = footerHtml.indexOf('</div></footer>', legalRowIdx);
    if (legalRowClosing !== -1) {
      const legalLinks = '<div class="framer-legal-links" style="display:flex;gap:16px;align-items:center;"><a href="/privacy" class="framer-text framer-styles-preset-qeu7lu" style="--framer-text-color:var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35);text-decoration:none;">Privacy</a><a href="/terms" class="framer-text framer-styles-preset-qeu7lu" style="--framer-text-color:var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35);text-decoration:none;">Terms</a></div>';
      footerHtml = footerHtml.slice(0, legalRowClosing) + legalLinks + footerHtml.slice(legalRowClosing);
    }
  }

  const content = `'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/foundation/database/client';

const FRAMER_STYLES = ` + JSON.stringify(styles) + `;

const OVERRIDE_CSS = \`
  [data-framer-appear-id] {
    opacity: 1 !important;
    transform: none !important;
  }
  body, html {
    background-color: #0b0b0a !important;
  }
  a, button, [data-framer-name="Logo"], [data-framer-name="Links"] a {
    cursor: pointer !important;
  }
  .landing-page-container [data-framer-name="Logo"] {
    display: inline-flex !important;
    align-items: center !important;
    text-decoration: none !important;
  }
  .landing-page-container [data-framer-name="Logo"] .framer-j9tvgv {
    display: none !important;
  }
  .allel-nav-brand-logo {
    display: inline-block !important;
    width: 17px !important;
    height: 17px !important;
    object-fit: contain !important;
    margin-right: 8px !important;
    flex-shrink: 0 !important;
    background: transparent !important;
  }
\`;

export default function PrivacyPolicyPage() {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);

  useEffect(() => {
    setMounted(true);
    const supabase = createClient();

    supabase.auth.getUser().then((res: { data: { user: { id: string; email?: string | null } | null } }) => {
      if (res.data?.user) {
        setUser({ id: res.data.user.id, email: res.data.user.email ?? undefined });
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event: unknown, session: { user?: { id: string; email?: string | null } } | null) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email ?? undefined });
      } else {
        setUser(null);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const setupInteractions = () => {
      const isAuthenticated = !!user;
      const targetDestination = isAuthenticated ? '/dashboard' : '/auth/login';

      const navLogo = document.querySelector('[data-framer-name="Logo"]');
      if (navLogo) {
        let img = navLogo.querySelector('.allel-nav-brand-logo') as HTMLImageElement | null;
        if (!img) {
          img = document.createElement('img');
          img.src = '/dot.png';
          img.alt = 'Allel';
          img.className = 'allel-nav-brand-logo';
          img.style.cssText = 'width: 17px; height: 17px; margin-right: 8px; object-fit: contain; display: inline-block; vertical-align: middle; flex-shrink: 0; background: transparent;';
          const textContainer = navLogo.querySelector('.framer-gdhgkz');
          if (textContainer) {
            navLogo.insertBefore(img, textContainer);
          } else {
            navLogo.prepend(img);
          }
        }
      }

      const footerBrand = document.querySelector('[data-framer-name="Brand"]');
      if (footerBrand) {
        let img = footerBrand.querySelector('.allel-footer-brand-logo') as HTMLImageElement | null;
        if (!img) {
          img = document.createElement('img');
          img.src = '/dot.png';
          img.alt = 'Allel';
          img.className = 'allel-footer-brand-logo';
          img.style.cssText = 'width: 20px; height: 20px; margin-right: 8px; object-fit: contain; flex-shrink: 0; background: transparent;';
          const brandText = footerBrand.querySelector('.framer-1vurpbe');
          if (brandText && !brandText.closest('.allel-footer-brand-header')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'allel-footer-brand-header';
            wrapper.style.cssText = 'display: flex; align-items: center; gap: 10px; margin-bottom: 8px;';
            brandText.parentNode?.insertBefore(wrapper, brandText);
            wrapper.appendChild(img);
            wrapper.appendChild(brandText);
          }
        }
      }

      const ctaButtons = document.querySelectorAll('a[href="/dashboard"], a[href="./dashboard"], a[data-framer-name="Primary"]');
      ctaButtons.forEach((btn) => {
        btn.setAttribute('href', targetDestination);
      });
    };

    setupInteractions();
    const interval = setInterval(setupInteractions, 500);
    return () => clearInterval(interval);
  }, [mounted, user]);

  if (!mounted) {
    return <div style={{ background: '#0b0b0a', minHeight: '100vh' }} />;
  }

  return (
    <div className="framer-EWCJ0 framer-xxVvw framer-5RUiA framer-peJNi framer-1y8ilu8" data-layout-template="true" style={{ minHeight: '100vh', width: 'auto' }}>
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: FRAMER_STYLES }} />
      <style dangerouslySetInnerHTML={{ __html: OVERRIDE_CSS }} />

      {/* Framer Native Navigation */}
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: ` + JSON.stringify(navHtml) + ` }} />

      {/* Center Framer Content Area */}
      <main style={{ maxWidth: '960px', width: '100%', margin: '60px auto 100px auto', padding: '0 24px', boxSizing: 'border-box' }}>
        {/* Intro */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p style={{ fontFamily: 'Cabinet Grotesk, sans-serif', fontSize: '14px', fontWeight: 500, color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Legal &amp; Compliance</p>
          <h1 style={{ fontFamily: 'Cabinet Grotesk, sans-serif', fontSize: '38px', fontWeight: 700, color: 'var(--token-4b5c2631-4675-4701-82c8-51d44ba443f5)', letterSpacing: '-0.03em', margin: '0 0 16px 0' }}>Allel Privacy Policy</h1>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)' }}>Last updated: September 5, 2026 • Effective Date: September 5, 2026 • Application: Allel (https://allel.co)</p>
        </div>

        {/* Card Surface matching Framer token styles */}
        <div style={{
          backgroundColor: 'var(--token-10e74244-94d1-431e-87d0-281bc16f26b9)',
          border: '1px solid var(--token-fc3e2144-81ca-48e6-9365-4417af9831c9)',
          borderRadius: '4px',
          padding: '44px 36px',
          color: 'var(--token-4b5c2631-4675-4701-82c8-51d44ba443f5)',
          fontFamily: 'Inter, sans-serif',
          fontSize: '14.5px',
          lineHeight: '1.7'
        }}>
          {/* Section 1 */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontFamily: 'Cabinet Grotesk, sans-serif', fontSize: '19px', fontWeight: 600, color: 'var(--token-4b5c2631-4675-4701-82c8-51d44ba443f5)', letterSpacing: '-0.02em', marginBottom: '12px' }}>1. Overview &amp; Introduction</h2>
            <p style={{ color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)', marginBottom: '10px' }}>
              Allel (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;), accessible via <a href="https://allel.co" style={{ color: '#ffffff', textDecoration: 'underline' }}>https://allel.co</a>, provides AI-assisted revenue recovery, account workflow automation, and unified daily operations for founders and customer teams.
            </p>
            <p style={{ color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)' }}>
              We are committed to protecting your personal information and your right to privacy. This Privacy Policy outlines what information we collect, how it is used, how it is safeguarded, and how you retain full control over your data, with specific details on our handling of Google user data.
            </p>
          </section>

          {/* Section 2 */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontFamily: 'Cabinet Grotesk, sans-serif', fontSize: '19px', fontWeight: 600, color: 'var(--token-4b5c2631-4675-4701-82c8-51d44ba443f5)', letterSpacing: '-0.02em', marginBottom: '12px' }}>2. Information We Collect</h2>
            <p style={{ color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)', marginBottom: '10px' }}>
              When you use Allel, we collect only the minimum necessary information to provide our autonomous operational services:
            </p>
            <ul style={{ paddingLeft: '20px', color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)' }}>
              <li style={{ marginBottom: '8px' }}><strong style={{ color: '#ffffff' }}>Account Information:</strong> Name, work email address, company name, and authentication credentials provided during sign-up.</li>
              <li style={{ marginBottom: '8px' }}><strong style={{ color: '#ffffff' }}>Google Workspace Data:</strong> When you connect Gmail or Google Calendar via Google OAuth, we access message headers, thread context, drafts, and calendar metadata strictly necessary to detect customer risks and generate recovery email drafts.</li>
              <li style={{ marginBottom: '8px' }}><strong style={{ color: '#ffffff' }}>Integrated SaaS Data:</strong> Read-only operational metadata from tools you explicitly connect (e.g., Stripe subscription events, PostHog churn signals, Intercom tickets, HubSpot contacts).</li>
              <li><strong style={{ color: '#ffffff' }}>Operational Telemetry:</strong> Log records of agent actions, system status, approval queue decisions, and audit history.</li>
            </ul>
          </section>

          {/* Section 3: Google Limited Use */}
          <section style={{ marginBottom: '32px', borderLeft: '3px solid #7ba0ff', paddingLeft: '20px', backgroundColor: 'rgba(123, 160, 255, 0.03)', padding: '20px 24px', borderRadius: '4px' }}>
            <h2 style={{ fontFamily: 'Cabinet Grotesk, sans-serif', fontSize: '19px', fontWeight: 600, color: '#ffffff', letterSpacing: '-0.02em', marginBottom: '12px' }}>3. Google API Services User Data Policy &amp; Limited Use Disclosure</h2>
            <p style={{ color: '#edede8', marginBottom: '12px' }}>
              Allel&apos;s use and transfer of information received from Google APIs to any other app will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#7ba0ff', textDecoration: 'underline' }}>Google API Services User Data Policy</a>, including the <strong>Limited Use</strong> requirements.
            </p>
            <ul style={{ paddingLeft: '20px', color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)' }}>
              <li style={{ marginBottom: '8px' }}><strong style={{ color: '#ffffff' }}>Specific Purpose Only:</strong> Google Workspace data is accessed solely to draft contextual email responses in your Gmail drafts folder and summarize relevant schedule context in your daily founder brief.</li>
              <li style={{ marginBottom: '8px' }}><strong style={{ color: '#ffffff' }}>Strict AI Model Training Prohibition:</strong> Allel does not use customer Google Workspace data—including Gmail message bodies, email metadata, or Google Calendar event details—to train, retrain, fine-tune, or improve generalized or foundational artificial intelligence (AI) or machine learning (ML) models. We do not transfer this data to third-party model providers for model training.</li>
              <li style={{ marginBottom: '8px' }}><strong style={{ color: '#ffffff' }}>No Advertising:</strong> Google user data is never used for serving advertisements, retargeting, or interest-based advertising.</li>
              <li><strong style={{ color: '#ffffff' }}>Human Access Restrictions:</strong> Humans are not allowed to read Google user data unless you provide explicit consent for specific troubleshooting, it is strictly necessary for security purposes (such as investigating abuse), or required by applicable law.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontFamily: 'Cabinet Grotesk, sans-serif', fontSize: '19px', fontWeight: 600, color: 'var(--token-4b5c2631-4675-4701-82c8-51d44ba443f5)', letterSpacing: '-0.02em', marginBottom: '12px' }}>4. How We Use Your Information</h2>
            <p style={{ color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)', marginBottom: '10px' }}>We use collected data solely to deliver the specific features you request:</p>
            <ul style={{ paddingLeft: '20px', color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)' }}>
              <li style={{ marginBottom: '8px' }}>Identifying failed customer invoices, subscription cancellations, or churn risks across Stripe and PostHog.</li>
              <li style={{ marginBottom: '8px' }}>Drafting context-aware customer recovery emails inside your Gmail drafts folder. <strong style={{ color: '#ffffff' }}>Note: Allel never dispatches emails autonomously without your manual review and approval in the founder dashboard.</strong></li>
              <li style={{ marginBottom: '8px' }}>Aggregating relevant meetings and priorities into your daily brief summary.</li>
              <li>Maintaining authenticated sessions and preventing unauthorized access.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontFamily: 'Cabinet Grotesk, sans-serif', fontSize: '19px', fontWeight: 600, color: 'var(--token-4b5c2631-4675-4701-82c8-51d44ba443f5)', letterSpacing: '-0.02em', marginBottom: '12px' }}>5. Data Storage, Security &amp; Retention</h2>
            <p style={{ color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)', marginBottom: '10px' }}>
              Security is foundational to Allel. All user credentials, OAuth access tokens, and integration secrets are encrypted using industry-standard AES-256 encryption at rest and TLS 1.3 in transit.
            </p>
            <p style={{ color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)' }}>
              We retain customer operational data only for as long as your workspace remains active. When you disconnect an integration, the associated OAuth tokens and temporary sync snapshots are immediately purged from our active systems.
            </p>
          </section>

          {/* Section 6 */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontFamily: 'Cabinet Grotesk, sans-serif', fontSize: '19px', fontWeight: 600, color: 'var(--token-4b5c2631-4675-4701-82c8-51d44ba443f5)', letterSpacing: '-0.02em', marginBottom: '12px' }}>6. Your Rights &amp; Data Deletion</h2>
            <p style={{ color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)', marginBottom: '10px' }}>You retain full sovereignty over your data at all times:</p>
            <ul style={{ paddingLeft: '20px', color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)' }}>
              <li style={{ marginBottom: '8px' }}>
                <strong style={{ color: '#ffffff' }}>Revoke Google Access:</strong> You can disconnect Google access directly in your Allel Dashboard (Settings &gt; Integrations) or via Google&apos;s Security Portal at{' '}
                <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" style={{ color: '#7ba0ff', textDecoration: 'underline' }}>myaccount.google.com/permissions</a>.
              </li>
              <li>
                <strong style={{ color: '#ffffff' }}>Request Full Deletion:</strong> You may request complete deletion of your account, workspace history, and all stored data by emailing{' '}
                <a href="mailto:kushagarasingh175@gmail.com" style={{ color: '#ffffff', textDecoration: 'underline', fontFamily: 'monospace' }}>kushagarasingh175@gmail.com</a>. We will fulfill deletion requests within 30 business days.
              </li>
            </ul>
          </section>

          {/* Section 7 */}
          <section>
            <h2 style={{ fontFamily: 'Cabinet Grotesk, sans-serif', fontSize: '19px', fontWeight: 600, color: 'var(--token-4b5c2631-4675-4701-82c8-51d44ba443f5)', letterSpacing: '-0.02em', marginBottom: '12px' }}>7. Contact &amp; Operator Information</h2>
            <p style={{ color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)', marginBottom: '12px' }}>
              For privacy inquiries, data subject access requests, or verification questions, please contact our team directly:
            </p>
            <div style={{ padding: '16px 20px', borderRadius: '4px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--token-fc3e2144-81ca-48e6-9365-4417af9831c9)', fontSize: '13px', fontFamily: 'monospace', color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)' }}>
              <p style={{ color: '#ffffff', fontFamily: 'Cabinet Grotesk, sans-serif', fontWeight: 600, fontSize: '15px', marginBottom: '6px' }}>Allel Operations</p>
              <p style={{ margin: '4px 0' }}>Primary Support: kushagarasingh175@gmail.com</p>
              <p style={{ margin: '4px 0' }}>Founder Contact: kushagra@allel.co</p>
              <p style={{ margin: '4px 0' }}>Official Website: https://allel.co</p>
            </div>
          </section>
        </div>
      </main>

      <div className="framer-1vmkvli"></div>

      {/* Framer Native Footer */}
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: ` + JSON.stringify(footerHtml) + ` }} />
    </div>
  );
}
`;

  fs.writeFileSync(path.join(ROOT, 'platform/src/app/privacy/page.tsx'), content);
  console.log('Built platform/src/app/privacy/page.tsx');
}

// 3. TERMS PAGE
function buildTerms() {
  const html = fs.readFileSync(path.join(ROOT, 'platform/scripts/framer_pricing_live.html'), 'utf8');
  let { styles } = extractFramerParts(html);

  const navMatch = html.match(/<nav class="framer-18q8gw8"[\s\S]*?<\/nav>/);
  const navHtml = navMatch ? navMatch[0] : '';

  let footerMatch = html.match(/<footer class="framer-14gx74k"[\s\S]*?<\/footer>/);
  let footerHtml = footerMatch ? footerMatch[0] : '';

  const legalRowIdx = footerHtml.indexOf('data-framer-name="Legal Row"');
  if (legalRowIdx !== -1) {
    const legalRowClosing = footerHtml.indexOf('</div></footer>', legalRowIdx);
    if (legalRowClosing !== -1) {
      const legalLinks = '<div class="framer-legal-links" style="display:flex;gap:16px;align-items:center;"><a href="/privacy" class="framer-text framer-styles-preset-qeu7lu" style="--framer-text-color:var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35);text-decoration:none;">Privacy</a><a href="/terms" class="framer-text framer-styles-preset-qeu7lu" style="--framer-text-color:var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35);text-decoration:none;">Terms</a></div>';
      footerHtml = footerHtml.slice(0, legalRowClosing) + legalLinks + footerHtml.slice(legalRowClosing);
    }
  }

  const content = `'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/foundation/database/client';

const FRAMER_STYLES = ` + JSON.stringify(styles) + `;

const OVERRIDE_CSS = \`
  [data-framer-appear-id] {
    opacity: 1 !important;
    transform: none !important;
  }
  body, html {
    background-color: #0b0b0a !important;
  }
  a, button, [data-framer-name="Logo"], [data-framer-name="Links"] a {
    cursor: pointer !important;
  }
  .landing-page-container [data-framer-name="Logo"] {
    display: inline-flex !important;
    align-items: center !important;
    text-decoration: none !important;
  }
  .landing-page-container [data-framer-name="Logo"] .framer-j9tvgv {
    display: none !important;
  }
  .allel-nav-brand-logo {
    display: inline-block !important;
    width: 17px !important;
    height: 17px !important;
    object-fit: contain !important;
    margin-right: 8px !important;
    flex-shrink: 0 !important;
    background: transparent !important;
  }
\`;

export default function TermsOfServicePage() {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);

  useEffect(() => {
    setMounted(true);
    const supabase = createClient();

    supabase.auth.getUser().then((res: { data: { user: { id: string; email?: string | null } | null } }) => {
      if (res.data?.user) {
        setUser({ id: res.data.user.id, email: res.data.user.email ?? undefined });
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event: unknown, session: { user?: { id: string; email?: string | null } } | null) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email ?? undefined });
      } else {
        setUser(null);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const setupInteractions = () => {
      const isAuthenticated = !!user;
      const targetDestination = isAuthenticated ? '/dashboard' : '/auth/login';

      const navLogo = document.querySelector('[data-framer-name="Logo"]');
      if (navLogo) {
        let img = navLogo.querySelector('.allel-nav-brand-logo') as HTMLImageElement | null;
        if (!img) {
          img = document.createElement('img');
          img.src = '/dot.png';
          img.alt = 'Allel';
          img.className = 'allel-nav-brand-logo';
          img.style.cssText = 'width: 17px; height: 17px; margin-right: 8px; object-fit: contain; display: inline-block; vertical-align: middle; flex-shrink: 0; background: transparent;';
          const textContainer = navLogo.querySelector('.framer-gdhgkz');
          if (textContainer) {
            navLogo.insertBefore(img, textContainer);
          } else {
            navLogo.prepend(img);
          }
        }
      }

      const footerBrand = document.querySelector('[data-framer-name="Brand"]');
      if (footerBrand) {
        let img = footerBrand.querySelector('.allel-footer-brand-logo') as HTMLImageElement | null;
        if (!img) {
          img = document.createElement('img');
          img.src = '/dot.png';
          img.alt = 'Allel';
          img.className = 'allel-footer-brand-logo';
          img.style.cssText = 'width: 20px; height: 20px; margin-right: 8px; object-fit: contain; flex-shrink: 0; background: transparent;';
          const brandText = footerBrand.querySelector('.framer-1vurpbe');
          if (brandText && !brandText.closest('.allel-footer-brand-header')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'allel-footer-brand-header';
            wrapper.style.cssText = 'display: flex; align-items: center; gap: 10px; margin-bottom: 8px;';
            brandText.parentNode?.insertBefore(wrapper, brandText);
            wrapper.appendChild(img);
            wrapper.appendChild(brandText);
          }
        }
      }

      const ctaButtons = document.querySelectorAll('a[href="/dashboard"], a[href="./dashboard"], a[data-framer-name="Primary"]');
      ctaButtons.forEach((btn) => {
        btn.setAttribute('href', targetDestination);
      });
    };

    setupInteractions();
    const interval = setInterval(setupInteractions, 500);
    return () => clearInterval(interval);
  }, [mounted, user]);

  if (!mounted) {
    return <div style={{ background: '#0b0b0a', minHeight: '100vh' }} />;
  }

  return (
    <div className="framer-EWCJ0 framer-xxVvw framer-5RUiA framer-peJNi framer-1y8ilu8" data-layout-template="true" style={{ minHeight: '100vh', width: 'auto' }}>
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: FRAMER_STYLES }} />
      <style dangerouslySetInnerHTML={{ __html: OVERRIDE_CSS }} />

      {/* Framer Native Navigation */}
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: ` + JSON.stringify(navHtml) + ` }} />

      {/* Center Framer Content Area */}
      <main style={{ maxWidth: '960px', width: '100%', margin: '60px auto 100px auto', padding: '0 24px', boxSizing: 'border-box' }}>
        {/* Intro */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p style={{ fontFamily: 'Cabinet Grotesk, sans-serif', fontSize: '14px', fontWeight: 500, color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Legal &amp; Compliance</p>
          <h1 style={{ fontFamily: 'Cabinet Grotesk, sans-serif', fontSize: '38px', fontWeight: 700, color: 'var(--token-4b5c2631-4675-4701-82c8-51d44ba443f5)', letterSpacing: '-0.03em', margin: '0 0 16px 0' }}>Terms of Service</h1>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)' }}>Last updated: September 5, 2026 • Effective Date: September 5, 2026 • Application: Allel (https://allel.co)</p>
        </div>

        {/* Card Surface matching Framer token styles */}
        <div style={{
          backgroundColor: 'var(--token-10e74244-94d1-431e-87d0-281bc16f26b9)',
          border: '1px solid var(--token-fc3e2144-81ca-48e6-9365-4417af9831c9)',
          borderRadius: '4px',
          padding: '44px 36px',
          color: 'var(--token-4b5c2631-4675-4701-82c8-51d44ba443f5)',
          fontFamily: 'Inter, sans-serif',
          fontSize: '14.5px',
          lineHeight: '1.7'
        }}>
          {/* Section 1 */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontFamily: 'Cabinet Grotesk, sans-serif', fontSize: '19px', fontWeight: 600, color: 'var(--token-4b5c2631-4675-4701-82c8-51d44ba443f5)', letterSpacing: '-0.02em', marginBottom: '12px' }}>1. Acceptance of Terms</h2>
            <p style={{ color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)' }}>
              By creating an account, accessing, or using Allel (&quot;the Platform&quot;), available at <a href="https://allel.co" style={{ color: '#ffffff', textDecoration: 'underline' }}>https://allel.co</a>, you agree to be bound by these Terms of Service. If you do not agree to these Terms, you may not access or use the Platform.
            </p>
          </section>

          {/* Section 2 */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontFamily: 'Cabinet Grotesk, sans-serif', fontSize: '19px', fontWeight: 600, color: 'var(--token-4b5c2631-4675-4701-82c8-51d44ba443f5)', letterSpacing: '-0.02em', marginBottom: '12px' }}>2. Description of the Service</h2>
            <p style={{ color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)', marginBottom: '10px' }}>
              Allel provides an autonomous AI operations platform for startup founders and modern teams. The platform connects your existing SaaS tools (including Stripe, PostHog, Intercom, Slack, Linear, and Google Workspace) to detect customer recovery opportunities, monitor telemetry, and generate daily executive briefs.
            </p>
            <p style={{ color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)' }}>
              Allel operates strictly with a <strong style={{ color: '#ffffff' }}>human-in-the-loop guarantee</strong>: sensitive actions (such as sending customer recovery emails or updating external records) are created as drafts requiring affirmative user approval before execution.
            </p>
          </section>

          {/* Section 3 */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontFamily: 'Cabinet Grotesk, sans-serif', fontSize: '19px', fontWeight: 600, color: 'var(--token-4b5c2631-4675-4701-82c8-51d44ba443f5)', letterSpacing: '-0.02em', marginBottom: '12px' }}>3. Accounts &amp; Security</h2>
            <p style={{ color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)' }}>
              You are responsible for safeguarding your login credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized access or breach of security. Allel cannot and will not be liable for any loss or damage arising from your failure to comply with security obligations.
            </p>
          </section>

          {/* Section 4 */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontFamily: 'Cabinet Grotesk, sans-serif', fontSize: '19px', fontWeight: 600, color: 'var(--token-4b5c2631-4675-4701-82c8-51d44ba443f5)', letterSpacing: '-0.02em', marginBottom: '12px' }}>4. Connected Integrations &amp; OAuth Permissions</h2>
            <p style={{ color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)', marginBottom: '10px' }}>
              When connecting third-party services (such as Google Workspace, Stripe, or PostHog), you authorize Allel to access and process your account data solely in accordance with the permissions you grant and our <a href="/privacy" style={{ color: '#7ba0ff', textDecoration: 'underline' }}>Privacy Policy</a>.
            </p>
            <p style={{ color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)' }}>
              You may disconnect integrations at any time via the Settings page in your dashboard, which immediately revokes access tokens and halts background synchronization.
            </p>
          </section>

          {/* Section 5 */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontFamily: 'Cabinet Grotesk, sans-serif', fontSize: '19px', fontWeight: 600, color: 'var(--token-4b5c2631-4675-4701-82c8-51d44ba443f5)', letterSpacing: '-0.02em', marginBottom: '12px' }}>5. Human-in-the-Loop Safeguards &amp; Autonomy Scope</h2>
            <p style={{ color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)' }}>
              Allel agents are engineered with strict safety guardrails. Outbound customer communications (such as recovery emails) are generated as pending drafts in your queue. You retain sole decision-making authority over whether to approve, edit, or reject any draft. Allel is not responsible for any messages sent following your explicit manual approval.
            </p>
          </section>

          {/* Section 6 */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontFamily: 'Cabinet Grotesk, sans-serif', fontSize: '19px', fontWeight: 600, color: 'var(--token-4b5c2631-4675-4701-82c8-51d44ba443f5)', letterSpacing: '-0.02em', marginBottom: '12px' }}>6. Subscriptions, Billing &amp; Cancellations</h2>
            <p style={{ color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)', marginBottom: '10px' }}>
              Allel is priced on a per-seat subscription basis ($25 Starter, $49 Growth, $99 Pro). All plans include unlimited tool integrations. Subscriptions renew automatically at the beginning of each billing cycle unless cancelled prior to the renewal date.
            </p>
            <p style={{ color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)' }}>
              You may cancel your subscription at any time directly through the dashboard billing portal. Upon cancellation, your subscription remains active until the end of the current paid billing period.
            </p>
          </section>

          {/* Section 7 */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontFamily: 'Cabinet Grotesk, sans-serif', fontSize: '19px', fontWeight: 600, color: 'var(--token-4b5c2631-4675-4701-82c8-51d44ba443f5)', letterSpacing: '-0.02em', marginBottom: '12px' }}>7. Acceptable Use Policy</h2>
            <p style={{ color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)' }}>
              You agree not to use Allel to transmit spam, conduct unlawful surveillance, violate third-party intellectual property rights, breach applicable export laws, or engage in malicious interference with third-party APIs. We reserve the right to suspend accounts violating these standards.
            </p>
          </section>

          {/* Section 8 */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontFamily: 'Cabinet Grotesk, sans-serif', fontSize: '19px', fontWeight: 600, color: 'var(--token-4b5c2631-4675-4701-82c8-51d44ba443f5)', letterSpacing: '-0.02em', marginBottom: '12px' }}>8. Data Ownership &amp; Intellectual Property</h2>
            <p style={{ color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)' }}>
              You retain all ownership rights to your data, workflows, customer records, and communications. Allel does not claim any intellectual property rights over your workspace content. All rights, title, and interest in the Allel platform, trademarks, and codebase remain exclusively with Allel.
            </p>
          </section>

          {/* Section 9 */}
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontFamily: 'Cabinet Grotesk, sans-serif', fontSize: '19px', fontWeight: 600, color: 'var(--token-4b5c2631-4675-4701-82c8-51d44ba443f5)', letterSpacing: '-0.02em', marginBottom: '12px' }}>9. Limitation of Liability</h2>
            <p style={{ color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)' }}>
              To the maximum extent permitted by law, Allel and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or business opportunities, arising out of your use of or inability to use the Platform.
            </p>
          </section>

          {/* Section 10 */}
          <section>
            <h2 style={{ fontFamily: 'Cabinet Grotesk, sans-serif', fontSize: '19px', fontWeight: 600, color: 'var(--token-4b5c2631-4675-4701-82c8-51d44ba443f5)', letterSpacing: '-0.02em', marginBottom: '12px' }}>10. Governing Law &amp; Contact</h2>
            <p style={{ color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)', marginBottom: '12px' }}>
              These Terms shall be governed by and construed in accordance with the laws of Delaware, United States. For any inquiries regarding these Terms:
            </p>
            <div style={{ padding: '16px 20px', borderRadius: '4px', backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--token-fc3e2144-81ca-48e6-9365-4417af9831c9)', fontSize: '13px', fontFamily: 'monospace', color: 'var(--token-a858697d-e879-4ab9-8f8f-ff96d21fdb35)' }}>
              <p style={{ color: '#ffffff', fontFamily: 'Cabinet Grotesk, sans-serif', fontWeight: 600, fontSize: '15px', marginBottom: '6px' }}>Allel Legal</p>
              <p style={{ margin: '4px 0' }}>Founder Contact: kushagra@allel.co</p>
              <p style={{ margin: '4px 0' }}>Operator Support: kushagarasingh175@gmail.com</p>
              <p style={{ margin: '4px 0' }}>Website: https://allel.co</p>
            </div>
          </section>
        </div>
      </main>

      <div className="framer-1vmkvli"></div>

      {/* Framer Native Footer */}
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: ` + JSON.stringify(footerHtml) + ` }} />
    </div>
  );
}
`;

  fs.writeFileSync(path.join(ROOT, 'platform/src/app/terms/page.tsx'), content);
  console.log('Built platform/src/app/terms/page.tsx');
}

buildPricing();
buildPrivacy();
buildTerms();

buildDocs();
buildAbout();
buildDocDetails();
