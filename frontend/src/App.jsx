

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
    Chart as ChartJS,
    CategoryScale, LinearScale, PointElement, LineElement,
    Title, Tooltip, Filler, TimeScale
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import 'chartjs-adapter-date-fns'

// Enregistrer les composants Chart.js nécessaires
ChartJS.register(
    CategoryScale, LinearScale, PointElement, LineElement,
    Title, Tooltip, Filler, TimeScale
)

// ─────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────

// Avec le proxy Vite, /api → http://localhost:8080
// et /ws → ws://localhost:8080/ws
const API = '/api'
const WS = `ws://${window.location.hostname}:8080/ws`

// ─────────────────────────────────────────────
// LISTE DES PARAMÈTRES DU DIRIS A40
// Chaque param correspond exactement à un registre Modbus
// ─────────────────────────────────────────────

const PARAMS = [
    // Facteur de puissance
    { id: 'cos_phi', nom: 'Cos φ', icone: '⚡', path: 'cos_phi', unite: '', dec: 3, seuils: { ok: [0.90, 1.00], warn: [0.80, 1.05] } },
    // Tensions phase-phase (entre phases)
    { id: 'u12', nom: 'Tension U12', icone: '〜', path: 'tensions.u12', unite: 'V', dec: 1, seuils: { ok: [360, 440], warn: [340, 460] } },
    { id: 'u23', nom: 'Tension U23', icone: '〜', path: 'tensions.u23', unite: 'V', dec: 1, seuils: { ok: [360, 440], warn: [340, 460] } },
    { id: 'u31', nom: 'Tension U31', icone: '〜', path: 'tensions.u31', unite: 'V', dec: 1, seuils: { ok: [360, 440], warn: [340, 460] } },
    // Tensions simples (phase-neutre)
    { id: 'v1', nom: 'Tension V1', icone: '〜', path: 'tensions.v1', unite: 'V', dec: 1, seuils: { ok: [207, 253], warn: [196, 264] } },
    { id: 'v2', nom: 'Tension V2', icone: '〜', path: 'tensions.v2', unite: 'V', dec: 1, seuils: { ok: [207, 253], warn: [196, 264] } },
    { id: 'v3', nom: 'Tension V3', icone: '〜', path: 'tensions.v3', unite: 'V', dec: 1, seuils: { ok: [207, 253], warn: [196, 264] } },
    // Courants de ligne
    { id: 'i1', nom: 'Courant I1', icone: '≋', path: 'courants.i1', unite: 'A', dec: 1, seuils: { ok: [0, 200], warn: [0, 250] } },
    { id: 'i2', nom: 'Courant I2', icone: '≋', path: 'courants.i2', unite: 'A', dec: 1, seuils: { ok: [0, 200], warn: [0, 250] } },
    { id: 'i3', nom: 'Courant I3', icone: '≋', path: 'courants.i3', unite: 'A', dec: 1, seuils: { ok: [0, 200], warn: [0, 250] } },
    // Courant neutre
    { id: 'in', nom: 'Courant In', icone: '≋', path: 'courants.in', unite: 'A', dec: 2, seuils: { ok: [0, 10], warn: [0, 20] } },
    // Puissances
    { id: 'kw', nom: 'kW  (Active)', icone: '↗', path: 'puissances.active', unite: 'kW', dec: 2, seuils: { ok: [0, 150], warn: [0, 200] } },
    { id: 'kvar', nom: 'kVAR (Réact.)', icone: '◎', path: 'puissances.reactive', unite: 'kVAR', dec: 2, seuils: { ok: [0, 50], warn: [0, 80] } },
    { id: 'kva', nom: 'kVA  (Appar.)', icone: '◈', path: 'puissances.apparente', unite: 'kVA', dec: 2, seuils: { ok: [0, 160], warn: [0, 210] } },
    // Fréquence
    { id: 'freq', nom: 'Fréquence', icone: '∿', path: 'frequence', unite: 'Hz', dec: 2, seuils: { ok: [49.5, 50.5], warn: [48.5, 51.5] } },
]

// ─────────────────────────────────────────────
// UTILITAIRES
// ─────────────────────────────────────────────

// Extraire une valeur imbriquée : "tensions.u12" → data["tensions"]["u12"]
function getVal(obj, path) {
    return path.split('.').reduce(
        (acc, key) => (acc != null && acc[key] !== undefined ? acc[key] : null),
        obj
    )
}

// Calculer le badge selon les seuils
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

// ─────────────────────────────────────────────
// COMPOSANT : GRAPHIQUE
// ─────────────────────────────────────────────

function Graphique({ points, param }) {
    // Dégradé vert sous la courbe
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
            borderColor: '#22a855',
            borderWidth: 2.5,
            backgroundColor: (context) => {
                const { ctx, chartArea } = context.chart
                return getGradient(ctx, chartArea)
            },
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointBackgroundColor: '#22a855',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1.5,
        }]
    }

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#1e3d2b',
                titleColor: 'rgba(255,255,255,0.5)',
                bodyColor: '#4ade80',
                bodyFont: { family: 'Nunito', size: 13, weight: '700' },
                padding: 10,
                cornerRadius: 8,
                callbacks: {
                    label: (ctx) => `  ${ctx.parsed.y.toFixed(param.dec)} ${param.unite}`
                }
            }
        },
        scales: {
            x: {
                type: 'time',
                time: { displayFormats: { minute: 'HH:mm', hour: 'HH:mm', day: 'dd/MM' } },
                grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
                ticks: { color: '#9ca3af', font: { family: 'Nunito', size: 10, weight: '600' } }
            },
            y: {
                grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
                ticks: {
                    color: '#9ca3af',
                    font: { family: 'Nunito', size: 10, weight: '600' },
                    callback: (v) => v.toFixed(param.dec)
                }
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
// COMPOSANT : ITEM SIDEBAR
// ─────────────────────────────────────────────

function ParamItem({ param, isActif, valeur, onClick }) {
    const [hover, setHover] = useState(false)

    const style = {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        margin: '2px 10px',
        padding: '10px 12px',
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'all 0.15s',
        background: isActif ? 'rgba(255,255,255,0.13)' : hover ? 'rgba(255,255,255,0.07)' : 'transparent',
        border: isActif ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
    }

    return (
        <div
            style={style}
            onClick={onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            {/* Icône */}
            <span style={{ fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0, opacity: 0.9 }}>
                {param.icone}
            </span>

            {/* Nom */}
            <span style={{
                flex: 1,
                fontSize: 13,
                fontWeight: isActif ? 700 : 600,
                color: isActif ? '#ffffff' : 'rgba(255,255,255,0.72)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
            }}>
                {param.nom}
            </span>

            {/* Valeur */}
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#4ade80', flexShrink: 0 }}>
                {valeur !== null && valeur !== undefined
                    ? `${valeur.toFixed(param.dec)}${param.unite}`
                    : '--'}
            </span>
        </div>
    )
}

// ─────────────────────────────────────────────
// COMPOSANT PRINCIPAL : APP
// ─────────────────────────────────────────────

export default function App() {

    // ── États ─────────────────────────────────────────────────
    const [actif, setActif] = useState(PARAMS[0])
    const [data, setData] = useState({})          // Dernière mesure
    const [points, setPoints] = useState([])          // Points du graphique
    const [periode, setPeriode] = useState(24)          // Période en heures
    const [stats, setStats] = useState({ min: null, max: null, moyenne: null })
    const [connecte, setConnecte] = useState(false)
    const [statut, setStatutTxt] = useState('Connexion au serveur...')

    // Référence pour éviter les fuites mémoire sur les fetch
    const wsRef = useRef(null)
    const actifRef = useRef(actif)       // Pour accéder à actif depuis le callback WS
    const dernierPointRef = useRef(0)    // Timestamp du dernier point ajouté au graphique
    const periodeRef = useRef(24)        // Période courante pour calculer l'intervalle WS

    // Garder les refs synchronisés
    useEffect(() => { actifRef.current = actif }, [actif])
    useEffect(() => { periodeRef.current = periode }, [periode])

    // ── Charger historique depuis l'API ───────────────────────
    const chargerHistorique = useCallback(async (champDB, heures) => {
        try {
            const rep = await fetch(`${API}/historique/${encodeURIComponent(champDB)}?heures=${heures}&limite=700`)
            if (!rep.ok) return
            const json = await rep.json()
            // Convertir : timestamp secondes → millisecondes pour Chart.js
            const pts = json.donnees.map(d => ({ x: d.timestamp * 1000, y: d.valeur }))
            setPoints(pts)
        } catch (e) {
            console.error('Historique:', e)
        }
    }, [])

    // ── Charger stats depuis l'API ────────────────────────────
    const chargerStats = useCallback(async (champDB, heures) => {
        try {
            const rep = await fetch(`${API}/stats/${encodeURIComponent(champDB)}?heures=${heures}`)
            if (!rep.ok) return
            const s = await rep.json()
            setStats({ min: s.min, max: s.max, moyenne: s.moyenne })
        } catch (e) {
            console.error('Stats:', e)
        }
    }, [])

    // ── Connexion WebSocket ───────────────────────────────────
    useEffect(() => {
        let ws
        let reconnectTimer

        function connecter() {
            setStatutTxt('Connexion au serveur...')
            ws = new WebSocket(WS)
            wsRef.current = ws

            ws.onopen = () => {
                setConnecte(true)
                setStatutTxt('Connecté — données en temps réel')
                console.log('✓ WebSocket connecté')
            }

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data)
                    if (msg.type !== 'mesure') return

                    const mesure = msg.donnees
                    setData(mesure)

                    // Ajouter le nouveau point au graphique
                    // Intervalle = même densité que les données DB (période / 700 points)
                    const intervalle = (periodeRef.current * 3600 * 1000) / 700
                    const maintenant = mesure.timestamp * 1000
                    if (maintenant - dernierPointRef.current >= intervalle) {
                        dernierPointRef.current = maintenant
                        const v = getVal(mesure, actifRef.current.path)
                        if (v !== null) {
                            const nouveauPoint = { x: maintenant, y: v }
                            setPoints(prev => {
                                const updated = [...prev, nouveauPoint]
                                return updated.length > 700 ? updated.slice(-700) : updated
                            })
                        }
                    }
                } catch (e) {
                    console.error('Erreur parsing WebSocket:', e)
                }
            }

            ws.onclose = () => {
                setConnecte(false)
                setStatutTxt('Déconnecté — reconnexion dans 5s...')
                console.log('WebSocket fermé, reconnexion...')
                reconnectTimer = setTimeout(connecter, 5000)
            }

            ws.onerror = () => {
                setConnecte(false)
                setStatutTxt('Erreur WebSocket — vérifiez que le serveur tourne')
            }
        }

        connecter()

        // Nettoyage quand le composant se démonte
        return () => {
            clearTimeout(reconnectTimer)
            if (ws) ws.close()
        }
    }, []) // Ne se lance qu'une seule fois au montage

    // ── Charger les données initiales ────────────────────────
    useEffect(() => {
        async function init() {
            // Récupérer la dernière mesure pour affichage immédiat
            try {
                const rep = await fetch(`${API}/mesure/live`)
                if (rep.ok) {
                    const d = await rep.json()
                    setData(d)
                }
            } catch (e) {
                console.warn('Pas de mesure initiale:', e.message)
            }

            // Charger historique + stats du paramètre par défaut
            await chargerHistorique(actif.path, periode)
            await chargerStats(actif.path, periode)
        }
        init()
    }, []) // Une seule fois

    // ── Recharger quand on change de paramètre ───────────────
    const selectionner = useCallback(async (param) => {
        setActif(param)
        setPoints([])   // Vider le graphique pendant le chargement
        await chargerHistorique(param.path, periode)
        await chargerStats(param.path, periode)
    }, [periode, chargerHistorique, chargerStats])

    // ── Recharger quand on change de période ─────────────────
    const changerPeriode = useCallback(async (h) => {
        setPeriode(h)
        await chargerHistorique(actif.path, h)
        await chargerStats(actif.path, h)
    }, [actif, chargerHistorique, chargerStats])

    // ── Valeur courante et statut du paramètre actif ─────────
    const valCourante = getVal(data, actif.path)
    const statutActif = getStatut(valCourante, actif.seuils)
    const badgeCfg = BADGE_CONFIG[statutActif]

    // Formater une valeur avec unité
    const fmt = (v, dec, unite) =>
        v !== null && v !== undefined
            ? `${parseFloat(v).toFixed(dec)}${unite ? ' ' + unite : ''}`
            : '--'

    // ── RENDU ─────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', height: '100vh', fontFamily: "'Nunito',sans-serif", overflow: 'hidden' }}>

            {/* ════════════════════════════════════════
          SIDEBAR
      ════════════════════════════════════════ */}
            <aside style={{
                width: 265, minWidth: 265,
                background: '#1e3d2b',
                display: 'flex', flexDirection: 'column',
                height: '100vh', overflow: 'hidden',
            }}>

                {/* Logo */}
                <div style={{ padding: '22px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: '0.07em' }}>
                            ECONERSYS
                        </span>
                        <span style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: connecte ? '#4ade80' : '#ef4444',
                            flexShrink: 0, transition: 'background 0.3s',
                            animation: connecte ? 'pulseDot 2.2s ease-in-out infinite' : 'none',
                        }} />
                    </div>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.32)', letterSpacing: '0.22em', marginTop: 4 }}>
                        SUPERVISION
                    </div>
                </div>

                {/* Liste des paramètres */}
                <div
                    className="sidebar-scroll"
                    style={{ flex: 1, overflowY: 'auto', padding: '8px 0 16px' }}
                >
                    {PARAMS.map(p => (
                        <ParamItem
                            key={p.id}
                            param={p}
                            isActif={p.id === actif.id}
                            valeur={getVal(data, p.path)}
                            onClick={() => selectionner(p)}
                        />
                    ))}
                </div>

            </aside>

            {/* ════════════════════════════════════════
          ZONE PRINCIPALE
      ════════════════════════════════════════ */}
            <main style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                height: '100vh', overflowY: 'auto',
                padding: '28px 36px 24px', gap: 18,
                background: '#f0f4f1',
            }}>

                {/* Grande valeur + badge */}
                <div className="anim-1" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        fontSize: 'clamp(54px,9vw,88px)',
                        fontWeight: 900, color: '#111827',
                        letterSpacing: '-0.02em', lineHeight: 1,
                        transition: 'all 0.3s ease',
                    }}>
                        {fmt(valCourante, actif.dec, actif.unite)}
                    </div>

                    <span style={{
                        display: 'inline-flex', alignItems: 'center',
                        padding: '6px 24px', borderRadius: 999,
                        fontSize: 13.5, fontWeight: 800, letterSpacing: '0.03em',
                        transition: 'all 0.3s',
                        background: badgeCfg.bg, color: '#fff',
                    }}>
                        {badgeCfg.label}
                    </span>
                </div>

                {/* Min / Max / Moyenne */}
                <div className="anim-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                    {[
                        { label: 'Min', val: stats.min },
                        { label: 'Max', val: stats.max },
                        { label: 'Moyenne', val: stats.moyenne },
                    ].map(({ label, val }) => (
                        <div key={label} style={{
                            background: '#ffffff', borderRadius: 14,
                            padding: '18px 22px',
                            border: '1px solid rgba(0,0,0,0.06)',
                            boxShadow: '0 1px 8px rgba(0,0,0,0.05)',
                        }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                                {label}
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#111827' }}>
                                {fmt(val, actif.dec, actif.unite)}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Graphique */}
                <div className="anim-3" style={{
                    background: '#ffffff', borderRadius: 14,
                    padding: '22px 24px 16px',
                    border: '1px solid rgba(0,0,0,0.06)',
                    boxShadow: '0 1px 8px rgba(0,0,0,0.05)',
                    flex: 1, display: 'flex', flexDirection: 'column', minHeight: 220,
                }}>
                    {/* Header graphique */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>Évolution</span>
                        <div style={{ display: 'flex', gap: 7 }}>
                            {[{ h: 24, label: '24H' }, { h: 168, label: '7J' }, { h: 720, label: '30J' }].map(({ h, label }) => (
                                <button
                                    key={h}
                                    onClick={() => changerPeriode(h)}
                                    style={{
                                        padding: '5px 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
                                        fontFamily: "'Nunito',sans-serif", fontSize: 12.5, fontWeight: 800,
                                        transition: 'all 0.17s',
                                        background: periode === h ? '#22a855' : '#eef2ef',
                                        color: periode === h ? '#ffffff' : '#6b7280',
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Graphique */}
                    <div style={{ flex: 1, minHeight: 180 }}>
                        {points.length > 0
                            ? <Graphique points={points} param={actif} />
                            : (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: 13, fontWeight: 600 }}>
                                    {connecte ? 'En attente des données...' : 'Serveur non connecté'}
                                </div>
                            )
                        }
                    </div>
                </div>

                {/* Barre de statut */}
                <div className="anim-4" style={{ display: 'flex', alignItems: 'center', gap: 7, paddingLeft: 2 }}>
                    <span style={{
                        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                        background: connecte ? '#22a855' : '#ef4444',
                        transition: 'background 0.3s',
                    }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af' }}>
                        {statut}
                    </span>
                </div>

            </main>
        </div>
    )
}