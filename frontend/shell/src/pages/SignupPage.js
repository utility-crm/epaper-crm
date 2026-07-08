import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import './AuthPage.css';
export default function SignupPage() {
    const navigate = useNavigate();
    const { setOrgToken } = useAuth();
    const [form, setForm] = useState({
        orgName: '',
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const passwordRules = [
        { label: 'At least 8 characters', test: (p) => p.length >= 8 },
        { label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
        { label: 'One number', test: (p) => /[0-9]/.test(p) },
    ];
    function handleChange(e) {
        setForm(f => ({ ...f, [e.target.name]: e.target.value }));
        setError('');
    }
    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        if (form.password !== form.confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        const failedRule = passwordRules.find(r => !r.test(form.password));
        if (failedRule) {
            setError(`Password requirement: ${failedRule.label}.`);
            return;
        }
        setLoading(true);
        try {
            const res = await api.signup({
                orgName: form.orgName,
                name: form.name,
                email: form.email,
                password: form.password,
            });
            if (!res.ok) {
                setError(res.error?.message ?? 'Signup failed. Please try again.');
                return;
            }
            setOrgToken(res.data.token);
            navigate('/portal');
        }
        catch {
            setError('Network error. Please try again.');
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsxs("div", { className: "auth-page", children: [_jsxs("div", { className: "auth-page__brand", children: [_jsxs(Link, { to: "/", className: "auth-page__brand-logo", children: ["ePaper", _jsx("span", { children: "Space" })] }), _jsx("h2", { className: "auth-page__brand-tagline", children: "Start publishing your digital newspaper today." }), _jsx("p", { className: "auth-page__brand-sub", children: "Set up your account in under 2 minutes. Your digital edition will be live within moments of publishing." }), _jsxs("ul", { className: "auth-page__brand-bullets", children: [_jsx("li", { children: "\u2713 PDF to digital in seconds" }), _jsx("li", { children: "\u2713 Built-in subscriber management" }), _jsx("li", { children: "\u2713 Real-time analytics dashboard" }), _jsx("li", { children: "\u2713 Custom domain support" })] })] }), _jsx("div", { className: "auth-page__form-panel", children: _jsxs("div", { className: "auth-page__form-wrap", children: [_jsx("h1", { className: "auth-page__form-title", children: "Create your account" }), _jsxs("p", { className: "auth-page__form-sub", children: ["Already have an account?", ' ', _jsx(Link, { to: "/login", className: "auth-page__form-link", children: "Sign in" })] }), error && _jsx("div", { className: "auth-page__error", children: error }), _jsxs("form", { onSubmit: handleSubmit, noValidate: true, children: [_jsxs("div", { className: "auth-field", children: [_jsx("label", { className: "auth-field__label", children: "Publication / Organisation name" }), _jsx("input", { className: "auth-field__input", type: "text", name: "orgName", placeholder: "e.g. The Daily Chronicle", value: form.orgName, onChange: handleChange, required: true, autoFocus: true })] }), _jsxs("div", { className: "auth-field", children: [_jsx("label", { className: "auth-field__label", children: "Your full name" }), _jsx("input", { className: "auth-field__input", type: "text", name: "name", placeholder: "John Doe", value: form.name, onChange: handleChange, required: true })] }), _jsxs("div", { className: "auth-field", children: [_jsx("label", { className: "auth-field__label", children: "Email address" }), _jsx("input", { className: "auth-field__input", type: "email", name: "email", placeholder: "you@example.com", value: form.email, onChange: handleChange, required: true })] }), _jsxs("div", { className: "auth-field", children: [_jsx("label", { className: "auth-field__label", children: "Password" }), _jsx("input", { className: "auth-field__input", type: "password", name: "password", placeholder: "Min. 8 characters", value: form.password, onChange: handleChange, required: true }), form.password && (_jsx("ul", { className: "auth-field__rules", children: passwordRules.map(r => (_jsxs("li", { className: r.test(form.password) ? 'pass' : 'fail', children: [r.test(form.password) ? '✓' : '○', " ", r.label] }, r.label))) }))] }), _jsxs("div", { className: "auth-field", children: [_jsx("label", { className: "auth-field__label", children: "Confirm password" }), _jsx("input", { className: "auth-field__input", type: "password", name: "confirmPassword", placeholder: "Repeat your password", value: form.confirmPassword, onChange: handleChange, required: true })] }), _jsx("button", { type: "submit", className: "auth-btn auth-btn--primary", disabled: loading, children: loading ? 'Creating account…' : 'Create account' })] }), _jsxs("p", { className: "auth-page__legal", children: ["By creating an account you agree to our", ' ', _jsx("a", { href: "/terms", children: "Terms of Service" }), " and", ' ', _jsx("a", { href: "/privacy", children: "Privacy Policy" }), "."] })] }) })] }));
}
