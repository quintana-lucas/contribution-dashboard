import { forwardRef, useId, useState } from 'react'
import type { FormEvent } from 'react'
import type { AddRepoResult } from '../../api/client'
import styles from './AddRepoForm.module.css'

interface AddRepoFormProps {
  addRepo: (input: string) => Promise<AddRepoResult>
  /** Called after a repo was linked (even if its first sync failed). */
  onAdded: () => void
}

function people(n: number): string {
  return n === 1 ? '1 person found.' : `${n} people found.`
}

const AddRepoForm = forwardRef<HTMLInputElement, AddRepoFormProps>(function AddRepoForm(
  { addRepo, onAdded },
  inputRef,
) {
  const id = useId()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const inputId = `${id}-input`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const input = value.trim()
    setResult(null)
    if (input === '') {
      setError('Use the owner/repo format')
      return
    }
    setError(null)
    setBusy(true)
    setPending(input)
    const res = await addRepo(input)
    setBusy(false)
    if (res.ok) {
      setValue('')
      setResult(
        res.synced
          ? `Added ${res.repo}. ${people(res.people)}`
          : `Added ${res.repo}. The first sync failed; use Sync to try again.`,
      )
      onAdded()
      if (inputRef && typeof inputRef !== 'function') inputRef.current?.focus()
      return
    }
    switch (res.error) {
      case 'invalid_format':
        setError('Use the owner/repo format')
        break
      case 'duplicate':
        setError(`${res.repo ?? input} is already added`)
        break
      case 'not_found_or_no_access':
        setError('Not found, or the token cannot read it')
        break
      case 'missing_token':
        setError('No token configured. Set GITHUB_TOKEN in .env and restart the server.')
        break
      default:
        setError('Could not add the repository. Check that the local server is running, then try again.')
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label htmlFor={inputId} className={styles.label}>
        Repository
      </label>
      <div className={styles.row}>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          className={styles.input}
          placeholder="owner/name"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        />
        <button type="submit" className={styles.button} aria-disabled={busy}>
          {busy ? 'Adding…' : 'Add'}
        </button>
      </div>
      <p id={hintId} className={styles.hint}>
        owner/name or github.com/owner/name
      </p>
      {error && (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <p role="status" className={styles.result}>
        {busy ? `Adding ${pending}…` : (result ?? '')}
      </p>
    </form>
  )
})

export default AddRepoForm
