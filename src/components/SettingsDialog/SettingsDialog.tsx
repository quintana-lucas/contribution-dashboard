import { useId, useRef } from 'react'
import {
  addRepo as defaultAddRepo,
  getTeam as defaultGetTeam,
  getTokenStatus as defaultGetTokenStatus,
  listRepos as defaultListRepos,
  removeRepo as defaultRemoveRepo,
  saveTeam as defaultSaveTeam,
  syncRepo as defaultSyncRepo,
} from '../../api/client'
import type { RepositoriesPanelProps } from '../RepositoriesPanel/RepositoriesPanel'
import type { TeamMembersPanelProps } from '../TeamMembersPanel/TeamMembersPanel'
import Modal from '../Modal'
import RepositoriesPanel from '../RepositoriesPanel'
import Tabs from '../Tabs'
import TeamMembersPanel from '../TeamMembersPanel'
import styles from './SettingsDialog.module.css'

export interface SettingsDialogProps {
  open: boolean
  /** `changed` is true when an add, remove or sync succeeded while open. */
  onClose: (changed: boolean) => void
  fallbackFocus?: () => HTMLElement | null
  listRepos?: RepositoriesPanelProps['listRepos']
  addRepo?: RepositoriesPanelProps['addRepo']
  removeRepo?: RepositoriesPanelProps['removeRepo']
  syncRepo?: RepositoriesPanelProps['syncRepo']
  getTokenStatus?: RepositoriesPanelProps['getTokenStatus']
  getTeam?: TeamMembersPanelProps['getTeam']
  saveTeam?: TeamMembersPanelProps['saveTeam']
  now?: () => Date
}

const defaultNow = () => new Date()

export default function SettingsDialog({
  open,
  onClose,
  fallbackFocus,
  listRepos = () => defaultListRepos(),
  addRepo = (input) => defaultAddRepo(input),
  removeRepo = (repo) => defaultRemoveRepo(repo),
  syncRepo = (repo) => defaultSyncRepo(repo),
  getTokenStatus = () => defaultGetTokenStatus(),
  getTeam = () => defaultGetTeam(),
  saveTeam = (team) => defaultSaveTeam(team),
  now = defaultNow,
}: SettingsDialogProps) {
  const titleId = useId()
  const changed = useRef(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  const close = () => {
    const result = changed.current
    changed.current = false
    onClose(result)
  }

  return (
    <Modal
      open={open}
      onClose={close}
      titleId={titleId}
      fallbackFocus={fallbackFocus}
      initialFocus={() => bodyRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? null}
    >
      <div ref={bodyRef} className={styles.dialog}>
        <h2 id={titleId} className={styles.title}>
          Settings
        </h2>
        <div className={styles.tabs}>
          <Tabs
            label="Settings sections"
            tabs={[
              {
                key: 'repositories',
                label: 'Repositories',
                content: (
                  <RepositoriesPanel
                    listRepos={listRepos}
                    addRepo={addRepo}
                    removeRepo={removeRepo}
                    syncRepo={syncRepo}
                    getTokenStatus={getTokenStatus}
                    now={now}
                    onChanged={() => {
                      changed.current = true
                    }}
                  />
                ),
              },
              {
                key: 'team',
                label: 'Team members',
                content: (
                  <TeamMembersPanel
                    getTeam={getTeam}
                    saveTeam={saveTeam}
                    onChanged={() => {
                      changed.current = true
                    }}
                  />
                ),
              },
            ]}
          />
        </div>
        <button type="button" className={styles.close} aria-label="Close settings" onClick={close}>
          Close
        </button>
      </div>
    </Modal>
  )
}
