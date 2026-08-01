import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import './AuthPage.css';
export default function OrgLoginPage() {
    const navigate = useNavigate();
    const { setOrgToken, setTenantStatus } = useAuth();
    const [email, setEmail] = useState('');
    const passwordRef = useRef(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setLoading(true);
        const password = passwordRef.current?.value || '';
        try {
            const res = await api.orgLogin({ email, password });
            if (!res.ok) {
                setError(res.error?.message ?? 'Invalid credentials. Please try again.');
                return;
            }
            const { token, status } = res.data;
            setOrgToken(token);
            if (status)
                setTenantStatus(status);
            navigate('/portal');
        }
        catch {
            setError('Network error. Please try again.');
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsx("div", { className: "auth-page auth-page--centered", children: _jsx("div", { className: "auth-page__form-panel auth-page__form-panel--solo", children: _jsxs("div", { className: "auth-page__form-wrap", children: [_jsxs(Link, { to: "/", className: "auth-page__brand-logo auth-page__brand-logo--dark", children: ["ePaper", _jsx("span", { children: "Space" })] }), _jsx("h1", { className: "auth-page__form-title", style: { marginTop: '1.5rem' }, children: "Publisher login" }), _jsxs("p", { className: "auth-page__form-sub", children: ["Don't have an account?", ' ', _jsx(Link, { to: "/signup", className: "auth-page__form-link", children: "Get started free" })] }), error && _jsx("div", { className: "auth-page__error", children: error }), _jsxs("form", { onSubmit: handleSubmit, noValidate: true, children: [_jsxs("div", { className: "auth-field", children: [_jsx("label", { className: "auth-field__label", children: "Email address" }), _jsx("input", { className: "auth-field__input", type: "email", placeholder: "you@example.com", value: email, onChange: e => { setEmail(e.target.value); setError(''); }, required: true, autoFocus: true })] }), _jsxs("div", { className: "auth-field", children: [_jsx("label", { className: "auth-field__label", children: "Password" }), _jsx("input", { id: "org-password", name: "password", ref: passwordRef, className: "auth-field__input", type: "password", placeholder: "Your password", autoComplete: "current-password", required: true })] }), _jsx("button", { type: "submit", className: "auth-btn auth-btn--primary", disabled: loading, children: loading ? 'Signing in…' : 'Sign in' })] }), _jsxs("p", { className: "auth-page__admin-link", children: ["Super Admin?", ' ', _jsx(Link, { to: "/admin-login", className: "auth-page__form-link", children: "Sign in here" })] })] }) }) }));
}
