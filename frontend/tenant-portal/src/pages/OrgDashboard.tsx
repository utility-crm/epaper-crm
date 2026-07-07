import React, { useEffect, useState } from 'react';
import { portalApi } from '../lib/api';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Link } from 'react-router-dom';

interface OrgDashboardProps {
  slug: string;
  token: string;
}

export function OrgDashboard({ slug, token }: OrgDashboardProps) {
  const [editions, setEditions] = useState<any[]>([]);
  const [stats, setStats] = useState({ disk_usage_bytes: 0, pageviews: 0 });
  const [billing, setBilling] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      portalApi.getEditions(slug, token),
      portalApi.getTenantStats(slug, token),
      portalApi.getPlatformBillingStatus(slug, token)
    ]).then(([edRes, statsRes, billRes]) => {
      if (edRes.ok && edRes.data) setEditions(edRes.data.items ?? []);
      if (statsRes.ok && statsRes.data) setStats(statsRes.data);
      if (billRes.ok && billRes.data) setBilling(billRes.data);
      setLoading(false);
    });
  }, [slug, token]);

  const plan = billing?.plan || 'starter';
  const diskLimitGB = plan === 'enterprise' ? 2000 : plan === 'growth' ? 500 : 100;
  const diskLimitBytes = diskLimitGB * 1024 * 1024 * 1024;
  const diskUsedBytes = stats.disk_usage_bytes || 0;
  const diskAvailableBytes = Math.max(0, diskLimitBytes - diskUsedBytes);
  
  const formatMB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  const formatGB = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  
  const diskData = [
    { name: 'Used', value: diskUsedBytes },
    { name: 'Available', value: diskAvailableBytes }
  ];
  const diskColors = ['#ef4444', '#22c55e'];

  // Mock bar chart data for Traffic Usage (Last 6 Months) since we only have total pageviews right now
  const months = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
  const trafficData = months.map((m, i) => ({
    name: m,
    pageviews: i === 5 ? stats.pageviews : Math.floor(Math.random() * (stats.pageviews * 0.2)) // Give latest month the actual total for demo
  }));

  const draftCount = editions.filter(e => e.status === 'draft').length;
  const publishedCount = editions.filter(e => e.status === 'published').length;
  
  const publicLink = `https://${slug}.epaperspace.com`; // Assuming wildcard setup or custom domain later

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 6 }}>Welcome to Admin Dashboard</h1>
      </div>

      <div style={{ border: '1px solid var(--color-danger)', borderRadius: 8, padding: 16, marginBottom: 16, background: 'rgba(239, 68, 68, 0.05)' }}>
        <div style={{ color: 'var(--color-danger)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          🔗 Your Public Reader Link
        </div>
        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 12 }}>
          Share this link with your readers so they can view your published papers.
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <code style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', padding: '6px 12px', borderRadius: 6, fontSize: '0.85rem' }}>
            {publicLink}
          </code>
          <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem', borderColor: 'var(--color-danger)', color: '#fca5a5' }} onClick={() => navigator.clipboard.writeText(publicLink)}>Copy Link</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <Link to="/portal/editions" style={{ flex: 1, textDecoration: 'none' }}>
          <button className="btn-primary" style={{ width: '100%', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', borderRadius: 8 }}>Upload Epaper</button>
        </Link>
        <button className="btn-primary" style={{ flex: 1, background: '#0ea5e9', borderRadius: 8 }}>Change Domain</button>
        <button className="btn-primary" style={{ flex: 1, background: '#f59e0b', borderRadius: 8 }}>Help/Support</button>
        <div style={{ flex: 1, background: '#ef4444', borderRadius: 8, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.875rem' }}>
          Expiry: Active
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        {/* Disk Usage */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ background: '#7c3aed', color: 'white', padding: '12px 16px', fontWeight: 600, fontSize: '0.9rem' }}>Disk Usage</div>
          <div style={{ height: 250, padding: 16 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={diskData} innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
                  {diskData.map((_, index) => <Cell key={`cell-${index}`} fill={diskColors[index % diskColors.length]} />)}
                </Pie>
                <RechartsTooltip formatter={(value: any) => formatMB(Number(value))} contentStyle={{ background: 'var(--color-bg-elevated)', border: 'none', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '0 16px 16px', fontSize: '0.8rem', justifyContent: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 12, height: 12, background: '#ef4444' }}/> Used</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 12, height: 12, background: '#22c55e' }}/> Available</span>
          </div>
          <div style={{ display: 'flex', gap: 1 }}>
            <div style={{ flex: 1, background: '#3b82f6', color: 'white', padding: 12, textAlign: 'center', fontSize: '0.8rem' }}>Total<br/><b>{formatGB(diskLimitBytes)}</b></div>
            <div style={{ flex: 1, background: '#ef4444', color: 'white', padding: 12, textAlign: 'center', fontSize: '0.8rem' }}>Used<br/><b>{formatMB(diskUsedBytes)}</b></div>
            <div style={{ flex: 1, background: '#22c55e', color: 'white', padding: 12, textAlign: 'center', fontSize: '0.8rem' }}>Available<br/><b>{formatMB(diskAvailableBytes)}</b></div>
          </div>
        </div>

        {/* Traffic Usage */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ background: '#6366f1', color: 'white', padding: '12px 16px', fontWeight: 600, fontSize: '0.9rem' }}>Traffic Usage In Pageviews (Last 6 Months)</div>
          <div style={{ height: 250, padding: 16 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trafficData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ background: 'var(--color-bg-elevated)', border: 'none', borderRadius: 8 }} />
                <Bar dataKey="pageviews" fill="#818cf8" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', gap: 1 }}>
            <div style={{ flex: 1, background: '#3b82f6', color: 'white', padding: 12, textAlign: 'center', fontSize: '0.8rem' }}>Total<br/><b>{stats.pageviews}</b></div>
            <div style={{ flex: 1, background: '#ef4444', color: 'white', padding: 12, textAlign: 'center', fontSize: '0.8rem' }}>Used<br/><b>{stats.pageviews}</b></div>
            <div style={{ flex: 1, background: '#22c55e', color: 'white', padding: 12, textAlign: 'center', fontSize: '0.8rem' }}>Available<br/><b>∞</b></div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        <div className="card" style={{ background: '#7c3aed', padding: '20px', border: 'none', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: '2.5rem' }}>📰</div>
          <div style={{ color: 'white' }}><div style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1 }}>{editions.length}</div><div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Total Editions</div></div>
        </div>
        <div className="card" style={{ background: '#22c55e', padding: '20px', border: 'none', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: '2.5rem' }}>✅</div>
          <div style={{ color: 'white' }}><div style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1 }}>{publishedCount}</div><div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Published</div></div>
        </div>
        <div className="card" style={{ background: '#f59e0b', padding: '20px', border: 'none', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: '2.5rem' }}>📄</div>
          <div style={{ color: 'white' }}><div style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1 }}>{editions.length * 12}</div><div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Total Pages (Est)</div></div>
        </div>
        <div className="card" style={{ background: '#0ea5e9', padding: '20px', border: 'none', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: '2.5rem' }}>👁️</div>
          <div style={{ color: 'white' }}><div style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1 }}>{stats.pageviews}</div><div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Total Views</div></div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', fontWeight: 600, borderBottom: '1px solid var(--color-border)' }}>Recent Editions</div>
        {editions.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)' }}>No editions created yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Publication Date</th>
                <th>Status</th>
                <th>Views</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {editions.slice(0, 5).map(e => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 500 }}>{e.title}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{e.publish_date}</td>
                  <td><span className={`status-badge status-${e.status}`}>{e.status}</span></td>
                  <td>0</td>
                  <td>
                    <Link to="/portal/editions" className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: 6, textDecoration: 'none' }}>
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
