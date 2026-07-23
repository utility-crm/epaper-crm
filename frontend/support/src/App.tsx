import React, { useState } from 'react';
import { SupportDeskPage } from './pages/SupportDeskPage.tsx';
import { MemoryManagementPage } from './pages/MemoryManagementPage.tsx';
import { ChatbotWidget } from './components/ChatbotWidget.tsx';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'desk' | 'memory' | 'preview'>('desk');

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <nav style={{
        height: '64px',
        borderBottom: '1px solid #334155',
        background: '#1e293b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: '#2563eb',
            color: '#fff',
            fontWeight: 800,
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '14px'
          }}>
            ePaperSpace
          </div>
          <span style={{ fontWeight: 600, fontSize: '16px' }}>Support & AI Ticketing Desk</span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('desk')}
            style={{
              background: activeTab === 'desk' ? '#3b82f6' : 'transparent',
              color: '#fff',
              border: '1px solid #334155',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Support Queue
          </button>
          <button
            onClick={() => setActiveTab('memory')}
            style={{
              background: activeTab === 'memory' ? '#3b82f6' : 'transparent',
              color: '#fff',
              border: '1px solid #334155',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            AI Organization Knowledge
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            style={{
              background: activeTab === 'preview' ? '#3b82f6' : 'transparent',
              color: '#fff',
              border: '1px solid #334155',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Chatbot Preview
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main style={{ flex: 1 }}>
        {activeTab === 'desk' && <SupportDeskPage />}
        {activeTab === 'memory' && <MemoryManagementPage />}
        {activeTab === 'preview' && (
          <div style={{ padding: '48px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h2 style={{ marginBottom: '8px' }}>Tenant Live AI Chatbot Preview</h2>
            <p style={{ color: '#94a3b8', marginBottom: '24px' }}>
              Embed on any publisher custom domain with <code>&lt;script src="https://support.epaperspace.com/widget.js"&gt;&lt;/script&gt;</code>
            </p>
            <ChatbotWidget tenantId="dailycitynews" customDomain="epaper.dailycitynews.com" />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
