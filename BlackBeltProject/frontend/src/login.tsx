import { useState } from 'react'
import type { FormEvent } from 'react'
import { createAccount, startDemoSession, verifyAccount } from './user'
import './login.css'

type LoginProps = {
	onUnlock: () => void
}





function Login({ onUnlock }: LoginProps) {
	const [isSigningUp, setIsSigningUp] = useState(false)
	const [username, setUsername] = useState('')
	const [passphrase, setPassphrase] = useState('')
	const [showPassphrase, setShowPassphrase] = useState(false)
	const [error, setError] = useState('')

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setError('')
		try {
			if (isSigningUp) {
				await createAccount(username, passphrase)
			} else if (!await verifyAccount(username, passphrase)) {
				setError('Username or passphrase is incorrect.')
				return
			}
			onUnlock()
		} catch (accountError) {
			setError(accountError instanceof Error ? accountError.message : 'Unable to access your account.')
		}
	}

	return (
		<main className="login-page">
			<div className="login-orbit orbit-one" />
			<div className="login-orbit orbit-two" />
			<section className="login-card">
				<div className="login-brand"><span className="brand-mark">S</span><span>Syncript</span></div>
				<div className="login-brand"><img className="login-brand-logo" src="/logo.png" alt="Syncript" /></div>
				<p className="login-eyebrow">YOUR PRIVATE SPACE</p>
				<h1>{isSigningUp ? 'Create your vault' : 'Welcome back'}</h1>
				<p className="login-copy">{isSigningUp ? 'Set up your private space in a few seconds.' : 'Your vault is ready when you are.'}<br />Everything stays on this device.</p>
				<form onSubmit={handleSubmit}>
					<label className="login-label" htmlFor="username">USERNAME</label>
					<div className="text-input"><span>@</span><input id="username" type="text" value={username} onChange={(event) => setUsername(event.target.value)} placeholder={isSigningUp ? 'Choose a username' : 'Your username'} autoComplete="username" required minLength={3} maxLength={32} /></div>
					<label className="login-label" htmlFor="passphrase">MASTER PASSPHRASE</label>
					<div className="passphrase-input">
						<span>⌑</span>
						<input id="passphrase" type={showPassphrase ? 'text' : 'password'} value={passphrase} onChange={(event) => setPassphrase(event.target.value)} placeholder="Enter your passphrase" autoComplete={isSigningUp ? 'new-password' : 'current-password'} required minLength={isSigningUp ? 8 : undefined} autoFocus />
						<button type="button" onClick={() => setShowPassphrase(!showPassphrase)}>{showPassphrase ? 'Hide' : 'Show'}</button>
					</div>
					{error && <p className="login-error" role="alert">{error}</p>}
					<button className="unlock-button" type="submit">{isSigningUp ? 'Create vault' : 'Unlock vault'} <span>→</span></button>
				</form>
				<button className="demo-button" type="button" onClick={() => { setError(''); setIsSigningUp(!isSigningUp) }}>{isSigningUp ? 'Already have a vault? Sign in' : 'Need an account? Sign up'}</button>
				{!isSigningUp && <button className="demo-button" type="button" onClick={() => { startDemoSession(); onUnlock() }}>Open demo vault</button>}
				<div className="login-footer"><span className="status-dot" />Local only <span className="footer-divider">·</span> No account needed</div>
			</section>
			<p className="login-note">A calm place for your credentials.</p>
		</main>
	)
}

export default Login
