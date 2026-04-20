import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
    Chart as ChartJS,
    CategoryScale, LinearScale, PointElement, LineElement,
    Title, Tooltip, Filler, TimeScale
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import 'chartjs-adapter-date-fns'

ChartJS.register(
    CategoryScale, LinearScale, PointElement, LineElement,
    Title, Tooltip, Filler, TimeScale
)

// ─────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────

const API = import.meta.env.VITE_API_URL || '/api'
const WS_BASE = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:8080`
const WS = `${WS_BASE}/ws`

// ─────────────────────────────────────────────
// PARAMÈTRES DIRIS A40
// ─────────────────────────────────────────────

const PARAMS = [
    { id: 'cos_phi', nom: 'Cos φ', icone: '⚡', path: 'cos_phi', unite: '', dec: 3, seuils: { ok: [0.90, 1.00], warn: [0.80, 1.05] } },
    { id: 'u12', nom: 'Tension U12', icone: '〜', path: 'tensions.u12', unite: 'V', dec: 1, seuils: { ok: [360, 440], warn: [340, 460] } },
    { id: 'u23', nom: 'Tension U23', icone: '〜', path: 'tensions.u23', unite: 'V', dec: 1, seuils: { ok: [360, 440], warn: [340, 460] } },
    { id: 'u31', nom: 'Tension U31', icone: '〜', path: 'tensions.u31', unite: 'V', dec: 1, seuils: { ok: [360, 440], warn: [340, 460] } },
    { id: 'v1', nom: 'Tension V1', icone: '〜', path: 'tensions.v1', unite: 'V', dec: 1, seuils: { ok: [207, 253], warn: [196, 264] } },
    { id: 'v2', nom: 'Tension V2', icone: '〜', path: 'tensions.v2', unite: 'V', dec: 1, seuils: { ok: [207, 253], warn: [196, 264] } },
    { id: 'v3', nom: 'Tension V3', icone: '〜', path: 'tensions.v3', unite: 'V', dec: 1, seuils: { ok: [207, 253], warn: [196, 264] } },
    { id: 'i1', nom: 'Courant I1', icone: '≋', path: 'courants.i1', unite: 'A', dec: 1, seuils: { ok: [0, 200], warn: [0, 250] } },
    { id: 'i2', nom: 'Courant I2', icone: '≋', path: 'courants.i2', unite: 'A', dec: 1, seuils: { ok: [0, 200], warn: [0, 250] } },
    { id: 'i3', nom: 'Courant I3', icone: '≋', path: 'courants.i3', unite: 'A', dec: 1, seuils: { ok: [0, 200], warn: [0, 250] } },
    { id: 'in', nom: 'Courant In', icone: '≋', path: 'courants.in', unite: 'A', dec: 2, seuils: { ok: [0, 10], warn: [0, 20] } },
    { id: 'kw', nom: 'kW  (Active)', icone: '↗', path: 'puissances.active', unite: 'kW', dec: 2, seuils: { ok: [0, 150], warn: [0, 200] } },
    { id: 'kvar', nom: 'kVAR (Réact.)', icone: '◎', path: 'puissances.reactive', unite: 'kVAR', dec: 2, seuils: { ok: [0, 50], warn: [0, 80] } },
    { id: 'kva', nom: 'kVA  (Appar.)', icone: '◈', path: 'puissances.apparente', unite: 'kVA', dec: 2, seuils: { ok: [0, 160], warn: [0, 210] } },
    { id: 'freq', nom: 'Fréquence', icone: '∿', path: 'frequence', unite: 'Hz', dec: 2, seuils: { ok: [49.5, 50.5], warn: [48.5, 51.5] } },
    { id: 'energie', nom: 'Énergie (kWh)', icone: '⚡', path: 'energie_active', unite: 'kWh', dec: 2, seuils: { ok: [0, 999999], warn: [0, 999999] } },
]

// ─────────────────────────────────────────────
// UTILITAIRES
// ─────────────────────────────────────────────

function getVal(obj, path) {
    return path.split('.').reduce(
        (acc, key) => (acc != null && acc[key] !== undefined ? acc[key] : null), obj
    )
}

function getStatut(v, seuils) {
    if (v === null || v === undefined) return 'optimal'
    if (v >= seuils.ok[0] && v <= seuils.ok[1]) return 'optimal'
    if (v >= seuils.warn[0] && v <= seuils.warn[1]) return 'attention'
    return 'critique'
}

const BADGE_CONFIG = {
    optimal: { bg: '#22a855', label: 'Optimal' },
    attention: { bg: '#f97316', label: 'Attention' },
    critique: { bg: '#ef4444', label: 'Critique' },
}

function authHeaders(token) {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
}

const fmt = (v, dec, unite) =>
    v !== null && v !== undefined
        ? `${parseFloat(v).toFixed(dec)}${unite ? ' ' + unite : ''}`
        : '--'

// ─────────────────────────────────────────────
// PAGE DE CONNEXION
// ─────────────────────────────────────────────

function PageConnexion({ onLogin }) {
    const [email, setEmail] = useState('')
    const [motDePasse, setMotDePasse] = useState('')
    const [erreur, setErreur] = useState('')
    const [chargement, setChargement] = useState(false)

    const soumettre = async (e) => {
        e.preventDefault()
        setErreur('')
        setChargement(true)
        try {
            const rep = await fetch(`${API}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, mot_de_passe: motDePasse }),
            })
            const json = await rep.json()
            if (!rep.ok) { setErreur(json.detail || 'Identifiants incorrects'); setChargement(false); return }
            localStorage.setItem('token', json.token)
            localStorage.setItem('utilisateur', JSON.stringify(json.utilisateur))
            onLogin(json.token, json.utilisateur)
        } catch (e) {
            setErreur('Impossible de se connecter au serveur')
            setChargement(false)
        }
    }

    const inputStyle = {
        width: '100%', padding: '14px 18px', borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)',
        color: '#ffffff', fontSize: 14, fontFamily: "'Nunito',sans-serif", fontWeight: 600,
        outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box',
    }

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100vh', width: '100vw',
            background: 'linear-gradient(145deg, #1e3d2b 0%, #152e20 50%, #0f2018 100%)',
            fontFamily: "'Nunito',sans-serif",
        }}>
            <div style={{
                width: 400, maxWidth: '90vw',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 24, padding: '48px 40px', backdropFilter: 'blur(20px)',
            }}>
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#ffffff', letterSpacing: '0.12em', marginBottom: 6 }}>ECONERSYS</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.25em' }}>SUPERVISION ÉLECTRIQUE</div>
                </div>
                <form onSubmit={soumettre}>
                    <div style={{ marginBottom: 18 }}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', marginBottom: 8, textTransform: 'uppercase' }}>Email</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="votre@email.com" required style={inputStyle}
                            onFocus={(e) => { e.target.style.borderColor = 'rgba(74,222,128,0.4)'; e.target.style.background = 'rgba(255,255,255,0.08)' }}
                            onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; e.target.style.background = 'rgba(255,255,255,0.06)' }}
                        />
                    </div>
                    <div style={{ marginBottom: 28 }}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', marginBottom: 8, textTransform: 'uppercase' }}>Mot de passe</label>
                        <input type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} placeholder="••••••••" required style={inputStyle}
                            onFocus={(e) => { e.target.style.borderColor = 'rgba(74,222,128,0.4)'; e.target.style.background = 'rgba(255,255,255,0.08)' }}
                            onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; e.target.style.background = 'rgba(255,255,255,0.06)' }}
                        />
                    </div>
                    {erreur && (
                        <div style={{ padding: '10px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: 12.5, fontWeight: 600, marginBottom: 18, textAlign: 'center' }}>{erreur}</div>
                    )}
                    <button type="submit" disabled={chargement} style={{
                        width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                        background: chargement ? '#1a7a3a' : '#22a855', color: '#ffffff',
                        fontSize: 14.5, fontWeight: 800, fontFamily: "'Nunito',sans-serif",
                        cursor: chargement ? 'wait' : 'pointer', transition: 'all 0.2s', letterSpacing: '0.03em',
                    }}>{chargement ? 'Connexion...' : 'Se connecter'}</button>
                </form>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────
// PANNEAU ADMIN
// ─────────────────────────────────────────────

function PanneauAdmin({ token, ouvert, onFermer }) {
    const [nom, setNom] = useState('')
    const [email, setEmail] = useState('')
    const [mdp, setMdp] = useState('')
    const [role, setRole] = useState('operateur')
    const [message, setMessage] = useState('')
    const [erreur, setErreur] = useState('')
    const [chargement, setChargement] = useState(false)

    if (!ouvert) return null

    const creer = async (e) => {
        e.preventDefault()
        setMessage(''); setErreur(''); setChargement(true)
        try {
            const rep = await fetch(`${API}/auth/register`, {
                method: 'POST', headers: authHeaders(token),
                body: JSON.stringify({ email, mot_de_passe: mdp, nom, role }),
            })
            const json = await rep.json()
            if (!rep.ok) { setErreur(json.detail || 'Erreur'); setChargement(false); return }
            setMessage(`Utilisateur "${nom}" créé avec succès !`)
            setNom(''); setEmail(''); setMdp(''); setRole('operateur')
        } catch (e) { setErreur('Erreur de connexion au serveur') }
        finally { setChargement(false) }
    }

    const champStyle = {
        width: '100%', padding: '10px 14px', borderRadius: 10,
        border: '1px solid rgba(0,0,0,0.1)', background: '#f8faf8',
        fontSize: 13, fontFamily: "'Nunito',sans-serif", fontWeight: 600,
        color: '#111827', outline: 'none', boxSizing: 'border-box',
    }
    const labelStyle = { display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.4)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={onFermer}>
            <div style={{
                width: 420, maxWidth: '90vw', background: '#ffffff',
                borderRadius: 20, padding: '32px 32px 28px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>Créer un utilisateur</div>
                    <button onClick={onFermer} style={{ background: 'none', border: 'none', fontSize: 20, color: '#9ca3af', cursor: 'pointer', fontWeight: 700, lineHeight: 1 }}>✕</button>
                </div>
                <form onSubmit={creer}>
                    <div style={{ marginBottom: 14 }}>
                        <label style={labelStyle}>Nom complet</label>
                        <input value={nom} onChange={(e) => setNom(e.target.value)} required style={champStyle} placeholder="Jean Kouassi" />
                    </div>
                    <div style={{ marginBottom: 14 }}>
                        <label style={labelStyle}>Email</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={champStyle} placeholder="jean@econersys.com" />
                    </div>
                    <div style={{ marginBottom: 14 }}>
                        <label style={labelStyle}>Mot de passe</label>
                        <input type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} required style={champStyle} placeholder="••••••••" />
                    </div>
                    <div style={{ marginBottom: 20 }}>
                        <label style={labelStyle}>Rôle</label>
                        <div style={{ display: 'flex', gap: 10 }}>
                            {[
                                { val: 'operateur', label: 'Opérateur', desc: 'Visualisation uniquement' },
                                { val: 'admin', label: 'Administrateur', desc: 'Accès complet + Excel' },
                            ].map(r => (
                                <div key={r.val} onClick={() => setRole(r.val)} style={{
                                    flex: 1, padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                                    border: role === r.val ? '2px solid #22a855' : '1px solid rgba(0,0,0,0.1)',
                                    background: role === r.val ? 'rgba(34,168,85,0.05)' : '#f8faf8', transition: 'all 0.15s',
                                }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: role === r.val ? '#22a855' : '#111827' }}>{r.label}</div>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', marginTop: 2 }}>{r.desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                    {message && (<div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(34,168,85,0.08)', border: '1px solid rgba(34,168,85,0.2)', color: '#22a855', fontSize: 12.5, fontWeight: 600, marginBottom: 14, textAlign: 'center' }}>{message}</div>)}
                    {erreur && (<div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 12.5, fontWeight: 600, marginBottom: 14, textAlign: 'center' }}>{erreur}</div>)}
                    <button type="submit" disabled={chargement} style={{
                        width: '100%', padding: '12px', borderRadius: 12, border: 'none',
                        background: chargement ? '#1a7a3a' : '#22a855', color: '#ffffff',
                        fontSize: 14, fontWeight: 800, fontFamily: "'Nunito',sans-serif",
                        cursor: chargement ? 'wait' : 'pointer', transition: 'all 0.2s',
                    }}>{chargement ? 'Création...' : 'Créer l\'utilisateur'}</button>
                </form>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────
// SÉLECTEUR DE PÉRIODE
// ─────────────────────────────────────────────

function SelecteurPeriode({ onAppliquer }) {
    const [ouvert, setOuvert] = useState(false)
    const [dateDebut, setDateDebut] = useState('')
    const [heureDebut, setHeureDebut] = useState('00:00')
    const [dateFin, setDateFin] = useState('')
    const [heureFin, setHeureFin] = useState('23:59')

    const appliquer = () => {
        if (!dateDebut || !dateFin) return
        const tsDebut = new Date(`${dateDebut}T${heureDebut}:00`).getTime() / 1000
        const tsFin = new Date(`${dateFin}T${heureFin}:00`).getTime() / 1000
        if (tsDebut >= tsFin) return
        onAppliquer(tsDebut, tsFin)
        setOuvert(false)
    }

    const champStyle = {
        padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)',
        background: '#f8faf8', fontSize: 13, fontFamily: "'Nunito',sans-serif",
        fontWeight: 600, color: '#111827', outline: 'none', flex: 1, minWidth: 0,
    }
    const labelStyle = { fontSize: 10, fontWeight: 700, color: '#6b7280', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }

    return (
        <div style={{ position: 'relative' }}>
            <button onClick={() => setOuvert(!ouvert)} style={{
                padding: '5px 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
                fontFamily: "'Nunito',sans-serif", fontSize: 12.5, fontWeight: 800, transition: 'all 0.17s',
                background: ouvert ? '#22a855' : '#eef2ef', color: ouvert ? '#ffffff' : '#6b7280',
            }}>Période</button>
            {ouvert && (
                <div style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 8, zIndex: 100,
                    background: '#ffffff', borderRadius: 16, padding: '20px 22px',
                    border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', width: 320,
                }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#111827', marginBottom: 16 }}>Choisir une période</div>
                    <div style={{ marginBottom: 14 }}>
                        <div style={labelStyle}>Début</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} style={champStyle} />
                            <input type="time" value={heureDebut} onChange={(e) => setHeureDebut(e.target.value)} style={{ ...champStyle, flex: '0 0 100px' }} />
                        </div>
                    </div>
                    <div style={{ marginBottom: 18 }}>
                        <div style={labelStyle}>Fin</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} style={champStyle} />
                            <input type="time" value={heureFin} onChange={(e) => setHeureFin(e.target.value)} style={{ ...champStyle, flex: '0 0 100px' }} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setOuvert(false)} style={{
                            flex: 1, padding: '10px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.1)',
                            background: '#f8faf8', color: '#6b7280', fontSize: 13, fontWeight: 700,
                            cursor: 'pointer', fontFamily: "'Nunito',sans-serif",
                        }}>Annuler</button>
                        <button onClick={appliquer} style={{
                            flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                            background: '#22a855', color: '#ffffff', fontSize: 13, fontWeight: 700,
                            cursor: 'pointer', fontFamily: "'Nunito',sans-serif",
                        }}>Visualiser</button>
                    </div>
                </div>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────
// GRAPHIQUE
// ─────────────────────────────────────────────

function Graphique({ points, param }) {
    const getGradient = useCallback((ctx, chartArea) => {
        if (!chartArea) return 'rgba(34,168,85,0.15)'
        const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
        gradient.addColorStop(0, 'rgba(34,168,85,0.28)')
        gradient.addColorStop(0.6, 'rgba(34,168,85,0.07)')
        gradient.addColorStop(1, 'rgba(34,168,85,0.00)')
        return gradient
    }, [])

    const data = {
        datasets: [{
            data: points,
            borderColor: '#22a855', borderWidth: 2.5,
            backgroundColor: (context) => { const { ctx, chartArea } = context.chart; return getGradient(ctx, chartArea) },
            fill: true, tension: 0.3, pointRadius: 0,
            pointHoverRadius: 5, pointBackgroundColor: '#22a855',
            pointBorderColor: '#ffffff', pointBorderWidth: 1.5,
        }]
    }

    const options = {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#1e3d2b', titleColor: 'rgba(255,255,255,0.5)',
                bodyColor: '#4ade80', bodyFont: { family: 'Nunito', size: 13, weight: '700' },
                padding: 10, cornerRadius: 8,
                callbacks: { label: (ctx) => `  ${ctx.parsed.y.toFixed(param.dec)} ${param.unite}` }
            }
        },
        scales: {
            x: {
                type: 'time',
                time: { displayFormats: { minute: 'HH:mm', hour: 'HH:mm', day: 'dd/MM' } },
                grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
                ticks: { color: '#9ca3af', font: { family: 'Nunito', size: 10, weight: '600' }, maxTicksLimit: 12, maxRotation: 0 }
            },
            y: {
                grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
                ticks: { color: '#9ca3af', font: { family: 'Nunito', size: 10, weight: '600' }, callback: (v) => v.toFixed(param.dec) }
            }
        }
    }

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 180 }}>
            <Line data={data} options={options} />
        </div>
    )
}

// ─────────────────────────────────────────────
// ITEM SIDEBAR
// ─────────────────────────────────────────────

function ParamItem({ param, isActif, valeur, onClick }) {
    const [hover, setHover] = useState(false)
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10, margin: '2px 10px', padding: '10px 12px',
            borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
            background: isActif ? 'rgba(255,255,255,0.13)' : hover ? 'rgba(255,255,255,0.07)' : 'transparent',
            border: isActif ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
        }} onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            <span style={{ fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0, opacity: 0.9 }}>{param.icone}</span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: isActif ? 700 : 600, color: isActif ? '#ffffff' : 'rgba(255,255,255,0.72)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{param.nom}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#4ade80', flexShrink: 0 }}>
                {valeur !== null && valeur !== undefined ? `${valeur.toFixed(param.dec)}${param.unite}` : '--'}
            </span>
        </div>
    )
}

// ─────────────────────────────────────────────
// APP PRINCIPAL
// ─────────────────────────────────────────────

export default function App() {
    const [token, setToken] = useState(() => localStorage.getItem('token'))
    const [utilisateur, setUtilisateur] = useState(() => {
        const u = localStorage.getItem('utilisateur'); return u ? JSON.parse(u) : null
    })
    const estConnecte = !!token && !!utilisateur
    const estAdmin = utilisateur?.role === 'admin'
    const handleLogin = (t, u) => { setToken(t); setUtilisateur(u) }
    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('utilisateur'); setToken(null); setUtilisateur(null) }

    useEffect(() => {
        if (!token) return
        fetch(`${API}/auth/me`, { headers: authHeaders(token) }).then(rep => { if (!rep.ok) handleLogout() }).catch(() => handleLogout())
    }, [])

    if (!estConnecte) return <PageConnexion onLogin={handleLogin} />
    return <Dashboard token={token} utilisateur={utilisateur} estAdmin={estAdmin} onLogout={handleLogout} />
}

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────

function Dashboard({ token, utilisateur, estAdmin, onLogout }) {
    const [actif, setActif] = useState(PARAMS[0])
    const [data, setData] = useState({})
    const [points, setPoints] = useState([])
    const [periode, setPeriode] = useState(24)
    const [periodeCustom, setPeriodeCustom] = useState(null)
    const [stats, setStats] = useState({ min: null, max: null, moyenne: null })
    const [connecte, setConnecte] = useState(false)
    const [statut, setStatutTxt] = useState('Connexion au serveur...')
    const [telechargement, setTelechargement] = useState(false)
    const [adminOuvert, setAdminOuvert] = useState(false)

    const wsRef = useRef(null)
    const actifRef = useRef(actif)
    const dernierPointRef = useRef(0)
    const periodeRef = useRef(24)
    const periodeCustomRef = useRef(null)

    useEffect(() => { actifRef.current = actif }, [actif])
    useEffect(() => { periodeRef.current = periode }, [periode])
    useEffect(() => { periodeCustomRef.current = periodeCustom }, [periodeCustom])

    const chargerHistorique = useCallback(async (champDB, heures, debut = null, fin = null) => {
        try {
            let url = `${API}/historique/${encodeURIComponent(champDB)}?limite=700`
            if (debut && fin) { url += `&debut=${debut}&fin=${fin}` } else { url += `&heures=${heures}` }
            const rep = await fetch(url, { headers: authHeaders(token) })
            if (!rep.ok) return
            const json = await rep.json()
            setPoints(json.donnees.map(d => ({ x: d.timestamp * 1000, y: d.valeur })))
        } catch (e) { console.error('Historique:', e) }
    }, [token])

    const chargerStats = useCallback(async (champDB, heures, debut = null, fin = null) => {
        try {
            let url = `${API}/stats/${encodeURIComponent(champDB)}`
            if (debut && fin) { url += `?debut=${debut}&fin=${fin}` } else { url += `?heures=${heures}` }
            const rep = await fetch(url, { headers: authHeaders(token) })
            if (!rep.ok) return
            const s = await rep.json()
            setStats({ min: s.min, max: s.max, moyenne: s.moyenne })
        } catch (e) { console.error('Stats:', e) }
    }, [token])

    // WebSocket — met à jour les valeurs live + le graphique SAUF en mode période custom
    useEffect(() => {
        let ws, reconnectTimer
        function connecter() {
            setStatutTxt('Connexion au serveur...')
            ws = new WebSocket(WS); wsRef.current = ws
            ws.onopen = () => { setConnecte(true); setStatutTxt('Connecté — données en temps réel') }
            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data)
                    if (msg.type !== 'mesure') return
                    const mesure = msg.donnees
                    // Toujours mettre à jour la valeur live (grande valeur en haut)
                    setData(mesure)
                    // NE PAS ajouter de points si on est en mode période personnalisée
                    if (periodeCustomRef.current) return
                    const intervalle = (periodeRef.current * 3600 * 1000) / 700
                    const maintenant = mesure.timestamp * 1000
                    if (maintenant - dernierPointRef.current >= intervalle) {
                        dernierPointRef.current = maintenant
                        const v = getVal(mesure, actifRef.current.path)
                        if (v !== null) {
                            setPoints(prev => {
                                const updated = [...prev, { x: maintenant, y: v }]
                                return updated.length > 700 ? updated.slice(-700) : updated
                            })
                        }
                    }
                } catch (e) { console.error('WS parse error:', e) }
            }
            ws.onclose = () => { setConnecte(false); setStatutTxt('Déconnecté — reconnexion dans 5s...'); reconnectTimer = setTimeout(connecter, 5000) }
            ws.onerror = () => { setConnecte(false); setStatutTxt('Erreur WebSocket') }
        }
        connecter()
        return () => { clearTimeout(reconnectTimer); if (ws) ws.close() }
    }, [])

    useEffect(() => {
        async function init() {
            try { const rep = await fetch(`${API}/mesure/live`, { headers: authHeaders(token) }); if (rep.ok) setData(await rep.json()) } catch (e) { }
            await chargerHistorique(actif.path, periode)
            await chargerStats(actif.path, periode)
        }
        init()
    }, [])

    const selectionner = useCallback(async (param) => {
        setActif(param); setPoints([])
        if (periodeCustom) { await chargerHistorique(param.path, null, periodeCustom.debut, periodeCustom.fin); await chargerStats(param.path, null, periodeCustom.debut, periodeCustom.fin) }
        else { await chargerHistorique(param.path, periode); await chargerStats(param.path, periode) }
    }, [periode, periodeCustom, chargerHistorique, chargerStats])

    const changerPeriode = useCallback(async (h) => {
        setPeriode(h); setPeriodeCustom(null); dernierPointRef.current = 0
        await chargerHistorique(actif.path, h); await chargerStats(actif.path, h)
    }, [actif, chargerHistorique, chargerStats])

    const appliquerPeriode = useCallback(async (debut, fin) => {
        setPeriodeCustom({ debut, fin }); setPeriode(null)
        await chargerHistorique(actif.path, null, debut, fin); await chargerStats(actif.path, null, debut, fin)
    }, [actif, chargerHistorique, chargerStats])

    const telechargerExcel = async () => {
        setTelechargement(true)
        try {
            let url = `${API}/export/excel`
            if (periodeCustom) { url += `?debut=${periodeCustom.debut}&fin=${periodeCustom.fin}` }
            else if (periode) { url += `?heures=${periode}` }
            const rep = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
            if (!rep.ok) { const err = await rep.json(); alert(err.detail || 'Erreur'); return }
            const blob = await rep.blob(); const a = document.createElement('a')
            a.href = URL.createObjectURL(blob); a.download = `econersys_mesures_${new Date().toISOString().slice(0, 10)}.xlsx`
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href)
        } catch (e) { alert('Impossible de télécharger') }
        finally { setTelechargement(false) }
    }

    const valCourante = getVal(data, actif.path)
    const statutActif = getStatut(valCourante, actif.seuils)
    const badgeCfg = BADGE_CONFIG[statutActif]

    return (
        <div style={{ display: 'flex', height: '100vh', fontFamily: "'Nunito',sans-serif", overflow: 'hidden' }}>
            <PanneauAdmin token={token} ouvert={adminOuvert} onFermer={() => setAdminOuvert(false)} />

            {/* SIDEBAR */}
            <aside style={{ width: 265, minWidth: 265, background: '#1e3d2b', display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
                <div style={{ padding: '22px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: '0.07em' }}>ECONERSYS</span>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: connecte ? '#4ade80' : '#ef4444', flexShrink: 0, transition: 'background 0.3s', animation: connecte ? 'pulseDot 2.2s ease-in-out infinite' : 'none' }} />
                    </div>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.32)', letterSpacing: '0.22em', marginTop: 4 }}>SUPERVISION</div>
                </div>

                <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#ffffff', marginBottom: 2 }}>{utilisateur.nom}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: estAdmin ? '#4ade80' : 'rgba(255,255,255,0.4)' }}>{utilisateur.role}</span>
                        <button onClick={onLogout} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: "'Nunito',sans-serif", letterSpacing: '0.05em', transition: 'color 0.2s' }}
                            onMouseEnter={(e) => e.target.style.color = '#ef4444'} onMouseLeave={(e) => e.target.style.color = 'rgba(255,255,255,0.35)'}>Déconnexion</button>
                    </div>
                </div>

                <div className="sidebar-scroll" style={{ flex: 1, overflowY: 'auto', padding: '8px 0 16px' }}>
                    {PARAMS.map(p => (<ParamItem key={p.id} param={p} isActif={p.id === actif.id} valeur={getVal(data, p.path)} onClick={() => selectionner(p)} />))}
                </div>

                {estAdmin && (
                    <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button onClick={() => setAdminOuvert(true)} style={{
                            width: '100%', padding: '11px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                            background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 12.5, fontWeight: 800,
                            fontFamily: "'Nunito',sans-serif", cursor: 'pointer', transition: 'all 0.2s', letterSpacing: '0.03em',
                        }} onMouseEnter={(e) => { e.target.style.background = 'rgba(255,255,255,0.06)'; e.target.style.color = '#ffffff' }}
                            onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = 'rgba(255,255,255,0.6)' }}>
                            Gérer les utilisateurs
                        </button>
                        <button onClick={telechargerExcel} disabled={telechargement} style={{
                            width: '100%', padding: '11px', borderRadius: 10, border: 'none',
                            background: telechargement ? 'rgba(34,168,85,0.3)' : 'rgba(34,168,85,0.15)',
                            color: '#4ade80', fontSize: 12.5, fontWeight: 800, fontFamily: "'Nunito',sans-serif",
                            cursor: telechargement ? 'wait' : 'pointer', transition: 'all 0.2s', letterSpacing: '0.03em',
                        }} onMouseEnter={(e) => { if (!telechargement) e.target.style.background = 'rgba(34,168,85,0.25)' }}
                            onMouseLeave={(e) => { if (!telechargement) e.target.style.background = 'rgba(34,168,85,0.15)' }}>
                            {telechargement ? 'Téléchargement...' : 'Télécharger Excel'}
                        </button>
                    </div>
                )}
            </aside>

            {/* ZONE PRINCIPALE */}
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto', padding: '28px 36px 24px', gap: 18, background: '#f0f4f1' }}>
                <div className="anim-1" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 'clamp(54px,9vw,88px)', fontWeight: 900, color: '#111827', letterSpacing: '-0.02em', lineHeight: 1, transition: 'all 0.3s ease' }}>{fmt(valCourante, actif.dec, actif.unite)}</div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 24px', borderRadius: 999, fontSize: 13.5, fontWeight: 800, letterSpacing: '0.03em', transition: 'all 0.3s', background: badgeCfg.bg, color: '#fff' }}>{badgeCfg.label}</span>
                </div>

                <div className="anim-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                    {[{ label: 'Min', val: stats.min }, { label: 'Max', val: stats.max }, { label: 'Moyenne', val: stats.moyenne }].map(({ label, val }) => (
                        <div key={label} style={{ background: '#ffffff', borderRadius: 14, padding: '18px 22px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#111827' }}>{fmt(val, actif.dec, actif.unite)}</div>
                        </div>
                    ))}
                </div>

                <div className="anim-3" style={{ background: '#ffffff', borderRadius: 14, padding: '22px 24px 16px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 8px rgba(0,0,0,0.05)', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>Évolution</span>
                            {periodeCustom && (<span style={{ fontSize: 10, fontWeight: 700, color: '#22a855', background: 'rgba(34,168,85,0.08)', padding: '3px 10px', borderRadius: 999, letterSpacing: '0.03em' }}>HISTORIQUE</span>)}
                        </div>
                        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                            {[{ h: 24, label: '24H' }, { h: 168, label: '7J' }, { h: 720, label: '30J' }].map(({ h, label }) => (
                                <button key={h} onClick={() => changerPeriode(h)} style={{
                                    padding: '5px 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
                                    fontFamily: "'Nunito',sans-serif", fontSize: 12.5, fontWeight: 800, transition: 'all 0.17s',
                                    background: periode === h && !periodeCustom ? '#22a855' : '#eef2ef',
                                    color: periode === h && !periodeCustom ? '#ffffff' : '#6b7280',
                                }}>{label}</button>
                            ))}
                            <SelecteurPeriode onAppliquer={appliquerPeriode} />
                        </div>
                    </div>

                    {periodeCustom && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '8px 14px', borderRadius: 10, background: 'rgba(34,168,85,0.06)', border: '1px solid rgba(34,168,85,0.12)' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#22a855' }}>
                                Du {new Date(periodeCustom.debut * 1000).toLocaleString('fr-FR')} au {new Date(periodeCustom.fin * 1000).toLocaleString('fr-FR')}
                            </span>
                            <button onClick={() => changerPeriode(24)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#22a855', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'Nunito',sans-serif", textDecoration: 'underline' }}>Retour au temps réel</button>
                        </div>
                    )}

                    <div style={{ flex: 1, minHeight: 180 }}>
                        {points.length > 0
                            ? <Graphique points={points} param={actif} />
                            : (<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: 13, fontWeight: 600 }}>
                                {connecte ? 'En attente des données...' : 'Serveur non connecté'}
                            </div>)
                        }
                    </div>
                </div>

                <div className="anim-4" style={{ display: 'flex', alignItems: 'center', gap: 7, paddingLeft: 2 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: connecte ? '#22a855' : '#ef4444', transition: 'background 0.3s' }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af' }}>
                        {periodeCustom ? 'Mode historique — données figées sur la période sélectionnée' : statut}
                    </span>
                </div>
            </main>
        </div>
    )
}