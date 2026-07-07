import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Sidebar } from './Sidebar';
export function AppShell({ children }) {
    return (_jsxs("div", { style: { display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }, children: [_jsx(Sidebar, {}), _jsx("main", { style: { flex: 1, overflowY: 'auto', padding: '32px' }, children: _jsx("div", { style: { maxWidth: '1200px', margin: '0 auto' }, children: children }) })] }));
}
