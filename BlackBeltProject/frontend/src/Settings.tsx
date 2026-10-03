import { useState } from 'react'
import type { ChangeEvent } from 'react'
import type { FormEvent } from 'react'
import { saveProfilePicture, updateAccount } from './user'
import './App.css'

type SettingsProps = {
	username: string
	profilePicture: string | null
	onProfilePictureChange: (image: string | null) => void
}

function Settings({ username, profilePicture, onProfilePictureChange }: SettingsProps) {
	const [currentPassphrase, setCurrentPassphrase] = useState('')
	const [newUsername, setNewUsername] = useState(username)
	const [newPassphrase, setNewPassphrase] = useState('')
	const [message, setMessage] = useState('')
	const [isError, setIsError] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [pictureMessage, setPictureMessage] = useState('')
	const [isPictureError, setIsPictureError] = useState(false)
	const [pendingProfilePicture, setPendingProfilePicture] = useState<string | null>(null)

	function handleProfilePictureChange(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0]
		event.target.value = ''
		if (!file) return
		if (!file.type.startsWith('image/')) {
			setIsPictureError(true)
			setPictureMessage('Choose an image file.')
			return
		}
		if (file.size > 2 * 1024 * 1024) {
			setIsPictureError(true)
			setPictureMessage('Choose an image smaller than 2 MB.')
			return
		}

		const reader = new FileReader()
		reader.onload = () => {
			if (typeof reader.result !== 'string') return
			setPendingProfilePicture(reader.result)
			setIsPictureError(false)
			setPictureMessage('Preview ready. Save the picture to apply it.')
		}
		reader.onerror = () => {
			setIsPictureError(true)
			setPictureMessage('Unable to read this image.')
		}
		reader.readAsDataURL(file)
	}

	function savePendingProfilePicture() {
		if (!pendingProfilePicture) return
		try {
			saveProfilePicture(username, pendingProfilePicture)
			onProfilePictureChange(pendingProfilePicture)
			setPendingProfilePicture(null)
			setIsPictureError(false)
			setPictureMessage('Profile picture updated.')
		} catch {
			setIsPictureError(true)
			setPictureMessage('Unable to save this image in browser storage.')
		}
	}

	function removeProfilePicture() {
		try {
			saveProfilePicture(username, null)
			onProfilePictureChange(null)
			setPendingProfilePicture(null)
			setIsPictureError(false)
			setPictureMessage('Profile picture removed.')
		} catch {
			setIsPictureError(true)
			setPictureMessage('Unable to remove this image.')
		}
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setMessage('')
		if (newUsername.trim().toLowerCase() === username.toLowerCase() && !newPassphrase) {
			setMessage('No sign-in details changed.')
			setIsError(false)
			return
		}
		setIsSaving(true)
		try {
			await updateAccount(username, currentPassphrase, {
				username: newUsername,
				passphrase: newPassphrase || undefined,
			})
			window.location.reload()
		} catch (error) {
			setIsError(true)
			setMessage(error instanceof Error ? error.message : 'Unable to update this account.')
			setIsSaving(false)
		}
	}

	return (
		<div className="settings-page">
			<header className="settings-heading">
				<p className="eyebrow">ACCOUNT</p>
				<h1>Account settings</h1>
				<p>Manage your profile and sign-in details.</p>
			</header>
			<section className="settings-profile" aria-labelledby="profile-picture-heading">
				<div className="profile-picture-preview">
					{pendingProfilePicture || profilePicture ? <img src={pendingProfilePicture ?? profilePicture ?? ''} alt="Account profile preview" /> : <span>{username.slice(0, 2).toUpperCase()}</span>}
				</div>
				<div className="profile-picture-details">
					<h2 id="profile-picture-heading">Profile picture</h2>
					<p>Choose an image up to 2 MB.</p>
					<div className="profile-picture-actions">
						<label className="primary profile-image-picker">
							{profilePicture ? 'Change picture' : 'Add picture'}
							<input type="file" accept="image/*" onChange={handleProfilePictureChange} />
						</label>
						{pendingProfilePicture && <button type="button" className="primary" onClick={savePendingProfilePicture}>Save picture</button>}
						{profilePicture && <button type="button" className="profile-image-remove" onClick={removeProfilePicture}>Remove</button>}
					</div>
					{pictureMessage && <p className={`settings-message ${isPictureError ? 'error' : ''}`} role={isPictureError ? 'alert' : 'status'}>{pictureMessage}</p>}
				</div>
			</section>
			{username === 'demo' ? (
				<p className="settings-notice">The demo vault is not linked to a registered account. Sign out and create an account to edit sign-in details.</p>
			) : (
				<form className="settings-form" onSubmit={handleSubmit}>
					<label className="settings-field">
						<span>Current passphrase</span>
						<input type="password" autoComplete="current-password" value={currentPassphrase} onChange={(event) => setCurrentPassphrase(event.target.value)} required />
					</label>
					<label className="settings-field">
						<span>Username</span>
						<input type="text" autoComplete="username" value={newUsername} onChange={(event) => setNewUsername(event.target.value)} minLength={3} maxLength={32} pattern="[a-zA-Z0-9._-]+" required />
					</label>
					<label className="settings-field">
						<span>New passphrase</span>
						<input type="password" autoComplete="new-password" value={newPassphrase} onChange={(event) => setNewPassphrase(event.target.value)} minLength={newPassphrase ? 8 : undefined} />
						<small>Leave blank to keep your current passphrase. Use at least 8 characters to change it.</small>
					</label>
					{message && <p className={`settings-message ${isError ? 'error' : ''}`} role={isError ? 'alert' : 'status'}>{message}</p>}
					<div className="settings-actions"><button type="submit" className="primary" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save changes'}</button></div>
				</form>
			)}
		</div>
	)
}

export default Settings