export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);

    // Only inspect GET or HEAD requests that aren't for static assets or files
    if (
      (request.method !== 'GET' && request.method !== 'HEAD') ||
      url.pathname.startsWith('/assets/') ||
      url.pathname.includes('.')
    ) {
      return env.ASSETS.fetch(request);
    }

    const hostname = url.hostname;
    const isPortalHost =
      hostname === 'epaperspace.com' ||
      hostname === 'www.epaperspace.com' ||
      hostname.endsWith('.pages.dev') ||
      hostname.endsWith('.workers.dev') ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1';

    let targetSlug = null;
    let redirectBasePath = '';

    // Determine targetSlug either from custom domain OR from /read/:slug
    if (!isPortalHost) {
      try {
        const resolveRes = await fetch(
          `https://epaper-gateway.satishkumar-link.workers.dev/api/domain/resolve?host=${encodeURIComponent(hostname)}`,
          { headers: { 'User-Agent': 'Cloudflare-Pages-Edge-Worker' } }
        );
        if (resolveRes.ok) {
          const resolveData = await resolveRes.json();
          if (resolveData?.ok && resolveData?.data?.slug) {
            targetSlug = resolveData.data.slug;
            redirectBasePath = '';
          }
        }
      } catch (err) {
        console.error('Domain resolve error:', err);
      }
    } else {
      const match = url.pathname.match(/^\/read\/([^\/]+)/);
      if (match && match[1]) {
        targetSlug = match[1];
        redirectBasePath = `/read/${targetSlug}`;
      }
    }

    // Check if we should auto-redirect single-edition on root visit
    const isArchiveRequested =
      url.searchParams.get('archive') === 'true' || url.searchParams.get('archive') === '1';

    if (
      targetSlug &&
      !isArchiveRequested &&
      (url.pathname === '/' || url.pathname === redirectBasePath || url.pathname === `${redirectBasePath}/`)
    ) {
      try {
        const editionsRes = await fetch(
          `https://epaper-content.satishkumar-link.workers.dev/api/read/${targetSlug}/editions`,
          { headers: { 'User-Agent': 'Cloudflare-Pages-Edge-Worker' } }
        );
        if (editionsRes.ok) {
          const editionsData = await editionsRes.json();
          const items = editionsData?.data?.items || [];
          if (items.length === 1) {
            const papersRes = await fetch(
              `https://epaper-content.satishkumar-link.workers.dev/api/read/${targetSlug}/papers?limit=1`,
              { headers: { 'User-Agent': 'Cloudflare-Pages-Edge-Worker' } }
            );
            if (papersRes.ok) {
              const papersData = await papersRes.json();
              const latestPaper = papersData?.data?.items?.[0];
              if (latestPaper && latestPaper.id) {
                const targetUrl = new URL(
                  `${redirectBasePath}/paper/${latestPaper.id}`,
                  request.url
                ).toString();
                return Response.redirect(targetUrl, 302);
              }
            }
          }
        }
      } catch (err) {
        console.error('Server-side auto-redirect error:', err);
      }
    }

    // Fetch static asset response (index.html)
    const assetResponse = await env.ASSETS.fetch(request);

    // If we resolved a publication slug, inject publication title & settings directly into HTML
    if (targetSlug && (assetResponse.headers.get('content-type')?.includes('text/html') || !url.pathname.includes('.'))) {
      try {
        const settingsRes = await fetch(
          `https://epaper-content.satishkumar-link.workers.dev/api/content/${targetSlug}/settings`,
          { headers: { 'User-Agent': 'Cloudflare-Pages-Edge-Worker' } }
        );
        if (settingsRes.ok) {
          const settingsJson = await settingsRes.json();
          const settings = settingsJson?.data;
          const pubTitle = settings?.org_name || targetSlug;

          const paperMatch = url.pathname.match(/\/paper\/([^\/]+)/);
          const paperId = paperMatch ? paperMatch[1] : null;
          const pageNum = url.searchParams.get('page') || '1';
          const clipTitle = url.searchParams.get('title') || `${pubTitle} - Page ${pageNum}`;

          return new HTMLRewriter()
            .on('title', {
              element(element) {
                element.setInnerContent(pubTitle);
              },
            })
            .on('head', {
              element(element) {
                if (settings) {
                  const safeJson = JSON.stringify(settings).replace(/</g, '\\u003c');
                  element.append(
                    `<script>window.__EPAPER_INITIAL_SETTINGS__ = ${safeJson};</script>`,
                    { html: true }
                  );
                }
                if (paperId) {
                  const pageImageUrl = `https://epaper-content.satishkumar-link.workers.dev/api/read/${targetSlug}/papers/${paperId}/pages/${pageNum}`;
                  const desc = `Read today's ${pubTitle} ePaper online. Stay informed on local, national, and international stories across all editions.`;
                  element.append(
                    `<meta property="og:title" content="${clipTitle.replace(/"/g, '&quot;')}" />` +
                    `<meta property="og:description" content="${desc.replace(/"/g, '&quot;')}" />` +
                    `<meta property="og:image" content="${pageImageUrl}" />` +
                    `<meta property="og:image:width" content="1200" />` +
                    `<meta property="og:image:height" content="1600" />` +
                    `<meta property="og:type" content="article" />` +
                    `<meta property="og:url" content="${request.url}" />` +
                    `<meta name="twitter:card" content="summary_large_image" />` +
                    `<meta name="twitter:title" content="${clipTitle.replace(/"/g, '&quot;')}" />` +
                    `<meta name="twitter:description" content="${desc.replace(/"/g, '&quot;')}" />` +
                    `<meta name="twitter:image" content="${pageImageUrl}" />`,
                    { html: true }
                  );
                }
              },
            })
            .transform(assetResponse);
        }
      } catch (err) {
        console.error('Settings injection error:', err);
      }
    }

    return assetResponse;
  },
};
