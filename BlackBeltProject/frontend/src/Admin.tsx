import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { apiRequest } from './api'
import './App.css'

type AdminEntry = {
	id: number
	name: string
	username: string
	website: string
	category: string
	color: string
	notes: string
	createdAt: number | null
	lastEditedAt: number | null
}

type AdminAccount = {
	id: string
	username: string
	createdAt: number
	entries: AdminEntry[]
}

type AccountResponse = { accounts: AdminAccount[] }

function Admin() {
	const [token, setToken] = useState('')
	const [adminPassword, setAdminPassword] = useState('')
	const [accounts, setAccounts] = useState<AdminAccount[]>([])
	const [username, setUsername] = useState('')
	const [passphrase, setPassphrase] = useState('')
	const [editingId, setEditingId] = useState<string | null>(null)
	const [isAdding, setIsAdding] = useState(false)
	const [message, setMessage] = useState('')
	const [isError, setIsError] = useState(false)
	const [isSaving, setIsSaving] = useState(false)

	async function loadAccounts(adminToken: string) {
		const result = await apiRequest<AccountResponse>('/admin/accounts', {
			headers: { Authorization: `Bearer ${adminToken}` },
		})
		setAccounts(result.accounts)
	}

	async function signIn(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setMessage('')
		try {
			const result = await apiRequest<{ token: string }>('/admin/login', {
				method: 'POST',
				body: JSON.stringify({ password: adminPassword }),
			})
			setToken(result.token)
			setAdminPassword('')
		} catch (error) {
			setIsError(true)
			setMessage(error instanceof Error ? error.message : 'Unable to sign in to admin.')
		}
	}

	useEffect(() => {
		if (!token) return
		let cancelled = false
		apiRequest<AccountResponse>('/admin/accounts', {
			headers: { Authorization: `Bearer ${token}` },
		}).then((result) => {
			if (!cancelled) setAccounts(result.accounts)
		}).catch((error: unknown) => {
			if (!cancelled) {
				setIsError(true)
				setMessage(error instanceof Error ? error.message : 'Unable to load accounts.')
				setToken('')
			}
		})
		return () => { cancelled = true }
	}, [token])

	function beginAdd() {
		setUsername('')
		setPassphrase('')
		setEditingId(null)
		setIsAdding(true)
		setMessage('')
	}

	async function lockAdmin() {
		if (token) {
			try {
				await apiRequest('/admin/session', {
					method: 'DELETE',
					headers: { Authorization: `Bearer ${token}` },
				})
			} catch (error) {
				setIsError(true)
				setMessage(error instanceof Error ? error.message : 'Unable to lock the admin session.')
				return
			}
		}
		setToken('')
		setAccounts([])
		setMessage('')
	}

	function beginEdit(account: AdminAccount) {
		setUsername(account.username)
		setPassphrase('')
		setEditingId(account.id)
		setIsAdding(false)
		setMessage('')
	}

	async function saveAccount(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (!token) return
		setIsSaving(true)
		setMessage('')
		try {
			const isEditing = editingId !== null
			await apiRequest(isEditing ? `/admin/accounts/${encodeURIComponent(editingId)}` : '/admin/accounts', {
				method: isEditing ? 'PATCH' : 'POST',
				headers: { Authorization: `Bearer ${token}` },
				body: JSON.stringify({ username, passphrase: passphrase || undefined }),
			})
			await loadAccounts(token)
			setIsAdding(false)
			setEditingId(null)
			setIsError(false)
			setMessage(isEditing ? 'Account updated.' : 'Account created.')
		} catch (error) {
			setIsError(true)
			setMessage(error instanceof Error ? error.message : 'Unable to save this account.')
		} finally {
			setIsSaving(false)
		}
	}

	async function deleteUserAccount(account: AdminAccount) {
		if (!token || !window.confirm(`Permanently delete ${account.username} and all of its vault entries?`)) return
		setMessage('')
		try {
			await apiRequest(`/admin/accounts/${encodeURIComponent(account.id)}`, {
				method: 'DELETE',
				headers: { Authorization: `Bearer ${token}` },
			})
			await loadAccounts(token)
			setIsError(false)
			setMessage(`Account ${account.username} deleted.`)
		} catch (error) {
			setIsError(true)
			setMessage(error instanceof Error ? error.message : 'Unable to delete this account.')
		}
	}

	return (
		<div className="settings-page admin-page">
			<header className="settings-heading">
				<p className="eyebrow">ADMINISTRATION</p>
				<h1>Account administration</h1>
				<p>Manage registered accounts and review vault details. Saved password values are never provided here.</p>
			</header>
			{!token ? (
				<form className="settings-form admin-login" onSubmit={signIn}>
					<label className="settings-field">
						<span>Admin password</span>
						<input type="password" autoComplete="current-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} required />
					</label>
					{message && <p className={`settings-message ${isError ? 'error' : ''}`} role={isError ? 'alert' : 'status'}>{message}</p>}
					<button className="primary" type="submit">Open admin page</button>
				</form>
			) : (
				<>
					<div className="admin-toolbar">
						<p>{accounts.length} registered account{accounts.length === 1 ? '' : 's'}</p>
						<div>
							<button className="primary" type="button" onClick={beginAdd}>Create account</button>
							<button className="admin-lock" type="button" onClick={() => void lockAdmin()}>Lock admin</button>
						</div>
					</div>
					{message && <p className={`settings-message ${isError ? 'error' : ''}`} role={isError ? 'alert' : 'status'}>{message}</p>}
					{(isAdding || editingId !== null) && (
						<form className="admin-account-form" onSubmit={saveAccount}>
							<h2>{editingId ? 'Edit account' : 'Create account'}</h2>
							<label className="settings-field">
								<span>Username</span>
								<input value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={32} pattern="[a-zA-Z0-9._-]+" required />
							</label>
							<label className="settings-field">
								<span>{editingId ? 'Reset passphrase (optional)' : 'Initial passphrase'}</span>
								<input type="password" autoComplete="new-password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} minLength={passphrase ? 8 : undefined} required={!editingId} />
								<small>Passphrases must be at least 8 characters. Existing passphrases cannot be viewed.</small>
							</label>
							<div className="admin-form-actions">
								<button className="primary" type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save account'}</button>
								<button className="admin-lock" type="button" onClick={() => { setIsAdding(false); setEditingId(null) }}>Cancel</button>
							</div>
						</form>
					)}
					<div className="admin-account-list">
						{accounts.map((account) => (
							<details className="admin-account" key={account.id}>
								<summary>
									<span><strong>{account.username}</strong><small>Created {new Date(account.createdAt).toLocaleString()} · {account.entries.length} vault entr{account.entries.length === 1 ? 'y' : 'ies'}</small></span>
									<span className="admin-row-actions">
										<button type="button" onClick={(event) => { event.preventDefault(); beginEdit(account) }}>Edit</button>
										<button className="danger-text" type="button" onClick={(event) => { event.preventDefault(); void deleteUserAccount(account) }}>Delete</button>
									</span>
								</summary>
								{account.entries.length > 0 ? (
									<div className="admin-entry-list">
										{account.entries.map((entry) => (
											<article className="admin-entry" key={entry.id}>
												<strong>{entry.name}</strong>
												<span>Login username: {entry.username || '—'}</span>
												<span>Website: {entry.website || '—'}</span>
												<span>Category: {entry.category || '—'}</span>
												<span>Notes: {entry.notes || '—'}</span>
												<small>Created {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'unknown'} · Last edited {entry.lastEditedAt ? new Date(entry.lastEditedAt).toLocaleString() : 'not recorded'}</small>
											</article>
										))}
									</div>
								) : <p className="admin-empty">No saved vault entries.</p>}
							</details>
						))}
						{accounts.length === 0 && <p className="admin-empty">No registered accounts.</p>}
					</div>
				</>
			)}
		</div>
	)
}

export default Admin
