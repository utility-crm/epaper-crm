import { Hono } from 'hono';

export const widgetRouter = new Hono();

widgetRouter.get('/widget.js', (c) => {
  c.header('Content-Type', 'application/javascript');
  c.header('Cache-Control', 'public, max-age=3600');

  const script = `
(function() {
  if (document.getElementById('epaper-support-widget-btn')) return;

  const style = document.createElement('style');
  style.textContent = \`
    #epaper-support-widget-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 56px;
      height: 56px;
      border-radius: 28px;
      background: #2563eb;
      color: #fff;
      border: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      cursor: pointer;
      z-index: 999998;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s;
    }
    #epaper-support-widget-btn:hover {
      transform: scale(1.05);
    }
    #epaper-support-widget-frame {
      position: fixed;
      bottom: 90px;
      right: 24px;
      width: 380px;
      height: 560px;
      max-height: calc(100vh - 110px);
      border: none;
      border-radius: 16px;
      box-shadow: 0 8px 28px rgba(0,0,0,0.22);
      z-index: 999999;
      display: none;
      background: #fff;
      overflow: hidden;
    }
  \`;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.id = 'epaper-support-widget-btn';
  btn.title = 'AI Support Chat & Help';
  btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
  document.body.appendChild(btn);

  const frame = document.createElement('iframe');
  frame.id = 'epaper-support-widget-frame';
  frame.src = 'https://support.epaperspace.com/embed?origin=' + encodeURIComponent(window.location.origin);
  document.body.appendChild(frame);

  let isOpen = false;
  btn.addEventListener('click', function() {
    isOpen = !isOpen;
    frame.style.display = isOpen ? 'block' : 'none';
  });
})();
`;
  return c.text(script);
});
