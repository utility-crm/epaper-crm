import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import './AuthPage.css';
export default function AdminLoginPage() {
    const navigate = useNavigate();
    const { setAdminToken } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await api.adminLogin({ email, password });
            if (!res.ok) {
                setError(res.error?.message ?? 'Invalid credentials.');
                return;
            }
            setAdminToken(res.data.token);
            navigate('/crm');
        }
        catch {
            setError('Network error. Please try again.');
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsx("div", { className: "auth-page auth-page--centered", children: _jsx("div", { className: "auth-page__form-panel auth-page__form-panel--solo", children: _jsxs("div", { className: "auth-page__form-wrap", children: [_jsxs(Link, { to: "/", className: "auth-page__brand-logo auth-page__brand-logo--dark", children: ["ePaper", _jsx("span", { children: "Space" })] }), _jsx("div", { className: "auth-page__badge", children: "Super Admin" }), _jsx("h1", { className: "auth-page__form-title", style: { marginTop: '1rem' }, children: "Admin login" }), _jsxs("p", { className: "auth-page__form-sub", children: ["Publisher?", ' ', _jsx(Link, { to: "/login", className: "auth-page__form-link", children: "Sign in here" })] }), error && _jsx("div", { className: "auth-page__error", children: error }), _jsxs("form", { onSubmit: handleSubmit, noValidate: true, children: [_jsxs("div", { className: "auth-field", children: [_jsx("label", { className: "auth-field__label", children: "Email" }), _jsx("input", { className: "auth-field__input", type: "email", placeholder: "admin@epaperspace.com", value: email, onChange: e => { setEmail(e.target.value); setError(''); }, required: true, autoFocus: true })] }), _jsxs("div", { className: "auth-field", children: [_jsx("label", { className: "auth-field__label", children: "Password" }), _jsx("input", { className: "auth-field__input", type: "password", placeholder: "Admin password", value: password, onChange: e => { setPassword(e.target.value); setError(''); }, required: true })] }), _jsx("button", { type: "submit", className: "auth-btn auth-btn--dark", disabled: loading, children: loading ? 'Signing in…' : 'Sign in as Admin' })] })] }) }) }));
}
