import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { getUserPasswords, saveUserPasswords } from './Database'
import type { VaultItem } from './Database'
import { clearCurrentUser, getProfilePicture } from './user'
import Settings from './Settings.tsx'
import './App.css'

type AppProps = { username: string }

function daysAgo(timestamp: number | undefined): string {
  if (timestamp === undefined) return 'Date unavailable'
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000))
  if (days === 0) return 'Today'
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function App({ username }: AppProps) {
  const displayName = username.charAt(0).toUpperCase() + username.slice(1)
  const [profilePicture, setProfilePicture] = useState(() => getProfilePicture(username))
  const [items, setItems] = useState<VaultItem[]>(() => {
    return getUserPasswords(username)
  })
  
  const [selectedId, setSelectedId] = useState(1)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All items')
  const [showPassword, setShowPassword] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [copied, setCopied] = useState('')
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [activePage, setActivePage] = useState<'vault' | 'settings'>('vault')
  const [draft, setDraft] = useState({ name: '', username: '', password: '', url: '', category: 'Personal', notes: '' })

  useEffect(() => saveUserPasswords(username, items), [items, username])

  const categories = ['All items', ...Array.from(new Set(items.map((item) => item.category)))]
  const visibleItems = useMemo(() => items.filter((item) => {
    const matchesQuery = `${item.name} ${item.username} ${item.url}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (category === 'All items' || item.category === category)
  }), [items, query, category])
  const selected = items.find((item) => item.id === selectedId) ?? visibleItems[0]

  function copyValue(value: string, label: string) {
    navigator.clipboard?.writeText(value)
    setCopied(label)
    window.setTimeout(() => setCopied(''), 1400)
  }

  function addItem(event: FormEvent) {
    event.preventDefault()
    if (editingId !== null) {
      setItems((current) => current.map((item) => item.id === editingId ? { ...item, ...draft, lastEditedAt: Date.now() } : item))
      setSelectedId(editingId)
    } else {
      const createdAt = Date.now()
      const newItem = { ...draft, id: createdAt, createdAt, lastEditedAt: null, color: '#0f766e' }
      setItems((current) => [newItem, ...current])
      setSelectedId(newItem.id)
    }
    setEditingId(null)
    setDraft({ name: '', username: '', password: '', url: '', category: 'Personal', notes: '' })
    setIsAdding(false)
  }

  function editItem(item: VaultItem) {
    setDraft({ name: item.name, username: item.username, password: item.password, url: item.url, category: item.category, notes: item.notes ?? '' })
    setEditingId(item.id)
    setIsAdding(true)
  }

  function openNewItemModal() {
    setEditingId(null)
    setDraft({ name: '', username: '', password: '', url: '', category: 'Personal', notes: '' })
    setIsAdding(true)
  }

  function closeItemModal() {
    setIsAdding(false)
    setEditingId(null)
  }

  function deleteSelected() {
    if (!selected) return
    setItems((current) => current.filter((item) => item.id !== selected.id))
    setSelectedId(items.find((item) => item.id !== selected.id)?.id ?? 0)
  }

  function signOut() {
    clearCurrentUser()
    window.location.reload()
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
          <div className="brand"><img className="brand-logo" src="/logo.png" alt="Syncript" /></div>
        <nav>
          <div className="nav-label">VAULT</div>
          <button className={`nav-item ${activePage === 'vault' ? 'active' : ''}`} onClick={() => { setActivePage('vault'); setCategory('All items') }}><span>▦</span> All items <b>{items.length}</b></button>
          {categories.slice(1).map((itemCategory) => <button className="nav-item" key={itemCategory} onClick={() => { setActivePage('vault'); setCategory(itemCategory) }}><span>◇</span>{itemCategory}</button>)}
        </nav>
        <div className="sidebar-bottom"><button className={`nav-item ${activePage === 'settings' ? 'active' : 'muted'}`} onClick={() => setActivePage('settings')}><span>⚙</span> Settings</button><div className="local-note"><span className="status-dot" />Local vault<br /><small>Stored in this browser</small></div></div>
      </aside>

      <section className="content">
        <header className="topbar"><div className="breadcrumbs"><span>Vault</span><span>/</span><strong>{activePage === 'settings' ? 'Settings' : 'All items'}</strong></div><div className="top-actions"><div className="account-menu"><button className="avatar mini" type="button" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={isAccountMenuOpen} onClick={() => setIsAccountMenuOpen((open) => !open)}>{profilePicture ? <img src={profilePicture} alt="" /> : username.slice(0, 2).toUpperCase()}</button>{isAccountMenuOpen && <div className="account-menu-popover" role="menu"><button type="button" role="menuitem" onClick={signOut}>Sign out</button></div>}</div></div></header>
        {activePage === 'settings' ? <Settings username={username} profilePicture={profilePicture} onProfilePictureChange={setProfilePicture} /> : <div className="workspace">
          <div className="intro"><div><p className="eyebrow">YOUR PRIVATE SPACE</p><h1>Good morning, {displayName} <span>✦</span></h1><p className="subhead">Keep your digital life in one quiet place.</p></div><button className="primary" onClick={openNewItemModal}><span>＋</span> Add item</button></div>
          <div className="section-head"><div><h2>All items <span>{items.length}</span></h2><p>Everything you have saved in your vault</p></div><div className="view-tools"><label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search vault" /></label><button className="filter" onClick={() => setCategory(category === 'All items' ? 'Development' : 'All items')}>☷ Filter</button></div></div>
          <div className="vault-layout">
            <div className="item-list">{visibleItems.map((item) => <button className={`vault-item ${selected?.id === item.id ? 'selected' : ''}`} key={item.id} onClick={() => { setSelectedId(item.id); setShowPassword(false) }}><span className="site-icon" style={{ background: item.color }}>{item.name.charAt(0)}</span><span className="item-copy"><strong>{item.name}</strong><small>{item.username}</small></span><span className="item-more">•••</span></button>)}{visibleItems.length === 0 && <div className="empty">No items match your search.</div>}</div>
            {selected && <article className="detail-panel"><div className="detail-head"><div className="detail-title"><span className="site-icon large" style={{ background: selected.color }}>{selected.name.charAt(0)}</span><div><h2>{selected.name}</h2><a href={`https://${selected.url}`} target="_blank">{selected.url} ↗</a></div></div><div><button className="icon-button" aria-label="Edit saved item" title="Edit saved item" onClick={() => editItem(selected)}>•••</button></div></div><div className="detail-fields"><div className="field"><label>USERNAME <button onClick={() => copyValue(selected.username, 'username')}>{copied === 'username' ? 'Copied' : 'Copy'}</button></label><p>{selected.username}</p></div><div className="field"><label>PASSWORD <button onClick={() => copyValue(selected.password, 'password')}>{copied === 'password' ? 'Copied' : 'Copy'}</button></label><p className="password"><span>{showPassword ? selected.password : '••••••••••••'}</span><button onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></p></div><div className="field"><label>NOTES</label><p className="notes">{selected.notes?.trim() || 'No notes added'}</p></div></div><div className="detail-footer"><div className="item-dates"><small>Created {daysAgo(selected.createdAt)}</small><small>Last edited {selected.lastEditedAt === null ? 'not yet' : selected.lastEditedAt === undefined ? 'not recorded' : daysAgo(selected.lastEditedAt)}</small></div><button className="delete" onClick={deleteSelected}>Delete item</button></div></article>}
          </div>
        </div>}
      </section>
      {isAdding && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeItemModal()}><form className="modal" onSubmit={addItem}><div className="modal-head"><div><p className="eyebrow">{editingId === null ? 'NEW ENTRY' : 'EDIT ENTRY'}</p><h2>{editingId === null ? 'Add to your vault' : 'Edit saved item'}</h2></div><button type="button" className="close" onClick={closeItemModal}>×</button></div>{(['name', 'username', 'password', 'url'] as const).map((field) => <label className="form-field" key={field}>{field === 'name' ? 'Name' : field === 'username' ? 'Username' : field === 'password' ? 'Password' : 'Website'}<input required={field !== 'url'} type={field === 'password' ? 'password' : 'text'} value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} placeholder={field === 'name' ? 'e.g. Linear' : field === 'username' ? 'you@example.com' : field === 'password' ? 'Enter a strong password' : 'linear.app'} /></label>)}<label className="form-field">Notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Add any useful details" rows={3} /></label><label className="form-field">Category<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}><option>Personal</option><option>Work</option><option>Development</option><option>Finance</option></select></label><button className="primary full" type="submit">{editingId === null ? 'Save item' : 'Update item'}</button></form></div>}
    </main>
  )
}

export default App
