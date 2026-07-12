import { PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid, Label } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';

const tooltipStyle = { background: '#1a2035', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8, fontSize: 12 } as const;

export default function DashboardCharts({ trafficData, diskData, diskUsed, diskLimitBytes, formatBytes, isEnterprise, plan }: any) {
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader><CardTitle>Traffic (Last 6 Months)</CardTitle><CardDescription>Reader pageviews across all papers</CardDescription></CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trafficData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <RTooltip contentStyle={tooltipStyle} cursor={{ stroke: 'rgba(99,102,241,0.3)' }} />
                <Area type="monotone" dataKey="views" stroke="#818cf8" strokeWidth={2} fill="url(#viewsFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Storage</CardTitle><CardDescription>{formatBytes(diskUsed)} of {isEnterprise ? 'Custom' : formatBytes(diskLimitBytes)} ({plan})</CardDescription></CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={diskData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={80} outerRadius={100} stroke="none">
                  <Cell fill="var(--color-brand-primary)" />
                  <Cell fill="var(--color-border)" />
                  <Label 
                    value={`${Math.round((diskUsed / Math.max(1, diskLimitBytes)) * 100)}% Used`} 
                    position="center" 
                    fill="var(--color-text-primary)" 
                    style={{ fontSize: '1.25rem', fontWeight: 600 }} 
                  />
                </Pie>
                <RTooltip formatter={(v: any) => formatBytes(Number(v))} contentStyle={{ background: 'var(--color-surface-elevated)', border: 'none', borderRadius: 8, color: 'var(--color-text-primary)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
